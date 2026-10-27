import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Dices,
  HelpCircle,
  Loader2,
  Play,
  ShieldAlert,
  StepForward,
  XCircle,
} from 'lucide-react';
import { SITE_COPY } from '../config/siteCopy';
import {
  CandleCheckVerdict,
  ChartSeriesResponse,
  HorizonCode,
  MarketOverviewResponse,
  StockAnalysisResponse,
  TimeframeCode,
} from '../types';
import { ChartSimulationOverlay, FinancialChart } from '../components/FinancialChart';
import { formatAiMoveToken, SimulationProgressState } from '../components/CandleSimulatorPanel';

interface OverviewHomeProps {
  previewTicker: string;
  recentTickers: string[];
  onChangePreviewTicker: (sym: string) => void;
  previewHorizon: HorizonCode;
  onChangePreviewHorizon: (h: HorizonCode) => void;
  previewAnalysis: StockAnalysisResponse | null;
  previewChart: ChartSeriesResponse | null;
  previewTimeframe: TimeframeCode;
  onChangePreviewTimeframe: (tf: TimeframeCode) => void;
  overview: MarketOverviewResponse | null;
  onGenerateRandomStock: () => void;
  onRunPreviewCandles: (steps?: number) => void;
  previewSimOverlay: ChartSimulationOverlay | null;
  previewProgress: SimulationProgressState | null;
  previewVerdict: CandleCheckVerdict | null;
  verdictHistory: CandleCheckVerdict[];
  generatingStock: boolean;
  onExploreDashboard: (ticker?: string, horizon?: HorizonCode) => void;
  onOpenForecastsAudit: () => void;
}

