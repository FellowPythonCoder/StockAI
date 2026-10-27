import React, { useCallback, useEffect, useState } from 'react';
import {
  addWatchlistTicker,
  fetchMarketOverview,
  fetchStockAnalysis,
  fetchStockChart,
  fetchTrackedForecasts,
  fetchWatchlist,
  removeWatchlistTicker,
  reorderWatchlistTickers,
} from './api/client';
import { BrandLogo } from './components/BrandLogo';
import { FeedSettingsModal } from './components/FeedSettingsModal';
import { Navbar, NavTab } from './components/Navbar';
import { SearchCommandModal } from './components/SearchCommandModal';
import { SITE_COPY } from './config/siteCopy';
import {
  ChartSeriesResponse,
  HorizonCode,
  MarketOverviewResponse,
  StockAnalysisResponse,
  TimeframeCode,
  TrackedForecastRecord,
  WatchlistItem,
} from './types';
import { AboutView } from './views/AboutView';
import { ForecastsAccuracyView } from './views/ForecastsAccuracyView';
import { MarketAnalystView } from './views/MarketAnalystView';
import { OverviewHome } from './views/OverviewHome';
import { WatchlistView } from './views/WatchlistView';

function parseHashRoute(): { tab: NavTab; ticker?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return { tab: 'overview' };
  const [seg, param] = raw.split('/');
  if (seg === 'analysis' || seg === 'analyze') {
    return { tab: 'analysis', ticker: param ? param.toUpperCase() : undefined };
  }
  if (seg === 'forecasts' || seg === 'watchlist' || seg === 'about' || seg === 'overview') {
    return { tab: seg };
  }
  return { tab: 'overview' };
}

