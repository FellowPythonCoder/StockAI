import { clientSyntheticEngine } from '../engine/syntheticClientEngine';
import {
  CandleAdvanceResponse,
  ChartSeriesResponse,
  GenerateStockResponse,
  HorizonCode,
  InstrumentSummary,
  MarketOverviewResponse,
  RegimeArchetype,
  StockAnalysisResponse,
  TimeframeCode,
  TrackedForecastRecord,
  WatchlistItem,
} from '../types';

const LS_WATCHLIST_KEY = 'market_signal_synth_watchlist_v3';
const LS_TRACKING_KEY = 'market_signal_synth_tracking_v3';

let backendState: 'unknown' | 'live_api' | 'static_pages' = 'unknown';

export async function detectRuntimeMode(): Promise<'live_api' | 'static_pages'> {
  if (backendState !== 'unknown') return backendState;
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data && data.status === 'ok') {
          backendState = 'live_api';
          return backendState;
        }
      }
    }
  } catch {
    // Expected on GitHub Pages where no FastAPI server is running
  }
  backendState = 'static_pages';
  return backendState;
}

export function getRuntimeMode(): 'unknown' | 'live_api' | 'static_pages' {
  return backendState;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) detail = errBody.detail;
    } catch {
      // ignore non-json error body
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

function readLocalTracking(): TrackedForecastRecord[] {
  try {
    const raw = localStorage.getItem(LS_TRACKING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeLocalTracking(list: TrackedForecastRecord[]): void {
  try {
    localStorage.setItem(LS_TRACKING_KEY, JSON.stringify(list.slice(0, 120)));
  } catch {
    // ignore storage errors
  }
}

function recordLocalAnalysisForecast(analysis: StockAnalysisResponse): void {
  const list = readLocalTracking();
  const fc = analysis.forecast;
  const idx = list.findIndex(
    (r) =>
      r.ticker === fc.ticker &&
      r.source_date === fc.starting_date &&
      r.horizon_code === fc.horizon_code &&
      r.record_origin === 'live_user'
  );
  const entry: TrackedForecastRecord = {
    id: idx >= 0 ? list[idx].id : Date.now() + Math.floor(Math.random() * 1000),
    created_at: new Date().toISOString(),
    ticker: fc.ticker,
    company_name: analysis.instrument.name,
    source_price: fc.starting_price,
    source_date: fc.starting_date,
    horizon_code: fc.horizon_code,
    horizon_label: fc.horizon_label,
    horizon_days: fc.horizon_trading_days,
    target_date: fc.target_date,
    predicted_direction: fc.direction,
    expected_return_pct: fc.expected_return_pct,
    range_68_low: fc.range_68_low,
    range_68_high: fc.range_68_high,
    prob_higher: fc.prob_higher,
    model_version: fc.model_version,
    record_origin: 'live_user',
    outcome_status: idx >= 0 ? list[idx].outcome_status : 'pending',
    realized_price: idx >= 0 ? list[idx].realized_price : null,
    realized_date: idx >= 0 ? list[idx].realized_date : null,
    realized_return_pct: idx >= 0 ? list[idx].realized_return_pct : null,
    directional_hit: idx >= 0 ? list[idx].directional_hit : null,
    within_68_range: idx >= 0 ? list[idx].within_68_range : null,
    abs_error_pct: idx >= 0 ? list[idx].abs_error_pct : null,
  };
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  writeLocalTracking(list);
}

function recordLocalRealizedCheck(resp: CandleAdvanceResponse): void {
  const list = readLocalTracking();
  const v = resp.verdict;
  const idx = list.findIndex(
    (r) =>
      r.ticker === v.ticker &&
      r.source_date === v.start_date &&
      r.horizon_code === v.horizon_code &&
      r.record_origin === 'live_user'
  );
  const realizedRecord: TrackedForecastRecord = {
    id: idx >= 0 ? list[idx].id : Date.now() + Math.floor(Math.random() * 1000),
    created_at: v.checked_at,
    ticker: v.ticker,
    company_name: v.company_name,
    source_price: v.start_price,
    source_date: v.start_date,
    horizon_code: v.horizon_code,
    horizon_label: v.horizon_label,
    horizon_days: v.steps_ran,
    target_date: v.end_date,
    predicted_direction: v.predicted_direction,
    expected_return_pct: v.predicted_return_pct,
    range_68_low: v.range_68_low,
    range_68_high: v.range_68_high,
    prob_higher: resp.locked_forecast.prob_higher,
    model_version: resp.updated_analysis.forecast.model_version,
    record_origin: 'live_user',
    outcome_status: 'realized',
    realized_price: v.end_price,
    realized_date: v.end_date,
    realized_return_pct: v.actual_return_pct,
    directional_hit: v.ai_got_it_right,
    within_68_range: v.within_68_range,
    abs_error_pct: Math.round(Math.abs(v.actual_return_pct - v.predicted_return_pct) * 100) / 100,
  };
  if (idx >= 0) list[idx] = realizedRecord;
  else list.unshift(realizedRecord);
  writeLocalTracking(list);
}

export async function searchInstruments(query: string): Promise<InstrumentSummary[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<InstrumentSummary[]>(`./api/search?q=${encodeURIComponent(query)}&limit=24`);
  }
  return clientSyntheticEngine.search(query);
}

export async function fetchMarketOverview(refresh = false): Promise<MarketOverviewResponse> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<MarketOverviewResponse>(`./api/market-overview?refresh=${refresh}`);
  }
  return clientSyntheticEngine.getMarketOverview();
}

export async function generateRandomStock(options?: {
  regime?: RegimeArchetype;
  sector?: string;
  custom_ticker?: string;
  custom_name?: string;
  horizon?: HorizonCode;
  timeframe?: TimeframeCode;
}): Promise<GenerateStockResponse> {
  const payload = {
    regime: options?.regime || 'random',
    sector: options?.sector,
    custom_ticker: options?.custom_ticker,
    custom_name: options?.custom_name,
    horizon: options?.horizon || '5d',
    timeframe: options?.timeframe || '3M',
  };
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<GenerateStockResponse>('./api/stocks/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  const generated = clientSyntheticEngine.generateRandomStock(
    payload.regime,
    payload.sector,
    payload.custom_ticker,
    payload.custom_name,
    payload.horizon,
    payload.timeframe
  );
  recordLocalAnalysisForecast(generated.analysis);
  return generated;
}

export async function advanceStockCandles(
  ticker: string,
  horizon: HorizonCode = '5d',
  steps?: number,
  timeframe: TimeframeCode = '3M'
): Promise<CandleAdvanceResponse> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<CandleAdvanceResponse>(`./api/stocks/${encodeURIComponent(sym)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horizon, steps, timeframe }),
    });
  }
  const resp = clientSyntheticEngine.advanceAndVerify(sym, horizon, steps, timeframe);
  recordLocalRealizedCheck(resp);
  recordLocalAnalysisForecast(resp.updated_analysis);
  return resp;
}

export async function fetchStockAnalysis(
  ticker: string,
  horizon: HorizonCode = '5d',
  refresh = false
): Promise<StockAnalysisResponse> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<StockAnalysisResponse>(
      `./api/stocks/${encodeURIComponent(sym)}/analysis?horizon=${horizon}&refresh=${refresh}`
    );
  }
  const an = clientSyntheticEngine.analyze(sym, horizon);
  recordLocalAnalysisForecast(an);
  return an;
}

export async function fetchStockChart(
  ticker: string,
  timeframe: TimeframeCode = '3M',
  refresh = false
): Promise<ChartSeriesResponse> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<ChartSeriesResponse>(
      `./api/stocks/${encodeURIComponent(sym)}/chart?timeframe=${timeframe}&refresh=${refresh}`
    );
  }
  return clientSyntheticEngine.getChart(sym, timeframe);
}

// --- Watchlist Persistence ---
interface StoredWatchSpec {
  ticker: string;
  preferred_horizon: HorizonCode;
}

function getLocalWatchSpecs(): StoredWatchSpec[] {
  try {
    const raw = localStorage.getItem(LS_WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWatchSpec[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  const defaults: StoredWatchSpec[] = [
    { ticker: 'VELX', preferred_horizon: '5d' },
    { ticker: 'KRNL', preferred_horizon: '5d' },
    { ticker: 'AETH', preferred_horizon: '5d' },
    { ticker: 'NEXO', preferred_horizon: '21d' },
    { ticker: 'SLST', preferred_horizon: '5d' },
    { ticker: 'CYPH', preferred_horizon: '5d' },
  ];
  try {
    localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(defaults));
  } catch {
    // ignore
  }
  return defaults;
}

function buildLocalWatchlist(specs: StoredWatchSpec[]): WatchlistItem[] {
  const out: WatchlistItem[] = [];
  for (let i = 0; i < specs.length; i++) {
    const { ticker, preferred_horizon } = specs[i];
    try {
      const an = clientSyntheticEngine.analyze(ticker, preferred_horizon);
      const ch = clientSyntheticEngine.getChart(ticker, '1M');
      out.push({
        ticker: an.instrument.ticker,
        name: an.instrument.name,
        sector: an.instrument.sector,
        position: i,
        latest_price: an.latest_price,
        change_pct: an.change_pct,
        preferred_horizon,
        horizon_label: an.forecast.horizon_label,
        forecast_direction: an.forecast.direction,
        direction_label: an.forecast.direction_label,
        expected_return_pct: an.forecast.expected_return_pct,
        range_low: an.forecast.range_68_low,
        range_high: an.forecast.range_68_high,
        prob_higher: an.forecast.prob_higher,
        last_analyzed_at: an.forecast.last_updated,
        sparkline: ch.bars.slice(-25).map((b) => b.close),
      });
    } catch {
      // skip invalid
    }
  }
  return out;
}

export async function fetchWatchlist(refresh = false): Promise<WatchlistItem[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>(`./api/watchlist?refresh=${refresh}`);
  }
  return buildLocalWatchlist(getLocalWatchSpecs());
}

export async function addWatchlistTicker(ticker: string, preferred_horizon: HorizonCode = '5d'): Promise<WatchlistItem[]> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>('./api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: sym, preferred_horizon }),
    });
  }
  clientSyntheticEngine.analyze(sym, preferred_horizon);
  const specs = getLocalWatchSpecs();
  const idx = specs.findIndex((s) => s.ticker === sym);
  if (idx >= 0) specs[idx].preferred_horizon = preferred_horizon;
  else specs.push({ ticker: sym, preferred_horizon });
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(specs));
  return buildLocalWatchlist(specs);
}

export async function removeWatchlistTicker(ticker: string): Promise<WatchlistItem[]> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>(`./api/watchlist/${encodeURIComponent(sym)}`, { method: 'DELETE' });
  }
  const specs = getLocalWatchSpecs().filter((s) => s.ticker !== sym);
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(specs));
  return buildLocalWatchlist(specs);
}

export async function reorderWatchlistTickers(tickers: string[]): Promise<WatchlistItem[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>('./api/watchlist/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });
  }
  const current = getLocalWatchSpecs();
  const bySym = new Map(current.map((c) => [c.ticker, c]));
  const next: StoredWatchSpec[] = [];
  for (const t of tickers) {
    const found = bySym.get(t.toUpperCase().trim());
    if (found) next.push(found);
  }
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
  return buildLocalWatchlist(next);
}

export async function fetchTrackedForecasts(ticker?: string): Promise<TrackedForecastRecord[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    const q = ticker ? `?ticker=${encodeURIComponent(ticker)}&limit=100` : '?limit=100';
    return fetchJson<TrackedForecastRecord[]>(`./api/tracking${q}`);
  }
  const local = readLocalTracking();
  // Also include recent walk-forward backtest audit points for the active or default stocks
  const seedSyms = ticker ? [ticker.toUpperCase().trim()] : ['VELX', 'KRNL', 'AETH'];
  const auditRows: TrackedForecastRecord[] = [];
  let seq = 10000;
  for (const sym of seedSyms) {
    try {
      const an = clientSyntheticEngine.analyze(sym, '5d');
      for (const pt of an.backtest.recent_walk_forward_points.slice(-6).reverse()) {
        const hit =
          (pt.predicted_return_pct >= 0 && pt.realized_return_pct >= 0) ||
          (pt.predicted_return_pct < 0 && pt.realized_return_pct < 0);
        const lo = Math.round(pt.source_price * (1 + pt.range_68_low_pct / 100) * 100) / 100;
        const hi = Math.round(pt.source_price * (1 + pt.range_68_high_pct / 100) * 100) / 100;
        auditRows.push({
          id: seq++,
          created_at: `${pt.origin_date}T20:00:00Z`,
          ticker: sym,
          company_name: an.instrument.name,
          source_price: pt.source_price,
          source_date: pt.origin_date,
          horizon_code: '5d',
          horizon_label: '5 trading days',
          horizon_days: 5,
          target_date: pt.target_date,
          predicted_direction: pt.predicted_return_pct >= 0.2 ? 'upside' : pt.predicted_return_pct <= -0.2 ? 'downside' : 'mixed',
          expected_return_pct: pt.predicted_return_pct,
          range_68_low: lo,
          range_68_high: hi,
          prob_higher: null,
          model_version: an.forecast.model_version,
          record_origin: 'walk_forward_audit',
          outcome_status: 'realized',
          realized_price: pt.realized_price,
          realized_date: pt.target_date,
          realized_return_pct: pt.realized_return_pct,
          directional_hit: hit,
          within_68_range: pt.realized_price >= lo && pt.realized_price <= hi,
          abs_error_pct: Math.round(Math.abs(pt.realized_return_pct - pt.predicted_return_pct) * 100) / 100,
        });
      }
    } catch {
      // ignore
    }
  }

  const combined = [...local, ...auditRows];
  if (ticker) {
    const clean = ticker.toUpperCase().trim();
    return combined.filter((r) => r.ticker === clean);
  }
  return combined;
}

export async function fetchProviderStatus(): Promise<{
  active_mode: string;
  provider_name: string;
  source_attribution: string;
  as_of_timestamp: string;
  market_status: string;
  is_demo_or_archive: boolean;
  configured_providers: string[];
  setup_instructions: string;
}> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson('./api/provider-status');
  }
  return {
    active_mode: 'live',
    provider_name: 'Browser Procedural Candle Engine (GitHub Pages Ready)',
    source_attribution: 'Client-Side Stochastic GARCH(1,1) + Multi-Regime Stock Generator',
    as_of_timestamp: 'Live Interactive Session',
    market_status: 'Procedural Candle Simulator Active',
    is_demo_or_archive: false,
    configured_providers: ['client-procedural-garch-engine'],
    setup_instructions:
      'Running 100% client-side in your browser — generate unlimited synthetic stocks and advance future candlesticks randomly to check whether the AI forecast got it right, with zero external API keys needed.',
  };
}