export const OverviewHome: React.FC<OverviewHomeProps> = ({
  previewTicker,
  recentTickers,
  onChangePreviewTicker,
  previewHorizon,
  onChangePreviewHorizon,
  previewAnalysis,
  previewChart,
  previewTimeframe,
  onChangePreviewTimeframe,
  overview,
  onGenerateRandomStock,
  onRunPreviewCandles,
  previewSimOverlay,
  previewProgress,
  previewVerdict,
  verdictHistory,
  generatingStock,
  onExploreDashboard,
  onOpenForecastsAudit,
}) => {
  const [showPreviewWhy, setShowPreviewWhy] = useState<boolean>(false);
  const [showPreviewVerdictCard, setShowPreviewVerdictCard] = useState<boolean>(true);
  const fc = previewAnalysis?.forecast;
  const bt = previewAnalysis?.backtest;
  const fund = previewAnalysis?.fundamentals;
  const isPriceUp = (previewAnalysis?.change_pct ?? 0) >= 0;
  const displayedAiPct =
    previewProgress?.isAnimating && previewProgress.lockedReturnPct != null
      ? previewProgress.lockedReturnPct
      : fc?.expected_return_pct ?? 0;
  const isForecastUp = displayedAiPct >= 0;
  const busy = Boolean(previewProgress?.isAnimating) || generatingStock;
  const livePreviewPct =
    previewProgress?.isAnimating && previewProgress.startPrice > 0
      ? ((previewProgress.livePrice / previewProgress.startPrice - 1) * 100)
      : 0;
  const activeVerdict =
    previewVerdict && previewAnalysis && previewVerdict.ticker === previewAnalysis.instrument.ticker
      ? previewVerdict
      : null;

  const totalChecks = verdictHistory.length;
  const rightCount = verdictHistory.filter((v) => v.ai_got_it_right).length;

  return (
    <div className="bg-white">
      {/* Compact Executive Hero */}
      <section className="mx-auto max-w-[1360px] px-4 pt-12 pb-8 sm:px-6 lg:px-8 lg:pt-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-ink-700">
            <span className="h-1.5 w-1.5 rounded-full bg-[#111111]" />
            <span>{SITE_COPY.hero.eyebrow}</span>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-[#111111] sm:text-5xl sm:leading-[1.08]">
            {SITE_COPY.hero.headline}
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500 sm:text-lg">
            {SITE_COPY.hero.supportingText}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onGenerateRandomStock}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700 disabled:opacity-50 transition-colors"
            >
              <Dices className="h-4 w-4" />
              <span>{generatingStock ? 'Generating Stock...' : SITE_COPY.hero.primaryCta}</span>
            </button>

            <button
              type="button"
              onClick={() => onExploreDashboard(previewTicker)}
              className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-[#111111] hover:border-[#111111] transition-colors"
            >
              <span>{SITE_COPY.hero.secondaryCta}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live Interactive Random Stock & Candle Verification Preview Beneath Hero */}
        <div className="mt-10 rounded-xl border border-ink-200 bg-white shadow-[0_6px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Preview Window Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-ink-50/70 px-4 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Synthetic Stocks:
              </span>
              {recentTickers.slice(0, 6).map((sym) => {
                const active = previewTicker === sym;
                return (
                  <button
                    key={sym}
                    type="button"
                    disabled={busy}
                    onClick={() => onChangePreviewTicker(sym)}
                    className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                      active
                        ? 'bg-[#111111] text-white'
                        : 'bg-white border border-ink-200 text-ink-700 hover:border-[#111111]'
                    }`}
                  >
                    {sym}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={busy}
                onClick={onGenerateRandomStock}
                className="inline-flex items-center gap-1 rounded border border-[#111111] bg-white px-2.5 py-1 text-xs font-medium text-[#111111] hover:bg-[#111111] hover:text-white transition-colors"
              >
                <Dices className="h-3 w-3" />
                <span>+ New Random</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {totalChecks > 0 && (
                <span className="rounded bg-white border border-ink-200 px-2.5 py-0.5 font-mono text-xs text-[#111111]">
                  AI Score: <strong>{rightCount}/{totalChecks}</strong> Right
                </span>
              )}
              <button
                type="button"
                onClick={() => onExploreDashboard(previewTicker)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#111111] hover:underline"
              >
                <span>Full Candle Simulator</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Preview Body: Candlestick Chart + Live Run Bar + AI Forecast */}
          {previewAnalysis && previewChart && fc ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-ink-200">
              {/* Left 8 Cols: Quote + Interactive Run Candles Bar + Candlestick Chart */}
              <div className="lg:col-span-8 p-4 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#111111]">
                        {previewAnalysis.instrument.ticker}
                      </span>
                      <span className="text-sm text-ink-500">{previewAnalysis.instrument.name}</span>
                      <span className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
                        {previewAnalysis.instrument.sector}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                      <span className="text-3xl font-semibold tracking-tight text-[#111111]">
                        ${previewAnalysis.latest_price.toFixed(2)}
                      </span>
                      <span
                        className={`inline-flex items-center text-sm font-mono font-medium ${
                          isPriceUp ? 'text-up' : 'text-down'
                        }`}
                      >
                        {isPriceUp ? '+' : ''}
                        {previewAnalysis.change_dollar.toFixed(2)} ({isPriceUp ? '+' : ''}
                        {previewAnalysis.change_pct.toFixed(2)}%)
                      </span>
                      <span className="text-xs text-ink-400">
                        Candle {previewAnalysis.provenance.as_of_timestamp}
                      </span>
                    </div>
                  </div>

                  {/* Quick Run + [AI Thinks: 0.61+] + [Correct / Not Correct] Buttons right inside Hero Preview! */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRunPreviewCandles()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-2 text-xs font-semibold text-white hover:bg-ink-700 disabled:opacity-50 transition-colors"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>
                        Run {fc.horizon_trading_days}{' '}
                        {fc.horizon_trading_days === 1 ? 'Candle' : 'Candles'}
                      </span>
                    </button>

                    {/* What AI Thinks Button right next to Run (e.g. "AI Thinks: 0.61+") */}
                    <button
                      type="button"
                      onClick={() => setShowPreviewWhy((v) => !v)}
                      title="Click to inspect Super-Smart AI signals and switch horizon"
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-mono font-semibold tabular-nums transition-colors ${
                        isForecastUp
                          ? 'border-up-border bg-up-soft text-up hover:border-up'
                          : 'border-down-border bg-down-soft text-down hover:border-down'
                      }`}
                    >
                      {isForecastUp ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {previewProgress?.isAnimating ? 'AI Locked:' : 'AI Thinks:'}{' '}
                        <strong>{formatAiMoveToken(displayedAiPct)}</strong>
                      </span>
                    </button>

                    {/* After-Run Correctness Button right next to AI Thinks */}
                    {previewProgress?.isAnimating ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-ink-50 px-3 py-2 text-xs font-mono font-semibold text-[#111111] tabular-nums"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#111111]" />
                        <span>
                          Checking...{' '}
                          <span className={livePreviewPct >= 0 ? 'text-up' : 'text-down'}>
                            {formatAiMoveToken(livePreviewPct)}
                          </span>
                        </span>
                      </button>
                    ) : activeVerdict ? (
                      <button
                        type="button"
                        onClick={() => setShowPreviewVerdictCard((v) => !v)}
                        title="Click to toggle detailed AI verification summary"
                        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-mono font-bold tabular-nums transition-colors ${
                          activeVerdict.ai_got_it_right
                            ? 'border-up-border bg-up-soft text-up hover:border-up'
                            : 'border-down-border bg-down-soft text-down hover:border-down'
                        }`}
                      >
                        {activeVerdict.ai_got_it_right ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{activeVerdict.ai_got_it_right ? '✓ Correct!' : '✗ Not Correct'}</span>
                        <span className="font-normal text-[11px] text-[#111111]">
                          ({formatAiMoveToken(activeVerdict.predicted_return_pct)} →{' '}
                          {formatAiMoveToken(activeVerdict.actual_return_pct)})
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRunPreviewCandles()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 bg-ink-50/70 px-2.5 py-2 text-xs font-mono text-ink-500 hover:border-[#111111] hover:text-[#111111] disabled:opacity-50 transition-colors"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span>Was Correct?</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRunPreviewCandles(1)}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111] disabled:opacity-50 transition-colors"
                    >
                      <StepForward className="h-3.5 w-3.5" />
                      <span>+1</span>
                    </button>
                  </div>
                </div>

                {/* Multi-Horizon "AI Thinks" Buttons Strip right inside Hero Preview */}
                {previewAnalysis.all_horizons_summary.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-200 bg-ink-50/60 px-3 py-1.5 text-[11px] font-mono">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-ink-500 uppercase tracking-wider mr-1">AI Horizons:</span>
                      {previewAnalysis.all_horizons_summary.map((row) => {
                        const active = previewHorizon === row.horizon_code;
                        const rowUp = row.expected_return_pct >= 0;
                        return (
                          <button
                            key={row.horizon_code}
                            type="button"
                            disabled={busy}
                            onClick={() => onChangePreviewHorizon(row.horizon_code)}
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 transition-colors ${
                              active
                                ? 'border-[#111111] bg-[#111111] text-white font-semibold'
                                : 'border-ink-200 bg-white text-[#111111] hover:border-[#111111]'
                            }`}
                          >
                            <span className={active ? 'text-ink-300' : 'text-ink-500'}>
                              {row.horizon_code.toUpperCase()}
                            </span>
                            <span
                              className={
                                active
                                  ? rowUp
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                  : rowUp
                                  ? 'text-up font-semibold'
                                  : 'text-down font-semibold'
                              }
                            >
                              {formatAiMoveToken(row.expected_return_pct)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-ink-500">{fc.selected_model_name}</span>
                  </div>
                )}

                {showPreviewWhy && (
                  <div className="rounded-md border border-ink-200 bg-ink-50/50 p-3 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {fc.factor_contributions.slice(0, 3).map((item) => (
                      <div key={item.name} className="rounded border border-ink-200 bg-white px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#111111] truncate">{item.name}</span>
                          <span className="font-mono text-[11px] font-semibold text-[#111111]">
                            {item.measured_value}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-ink-500 truncate">{item.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Progress or Verdict Callout right above Preview Chart */}
                {previewProgress?.isAnimating ? (
                  <div className="rounded-md border border-ink-300 bg-ink-50 px-3.5 py-2 text-xs font-mono flex items-center justify-between">
                    <span>
                      Simulating Random Candle {previewProgress.currentStep} / {previewProgress.totalSteps} · Testing AI{' '}
                      <strong>{formatAiMoveToken(displayedAiPct)}</strong>
                    </span>
                    <span>
                      Live: <strong>${previewProgress.livePrice.toFixed(2)}</strong> (
                      <span className={livePreviewPct >= 0 ? 'text-up' : 'text-down'}>
                        {formatAiMoveToken(livePreviewPct)}
                      </span>
                      )
                    </span>
                  </div>
                ) : (
                  activeVerdict &&
                  showPreviewVerdictCard && (
                    <div
                      className={`rounded-md border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                        activeVerdict.ai_got_it_right
                          ? 'border-up-border bg-up-soft text-[#111111]'
                          : 'border-down-border bg-down-soft text-[#111111]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {activeVerdict.ai_got_it_right ? (
                          <CheckCircle2 className="h-4 w-4 text-up shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-down shrink-0" />
                        )}
                        <span>
                          <strong className={activeVerdict.ai_got_it_right ? 'text-up font-mono' : 'text-down font-mono'}>
                            {activeVerdict.ai_got_it_right ? '✓ AI WAS CORRECT: ' : '✗ AI WAS NOT CORRECT: '}
                          </strong>
                          {activeVerdict.verdict_summary}
                        </span>
                      </div>
                    </div>
                  )
                )}

                <FinancialChart
                  ticker={previewAnalysis.instrument.ticker}
                  bars={previewChart.bars}
                  timeframe={previewTimeframe}
                  onChangeTimeframe={onChangePreviewTimeframe}
                  forecast={fc}
                  simulationOverlay={previewSimOverlay}
                  height={305}
                  compactControls
                />

                {/* Synthetic Financial Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-ink-200 pt-4">
                  <div>
                    <div className="text-[11px] text-ink-400">Synthetic Cap</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fund?.market_cap_fmt || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">Trailing / Fwd P/E</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fund?.pe_trailing ? `${fund.pe_trailing.toFixed(1)}x` : 'N/A'}
                      {fund?.pe_forward ? ` / ${fund.pe_forward.toFixed(1)}x` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">Rev Growth</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fund?.revenue_growth_yoy_pct != null
                        ? `${fund.revenue_growth_yoy_pct >= 0 ? '+' : ''}${fund.revenue_growth_yoy_pct.toFixed(1)}% YoY`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">52W Range</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      ${fund?.week52_low.toFixed(0)} – ${fund?.week52_high.toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">EWMA Volatility</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fc.annualized_volatility_pct.toFixed(1)}% ann.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Cols: AI Forecast Snapshot */}
              <div className="lg:col-span-4 p-4 sm:p-6 bg-ink-50/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-ink-500">
                      NEXT AI CALL · {fc.horizon_trading_days} CANDLES
                    </span>
                    <span className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
                      Synthetic GARCH
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-500">AI Predicted Direction</span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isForecastUp ? 'text-up' : 'text-down'
                        }`}
                      >
                        {isForecastUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {isForecastUp ? 'UP · Potential Upside' : 'DOWN · Potential Downside'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3">
                      <span className="text-xs text-ink-500">Expected Move</span>
                      <span
                        className={`font-mono text-lg font-semibold tabular-nums ${
                          isForecastUp ? 'text-up' : 'text-down'
                        }`}
                      >
                        {fc.expected_return_pct >= 0 ? '+' : ''}
                        {fc.expected_return_pct.toFixed(2)}%
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between text-xs">
                      <span className="text-ink-500">68% Cone ({fc.target_date})</span>
                      <span className="font-mono font-semibold text-[#111111]">
                        ${fc.range_68_low.toFixed(2)} – ${fc.range_68_high.toFixed(2)}
                      </span>
                    </div>

                    {fc.prob_higher != null && (
                      <div className="mt-2 flex items-baseline justify-between text-xs">
                        <span className="text-ink-500">Prob. Finishing Higher</span>
                        <span className="font-mono font-medium text-[#111111]">{fc.prob_higher.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
                      Why the AI Made This Call
                    </div>
                    {fc.key_reasons.slice(0, 3).map((r, i) => (
                      <p key={i} className="text-xs leading-relaxed text-ink-700">
                        • {r}
                      </p>
                    ))}
                  </div>
                </div>

                {bt && (
                  <div className="mt-5 border-t border-ink-200 pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">Walk-Forward Backtest ({bt.sample_size} windows)</span>
                      <button
                        type="button"
                        onClick={onOpenForecastsAudit}
                        className="font-medium text-[#111111] underline underline-offset-2"
                      >
                        View Scoreboard →
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-ink-700">
                      <span>Backtest Hit Rate: {bt.directional_accuracy_pct.toFixed(1)}%</span>
                      <span>MAE: {bt.model_mae_pct.toFixed(2)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-ink-500">Generating synthetic candlestick universe...</div>
          )}
        </div>

        {overview && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500 px-1">
            <span>
              Synthetic Market Regime: <strong className="text-[#111111]">{overview.market_regime_label}</strong> —{' '}
              {overview.market_regime_summary}
            </span>
          </div>
        )}
      </section>

      {/* Architectural Monochrome Methodology Strip */}
      <section className="border-t border-ink-200 bg-ink-50/50 py-14">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
                STOCHASTIC CANDLE LAB
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
                Generate a stock, inspect the AI call, then run future candles to test it.
              </h2>
              <p className="text-sm leading-relaxed text-ink-500">
                Every stock is procedurally generated with realistic GARCH(1,1) volatility clustering, moving-average
                regimes, and random fat-tailed shocks. Because the AI model only sees past candlesticks—never the
                upcoming random shocks—running future candles is a genuine live test of whether the AI got it right.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <Dices className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Random Stock Engine</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Invent unlimited synthetic companies across momentum, mean-reverting, and high-volatility regimes.
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <BarChart3 className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Live Candle Progress</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Animate 1 to 126 random future candlesticks directly across the AI&apos;s locked forecast cone.
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <ShieldAlert className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Instant Right / Wrong Check</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Immediately checks if the AI got the direction right and tracks your live verification win rate.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <img
                  src="./images/quant-methodology.png"
                  alt="Minimalist monochrome illustration of candlestick paths converging into a calibrated probability forecast cone"
                  className="h-52 w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="border-t border-ink-100 px-3.5 py-2.5 text-[11px] text-ink-500">
                  <span className="font-mono font-medium text-[#111111]">01 ·</span> Locked AI probability cone tested
                  against randomly progressing future candlesticks
                </figcaption>
              </figure>

              <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <img
                  src="./images/signal-perspective.png"
                  alt="Minimalist monochrome architectural geometric study representing multi-perspective signal decomposition"
                  className="h-52 w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="border-t border-ink-100 px-3.5 py-2.5 text-[11px] text-ink-500">
                  <span className="font-mono font-medium text-[#111111]">02 ·</span> Multi-factor decomposition across
                  candlestick trend, RSI tension, and synthetic sector breadth
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Personal Story Section ("my friend Tanish said") */}
      <section className="border-t border-ink-200 bg-white py-16">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7 space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-400">
                {SITE_COPY.personalStory.eyebrow}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
                {SITE_COPY.personalStory.heading}
              </h2>
              <p className="text-base leading-relaxed text-ink-700">
                {SITE_COPY.personalStory.body}
              </p>
              <p className="pt-1 text-xs text-ink-400">{SITE_COPY.personalStory.footnote}</p>
            </div>

            <div className="md:col-span-5">
              <figure className="overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                <img
                  src="./images/research-desk.png"
                  alt="Minimalist monochrome studio photograph of an open research sketchbook and anodized aluminum pen"
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
              </figure>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
