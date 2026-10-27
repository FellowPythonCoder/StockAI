"""Horizon-purged chronological walk-forward backtesting & adaptive regime model selection.

Strictly prevents future-data leakage: when evaluating a forecast made at index `t`
for horizon `h`, ONLY training origins `s <= t - h` (whose target `close[s + h]`
has already been realized on or before date `t`) are included in recency-weighted
model fitting, feature standardization, Kalman drift estimation, and conformal scaling.
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
    ensemble_ridge_weight: float
    conformal_q16: float
    conformal_q84: float
    conformal_q05: float
    conformal_q95: float
    final_scaler: StandardScaler
    final_ridge: Ridge
    historical_mean_daily_log_ret: float


def _damped_state_predict_z(
    X_df: pd.DataFrame,
    horizon_days: int,
    hist_daily_drift: float,
    avg_daily_vol: float,
) -> np.ndarray:
    """Adaptive Kalman-Drift + Autocorrelation Regime-Switching State Expert (100% causal)."""
    sigma = np.maximum(X_df["ewma_daily_vol"].fillna(avg_daily_vol).to_numpy(dtype=float), 0.004)
    scale_h = np.maximum(sigma * np.sqrt(float(horizon_days)), 1e-4)

    kalman_daily = X_df["kalman_drift_daily"].fillna(hist_daily_drift).to_numpy(dtype=float)
    blended_daily_drift = 0.78 * kalman_daily + 0.22 * hist_daily_drift
    drift_z = (blended_daily_drift * horizon_days) / scale_h

    serial_reg = X_df["serial_regime"].fillna(0.0).to_numpy(dtype=float)
    ret5 = X_df["ret_5d"].fillna(0.0).to_numpy(dtype=float)
    dist20 = X_df["dist_sma20"].fillna(0.0).to_numpy(dtype=float)
    dist50 = X_df["dist_sma50"].fillna(0.0).to_numpy(dtype=float)
    rsi_c = X_df["rsi_centered"].fillna(0.0).to_numpy(dtype=float)
    clv5 = X_df["clv_5d"].fillna(0.0).to_numpy(dtype=float)
    sec_rel = X_df["sector_rel_21d"].fillna(0.0).to_numpy(dtype=float)

    mom_z = np.clip(ret5 / np.maximum(sigma * np.sqrt(5.0), 0.008), -2.5, 2.5)
    ext_z = np.clip(dist20 / np.maximum(sigma * np.sqrt(20.0), 0.012), -2.5, 2.5)
    trend_z = np.clip(dist50 / 0.09, -2.2, 2.2)

    # Smooth regime gate in [0, 1]: 1 = strong momentum regime, 0 = mean-reverting range regime
    trend_gate = 1.0 / (1.0 + np.exp(-9.0 * (serial_reg + 0.02)))
    exh_damp = np.exp(-0.24 * np.maximum(0.0, np.abs(ext_z) - 1.50) ** 2)

    if horizon_days <= 5:
        mom_branch = (0.60 * drift_z + 0.28 * mom_z + 0.16 * clv5) * exh_damp + 0.08 * trend_z
        rev_branch = 0.20 * drift_z - 0.55 * ext_z - 0.24 * rsi_c - 0.10 * clv5
    else:
        mom_branch = (0.65 * drift_z + 0.10 * mom_z) * exh_damp + 0.22 * trend_z + 0.14 * np.clip(sec_rel / 0.06, -2.0, 2.0)
        rev_branch = 0.30 * drift_z - 0.38 * ext_z - 0.16 * rsi_c + 0.10 * trend_z

    blended = trend_gate * mom_branch + (1.0 - trend_gate) * rev_branch
    return np.clip(blended, -1.85, 1.85)


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

    n_total = len(work)
    fwd_log_ret = np.full(n_total, np.nan, dtype=float)
    if n_total > h:
        fwd_log_ret[:-h] = np.log(close[h:] / close[:-h])

    scale_h = np.maximum(sigma * np.sqrt(float(h)), 1e-4)
    target_z = fwd_log_ret / scale_h

    valid_feat_mask = work[FEATURE_COLUMNS].notna().all(axis=1).to_numpy()
    valid_indices = np.where(valid_feat_mask)[0]
    if len(valid_indices) < 120:
        raise ValueError(f"Insufficient history ({len(valid_indices)} valid bars) to evaluate {ticker} at {horizon_code}.")

    first_valid = int(valid_indices[0])
    last_eval_origin = n_total - 1 - h
    available_purged = last_eval_origin - first_valid - h

    if available_purged >= 80:
        min_train_obs = max(80, min(220, available_purged // 2))
        first_test_idx = first_valid + min_train_obs + h
    elif last_eval_origin - first_valid >= 25:
        min_train_obs = max(20, (last_eval_origin - first_valid) // 2)
        first_test_idx = min(last_eval_origin - 8, first_valid + min_train_obs)
    else:
        raise ValueError(
            f"Insufficient historical span ({n_total} daily bars) to evaluate {horizon_label} ({h} sessions) for {ticker}."
        )

    raw_span = max(1, last_eval_origin - first_test_idx + 1)
    eval_stride = 1 if raw_span < 90 else (2 if h <= 5 else (3 if h <= 21 else 4))
    test_origins = np.arange(first_test_idx, last_eval_origin + 1, eval_stride, dtype=int)

    # Balanced L2 regularization + recency sample weights so regime transitions are learned cleanly
    ridge_alpha = {1: 65.0, 5: 55.0, 21: 50.0, 63: 45.0, 126: 40.0}.get(h, 55.0)
    retrain_every = max(16, h)

    X_all = work[FEATURE_COLUMNS].fillna(0.0).to_numpy(dtype=float)
    n_features = X_all.shape[1]
    eye_reg = np.eye(n_features, dtype=float) * ridge_alpha

    def _fit_fast_weighted_ridge(X_tr: np.ndarray, y_tr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
        n_tr = len(y_tr)
        w = np.exp(-0.0045 * np.arange(n_tr - 1, -1, -1, dtype=float))
        w_sum = float(np.sum(w))
        mu_x = (w @ X_tr) / w_sum
        Xc = X_tr - mu_x
        var_x = (w @ (Xc ** 2)) / w_sum
        std_x = np.where(var_x > 1e-10, np.sqrt(var_x), 1.0)
        Xs = Xc / std_x
        mu_y = float((w @ y_tr) / w_sum)
        yc = y_tr - mu_y
        Xw = Xs * w[:, None]
        coef = np.linalg.solve(Xw.T @ Xs + eye_reg, Xw.T @ yc)
        return mu_x, std_x, coef, mu_y

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

    cur_mu_x: np.ndarray | None = None
    cur_std_x: np.ndarray | None = None
    cur_coef: np.ndarray | None = None
    cur_intercept: float = 0.0
    cur_q16, cur_q84, cur_q05, cur_q95 = -1.0, 1.0, -1.645, 1.645
    last_fit_step = -9999
    last_q_step = -9999

    log_ret_1d_arr = work["log_ret_1d"].fillna(0.0).to_numpy(dtype=float)
    cum_ret_1d = np.concatenate([[0.0], np.cumsum(log_ret_1d_arr[1:])])
    sigma_clean = np.nan_to_num(sigma, nan=0.015)
    cum_sigma = np.concatenate([[0.0], np.cumsum(sigma_clean)])

    # Precompute vectorized Kalman state components for fast OOS evaluation
    kalman_daily_arr = work["kalman_drift_daily"].fillna(0.0).to_numpy(dtype=float)
    serial_reg_arr = work["serial_regime"].fillna(0.0).to_numpy(dtype=float)
    ret5_arr = work["ret_5d"].fillna(0.0).to_numpy(dtype=float)
    dist20_arr = work["dist_sma20"].fillna(0.0).to_numpy(dtype=float)
    dist50_arr = work["dist_sma50"].fillna(0.0).to_numpy(dtype=float)
    rsi_c_arr = work["rsi_centered"].fillna(0.0).to_numpy(dtype=float)
    clv5_arr = work["clv_5d"].fillna(0.0).to_numpy(dtype=float)
    sec_rel_arr = work["sector_rel_21d"].fillna(0.0).to_numpy(dtype=float)

    mom_z_all = np.clip(ret5_arr / np.maximum(sigma_clean * np.sqrt(5.0), 0.008), -2.5, 2.5)
    ext_z_all = np.clip(dist20_arr / np.maximum(sigma_clean * np.sqrt(20.0), 0.012), -2.5, 2.5)
    trend_z_all = np.clip(dist50_arr / 0.09, -2.2, 2.2)
    trend_gate_all = 1.0 / (1.0 + np.exp(-9.0 * (serial_reg_arr + 0.02)))

    for idx_pos, t in enumerate(test_origins):
        # STRICT HORIZON PURGING: train origins s must satisfy s + h <= t
        max_train_origin = t - h
        has_purged_train = (max_train_origin - first_valid) >= 15
        train_slice = slice(first_valid, max_train_origin + 1)

        if has_purged_train and (cur_coef is None or (idx_pos - last_fit_step) >= retrain_every):
            X_tr = X_all[train_slice]
            y_tr = np.clip(target_z[train_slice], -3.0, 3.0)
            cur_mu_x, cur_std_x, cur_coef, cur_intercept = _fit_fast_weighted_ridge(X_tr, y_tr)
            last_fit_step = idx_pos

        cur_drift_daily = float(cum_ret_1d[t] / max(1, t))

        if cur_coef is not None and cur_mu_x is not None and cur_std_x is not None:
            x_t_s = (X_all[t] - cur_mu_x) / cur_std_x
            raw_pred = float(x_t_s @ cur_coef + cur_intercept)
            z_r = float(np.clip(raw_pred * 0.85, -1.85, 1.85))
        else:
            z_r = 0.0

        blended_drift_t = 0.78 * kalman_daily_arr[t] + 0.22 * cur_drift_daily
        drift_z_t = (blended_drift_t * h) / max(scale_h[t], 1e-4)
        if h <= 5:
            mom_b = 0.62 * drift_z_t + 0.26 * mom_z_all[t] + 0.14 * clv5_arr[t] + 0.10 * trend_z_all[t]
            rev_b = 0.25 * drift_z_t - 0.48 * ext_z_all[t] - 0.22 * rsi_c_arr[t] - 0.10 * clv5_arr[t]
        else:
            mom_b = 0.68 * drift_z_t + 0.22 * trend_z_all[t] + 0.14 * np.clip(sec_rel_arr[t] / 0.06, -2.0, 2.0) + 0.08 * mom_z_all[t]
            rev_b = 0.35 * drift_z_t - 0.34 * ext_z_all[t] - 0.16 * rsi_c_arr[t] + 0.10 * trend_z_all[t]

        z_s = float(np.clip(trend_gate_all[t] * mom_b + (1.0 - trend_gate_all[t]) * rev_b, -1.85, 1.85))

        oos_pred_z_ridge[idx_pos] = z_r
        oos_pred_z_state[idx_pos] = z_s
        oos_hist_avg_ret[idx_pos] = float((cum_ret_1d[t] / max(1, t)) * h)
        oos_actual_ret[idx_pos] = fwd_log_ret[t]
        oos_scale_h[idx_pos] = scale_h[t]
        oos_spy_vol[idx_pos] = spy_vol_ann[t]

        completed_mask = (test_origins[:idx_pos] + h) <= t
        if np.sum(completed_mask) >= 25 and (idx_pos - last_q_step) >= 12:
            past_ens_z = 0.55 * oos_pred_z_ridge[:idx_pos][completed_mask] + 0.45 * oos_pred_z_state[:idx_pos][completed_mask]
            past_err_z = (oos_actual_ret[:idx_pos][completed_mask] / oos_scale_h[:idx_pos][completed_mask]) - past_ens_z
            qs = np.quantile(past_err_z, [0.16, 0.84, 0.05, 0.95])
            cur_q16, cur_q84, cur_q05, cur_q95 = float(qs[0]), float(qs[1]), float(qs[2]), float(qs[3])
            last_q_step = idx_pos

        oos_q16_sofar[idx_pos] = cur_q16
        oos_q84_sofar[idx_pos] = cur_q84
        oos_q05_sofar[idx_pos] = cur_q05
        oos_q95_sofar[idx_pos] = cur_q95

    # Precision-weighted ensemble from inverse out-of-sample MSE
    actual_pct = (np.exp(oos_actual_ret) - 1.0) * 100.0
    ridge_pct = (np.exp(oos_pred_z_ridge * oos_scale_h) - 1.0) * 100.0
    state_pct = (np.exp(oos_pred_z_state * oos_scale_h) - 1.0) * 100.0

    mse_ridge = max(float(np.mean((actual_pct - ridge_pct) ** 2)), 1e-4)
    mse_state = max(float(np.mean((actual_pct - state_pct) ** 2)), 1e-4)
    inv_r = 1.0 / mse_ridge
    inv_s = 1.0 / mse_state
    w_ridge = float(np.clip(inv_r / (inv_r + inv_s), 0.25, 0.75))

    oos_pred_z_ens = w_ridge * oos_pred_z_ridge + (1.0 - w_ridge) * oos_pred_z_state
    ens_pct = (np.exp(oos_pred_z_ens * oos_scale_h) - 1.0) * 100.0
    hist_avg_pct = (np.exp(oos_hist_avg_ret) - 1.0) * 100.0
    no_change_pct = np.zeros_like(actual_pct)

    mae_ridge = float(np.mean(np.abs(actual_pct - ridge_pct)))
    mae_state = float(np.mean(np.abs(actual_pct - state_pct)))
    mae_ens = float(np.mean(np.abs(actual_pct - ens_pct)))

    if mae_ens <= min(mae_ridge, mae_state) + 0.02:
        selected_key = "ensemble"
        selected_name = "Adaptive Kalman + Recency Ridge Super-Ensemble"
        ensemble_used = True
        sel_pred_z = oos_pred_z_ens
        sel_pred_pct = ens_pct
        selection_reason = (
            f"Precision-weighted Super-Ensemble ({w_ridge * 100:.0f}% Recency Ridge / {(1 - w_ridge) * 100:.0f}% Kalman Regime Filter) "
            f"achieved walk-forward MAE {mae_ens:.2f}% (vs Ridge {mae_ridge:.2f}%, Kalman State {mae_state:.2f}%)."
        )
    elif mae_ridge <= mae_state:
        selected_key = "ridge"
        selected_name = "Recency-Weighted 20-Factor Ridge"
        ensemble_used = False
        sel_pred_z = oos_pred_z_ridge
        sel_pred_pct = ridge_pct
        selection_reason = (
            f"Recency-Weighted 20-Factor Ridge selected (walk-forward MAE {mae_ridge:.2f}% vs Kalman State {mae_state:.2f}%)."
        )
    else:
        selected_key = "damped_state"
        selected_name = "Kalman Autocorrelation Regime Filter"
        ensemble_used = False
        sel_pred_z = oos_pred_z_state
        sel_pred_pct = state_pct
        selection_reason = (
            f"Kalman Autocorrelation Regime Filter selected (walk-forward MAE {mae_state:.2f}% vs Ridge {mae_ridge:.2f}%)."
        )

    model_mae = float(np.mean(np.abs(actual_pct - sel_pred_pct)))
    no_change_mae = float(np.mean(np.abs(actual_pct - no_change_pct)))
    hist_avg_mae = float(np.mean(np.abs(actual_pct - hist_avg_pct)))
    mae_skill = (1.0 - model_mae / max(no_change_mae, 1e-6)) * 100.0

    model_rmse = float(np.sqrt(np.mean((actual_pct - sel_pred_pct) ** 2)))
    no_change_rmse = float(np.sqrt(np.mean(actual_pct ** 2)))

    pred_sign = np.where(sel_pred_pct >= 0.0, 1, -1)
    actual_sign = np.where(actual_pct >= 0.0, 1, -1)
    dir_acc = float(np.mean(pred_sign == actual_sign) * 100.0)

    drift_sign = np.where(hist_avg_pct >= 0.0, 1, -1)
    drift_dir_acc = float(np.mean(drift_sign == actual_sign) * 100.0)

    non_overlap_step = max(1, int(np.ceil(h / eval_stride)))
    no_idx = np.arange(0, len(test_origins), non_overlap_step)
    hits_no = int(np.sum(pred_sign[no_idx] == actual_sign[no_idx]))
    total_no = int(len(no_idx))
    p_val = float(binomtest(hits_no, max(1, total_no), p=0.5, alternative="greater").pvalue)

    pred_log_sel = sel_pred_z * oos_scale_h
    lo68_pct = (np.exp(pred_log_sel + oos_q16_sofar * oos_scale_h) - 1.0) * 100.0
    hi68_pct = (np.exp(pred_log_sel + oos_q84_sofar * oos_scale_h) - 1.0) * 100.0
    lo90_pct = (np.exp(pred_log_sel + oos_q05_sofar * oos_scale_h) - 1.0) * 100.0
    hi90_pct = (np.exp(pred_log_sel + oos_q95_sofar * oos_scale_h) - 1.0) * 100.0

    cov68 = float(np.mean((actual_pct >= lo68_pct) & (actual_pct <= hi68_pct)) * 100.0)
    cov90 = float(np.mean((actual_pct >= lo90_pct) & (actual_pct <= hi90_pct)) * 100.0)

    calibrator = fit_probability_calibrator(sel_pred_z, oos_actual_ret)

    all_err_z = (oos_actual_ret / oos_scale_h) - sel_pred_z
    q16_final = float(np.quantile(all_err_z, 0.16))
    q84_final = float(np.quantile(all_err_z, 0.84))
    q05_final = float(np.quantile(all_err_z, 0.05))
    q95_final = float(np.quantile(all_err_z, 0.95))

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

    # Fit final recency-weighted production model on ALL realized historical targets (origins <= N - 1 - h)
    final_train_slice = slice(first_valid, last_eval_origin + 1)
    y_final = np.clip(target_z[final_train_slice], -3.0, 3.0)
    n_fin = len(y_final)
    fin_weights = np.exp(-0.0045 * np.arange(n_fin - 1, -1, -1, dtype=float))

    final_scaler = StandardScaler()
    X_final_s = final_scaler.fit_transform(X_all[final_train_slice])
    final_ridge = Ridge(alpha=ridge_alpha)
    final_ridge.fit(X_final_s, y_final, sample_weight=fin_weights)
    hist_mean_daily = float(np.mean(log_ret_1d_arr[1:]))

    validation_limited = total_no < 25 or len(test_origins) < 60

    report = HorizonBacktestReport(
        ticker=ticker,
        horizon_code=horizon_code,
        horizon_label=horizon_label,
        horizon_trading_days=h,
        methodology=(
            f"Expanding chronological walk-forward validation with {h}-session horizon purge "
            f"and exponential recency weighting across {len(test_origins)} windows "
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
        ensemble_ridge_weight=w_ridge,
        conformal_q16=q16_final,
        conformal_q84=q84_final,
        conformal_q05=q05_final,
        conformal_q95=q95_final,
        final_scaler=final_scaler,
        final_ridge=final_ridge,
        historical_mean_daily_log_ret=hist_mean_daily,
    )
