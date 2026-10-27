"""Pydantic schemas for the MARKET / SIGNAL Procedural Stock & Quantitative Forecasting API."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

DataFeedMode = Literal["live", "delayed", "cached", "archival_demo", "unavailable"]
ForecastDirection = Literal["upside", "downside", "mixed"]
HorizonCode = Literal["1d", "5d", "21d", "63d", "126d"]
DataQualityLevel = Literal["High", "Medium", "Limited"]
RegimeArchetype = Literal["random", "momentum_up", "mean_reverting", "high_vol", "turnaround", "downtrend"]


class DataProvenance(BaseModel):
    mode: DataFeedMode
    provider_name: str
    source_attribution: str
    as_of_timestamp: str
    fetched_at: str
    market_status: str
    is_demo_or_archive: bool
    staleness_warning: Optional[str] = None
    note: Optional[str] = None


class InstrumentSummary(BaseModel):
    ticker: str
    name: str
    exchange: str
    asset_type: Literal["Equity", "ETF", "Index"]
    sector: str
    industry: str
    has_intraday: bool = True


class CandleBar(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    sma20: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    rsi14: Optional[float] = None


class FundamentalsSnapshot(BaseModel):
    market_cap: Optional[float] = None
    market_cap_fmt: Optional[str] = None
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    eps_ttm: Optional[float] = None
    revenue_ttm_fmt: Optional[str] = None
    revenue_growth_yoy_pct: Optional[float] = None
    net_income_ttm_fmt: Optional[str] = None
    profit_margin_pct: Optional[float] = None
    gross_margin_pct: Optional[float] = None
    dividend_yield_pct: Optional[float] = None
    beta: Optional[float] = None
    week52_high: float
    week52_low: float
    avg_volume_20d: int
    next_earnings_date: Optional[str] = None
    earnings_timing: Optional[str] = None
    fundamentals_as_of: str


class NewsDevelopment(BaseModel):
    published_at: str
    headline: str
    summary: str
    source: str
    category: Literal["earnings", "product", "macro", "sector", "filing"]
    sentiment_tag: Literal["positive", "negative", "neutral"]


class ForecastTrajectoryPoint(BaseModel):
    date: str
    step_days: int
    expected_price: float
    range_68_low: float
    range_68_high: float
    range_90_low: float
    range_90_high: float


class FactorContribution(BaseModel):
    name: str
    category: Literal["momentum", "trend", "volatility", "volume", "relative_strength", "fundamental", "event"]
    measured_value: str
    impact_direction: Literal["positive", "negative", "neutral"]
    standardized_weight: float
    description: str


class HorizonForecast(BaseModel):
    ticker: str
    horizon_code: HorizonCode
    horizon_label: str
    horizon_trading_days: int
    starting_price: float
    starting_date: str
    target_date: str
    direction: ForecastDirection
    direction_label: str
    expected_return_pct: float
    expected_price: float
    range_68_low: float
    range_68_high: float
    range_90_low: float
    range_90_high: float
    prob_higher: Optional[float] = None
    prob_calibrated: bool
    calibration_note: str
    selected_model_name: str
    ensemble_used: bool
    model_selection_reason: str
    model_version: str
    data_quality: DataQualityLevel
    data_quality_detail: str
    earnings_in_window: bool
    earnings_date_in_window: Optional[str] = None
    annualized_volatility_pct: float
    key_reasons: list[str]
    measured_facts: list[str]
    model_assumptions: list[str]
    risks_and_invalidation: list[str]
    factor_contributions: list[FactorContribution]
    trajectory: list[ForecastTrajectoryPoint]
    last_updated: str


class CalibrationBin(BaseModel):
    bin_label: str
    predicted_mean: float
    observed_rate: float
    count: int


class RegimePerformance(BaseModel):
    regime: str
    sample_size: int
    directional_accuracy_pct: float
    model_mae_pct: float
    no_change_mae_pct: float


class HorizonBacktestReport(BaseModel):
    ticker: str
    horizon_code: HorizonCode
    horizon_label: str
    horizon_trading_days: int
    methodology: str
    test_period_start: str
    test_period_end: str
    train_min_observations: int
    sample_size: int
    validation_limited: bool
    selected_model_name: str
    directional_accuracy_pct: float
    baseline_drift_directional_pct: float
    directional_p_value: float
    model_mae_pct: float
    no_change_mae_pct: float
    historical_avg_mae_pct: float
    mae_skill_vs_no_change_pct: float
    model_rmse_pct: float
    no_change_rmse_pct: float
    coverage_68_pct: float
    coverage_90_pct: float
    brier_score: float
    baseline_brier_score: float
    calibration_bins: list[CalibrationBin]
    regime_breakdown: list[RegimePerformance]
    recent_walk_forward_points: list[dict]


class StockAnalysisResponse(BaseModel):
    instrument: InstrumentSummary
    latest_price: float
    previous_close: float
    change_dollar: float
    change_pct: float
    day_high: float
    day_low: float
    day_open: float
    day_volume: int
    provenance: DataProvenance
    fundamentals: FundamentalsSnapshot
    news_developments: list[NewsDevelopment]
    selected_horizon: HorizonCode
    forecast: HorizonForecast
    all_horizons_summary: list[dict]
    backtest: HorizonBacktestReport


class ChartSeriesResponse(BaseModel):
    ticker: str
    timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"]
    interval: Literal["1h", "1d"]
    fallback_notice: Optional[str] = None
    provenance: DataProvenance
    bars: list[CandleBar]


class GenerateStockRequest(BaseModel):
    regime: RegimeArchetype = "random"
    sector: Optional[str] = None
    custom_ticker: Optional[str] = None
    custom_name: Optional[str] = None
    horizon: HorizonCode = "5d"
    timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = "3M"


class GenerateStockResponse(BaseModel):
    analysis: StockAnalysisResponse
    chart: ChartSeriesResponse


class CandleAdvanceRequest(BaseModel):
    horizon: HorizonCode = "5d"
    steps: Optional[int] = Field(default=None, ge=1, le=126)
    timeframe: Literal["1D", "1W", "1M", "3M", "1Y", "5Y"] = "3M"


class LockedForecastSnapshot(BaseModel):
    ticker: str
    horizon_code: HorizonCode
    horizon_label: str
    steps_evaluated: int
    starting_price: float
    starting_date: str
    target_date: str
    predicted_direction: ForecastDirection
    direction_label: str
    expected_return_pct: float
    expected_price: float
    range_68_low: float
    range_68_high: float
    range_90_low: float
    range_90_high: float
    prob_higher: Optional[float] = None
    trajectory: list[ForecastTrajectoryPoint]


class CandleCheckVerdict(BaseModel):
    ticker: str
    company_name: str
    horizon_code: HorizonCode
    horizon_label: str
    steps_ran: int
    start_date: str
    end_date: str
    start_price: float
    end_price: float
    actual_change_dollar: float
    actual_return_pct: float
    predicted_direction: ForecastDirection
    predicted_return_pct: float
    predicted_price: float
    range_68_low: float
    range_68_high: float
    within_68_range: bool
    ai_got_it_right: bool
    verdict_badge: str
    verdict_summary: str
    checked_at: str


class CandleAdvanceResponse(BaseModel):
    locked_forecast: LockedForecastSnapshot
    generated_bars: list[CandleBar]
    verdict: CandleCheckVerdict
    updated_analysis: StockAnalysisResponse
    updated_chart: ChartSeriesResponse


class WatchlistItemOut(BaseModel):
    ticker: str
    name: str
    sector: str
    position: int
    latest_price: float
    change_pct: float
    preferred_horizon: HorizonCode
    horizon_label: str
    forecast_direction: ForecastDirection
    direction_label: str
    expected_return_pct: float
    range_low: float
    range_high: float
    prob_higher: Optional[float] = None
    last_analyzed_at: str
    sparkline: list[float]


class WatchlistAddRequest(BaseModel):
    ticker: str
    preferred_horizon: HorizonCode = "5d"


class WatchlistReorderRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1)


class TrackedForecastRecord(BaseModel):
    id: int
    created_at: str
    ticker: str
    company_name: str
    source_price: float
    source_date: str
    horizon_code: HorizonCode
    horizon_label: str
    horizon_days: int
    target_date: str
    predicted_direction: ForecastDirection
    expected_return_pct: float
    range_68_low: float
    range_68_high: float
    prob_higher: Optional[float] = None
    model_version: str
    record_origin: Literal["live_user", "walk_forward_audit"]
    outcome_status: Literal["pending", "realized"]
    realized_price: Optional[float] = None
    realized_date: Optional[str] = None
    realized_return_pct: Optional[float] = None
    directional_hit: Optional[bool] = None
    within_68_range: Optional[bool] = None
    abs_error_pct: Optional[float] = None


class MarketOverviewItem(BaseModel):
    symbol: str
    display_symbol: str
    name: str
    category: Literal["index", "sector", "volatility", "benchmark_etf"]
    latest_value: float
    change_dollar: float
    change_pct: float
    return_1m_pct: float
    return_3m_pct: float
    as_of: str
    sparkline: list[float]


class MarketOverviewResponse(BaseModel):
    provenance: DataProvenance
    market_regime_label: str
    market_regime_summary: str
    breadth_advancing_sectors: int
    breadth_total_sectors: int
    vix_level: Optional[float] = None
    indices: list[MarketOverviewItem]
    sectors: list[MarketOverviewItem]
    benchmarks: list[MarketOverviewItem]


class ProviderConfigRequest(BaseModel):
    provider: Literal["finnhub", "alphavantage", "twelvedata"]
    api_key: str
