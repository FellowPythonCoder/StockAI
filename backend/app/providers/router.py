"""Procedural Market Data Router backed by the Synthetic Market & Random Stock Generator."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
import numpy as np
import pandas as pd

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
from .cache import market_cache
from .catalog import MARKET_INDICES, SECTOR_ETF_BY_SECTOR
from .synthetic_market import synthetic_market


class MarketDataRouter:
    def _build_provenance(self, latest_dt: str) -> DataProvenance:
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return DataProvenance(
            mode="live",
            provider_name="Procedural Candle Engine",
            source_attribution="Stochastic GARCH + Multi-Regime Synthetic Stock Generator",
            as_of_timestamp=latest_dt,
            fetched_at=now_iso,
            market_status="Synthetic Candle Simulator Active",
            is_demo_or_archive=False,
            staleness_warning=None,
            note="100% synthetic generated stocks — advance candles randomly anytime to check if the AI forecast got it right.",
        )

    def search_instruments(self, query: str = "", limit: int = 24) -> list[InstrumentSummary]:
        q = query.strip().upper()
        results: list[tuple[int, InstrumentSummary]] = []
        default_priority = [
            "VELX", "KRNL", "AETH", "NEXO", "SLST", "CYPH", "MRDN", "OBLX", "VRGX", "HLIX", "STRT", "ZENT", "MSX", "QNTX",
        ]

        for ticker, st in synthetic_market.states.items():
            meta = st.meta
            name = meta["name"]
            sector = meta["sector"]
            industry = meta["industry"]
            score = 0
            if not q:
                if ticker in default_priority:
                    score = 100 - default_priority.index(ticker)
                elif meta["asset_type"] == "Equity":
                    score = 150  # Newly generated custom random stocks appear right at the top!
                else:
                    score = 10
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
                            has_intraday=True,
                        ),
                    )
                )

        results.sort(key=lambda item: (-item[0], item[1].ticker))
        return [item[1] for item in results[:limit]]

    def get_instrument_summary(self, ticker: str) -> InstrumentSummary:
        sym = ticker.upper().strip()
        if not synthetic_market.has_instrument(sym):
            # If user types a custom fictional symbol directly, procedurally generate it on the spot!
            if 2 <= len(sym) <= 5 and sym.isalpha():
                sym = synthetic_market.generate_random_stock(custom_ticker=sym)
            else:
                raise KeyError(f"Unknown synthetic stock '{sym}'. Click 'Generate Random Stock' to create one.")
        meta = synthetic_market.get_meta(sym)
        return InstrumentSummary(
            ticker=sym,
            name=meta["name"],
            exchange=meta["exchange"],
            asset_type=meta["asset_type"],
            sector=meta["sector"],
            industry=meta["industry"],
            has_intraday=True,
        )

    def generate_random_stock(
        self,
        regime: str = "random",
        sector: Optional[str] = None,
        custom_ticker: Optional[str] = None,
        custom_name: Optional[str] = None,
    ) -> str:
        ticker = synthetic_market.generate_random_stock(
            regime=regime,
            sector=sector,
            custom_ticker=custom_ticker,
            custom_name=custom_name,
        )
        market_cache.clear()
        return ticker

    def advance_candles(self, ticker: str, steps: int = 5) -> list[CandleBar]:
        sym = ticker.upper().strip()
        raw_added = synthetic_market.advance_candles(sym, steps=steps)
        market_cache.clear()
        full_df = synthetic_market.get_daily_bars(sym)
        enriched = enrich_bars_with_indicators(full_df)
        added_tail = enriched.tail(len(raw_added)) if raw_added else enriched.tail(0)
        return self._df_to_candle_bars(added_tail)

    def get_daily_series(self, ticker: str, force_refresh: bool = False) -> tuple[pd.DataFrame, DataProvenance]:
        sym = ticker.upper().strip()
        if not synthetic_market.has_instrument(sym):
            self.get_instrument_summary(sym)
        df = synthetic_market.get_daily_bars(sym)
        if df.empty:
            raise KeyError(f"Synthetic series unavailable for '{sym}'.")
        latest_dt = str(df["date"].iloc[-1])
        return df, self._build_provenance(latest_dt)

    def get_chart_series(
        self,
        ticker: str,
        timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = "3M",
        force_refresh: bool = False,
    ) -> ChartSeriesResponse:
        sym = ticker.upper().strip()
        daily_df, prov = self.get_daily_series(sym, force_refresh=force_refresh)

        if timeframe in ("1D", "1W"):
            hourly_df = synthetic_market.get_hourly_bars(sym)
            if not hourly_df.empty:
                enriched = enrich_bars_with_indicators(hourly_df)
                sliced = enriched.tail(14) if timeframe == "1D" else enriched.tail(42)
                return ChartSeriesResponse(
                    ticker=sym,
                    timeframe=timeframe,
                    interval="1h",
                    fallback_notice=None,
                    provenance=prov,
                    bars=self._df_to_candle_bars(sliced),
                )

        enriched_daily = enrich_bars_with_indicators(daily_df)
        bars_by_tf = {
            "1D": 14,
            "1W": 15,
            "1M": 26,
            "3M": 66,
            "1Y": 252,
            "5Y": 820,
        }
        n_bars = bars_by_tf.get(timeframe, 66)
        sliced_daily = enriched_daily.tail(n_bars)
        return ChartSeriesResponse(
            ticker=sym,
            timeframe=timeframe,
            interval="1d",
            fallback_notice=None,
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
        f_meta = synthetic_market.get_fundamentals_dict(sym)
        trailing_year = daily_df.tail(252) if len(daily_df) >= 20 else daily_df
        w52_high = round(float(trailing_year["high"].max()), 2)
        w52_low = round(float(trailing_year["low"].min()), 2)
        avg_vol_20 = int(daily_df["volume"].tail(20).mean()) if not daily_df.empty else 0

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
            beta=f_meta.get("beta", 1.0),
            week52_high=w52_high,
            week52_low=w52_low,
            avg_volume_20d=avg_vol_20,
            next_earnings_date=f_meta.get("next_earnings_date"),
            earnings_timing=f_meta.get("earnings_timing"),
            fundamentals_as_of=str(daily_df["date"].iloc[-1])[:10],
        )

    def get_news(self, ticker: str) -> list[NewsDevelopment]:
        sym = ticker.upper().strip()
        raw_news = synthetic_market.get_news_list(sym)
        return [NewsDevelopment(**item) for item in raw_news]

    def get_sector_benchmark_series(self, sector: str) -> tuple[str, pd.DataFrame]:
        etf = SECTOR_ETF_BY_SECTOR.get(sector, "MSX")
        df, _ = self.get_daily_series(etf)
        return etf, df

    def get_market_overview(self, force_refresh: bool = False) -> MarketOverviewResponse:
        _, msx_prov = self.get_daily_series("MSX", force_refresh=force_refresh)

        def build_item(
            sym: str,
            display_sym: str,
            name: str,
            category: Literal["index", "sector", "volatility", "benchmark_etf"],
        ) -> Optional[MarketOverviewItem]:
            df = synthetic_market.get_daily_bars(sym)
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
            cat: Literal["index", "volatility"] = "volatility" if idx_sym == "^SVIX" else "index"
            item = build_item(idx_sym, info["display"], info["name"], cat)
            if item:
                indices.append(item)
                if idx_sym == "^SVIX":
                    vix_val = item.latest_value

        benchmarks: list[MarketOverviewItem] = []
        for b_sym in ["MSX", "QNTX", "INDX"]:
            meta = synthetic_market.get_meta(b_sym)
            item = build_item(b_sym, b_sym, meta["name"], "benchmark_etf")
            if item:
                benchmarks.append(item)

        sectors: list[MarketOverviewItem] = []
        sector_defs = [
            ("SQNT", "Quantum & Compute"),
            ("SNET", "Neural Systems"),
            ("SROB", "Autonomous Robotics"),
            ("SNRG", "Clean Grid & Fusion"),
            ("SBIO", "Programmable Biology"),
            ("SORB", "Orbital Logistics"),
            ("SFIN", "Algorithmic Clearing"),
            ("SMAT", "Metamaterials"),
        ]
        for s_sym, s_label in sector_defs:
            item = build_item(s_sym, s_sym, s_label, "sector")
            if item:
                sectors.append(item)
        sectors.sort(key=lambda x: x.change_pct, reverse=True)

        advancing = sum(1 for s in sectors if s.change_pct > 0)
        msx_item = next((b for b in benchmarks if b.symbol == "MSX"), None)
        msx_1m = msx_item.return_1m_pct if msx_item else 0.0

        if vix_val is not None and vix_val >= 26.0:
            regime_label = "Elevated Synthetic Volatility"
            regime_summary = f"SVIX at {vix_val:.2f} indicates wider stochastic candle swings across synthetic sectors."
        elif msx_1m >= 1.2 and advancing >= 4:
            regime_label = "Constructive Synthetic Uptrend"
            regime_summary = f"{advancing} of {len(sectors)} synthetic sectors advancing; MSX 500 21-candle drift +{msx_1m:.1f}%."
        elif msx_1m <= -1.8:
            regime_label = "Corrective Synthetic Regime"
            regime_summary = f"Broad MSX 500 down {msx_1m:.1f}% over 21 candles; elevated mean-reversion tension."
        else:
            regime_label = "Rotational Synthetic Market"
            regime_summary = f"Dispersion across {len(sectors)} synthetic sectors ({advancing} positive) with SVIX at {vix_val or 18.0:.2f}."

        return MarketOverviewResponse(
            provenance=msx_prov,
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
