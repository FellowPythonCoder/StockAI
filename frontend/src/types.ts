export type DataFeedMode = 'live' | 'delayed' | 'cached' | 'archival_demo' | 'unavailable';
export type ForecastDirection = 'upside' | 'downside' | 'mixed';
export type HorizonCode = '1d' | '5d' | '21d' | '63d' | '126d';
export type TimeframeCode = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
export type DataQualityLevel = 'High' | 'Medium' | 'Limited';

export interface DataProvenance {
  mode: DataFeedMode;
  provider_name: string;
  source_attribution: string;
  as_of_timestamp: string;
  fetched_at: string;
  market_status: string;
  is_demo_or_archive: boolean;
  staleness_warning?: string | null;
  note?: string | null;
}

export interface InstrumentSummary {
  ticker: string;
  name: string;
  exchange: string;
  asset_type: 'Equity' | 'ETF' | 'Index';
  sector: string;
  industry: string;
  has_intraday: boolean;
}

export interface CandleBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  rsi14?: number | null;
}

export interface FundamentalsSnapshot {
  market_cap?: number | null;
  market_cap_fmt?: string | null;
  pe_trailing?: number | null;
  pe_forward?: number | null;
  eps_ttm?: number | null;
  revenue_ttm_fmt?: string | null;
  revenue_growth_yoy_pct?: number | null;
  net_income_ttm_fmt?: string | null;
  profit_margin_pct?: number | null;
  gross_margin_pct?: number | null;
  dividend_yield_pct?: number | null;
  beta?: number | null;
  week52_high: number;
  week52_low: number;
  avg_volume_20d: number;
  next_earnings_date?: string | null;
  earnings_timing?: string | null;
  fundamentals_as_of: string;
}

export interface NewsDevelopment {
  published_at: string;
  headline: string;
  summary: string;
  source: string;
  category: 'earnings' | 'product' | 'macro' | 'sector' | 'filing';
  sentiment_tag: 'positive' | 'negative' | 'neutral';
}

export interface ForecastTrajectoryPoint {
  date: string;
  step_days: number;
  expected_price: number;
  range_68_low: number;
  range_68_high: number;
  range_90_low: number;
  range_90_high: number;
}

export interface FactorContribution {
  name: string;
  category: 'momentum' | 'trend' | 'volatility' | 'volume' | 'relative_strength' | 'fundamental' | 'event';
  measured_value: string;
  impact_direction: 'positive' | 'negative' | 'neutral';
  standardized_weight: number;
  description: string;
}

export interface HorizonForecast {
  ticker: string;
  horizon_code: HorizonCode;
  horizon_label: string;
  horizon_trading_days: number;
  starting_price: number;
  starting_date: string;
  target_date: string;
  direction: ForecastDirection;
  direction_label: string;
  expected_return_pct: number;
  expected_price: number;
  range_68_low: number;
  range_68_high: number;
  range_90_low: number;
  range_90_high: number;
  prob_higher?: number | null;
  prob_calibrated: boolean;
  calibration_note: string;
  selected_model_name: string;
  ensemble_used: boolean;
  model_selection_reason: string;
  model_version: string;
  data_quality: DataQualityLevel;
  data_quality_detail: string;
  earnings_in_window: boolean;
  earnings_date_in_window?: string | null;
  annualized_volatility_pct: number;
  key_reasons: string[];
  measured_facts: string[];
  model_assumptions: string[];
  risks_and_invalidation: string[];
  factor_contributions: FactorContribution[];
  trajectory: ForecastTrajectoryPoint[];
  last_updated: string;
}

export interface CalibrationBin {
  bin_label: string;
  predicted_mean: number;
  observed_rate: number;
  count: number;
}

export interface RegimePerformance {
  regime: string;
  sample_size: number;
  directional_accuracy_pct: number;
  model_mae_pct: number;
  no_change_mae_pct: number;
}

export interface WalkForwardPoint {
  origin_date: string;
  target_date: string;
  source_price: number;
  realized_price: number;
  predicted_return_pct: number;
  realized_return_pct: number;
  range_68_low_pct: number;
  range_68_high_pct: number;
}

