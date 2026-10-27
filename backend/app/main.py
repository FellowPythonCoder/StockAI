"""FastAPI entrypoint for MARKET / SIGNAL Procedural Stock & AI Candle Verification Platform."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import MODEL_VERSION
from .config import BASE_DIR
from .providers.router import market_router
from .schemas import (
    CandleAdvanceRequest,
    CandleAdvanceResponse,
    ChartSeriesResponse,
    GenerateStockRequest,
    GenerateStockResponse,
    HorizonCode,
    InstrumentSummary,
    MarketOverviewResponse,
    StockAnalysisResponse,
    TrackedForecastRecord,
    WatchlistAddRequest,
    WatchlistItemOut,
    WatchlistReorderRequest,
)
from .service import (
    advance_candles_and_verify_ai,
    build_stock_analysis,
    build_watchlist_view,
    create_random_stock_and_analyze,
    seed_initial_audit_history,
)
from .tracking.store import tracking_store

FRONTEND_BUILD_DIR = BASE_DIR.parent / "docs"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    seed_initial_audit_history()
    yield


app = FastAPI(
    title="MARKET / SIGNAL Procedural Stock & AI Verification API",
    version="3.0.0",
    description="Procedural random stock generator, stochastic candlestick progression, and quantitative AI forecast verification.",
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
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "runtime": "fastapi-procedural-candle-engine",
    }


@app.get("/api/provider-status")
def get_provider_status() -> dict:
    _, sample_prov = market_router.get_daily_series("MSX", force_refresh=False)
    return {
        "active_mode": "live",
        "provider_name": sample_prov.provider_name,
        "source_attribution": sample_prov.source_attribution,
        "as_of_timestamp": sample_prov.as_of_timestamp,
        "market_status": sample_prov.market_status,
        "is_demo_or_archive": False,
        "configured_providers": ["procedural-garch-candle-engine"],
        "setup_instructions": (
            "All equities and benchmarks are 100% synthetic and procedurally generated using multi-regime GARCH(1,1) "
            "stochastic candlesticks. Generate new stocks anytime and advance future candles randomly to test whether "
            "the AI forecast got it right."
        ),
    }


@app.get("/api/search", response_model=list[InstrumentSummary])
def search_stocks(q: str = Query(default="", max_length=40), limit: int = Query(default=24, ge=1, le=50)):
    return market_router.search_instruments(q, limit=limit)


@app.get("/api/market-overview", response_model=MarketOverviewResponse)
def market_overview(refresh: bool = Query(default=False)):
    return market_router.get_market_overview(force_refresh=refresh)


@app.post("/api/stocks/generate", response_model=GenerateStockResponse)
def generate_random_stock_endpoint(payload: GenerateStockRequest):
    return create_random_stock_and_analyze(
        regime=payload.regime,
        sector=payload.sector,
        custom_ticker=payload.custom_ticker,
        custom_name=payload.custom_name,
        horizon=payload.horizon,
        timeframe=payload.timeframe,
    )


@app.post("/api/stocks/{ticker}/advance", response_model=CandleAdvanceResponse)
def advance_stock_candles_endpoint(ticker: str, payload: CandleAdvanceRequest):
    try:
        return advance_candles_and_verify_ai(
            ticker=ticker,
            horizon=payload.horizon,
            steps=payload.steps,
            timeframe=payload.timeframe,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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
    timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = Query(default="3M"),
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
        inst = market_router.get_instrument_summary(sym)
        sym = inst.ticker
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


if FRONTEND_BUILD_DIR.exists():
    assets_dir = FRONTEND_BUILD_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    images_dir = FRONTEND_BUILD_DIR / "images"
    if images_dir.exists():
        app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")


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
        "message": "Frontend bundle not yet built. Run `npm run build` in `frontend/`.",
    }
