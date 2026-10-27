import React from 'react';
import { ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3, CheckCircle2, ShieldAlert } from 'lucide-react';
import { SITE_COPY } from '../config/siteCopy';
import {
  ChartSeriesResponse,
  HorizonCode,
  MarketOverviewResponse,
  StockAnalysisResponse,
  TimeframeCode,
} from '../types';
import { FinancialChart } from '../components/FinancialChart';

interface OverviewHomeProps {
  previewTicker: string;
  onChangePreviewTicker: (sym: string) => void;
  previewAnalysis: StockAnalysisResponse | null;
  previewChart: ChartSeriesResponse | null;
  previewTimeframe: TimeframeCode;
  onChangePreviewTimeframe: (tf: TimeframeCode) => void;
  overview: MarketOverviewResponse | null;
  onStartAnalyzing: () => void;
  onExploreDashboard: (ticker?: string, horizon?: HorizonCode) => void;
  onOpenForecastsAudit: () => void;
}

const PREVIEW_TICKERS = [
  { sym: 'NVDA', label: 'NVIDIA' },
  { sym: 'AAPL', label: 'Apple' },
  { sym: 'MSFT', label: 'Microsoft' },
  { sym: 'GOOGL', label: 'Alphabet' },
  { sym: 'AMZN', label: 'Amazon' },
  { sym: 'TSLA', label: 'Tesla' },
];