export interface HorizonBacktestReport {
  ticker: string;
  horizon_code: HorizonCode;
  horizon_label: string;
  horizon_trading_days: number;
  methodology: string;
  test_period_start: string;
  test_period_end: string;
  train_min_observations: number;
  sample_size: number;
  validation_limited: boolean;
  selected_model_name: string;
  directional_accuracy_pct: number;
  baseline_drift_directional_pct: number;
  directional_p_value: number;
  model_mae_pct: number;
  no_change_mae_pct: number;
  historical_avg_mae_pct: number;
  mae_skill_vs_no_change_pct: number;
  model_rmse_pct: number;
  no_change_rmse_pct: number;
  coverage_68_pct: number;
  coverage_90_pct: number;
  brier_score: number;
  baseline_brier_score: number;
  calibration_bins: CalibrationBin[];
  regime_breakdown: RegimePerformance[];
  recent_walk_forward_points: WalkForwardPoint[];
}

export interface HorizonSummaryRow {
  horizon_code: HorizonCode;
  horizon_label: string;
  horizon_days: number;
  target_date: string;
  direction: ForecastDirection;
  direction_label: string;
  expected_return_pct: number;
  expected_price: number;
  range_68_low: number;
  range_68_high: number;
  prob_higher?: number | null;
  directional_accuracy_pct: number;
  model_mae_pct: number;
  no_change_mae_pct: number;
}

export interface StockAnalysisResponse {
  instrument: InstrumentSummary;
  latest_price: number;
  previous_close: number;
  change_dollar: number;
  change_pct: number;
  day_high: number;
  day_low: number;
  day_open: number;
  day_volume: number;
  provenance: DataProvenance;
  fundamentals: FundamentalsSnapshot;
  news_developments: NewsDevelopment[];
  selected_horizon: HorizonCode;
  forecast: HorizonForecast;
  all_horizons_summary: HorizonSummaryRow[];
  backtest: HorizonBacktestReport;
}

export interface ChartSeriesResponse {
  ticker: string;
  timeframe: TimeframeCode;
  interval: '1h' | '1d';
  fallback_notice?: string | null;
  provenance: DataProvenance;
  bars: CandleBar[];
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  sector: string;
  position: number;
  latest_price: number;
  change_pct: number;
  preferred_horizon: HorizonCode;
  horizon_label: string;
  forecast_direction: ForecastDirection;
  direction_label: string;
  expected_return_pct: number;
  range_low: number;
  range_high: number;
  prob_higher?: number | null;
  last_analyzed_at: string;
  sparkline: number[];
}

export interface TrackedForecastRecord {
  id: number;
  created_at: string;
  ticker: string;
  company_name: string;
  source_price: number;
  source_date: string;
  horizon_code: HorizonCode;
  horizon_label: string;
  horizon_days: number;
  target_date: string;
  predicted_direction: ForecastDirection;
  expected_return_pct: number;
  range_68_low: number;
  range_68_high: number;
  prob_higher?: number | null;
  model_version: string;
  record_origin: 'live_user' | 'walk_forward_audit';
  outcome_status: 'pending' | 'realized';
  realized_price?: number | null;
  realized_date?: string | null;
  realized_return_pct?: number | null;
  directional_hit?: boolean | null;
  within_68_range?: boolean | null;
  abs_error_pct?: number | null;
}

export interface MarketOverviewItem {
  symbol: string;
  display_symbol: string;
  name: string;
  category: 'index' | 'sector' | 'volatility' | 'benchmark_etf';
  latest_value: number;
  change_dollar: number;
  change_pct: number;
  return_1m_pct: number;
  return_3m_pct: number;
  as_of: string;
  sparkline: number[];
}

export interface MarketOverviewResponse {
  provenance: DataProvenance;
  market_regime_label: string;
  market_regime_summary: string;
  breadth_advancing_sectors: number;
  breadth_total_sectors: number;
  vix_level?: number | null;
  indices: MarketOverviewItem[];
  sectors: MarketOverviewItem[];
  benchmarks: MarketOverviewItem[];
}
