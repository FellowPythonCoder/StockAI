import React, { useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  CandleCheckVerdict,
  ChartSeriesResponse,
  HorizonCode,
  MarketOverviewResponse,
  RegimeArchetype,
  StockAnalysisResponse,
  TimeframeCode,
} from '../types';
import { CandleSimulatorPanel, SimulationProgressState } from '../components/CandleSimulatorPanel';
import { ChartSimulationOverlay, FinancialChart } from '../components/FinancialChart';
import { ForecastPanel } from '../components/ForecastPanel';
import { MarketOverviewStrip } from '../components/MarketOverviewStrip';
import { SITE_COPY } from '../config/siteCopy';

interface MarketAnalystViewProps {
  analysis: StockAnalysisResponse | null;
  chart: ChartSeriesResponse | null;
  overview: MarketOverviewResponse | null;
  recentTickers: string[];
  selectedHorizon: HorizonCode;
  onSelectHorizon: (h: HorizonCode) => void;
  timeframe: TimeframeCode;
  onChangeTimeframe: (tf: TimeframeCode) => void;
  onSelectTicker: (ticker: string) => void;
  onOpenSearchModal: () => void;
  onRefresh: () => void;
  regime: RegimeArchetype;
  onChangeRegime: (r: RegimeArchetype) => void;
  onGenerateRandomStock: () => void;
  onRunHorizonCheck: () => void;
  onStepOneCandle: () => void;
  autoLoop: boolean;
  onToggleAutoLoop: () => void;
  speedMs: number;
  onChangeSpeedMs: (ms: number) => void;
  simProgress: SimulationProgressState | null;
  simOverlay: ChartSimulationOverlay | null;
  latestVerdict: CandleCheckVerdict | null;
  verdictHistory: CandleCheckVerdict[];
  generatingStock: boolean;
  isInWatchlist: boolean;
  onToggleWatchlist: () => void;
  onNavigateForecasts: () => void;
  loadingAnalysis: boolean;
  loadingChart: boolean;
  error: string | null;
}

