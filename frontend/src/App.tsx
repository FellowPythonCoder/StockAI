import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addWatchlistTicker,
  advanceStockCandles,
  fetchMarketOverview,
  fetchStockAnalysis,
  fetchStockChart,
  fetchTrackedForecasts,
  fetchWatchlist,
  generateRandomStock,
  removeWatchlistTicker,
  reorderWatchlistTickers,
} from './api/client';
import { BrandLogo } from './components/BrandLogo';
import { SimulationProgressState } from './components/CandleSimulatorPanel';
import { FeedSettingsModal } from './components/FeedSettingsModal';
import { ChartSimulationOverlay } from './components/FinancialChart';
import { Navbar, NavTab } from './components/Navbar';
import { SearchCommandModal } from './components/SearchCommandModal';
import { SITE_COPY } from './config/siteCopy';
import {
  CandleBar,
  CandleCheckVerdict,
  ChartSeriesResponse,
  HorizonCode,
  MarketOverviewResponse,
  RegimeArchetype,
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

const DEFAULT_RECENT_TICKERS = [
  'VELX',
  'KRNL',
  'AETH',
  'NEXO',
  'SLST',
  'CYPH',
  'MRDN',
  'OBLX',
  'VRGX',
  'HLIX',
  'STRT',
  'ZENT',
];

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const App: React.FC = () => {
  const initialRoute = parseHashRoute();
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.tab);
  const [recentTickers, setRecentTickers] = useState<string[]>(DEFAULT_RECENT_TICKERS);
  const [activeTicker, setActiveTicker] = useState<string>(initialRoute.ticker || 'VELX');
  const [selectedHorizon, setSelectedHorizon] = useState<HorizonCode>('5d');
  const [timeframe, setTimeframe] = useState<TimeframeCode>('3M');
  const [regime, setRegime] = useState<RegimeArchetype>('random');

  // Homepage interactive preview state
  const [previewTicker, setPreviewTicker] = useState<string>('VELX');
  const [previewHorizon, setPreviewHorizon] = useState<HorizonCode>('5d');
  const [previewTimeframe, setPreviewTimeframe] = useState<TimeframeCode>('3M');
  const [previewAnalysis, setPreviewAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [previewChart, setPreviewChart] = useState<ChartSeriesResponse | null>(null);
  const [previewSimOverlay, setPreviewSimOverlay] = useState<ChartSimulationOverlay | null>(null);
  const [previewProgress, setPreviewProgress] = useState<SimulationProgressState | null>(null);
  const [previewVerdict, setPreviewVerdict] = useState<CandleCheckVerdict | null>(null);

  // Main Analyst & Candle Simulator state
  const [analysis, setAnalysis] = useState<StockAnalysisResponse | null>(null);
  const [chart, setChart] = useState<ChartSeriesResponse | null>(null);
  const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [trackedRecords, setTrackedRecords] = useState<TrackedForecastRecord[]>([]);

  const [simProgress, setSimProgress] = useState<SimulationProgressState | null>(null);
  const [simOverlay, setSimOverlay] = useState<ChartSimulationOverlay | null>(null);
  const [latestVerdict, setLatestVerdict] = useState<CandleCheckVerdict | null>(null);
  const [verdictHistory, setVerdictHistory] = useState<CandleCheckVerdict[]>([]);
  const [speedMs, setSpeedMs] = useState<number>(220);
  const [autoLoop, setAutoLoop] = useState<boolean>(false);
  const autoLoopRef = useRef<boolean>(false);
  autoLoopRef.current = autoLoop;

  const [generatingStock, setGeneratingStock] = useState<boolean>(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [feedSettingsOpen, setFeedSettingsOpen] = useState<boolean>(false);

  const registerRecentTicker = useCallback((sym: string) => {
    const clean = sym.toUpperCase().trim();
    setRecentTickers((prev) => [clean, ...prev.filter((t) => t !== clean)].slice(0, 14));
  }, []);

  const navigateTo = useCallback(
    (tab: NavTab, ticker?: string) => {
      if (tab !== 'analysis') setAutoLoop(false);
      setActiveTab(tab);
      if (ticker) {
        const clean = ticker.toUpperCase().trim();
        setActiveTicker(clean);
        registerRecentTicker(clean);
        window.location.hash = `#analysis/${clean}`;
      } else if (tab === 'analysis') {
        window.location.hash = `#analysis/${activeTicker}`;
      } else {
        window.location.hash = `#${tab}`;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeTicker, registerRecentTicker]
  );

  useEffect(() => {
    const onHash = () => {
      const parsed = parseHashRoute();
      setActiveTab(parsed.tab);
      if (parsed.ticker) setActiveTicker(parsed.ticker);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  useEffect(() => {
    fetchMarketOverview(false).then(setOverview).catch(() => null);
    fetchWatchlist(false).then(setWatchlist).catch(() => null);
    fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
  }, []);

  // Homepage Preview Loader
  useEffect(() => {
    let cancelled = false;
    setPreviewSimOverlay(null);
    Promise.all([
      fetchStockAnalysis(previewTicker, previewHorizon, false),
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
  }, [previewTicker, previewHorizon, previewTimeframe]);

  // Main Active Stock Loader
  const loadActiveAnalysis = useCallback(async (sym: string, hor: HorizonCode, forceRefresh = false) => {
    setLoadingAnalysis(true);
    setError(null);
    try {
      const res = await fetchStockAnalysis(sym, hor, forceRefresh);
      setAnalysis(res);
      fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to analyze ${sym}`);
    } finally {
      setLoadingAnalysis(false);
    }
  }, []);

  const loadActiveChart = useCallback(async (sym: string, tf: TimeframeCode, forceRefresh = false) => {
    setLoadingChart(true);
    try {
      const ch = await fetchStockChart(sym, tf, forceRefresh);
      setChart(ch);
    } catch {
      // handled in analysis
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    setSimOverlay(null);
    loadActiveAnalysis(activeTicker, selectedHorizon, false);
  }, [activeTicker, selectedHorizon, loadActiveAnalysis]);

  useEffect(() => {
    loadActiveChart(activeTicker, timeframe, false);
  }, [activeTicker, timeframe, loadActiveChart]);

  // Generate Brand-New Random Stock
  const handleGenerateRandomStock = useCallback(async () => {
    setAutoLoop(false);
    setGeneratingStock(true);
    setError(null);
    try {
      const targetTf = activeTab === 'overview' ? previewTimeframe : timeframe;
      const res = await generateRandomStock({
        regime,
        horizon: selectedHorizon,
        timeframe: targetTf,
      });
      const newSym = res.analysis.instrument.ticker;
      registerRecentTicker(newSym);

      if (activeTab === 'overview') {
        setPreviewTicker(newSym);
        setPreviewAnalysis(res.analysis);
        setPreviewChart(res.chart);
        setPreviewSimOverlay(null);
        setPreviewVerdict(null);
      } else {
        setActiveTicker(newSym);
        setAnalysis(res.analysis);
        setChart(res.chart);
        setSimOverlay(null);
        setLatestVerdict(null);
        setActiveTab('analysis');
        window.location.hash = `#analysis/${newSym}`;
      }
      fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate random stock');
    } finally {
      setGeneratingStock(false);
    }
  }, [activeTab, previewTimeframe, regime, registerRecentTicker, selectedHorizon, timeframe]);

  // Animate Random Future Candlesticks & Check Whether AI Got It Right (Main Simulator)
  const executeMainCandleRun = useCallback(
    async (customSteps?: number) => {
      if (!analysis || !chart) return;
      const activeTf: TimeframeCode = timeframe === '1D' || timeframe === '1W' ? '3M' : timeframe;
      if (activeTf !== timeframe) {
        setTimeframe('3M');
      }

      const baseChart = activeTf === timeframe ? chart : await fetchStockChart(activeTicker, activeTf, false);
      const baseBars: CandleBar[] = [...baseChart.bars];
      const maxWindow = baseBars.length;

      const resp = await advanceStockCandles(activeTicker, selectedHorizon, customSteps, activeTf);
      const genBars = resp.generated_bars;
      const locked = resp.locked_forecast;

      const overlayBase: ChartSimulationOverlay = {
        originTime: locked.starting_date,
        startPrice: locked.starting_price,
        predictedPrice: locked.expected_price,
        range68Low: locked.range_68_low,
        range68High: locked.range_68_high,
        isAnimating: true,
        verdict: null,
      };
      setSimOverlay(overlayBase);

      // Step-by-step candlestick animation
      const stride = genBars.length > 30 ? Math.ceil(genBars.length / 28) : 1;
      const frameDelay =
        speedMs === 0 ? 0 : genBars.length > 15 ? Math.max(35, Math.floor(speedMs * 0.45)) : speedMs;

      if (frameDelay > 0 && genBars.length > 0) {
        for (let i = 0; i < genBars.length; i += stride) {
          const endIdx = Math.min(genBars.length, i + stride);
          const partial = [...baseBars, ...genBars.slice(0, endIdx)].slice(-Math.max(maxWindow, 40));
          const latestBar = genBars[endIdx - 1];
          setChart({ ...baseChart, bars: partial });
          setSimProgress({
            isAnimating: true,
            currentStep: endIdx,
            totalSteps: genBars.length,
            livePrice: latestBar.close,
            startPrice: locked.starting_price,
            predictedUp: locked.expected_return_pct >= 0,
            lockedReturnPct: locked.expected_return_pct,
          });
          await sleep(frameDelay);
        }
      }

      // Finalize with verdict & updated AI forecast
      setSimProgress(null);
      setLatestVerdict(resp.verdict);
      setVerdictHistory((prev) => [resp.verdict, ...prev].slice(0, 50));
      setAnalysis(resp.updated_analysis);
      setChart(resp.updated_chart);
      setSimOverlay({
        ...overlayBase,
        isAnimating: false,
        verdict: resp.verdict,
      });

      fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
      fetchMarketOverview(false).then(setOverview).catch(() => null);
      fetchWatchlist(false).then(setWatchlist).catch(() => null);
    },
    [activeTicker, analysis, chart, selectedHorizon, speedMs, timeframe]
  );

  // Auto-Test Continuous Loop Effect
  useEffect(() => {
    if (!autoLoop || activeTab !== 'analysis') return;
    let active = true;
    const loop = async () => {
      while (active && autoLoopRef.current) {
        await executeMainCandleRun();
        if (!active || !autoLoopRef.current) break;
        await sleep(950);
      }
    };
    loop();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoop, activeTab]);

  // Animate Random Future Candlesticks inside Homepage Hero Preview
  const handleRunPreviewCandles = useCallback(
    async (customSteps?: number) => {
      if (!previewAnalysis || !previewChart) return;
      const activeTf: TimeframeCode =
        previewTimeframe === '1D' || previewTimeframe === '1W' ? '3M' : previewTimeframe;
      if (activeTf !== previewTimeframe) setPreviewTimeframe('3M');

      const baseChart =
        activeTf === previewTimeframe ? previewChart : await fetchStockChart(previewTicker, activeTf, false);
      const baseBars = [...baseChart.bars];
      const resp = await advanceStockCandles(previewTicker, previewHorizon, customSteps, activeTf);
      const genBars = resp.generated_bars;
      const locked = resp.locked_forecast;

      const overlayBase: ChartSimulationOverlay = {
        originTime: locked.starting_date,
        startPrice: locked.starting_price,
        predictedPrice: locked.expected_price,
        range68Low: locked.range_68_low,
        range68High: locked.range_68_high,
        isAnimating: true,
        verdict: null,
      };
      setPreviewSimOverlay(overlayBase);

      const stride = genBars.length > 30 ? Math.ceil(genBars.length / 24) : 1;
      for (let i = 0; i < genBars.length; i += stride) {
        const endIdx = Math.min(genBars.length, i + stride);
        const partial = [...baseBars, ...genBars.slice(0, endIdx)].slice(-Math.max(baseBars.length, 40));
        setPreviewChart({ ...baseChart, bars: partial });
        setPreviewProgress({
          isAnimating: true,
          currentStep: endIdx,
          totalSteps: genBars.length,
          livePrice: genBars[endIdx - 1].close,
          startPrice: locked.starting_price,
          predictedUp: locked.expected_return_pct >= 0,
          lockedReturnPct: locked.expected_return_pct,
        });
        await sleep(genBars.length > 12 ? 90 : 160);
      }

      setPreviewProgress(null);
      setPreviewVerdict(resp.verdict);
      setVerdictHistory((prev) => [resp.verdict, ...prev].slice(0, 50));
      setPreviewAnalysis(resp.updated_analysis);
      setPreviewChart(resp.updated_chart);
      setPreviewSimOverlay({
        ...overlayBase,
        isAnimating: false,
        verdict: resp.verdict,
      });

      if (previewTicker === activeTicker) {
        setAnalysis(resp.updated_analysis);
      }
      fetchTrackedForecasts().then(setTrackedRecords).catch(() => null);
    },
    [activeTicker, previewAnalysis, previewChart, previewHorizon, previewTicker, previewTimeframe]
  );

  const handleSelectStockFromAnywhere = (ticker: string, horizon?: HorizonCode) => {
    setAutoLoop(false);
    const clean = ticker.toUpperCase().trim();
    registerRecentTicker(clean);
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
        onGenerateRandomStock={handleGenerateRandomStock}
        onOpenFeedSettings={() => setFeedSettingsOpen(true)}
        provenance={analysis?.provenance || overview?.provenance}
        generatingStock={generatingStock}
      />

      <main className="flex-1">
        {activeTab === 'overview' && (
          <OverviewHome
            previewTicker={previewTicker}
            recentTickers={recentTickers}
            onChangePreviewTicker={(sym) => {
              registerRecentTicker(sym);
              setPreviewTicker(sym);
            }}
            previewHorizon={previewHorizon}
            onChangePreviewHorizon={setPreviewHorizon}
            previewAnalysis={previewAnalysis}
            previewChart={previewChart}
            previewTimeframe={previewTimeframe}
            onChangePreviewTimeframe={setPreviewTimeframe}
            overview={overview}
            onGenerateRandomStock={handleGenerateRandomStock}
            onRunPreviewCandles={handleRunPreviewCandles}
            previewSimOverlay={previewSimOverlay}
            previewProgress={previewProgress}
            previewVerdict={previewVerdict}
            verdictHistory={verdictHistory}
            generatingStock={generatingStock}
            onExploreDashboard={(sym) => handleSelectStockFromAnywhere(sym || previewTicker)}
            onOpenForecastsAudit={() => navigateTo('forecasts')}
          />
        )}

        {activeTab === 'analysis' && (
          <MarketAnalystView
            analysis={analysis}
            chart={chart}
            overview={overview}
            recentTickers={recentTickers}
            selectedHorizon={selectedHorizon}
            onSelectHorizon={setSelectedHorizon}
            timeframe={timeframe}
            onChangeTimeframe={setTimeframe}
            onSelectTicker={(sym) => handleSelectStockFromAnywhere(sym)}
            onOpenSearchModal={() => setSearchOpen(true)}
            onRefresh={handleRefreshWorkspace}
            regime={regime}
            onChangeRegime={setRegime}
            onGenerateRandomStock={handleGenerateRandomStock}
            onRunHorizonCheck={() => executeMainCandleRun()}
            onStepOneCandle={() => executeMainCandleRun(1)}
            autoLoop={autoLoop}
            onToggleAutoLoop={() => setAutoLoop((v) => !v)}
            speedMs={speedMs}
            onChangeSpeedMs={setSpeedMs}
            simProgress={simProgress}
            simOverlay={simOverlay}
            latestVerdict={latestVerdict}
            verdictHistory={verdictHistory}
            generatingStock={generatingStock}
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
            recentTickers={recentTickers}
            selectedHorizon={selectedHorizon}
            onSelectHorizon={setSelectedHorizon}
            onSelectTicker={(sym) => {
              registerRecentTicker(sym);
              setActiveTicker(sym.toUpperCase());
            }}
            verdictHistory={verdictHistory}
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
                registerRecentTicker(sym);
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
            onGenerateAndAddRandom={async () => {
              setLoadingWatchlist(true);
              try {
                const gen = await generateRandomStock({ regime: 'random', horizon: '5d', timeframe: '3M' });
                const newSym = gen.analysis.instrument.ticker;
                registerRecentTicker(newSym);
                const updated = await addWatchlistTicker(newSym, '5d');
                setWatchlist(updated);
              } finally {
                setLoadingWatchlist(false);
              }
            }}
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
            onGenerateRandomStock={handleGenerateRandomStock}
            onStartAnalyzing={() => navigateTo('analysis')}
          />
        )}
      </main>

      {/* Minimalist Monochrome Footer */}
      <footer className="border-t border-ink-200 bg-white py-8 mt-12">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <BrandLogo onClick={() => navigateTo('overview')} />
            <p className="text-xs text-ink-500 leading-relaxed">{SITE_COPY.responsibleDisclosure.shortBanner}</p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-ink-500">
            <button type="button" onClick={() => navigateTo('overview')} className="hover:text-[#111111]">
              Overview
            </button>
            <button type="button" onClick={() => navigateTo('analysis')} className="hover:text-[#111111]">
              Candle Simulator
            </button>
            <button type="button" onClick={() => navigateTo('forecasts')} className="hover:text-[#111111]">
              AI Accuracy
            </button>
            <button type="button" onClick={() => navigateTo('watchlist')} className="hover:text-[#111111]">
              Watchlist
            </button>
            <button type="button" onClick={() => navigateTo('about')} className="hover:text-[#111111]">
              About
            </button>
            <button type="button" onClick={handleGenerateRandomStock} className="font-medium text-[#111111] hover:underline">
              Random Stock
            </button>
          </div>
        </div>
      </footer>

      <SearchCommandModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTicker={(sym) => handleSelectStockFromAnywhere(sym)}
        onGenerateRandomStock={handleGenerateRandomStock}
      />

      <FeedSettingsModal
        isOpen={feedSettingsOpen}
        onClose={() => setFeedSettingsOpen(false)}
        onGenerateRandomStock={handleGenerateRandomStock}
      />
    </div>
  );
};

export default App;
