"""Horizon-purged chronological walk-forward backtesting & model selection.

Strictly prevents future-data leakage: when evaluating a forecast made at index `t`
for horizon `h`, ONLY training origins `s <= t - h` (whose target `close[s + h]`
has already been realized on or before date `t`) are included in model fitting,
feature standardization, baseline drift estimation, and residual quantile scaling.
"""

from __future__ import annotations

from dataclasses import dataclass
import numpy as np
import pandas as pd
from scipy.stats import binomtest
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from ..forecasting.calibration import CalibratedProbabilityModel, fit_probability_calibrator
from ..forecasting.features import FEATURE_COLUMNS
from ..schemas import HorizonBacktestReport, HorizonCode, RegimePerformance

HORIZON_SPECS: dict[HorizonCode, tuple[str, int]] = {
    "1d": ("Next trading session", 1),
    "5d": ("5 trading days", 5),
    "21d": ("1 month (21 trading days)", 21),
    "63d": ("3 months (63 trading days)", 63),
    "126d": ("6 months (126 trading days)", 126),
}


@dataclass
class WalkForwardArtifacts:
    report: HorizonBacktestReport
    calibrator: CalibratedProbabilityModel
    selected_model_key: str  # "ridge" | "damped_state" | "ensemble"
    selected_model_name: str
    ensemble_used: bool
    selection_reason: str
    conformal_q16: float
    conformal_q84: float
    conformal_q05: float
    conformal_q95: float
    final_scaler: StandardScaler
    final_ridge: Ridge
    historical_mean_daily_log_ret: float


def _damped_state_predict_z(X_df: pd.DataFrame, horizon_days: int, hist_daily_drift: float, avg_daily_vol: float) -> np.ndarray:
    """Parametric damped momentum + mean-reversion + drift state baseline."""
    drift_z = (hist_daily_drift * horizon_days) / max(avg_daily_vol * np.sqrt(horizon_days), 1e-4)
    rsi_c = X_df["rsi_centered"].to_numpy(dtype=float)
    dist50 = X_df["dist_sma50"].to_numpy(dtype=float)
    sec_rel = X_df["sector_rel_21d"].to_numpy(dtype=float)
    ret5 = X_df["ret_5d"].to_numpy(dtype=float)

    if horizon_days <= 5:
        # Short horizon: mild short-term overreaction damping + trend alignment
        signal = -0.10 * np.clip(ret5 / 0.05, -2.0, 2.0) - 0.08 * rsi_c + 0.10 * np.clip(dist50 / 0.08, -2.0, 2.0)
    else:
        # Medium/long horizon: trend + sector relative leadership + damped drift
        signal = 0.14 * np.clip(dist50 / 0.10, -2.0, 2.0) + 0.12 * np.clip(sec_rel / 0.06, -2.0, 2.0) - 0.06 * rsi_c

    return np.clip(0.55 * drift_z + 0.45 * signal, -1.5, 1.5)


