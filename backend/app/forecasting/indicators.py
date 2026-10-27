"""Technical indicators & volatility estimators (strictly causal, zero lookahead)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def compute_sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).mean()


def compute_ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def compute_wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder's smoothed Relative Strength Index (RSI-14)."""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    # Handle zero-loss streak cleanly
    rsi = np.where((avg_loss == 0) & (avg_gain > 0), 100.0, rsi)
    rsi = np.where((avg_loss == 0) & (avg_gain == 0), 50.0, rsi)
    s = pd.Series(rsi, index=close.index, dtype=float)
    s.iloc[:period] = np.nan
    return s


def compute_ewma_daily_vol(log_returns: pd.Series, decay: float = 0.94) -> pd.Series:
    """RiskMetrics causal EWMA daily volatility sigma_t."""
    sq = log_returns.pow(2)
    alpha = 1.0 - decay
    var_ewma = sq.ewm(alpha=alpha, adjust=False, min_periods=10).mean()
    return np.sqrt(var_ewma).clip(lower=1e-4)


def compute_parkinson_vol(high: pd.Series, low: pd.Series, window: int = 20) -> pd.Series:
    """Parkinson high-low range daily volatility estimator."""
    hl_log_sq = np.log((high / low).clip(lower=1.0)) ** 2
    factor = 1.0 / (4.0 * np.log(2.0))
    return np.sqrt(factor * hl_log_sq.rolling(window=window, min_periods=10).mean()).clip(lower=1e-4)


def enrich_bars_with_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Adds SMA20, SMA50, SMA200, and RSI14 to an OHLCV DataFrame prior to slicing."""
    if df.empty:
        return df.copy()
    out = df.copy()
    close = out["close"].astype(float)
    out["sma20"] = compute_sma(close, 20).round(4)
    out["sma50"] = compute_sma(close, 50).round(4)
    out["sma200"] = compute_sma(close, 200).round(4)
    out["rsi14"] = compute_wilder_rsi(close, 14).round(2)
    return out
