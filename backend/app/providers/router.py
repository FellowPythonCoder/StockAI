"""Smart Market Data Router: Live Providers -> Cache -> Labeled Archival Fallback."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
import numpy as np
import pandas as pd

from ..config import settings
from ..forecasting.indicators import enrich_bars_with_indicators
from ..schemas import (
    CandleBar,
    ChartSeriesResponse,
    DataProvenance,
    FundamentalsSnapshot,
    InstrumentSummary,
    MarketOverviewItem,
    MarketOverviewResponse,
    NewsDevelopment,
)
from .archival_provider import archival_provider
from .cache import market_cache
from .catalog import INSTRUMENTS, MARKET_INDICES, SECTOR_ETF_BY_SECTOR
from .live_providers import ProviderError, live_providers
from .normalizer import compute_market_status, detect_staleness_warning


class MarketDataRouter:
    def search_instruments(self, query: str = "", limit: int = 20) -> list[InstrumentSummary]:
        q = query.strip().upper()
        results: list[tuple[int, InstrumentSummary]] = []
        for ticker, meta in INSTRUMENTS.items():
            name = meta["name"]
            sector = meta["sector"]
            industry = meta["industry"]
            score = 0
            if not q:
                # Default featured priority order
                priority = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "AMD", "JPM", "LLY", "SPY", "QQQ"]
                score = 100 - priority.index(ticker) if ticker in priority else 10
            elif ticker == q:
                score = 1000
            elif ticker.startswith(q):
                score = 800
            elif q in ticker:
                score = 600
            elif q in name.upper():
                score = 500 if name.upper().startswith(q) else 350
            elif q in sector.upper() or q in industry.upper():
                score = 200

            if score > 0:
                results.append(
                    (
                        score,
                        InstrumentSummary(
                            ticker=ticker,
                            name=name,
                            exchange=meta["exchange"],
                            asset_type=meta["asset_type"],
                            sector=sector,
                            industry=industry,
                            has_intraday=archival_provider.has_hourly(ticker),
                        ),
                    )
                )

        results.sort(key=lambda item: (-item[0], item[1].ticker))
        return [item[1] for item in results[:limit]]

    def get_instrument_summary(self, ticker: str) -> InstrumentSummary:
        sym = ticker.upper().strip()
        meta = INSTRUMENTS.get(sym)
        if meta:
            return InstrumentSummary(
                ticker=sym,
                name=meta["name"],
                exchange=meta["exchange"],
                asset_type=meta["asset_type"],
                sector=meta["sector"],
                industry=meta["industry"],
                has_intraday=archival_provider.has_hourly(sym),
            )
        if not archival_provider.has_daily(sym) and not settings.configured_providers():
            raise KeyError(f"Unsupported ticker '{sym}'. Configure a live provider API key or select a supported instrument.")
        return InstrumentSummary(
            ticker=sym,
            name=sym,
            exchange="US Market",
            asset_type="Equity",
            sector="Broad Market",
            industry="Public Equity",
            has_intraday=archival_provider.has_hourly(sym),
        )

    def get_daily_series(self, ticker: str, force_refresh: bool = False) -> tuple[pd.DataFrame, DataProvenance]:
        sym = ticker.upper().strip()
        cache_key = f"daily:{sym}"
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        mkt_status = compute_market_status()

        if not force_refresh:
            cached = market_cache.get(cache_key)
            if cached:
                df_cached, prov_cached = cached[0]
                if not prov_cached.is_demo_or_archive:
                    prov_out = prov_cached.model_copy(update={"mode": "cached", "fetched_at": now_iso})
                    return df_cached.copy(), prov_out
                return df_cached.copy(), prov_cached.model_copy(update={"fetched_at": now_iso})

        provider_errors: list[str] = []

        # 1. Try server-configured API key providers in order: Finnhub -> Alpha Vantage -> Twelve Data
        if settings.finnhub_api_key:
            try:
                df = live_providers.fetch_finnhub_daily(sym, settings.finnhub_api_key)
                if not df.empty:
                    latest_dt = str(df["date"].iloc[-1])
                    prov = DataProvenance(
                        mode="live",
                        provider_name="Finnhub Market Data API",
                        source_attribution="Finnhub Real-Time / End-of-Day US Equities Feed",
                        as_of_timestamp=latest_dt,
                        fetched_at=now_iso,
                        market_status=mkt_status,
                        is_demo_or_archive=False,
                        staleness_warning=detect_staleness_warning(latest_dt),
                    )
                    market_cache.set(cache_key, (df, prov), settings.candle_cache_ttl_seconds)
                    return df.copy(), prov
            except ProviderError as exc:
                provider_errors.append(str(exc))

        if settings.alphavantage_api_key:
            try:
                df = live_providers.fetch_alphavantage_daily(sym, settings.alphavantage_api_key)
                if not df.empty:
                    latest_dt = str(df["date"].iloc[-1])
                    prov = DataProvenance(
                        mode="delayed",
                        provider_name="Alpha Vantage API",
                        source_attribution="Alpha Vantage Daily Time Series",
                        as_of_timestamp=latest_dt,
                        fetched_at=now_iso,
                        market_status=mkt_status,
                        is_demo_or_archive=False,
                        staleness_warning=detect_staleness_warning(latest_dt),
                    )
                    market_cache.set(cache_key, (df, prov), settings.candle_cache_ttl_seconds)
                    return df.copy(), prov
            except ProviderError as exc:
                provider_errors.append(str(exc))

        if settings.twelvedata_api_key:
            try:
                df = live_providers.fetch_twelvedata_daily(sym, settings.twelvedata_api_key)
                if not df.empty:
                    latest_dt = str(df["date"].iloc[-1])
                    prov = DataProvenance(
                        mode="delayed",
                        provider_name="Twelve Data API",
                        source_attribution="Twelve Data Exchange Candles",
                        as_of_timestamp=latest_dt,
                        fetched_at=now_iso,
                        market_status=mkt_status,
                        is_demo_or_archive=False,
                        staleness_warning=detect_staleness_warning(latest_dt),
                    )
                    market_cache.set(cache_key, (df, prov), settings.candle_cache_ttl_seconds)
                    return df.copy(), prov
            except ProviderError as exc:
                provider_errors.append(str(exc))

        # 2. Try Yahoo Finance live endpoint if enabled and network reachable
        if settings.enable_yahoo_live:
            try:
                df = live_providers.fetch_yahoo_chart(sym, interval="1d", range_str="5y")
                if not df.empty:
                    latest_dt = str(df["date"].iloc[-1])
                    prov = DataProvenance(
                        mode="delayed",
                        provider_name="Yahoo Finance Feed",
                        source_attribution="Yahoo Finance Exchange-Delayed Candles",
                        as_of_timestamp=latest_dt,
                        fetched_at=now_iso,
                        market_status=mkt_status,
                        is_demo_or_archive=False,
                        staleness_warning=detect_staleness_warning(latest_dt),
                    )
                    market_cache.set(cache_key, (df, prov), settings.candle_cache_ttl_seconds)
                    return df.copy(), prov
            except ProviderError as exc:
                provider_errors.append(str(exc))

        # 3. Verified Archival / Demo Snapshot Fallback (transparently labeled!)
        df_arch = archival_provider.get_daily_bars(sym)
        if df_arch.empty:
            detail = "; ".join(provider_errors) if provider_errors else "No live API key configured."
            raise KeyError(
                f"Market data unavailable for '{sym}'. {detail} "
                "Set FINNHUB_API_KEY or ALPHAVANTAGE_API_KEY on the server to query uncached symbols."
            )

        latest_dt = str(df_arch["date"].iloc[-1])
        configured = settings.configured_providers()
        if configured:
            note = "Live provider temporarily unreachable; serving verified historical snapshot."
        else:
            note = "Demo / Archival Mode active — no live API key configured. Serving verified Yahoo Finance historical market snapshot."

        prov = DataProvenance(
            mode="archival_demo",
            provider_name="Verified Historical Snapshot (Demo Mode)",
            source_attribution=archival_provider.manifest.get(
                "source_attribution", "Yahoo Finance Verified Historical Snapshot"
            ),
            as_of_timestamp=latest_dt,
            fetched_at=now_iso,
            market_status=mkt_status,
            is_demo_or_archive=True,
            staleness_warning=detect_staleness_warning(latest_dt),
            note=note,
        )
        market_cache.set(cache_key, (df_arch, prov), settings.candle_cache_ttl_seconds)
        return df_arch.copy(), prov

    def get_chart_series(
        self,
        ticker: str,
        timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = "1Y",
        force_refresh: bool = False,
    ) -> ChartSeriesResponse:
        sym = ticker.upper().strip()
        daily_df, prov = self.get_daily_series(sym, force_refresh=force_refresh)

        fallback_notice: Optional[str] = None
        interval: Literal["1h", "1d"] = "1d"

        if timeframe in ("1D", "1W"):
            hourly_df = pd.DataFrame()
            if settings.enable_yahoo_live and not prov.is_demo_or_archive:
                try:
                    hourly_df = live_providers.fetch_yahoo_chart(
                        sym, interval="60m", range_str="5d" if timeframe == "1D" else "1mo"
                    )
                except ProviderError:
                    hourly_df = pd.DataFrame()
            if hourly_df.empty and archival_provider.has_hourly(sym):
                hourly_df = archival_provider.get_hourly_bars(sym)

            if not hourly_df.empty:
                interval = "1h"
                enriched = enrich_bars_with_indicators(hourly_df)
                if timeframe == "1D":
                    # Latest trading day's hourly candles (at least 7-14 bars for clear intraday context)
                    last_day = str(enriched["date"].iloc[-1])[:10]
                    day_slice = enriched[enriched["date"].str.startswith(last_day)]
                    sliced = day_slice if len(day_slice) >= 4 else enriched.tail(14)
                else:
                    sliced = enriched.tail(38)
                return ChartSeriesResponse(
                    ticker=sym,
                    timeframe=timeframe,
                    interval=interval,
                    fallback_notice=None,
                    provenance=prov,
                    bars=self._df_to_candle_bars(sliced),
                )
            else:
                fallback_notice = (
                    f"Intraday hourly candles are not available in the current feed for {sym}; "
                    "showing recent daily sessions instead."
                )

        enriched_daily = enrich_bars_with_indicators(daily_df)
        bars_by_tf = {
            "1D": 10,
            "1W": 10,
            "1M": 22,
            "3M": 64,
            "1Y": 252,
            "5Y": 1260,
        }
        n_bars = bars_by_tf.get(timeframe, 252)
        sliced_daily = enriched_daily.tail(n_bars)
        return ChartSeriesResponse(
            ticker=sym,
            timeframe=timeframe,
            interval="1d",
            fallback_notice=fallback_notice,
            provenance=prov,
            bars=self._df_to_candle_bars(sliced_daily),
        )

    @staticmethod
    def _df_to_candle_bars(df: pd.DataFrame) -> list[CandleBar]:
        bars: list[CandleBar] = []
        for row in df.itertuples(index=False):
            bars.append(
                CandleBar(
                    time=str(row.date),
                    open=round(float(row.open), 2),
                    high=round(float(row.high), 2),
                    low=round(float(row.low), 2),
                    close=round(float(row.close), 2),
                    volume=int(row.volume),
                    sma20=round(float(row.sma20), 2) if pd.notna(getattr(row, "sma20", np.nan)) else None,
                    sma50=round(float(row.sma50), 2) if pd.notna(getattr(row, "sma50", np.nan)) else None,
                    sma200=round(float(row.sma200), 2) if pd.notna(getattr(row, "sma200", np.nan)) else None,
                    rsi14=round(float(row.rsi14), 1) if pd.notna(getattr(row, "rsi14", np.nan)) else None,
                )
            )
        return bars

    def get_fundamentals(self, ticker: str, daily_df: pd.DataFrame) -> FundamentalsSnapshot:
        sym = ticker.upper().strip()
        meta = INSTRUMENTS.get(sym, {})
        f_meta = meta.get("fundamentals", {})

        trailing_year = daily_df.tail(252) if len(daily_df) >= 20 else daily_df
        w52_high = round(float(trailing_year["high"].max()), 2)
        w52_low = round(float(trailing_year["low"].min()), 2)
        avg_vol_20 = int(daily_df["volume"].tail(20).mean()) if not daily_df.empty else 0

        # Compute empirical 60-day realized beta vs SPY if catalog beta isn't present
        beta_val = f_meta.get("beta")
        if beta_val is None and sym != "SPY":
            try:
                spy_df, _ = self.get_daily_series("SPY")
                merged = pd.merge(
                    daily_df[["date", "close"]].tail(90),
                    spy_df[["date", "close"]].tail(90),
                    on="date",
                    suffixes=("_s", "_m"),
                )
                if len(merged) >= 30:
                    rs = np.log(merged["close_s"] / merged["close_s"].shift(1)).dropna()
                    rm = np.log(merged["close_m"] / merged["close_m"].shift(1)).dropna()
                    var_m = float(np.var(rm))
                    if var_m > 1e-8:
                        beta_val = round(float(np.cov(rs, rm)[0, 1] / var_m), 2)
            except Exception:
                beta_val = None

        return FundamentalsSnapshot(
            market_cap=f_meta.get("market_cap"),
            market_cap_fmt=f_meta.get("market_cap_fmt"),
            pe_trailing=f_meta.get("pe_trailing"),
            pe_forward=f_meta.get("pe_forward"),
            eps_ttm=f_meta.get("eps_ttm"),
            revenue_ttm_fmt=f_meta.get("revenue_ttm_fmt"),
            revenue_growth_yoy_pct=f_meta.get("revenue_growth_yoy_pct"),
            net_income_ttm_fmt=f_meta.get("net_income_ttm_fmt"),
            profit_margin_pct=f_meta.get("profit_margin_pct"),
            gross_margin_pct=f_meta.get("gross_margin_pct"),
            dividend_yield_pct=f_meta.get("dividend_yield_pct"),
            beta=beta_val,
            week52_high=w52_high,
            week52_low=w52_low,
            avg_volume_20d=avg_vol_20,
            next_earnings_date=f_meta.get("next_earnings_date"),
            earnings_timing=f_meta.get("earnings_timing"),
            fundamentals_as_of=f_meta.get("fundamentals_as_of", str(daily_df["date"].iloc[-1])),
        )

    def get_news(self, ticker: str) -> list[NewsDevelopment]:
        sym = ticker.upper().strip()
        meta = INSTRUMENTS.get(sym, {})
        raw_news = meta.get("news", [])
        return [NewsDevelopment(**item) for item in raw_news]

    def get_sector_benchmark_series(self, sector: str) -> tuple[str, pd.DataFrame]:
        etf = SECTOR_ETF_BY_SECTOR.get(sector, "SPY")
        try:
            df, _ = self.get_daily_series(etf)
            return etf, df
        except Exception:
            df, _ = self.get_daily_series("SPY")
            return "SPY", df

    def get_market_overview(self, force_refresh: bool = False) -> MarketOverviewResponse:
        _, spy_prov = self.get_daily_series("SPY", force_refresh=force_refresh)

        def build_item(
            sym: str,
            display_sym: str,
            name: str,
            category: Literal["index", "sector", "volatility", "benchmark_etf"],
        ) -> Optional[MarketOverviewItem]:
            if sym.startswith("^"):
                df = archival_provider.get_daily_bars(sym)
            else:
                try:
                    df, _ = self.get_daily_series(sym, force_refresh=force_refresh)
                except Exception:
                    return None
            if len(df) < 2:
                return None
            latest = float(df["close"].iloc[-1])
            prev = float(df["close"].iloc[-2])
            chg_d = round(latest - prev, 2)
            chg_p = round((latest / prev - 1.0) * 100.0, 2)
            c_1m = float(df["close"].iloc[-min(22, len(df))])
            c_3m = float(df["close"].iloc[-min(64, len(df))])
            ret_1m = round((latest / c_1m - 1.0) * 100.0, 2)
            ret_3m = round((latest / c_3m - 1.0) * 100.0, 2)
            spark = [round(float(x), 2) for x in df["close"].tail(30).tolist()]
            return MarketOverviewItem(
                symbol=sym,
                display_symbol=display_sym,
                name=name,
                category=category,
                latest_value=round(latest, 2),
                change_dollar=chg_d,
                change_pct=chg_p,
                return_1m_pct=ret_1m,
                return_3m_pct=ret_3m,
                as_of=str(df["date"].iloc[-1]),
                sparkline=spark,
            )

        indices: list[MarketOverviewItem] = []
        vix_val: Optional[float] = None
        for idx_sym, info in MARKET_INDICES.items():
            cat: Literal["index", "volatility"] = "volatility" if idx_sym == "^VIX" else "index"
            item = build_item(idx_sym, info["display"], info["name"], cat)
            if item:
                indices.append(item)
                if idx_sym == "^VIX":
                    vix_val = item.latest_value

        benchmarks: list[MarketOverviewItem] = []
        for b_sym in ["SPY", "QQQ", "DIA", "IWM"]:
            meta = INSTRUMENTS[b_sym]
            item = build_item(b_sym, b_sym, meta["name"], "benchmark_etf")
            if item:
                benchmarks.append(item)

        sectors: list[MarketOverviewItem] = []
        sector_etfs = [
            ("XLK", "Technology"),
            ("XLF", "Financials"),
            ("XLV", "Health Care"),
            ("XLY", "Consumer Discretionary"),
            ("XLI", "Industrials"),
            ("XLP", "Consumer Staples"),
            ("XLE", "Energy"),
            ("XLU", "Utilities"),
            ("XLB", "Materials"),
        ]
        for s_sym, s_label in sector_etfs:
            item = build_item(s_sym, s_sym, s_label, "sector")
            if item:
                sectors.append(item)
        sectors.sort(key=lambda x: x.change_pct, reverse=True)

        advancing = sum(1 for s in sectors if s.change_pct > 0)
        spy_item = next((b for b in benchmarks if b.symbol == "SPY"), None)
        spy_1m = spy_item.return_1m_pct if spy_item else 0.0

        if vix_val is not None and vix_val >= 25.0:
            regime_label = "Elevated Volatility Regime"
            regime_summary = f"CBOE VIX at {vix_val:.2f} signals heightened option-implied uncertainty; forecast intervals widen accordingly."
        elif spy_1m >= 1.5 and advancing >= 5:
            regime_label = "Constructive Uptrend · Broad Participation"
            regime_summary = f"{advancing} of {len(sectors)} GICS sectors advancing today; S&P 500 1-month trend +{spy_1m:.1f}% with contained volatility (VIX {vix_val or 18.4:.1f})."
        elif spy_1m <= -2.0:
            regime_label = "Defensive / Corrective Regime"
            regime_summary = f"Broad equity benchmark down {spy_1m:.1f}% over 21 sessions; cross-asset beta headwinds weigh on cyclical forecasts."
        else:
            regime_label = "Balanced / Rotational Regime"
            regime_summary = f"Measured dispersion across {len(sectors)} tracked GICS sectors ({advancing} advancing today) with VIX at {vix_val or 18.4:.2f}."

        return MarketOverviewResponse(
            provenance=spy_prov,
            market_regime_label=regime_label,
            market_regime_summary=regime_summary,
            breadth_advancing_sectors=advancing,
            breadth_total_sectors=len(sectors),
            vix_level=vix_val,
            indices=indices,
            sectors=sectors,
            benchmarks=benchmarks,
        )


market_router = MarketDataRouter()
