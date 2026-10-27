"""Procedural Synthetic Market & Stochastic Candlestick Progression Engine.

Generates realistic multi-regime GARCH(1,1) + institutional order-flow waves + mean-reversion
OHLCV candlesticks, coherent fundamentals, dated catalysts, and genuine random future
candle progression so users can test AI predictions live and verify whether the AI was correct.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
import math
import random
from typing import Any, Optional

import numpy as np
import pandas as pd

from .catalog import (
    INITIAL_SYNTHETIC_STOCKS,
    SECTOR_ETF_BY_SECTOR,
    make_unique_fictional_company,
)
from .normalizer import advance_trading_days, is_nyse_trading_day


def _build_trading_calendar(end_iso: str = "2026-10-26", count: int = 820) -> list[str]:
    cur = date.fromisoformat(end_iso)
    days: list[str] = []
    while len(days) < count:
        if is_nyse_trading_day(cur):
            days.append(cur.isoformat())
        cur -= timedelta(days=1)
    days.reverse()
    return days


REGIME_PARAMS: dict[str, dict[str, float]] = {
    "momentum_up": {
        "drift": 0.0009,
        "mom": 0.52,
        "mean_rev": 0.03,
        "flow_persist": 0.93,
        "flow_amp": 0.0068,
        "base_vol": 0.0095,
    },
    "mean_reverting": {
        "drift": 0.0001,
        "mom": -0.25,
        "mean_rev": 0.78,
        "flow_persist": 0.70,
        "flow_amp": 0.0012,
        "base_vol": 0.0092,
    },
    "high_vol": {
        "drift": 0.0006,
        "mom": 0.48,
        "mean_rev": 0.05,
        "flow_persist": 0.92,
        "flow_amp": 0.0095,
        "base_vol": 0.0145,
    },
    "turnaround": {
        "drift": -0.0006,
        "mom": 0.50,
        "mean_rev": 0.04,
        "flow_persist": 0.93,
        "flow_amp": 0.0072,
        "base_vol": 0.0110,
    },
    "downtrend": {
        "drift": -0.0009,
        "mom": 0.50,
        "mean_rev": 0.04,
        "flow_persist": 0.93,
        "flow_amp": 0.0068,
        "base_vol": 0.0105,
    },
}


@dataclass
class SyntheticInstrumentState:
    ticker: str
    meta: dict[str, Any]
    rng: random.Random
    daily_df: pd.DataFrame
    hourly_df: pd.DataFrame
    sigma: float
    latent_drift: float
    flow_state: float
    mom_coeff: float
    mean_rev_coeff: float
    flow_persist: float
    flow_amp: float
    base_vol: float
    avg_volume: int
    last_clv: float = 0.0
    fundamentals: dict[str, Any] = field(default_factory=dict)
    news: list[dict[str, Any]] = field(default_factory=list)


class SyntheticMarketEngine:
    def __init__(self) -> None:
        self._master_rng = random.Random()
        self._calendar = _build_trading_calendar("2026-10-26", count=820)
        self.states: dict[str, SyntheticInstrumentState] = {}
        self.index_dfs: dict[str, pd.DataFrame] = {}
        self._init_universe()

    def _simulate_single_candle(
        self,
        rng: random.Random,
        prev_close: float,
        recent_closes: list[float],
        sigma: float,
        latent_drift: float,
        flow_state: float,
        mom_coeff: float,
        mean_rev_coeff: float,
        flow_persist: float,
        flow_amp: float,
        base_vol: float,
        avg_volume: int,
        last_clv: float = 0.0,
        mkt_ret: float = 0.0,
        beta: float = 1.0,
    ) -> tuple[float, float, float, float, int, float, float, float, float]:
        # Smooth regime drift & institutional accumulation/distribution wave (AR(1) latent order flow)
        if rng.random() < 0.012:
            latent_drift = max(-0.0016, min(0.0018, 0.92 * latent_drift + rng.gauss(0.0, 0.00035)))

        # Evolve multi-week institutional order-flow wave (observable by AI ONLY via candle wicks, volume & momentum!)
        flow_innov = rng.gauss(0.0, math.sqrt(max(0.04, 1.0 - flow_persist ** 2)))
        next_flow = max(-2.2, min(2.2, flow_persist * flow_state + flow_innov))

        ret_5 = math.log(prev_close / recent_closes[-5]) / 5.0 if len(recent_closes) >= 5 else 0.0
        ret_15 = math.log(prev_close / recent_closes[-15]) / 15.0 if len(recent_closes) >= 15 else ret_5
        ma_20 = sum(recent_closes[-20:]) / len(recent_closes[-20:]) if recent_closes else prev_close
        z_ext = math.log(prev_close / ma_20) / max(sigma * math.sqrt(20.0), 0.008)

        # Genuine random market shock (Gaussian + occasional fat-tail surprise)
        z_shock = rng.gauss(0.0, 1.0)
        if rng.random() < 0.035:
            z_shock *= rng.uniform(1.30, 1.80)

        trend_anchor = 0.70 * ret_5 + 0.30 * ret_15
        clv_pressure = 0.0016 * last_clv * (1.0 if mom_coeff >= 0 else -0.6)

        expected_step = (
            latent_drift
            + flow_amp * flow_state
            + mom_coeff * trend_anchor
            - mean_rev_coeff * 0.022 * max(-2.6, min(2.6, z_ext))
            + clv_pressure
            + 0.22 * beta * mkt_ret
        )
        log_ret = max(-0.11, min(0.11, expected_step + sigma * z_shock))

        gap = sigma * 0.22 * rng.gauss(0.0, 1.0)
        open_p = max(2.0, prev_close * math.exp(gap))
        close_p = max(2.0, prev_close * math.exp(log_ret))

        body_top = max(open_p, close_p)
        body_bot = min(open_p, close_p)
        wick_scale = sigma * prev_close * rng.uniform(0.28, 0.90)

        # Institutional order-flow leaves subtle intrabar wick footprints (buying support vs upper rejection)
        bullish_flow = (flow_state + (1.0 if log_ret >= 0 else -1.0) * 0.5) >= 0
        up_wick_bias = 0.32 if bullish_flow else 0.72
        dn_wick_bias = 0.72 if bullish_flow else 0.32
        high_p = body_top + abs(rng.gauss(up_wick_bias, 0.25)) * wick_scale
        low_p = max(1.0, body_bot - abs(rng.gauss(dn_wick_bias, 0.25)) * wick_scale)

        o_r = round(open_p, 2)
        c_r = round(close_p, 2)
        h_r = round(max(high_p, o_r, c_r), 2)
        l_r = round(min(low_p, o_r, c_r), 2)

        hl_span = max(0.01, h_r - l_r)
        new_clv = max(-1.0, min(1.0, ((c_r - l_r) - (h_r - c_r)) / hl_span))

        # GARCH(1,1) conditional volatility update
        omega = 0.08 * (base_vol ** 2)
        next_var = omega + 0.09 * (log_ret ** 2) + 0.83 * (sigma ** 2)
        next_sigma = max(0.005, min(0.048, math.sqrt(next_var)))

        # Volume expands with institutional flow conviction & return magnitude
        flow_intensity = min(2.4, abs(flow_state) * 0.45 + abs(log_ret) / max(sigma, 0.006) * 0.35)
        vol_mult = math.exp(0.42 * flow_intensity + rng.gauss(0.0, 0.20))
        volume = max(50_000, int(avg_volume * vol_mult * 0.68))

        return (o_r, h_r, l_r, c_r, volume, next_sigma, latent_drift, next_flow, new_clv)

    def _build_hourly_from_daily(self, daily_df: pd.DataFrame, rng: random.Random) -> pd.DataFrame:
        tail = daily_df.tail(14)
        hours = ["09:30:00", "10:30:00", "11:30:00", "12:30:00", "13:30:00", "14:30:00", "15:30:00"]
        rows: list[dict[str, Any]] = []
        for r in tail.itertuples(index=False):
            d_str = str(r.date)[:10]
            o_day, h_day, l_day, c_day, v_day = float(r.open), float(r.high), float(r.low), float(r.close), int(r.volume)
            pts = [o_day]
            for k in range(1, 7):
                frac = k / 7.0
                interp = o_day + frac * (c_day - o_day)
                wiggle = (h_day - l_day) * 0.18 * rng.gauss(0.0, 1.0)
                pts.append(max(l_day, min(h_day, interp + wiggle)))
            pts.append(c_day)

            for k, hr in enumerate(hours):
                ho = round(pts[k], 2)
                hc = round(pts[k + 1], 2)
                span = max(0.04, (h_day - l_day) * rng.uniform(0.12, 0.28))
                hh = round(min(h_day, max(ho, hc) + span * 0.5), 2)
                hl = round(max(l_day, min(ho, hc) - span * 0.5), 2)
                if k == 2:
                    hh = max(hh, round(h_day, 2))
                if k == 4:
                    hl = min(hl, round(l_day, 2))
                hv = max(5_000, int((v_day / 7.0) * rng.uniform(0.7, 1.35)))
                rows.append(
                    {
                        "date": f"{d_str} {hr}",
                        "open": ho,
                        "high": max(hh, ho, hc),
                        "low": min(hl, ho, hc),
                        "close": hc,
                        "volume": hv,
                    }
                )
        return pd.DataFrame(rows)

    def _synthesize_fundamentals_and_news(
        self,
        ticker: str,
        meta: dict[str, Any],
        daily_df: pd.DataFrame,
        rng: random.Random,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        last_close = float(daily_df["close"].iloc[-1])
        last_date = str(daily_df["date"].iloc[-1])[:10]
        if meta["asset_type"] != "Equity":
            return ({"fundamentals_as_of": last_date}, [])

        c_252 = float(daily_df["close"].iloc[-min(252, len(daily_df))])
        yoy_price_ret = (last_close / max(1.0, c_252) - 1.0) * 100.0

        shares_b = rng.uniform(0.35, 4.2)
        mcap = last_close * shares_b * 1e9
        mcap_fmt = f"${mcap / 1e12:.2f}T" if mcap >= 1e12 else f"${mcap / 1e9:.1f}B"

        rev_growth = round(max(-8.0, min(68.0, 14.0 + 0.35 * yoy_price_ret + rng.uniform(-6.0, 10.0))), 1)
        gross_margin = round(rng.uniform(44.0, 78.0), 1)
        profit_margin = round(rng.uniform(11.0, min(42.0, gross_margin - 14.0)), 1)
        pe_trailing = round(max(12.5, min(64.0, 22.0 + 0.42 * max(0.0, rev_growth) + rng.uniform(-4.0, 6.0))), 2)
        pe_forward = round(pe_trailing * rng.uniform(0.80, 0.94), 2)
        eps_ttm = round(last_close / pe_trailing, 2)
        net_inc_b = (mcap / pe_trailing) / 1e9
        rev_b = net_inc_b / max(0.06, profit_margin / 100.0)
        div_yield = round(rng.uniform(0.0, 1.4), 2) if rng.random() < 0.55 else 0.0
        beta = round(rng.uniform(0.75, 1.55), 2)

        next_earn = advance_trading_days(last_date, rng.randint(10, 42))

        fundamentals = {
            "market_cap": mcap,
            "market_cap_fmt": mcap_fmt,
            "pe_trailing": pe_trailing,
            "pe_forward": pe_forward,
            "eps_ttm": eps_ttm,
            "revenue_ttm_fmt": f"${rev_b:.2f}B",
            "revenue_growth_yoy_pct": rev_growth,
            "net_income_ttm_fmt": f"${net_inc_b:.2f}B",
            "profit_margin_pct": profit_margin,
            "gross_margin_pct": gross_margin,
            "dividend_yield_pct": div_yield,
            "beta": beta,
            "next_earnings_date": next_earn,
            "earnings_timing": rng.choice(["After Market Close", "Before Market Open"]),
            "fundamentals_as_of": last_date,
        }

        c_21 = float(daily_df["close"].iloc[-min(21, len(daily_df))])
        ret_21 = (last_close / max(1.0, c_21) - 1.0) * 100.0
        d1 = str(daily_df["date"].iloc[-2])[:10] if len(daily_df) >= 2 else last_date
        d2 = str(daily_df["date"].iloc[-7])[:10] if len(daily_df) >= 7 else last_date

        news = [
            {
                "published_at": d1,
                "headline": (
                    f"{meta['name']} ({ticker}) expands {meta['industry'].lower()} capacity as 21-candle move hits {ret_21:+.1f}%"
                ),
                "summary": (
                    f"Synthetic exchange filings show {meta['name']} scaling next-generation {meta['sector'].lower()} "
                    f"deployments with TTM revenue pace at {fundamentals['revenue_ttm_fmt']} ({rev_growth:+.1f}% YoY)."
                ),
                "source": "SYNTH-WIRE Dispatch",
                "category": "product",
                "sentiment_tag": "positive" if ret_21 >= 0 else "neutral",
            },
            {
                "published_at": d2,
                "headline": f"Quarterly synthetic earnings check scheduled for {next_earn}",
                "summary": (
                    f"Quantitative desks are tracking gross margin stability ({gross_margin:.1f}%) and volume "
                    f"participation ahead of {ticker}'s upcoming synthetic reporting window."
                ),
                "source": "SYNTH Calendar",
                "category": "earnings",
                "sentiment_tag": "neutral",
            },
        ]
        return fundamentals, news

    def _create_instrument_state(
        self,
        ticker: str,
        meta: dict[str, Any],
        calendar: list[str],
        msx_returns: Optional[dict[str, float]] = None,
    ) -> SyntheticInstrumentState:
        rng = random.Random(int(meta["seed"]))
        reg = REGIME_PARAMS.get(meta.get("regime", "momentum_up"), REGIME_PARAMS["momentum_up"])
        price = float(meta.get("base_price", 120.0))
        sigma = reg["base_vol"]
        latent_drift = reg["drift"]
        flow_state = rng.uniform(-0.8, 0.8)
        mom_coeff = reg["mom"]
        mean_rev_coeff = reg["mean_rev"]
        flow_persist = reg["flow_persist"]
        flow_amp = reg["flow_amp"]
        avg_vol = rng.randint(1_800_000, 28_000_000)
        beta = rng.uniform(0.75, 1.45) if meta["asset_type"] == "Equity" else 1.0
        clv = 0.0

        rows: list[dict[str, Any]] = []
        recent_closes: list[float] = [price]

        for idx, dt in enumerate(calendar):
            if meta.get("regime") == "turnaround" and idx == int(len(calendar) * 0.56):
                latent_drift = 0.0016
                flow_state = 0.75

            mkt_r = msx_returns.get(dt, 0.0) if msx_returns else 0.0
            o, h, l, c, v, sigma, latent_drift, flow_state, clv = self._simulate_single_candle(
                rng=rng,
                prev_close=recent_closes[-1],
                recent_closes=recent_closes[-30:],
                sigma=sigma,
                latent_drift=latent_drift,
                flow_state=flow_state,
                mom_coeff=mom_coeff,
                mean_rev_coeff=mean_rev_coeff,
                flow_persist=flow_persist,
                flow_amp=flow_amp,
                base_vol=reg["base_vol"],
                avg_volume=avg_vol,
                last_clv=clv,
                mkt_ret=mkt_r,
                beta=beta,
            )
            recent_closes.append(c)
            rows.append({"date": dt, "open": o, "high": h, "low": l, "close": c, "volume": v})

        daily_df = pd.DataFrame(rows)
        # Scale historical path by a single constant factor (preserving 100% of exact log-returns & ratios!)
        # so initial spot prices on 2026-10-26 sit in realistic $38-$460 trading ranges.
        raw_end = float(daily_df["close"].iloc[-1])
        target_spot = float(meta.get("base_price", 120.0)) * rng.uniform(0.88, 1.38)
        if raw_end > 0 and (raw_end > 520.0 or raw_end < 28.0):
            scale_k = target_spot / raw_end
            for col in ("open", "high", "low", "close"):
                daily_df[col] = (daily_df[col].astype(float) * scale_k).round(2)
            daily_df["high"] = daily_df[["open", "high", "close"]].max(axis=1)
            daily_df["low"] = daily_df[["open", "low", "close"]].min(axis=1)

        hourly_df = self._build_hourly_from_daily(daily_df, rng)
        fundamentals, news = self._synthesize_fundamentals_and_news(ticker, meta, daily_df, rng)

        live_rng = random.Random()
        return SyntheticInstrumentState(
            ticker=ticker,
            meta=meta,
            rng=live_rng,
            daily_df=daily_df,
            hourly_df=hourly_df,
            sigma=sigma,
            latent_drift=latent_drift,
            flow_state=flow_state,
            mom_coeff=mom_coeff,
            mean_rev_coeff=mean_rev_coeff,
            flow_persist=flow_persist,
            flow_amp=flow_amp,
            base_vol=reg["base_vol"],
            avg_volume=avg_vol,
            last_clv=clv,
            fundamentals=fundamentals,
            news=news,
        )

    def _rebuild_synthetic_indices(self) -> None:
        msx_df = self.states["MSX"].daily_df
        qnt_df = self.states["QNTX"].daily_df
        ind_df = self.states["INDX"].daily_df

        def scale_df(df: pd.DataFrame, mult: float) -> pd.DataFrame:
            out = df.copy()
            for col in ("open", "high", "low", "close"):
                out[col] = (out[col] * mult).round(2)
            return out

        self.index_dfs["^MSX500"] = scale_df(msx_df, 18.5)
        self.index_dfs["^QNT100"] = scale_df(qnt_df, 56.0)
        self.index_dfs["^IND30"] = scale_df(ind_df, 125.0)

        closes = msx_df["close"].astype(float)
        lr = np.log(closes / closes.shift(1)).fillna(0.0)
        vix_close = (lr.ewm(alpha=0.08, adjust=False).std() * math.sqrt(252.0) * 100.0 * 1.15).clip(11.5, 58.0)
        svix_df = pd.DataFrame(
            {
                "date": msx_df["date"],
                "open": vix_close.shift(1).fillna(vix_close).round(2),
                "high": (vix_close * 1.045).round(2),
                "low": (vix_close * 0.955).round(2),
                "close": vix_close.round(2),
                "volume": 0,
            }
        )
        self.index_dfs["^SVIX"] = svix_df

    def _init_universe(self) -> None:
        msx_meta = dict(INITIAL_SYNTHETIC_STOCKS["MSX"])
        msx_state = self._create_instrument_state("MSX", msx_meta, self._calendar, msx_returns=None)
        self.states["MSX"] = msx_state

        msx_c = msx_state.daily_df["close"].astype(float).tolist()
        msx_d = msx_state.daily_df["date"].tolist()
        msx_rets = {
            msx_d[i]: (math.log(msx_c[i] / msx_c[i - 1]) if i > 0 else 0.0) for i in range(len(msx_d))
        }

        for sym, meta in INITIAL_SYNTHETIC_STOCKS.items():
            if sym == "MSX":
                continue
            self.states[sym] = self._create_instrument_state(sym, dict(meta), self._calendar, msx_returns=msx_rets)

        self._rebuild_synthetic_indices()

    def generate_random_stock(
        self,
        regime: str = "random",
        sector: Optional[str] = None,
        custom_ticker: Optional[str] = None,
        custom_name: Optional[str] = None,
    ) -> str:
        meta = make_unique_fictional_company(
            existing_tickers=set(self.states.keys()),
            rng=self._master_rng,
            sector=sector,
            custom_ticker=custom_ticker,
            custom_name=custom_name,
            regime=regime,
        )
        ticker = meta["ticker"]
        msx_df = self.states["MSX"].daily_df
        cal = msx_df["date"].tolist()
        msx_c = msx_df["close"].astype(float).tolist()
        msx_rets = {cal[i]: (math.log(msx_c[i] / msx_c[i - 1]) if i > 0 else 0.0) for i in range(len(cal))}

        self.states[ticker] = self._create_instrument_state(ticker, meta, cal, msx_returns=msx_rets)
        return ticker

    def _advance_single_state_to_dates(
        self,
        st: SyntheticInstrumentState,
        new_dates: list[str],
        msx_step_rets: Optional[dict[str, float]] = None,
    ) -> list[dict[str, Any]]:
        closes = st.daily_df["close"].astype(float).tolist()
        beta = float(st.fundamentals.get("beta") or 1.0)
        added_rows: list[dict[str, Any]] = []
        for dt in new_dates:
            if dt <= str(st.daily_df["date"].iloc[-1]):
                continue
            mkt_r = msx_step_rets.get(dt, 0.0) if msx_step_rets else 0.0
            o, h, l, c, v, st.sigma, st.latent_drift, st.flow_state, st.last_clv = self._simulate_single_candle(
                rng=st.rng,
                prev_close=closes[-1],
                recent_closes=closes[-30:],
                sigma=st.sigma,
                latent_drift=st.latent_drift,
                flow_state=st.flow_state,
                mom_coeff=st.mom_coeff,
                mean_rev_coeff=st.mean_rev_coeff,
                flow_persist=st.flow_persist,
                flow_amp=st.flow_amp,
                base_vol=st.base_vol,
                avg_volume=st.avg_volume,
                last_clv=st.last_clv,
                mkt_ret=mkt_r,
                beta=beta,
            )
            closes.append(c)
            row = {"date": dt, "open": o, "high": h, "low": l, "close": c, "volume": v}
            added_rows.append(row)

        if added_rows:
            st.daily_df = pd.concat([st.daily_df, pd.DataFrame(added_rows)], ignore_index=True)
            st.hourly_df = self._build_hourly_from_daily(st.daily_df, st.rng)
            if st.meta["asset_type"] == "Equity":
                st.fundamentals["fundamentals_as_of"] = str(st.daily_df["date"].iloc[-1])[:10]
        return added_rows

    def advance_candles(self, ticker: str, steps: int = 5) -> list[dict[str, Any]]:
        sym = ticker.upper().strip()
        if sym not in self.states:
            raise KeyError(f"Unknown synthetic stock '{sym}'")

        st = self.states[sym]
        last_dt = str(st.daily_df["date"].iloc[-1])[:10]
        new_dates: list[str] = []
        cur_dt = last_dt
        for _ in range(steps):
            cur_dt = advance_trading_days(cur_dt, 1)
            new_dates.append(cur_dt)

        msx_st = self.states["MSX"]
        msx_added = self._advance_single_state_to_dates(msx_st, new_dates, msx_step_rets=None)
        msx_c = msx_st.daily_df["close"].astype(float).tolist()
        msx_d = msx_st.daily_df["date"].tolist()
        msx_rets = {msx_d[i]: (math.log(msx_c[i] / msx_c[i - 1]) if i > 0 else 0.0) for i in range(len(msx_d))}

        for bench_sym in ("QNTX", "INDX"):
            if bench_sym != sym:
                self._advance_single_state_to_dates(self.states[bench_sym], new_dates, msx_step_rets=msx_rets)

        sec_etf = SECTOR_ETF_BY_SECTOR.get(st.meta["sector"])
        if sec_etf and sec_etf in self.states and sec_etf != sym:
            self._advance_single_state_to_dates(self.states[sec_etf], new_dates, msx_step_rets=msx_rets)

        self._rebuild_synthetic_indices()

        if sym == "MSX":
            return msx_added
        return self._advance_single_state_to_dates(st, new_dates, msx_step_rets=msx_rets)

    def has_instrument(self, ticker: str) -> bool:
        return ticker.upper().strip() in self.states

    def get_meta(self, ticker: str) -> dict[str, Any]:
        return self.states[ticker.upper().strip()].meta

    def get_daily_bars(self, symbol: str) -> pd.DataFrame:
        sym = symbol.upper().strip()
        if sym in self.index_dfs:
            return self.index_dfs[sym].copy()
        if sym in self.states:
            return self.states[sym].daily_df.copy()
        return pd.DataFrame()

    def get_hourly_bars(self, symbol: str) -> pd.DataFrame:
        sym = symbol.upper().strip()
        if sym in self.states:
            return self.states[sym].hourly_df.copy()
        return pd.DataFrame()

    def get_fundamentals_dict(self, symbol: str) -> dict[str, Any]:
        sym = symbol.upper().strip()
        if sym in self.states:
            return dict(self.states[sym].fundamentals)
        return {}

    def get_news_list(self, symbol: str) -> list[dict[str, Any]]:
        sym = symbol.upper().strip()
        if sym in self.states:
            return list(self.states[sym].news)
        return []


synthetic_market = SyntheticMarketEngine()
