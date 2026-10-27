"""Generates evidence-attributed quantitative explanations, risks, and invalidation triggers
for procedurally generated synthetic stocks.
"""

from __future__ import annotations

from typing import Optional
import pandas as pd

from ..schemas import FactorContribution, ForecastDirection, FundamentalsSnapshot, NewsDevelopment


def build_forecast_explanation(
    ticker: str,
    company_name: str,
    horizon_label: str,
    horizon_days: int,
    direction: ForecastDirection,
    expected_return_pct: float,
    range_68_low: float,
    range_68_high: float,
    latest_row: pd.Series,
    fundamentals: FundamentalsSnapshot,
    news: list[NewsDevelopment],
    factor_contributions: list[FactorContribution],
    earnings_in_window: bool,
    earnings_date_in_window: Optional[str],
    sector_etf: str,
    mae_skill_pct: float,
    directional_acc_pct: float,
    sample_size: int,
) -> tuple[list[str], list[str], list[str], list[str]]:
    """Returns (key_reasons, measured_facts, model_assumptions, risks_and_invalidation)."""

    close_p = float(latest_row["close"])
    sma20 = float(latest_row["sma20"]) if pd.notna(latest_row.get("sma20")) else close_p
    sma50 = float(latest_row["sma50"]) if pd.notna(latest_row.get("sma50")) else close_p
    sma200 = float(latest_row["sma200"]) if pd.notna(latest_row.get("sma200")) else sma50
    rsi14 = float(latest_row["rsi14"]) if pd.notna(latest_row.get("rsi14")) else 50.0
    vol_ann = float(latest_row["ewma_vol_ann"]) * 100.0
    ret_21d = float(latest_row.get("ret_21d", 0.0)) * 100.0
    sec_rel = float(latest_row.get("sector_rel_21d", 0.0)) * 100.0
    mkt_alpha = float(latest_row.get("market_alpha_21d", 0.0)) * 100.0
    beta60 = float(latest_row.get("rolling_beta_60", 1.0))

    sorted_factors = sorted(factor_contributions, key=lambda f: abs(f.standardized_weight), reverse=True)
    key_reasons: list[str] = []

    dist50_pct = (close_p / sma50 - 1.0) * 100.0
    dist200_pct = (close_p / sma200 - 1.0) * 100.0
    if close_p >= sma50 and sma50 >= sma200:
        key_reasons.append(
            f"Constructive multi-timeframe candle trend: {ticker} trades {dist50_pct:+.1f}% vs its 50-candle SMA "
            f"(${sma50:.2f}) and {dist200_pct:+.1f}% above its 200-candle SMA (${sma200:.2f})."
        )
    elif close_p < sma50 and sma50 < sma200:
        key_reasons.append(
            f"Compressed trend alignment: latest candle (${close_p:.2f}) sits {abs(dist50_pct):.1f}% below its 50-candle SMA "
            f"(${sma50:.2f}) and below 200-candle trend (${sma200:.2f})."
        )
    else:
        key_reasons.append(
            f"Transitional candle regime: {ticker} sits {dist50_pct:+.1f}% relative to its 50-candle SMA (${sma50:.2f}) "
            f"with long-term 200-candle support at ${sma200:.2f}."
        )

    key_reasons.append(
        f"21-candle relative spread vs {sector_etf} synthetic sector index is {sec_rel:+.2f}%, with beta-adjusted "
        f"alpha of {mkt_alpha:+.2f}% against MSX 500 (rolling 60d beta {beta60:.2f})."
    )

    if rsi14 >= 68.0:
        key_reasons.append(
            f"14-candle Wilder RSI reads {rsi14:.1f} (elevated momentum / overbought zone), "
            f"applying mean-reversion damping to short-horizon upside extrapolation."
        )
    elif rsi14 <= 34.0:
        key_reasons.append(
            f"14-candle Wilder RSI reads {rsi14:.1f} (oversold compression after a {ret_21d:+.1f}% 21-candle move), "
            f"increasing probability of tactical mean-reversion bounce."
        )
    else:
        key_reasons.append(
            f"Balanced momentum oscillator (RSI-14 at {rsi14:.1f} after a {ret_21d:+.1f}% 21-candle move), "
            f"showing directional participation without extreme exhaustion."
        )

    if fundamentals.pe_trailing is not None and fundamentals.revenue_growth_yoy_pct is not None:
        fwd_str = f", forward P/E {fundamentals.pe_forward:.1f}x" if fundamentals.pe_forward else ""
        key_reasons.append(
            f"Synthetic fundamental profile: {fundamentals.pe_trailing:.1f}x trailing P/E{fwd_str} "
            f"paired with {fundamentals.revenue_growth_yoy_pct:+.1f}% YoY revenue growth."
        )
    else:
        key_reasons.append(
            f"Conditional EWMA annualized volatility stands at {vol_ann:.1f}%, calibrating the 68% "
            f"{horizon_label.lower()} forecast cone to ${range_68_low:.2f}–${range_68_high:.2f}."
        )

    if earnings_in_window and earnings_date_in_window:
        key_reasons.append(
            f"Synthetic earnings event ({earnings_date_in_window}) falls inside this {horizon_days}-candle "
            f"window; conformal range widened to absorb jump variance."
        )
    elif sorted_factors and len(key_reasons) < 5:
        top_f = sorted_factors[0]
        key_reasons.append(f"Top weighted factor: {top_f.name} ({top_f.measured_value}) — {top_f.description}")

    measured_facts: list[str] = [
        f"Latest candle close: ${close_p:.2f}; 52-week synthetic range: ${fundamentals.week52_low:.2f} – ${fundamentals.week52_high:.2f}.",
        f"20-SMA: ${sma20:.2f} · 50-SMA: ${sma50:.2f} · 200-SMA: ${sma200:.2f} · RSI(14): {rsi14:.1f}.",
        f"EWMA annualized volatility: {vol_ann:.1f}% · 20-candle average volume: {fundamentals.avg_volume_20d:,} shares.",
        f"Chronological walk-forward backtest ({sample_size} out-of-sample windows): {directional_acc_pct:.1f}% hit rate, {mae_skill_pct:+.2f}% MAE skill vs No-Change.",
    ]
    if fundamentals.market_cap_fmt and fundamentals.revenue_ttm_fmt:
        measured_facts.append(
            f"Synthetic TTM revenue: {fundamentals.revenue_ttm_fmt} · Market cap: {fundamentals.market_cap_fmt}."
        )

    model_assumptions: list[str] = [
        "Forecast is inferred strictly from past candlestick features without access to future random candle shocks.",
        f"68% forecast cone (${range_68_low:.2f}–${range_68_high:.2f}) scales split-conformal residuals by EWMA volatility ({vol_ann:.1f}% ann.).",
        "Stochastic candle simulation includes random fat-tailed shocks and regime shifts that can override historical trend signals.",
    ]

    invalidation_down = round(min(sma50, range_68_low), 2)
    invalidation_up = round(max(sma20, range_68_high), 2)
    risks: list[str] = []

    if direction == "upside":
        risks.append(
            f"Upside invalidation level: a candle close below ${invalidation_down:.2f} breaks 50-candle support and flips short-term momentum."
        )
    elif direction == "downside":
        risks.append(
            f"Downside invalidation level: a candle close above ${invalidation_up:.2f} invalidates bearish momentum."
        )
    else:
        risks.append(
            f"Range-breakout risk: directional conviction is muted ({expected_return_pct:+.2f}%); random volatility spikes can push price outside ${range_68_low:.2f}–${range_68_high:.2f}."
        )

    if beta60 >= 1.3:
        risks.append(
            f"Elevated beta ({beta60:.2f}): swings in the MSX 500 synthetic market amplify {ticker} candle variance."
        )
    risks.append(
        "Stochastic candle risk: every simulated future candle draws independent random GARCH volatility shocks — test the AI live using Run Candle Progress."
    )

    return key_reasons[:5], measured_facts[:5], model_assumptions, risks[:4]
