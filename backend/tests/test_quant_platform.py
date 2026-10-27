"""Unit & integration tests for MARKET / SIGNAL data normalization, causality, backtesting, and API."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend.app.evaluation.backtest import run_walk_forward_pipeline
from backend.app.forecasting.features import FEATURE_COLUMNS, build_causal_feature_frame
from backend.app.main import app
from backend.app.providers.archival_provider import archival_provider
from backend.app.providers.normalizer import advance_trading_days, is_nyse_trading_day, normalize_ohlcv_dataframe
from datetime import date


def test_nyse_calendar_skips_weekends_and_holidays():
    # Friday Oct 23, 2026 + 1 trading day -> Monday Oct 26, 2026
    assert advance_trading_days("2026-10-23", 1) == "2026-10-26"
    # Thanksgiving Nov 26, 2026 is NYSE holiday: Nov 25 + 1 trading day -> Nov 27
    assert not is_nyse_trading_day(date(2026, 11, 26))
    assert advance_trading_days("2026-11-25", 1) == "2026-11-27"


def test_normalizer_enforces_ohlc_bounds():
    dirty = pd.DataFrame(
        {
            "date": ["2026-10-22", "2026-10-21", "2026-10-22"],
            "open": [100.0, 98.0, 101.0],
            "high": [99.0, 102.0, 100.5],  # high accidentally below open/close on row 3
            "low": [95.0, 99.0, 102.0],    # low accidentally above open on row 2/3
            "close": [101.0, 100.0, 103.0],
            "volume": [1000, -50, 2500],
        }
    )
    clean = normalize_ohlcv_dataframe(dirty)
    assert len(clean) == 2
    assert list(clean["date"]) == ["2026-10-21", "2026-10-22"]
    for row in clean.itertuples():
        assert row.high >= max(row.open, row.close)
        assert row.low <= min(row.open, row.close)
        assert row.volume >= 0


def test_zero_future_data_leakage_in_features():
    """Mutating future prices strictly after index `t` must NEVER change causal features at `t`."""
    nvda = archival_provider.get_daily_bars("NVDA")
    spy = archival_provider.get_daily_bars("SPY")
    xlk = archival_provider.get_daily_bars("XLK")

    feat_orig = build_causal_feature_frame(nvda, spy_df=spy, sector_df=xlk)
    cutoff = 800

    nvda_mutated = nvda.copy()
    # Massively shock all future prices after cutoff (x3.5 crash/spike)
    nvda_mutated.loc[cutoff + 1 :, "close"] *= 3.5
    nvda_mutated.loc[cutoff + 1 :, "high"] *= 3.8
    nvda_mutated.loc[cutoff + 1 :, "low"] *= 3.2
    nvda_mutated.loc[cutoff + 1 :, "volume"] *= 10

    feat_mut = build_causal_feature_frame(nvda_mutated, spy_df=spy, sector_df=xlk)

    orig_slice = feat_orig.loc[:cutoff, FEATURE_COLUMNS].to_numpy()
    mut_slice = feat_mut.loc[:cutoff, FEATURE_COLUMNS].to_numpy()
    np.testing.assert_allclose(orig_slice, mut_slice, rtol=1e-12, atol=1e-12, equal_nan=True)


def test_walk_forward_backtest_metrics_and_calibration():
    aapl = archival_provider.get_daily_bars("AAPL")
    spy = archival_provider.get_daily_bars("SPY")
    xlk = archival_provider.get_daily_bars("XLK")
    feat = build_causal_feature_frame(aapl, spy_df=spy, sector_df=xlk)

    wf = run_walk_forward_pipeline("AAPL", feat, "5d")
    rep = wf.report
    assert rep.sample_size >= 150
    assert 0.0 <= rep.directional_accuracy_pct <= 100.0
    assert rep.model_mae_pct > 0.0
    assert rep.no_change_mae_pct > 0.0
    assert rep.historical_avg_mae_pct > 0.0
    assert 20.0 <= rep.coverage_68_pct <= 98.0
    assert len(rep.regime_breakdown) == 3
    p_up = wf.calibrator.predict_prob_up(0.25)
    assert 0.20 <= p_up <= 0.80


def test_end_to_end_api_flow():
    client = TestClient(app)

    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["status"] == "ok"

    s = client.get("/api/search?q=NVDA")
    assert s.status_code == 200
    assert s.json()[0]["ticker"] == "NVDA"

    ov = client.get("/api/market-overview")
    assert ov.status_code == 200
    ov_data = ov.json()
    assert len(ov_data["indices"]) >= 3
    assert len(ov_data["sectors"]) >= 8

    an = client.get("/api/stocks/MSFT/analysis?horizon=5d")
    assert an.status_code == 200
    an_data = an.json()
    assert an_data["instrument"]["ticker"] == "MSFT"
    # MSFT Oct 28, 2026 earnings falls inside 5d window starting Oct 26, 2026!
    assert an_data["forecast"]["earnings_in_window"] is True
    assert len(an_data["all_horizons_summary"]) == 5

    ch_1d = client.get("/api/stocks/AAPL/chart?timeframe=1D")
    assert ch_1d.status_code == 200
    assert ch_1d.json()["interval"] == "1h"
    assert len(ch_1d.json()["bars"]) >= 4

    # Watchlist add, reorder, delete
    w_add = client.post("/api/watchlist", json={"ticker": "AMD", "preferred_horizon": "21d"})
    assert w_add.status_code == 200
    tickers = [x["ticker"] for x in w_add.json()]
    assert "AMD" in tickers

    reordered = ["AMD"] + [t for t in tickers if t != "AMD"]
    w_re = client.put("/api/watchlist/reorder", json={"tickers": reordered})
    assert w_re.status_code == 200
    assert w_re.json()[0]["ticker"] == "AMD"

    w_del = client.delete("/api/watchlist/AMD")
    assert w_del.status_code == 200
    assert "AMD" not in [x["ticker"] for x in w_del.json()]

    tr = client.get("/api/tracking?ticker=MSFT")
    assert tr.status_code == 200
    assert len(tr.json()) >= 1