export const App: React.FC = () => {
  const initialRoute = parseHashRoute();
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.tab);
  const [activeTicker, setActiveTicker] = useState<string>(initialRoute.ticker || 'NVDA');
  const [selectedHorizon, setSelectedHorizon] = useState<HorizonCode>('5d');
  const [timeframe, setTimeframe] = useState<TimeframeCode>('1Y');

  // Homepage interactive preview state
  const [previewTicker, setPreviewTicker] = useState<string>('NVDA');
  const [previewTimeframe, setPreviewTimeframe] = useState<TimeframeCode>('3M');
  const [previewAnalysis, setPreviewAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [previewChart, setPreviewChart] = useState<ChartSeriesResponse | null>(null);

  // Main Analyst state
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [chart, setChart] = useState<ChartSeriesResponse | null>(null);
  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [trackedRecords, setTrackedRecords] = useState<TrackedForecastRecord[]>([]);

  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [feedSettingsOpen, setFeedSettingsOpen] = useState<boolean>(false);

  const navigateTo = useCallback((tab: NavTab, ticker?: string) => {
    setActiveTab(tab);
    if (ticker) {
      setActiveTicker(ticker.toUpperCase());
      window.location.hash = `#analysis/${ticker.toUpperCase()}`;
    } else if (tab === 'analysis') {
      window.location.hash = `#analysis/${activeTicker}`;
    } else {
      window.location.hash = `#${tab}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTicker]);

  // Listen to browser hash navigation
  useEffect(() => {
    const onHash = () => {
      const parsed = parseHashRoute();
      setActiveTab(parsed.tab);
      if (parsed.ticker) setActiveTicker(parsed.ticker);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Global keyboard shortcut `/` or `Cmd+K` for Stock Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!inInput && e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initial load of Market Overview, Watchlist, and Tracking History
  useEffect(() => {
    fetchMarketOverview(false).then(setOverview).catch(() => null);
    fetchWatchlist(false).then(setWatchlist).catch(() => null);
    fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
  }, []);

  // Homepage Preview Loader
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchStockAnalysis(previewTicker, '5d', false),
      fetchStockChart(previewTicker, previewTimeframe, false),
    ])
      .then(([an, ch]) => {
        if (!cancelled) {
          setPreviewAnalysis(an);
          setPreviewChart(ch);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [previewTicker, previewTimeframe]);

  // Main Active Stock Analysis Loader
  const loadActiveAnalysis = useCallback(
    async (sym: string, hor: HorizonCode, forceRefresh = false) => {
      setLoadingAnalysis(true);
      setError(null);
      try {
        const res = await fetchStockAnalysis(sym, hor, forceRefresh);
        setAnalysis(res);
        // Refresh tracking ledger so newly logged forecast is visible
        fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to analyze ${sym}`);
      } finally {
        setLoadingAnalysis(false);
      }
    },
    []
  );

  const loadActiveChart = useCallback(async (sym: string, tf: TimeframeCode, forceRefresh = false) => {
    setLoadingChart(true);
    try {
      const ch = await fetchStockChart(sym, tf, forceRefresh);
      setChart(ch);
    } catch {
      // handled by analysis error if ticker invalid
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    loadActiveAnalysis(activeTicker, selectedHorizon, false);
  }, [activeTicker, selectedHorizon, loadActiveAnalysis]);

  useEffect(() => {
    loadActiveChart(activeTicker, timeframe, false);
  }, [activeTicker, timeframe, loadActiveChart]);

  const handleSelectStockFromAnywhere = (ticker: string, horizon?: HorizonCode) => {
    const clean = ticker.toUpperCase().trim();
    if (horizon) setSelectedHorizon(horizon);
    setActiveTicker(clean);
    setActiveTab('analysis');
    window.location.hash = `#analysis/${clean}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefreshWorkspace = async () => {
    await Promise.all([
      loadActiveAnalysis(activeTicker, selectedHorizon, true),
      loadActiveChart(activeTicker, timeframe, true),
      fetchMarketOverview(true).then(setOverview).catch(() => null),
    ]);
  };

  const isInWatchlist = watchlist.some((w) => w.ticker === activeTicker);

  const handleToggleWatchlist = async () => {
    setLoadingWatchlist(true);
    try {
      if (isInWatchlist) {
        const next = await removeWatchlistTicker(activeTicker);
        setWatchlist(next);
      } else {
        const next = await addWatchlistTicker(activeTicker, selectedHorizon);
        setWatchlist(next);
      }
    } finally {
      setLoadingWatchlist(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#111111]">
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => navigateTo(tab)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenFeedSettings={() => setFeedSettingsOpen(true)}
        provenance={analysis?.provenance || overview?.provenance}
      />

      <main className="flex-1">
        {activeTab === 'overview' && (
          <OverviewHome
            previewTicker={previewTicker}
            onChangePreviewTicker={setPreviewTicker}
            previewAnalysis={previewAnalysis}
            previewChart={previewChart}
            previewTimeframe={previewTimeframe}
            onChangePreviewTimeframe={setPreviewTimeframe}
            overview={overview}
            onStartAnalyzing={() => setSearchOpen(true)}
            onExploreDashboard={(sym) => handleSelectStockFromAnywhere(sym || previewTicker)}
            onOpenForecastsAudit={() => navigateTo('forecasts')}
          />
        )}

        {activeTab === 'analysis' && (
          <MarketAnalystView
            analysis={analysis}
            chart={chart}
            overview={overview}
            selectedHorizon={selectedHorizon}
            onSelectHorizon={setSelectedHorizon}
            timeframe={timeframe}
            onChangeTimeframe={setTimeframe}
            onSelectTicker={(sym) => handleSelectStockFromAnywhere(sym)}
            onOpenSearchModal={() => setSearchOpen(true)}
            onRefresh={handleRefreshWorkspace}
            isInWatchlist={isInWatchlist}
            onToggleWatchlist={handleToggleWatchlist}
            onNavigateForecasts={() => navigateTo('forecasts')}
            loadingAnalysis={loadingAnalysis}
            loadingChart={loadingChart}
            error={error}
          />
        )}

        {activeTab === 'forecasts' && (
          <ForecastsAccuracyView
            analysis={analysis}
            selectedHorizon={selectedHorizon}
            onSelectHorizon={setSelectedHorizon}
            onSelectTicker={(sym) => {
              setActiveTicker(sym.toUpperCase());
            }}
            trackedRecords={trackedRecords}
            onRefreshTracking={async () => {
              await loadActiveAnalysis(activeTicker, selectedHorizon, true);
              const updated = await fetchTrackedForecasts();
              setTrackedRecords(updated);
            }}
            loading={loadingAnalysis}
          />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistView
            items={watchlist}
            loading={loadingWatchlist}
            onAdd={async (sym, hor) => {
              setLoadingWatchlist(true);
              try {
                const updated = await addWatchlistTicker(sym, hor);
                setWatchlist(updated);
              } finally {
                setLoadingWatchlist(false);
              }
            }}
            onRemove={async (sym) => {
              setLoadingWatchlist(true);
              try {
                const updated = await removeWatchlistTicker(sym);
                setWatchlist(updated);
              } finally {
                setLoadingWatchlist(false);
              }
            }}
            onReorder={async (tickers) => {
              const updated = await reorderWatchlistTickers(tickers);
              setWatchlist(updated);
            }}
            onChangeItemHorizon={async (sym, hor) => {
              const updated = await addWatchlistTicker(sym, hor);
              setWatchlist(updated);
            }}
            onOpenStock={(sym, hor) => handleSelectStockFromAnywhere(sym, hor)}
            onRefreshAll={async () => {
              setLoadingWatchlist(true);
              try {
                const updated = await fetchWatchlist(true);
                setWatchlist(updated);
              } finally {
                setLoadingWatchlist(false);
              }
            }}
          />
        )}

        {activeTab === 'about' && (
          <AboutView
            onOpenFeedSettings={() => setFeedSettingsOpen(true)}
            onStartAnalyzing={() => navigateTo('analysis')}
          />
        )}
      </main>

      {/* Minimalist Monochrome Institutional Footer */}
      <footer className="border-t border-ink-200 bg-white py-8 mt-12">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <BrandLogo onClick={() => navigateTo('overview')} />
            <p className="text-xs text-ink-500 leading-relaxed">
              {SITE_COPY.responsibleDisclosure.shortBanner}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-ink-500">
            <button type="button" onClick={() => navigateTo('overview')} className="hover:text-[#111111]">
              Overview
            </button>
            <button type="button" onClick={() => navigateTo('analysis')} className="hover:text-[#111111]">
              Market Analysis
            </button>
            <button type="button" onClick={() => navigateTo('forecasts')} className="hover:text-[#111111]">
              Forecasts &amp; Backtests
            </button>
            <button type="button" onClick={() => navigateTo('watchlist')} className="hover:text-[#111111]">
              Watchlist
            </button>
            <button type="button" onClick={() => navigateTo('about')} className="hover:text-[#111111]">
              About
            </button>
            <button type="button" onClick={() => setFeedSettingsOpen(true)} className="hover:text-[#111111]">
              Data Feed
            </button>
          </div>
        </div>
      </footer>

      <SearchCommandModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTicker={(sym) => handleSelectStockFromAnywhere(sym)}
      />

      <FeedSettingsModal
        isOpen={feedSettingsOpen}
        onClose={() => setFeedSettingsOpen(false)}
        onSaved={handleRefreshWorkspace}
      />
    </div>
  );
};

export default App;
