import {
  ChartSeriesResponse,
  HorizonCode,
  InstrumentSummary,
  MarketOverviewResponse,
  StockAnalysisResponse,
  TimeframeCode,
  TrackedForecastRecord,
  WatchlistItem,
} from '../types';

const LS_WATCHLIST_KEY = 'market_signal_watchlist_v2';
const LS_TRACKING_KEY = 'market_signal_tracking_v2';

let backendState: 'unknown' | 'live_api' | 'static_pages' = 'unknown';

const staticAnalysisCache = new Map<string, Record<HorizonCode, StockAnalysisResponse>>();
const staticChartsCache = new Map<string, Record<TimeframeCode, ChartSeriesResponse>>();
let staticCatalogCache: InstrumentSummary[] | null = null;

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

async function loadStaticCatalog(): Promise<InstrumentSummary[]> {
  if (staticCatalogCache) return staticCatalogCache;
  staticCatalogCache = await fetchJson<InstrumentSummary[]>('./static-data/catalog.json');
  return staticCatalogCache;
}

async function loadStaticTickerAnalysisMap(ticker: string): Promise<Record<HorizonCode, StockAnalysisResponse>> {
  const sym = ticker.toUpperCase().trim();
  const hit = staticAnalysisCache.get(sym);
  if (hit) return hit;
  try {
    const data = await fetchJson<Record<HorizonCode, StockAnalysisResponse>>(`./static-data/analysis/${sym}.json`);
    staticAnalysisCache.set(sym, data);
    return data;
  } catch {
    throw new Error(
      `Instrument '${sym}' is not in the precomputed GitHub Pages snapshot. Run the FastAPI server with a live provider API key to query arbitrary market symbols.`
    );
  }
}

export async function searchInstruments(query: string): Promise<InstrumentSummary[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<InstrumentSummary[]>(`./api/search?q=${encodeURIComponent(query)}&limit=20`);
  }
  const catalog = await loadStaticCatalog();
  const q = query.trim().toUpperCase();
  if (!q) return catalog.slice(0, 20);
  const scored = catalog
    .map((item) => {
      let score = 0;
      if (item.ticker === q) score = 1000;
      else if (item.ticker.startsWith(q)) score = 800;
      else if (item.ticker.includes(q)) score = 600;
      else if (item.name.toUpperCase().includes(q)) score = item.name.toUpperCase().startsWith(q) ? 500 : 350;
      else if (item.sector.toUpperCase().includes(q) || item.industry.toUpperCase().includes(q)) score = 200;
      return { score, item };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.ticker.localeCompare(b.item.ticker));
  return scored.slice(0, 20).map((x) => x.item);
}

export async function fetchMarketOverview(refresh = false): Promise<MarketOverviewResponse> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<MarketOverviewResponse>(`./api/market-overview?refresh=${refresh}`);
  }
  const ov = await fetchJson<MarketOverviewResponse>('./static-data/market-overview.json');
  return {
    ...ov,
    provenance: {
      ...ov.provenance,
      provider_name: 'Static Snapshot · GitHub Pages Mode',
      note: 'Running serverless on GitHub Pages using verified precomputed quantitative market snapshots.',
    },
  };
}

function recordStaticTrackingEntry(analysis: StockAnalysisResponse): void {
  try {
    const raw = localStorage.getItem(LS_TRACKING_KEY);
    const list: TrackedForecastRecord[] = raw ? JSON.parse(raw) : [];
    const fc = analysis.forecast;
    const existingIdx = list.findIndex(
      (r) =>
        r.ticker === fc.ticker &&
        r.source_date === fc.starting_date &&
        r.horizon_code === fc.horizon_code &&
        r.record_origin === 'live_user'
    );
    const entry: TrackedForecastRecord = {
      id: existingIdx >= 0 ? list[existingIdx].id : Date.now(),
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
      outcome_status: 'pending',
    };
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.unshift(entry);
    }
    localStorage.setItem(LS_TRACKING_KEY, JSON.stringify(list.slice(0, 60)));
  } catch {
    // ignore storage quota errors
  }
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
  if (refresh) {
    staticAnalysisCache.delete(sym);
  }
  const byHorizon = await loadStaticTickerAnalysisMap(sym);
  const picked = byHorizon[horizon] || byHorizon['5d'];
  const stamped: StockAnalysisResponse = {
    ...picked,
    provenance: {
      ...picked.provenance,
      provider_name: 'Static Snapshot · GitHub Pages Mode',
      fetched_at: new Date().toISOString(),
      note: 'Running serverless on GitHub Pages — forecasts and walk-forward backtests precomputed from verified historical data.',
    },
    forecast: {
      ...picked.forecast,
      last_updated: new Date().toISOString(),
    },
  };
  recordStaticTrackingEntry(stamped);
  return stamped;
}

export async function fetchStockChart(
  ticker: string,
  timeframe: TimeframeCode = '1Y',
  refresh = false
): Promise<ChartSeriesResponse> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<ChartSeriesResponse>(
      `./api/stocks/${encodeURIComponent(sym)}/chart?timeframe=${timeframe}&refresh=${refresh}`
    );
  }
  if (refresh) {
    staticChartsCache.delete(sym);
  }
  let map = staticChartsCache.get(sym);
  if (!map) {
    map = await fetchJson<Record<TimeframeCode, ChartSeriesResponse>>(`./static-data/charts/${sym}.json`);
    staticChartsCache.set(sym, map);
  }
  const series = map[timeframe] || map['1Y'];
  return {
    ...series,
    provenance: {
      ...series.provenance,
      provider_name: 'Static Snapshot · GitHub Pages Mode',
    },
  };
}

