"""Timestamp, trading calendar, and OHLCV data normalizer."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
import numpy as np
import pandas as pd

# Major NYSE full-day holidays in 2026 & early 2027
NYSE_HOLIDAYS = {
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-06-19",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
    "2027-01-01",
    "2027-01-18",
    "2027-02-15",
    "2027-03-26",
    "2027-05-31",
}


def is_nyse_trading_day(d: date) -> bool:
    if d.weekday() >= 5:
        return False
    return d.isoformat() not in NYSE_HOLIDAYS


def advance_trading_days(start_date_str: str, trading_days: int) -> str:
    """Advances `trading_days` valid NYSE sessions forward from `start_date_str`."""
    cur = date.fromisoformat(start_date_str[:10])
    remaining = max(0, int(trading_days))
    while remaining > 0:
        cur += timedelta(days=1)
        if is_nyse_trading_day(cur):
            remaining -= 1
    return cur.isoformat()


def trading_days_between(start_date_str: str, end_date_str: str) -> int:
    start_d = date.fromisoformat(start_date_str[:10])
    end_d = date.fromisoformat(end_date_str[:10])
    if end_d <= start_d:
        return 0
    cur = start_d
    count = 0
    while cur < end_d:
        cur += timedelta(days=1)
        if is_nyse_trading_day(cur):
            count += 1
    return count


def normalize_ohlcv_dataframe(df: pd.DataFrame, intraday: bool = False) -> pd.DataFrame:
    """Cleans, deduplicates, sorts, and enforces OHLCV invariants without fabricating bars."""
    if df is None or df.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])

    work = df.copy()
    work.columns = [str(c).strip().lower() for c in work.columns]
    if "time" in work.columns and "date" not in work.columns:
        work["date"] = work["time"]

    required = ["date", "open", "high", "low", "close"]
    for col in required:
        if col not in work.columns:
            raise ValueError(f"Missing required OHLC column: {col}")
    if "volume" not in work.columns:
        work["volume"] = 0

    work["date"] = work["date"].astype(str).str.strip()
    if not intraday:
        work["date"] = work["date"].str.slice(0, 10)

    for col in ["open", "high", "low", "close", "volume"]:
        work[col] = pd.to_numeric(work[col], errors="coerce")

    work = work.dropna(subset=["date", "open", "high", "low", "close"])
    work = work[(work["open"] > 0) & (work["high"] > 0) & (work["low"] > 0) & (work["close"] > 0)]
    work["volume"] = work["volume"].fillna(0).clip(lower=0).astype(np.int64)

    # Enforce High >= max(Open, Close) and Low <= min(Open, Close)
    oc_max = np.maximum(work["open"].to_numpy(), work["close"].to_numpy())
    oc_min = np.minimum(work["open"].to_numpy(), work["close"].to_numpy())
    work["high"] = np.maximum(work["high"].to_numpy(), oc_max)
    work["low"] = np.minimum(work["low"].to_numpy(), oc_min)

    work = work.drop_duplicates(subset=["date"], keep="last").sort_values("date").reset_index(drop=True)
    return work[["date", "open", "high", "low", "close", "volume"]]


def compute_market_status(now_utc: Optional[datetime] = None) -> str:
    """Evaluates US equity market session status in America/New_York time."""
    now = now_utc or datetime.now(timezone.utc)
    # October is EDT (UTC-4); November after first Sunday is EST (UTC-5)
    edt_offset = timedelta(hours=-4 if 3 <= now.month <= 10 else -5)
    ny = now + edt_offset
    if not is_nyse_trading_day(ny.date()):
        return "Market Closed · Weekend / Holiday"
    minutes = ny.hour * 60 + ny.minute
    if 9 * 60 + 30 <= minutes < 16 * 60:
        return "Regular Session Open (NYSE / NASDAQ)"
    if 4 * 60 <= minutes < 9 * 60 + 30:
        return "Pre-Market Session"
    if 16 * 60 <= minutes < 20 * 60:
        return "After-Hours Session · Regular Close 16:00 ET"
    return "Market Closed · Overnight"


def detect_staleness_warning(latest_bar_date: str, reference_date: Optional[date] = None) -> Optional[str]:
    ref = reference_date or datetime.now(timezone.utc).date()
    try:
        bar_d = date.fromisoformat(latest_bar_date[:10])
    except ValueError:
        return "Unable to verify latest bar timestamp."
    missed_sessions = trading_days_between(bar_d.isoformat(), ref.isoformat())
    if missed_sessions >= 3:
        return f"Latest candle ({bar_d.isoformat()}) trails current calendar by {missed_sessions} trading sessions."
    return None
