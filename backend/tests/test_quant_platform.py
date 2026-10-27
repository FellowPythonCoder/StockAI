"""Automated verification suite for MARKET / SIGNAL Procedural Stock & AI Verification Platform."""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from backend.app.forecasting.features import FEATURE_COLUMNS, build_causal_feature_frame
from backend.app.main import app
from backend.app.providers.catalog import FORBIDDEN_REAL_TICKERS, INITIAL_SYNTHETIC_STOCKS
from backend.app.providers.normalizer import advance_trading_days, is_nyse_trading_day
from backend.app.providers.synthetic_market import synthetic_market


def test_no_real_stocks_and_valid_synthetic_ohlc() -> None:
    # Ensure zero real-world mega-cap tickers exist in initial catalog
    overlap = set(INITIAL_SYNTHETIC_STOCKS.keys()) & FORBIDDEN_REAL_TICKERS
    assert len(overlap) == 0

    for sym in ["VELX", "KRNL", "AETH", "SLST", "MSX"]:
        df = synthetic_market.get_daily_bars(sym)
        assert len(df) >= 750
        assert (df["low"] <= df[["open", "close"]].min(axis=1)).all()
        assert (df["high"] >= df[["open", "close"]].max(axis=1)).all()
        assert (df["close"] > 0).all()


def test_trading_calendar_skips_weekends_and_holidays() -> None:
    from datetime import date

    assert advance_trading_days("2026-10-23", 1) == "2026-10-26"
    assert not is_nyse_trading_day(date(2026, 11, 26))
    assert advance_trading_days("2026-11-25", 1) == "2026-11-27"


def test_strict_causal_feature_invariance_no_future_leakage() -> None:
    velx = synthetic_market.get_daily_bars("VELX")
    msx = synthetic_market.get_daily_bars("MSX")
    sqnt = synthetic_market.get_daily_bars("SQNT")

    cutoff = 420
    full_feats = build_causal_feature_frame(velx, spy_df=msx, sector_df=sqnt)

    corrupted = velx.copy()
    corrupted.loc[cutoff + 1 :, "close"] *= 3.5
    corrupted.loc[cutoff + 1 :, "high"] *= 3.8
    corrupted_feats = build_causal_feature_frame(corrupted, spy_df=msx, sector_df=sqnt)

    orig_slice = full_feats.loc[65:cutoff, FEATURE_COLUMNS].to_numpy(dtype=float)
    corr_slice = corrupted_feats.loc[65:cutoff, FEATURE_COLUMNS].to_numpy(dtype=float)
    np.testing.assert_allclose(orig_slice, corr_slice, rtol=1e-12, atol=1e-12)


def test_random_stock_generator_and_candle_ai_verification_api() -> None:
    client = TestClient(app)

    # 1. Generate a brand-new random synthetic stock
    gen_res = client.post("/api/stocks/generate", json={"regime": "momentum_up", "horizon": "5d", "timeframe": "3M"})
    assert gen_res.status_code == 200
    gen_body = gen_res.json()
    new_sym = gen_body["analysis"]["instrument"]["ticker"]
    assert new_sym not in FORBIDDEN_REAL_TICKERS
    assert len(gen_body["chart"]["bars"]) >= 30
    assert len(gen_body["analysis"]["all_horizons_summary"]) == 5

    # 2. Advance future candles randomly and verify AI correctness check
    adv_res = client.post(
        f"/api/stocks/{new_sym}/advance",
        json={"horizon": "5d", "steps": 5, "timeframe": "3M"},
    )
    assert adv_res.status_code == 200
    adv_body = adv_res.json()

    assert len(adv_body["generated_bars"]) == 5
    verdict = adv_body["verdict"]
    assert verdict["steps_ran"] == 5
    assert verdict["verdict_badge"] in ("AI GOT IT RIGHT", "AI GOT IT WRONG")

    pred_up = verdict["predicted_return_pct"] >= 0.0
    expected_right = (pred_up and verdict["end_price"] >= verdict["start_price"]) or (
        (not pred_up) and verdict["end_price"] < verdict["start_price"]
    )
    assert verdict["ai_got_it_right"] is expected_right
    if expected_right:
        assert "AI got it right" in verdict["verdict_summary"]
    else:
        assert "AI got it wrong" in verdict["verdict_summary"]

    # 3. Verify tracking ledger resolved the prediction outcome
    trk_res = client.get(f"/api/tracking?ticker={new_sym}")
    assert trk_res.status_code == 200
    trk_rows = trk_res.json()
    realized_live = [r for r in trk_rows if r["record_origin"] == "live_user" and r["outcome_status"] == "realized"]
    assert len(realized_live) >= 1


def test_watchlist_and_market_overview_synthetic_endpoints() -> None:
    client = TestClient(app)
    ov = client.get("/api/market-overview")
    assert ov.status_code == 200
    ov_data = ov.json()
    assert len(ov_data["indices"]) == 4
    assert len(ov_data["sectors"]) == 8

    wl = client.get("/api/watchlist")
    assert wl.status_code == 200
    assert len(wl.json()) >= 4
