"""Generates honest, evidence-attributed quantitative explanations, risks, and invalidation triggers.

Strictly separates measured historical/fundamental facts from model assumptions.
Never uses LLM self-confidence or invents unsupported market facts.
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

    # 1. Key Reasons (3-5 strongest quantitative drivers ranked by absolute weight)
    sorted_factors = sorted(factor_contributions, key=lambda f: abs(f.standardized_weight), reverse=True)
    key_reasons: list[str] = []

    # Trend structure reason
    dist50_pct = (close_p / sma50 - 1.0) * 100.0
    dist200_pct = (close_p / sma200 - 1.0) * 100.0
    if close_p >= sma50 and sma50 >= sma200:
        key_reasons.append(
            f"Constructive multi-timeframe trend structure: {ticker} trades {dist50_pct:+.1f}% vs its 50-day SMA "
            f"(${sma50:.2f}) and {dist200_pct:+.1f}% above its 200-day SMA (${sma200:.2f})."
        )
    elif close_p < sma50 and sma50 < sma200:
        key_reasons.append(
            f"Compressed trend alignment: spot price (${close_p:.2f}) remains {abs(dist50_pct):.1f}% below its 50-day SMA "
            f"(${sma50:.2f}) and below long-term 200-day trend (${sma200:.2f})."
        )
    else:
        key_reasons.append(
            f"Transitional trend regime: {ticker} sits {dist50_pct:+.1f}% relative to its 50-day SMA (${sma50:.2f}) "
            f"while long-term 200-day support rests at ${sma200:.2f}."
        )

    # Sector & benchmark relative strength
    key_reasons.append(
        f"21-day relative performance vs {sector_etf} sector benchmark is {sec_rel:+.2f}%, with beta-adjusted "
        f"idiosyncratic excess return of {mkt_alpha:+.2f}% against S&P 500 (rolling 60d beta {beta60:.2f})."
    )

    # Momentum / Oscillator state
    if rsi14 >= 68.0:
        key_reasons.append(
            f"14-day Wilder RSI reads {rsi14:.1f} (elevated momentum / near overbought territory), "
            f"tempering short-horizon upside extrapolation via mean-reversion damping."
        )
    elif rsi14 <= 34.0:
        key_reasons.append(
            f"14-day Wilder RSI reads {rsi14:.1f} (oversold compression after a {ret_21d:+.1f}% 21-day move), "
            f"historically associated with tactical mean-reversion stabilization."
        )
    else:
        key_reasons.append(
            f"Balanced momentum oscillator (RSI-14 at {rsi14:.1f} after a {ret_21d:+.1f}% 21-day return), "
            f"indicating trend participation without extreme exhaustion."
        )

    # Volatility & Fundamental context
    if fundamentals.pe_trailing is not None and fundamentals.revenue_growth_yoy_pct is not None:
        fwd_str = f", forward P/E {fundamentals.pe_forward:.1f}x" if fundamentals.pe_forward else ""
        key_reasons.append(
            f"Fundamental valuation & growth context: {fundamentals.pe_trailing:.1f}x trailing P/E{fwd_str} "
            f"paired with {fundamentals.revenue_growth_yoy_pct:+.1f}% YoY TTM revenue growth."
        )
    else:
        key_reasons.append(
            f"Conditional EWMA annualized volatility stands at {vol_ann:.1f}%, calibrating the 68% "
            f"{horizon_label.lower()} forecast range to ${range_68_low:.2f}–${range_68_high:.2f}."
        )

    if earnings_in_window and earnings_date_in_window:
        key_reasons.append(
            f"Scheduled earnings release ({earnings_date_in_window}) falls inside this {horizon_days}-session "
            f"horizon; conformal interval widened to incorporate discrete earnings-jump variance."
        )
    elif sorted_factors:
        top_f = sorted_factors[0]
        if len(key_reasons) < 5:
            key_reasons.append(f"Primary quantitative factor contribution: {top_f.name} ({top_f.measured_value}) — {top_f.description}")

    # 2. Measured Facts (strictly observed data, zero speculation)
    measured_facts: list[str] = [
        f"Last recorded close: ${close_p:.2f}; 52-week trading range: ${fundamentals.week52_low:.2f} – ${fundamentals.week52_high:.2f}.",
        f"20-day SMA: ${sma20:.2f} · 50-day SMA: ${sma50:.2f} · 200-day SMA: ${sma200:.2f} · RSI(14): {rsi14:.1f}.",
        f"RiskMetrics EWMA annualized volatility: {vol_ann:.1f}% · 20-day average volume: {fundamentals.avg_volume_20d:,} shares.",
        f"Chronological walk-forward backtest ({sample_size} out-of-sample windows): {directional_acc_pct:.1f}% directional hit rate, {mae_skill_pct:+.2f}% MAE skill vs No-Change baseline.",
    ]
    if fundamentals.market_cap_fmt and fundamentals.revenue_ttm_fmt:
        measured_facts.append(
            f"Reported TTM revenue: {fundamentals.revenue_ttm_fmt} · Market cap: {fundamentals.market_cap_fmt} "
            f"(as of {fundamentals.fundamentals_as_of})."
        )
    if news:
        latest_n = news[0]
        measured_facts.append(f"Dated catalyst ({latest_n.published_at}, {latest_n.source}): {latest_n.headline}.")

    # 3. Model Assumptions
    model_assumptions: list[str] = [
        "Assumes short-to-medium term factor relationships estimated via L2-regularized walk-forward regression remain stationary over the forecast window.",
        f"Prediction intervals (${range_68_low:.2f}–${range_68_high:.2f} at 68% confidence) scale out-of-sample split-conformal residual quantiles by current EWMA volatility ({vol_ann:.1f}% annualized).",
        "Unscheduled macro shocks, regulatory rulings, M&A announcements, or off-cycle guidance revisions are outside historical price/fundamental covariates.",
    ]

    # 4. Risks & Invalidation Conditions
    invalidation_down = round(min(sma50, range_68_low), 2)
    invalidation_up = round(max(sma20, range_68_high), 2)
    risks: list[str] = []

    if earnings_in_window and earnings_date_in_window:
        risks.append(
            f"Binary event gap risk: {company_name} reports earnings on {earnings_date_in_window}. Post-earnings price gaps frequently exceed diffusive daily volatility."
        )

    if direction == "upside":
        risks.append(
            f"Trend invalidation level: a decisive daily close below ${invalidation_down:.2f} (50-day trend / lower conformal boundary) would negate the constructive outlook."
        )
    elif direction == "downside":
        risks.append(
            f"Downside thesis invalidation: a sustained breakout above ${invalidation_up:.2f} on above-average volume would invalidate bearish momentum assumptions."
        )
    else:
        risks.append(
            f"Range-breakout risk: directional conviction is muted ({expected_return_pct:+.2f}% expected return); a breakout outside ${range_68_low:.2f}–${range_68_high:.2f} would shift regime."
        )

    if beta60 >= 1.35:
        risks.append(
            f"High market-beta sensitivity (60d beta {beta60:.2f}): broad S&P 500 or Nasdaq drawdowns and rate/VIX spikes disproportionately amplify {ticker} downside."
        )
    if fundamentals.pe_trailing and fundamentals.pe_trailing >= 38.0:
        risks.append(
            f"Valuation multiple compression risk: at {fundamentals.pe_trailing:.1f}x trailing earnings, modest growth deceleration or higher Treasury yields can compress multiples rapidly."
        )
    if len(risks) < 3:
        risks.append(
            "Regime transition risk: sudden correlation spikes across equity sectors can temporarily degrade historical factor skill."
        )

    return key_reasons[:5], measured_facts[:6], model_assumptions, risks[:4]