export const MarketAnalystView: React.FC<MarketAnalystViewProps> = ({
  analysis,
  chart,
  overview,
  recentTickers,
  selectedHorizon,
  onSelectHorizon,
  timeframe,
  onChangeTimeframe,
  onSelectTicker,
  onOpenSearchModal,
  onRefresh,
  regime,
  onChangeRegime,
  onGenerateRandomStock,
  onRunHorizonCheck,
  onStepOneCandle,
  autoLoop,
  onToggleAutoLoop,
  speedMs,
  onChangeSpeedMs,
  simProgress,
  simOverlay,
  latestVerdict,
  verdictHistory,
  generatingStock,
  isInWatchlist,
  onToggleWatchlist,
  onNavigateForecasts,
  loadingAnalysis,
  loadingChart,
  error,
}) => {
  const [showMacroContext, setShowMacroContext] = useState<boolean>(false);

  const isUp = (analysis?.change_pct ?? 0) >= 0;
  const fund = analysis?.fundamentals;
  const fc = analysis?.forecast;

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Synthetic Stock Search & Quick Switch Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white p-3">
        <button
          type="button"
          onClick={onOpenSearchModal}
          className="flex items-center justify-between w-full md:max-w-md rounded-md border border-ink-200 bg-ink-50/70 px-3.5 py-2 text-left text-xs text-ink-500 hover:border-[#111111] transition-colors"
        >
          <span className="flex items-center gap-2.5 truncate">
            <Search className="h-4 w-4 text-ink-400 shrink-0" />
            <span>Search synthetic company or type any 4-letter ticker to generate...</span>
          </span>
          <kbd className="ml-2 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
            /
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0">
          {recentTickers.map((sym) => {
            const active = analysis?.instrument.ticker === sym;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => onSelectTicker(sym)}
                className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors shrink-0 ${
                  active
                    ? 'bg-[#111111] text-white'
                    : 'border border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
                }`}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapsible Synthetic Market Overview Strip */}
      <div className="rounded-lg border border-ink-200 bg-ink-50/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowMacroContext((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#111111]"
          >
            <span>Synthetic Market &amp; Sector Indices</span>
            {showMacroContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {overview && !showMacroContext && (
            <div className="flex items-center gap-4 text-xs font-mono text-ink-700 overflow-x-auto">
              {overview.indices.map((idx) => (
                <span key={idx.symbol} className="shrink-0">
                  {idx.display_symbol}: {idx.latest_value.toLocaleString()}{' '}
                  <span className={idx.change_pct >= 0 ? 'text-up' : 'text-down'}>
                    ({idx.change_pct >= 0 ? '+' : ''}
                    {idx.change_pct.toFixed(2)}%)
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        {showMacroContext && (
          <div className="mt-3 pt-3 border-t border-ink-200">
            <MarketOverviewStrip overview={overview} onSelectSymbol={onSelectTicker} showSectors />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-down-border bg-down-soft p-4 text-sm text-down">
          <div className="font-semibold">Unable to complete synthetic stock analysis</div>
          <p className="mt-1 text-xs leading-relaxed">{error}</p>
        </div>
      )}

      {loadingAnalysis && !analysis ? (
        <div className="rounded-lg border border-ink-200 bg-white p-12 text-center space-y-3">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-[#111111]" />
          <div className="text-sm font-medium text-[#111111]">
            Generating synthetic candlestick history &amp; running quantitative AI calibration...
          </div>
        </div>
      ) : (
        analysis &&
        fc && (
          <>
            {/* Selected Synthetic Stock Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-ink-200 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-[#111111]">{analysis.instrument.ticker}</span>
                  <h1 className="text-xl font-semibold text-[#111111] sm:text-2xl">{analysis.instrument.name}</h1>
                  <span className="rounded border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-mono text-ink-700">
                    {analysis.instrument.exchange} · {analysis.instrument.sector}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-3 tabular-nums">
                  <span className="text-4xl font-semibold tracking-tight text-[#111111]">
                    ${analysis.latest_price.toFixed(2)}
                  </span>
                  <span className={`font-mono text-base font-semibold ${isUp ? 'text-up' : 'text-down'}`}>
                    {isUp ? '+' : ''}
                    {analysis.change_dollar.toFixed(2)} ({isUp ? '+' : ''}
                    {analysis.change_pct.toFixed(2)}%)
                  </span>
                  <span className="text-xs text-ink-400">
                    Candle High/Low: ${analysis.day_low.toFixed(2)} – ${analysis.day_high.toFixed(2)} · Vol:{' '}
                    {analysis.day_volume.toLocaleString()}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <span>{analysis.instrument.industry}</span>
                  <span>·</span>
                  <span>Current Candle Date: {analysis.provenance.as_of_timestamp}</span>
                  <span>·</span>
                  <span className="uppercase font-mono text-[11px] rounded bg-ink-100 px-1.5 py-0.5 text-[#111111]">
                    SYNTHETIC CANDLES
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onToggleWatchlist}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors ${
                    isInWatchlist
                      ? 'border-[#111111] bg-[#111111] text-white'
                      : 'border-ink-200 bg-white text-[#111111] hover:border-[#111111]'
                  }`}
                >
                  {isInWatchlist ? (
                    <>
                      <BookmarkCheck className="h-3.5 w-3.5" />
                      <span>In Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-3.5 w-3.5" />
                      <span>Save to Watchlist</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loadingAnalysis || loadingChart || Boolean(simProgress?.isAnimating)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingAnalysis || loadingChart ? 'animate-spin' : ''}`} />
                  <span>Recalculate</span>
                </button>
              </div>
            </div>

            {/* Interactive Candle Simulator & AI Accuracy Checker Bar */}
            <CandleSimulatorPanel
              forecast={fc}
              regime={regime}
              onChangeRegime={onChangeRegime}
              onGenerateRandomStock={onGenerateRandomStock}
              onRunHorizonCheck={onRunHorizonCheck}
              onStepOneCandle={onStepOneCandle}
              autoLoop={autoLoop}
              onToggleAutoLoop={onToggleAutoLoop}
              speedMs={speedMs}
              onChangeSpeedMs={onChangeSpeedMs}
              progress={simProgress}
              latestVerdict={latestVerdict && latestVerdict.ticker === analysis.instrument.ticker ? latestVerdict : latestVerdict}
              verdictHistory={verdictHistory}
              generatingStock={generatingStock}
            />

            {/* Primary Analysis Workspace: Candlestick Chart (Left 8) + AI Forecast Panel (Right 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 rounded-lg border border-ink-200 bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] relative">
                {(loadingChart || loadingAnalysis) && !simProgress?.isAnimating && (
                  <div className="absolute right-5 top-4 z-10 inline-flex items-center gap-1.5 rounded bg-ink-100 px-2 py-0.5 text-[11px] font-mono text-ink-700">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Updating...</span>
                  </div>
                )}
                <FinancialChart
                  ticker={analysis.instrument.ticker}
                  bars={chart?.bars || []}
                  timeframe={timeframe}
                  onChangeTimeframe={onChangeTimeframe}
                  forecast={fc}
                  simulationOverlay={simOverlay}
                  height={420}
                  fallbackNotice={chart?.fallback_notice}
                />
              </div>

              <div className="lg:col-span-4">
                <ForecastPanel
                  forecast={fc}
                  selectedHorizon={selectedHorizon}
                  onSelectHorizon={onSelectHorizon}
                  onViewAccuracyAudit={onNavigateForecasts}
                  loading={loadingAnalysis}
                />
              </div>
            </div>

            {/* Multi-Horizon Forecast Term Structure */}
            <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-[#111111]">
                    Multi-Horizon AI Forecast Term Structure ({analysis.instrument.ticker})
                  </h2>
                  <p className="text-xs text-ink-500">
                    Click any candle horizon to select how many random future candles will run when checking the AI.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-ink-400">Model: {fc.selected_model_name}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50/70 text-[11px] font-mono uppercase text-ink-500">
                      <th className="py-2.5 px-4">Candle Horizon</th>
                      <th className="py-2.5 px-4">Target Date</th>
                      <th className="py-2.5 px-4">AI Call</th>
                      <th className="py-2.5 px-4 text-right">Expected Return</th>
                      <th className="py-2.5 px-4 text-right">68% Price Cone</th>
                      <th className="py-2.5 px-4 text-right">Prob. Higher</th>
                      <th className="py-2.5 px-4 text-right">Backtest Hit Rate</th>
                      <th className="py-2.5 px-4 text-right">Backtest MAE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 text-xs tabular-nums">
                    {analysis.all_horizons_summary.map((row) => {
                      const active = row.horizon_code === selectedHorizon;
                      const rUp = row.expected_return_pct >= 0;
                      return (
                        <tr
                          key={row.horizon_code}
                          onClick={() => onSelectHorizon(row.horizon_code)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-ink-100/70 font-medium' : 'hover:bg-ink-50'
                          }`}
                        >
                          <td className="py-3 px-4 text-[#111111]">
                            {row.horizon_label} ({row.horizon_days}c)
                          </td>
                          <td className="py-3 px-4 font-mono text-ink-500">{row.target_date}</td>
                          <td className="py-3 px-4">
                            <span className={rUp ? 'text-up font-medium' : 'text-down font-medium'}>
                              {rUp ? 'UP · Upside' : 'DOWN · Downside'}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-right font-mono font-semibold ${rUp ? 'text-up' : 'text-down'}`}>
                            {row.expected_return_pct >= 0 ? '+' : ''}
                            {row.expected_return_pct.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#111111]">
                            ${row.range_68_low.toFixed(2)} – ${row.range_68_high.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-700">
                            {row.prob_higher != null ? `${row.prob_higher.toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#111111]">
                            {row.directional_accuracy_pct.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-500">
                            {row.model_mae_pct.toFixed(2)}%{' '}
                            <span className="text-ink-400">(vs {row.no_change_mae_pct.toFixed(2)}%)</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Synthetic Fundamentals + Factor Attribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-5 rounded-lg border border-ink-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-ink-200 pb-3">
                  <h2 className="text-sm font-semibold text-[#111111]">Synthetic Company Profile &amp; Risk Metrics</h2>
                  <span className="text-[11px] font-mono text-ink-400">As of {fund?.fundamentals_as_of}</span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-xs tabular-nums">
                  {[
                    ['Synthetic Market Cap', fund?.market_cap_fmt || 'N/A'],
                    ['Trailing P/E', fund?.pe_trailing != null ? `${fund.pe_trailing.toFixed(2)}x` : 'N/A'],
                    ['Forward P/E', fund?.pe_forward != null ? `${fund.pe_forward.toFixed(2)}x` : 'N/A'],
                    ['Synthetic EPS (TTM)', fund?.eps_ttm != null ? `$${fund.eps_ttm.toFixed(2)}` : 'N/A'],
                    ['Synthetic Revenue', fund?.revenue_ttm_fmt || 'N/A'],
                    [
                      'Revenue Growth (YoY)',
                      fund?.revenue_growth_yoy_pct != null
                        ? `${fund.revenue_growth_yoy_pct >= 0 ? '+' : ''}${fund.revenue_growth_yoy_pct.toFixed(1)}%`
                        : 'N/A',
                    ],
                    ['Gross Margin', fund?.gross_margin_pct != null ? `${fund.gross_margin_pct.toFixed(1)}%` : 'N/A'],
                    ['Profit Margin', fund?.profit_margin_pct != null ? `${fund.profit_margin_pct.toFixed(1)}%` : 'N/A'],
                    ['Beta (vs MSX 500)', fund?.beta != null ? fund.beta.toFixed(2) : 'N/A'],
                    ['EWMA Annualized Vol', `${fc.annualized_volatility_pct.toFixed(1)}%`],
                    ['52-Week High / Low', `$${fund?.week52_high.toFixed(2)} / $${fund?.week52_low.toFixed(2)}`],
                    ['20-Candle Avg Vol', fund ? fund.avg_volume_20d.toLocaleString() : 'N/A'],
                  ].map(([label, val]) => (
                    <div key={label} className="border-b border-ink-100 pb-2">
                      <dt className="text-[11px] text-ink-500">{label}</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-[#111111]">{val}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="lg:col-span-7 rounded-lg border border-ink-200 bg-white p-5 space-y-5">
                <div className="border-b border-ink-200 pb-3">
                  <h2 className="text-sm font-semibold text-[#111111]">
                    Quantitative Candlestick Factor Attribution
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-500">{fc.model_selection_reason}</p>
                </div>

                <div className="space-y-2">
                  {fc.factor_contributions.slice(0, 6).map((f) => {
                    const absW = Math.min(100, Math.abs(f.standardized_weight) * 900);
                    const pos = f.impact_direction === 'positive';
                    const neg = f.impact_direction === 'negative';
                    return (
                      <div key={f.name} className="grid grid-cols-12 items-center gap-2 text-xs">
                        <div className="col-span-5 truncate font-medium text-[#111111]" title={f.description}>
                          {f.name}
                        </div>
                        <div className="col-span-3 font-mono text-[11px] text-ink-500 text-right">
                          {f.measured_value}
                        </div>
                        <div className="col-span-4 flex items-center gap-2">
                          <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                            <div
                              style={{ width: `${Math.max(8, absW)}%` }}
                              className={`h-full rounded-full ${
                                pos ? 'bg-up' : neg ? 'bg-down' : 'bg-ink-400'
                              }`}
                            />
                          </div>
                          <span
                            className={`w-12 text-right font-mono text-[10px] ${
                              pos ? 'text-up' : neg ? 'text-down' : 'text-ink-400'
                            }`}
                          >
                            {f.standardized_weight >= 0 ? '+' : ''}
                            {f.standardized_weight.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-ink-200">
                  <div className="rounded-md border border-ink-200 bg-ink-50/50 p-3.5">
                    <h3 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#111111]">
                      Observed Candle Facts
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-xs text-ink-700 leading-relaxed">
                      {fc.measured_facts.map((fact, idx) => (
                        <li key={idx}>• {fact}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-md border border-ink-200 bg-ink-50/50 p-3.5">
                    <h3 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#111111]">
                      Stochastic Model Assumptions
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-xs text-ink-500 leading-relaxed">
                      {fc.model_assumptions.map((assump, idx) => (
                        <li key={idx}>• {assump}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>

            {/* Synthetic Company Catalysts */}
            {analysis.news_developments.length > 0 && (
              <section className="rounded-lg border border-ink-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-ink-200 pb-3">
                  <h2 className="text-sm font-semibold text-[#111111]">
                    Generated Company Events &amp; Catalysts ({analysis.instrument.ticker})
                  </h2>
                  <span className="text-[11px] text-ink-400">Procedural synthetic wire</span>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.news_developments.map((item, idx) => (
                    <article key={idx} className="rounded-md border border-ink-200 p-4">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-ink-400">
                        <span>
                          {item.published_at} · {item.source}
                        </span>
                        <span className="uppercase rounded border border-ink-200 px-1.5 py-0.5 text-[10px] text-ink-700">
                          {item.category}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-[#111111] leading-snug">{item.headline}</h3>
                      <p className="mt-1.5 text-xs text-ink-500 leading-relaxed">{item.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-500 flex items-center justify-between gap-4">
              <span>{SITE_COPY.responsibleDisclosure.shortBanner}</span>
              <button
                type="button"
                onClick={onNavigateForecasts}
                className="shrink-0 inline-flex items-center gap-1 font-medium text-[#111111] hover:underline"
              >
                <span>Open AI Accuracy Scoreboard</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
};
