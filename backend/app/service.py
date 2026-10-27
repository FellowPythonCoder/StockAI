"""High-level orchestration service combining data retrieval, forecasting, evaluation, and tracking."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from . import MODEL_VERSION
from .evaluation.backtest import HORIZON_SPECS
from .forecasting.engine import generate_horizon_forecast_and_backtest
from .providers.cache import market_cache
from .providers.router import market_router
from .schemas import (
    HorizonCode,
    HorizonForecast,
    HorizonBacktestReport,
    StockAnalysisResponse,
    WatchlistItemOut,
)
from .tracking.store import tracking_store

ALL_HORIZONS: list[HorizonCode] = ["1d", "5d", "21d", "63d", "126d"]


def compute_all_horizons_for_ticker(
    ticker: str,
    force_refresh: bool = False,
) -> tuple[dict[HorizonCode, tuple[HorizonForecast, HorizonBacktestReport]], object, object, object, object]:
    sym = ticker.upper().strip()
    inst = market_router.get_instrument_summary(sym)
    daily_df, prov = market_router.get_daily_series(sym, force_refresh=force_refresh)
    spy_df, _ = market_router.get_daily_series("SPY", force_refresh=False)
    sec_etf, sec_df = market_router.get_sector_benchmark_series(inst.sector)
    fundamentals = market_router.get_fundamentals(sym, daily_df)
    news = market_router.get_news(sym)

    last_bar_dt = str(daily_df["date"].iloc[-1])
    analysis_cache_key = f"quant:{sym}:{last_bar_dt}:{MODEL_VERSION}"

    if not force_refresh:
        cached = market_cache.get(analysis_cache_key)
        if cached:
            return cached[0], inst, daily_df, prov, (fundamentals, news)

    horizon_map: dict[HorizonCode, tuple[HorizonForecast, HorizonBacktestReport]] = {}
    for h_code in ALL_HORIZONS:
        fc, bt = generate_horizon_forecast_and_backtest(
            ticker=sym,
            company_name=inst.name,
            stock_df=daily_df,
            spy_df=spy_df,
            sector_etf=sec_etf,
            sector_df=sec_df,
            fundamentals=fundamentals,
            news=news,
            provenance=prov,
            horizon_code=h_code,
        )
        horizon_map[h_code] = (fc, bt)

    market_cache.set(analysis_cache_key, horizon_map, ttl_seconds=600)
    return horizon_map, inst, daily_df, prov, (fundamentals, news)


def build_stock_analysis(
    ticker: str,
    horizon: HorizonCode = "5d",
    force_refresh: bool = False,
    record_to_ledger: bool = True,
) -> StockAnalysisResponse:
    sym = ticker.upper().strip()
    horizon_map, inst, daily_df, prov, (fundamentals, news) = compute_all_horizons_for_ticker(
        sym, force_refresh=force_refresh
    )

    fc, bt = horizon_map[horizon]

    if record_to_ledger:
        tracking_store.record_live_forecast(fc)
        tracking_store.sync_walk_forward_audit_points(sym, horizon, MODEL_VERSION, bt.recent_walk_forward_points)
        tracking_store.resolve_pending_outcomes(sym, daily_df)

    latest_row = daily_df.iloc[-1]
    prev_row = daily_df.iloc[-2] if len(daily_df) >= 2 else latest_row
    latest_close = round(float(latest_row["close"]), 2)
    prev_close = round(float(prev_row["close"]), 2)
    chg_dollar = round(latest_close - prev_close, 2)
    chg_pct = round((latest_close / prev_close - 1.0) * 100.0, 2) if prev_close > 0 else 0.0

    summary_rows = []
    for hc in ALL_HORIZONS:
        h_fc, h_bt = horizon_map[hc]
        summary_rows.append(
            {
                "horizon_code": hc,
                "horizon_label": h_fc.horizon_label,
                "horizon_days": h_fc.horizon_trading_days,
                "target_date": h_fc.target_date,
                "direction": h_fc.direction,
                "direction_label": h_fc.direction_label,
                "expected_return_pct": h_fc.expected_return_pct,
                "expected_price": h_fc.expected_price,
                "range_68_low": h_fc.range_68_low,
                "range_68_high": h_fc.range_68_high,
                "prob_higher": h_fc.prob_higher,
                "directional_accuracy_pct": h_bt.directional_accuracy_pct,
                "model_mae_pct": h_bt.model_mae_pct,
                "no_change_mae_pct": h_bt.no_change_mae_pct,
            }
        )

    return StockAnalysisResponse(
        instrument=inst,
        latest_price=latest_close,
        previous_close=prev_close,
        change_dollar=chg_dollar,
        change_pct=chg_pct,
        day_high=round(float(latest_row["high"]), 2),
        day_low=round(float(latest_row["low"]), 2),
        day_open=round(float(latest_row["open"]), 2),
        day_volume=int(latest_row["volume"]),
        provenance=prov,
        fundamentals=fundamentals,
        news_developments=news,
        selected_horizon=horizon,
        forecast=fc,
        all_horizons_summary=summary_rows,
        backtest=bt,
    )


def build_watchlist_view(force_refresh: bool = False) -> list[WatchlistItemOut]:
    entries = tracking_store.list_watchlist_entries()
    items: list[WatchlistItemOut] = []
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for entry in entries:
        sym = entry["ticker"]
        pref_h: HorizonCode = entry["preferred_horizon"] if entry["preferred_horizon"] in HORIZON_SPECS else "5d"
        try:
            horizon_map, inst, daily_df, _, _ = compute_all_horizons_for_ticker(sym, force_refresh=force_refresh)
            fc, _ = horizon_map[pref_h]
            latest_c = round(float(daily_df["close"].iloc[-1]), 2)
            prev_c = round(float(daily_df["close"].iloc[-2]), 2) if len(daily_df) >= 2 else latest_c
            chg_p = round((latest_c / prev_c - 1.0) * 100.0, 2)
            spark = [round(float(v), 2) for v in daily_df["close"].tail(25).tolist()]
            items.append(
                WatchlistItemOut(
                    ticker=sym,
                    name=inst.name,
                    sector=inst.sector,
                    position=int(entry["position"]),
                    latest_price=latest_c,
                    change_pct=chg_p,
                    preferred_horizon=pref_h,
                    horizon_label=fc.horizon_label,
                    forecast_direction=fc.direction,
                    direction_label=fc.direction_label,
                    expected_return_pct=fc.expected_return_pct,
                    range_low=fc.range_68_low,
                    range_high=fc.range_68_high,
                    prob_higher=fc.prob_higher,
                    last_analyzed_at=fc.last_updated or now_iso,
                    sparkline=spark,
                )
            )
        except Exception:
            continue
    return items


def seed_initial_audit_history() -> None:
    """Seeds walk-forward verified historical forecasts for core stocks so Forecast History is immediately useful."""
    existing = tracking_store.list_tracked_forecasts(limit=5)
    if existing:
        return
    for sym in ["NVDA", "AAPL", "MSFT", "GOOGL"]:
        try:
            build_stock_analysis(sym, horizon="5d", force_refresh=False, record_to_ledger=True)
        except Exception:
            continue
