"""Live financial market data provider adapters (Finnhub, Alpha Vantage, Twelve Data, Yahoo Finance).

Secret API keys remain strictly server-side and are passed via headers or server-only query params.
Includes a fast network circuit-breaker so offline/isolated sandboxes fail over gracefully without delay.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import time
from typing import Optional
import httpx
import pandas as pd

from ..config import settings
from .cache import provider_limiters
from .normalizer import normalize_ohlcv_dataframe


class ProviderError(Exception):
    pass


class LiveMarketProviders:
    def __init__(self) -> None:
        self._yahoo_circuit_open_until: float = 0.0

    def fetch_finnhub_daily(self, ticker: str, api_key: str) -> pd.DataFrame:
        if not api_key:
            raise ProviderError("FINNHUB_API_KEY not configured")
        if not provider_limiters["finnhub"].allow_request():
            raise ProviderError("Finnhub rate limit guard active")

        now_ts = int(datetime.now(timezone.utc).timestamp())
        start_ts = int((datetime.now(timezone.utc) - timedelta(days=365 * 5 + 30)).timestamp())
        url = "https://finnhub.io/api/v1/stock/candle"
        with httpx.Client(timeout=settings.request_timeout_seconds) as client:
            resp = client.get(
                url,
                params={"symbol": ticker, "resolution": "D", "from": start_ts, "to": now_ts},
                headers={"X-Finnhub-Token": api_key},
            )
            resp.raise_for_status()
            payload = resp.json()

        if payload.get("s") != "ok" or not payload.get("t"):
            raise ProviderError(f"Finnhub returned status={payload.get('s')} for {ticker}")

        dates = [datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d") for ts in payload["t"]]
        df = pd.DataFrame(
            {
                "date": dates,
                "open": payload["o"],
                "high": payload["h"],
                "low": payload["l"],
                "close": payload["c"],
                "volume": payload["v"],
            }
        )
        return normalize_ohlcv_dataframe(df, intraday=False)

    def fetch_alphavantage_daily(self, ticker: str, api_key: str) -> pd.DataFrame:
        if not api_key:
            raise ProviderError("ALPHAVANTAGE_API_KEY not configured")
        if not provider_limiters["alphavantage"].allow_request():
            raise ProviderError("Alpha Vantage rate limit guard active")

        url = "https://www.alphavantage.co/query"
        with httpx.Client(timeout=settings.request_timeout_seconds) as client:
            resp = client.get(
                url,
                params={
                    "function": "TIME_SERIES_DAILY",
                    "symbol": ticker,
                    "outputsize": "full",
                    "apikey": api_key,
                },
            )
            resp.raise_for_status()
            payload = resp.json()

        series = payload.get("Time Series (Daily)")
        if not series:
            note = payload.get("Note") or payload.get("Information") or "No daily series returned"
            raise ProviderError(f"Alpha Vantage error: {note}")

        rows = []
        for dt_str, bar in series.items():
            rows.append(
                {
                    "date": dt_str,
                    "open": bar.get("1. open"),
                    "high": bar.get("2. high"),
                    "low": bar.get("3. low"),
                    "close": bar.get("4. close"),
                    "volume": bar.get("5. volume", 0),
                }
            )
        return normalize_ohlcv_dataframe(pd.DataFrame(rows), intraday=False)

    def fetch_twelvedata_daily(self, ticker: str, api_key: str) -> pd.DataFrame:
        if not api_key:
            raise ProviderError("TWELVEDATA_API_KEY not configured")
        if not provider_limiters["twelvedata"].allow_request():
            raise ProviderError("Twelve Data rate limit guard active")

        url = "https://api.twelvedata.com/time_series"
        with httpx.Client(timeout=settings.request_timeout_seconds) as client:
            resp = client.get(
                url,
                params={
                    "symbol": ticker,
                    "interval": "1day",
                    "outputsize": 1300,
                },
                headers={"Authorization": f"apikey {api_key}"},
            )
            resp.raise_for_status()
            payload = resp.json()

        values = payload.get("values")
        if not values:
            raise ProviderError(payload.get("message", "Twelve Data returned no values"))

        rows = [
            {
                "date": v["datetime"],
                "open": v["open"],
                "high": v["high"],
                "low": v["low"],
                "close": v["close"],
                "volume": v.get("volume", 0),
            }
            for v in values
        ]
        return normalize_ohlcv_dataframe(pd.DataFrame(rows), intraday=False)

    def fetch_yahoo_chart(self, ticker: str, interval: str = "1d", range_str: str = "5y") -> pd.DataFrame:
        now = time.monotonic()
        if now < self._yahoo_circuit_open_until:
            raise ProviderError("Yahoo live endpoint circuit open (network isolated)")
        if not provider_limiters["yahoo"].allow_request():
            raise ProviderError("Yahoo rate limit guard active")

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        try:
            with httpx.Client(
                timeout=2.0,
                headers={"User-Agent": "Mozilla/5.0 MarketSignalQuant/2.4"},
            ) as client:
                resp = client.get(url, params={"interval": interval, "range": range_str})
                resp.raise_for_status()
                payload = resp.json()
        except Exception as exc:
            # Trip circuit breaker for 5 minutes so isolated sandboxes stay instant
            self._yahoo_circuit_open_until = now + 300.0
            raise ProviderError(f"Yahoo Finance unreachable: {exc}") from exc

        result = (payload.get("chart", {}).get("result") or [None])[0]
        if not result or not result.get("timestamp"):
            raise ProviderError(f"Yahoo chart empty for {ticker}")

        quote = result["indicators"]["quote"][0]
        intraday = interval.endswith("m") or interval.endswith("h")
        fmt = "%Y-%m-%d %H:%M:%S" if intraday else "%Y-%m-%d"
        dates = [datetime.fromtimestamp(ts, tz=timezone.utc).strftime(fmt) for ts in result["timestamp"]]
        df = pd.DataFrame(
            {
                "date": dates,
                "open": quote.get("open"),
                "high": quote.get("high"),
                "low": quote.get("low"),
                "close": quote.get("close"),
                "volume": quote.get("volume"),
            }
        )
        return normalize_ohlcv_dataframe(df, intraday=intraday)

    def search_finnhub(self, query: str, api_key: str) -> Optional[list[dict]]:
        if not api_key or not provider_limiters["finnhub"].allow_request():
            return None
        try:
            with httpx.Client(timeout=3.0) as client:
                resp = client.get(
                    "https://finnhub.io/api/v1/search",
                    params={"q": query},
                    headers={"X-Finnhub-Token": api_key},
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("result", [])[:10]
        except Exception:
            return None


live_providers = LiveMarketProviders()