export const OverviewHome: React.FC<OverviewHomeProps> = ({
  previewTicker,
  onChangePreviewTicker,
  previewAnalysis,
  previewChart,
  previewTimeframe,
  onChangePreviewTimeframe,
  overview,
  onStartAnalyzing,
  onExploreDashboard,
  onOpenForecastsAudit,
}) => {
  const fc = previewAnalysis?.forecast;
  const bt = previewAnalysis?.backtest;
  const fund = previewAnalysis?.fundamentals;
  const isPriceUp = (previewAnalysis?.change_pct ?? 0) >= 0;
  const isForecastUp = fc?.direction === 'upside';
  const isForecastDown = fc?.direction === 'downside';

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
              onClick={onStartAnalyzing}
              className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700 transition-colors"
            >
              <span>{SITE_COPY.hero.primaryCta}</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onExploreDashboard(previewTicker)}
              className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-medium text-[#111111] hover:border-[#111111] transition-colors"
            >
              <span>{SITE_COPY.hero.secondaryCta}</span>
            </button>
          </div>
        </div>

        {/* Live Software Preview Beneath Hero */}
        <div className="mt-10 rounded-xl border border-ink-200 bg-white shadow-[0_6px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Preview Window Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 bg-ink-50/70 px-4 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1.5 text-[11px] font-mono uppercase tracking-wider text-ink-400">
                Live Preview:
              </span>
              {PREVIEW_TICKERS.map((t) => {
                const active = previewTicker === t.sym;
                return (
                  <button
                    key={t.sym}
                    type="button"
                    onClick={() => onChangePreviewTicker(t.sym)}
                    className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                      active
                        ? 'bg-[#111111] text-white'
                        : 'bg-white border border-ink-200 text-ink-700 hover:border-[#111111]'
                    }`}
                  >
                    {t.sym}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              {overview && (
                <div className="hidden md:flex items-center gap-2 text-xs text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#111111]" />
                  <span>Market Trend:</span>
                  <span className="font-medium text-[#111111]">{overview.market_regime_label}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onExploreDashboard(previewTicker)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#111111] hover:underline"
              >
                <span>Open Full Analyst</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Preview Body: Chart + Forecast + Metrics */}
          {previewAnalysis && previewChart && fc ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-ink-200">
              {/* Left 8 Cols: Quote + Chart + Key Metrics */}
              <div className="lg:col-span-8 p-4 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#111111]">
                        {previewAnalysis.instrument.ticker}
                      </span>
                      <span className="text-sm text-ink-500">{previewAnalysis.instrument.name}</span>
                      <span className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
                        {previewAnalysis.instrument.exchange}
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
                        As of {previewAnalysis.provenance.as_of_timestamp}
                      </span>
                    </div>
                  </div>

                  {overview && overview.indices.length > 0 && (
                    <div className="flex items-center gap-4 text-xs tabular-nums">
                      {overview.indices.slice(0, 2).map((idx) => (
                        <div key={idx.symbol} className="text-right">
                          <div className="text-[10px] font-mono text-ink-400">{idx.display_symbol}</div>
                          <div className="font-mono font-medium text-[#111111]">
                            {idx.latest_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                            <span className={idx.change_pct >= 0 ? 'text-up' : 'text-down'}>
                              {idx.change_pct >= 0 ? '+' : ''}
                              {idx.change_pct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <FinancialChart
                  ticker={previewAnalysis.instrument.ticker}
                  bars={previewChart.bars}
                  timeframe={previewTimeframe}
                  onChangeTimeframe={onChangePreviewTimeframe}
                  forecast={fc}
                  height={305}
                  compactControls
                  fallbackNotice={previewChart.fallback_notice}
                />

                {/* Key Financial Metrics Strip */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-ink-200 pt-4">
                  <div>
                    <div className="text-[11px] text-ink-400">Market Cap</div>
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
                    <div className="text-[11px] text-ink-400">Revenue Growth</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fund?.revenue_growth_yoy_pct != null ? `+${fund.revenue_growth_yoy_pct.toFixed(1)}% YoY` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">52-Week Range</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      ${fund?.week52_low.toFixed(0)} – ${fund?.week52_high.toFixed(0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-400">Next Earnings</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#111111]">
                      {fund?.next_earnings_date || 'Scheduled TBD'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Cols: AI Forecast Snapshot */}
              <div className="lg:col-span-4 p-4 sm:p-6 bg-ink-50/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-ink-500">
                      AI FORECAST · {fc.horizon_label.toUpperCase()}
                    </span>
                    <span className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
                      {fc.data_quality} Data
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-500">Outlook</span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isForecastUp ? 'text-up' : isForecastDown ? 'text-down' : 'text-[#111111]'
                        }`}
                      >
                        {isForecastUp && <ArrowUpRight className="h-3.5 w-3.5" />}
                        {isForecastDown && <ArrowDownRight className="h-3.5 w-3.5" />}
                        {fc.direction_label}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3">
                      <span className="text-xs text-ink-500">Expected Move</span>
                      <span
                        className={`font-mono text-lg font-semibold tabular-nums ${
                          isForecastUp ? 'text-up' : isForecastDown ? 'text-down' : 'text-[#111111]'
                        }`}
                      >
                        {fc.expected_return_pct >= 0 ? '+' : ''}
                        {fc.expected_return_pct.toFixed(2)}%
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between text-xs">
                      <span className="text-ink-500">68% Range ({fc.target_date})</span>
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

                  {/* Evidence preview */}
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
                      Primary Quantitative Drivers
                    </div>
                    {fc.key_reasons.slice(0, 3).map((r, i) => (
                      <p key={i} className="text-xs leading-relaxed text-ink-700">
                        • {r}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Verified Backtest Badge */}
                {bt && (
                  <div className="mt-5 border-t border-ink-200 pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">Walk-Forward Backtest ({bt.sample_size} windows)</span>
                      <button
                        type="button"
                        onClick={onOpenForecastsAudit}
                        className="font-medium text-[#111111] underline underline-offset-2"
                      >
                        Audit →
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-ink-700">
                      <span>Dir. Acc: {bt.directional_accuracy_pct.toFixed(1)}%</span>
                      <span>
                        MAE: {bt.model_mae_pct.toFixed(2)}% (vs {bt.no_change_mae_pct.toFixed(2)}% baseline)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-ink-500">Loading quantitative market preview...</div>
          )}
        </div>
      </section>

      {/* Architectural Monochrome Methodology Strip (incorporating custom monochrome imagery) */}
      <section className="border-t border-ink-200 bg-ink-50/50 py-14">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
                QUANTITATIVE DISCIPLINE
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
                Built around measurable forecast quality, not bold promises.
              </h2>
              <p className="text-sm leading-relaxed text-ink-500">
                Every forecast combines multi-scale return patterns, RiskMetrics EWMA volatility scaling, S&amp;P 500
                and sector relative strength, valuation fundamentals, and scheduled earnings jump adjustments —
                validated chronologically with zero future-data leakage.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <BarChart3 className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Conformal Ranges</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Out-of-sample residual quantiles calibrate realistic 68% and 90% price intervals.
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <CheckCircle2 className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Baseline Audited</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Benchmarked directly against No-Change random walks and trailing historical drift.
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-4">
                  <ShieldAlert className="h-4 w-4 text-[#111111]" />
                  <div className="mt-2 text-xs font-semibold text-[#111111]">Explicit Uncertainty</div>
                  <p className="mt-1 text-xs text-ink-500 leading-relaxed">
                    Distinguishes measured facts from assumptions and highlights invalidation levels.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <img
                  src="./images/quant-methodology.png"
                  alt="Minimalist monochrome illustration of historical time-series paths converging into a calibrated probability forecast cone"
                  className="h-52 w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="border-t border-ink-100 px-3.5 py-2.5 text-[11px] text-ink-500">
                  <span className="font-mono font-medium text-[#111111]">01 ·</span> Horizon-purged walk-forward
                  trajectory &amp; split-conformal range calibration
                </figcaption>
              </figure>

              <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
                <img
                  src="./images/signal-perspective.png"
                  alt="Minimalist monochrome architectural geometric study representing multi-perspective market signal decomposition"
                  className="h-52 w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="border-t border-ink-100 px-3.5 py-2.5 text-[11px] text-ink-500">
                  <span className="font-mono font-medium text-[#111111]">02 ·</span> Multi-factor decomposition across
                  trend, volatility, fundamentals, and sector breadth
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Personal Story Section ("Made because Danish asked.") */}
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
