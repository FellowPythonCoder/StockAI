import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { HORIZON_OPTIONS, SITE_COPY } from '../config/siteCopy';
import { CandleCheckVerdict, HorizonCode, StockAnalysisResponse, TrackedForecastRecord } from '../types';

interface ForecastsAccuracyViewProps {
  analysis: StockAnalysisResponse | null;
  recentTickers: string[];
  selectedHorizon: HorizonCode;
  onSelectHorizon: (h: HorizonCode) => void;
  onSelectTicker: (ticker: string) => void;
  verdictHistory: CandleCheckVerdict[];
  trackedRecords: TrackedForecastRecord[];
  onRefreshTracking: () => void;
  loading: boolean;
}

export const ForecastsAccuracyView: React.FC<ForecastsAccuracyViewProps> = ({
  analysis,
  recentTickers,
  selectedHorizon,
  onSelectHorizon,
  onSelectTicker,
  verdictHistory,
  trackedRecords,
  onRefreshTracking,
  loading,
}) => {
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'live_user' | 'walk_forward_audit'>('all');
  const [onlyCurrentTicker, setOnlyCurrentTicker] = useState<boolean>(false);

  const bt = analysis?.backtest;
  const activeTicker = analysis?.instrument.ticker || 'VELX';

  const filteredRecords = trackedRecords.filter((rec) => {
    if (ledgerFilter !== 'all' && rec.record_origin !== ledgerFilter) return false;
    if (onlyCurrentTicker && rec.ticker !== activeTicker) return false;
    return true;
  });

  const liveChecks = verdictHistory.length;
  const liveRight = verdictHistory.filter((v) => v.ai_got_it_right).length;
  const liveWinPct = liveChecks > 0 ? (liveRight / liveChecks) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink-200 pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
            AI FORECAST VERIFICATION &amp; BACKTEST AUDIT
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
            Did the AI Get It Right? Live Scoreboard &amp; Walk-Forward Backtests
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-500">
            Tracks every live random candle check alongside chronological walk-forward historical backtests across
            synthetic stock regimes.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshTracking}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Scoreboard</span>
        </button>
      </div>

      {/* Live Candle Check Session Scoreboard */}
      <section className="rounded-lg border border-ink-200 bg-ink-50/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#111111]">Live Random Candle Verification Scoreboard</h2>
            <p className="text-xs text-ink-500">
              Results from running random future candlesticks against the AI&apos;s locked predictions in this session.
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
            <span>
              Checks Run: <strong>{liveChecks}</strong>
            </span>
            <span className="text-up">
              AI Got Right: <strong>{liveRight}</strong>
            </span>
            <span className="text-down">
              AI Got Wrong: <strong>{liveChecks - liveRight}</strong>
            </span>
            <span>
              Win Rate: <strong>{liveChecks > 0 ? `${liveWinPct.toFixed(1)}%` : '—'}</strong>
            </span>
          </div>
        </div>

        {verdictHistory.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {verdictHistory.slice(0, 6).map((v, i) => (
              <div
                key={`${v.checked_at}-${i}`}
                className={`rounded-md border p-3 text-xs tabular-nums bg-white ${
                  v.ai_got_it_right ? 'border-up-border' : 'border-down-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[#111111]">
                    {v.ticker} ({v.steps_ran}c)
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-mono font-bold text-[11px] ${
                      v.ai_got_it_right ? 'text-up' : 'text-down'
                    }`}
                  >
                    {v.ai_got_it_right ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>AI GOT IT RIGHT</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" />
                        <span>AI GOT IT WRONG</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 text-ink-700 font-mono text-[11px]">
                  AI Pred: {v.predicted_return_pct >= 0 ? 'UP ' : 'DOWN '}
                  ({v.predicted_return_pct >= 0 ? '+' : ''}
                  {v.predicted_return_pct.toFixed(2)}%) · Actual: {v.actual_return_pct >= 0 ? '+' : ''}
                  {v.actual_return_pct.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Synthetic Instrument & Horizon Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono uppercase text-ink-500 mr-1">Synthetic Stock:</span>
          {recentTickers.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => onSelectTicker(sym)}
              className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                activeTicker === sym
                  ? 'bg-[#111111] text-white'
                  : 'border border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono uppercase text-ink-500 mr-1">Horizon:</span>
          {HORIZON_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              onClick={() => onSelectHorizon(opt.code)}
              className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                selectedHorizon === opt.code
                  ? 'bg-[#111111] text-white'
                  : 'border border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Walk-Forward Backtest */}
      {bt && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-2">
                <span className="rounded bg-[#111111] px-2 py-0.5 text-[10px] font-mono uppercase text-white">
                  Walk-Forward Backtest
                </span>
                <h2 className="text-base font-semibold text-[#111111]">
                  {bt.ticker} · {bt.horizon_label} Historical Candle Evaluation
                </h2>
              </div>
              <p className="mt-1 text-xs text-ink-500">{bt.methodology}</p>
            </div>
            <div className="text-right font-mono text-xs text-ink-500">
              <div>
                Test Period: {bt.test_period_start} → {bt.test_period_end}
              </div>
              <div>Out-of-Sample Windows: {bt.sample_size}</div>
            </div>
          </div>

          {bt.validation_limited && (
            <div className="flex items-center gap-2.5 rounded-lg border border-ink-300 bg-ink-50 p-3.5 text-xs text-[#111111]">
              <AlertCircle className="h-4 w-4 shrink-0 text-ink-700" />
              <span>
                <strong>Validation Limited:</strong> Independent non-overlapping sample count at this horizon is
                constrained by synthetic history length.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Directional Hit Rate</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.directional_accuracy_pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-ink-500">
                Drift Baseline: {bt.baseline_drift_directional_pct.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Mean Absolute Error (MAE)</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.model_mae_pct.toFixed(2)}%
              </div>
              <div className="mt-1 text-xs text-ink-500">
                No-Change: {bt.no_change_mae_pct.toFixed(2)}% · Hist. Avg: {bt.historical_avg_mae_pct.toFixed(2)}%
              </div>
            </div>

            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Conformal Cone Coverage</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.coverage_68_pct.toFixed(1)}% <span className="text-xs font-normal text-ink-400">(target 68%)</span>
              </div>
              <div className="mt-1 text-xs text-ink-500">90% Outer Band: {bt.coverage_90_pct.toFixed(1)}%</div>
            </div>

            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Probability Calibration (Brier)</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">{bt.brier_score.toFixed(4)}</div>
              <div className="mt-1 text-xs text-ink-500">
                Baseline: {bt.baseline_brier_score.toFixed(4)} (lower is better)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-lg border border-ink-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-[#111111]">
                Probability Calibration Reliability ({bt.ticker} · {bt.horizon_code})
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Predicted probability of finishing higher vs observed out-of-sample candle hit rate.
              </p>

              <div className="mt-4 space-y-3">
                {bt.calibration_bins.map((bin, idx) => (
                  <div key={idx} className="space-y-1 text-xs tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-ink-700">
                        Predicted: <strong>{bin.predicted_mean.toFixed(1)}%</strong>{' '}
                        <span className="text-ink-400">(n={bin.count})</span>
                      </span>
                      <span className="font-mono text-[#111111]">
                        Observed Hit Rate: <strong>{bin.observed_rate.toFixed(1)}%</strong>
                      </span>
                    </div>
                    <div className="relative h-2 w-full rounded bg-ink-100 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, bin.observed_rate)}%` }}
                        className="h-full bg-[#111111] rounded"
                      />
                      <div
                        style={{ left: `${Math.min(99, bin.predicted_mean)}%` }}
                        className="absolute top-0 bottom-0 w-0.5 bg-up"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 rounded-lg border border-ink-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-[#111111]">Performance by Volatility Regime</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Partitioned by synthetic EWMA annualized volatility at each forecast origin.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-ink-200 text-[11px] font-mono uppercase text-ink-500">
                      <th className="py-2 pr-3">Regime</th>
                      <th className="py-2 px-3 text-right">Samples</th>
                      <th className="py-2 px-3 text-right">Hit Rate</th>
                      <th className="py-2 px-3 text-right">Model MAE</th>
                      <th className="py-2 pl-3 text-right">No-Change MAE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {bt.regime_breakdown.map((reg) => (
                      <tr key={reg.regime}>
                        <td className="py-2.5 pr-3 font-medium text-[#111111]">{reg.regime}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-ink-500">{reg.sample_size}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#111111]">
                          {reg.directional_accuracy_pct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#111111]">
                          {reg.model_mae_pct.toFixed(2)}%
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono text-ink-500">
                          {reg.no_change_mae_pct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Forecast Tracking Ledger */}
      <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#111111]" />
              <h2 className="text-base font-semibold text-[#111111]">
                Forecast Ledger &amp; Candle Verification Log
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              Every time you advance candles on a synthetic stock, pending predictions resolve automatically and mark
              whether the AI got it right.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-ink-200 bg-ink-50 p-0.5 text-xs">
              {(
                [
                  ['all', 'All Records'],
                  ['live_user', 'Live Candle Checks'],
                  ['walk_forward_audit', 'Backtest Audit'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setLedgerFilter(val)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    ledgerFilter === val ? 'bg-white text-[#111111] shadow-sm' : 'text-ink-500 hover:text-[#111111]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOnlyCurrentTicker((v) => !v)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-mono transition-colors ${
                onlyCurrentTicker
                  ? 'border-[#111111] bg-[#111111] text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
              }`}
            >
              {activeTicker} Only
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-[11px] font-mono uppercase text-ink-500">
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Synthetic Stock</th>
                <th className="py-2.5 px-4">Start Candle</th>
                <th className="py-2.5 px-4">Horizon</th>
                <th className="py-2.5 px-4 text-right">AI Predicted</th>
                <th className="py-2.5 px-4 text-right">68% Cone</th>
                <th className="py-2.5 px-4 text-right">Actual Candle Close</th>
                <th className="py-2.5 px-4 text-center">Did AI Get It Right?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-xs tabular-nums">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-500">
                    No records match this filter yet. Run future candles in the Candle Simulator to verify AI calls!
                  </td>
                </tr>
              ) : (
                filteredRecords.slice(0, 40).map((rec) => {
                  const isLive = rec.record_origin === 'live_user';
                  const pUp = rec.expected_return_pct >= 0;
                  const rUp = (rec.realized_return_pct ?? 0) >= 0;
                  return (
                    <tr key={`${rec.record_origin}-${rec.id}-${rec.source_date}`} className="hover:bg-ink-50/70">
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                            isLive
                              ? 'bg-[#111111] text-white'
                              : 'border border-ink-200 bg-ink-50 text-ink-700'
                          }`}
                        >
                          {isLive ? 'Live Check' : 'Backtest'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onSelectTicker(rec.ticker)}
                          className="font-mono font-semibold text-[#111111] hover:underline"
                        >
                          {rec.ticker}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-ink-700">
                        {rec.source_date} · <span className="text-[#111111]">${rec.source_price.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-ink-500">
                        {rec.horizon_code} → {rec.target_date}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-semibold ${pUp ? 'text-up' : 'text-down'}`}>
                        {pUp ? 'UP +' : 'DOWN '}
                        {rec.expected_return_pct.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-ink-700">
                        ${rec.range_68_low.toFixed(2)} – ${rec.range_68_high.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {rec.outcome_status === 'realized' && rec.realized_price != null ? (
                          <span className={rUp ? 'text-up font-semibold' : 'text-down font-semibold'}>
                            ${rec.realized_price.toFixed(2)} ({rUp ? '+' : ''}
                            {rec.realized_return_pct?.toFixed(2)}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-ink-400">
                            <Clock className="h-3 w-3" />
                            Run candles to test
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {rec.outcome_status === 'realized' ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold ${
                              rec.directional_hit
                                ? 'border-up-border bg-up-soft text-up'
                                : 'border-down-border bg-down-soft text-down'
                            }`}
                          >
                            {rec.directional_hit ? '✓ AI GOT IT RIGHT' : '✗ AI GOT IT WRONG'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-400">Awaiting Candles</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-ink-200 bg-ink-50 px-5 py-3 text-xs text-ink-500">
          {SITE_COPY.responsibleDisclosure.shortBanner}
        </div>
      </section>
    </div>
  );
};