def run_walk_forward_pipeline(
    ticker: str,
    feat_df: pd.DataFrame,
    horizon_code: HorizonCode,
) -> WalkForwardArtifacts:
    horizon_label, h = HORIZON_SPECS[horizon_code]

    work = feat_df.copy()
    close = work["close"].to_numpy(dtype=float)
    sigma = work["ewma_daily_vol"].to_numpy(dtype=float)
    spy_vol_ann = work["spy_vol_ann"].to_numpy(dtype=float)
    dates = work["date"].astype(str).to_numpy()

    # Forward realized log return for origins 0 .. N - 1 - h
    n_total = len(work)
    fwd_log_ret = np.full(n_total, np.nan, dtype=float)
    if n_total > h:
        fwd_log_ret[:-h] = np.log(close[h:] / close[:-h])

    scale_h = np.maximum(sigma * np.sqrt(float(h)), 1e-4)
    target_z = fwd_log_ret / scale_h

    # Valid feature start (after 63-day lookback warm-up)
    valid_feat_mask = work[FEATURE_COLUMNS].notna().all(axis=1).to_numpy()
    valid_indices = np.where(valid_feat_mask)[0]
    if len(valid_indices) < 120:
        raise ValueError(f"Insufficient history ({len(valid_indices)} valid bars) to evaluate {ticker} at {horizon_code}.")

    first_valid = int(valid_indices[0])
    last_eval_origin = n_total - 1 - h
    available_purged = last_eval_origin - first_valid - h

    if available_purged >= 80:
        min_train_obs = max(80, min(252, available_purged // 2))
        first_test_idx = first_valid + min_train_obs + h
    elif last_eval_origin - first_valid >= 25:
        # Shorter history (e.g. ~1 year daily series evaluated at 126d horizon):
        # use minimal burn-in and explicitly flag validation_limited = True
        min_train_obs = max(20, (last_eval_origin - first_valid) // 2)
        first_test_idx = min(last_eval_origin - 8, first_valid + min_train_obs)
    else:
        raise ValueError(
            f"Insufficient historical span ({n_total} daily bars) to evaluate {horizon_label} ({h} sessions) for {ticker}."
        )

    # Evaluation stride: evaluate densely enough for rich diagnostics while keeping runtime <40ms
    raw_span = max(1, last_eval_origin - first_test_idx + 1)
    eval_stride = 1 if (h <= 5 or raw_span < 90) else (2 if h <= 21 else 3)
    test_origins = np.arange(first_test_idx, last_eval_origin + 1, eval_stride, dtype=int)

    # Strong L2 regularization appropriate for noisy financial return series
    ridge_alpha = {1: 450.0, 5: 350.0, 21: 280.0, 63: 240.0, 126: 220.0}.get(h, 300.0)
    retrain_every = max(8, h // 2)

    X_all = work[FEATURE_COLUMNS].fillna(0.0).to_numpy(dtype=float)

    oos_pred_z_ridge = np.empty(len(test_origins), dtype=float)
    oos_pred_z_state = np.empty(len(test_origins), dtype=float)
    oos_hist_avg_ret = np.empty(len(test_origins), dtype=float)
    oos_actual_ret = np.empty(len(test_origins), dtype=float)
    oos_scale_h = np.empty(len(test_origins), dtype=float)
    oos_spy_vol = np.empty(len(test_origins), dtype=float)
    oos_q16_sofar = np.empty(len(test_origins), dtype=float)
    oos_q84_sofar = np.empty(len(test_origins), dtype=float)
    oos_q05_sofar = np.empty(len(test_origins), dtype=float)
    oos_q95_sofar = np.empty(len(test_origins), dtype=float)

    cur_scaler: StandardScaler | None = None
    cur_ridge: Ridge | None = None
    cur_drift_daily: float = 0.0
    cur_avg_vol: float = 0.015
    last_fit_step = -9999

    log_ret_1d_arr = work["log_ret_1d"].fillna(0.0).to_numpy(dtype=float)
    cum_ret_1d = np.concatenate([[0.0], np.cumsum(log_ret_1d_arr[1:])])
    sigma_clean = np.nan_to_num(sigma, nan=0.015)
    cum_sigma = np.concatenate([[0.0], np.cumsum(sigma_clean)])

    # Vectorize state signal components up front to avoid per-step DataFrame slicing overhead
    rsi_c_arr = work["rsi_centered"].fillna(0.0).to_numpy(dtype=float)
    dist50_arr = work["dist_sma50"].fillna(0.0).to_numpy(dtype=float)
    sec_rel_arr = work["sector_rel_21d"].fillna(0.0).to_numpy(dtype=float)
    ret5_arr = work["ret_5d"].fillna(0.0).to_numpy(dtype=float)
    if h <= 5:
        state_signal_all = (
            -0.10 * np.clip(ret5_arr / 0.05, -2.0, 2.0)
            - 0.08 * rsi_c_arr
            + 0.10 * np.clip(dist50_arr / 0.08, -2.0, 2.0)
        )
    else:
        state_signal_all = (
            0.14 * np.clip(dist50_arr / 0.10, -2.0, 2.0)
            + 0.12 * np.clip(sec_rel_arr / 0.06, -2.0, 2.0)
            - 0.06 * rsi_c_arr
        )

    for idx_pos, t in enumerate(test_origins):
        # STRICT HORIZON PURGING: train origins s must satisfy s + h <= t
        max_train_origin = t - h
        has_purged_train = (max_train_origin - first_valid) >= 15
        train_slice = slice(first_valid, max_train_origin + 1)

        if has_purged_train and (cur_ridge is None or (idx_pos - last_fit_step) >= retrain_every):
            X_tr = X_all[train_slice]
            y_tr = np.clip(target_z[train_slice], -3.0, 3.0)
            cur_scaler = StandardScaler()
            X_tr_s = cur_scaler.fit_transform(X_tr)
            cur_ridge = Ridge(alpha=ridge_alpha)
            cur_ridge.fit(X_tr_s, y_tr)
            last_fit_step = idx_pos

        # Causal historical daily drift estimated ONLY up to day t
        cur_drift_daily = float(cum_ret_1d[t] / max(1, t))
        cur_avg_vol = float((cum_sigma[t + 1] - cum_sigma[first_valid]) / max(1, t + 1 - first_valid))

        if cur_ridge is not None and cur_scaler is not None:
            x_t_s = cur_scaler.transform(X_all[t : t + 1])
            z_r = float(np.clip(cur_ridge.predict(x_t_s)[0] * 0.65, -1.5, 1.5))
        else:
            z_r = 0.0
        drift_z_t = (cur_drift_daily * h) / max(cur_avg_vol * np.sqrt(float(h)), 1e-4)
        z_s = float(np.clip(0.55 * drift_z_t + 0.45 * state_signal_all[t], -1.5, 1.5))

        oos_pred_z_ridge[idx_pos] = z_r
        oos_pred_z_state[idx_pos] = z_s
        oos_hist_avg_ret[idx_pos] = float((cum_ret_1d[t] / max(1, t)) * h)
        oos_actual_ret[idx_pos] = fwd_log_ret[t]
        oos_scale_h[idx_pos] = scale_h[t]
        oos_spy_vol[idx_pos] = spy_vol_ann[t]

        # Causal split-conformal residual quantiles using ONLY prior completed OOS errors (whose outcome was known <= t)
        completed_mask = (test_origins[:idx_pos] + h) <= t
        if np.sum(completed_mask) >= 25:
            past_err_z = (oos_actual_ret[:idx_pos][completed_mask] / oos_scale_h[:idx_pos][completed_mask]) - oos_pred_z_ridge[:idx_pos][completed_mask]
            oos_q16_sofar[idx_pos] = float(np.quantile(past_err_z, 0.16))
            oos_q84_sofar[idx_pos] = float(np.quantile(past_err_z, 0.84))
            oos_q05_sofar[idx_pos] = float(np.quantile(past_err_z, 0.05))
            oos_q95_sofar[idx_pos] = float(np.quantile(past_err_z, 0.95))
        else:
            oos_q16_sofar[idx_pos] = -1.0
            oos_q84_sofar[idx_pos] = 1.0
            oos_q05_sofar[idx_pos] = -1.645
            oos_q95_sofar[idx_pos] = 1.645

    oos_pred_z_ens = 0.5 * oos_pred_z_ridge + 0.5 * oos_pred_z_state

    # Convert log returns to percentage returns for transparent financial error metrics
    actual_pct = (np.exp(oos_actual_ret) - 1.0) * 100.0
    ridge_pct = (np.exp(oos_pred_z_ridge * oos_scale_h) - 1.0) * 100.0
    state_pct = (np.exp(oos_pred_z_state * oos_scale_h) - 1.0) * 100.0
    ens_pct = (np.exp(oos_pred_z_ens * oos_scale_h) - 1.0) * 100.0
    hist_avg_pct = (np.exp(oos_hist_avg_ret) - 1.0) * 100.0
    no_change_pct = np.zeros_like(actual_pct)

    mae_ridge = float(np.mean(np.abs(actual_pct - ridge_pct)))
    mae_state = float(np.mean(np.abs(actual_pct - state_pct)))
    mae_ens = float(np.mean(np.abs(actual_pct - ens_pct)))

    # Model selection rule (Section 6): use ensemble ONLY when testing proves it beats simpler single models
    if mae_ens < min(mae_ridge, mae_state) - 0.005:
        selected_key = "ensemble"
        selected_name = "Validated Ridge + State Shrinkage Ensemble"
        ensemble_used = True
        sel_pred_z = oos_pred_z_ens
        sel_pred_pct = ens_pct
        selection_reason = (
            f"Ensemble selected because walk-forward MAE ({mae_ens:.2f}%) outperformed both "
            f"Factor Ridge ({mae_ridge:.2f}%) and Damped State ({mae_state:.2f}%) out-of-sample."
        )
    elif mae_ridge <= mae_state:
        selected_key = "ridge"
        selected_name = "L2-Regularized Multi-Factor Ridge"
        ensemble_used = False
        sel_pred_z = oos_pred_z_ridge
        sel_pred_pct = ridge_pct
        selection_reason = (
            f"Single L2 Factor Ridge selected (walk-forward MAE {mae_ridge:.2f}% vs ensemble {mae_ens:.2f}% "
            f"and state model {mae_state:.2f}%); ensemble omitted as it did not improve validation error."
        )
    else:
        selected_key = "damped_state"
        selected_name = "Damped Trend & Mean-Reversion State Model"
        ensemble_used = False
        sel_pred_z = oos_pred_z_state
        sel_pred_pct = state_pct
        selection_reason = (
            f"Parsimonious Damped State model selected (walk-forward MAE {mae_state:.2f}% vs Ridge {mae_ridge:.2f}% "
            f"and ensemble {mae_ens:.2f}%); simpler model retained."
        )

    model_mae = float(np.mean(np.abs(actual_pct - sel_pred_pct)))
    no_change_mae = float(np.mean(np.abs(actual_pct - no_change_pct)))
    hist_avg_mae = float(np.mean(np.abs(actual_pct - hist_avg_pct)))
    mae_skill = (1.0 - model_mae / max(no_change_mae, 1e-6)) * 100.0

    model_rmse = float(np.sqrt(np.mean((actual_pct - sel_pred_pct) ** 2)))
    no_change_rmse = float(np.sqrt(np.mean(actual_pct ** 2)))

    # Directional accuracy
    pred_sign = np.where(sel_pred_pct >= 0.0, 1, -1)
    actual_sign = np.where(actual_pct >= 0.0, 1, -1)
    dir_acc = float(np.mean(pred_sign == actual_sign) * 100.0)

    drift_sign = np.where(hist_avg_pct >= 0.0, 1, -1)
    drift_dir_acc = float(np.mean(drift_sign == actual_sign) * 100.0)

    # Non-overlapping subsample for statistically valid binomial test p-value
    non_overlap_step = max(1, int(np.ceil(h / eval_stride)))
    no_idx = np.arange(0, len(test_origins), non_overlap_step)
    hits_no = int(np.sum(pred_sign[no_idx] == actual_sign[no_idx]))
    total_no = int(len(no_idx))
    p_val = float(binomtest(hits_no, max(1, total_no), p=0.5, alternative="greater").pvalue)

    # Out-of-sample conformal interval coverage
    pred_log_sel = sel_pred_z * oos_scale_h
    lo68_pct = (np.exp(pred_log_sel + oos_q16_sofar * oos_scale_h) - 1.0) * 100.0
    hi68_pct = (np.exp(pred_log_sel + oos_q84_sofar * oos_scale_h) - 1.0) * 100.0
    lo90_pct = (np.exp(pred_log_sel + oos_q05_sofar * oos_scale_h) - 1.0) * 100.0
    hi90_pct = (np.exp(pred_log_sel + oos_q95_sofar * oos_scale_h) - 1.0) * 100.0

    cov68 = float(np.mean((actual_pct >= lo68_pct) & (actual_pct <= hi68_pct)) * 100.0)
    cov90 = float(np.mean((actual_pct >= lo90_pct) & (actual_pct <= hi90_pct)) * 100.0)

    # Fit out-of-sample probability calibrator
    calibrator = fit_probability_calibrator(sel_pred_z, oos_actual_ret)

    # Final conformal residual quantiles from all completed OOS errors for live forecast cone
    all_err_z = (oos_actual_ret / oos_scale_h) - sel_pred_z
    q16_final = float(np.quantile(all_err_z, 0.16))
    q84_final = float(np.quantile(all_err_z, 0.84))
    q05_final = float(np.quantile(all_err_z, 0.05))
    q95_final = float(np.quantile(all_err_z, 0.95))

    # Regime breakdown based on causal SPY annualized volatility at prediction time
    v_q33, v_q67 = np.quantile(oos_spy_vol, [0.33, 0.67])
    regime_defs = [
        ("Low Volatility Regime", oos_spy_vol <= v_q33),
        ("Normal Market Regime", (oos_spy_vol > v_q33) & (oos_spy_vol <= v_q67)),
        ("Elevated Volatility Regime", oos_spy_vol > v_q67),
    ]
    regimes: list[RegimePerformance] = []
    for r_name, r_mask in regime_defs:
        cnt = int(np.sum(r_mask))
        if cnt == 0:
            continue
        regimes.append(
            RegimePerformance(
                regime=r_name,
                sample_size=cnt,
                directional_accuracy_pct=round(float(np.mean(pred_sign[r_mask] == actual_sign[r_mask]) * 100.0), 1),
                model_mae_pct=round(float(np.mean(np.abs(actual_pct[r_mask] - sel_pred_pct[r_mask]))), 2),
                no_change_mae_pct=round(float(np.mean(np.abs(actual_pct[r_mask]))), 2),
            )
        )

    # Recent 24 walk-forward audit points for UI chart comparison (Predicted vs Realized!)
    recent_points: list[dict] = []
    tail_k = min(24, len(test_origins))
    for k in range(len(test_origins) - tail_k, len(test_origins)):
        orig_i = int(test_origins[k])
        targ_i = orig_i + h
        recent_points.append(
            {
                "origin_date": str(dates[orig_i]),
                "target_date": str(dates[targ_i]),
                "source_price": round(float(close[orig_i]), 2),
                "realized_price": round(float(close[targ_i]), 2),
                "predicted_return_pct": round(float(sel_pred_pct[k]), 2),
                "realized_return_pct": round(float(actual_pct[k]), 2),
                "range_68_low_pct": round(float(lo68_pct[k]), 2),
                "range_68_high_pct": round(float(hi68_pct[k]), 2),
            }
        )

    # Fit final production model on ALL realized historical targets (origins 0 .. N - 1 - h)
    # Note: origins > N - 1 - h do not yet have a realized h-step return at time N - 1!
    final_train_slice = slice(first_valid, last_eval_origin + 1)
    final_scaler = StandardScaler()
    X_final_s = final_scaler.fit_transform(X_all[final_train_slice])
    final_ridge = Ridge(alpha=ridge_alpha)
    final_ridge.fit(X_final_s, np.clip(target_z[final_train_slice], -3.0, 3.0))
    hist_mean_daily = float(np.mean(log_ret_1d_arr[1:]))

    validation_limited = total_no < 25 or len(test_origins) < 60

    report = HorizonBacktestReport(
        ticker=ticker,
        horizon_code=horizon_code,
        horizon_label=horizon_label,
        horizon_trading_days=h,
        methodology=(
            f"Expanding chronological walk-forward validation with {h}-session horizon purge "
            f"(no overlapping future targets in training), evaluated across {len(test_origins)} windows "
            f"({total_no} independent non-overlapping blocks)."
        ),
        test_period_start=str(dates[int(test_origins[0])]),
        test_period_end=str(dates[int(test_origins[-1] + h)]),
        train_min_observations=int(min_train_obs),
        sample_size=int(len(test_origins)),
        validation_limited=validation_limited,
        selected_model_name=selected_name,
        directional_accuracy_pct=round(dir_acc, 1),
        baseline_drift_directional_pct=round(drift_dir_acc, 1),
        directional_p_value=round(p_val, 4),
        model_mae_pct=round(model_mae, 2),
        no_change_mae_pct=round(no_change_mae, 2),
        historical_avg_mae_pct=round(hist_avg_mae, 2),
        mae_skill_vs_no_change_pct=round(mae_skill, 2),
        model_rmse_pct=round(model_rmse, 2),
        no_change_rmse_pct=round(no_change_rmse, 2),
        coverage_68_pct=round(cov68, 1),
        coverage_90_pct=round(cov90, 1),
        brier_score=calibrator.brier_score,
        baseline_brier_score=calibrator.baseline_brier_score,
        calibration_bins=calibrator.bins,
        regime_breakdown=regimes,
        recent_walk_forward_points=recent_points,
    )

    return WalkForwardArtifacts(
        report=report,
        calibrator=calibrator,
        selected_model_key=selected_key,
        selected_model_name=selected_name,
        ensemble_used=ensemble_used,
        selection_reason=selection_reason,
        conformal_q16=q16_final,
        conformal_q84=q84_final,
        conformal_q05=q05_final,
        conformal_q95=q95_final,
        final_scaler=final_scaler,
        final_ridge=final_ridge,
        historical_mean_daily_log_ret=hist_mean_daily,
    )