// --- Watchlist API (Server SQLite + Static localStorage Fallback) ---
interface StoredWatchSpec {
  ticker: string;
  preferred_horizon: HorizonCode;
}

async function buildStaticWatchlist(specs: StoredWatchSpec[]): Promise<WatchlistItem[]> {
  const out: WatchlistItem[] = [];
  for (let i = 0; i < specs.length; i++) {
    const { ticker, preferred_horizon } = specs[i];
    try {
      const map = await loadStaticTickerAnalysisMap(ticker);
      const an = map[preferred_horizon] || map['5d'];
      let chMap = staticChartsCache.get(ticker);
      if (!chMap) {
        chMap = await fetchJson<Record<TimeframeCode, ChartSeriesResponse>>(`./static-data/charts/${ticker}.json`);
        staticChartsCache.set(ticker, chMap);
      }
      const bars1m = chMap['1M']?.bars || [];
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
        sparkline: bars1m.slice(-25).map((b) => b.close),
      });
    } catch {
      // skip invalid symbol
    }
  }
  return out;
}

async function getStoredStaticSpecs(): Promise<StoredWatchSpec[]> {
  try {
    const raw = localStorage.getItem(LS_WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredWatchSpec[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback to seed
  }
  const seed = await fetchJson<WatchlistItem[]>('./static-data/watchlist-seed.json');
  const specs = seed.map((w) => ({ ticker: w.ticker, preferred_horizon: w.preferred_horizon }));
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(specs));
  return specs;
}

export async function fetchWatchlist(refresh = false): Promise<WatchlistItem[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>(`./api/watchlist?refresh=${refresh}`);
  }
  const specs = await getStoredStaticSpecs();
  return buildStaticWatchlist(specs);
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
  await loadStaticTickerAnalysisMap(sym); // validates ticker exists
  const specs = await getStoredStaticSpecs();
  const idx = specs.findIndex((s) => s.ticker === sym);
  if (idx >= 0) {
    specs[idx].preferred_horizon = preferred_horizon;
  } else {
    specs.push({ ticker: sym, preferred_horizon });
  }
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(specs));
  return buildStaticWatchlist(specs);
}

export async function removeWatchlistTicker(ticker: string): Promise<WatchlistItem[]> {
  const sym = ticker.toUpperCase().trim();
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    return fetchJson<WatchlistItem[]>(`./api/watchlist/${encodeURIComponent(sym)}`, { method: 'DELETE' });
  }
  const specs = (await getStoredStaticSpecs()).filter((s) => s.ticker !== sym);
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(specs));
  return buildStaticWatchlist(specs);
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
  const current = await getStoredStaticSpecs();
  const bySym = new Map(current.map((c) => [c.ticker, c]));
  const next: StoredWatchSpec[] = [];
  for (const t of tickers) {
    const found = bySym.get(t.toUpperCase().trim());
    if (found) next.push(found);
  }
  localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
  return buildStaticWatchlist(next);
}

export async function fetchTrackedForecasts(ticker?: string): Promise<TrackedForecastRecord[]> {
  const mode = await detectRuntimeMode();
  if (mode === 'live_api') {
    const q = ticker ? `?ticker=${encodeURIComponent(ticker)}&limit=100` : '?limit=100';
    return fetchJson<TrackedForecastRecord[]>(`./api/tracking${q}`);
  }
  const seed = await fetchJson<TrackedForecastRecord[]>('./static-data/tracking-seed.json');
  let local: TrackedForecastRecord[] = [];
  try {
    const raw = localStorage.getItem(LS_TRACKING_KEY);
    if (raw) local = JSON.parse(raw);
  } catch {
    local = [];
  }
  // Merge local user runs ahead of seed walk-forward audit records without duplicating
  const seen = new Set<string>();
  const combined: TrackedForecastRecord[] = [];
  for (const rec of [...local, ...seed]) {
    const key = `${rec.ticker}:${rec.source_date}:${rec.horizon_code}:${rec.record_origin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(rec);
  }
  if (ticker) {
    const sym = ticker.toUpperCase().trim();
    return combined.filter((r) => r.ticker === sym);
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
    active_mode: 'archival_demo',
    provider_name: 'Static Snapshot · GitHub Pages Mode',
    source_attribution: 'Yahoo Finance Verified Historical Snapshot (Precomputed)',
    as_of_timestamp: '2026-10-26',
    market_status: 'Static GitHub Pages Deployment',
    is_demo_or_archive: true,
    configured_providers: [],
    setup_instructions:
      'Currently running as a 100% static GitHub Pages build. To connect live Finnhub, Alpha Vantage, or Twelve Data API keys securely on the server, run the FastAPI backend locally or in cloud hosting with backend/.env configured.',
  };
}

export async function configureServerProviderKey(
  provider: 'finnhub' | 'alphavantage' | 'twelvedata',
  apiKey: string
): Promise<{ updated: boolean; configured_providers: string[] }> {
  const mode = await detectRuntimeMode();
  if (mode !== 'live_api') {
    throw new Error('Server-side API key storage requires running the FastAPI backend (not static GitHub Pages mode).');
  }
  return fetchJson('./api/provider-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
}
