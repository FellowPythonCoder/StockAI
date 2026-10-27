"""Strictly causal quantitative feature matrix builder.

Every feature at row index `t` is computed exclusively from historical bars `0..t`.
No forward shifts or full-sample scalers are ever applied here.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .indicators import (
    compute_ema,
    compute_ewma_daily_vol,
    compute_parkinson_vol,
    compute_sma,
    compute_wilder_rsi,
)

FEATURE_COLUMNS = [
    "ret_1d",
    "ret_5d",
    "ret_21d",
    "ret_63d",
    "dist_sma20",
    "dist_sma50",
    "dist_sma200",
    "macd_norm",
    "efficiency_20",
    "rsi_centered",
    "ewma_vol_ann",
    "parkinson_ratio",
    "vol_regime_z",
    "rel_vol_20",
    "market_alpha_21d",
    "sector_rel_21d",
]


def build_causal_feature_frame(
    stock_df: pd.DataFrame,
    spy_df: pd.DataFrame | None = None,
    sector_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    df = stock_df[["date", "open", "high", "low", "close", "volume"]].copy().reset_index(drop=True)
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    vol = df["volume"].astype(float)

    log_ret_1d = np.log(close / close.shift(1))
    df["log_ret_1d"] = log_ret_1d
    df["ret_1d"] = log_ret_1d
    df["ret_5d"] = np.log(close / close.shift(5))
    df["ret_21d"] = np.log(close / close.shift(21))
    df["ret_63d"] = np.log(close / close.shift(63))

    sma20 = compute_sma(close, 20)
    sma50 = compute_sma(close, 50)
    sma200 = compute_sma(close, 200)
    df["sma20"] = sma20
    df["sma50"] = sma50
    df["sma200"] = sma200

    df["dist_sma20"] = (close / sma20) - 1.0
    df["dist_sma50"] = (close / sma50) - 1.0
    # Fall back gracefully to dist_sma50 when <200 bars exist on shorter histories
    df["dist_sma200"] = ((close / sma200) - 1.0).fillna(df["dist_sma50"])

    ema12 = compute_ema(close, 12)
    ema26 = compute_ema(close, 26)
    df["macd_norm"] = (ema12 - ema26) / close

    abs_step = close.diff().abs()
    path_len_20 = abs_step.rolling(20, min_periods=10).sum().replace(0.0, np.nan)
    net_disp_20 = (close - close.shift(20)).abs()
    df["efficiency_20"] = (net_disp_20 / path_len_20).clip(0.0, 1.0).fillna(0.3)

    rsi14 = compute_wilder_rsi(close, 14)
    df["rsi14"] = rsi14
    df["rsi_centered"] = ((rsi14 - 50.0) / 50.0).fillna(0.0)

    ewma_daily = compute_ewma_daily_vol(log_ret_1d.fillna(0.0), decay=0.94)
    df["ewma_daily_vol"] = ewma_daily
    df["ewma_vol_ann"] = ewma_daily * np.sqrt(252.0)

    park_daily = compute_parkinson_vol(high, low, window=20)
    df["parkinson_ratio"] = (park_daily / ewma_daily).clip(0.4, 2.5).fillna(1.0)

    vol_med_120 = ewma_daily.rolling(120, min_periods=25).median()
    df["vol_regime_z"] = ((ewma_daily / vol_med_120) - 1.0).clip(-0.8, 2.5).fillna(0.0)

    vol_ma20 = vol.rolling(20, min_periods=5).mean().replace(0.0, np.nan)
    df["rel_vol_20"] = np.log((vol / vol_ma20).clip(lower=0.2, upper=5.0)).fillna(0.0)

    # Cross-asset benchmark alignment (strictly date-matched causal join)
    if spy_df is not None and not spy_df.empty:
        spy_sub = spy_df[["date", "close"]].rename(columns={"close": "spy_close"})
        df = pd.merge(df, spy_sub, on="date", how="left")
        df["spy_close"] = df["spy_close"].ffill()
        spy_r1 = np.log(df["spy_close"] / df["spy_close"].shift(1))
        spy_r21 = np.log(df["spy_close"] / df["spy_close"].shift(21))
        cov60 = df["log_ret_1d"].rolling(60, min_periods=20).cov(spy_r1)
        var60 = spy_r1.rolling(60, min_periods=20).var().replace(0.0, np.nan)
        beta60 = (cov60 / var60).clip(0.0, 3.0).fillna(1.0)
        df["rolling_beta_60"] = beta60
        df["market_alpha_21d"] = (df["ret_21d"] - beta60 * spy_r21).fillna(0.0)
        df["spy_vol_ann"] = compute_ewma_daily_vol(spy_r1.fillna(0.0), 0.94) * np.sqrt(252.0)
    else:
        df["rolling_beta_60"] = 1.0
        df["market_alpha_21d"] = 0.0
        df["spy_vol_ann"] = df["ewma_vol_ann"]

    if sector_df is not None and not sector_df.empty:
        sec_sub = sector_df[["date", "close"]].rename(columns={"close": "sec_close"})
        df = pd.merge(df, sec_sub, on="date", how="left")
        df["sec_close"] = df["sec_close"].ffill()
        sec_r21 = np.log(df["sec_close"] / df["sec_close"].shift(21))
        df["sector_rel_21d"] = (df["ret_21d"] - sec_r21).fillna(0.0)
    else:
        df["sector_rel_21d"] = 0.0

    return df
