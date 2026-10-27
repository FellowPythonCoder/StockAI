"""Live Multi-Horizon Quantitative Stock Forecasting Engine (20-Factor Super-Ensemble)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import numpy as np
import pandas as pd

from .. import MODEL_VERSION
from ..evaluation.backtest import HORIZON_SPECS, WalkForwardArtifacts, _damped_state_predict_z, run_walk_forward_pipeline
from ..explanation.synthesizer import build_forecast_explanation
from ..providers.normalizer import advance_trading_days
from ..schemas import (
    DataProvenance,
    DataQualityLevel,
    FactorContribution,
    ForecastDirection,
    ForecastTrajectoryPoint,
    FundamentalsSnapshot,
    HorizonBacktestReport,
    HorizonCode,
    HorizonForecast,
    NewsDevelopment,
)
from .features import FEATURE_COLUMNS, build_causal_feature_frame

FACTOR_META: dict[str, tuple[str, str, str]] = {
    "ret_1d": ("1-Day Return Impulse", "momentum", "Single-session short-term reversal / continuation pressure"),
    "ret_5d": ("5-Day Momentum", "momentum", "Weekly return velocity and short-horizon momentum persistence"),
    "ret_21d": ("21-Day Trend Return", "momentum", "Monthly price momentum across institutional rebalancing window"),
    "ret_63d": ("63-Day Quarterly Trend", "momentum", "Quarterly medium-term directional persistence"),
    "dist_sma20": ("Price vs 20d SMA", "trend", "Short-term moving average equilibrium extension"),
    "dist_sma50": ("Price vs 50d SMA", "trend", "Intermediate institutional trend alignment"),
    "dist_sma200": ("Price vs 200d SMA", "trend", "Primary secular trend regime anchor"),
    "macd_norm": ("Normalized MACD Spread", "momentum", "12/26-day EMA convergence-divergence momentum"),
    "efficiency_20": ("Kaufman Trend Efficiency", "trend", "20-day directional signal-to-noise ratio"),
    "rsi_centered": ("Wilder RSI(14) Balance", "momentum", "Overbought / oversold oscillator tension"),
    "ewma_vol_ann": ("EWMA Volatility Level", "volatility", "Conditional RiskMetrics annualized volatility"),
    "parkinson_ratio": ("Intraday Range Expansion", "volatility", "High-low range volatility relative to close-to-close"),
    "vol_regime_z": ("Volatility Regime Shift", "volatility", "Current 20d volatility relative to 6-month baseline"),
    "rel_vol_20": ("Relative Volume (20d)", "volume", "Participation intensity vs 20-session average turnover"),
    "market_alpha_21d": ("Beta-Adjusted MSX 500 Alpha", "relative_strength", "Idiosyncratic 21-day return net of rolling synthetic market beta"),
    "sector_rel_21d": ("Sector Relative Strength", "relative_strength", "21-day performance spread vs synthetic sector index"),
    "clv_5d": ("5-Candle Order-Flow Pressure", "volume", "Exponential close-location value measuring intrabar buying vs selling wicks"),
    "vol_mom_5d": ("Volume-Confirmed Thrust", "volume", "5-day return amplified by relative institutional turnover conviction"),
    "kalman_drift_z": ("Adaptive Kalman Regime Drift", "trend", "Volatility-normalized local exponential drift tracking active trend inflections"),
    "regime_mom_interact": ("Autocorrelation Regime Signal", "momentum", "Switches automatically between momentum continuation and range mean-reversion"),
}


def assess_data_quality(
    n_bars: int,
    provenance: DataProvenance,
    fundamentals: FundamentalsSnapshot,
) -> tuple[DataQualityLevel, str]:
    has_core_fund = fundamentals.pe_trailing is not None or fundamentals.market_cap is not None
    if provenance.staleness_warning:
        return "Limited", f"Price history has {n_bars} bars, but {provenance.staleness_warning}"
    if n_bars >= 750 and has_core_fund:
        return "High", f"{n_bars:,} procedural daily candlesticks (~{n_bars / 252:.1f} yrs), benchmark/sector alignment, and synthetic fundamentals."
    if n_bars >= 450:
        return "Medium", f"{n_bars:,} procedural daily candlesticks (~{n_bars / 252:.1f} yrs) with synthetic benchmark alignment."
    return "Limited", f"Shorter {n_bars}-session candle series limits multi-cycle walk-forward validation depth."


def generate_horizon_forecast_and_backtest(
    ticker: str,
    company_name: str,
    stock_df: pd.DataFrame,
    spy_df: pd.DataFrame,
    sector_etf: str,
    sector_df: pd.DataFrame,
    fundamentals: FundamentalsSnapshot,
    news: list[NewsDevelopment],
    provenance: DataProvenance,
    horizon_code: HorizonCode,
    precomputed_feat_df: Optional[pd.DataFrame] = None,
) -> tuple[HorizonForecast, HorizonBacktestReport]:
    horizon_label, h = HORIZON_SPECS[horizon_code]
    feat_df = (
        precomputed_feat_df
        if precomputed_feat_df is not None
        else build_causal_feature_frame(stock_df, spy_df=spy_df, sector_df=sector_df)
    )
    wf: WalkForwardArtifacts = run_walk_forward_pipeline(ticker, feat_df, horizon_code)

    latest = feat_df.iloc[-1]
    spot_price = float(latest["close"])
    spot_date = str(latest["date"])[:10]
    target_date = advance_trading_days(spot_date, h)

    sigma_daily = float(latest["ewma_daily_vol"])
    avg_vol = float(feat_df["ewma_daily_vol"].tail(252).mean())

    x_latest = feat_df[FEATURE_COLUMNS].iloc[-1:].fillna(0.0).to_numpy(dtype=float)
    x_latest_std = wf.final_scaler.transform(x_latest)

    z_ridge = float(np.clip(wf.final_ridge.predict(x_latest_std)[0] * 0.85, -1.85, 1.85))
    z_state = float(_damped_state_predict_z(feat_df.iloc[-1:], h, wf.historical_mean_daily_log_ret, avg_vol)[0])

    if wf.selected_model_key == "ensemble":
        w_r = wf.ensemble_ridge_weight
        pred_z = w_r * z_ridge + (1.0 - w_r) * z_state
    elif wf.selected_model_key == "ridge":
        pred_z = z_ridge
    else:
        pred_z = z_state

    # Check if confirmed earnings release falls inside (spot_date, target_date]
    earnings_in_window = False
    earnings_dt_in_win: Optional[str] = None
    if fundamentals.next_earnings_date:
        ed = fundamentals.next_earnings_date[:10]
        if spot_date < ed <= target_date:
            earnings_in_window = True
            earnings_dt_in_win = ed

    diffusive_var = (sigma_daily ** 2) * float(h)
    jump_var = (1.65 * sigma_daily) ** 2 if earnings_in_window else 0.0
    effective_scale_h = float(np.sqrt(diffusive_var + jump_var))
    pure_diffusive_scale_h = float(sigma_daily * np.sqrt(float(h)))

    expected_log_ret = pred_z * pure_diffusive_scale_h
    expected_price = spot_price * float(np.exp(expected_log_ret))
    expected_return_pct = (expected_price / spot_price - 1.0) * 100.0

    range_68_low = spot_price * float(np.exp(expected_log_ret + wf.conformal_q16 * effective_scale_h))
    range_68_high = spot_price * float(np.exp(expected_log_ret + wf.conformal_q84 * effective_scale_h))
    range_90_low = spot_price * float(np.exp(expected_log_ret + wf.conformal_q05 * effective_scale_h))
    range_90_high = spot_price * float(np.exp(expected_log_ret + wf.conformal_q95 * effective_scale_h))

    noise_deadband_pct = max(0.18, 0.11 * pure_diffusive_scale_h * 100.0)
    if expected_return_pct >= noise_deadband_pct:
        direction: ForecastDirection = "upside"
        direction_label = "Potential upside"
    elif expected_return_pct <= -noise_deadband_pct:
        direction = "downside"
        direction_label = "Potential downside"
    else:
        direction = "mixed"
        direction_label = "Mixed / uncertain outlook"

    prob_higher: Optional[float] = None
    if wf.calibrator.sample_size >= 40:
        prob_higher = round(wf.calibrator.predict_prob_up(pred_z) * 100.0, 1)

    coefs = wf.final_ridge.coef_ * 0.85
    std_vals = x_latest_std[0]
    contribs_raw: list[FactorContribution] = []
    for idx_f, col_name in enumerate(FEATURE_COLUMNS):
        w = float(coefs[idx_f] * std_vals[idx_f])
        raw_v = float(latest[col_name]) if pd.notna(latest[col_name]) else 0.0
        title, cat, desc = FACTOR_META[col_name]
        if col_name in (
            "ret_1d",
            "ret_5d",
            "ret_21d",
            "ret_63d",
            "dist_sma20",
            "dist_sma50",
            "dist_sma200",
            "ewma_vol_ann",
            "market_alpha_21d",
            "sector_rel_21d",
            "vol_mom_5d",
        ):
            val_fmt = f"{raw_v * 100.0:+.2f}%" if "ewma" not in col_name else f"{raw_v * 100.0:.1f}%"
        elif col_name == "rsi_centered":
            val_fmt = f"RSI {float(latest['rsi14']):.1f}"
        elif col_name in ("kalman_drift_z", "regime_mom_interact"):
            val_fmt = f"{raw_v:+.2f}σ"
        else:
            val_fmt = f"{raw_v:+.2f}"

        imp = "positive" if w > 0.004 else ("negative" if w < -0.004 else "neutral")
        contribs_raw.append(
            FactorContribution(
                name=title,
                category=cat,  # type: ignore[arg-type]
                measured_value=val_fmt,
                impact_direction=imp,  # type: ignore[arg-type]
                standardized_weight=round(w, 4),
                description=desc,
            )
        )

    contribs_sorted = sorted(contribs_raw, key=lambda c: abs(c.standardized_weight), reverse=True)[:8]

    trajectory: list[ForecastTrajectoryPoint] = [
        ForecastTrajectoryPoint(
            date=spot_date,
            step_days=0,
            expected_price=round(spot_price, 2),
            range_68_low=round(spot_price, 2),
            range_68_high=round(spot_price, 2),
            range_90_low=round(spot_price, 2),
            range_90_high=round(spot_price, 2),
        )
    ]

    if h <= 5:
        steps = list(range(1, h + 1))
    elif h <= 21:
        steps = sorted(set([1, 3, 5, 8, 11, 14, 17, 21]))
    elif h <= 63:
        steps = sorted(set([3, 7, 14, 21, 30, 42, 52, 63]))
    else:
        steps = sorted(set([5, 15, 30, 45, 63, 84, 105, 126]))

    for s in steps:
        frac = s / float(h)
        step_dt = advance_trading_days(spot_date, s)
        step_exp_log = expected_log_ret * frac
        has_jump = earnings_in_window and earnings_dt_in_win is not None and step_dt >= earnings_dt_in_win
        step_scale = float(np.sqrt((sigma_daily ** 2) * float(s) + (jump_var if has_jump else 0.0)))
        trajectory.append(
            ForecastTrajectoryPoint(
                date=step_dt,
                step_days=s,
                expected_price=round(spot_price * float(np.exp(step_exp_log)), 2),
                range_68_low=round(spot_price * float(np.exp(step_exp_log + wf.conformal_q16 * step_scale)), 2),
                range_68_high=round(spot_price * float(np.exp(step_exp_log + wf.conformal_q84 * step_scale)), 2),
                range_90_low=round(spot_price * float(np.exp(step_exp_log + wf.conformal_q05 * step_scale)), 2),
                range_90_high=round(spot_price * float(np.exp(step_exp_log + wf.conformal_q95 * step_scale)), 2),
            )
        )

    dq_level, dq_detail = assess_data_quality(len(stock_df), provenance, fundamentals)

    key_reasons, measured_facts, assumptions, risks = build_forecast_explanation(
        ticker=ticker,
        company_name=company_name,
        horizon_label=horizon_label,
        horizon_days=h,
        direction=direction,
        expected_return_pct=round(expected_return_pct, 2),
        range_68_low=round(range_68_low, 2),
        range_68_high=round(range_68_high, 2),
        latest_row=latest,
        fundamentals=fundamentals,
        news=news,
        factor_contributions=contribs_sorted,
        earnings_in_window=earnings_in_window,
        earnings_date_in_window=earnings_dt_in_win,
        sector_etf=sector_etf,
        mae_skill_pct=wf.report.mae_skill_vs_no_change_pct,
        directional_acc_pct=wf.report.directional_accuracy_pct,
        sample_size=wf.report.sample_size,
    )

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    forecast = HorizonForecast(
        ticker=ticker,
        horizon_code=horizon_code,
        horizon_label=horizon_label,
        horizon_trading_days=h,
        starting_price=round(spot_price, 2),
        starting_date=spot_date,
        target_date=target_date,
        direction=direction,
        direction_label=direction_label,
        expected_return_pct=round(expected_return_pct, 2),
        expected_price=round(expected_price, 2),
        range_68_low=round(range_68_low, 2),
        range_68_high=round(range_68_high, 2),
        range_90_low=round(range_90_low, 2),
        range_90_high=round(range_90_high, 2),
        prob_higher=prob_higher,
        prob_calibrated=wf.calibrator.is_calibrated,
        calibration_note=wf.calibrator.note,
        selected_model_name=wf.selected_model_name,
        ensemble_used=wf.ensemble_used,
        model_selection_reason=wf.selection_reason,
        model_version=MODEL_VERSION,
        data_quality=dq_level,
        data_quality_detail=dq_detail,
        earnings_in_window=earnings_in_window,
        earnings_date_in_window=earnings_dt_in_win,
        annualized_volatility_pct=round(sigma_daily * np.sqrt(252.0) * 100.0, 1),
        key_reasons=key_reasons,
        measured_facts=measured_facts,
        model_assumptions=assumptions,
        risks_and_invalidation=risks,
        factor_contributions=contribs_sorted,
        trajectory=trajectory,
        last_updated=now_iso,
    )

    return forecast, wf.report
