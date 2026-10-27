#!/usr/bin/env python3
"""
Precomputes verified quantitative analyses, walk-forward backtests, chart series,
and market overview JSON payloads into `frontend/public/static-data/` so the
entire MARKET / SIGNAL platform works 100% standalone on GitHub Pages as well
as with the live FastAPI backend.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.app.config import settings
from backend.app.providers.catalog import INSTRUMENTS
from backend.app.providers.router import market_router
from backend.app.service import ALL_HORIZONS, build_stock_analysis, build_watchlist_view, seed_initial_audit_history
from backend.app.tracking.store import tracking_store

OUT_DIR = ROOT / "frontend" / "public" / "static-data"


def dump_compact(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    # Disable Yahoo network probe during static build so export is instant
    settings.enable_yahoo_live = False

    (OUT_DIR / "analysis").mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "charts").mkdir(parents=True, exist_ok=True)

    # 1. Catalog
    catalog = [item.model_dump() for item in market_router.search_instruments("", limit=100)]
    dump_compact(OUT_DIR / "catalog.json", catalog)
    print(f"[static-export] catalog.json ({len(catalog)} instruments)")

    # 2. Market overview
    overview = market_router.get_market_overview(force_refresh=False).model_dump()
    dump_compact(OUT_DIR / "market-overview.json", overview)
    print("[static-export] market-overview.json")

    # 3. Per-ticker multi-horizon analyses & charts
    tickers = list(INSTRUMENTS.keys())
    for idx, sym in enumerate(tickers, 1):
        by_horizon: dict[str, dict] = {}
        for h_code in ALL_HORIZONS:
            resp = build_stock_analysis(
                sym,
                horizon=h_code,
                force_refresh=False,
                record_to_ledger=(sym in ("NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA") and h_code == "5d"),
            )
            by_horizon[h_code] = resp.model_dump()

        dump_compact(OUT_DIR / "analysis" / f"{sym}.json", by_horizon)

        charts_by_tf: dict[str, dict] = {}
        for tf in ("1D", "1W", "1M", "3M", "1Y", "5Y"):
            ch = market_router.get_chart_series(sym, timeframe=tf, force_refresh=False)  # type: ignore[arg-type]
            charts_by_tf[tf] = ch.model_dump()
        dump_compact(OUT_DIR / "charts" / f"{sym}.json", charts_by_tf)

        if idx % 8 == 0 or idx == len(tickers):
            print(f"[static-export] processed {idx}/{len(tickers)} instruments (latest: {sym})")

    # 4. Seed watchlist & tracking ledger snapshot for GitHub Pages initial load
    seed_initial_audit_history()
    watchlist_seed = [w.model_dump() for w in build_watchlist_view(force_refresh=False)]
    dump_compact(OUT_DIR / "watchlist-seed.json", watchlist_seed)

    tracking_seed = [t.model_dump() for t in tracking_store.list_tracked_forecasts(limit=120)]
    dump_compact(OUT_DIR / "tracking-seed.json", tracking_seed)

    print("[static-export] Complete ->", OUT_DIR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
