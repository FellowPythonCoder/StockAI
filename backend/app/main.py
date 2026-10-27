"""FastAPI entrypoint for MARKET / SIGNAL."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import MODEL_VERSION
from .config import BASE_DIR, settings
from .providers.cache import market_cache
from .providers.router import market_router
from .schemas import (
    ChartSeriesResponse,
    HorizonCode,
    InstrumentSummary,
    MarketOverviewResponse,
    ProviderConfigRequest,
    StockAnalysisResponse,
    TrackedForecastRecord,
    WatchlistAddRequest,
    WatchlistItemOut,
    WatchlistReorderRequest,
)
from .service import build_stock_analysis, build_watchlist_view, seed_initial_audit_history
from .tracking.store import tracking_store

FRONTEND_BUILD_DIR = BASE_DIR.parent / "docs"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    seed_initial_audit_history()
    yield


app = FastAPI(
    title="MARKET / SIGNAL Quantitative API",
    version="2.4.0",
    description="Quantitative stock forecasting, walk-forward evaluation, and market intelligence API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def api_health() -> dict:
    configured = settings.configured_providers()
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "runtime": "fastapi-quant-engine",
        "configured_live_providers": configured,
        "demo_or_archive_fallback_active": len(configured) == 0,
    }


@app.get("/api/provider-status")
def get_provider_status() -> dict:
    configured = settings.configured_providers()
    _, sample_prov = market_router.get_daily_series("SPY", force_refresh=False)
    return {
        "active_mode": sample_prov.mode,
        "provider_name": sample_prov.provider_name,
        "source_attribution": sample_prov.source_attribution,
        "as_of_timestamp": sample_prov.as_of_timestamp,
        "market_status": sample_prov.market_status,
        "is_demo_or_archive": sample_prov.is_demo_or_archive,
        "configured_providers": configured,
        "setup_instructions": (
            "Set FINNHUB_API_KEY, ALPHAVANTAGE_API_KEY, or TWELVEDATA_API_KEY in backend/.env "
            "(or configure via Server Feed Settings) to switch from Verified Historical Demo Snapshot to Live API feeds. "
            "Keys stay strictly on the server and are never exposed in client code."
        ),
    }


@app.post("/api/provider-config")
def set_server_provider_key(req: ProviderConfigRequest) -> dict:
    key = req.api_key.strip()
    if req.provider == "finnhub":
        settings.finnhub_api_key = key
    elif req.provider == "alphavantage":
        settings.alphavantage_api_key = key
    elif req.provider == "twelvedata":
        settings.twelvedata_api_key = key
    market_cache.clear()
    return {
        "updated": True,
        "provider": req.provider,
        "configured_providers": settings.configured_providers(),
    }


@app.get("/api/search", response_model=list[InstrumentSummary])
def search_stocks(q: str = Query(default="", max_length=40), limit: int = Query(default=20, ge=1, le=50)):
    return market_router.search_instruments(q, limit=limit)


@app.get("/api/market-overview", response_model=MarketOverviewResponse)
def market_overview(refresh: bool = Query(default=False)):
    return market_router.get_market_overview(force_refresh=refresh)


@app.get("/api/stocks/{ticker}/analysis", response_model=StockAnalysisResponse)
def stock_analysis(
    ticker: str,
    horizon: HorizonCode = Query(default="5d"),
    refresh: bool = Query(default=False),
):
    try:
        return build_stock_analysis(ticker, horizon=horizon, force_refresh=refresh, record_to_ledger=True)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/stocks/{ticker}/chart", response_model=ChartSeriesResponse)
def stock_chart(
    ticker: str,
    timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = Query(default="1Y"),
    refresh: bool = Query(default=False),
):
    try:
        return market_router.get_chart_series(ticker, timeframe=timeframe, force_refresh=refresh)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/watchlist", response_model=list[WatchlistItemOut])
def get_watchlist(refresh: bool = Query(default=False)):
    return build_watchlist_view(force_refresh=refresh)


@app.post("/api/watchlist", response_model=list[WatchlistItemOut])
def add_to_watchlist(payload: WatchlistAddRequest):
    sym = payload.ticker.upper().strip()
    try:
        market_router.get_instrument_summary(sym)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    tracking_store.add_or_update_watchlist(sym, payload.preferred_horizon)
    return build_watchlist_view(force_refresh=False)


@app.delete("/api/watchlist/{ticker}", response_model=list[WatchlistItemOut])
def delete_from_watchlist(ticker: str):
    tracking_store.remove_watchlist(ticker)
    return build_watchlist_view(force_refresh=False)


@app.put("/api/watchlist/reorder", response_model=list[WatchlistItemOut])
def reorder_watchlist(payload: WatchlistReorderRequest):
    tracking_store.reorder_watchlist(payload.tickers)
    return build_watchlist_view(force_refresh=False)


@app.get("/api/tracking", response_model=list[TrackedForecastRecord])
def list_tracking_history(
    ticker: Optional[str] = Query(default=None),
    origin: Optional[str] = Query(default=None),
    limit: int = Query(default=80, ge=1, le=250),
):
    if ticker:
        try:
            df, _ = market_router.get_daily_series(ticker)
            tracking_store.resolve_pending_outcomes(ticker, df)
        except Exception:
            pass
    return tracking_store.list_tracked_forecasts(ticker=ticker, record_origin=origin, limit=limit)


# Serve static SPA bundle if built
if FRONTEND_BUILD_DIR.exists():
    assets_dir = FRONTEND_BUILD_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    images_dir = FRONTEND_BUILD_DIR / "images"
    if images_dir.exists():
        app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")
    static_data_dir = FRONTEND_BUILD_DIR / "static-data"
    if static_data_dir.exists():
        app.mount("/static-data", StaticFiles(directory=str(static_data_dir)), name="static-data")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    if FRONTEND_BUILD_DIR.exists():
        candidate = (FRONTEND_BUILD_DIR / full_path).resolve()
        if str(candidate).startswith(str(FRONTEND_BUILD_DIR.resolve())) and candidate.is_file():
            return FileResponse(str(candidate))
        index_html = FRONTEND_BUILD_DIR / "index.html"
        if index_html.exists():
            return FileResponse(str(index_html))
    return {
        "service": "MARKET / SIGNAL API",
        "message": "Frontend bundle not yet built. Run `npm run build` in `frontend/` or visit `/docs`.",
    }
