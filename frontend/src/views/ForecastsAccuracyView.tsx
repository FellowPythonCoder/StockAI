import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import { HORIZON_OPTIONS, SITE_COPY } from '../config/siteCopy';
import { HorizonCode, StockAnalysisResponse, TrackedForecastRecord } from '../types';

interface ForecastsAccuracyViewProps {
  analysis: StockAnalysisResponse | null;
  selectedHorizon: HorizonCode;
  onSelectHorizon: (h: HorizonCode) => void;
  onSelectTicker: (ticker: string) => void;
  trackedRecords: TrackedForecastRecord[];
  onRefreshTracking: () => void;
  loading: boolean;
}

const AUDIT_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'AMD', 'JPM', 'LLY', 'SPY'];

export const ForecastsAccuracyView: React.FC<ForecastsAccuracyViewProps> = ({
  analysis,
  selectedHorizon,
  onSelectHorizon,
  onSelectTicker,
  trackedRecords,
  onRefreshTracking,
  loading,
}) => {
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'live_user' | 'walk_forward_audit'>('all');
  const [onlyCurrentTicker, setOnlyCurrentTicker] = useState<boolean>(false);

  const bt = analysis?.backtest;
  const activeTicker = analysis?.instrument.ticker || 'NVDA';

  const filteredRecords = trackedRecords.filter((rec) => {
    if (ledgerFilter !== 'all' && rec.record_origin !== ledgerFilter) return false;
    if (onlyCurrentTicker && rec.ticker !== activeTicker) return false;
    return true;
  });

  const realizedAuditRecords = filteredRecords.filter((r) => r.outcome_status === 'realized');
  const livePendingCount = trackedRecords.filter(
    (r) => r.record_origin === 'live_user' && r.outcome_status === 'pending'
  ).length;

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink-200 pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
            MODEL EVALUATION &amp; PREDICTION LEDGER
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
            Verified Forecast Accuracy &amp; Outcome Tracking
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-500">
            Chronological walk-forward backtests (strictly purged of future data) are separated from live forward
            predictions recorded in the tracking ledger.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefreshTracking}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Evaluation</span>
        </button>
      </div>

      {/* Instrument & Horizon Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono uppercase text-ink-500 mr-1">Audit Stock:</span>
          {AUDIT_TICKERS.map((sym) => (
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

      {/* SECTION 1: Verified Historical Walk-Forward Backtest */}
      {bt && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-2">
                <span className="rounded bg-[#111111] px-2 py-0.5 text-[10px] font-mono uppercase text-white">
                  Historical Backtest
                </span>
                <h2 className="text-base font-semibold text-[#111111]">
                  {bt.ticker} · {bt.horizon_label} Walk-Forward Evaluation
                </h2>
              </div>
              <p className="mt-1 text-xs text-ink-500">{bt.methodology}</p>
            </div>
            <div className="text-right font-mono text-xs text-ink-500">
              <div>
                Test Period: {bt.test_period_start} → {bt.test_period_end}
              </div>
              <div>
                Out-of-Sample Windows: {bt.sample_size} · Min Train Burn-In: {bt.train_min_observations}d
              </div>
            </div>
          </div>

          {bt.validation_limited && (
            <div className="flex items-center gap-2.5 rounded-lg border border-ink-300 bg-ink-50 p-3.5 text-xs text-[#111111]">
              <AlertCircle className="h-4 w-4 shrink-0 text-ink-700" />
              <span>
                <strong>Validation Limited:</strong> Independent non-overlapping sample count at this horizon is
                constrained by available listing history. Interpret directional accuracy and probability estimates with
                additional caution.
              </span>
            </div>
          )}

          {/* Core Verification Metrics vs Baselines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Directional Accuracy</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.directional_accuracy_pct.toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-ink-500">
                Hist. Drift Baseline: {bt.baseline_drift_directional_pct.toFixed(1)}% · p={bt.directional_p_value.toFixed(3)}
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
              <div className="text-[11px] font-mono uppercase text-ink-500">Conformal Interval Coverage</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.coverage_68_pct.toFixed(1)}% <span className="text-xs font-normal text-ink-400">(target 68%)</span>
              </div>
              <div className="mt-1 text-xs text-ink-500">
                90% Outer Band Coverage: {bt.coverage_90_pct.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="text-[11px] font-mono uppercase text-ink-500">Probability Calibration (Brier)</div>
              <div className="mt-1.5 text-2xl font-mono font-semibold text-[#111111]">
                {bt.brier_score.toFixed(4)}
              </div>
              <div className="mt-1 text-xs text-ink-500">
                Climatology Baseline: {bt.baseline_brier_score.toFixed(4)} (lower is better)
              </div>
            </div>
          </div>

          {/* Calibration Reliability Bins + Market Volatility Regime Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Probability Calibration Curve */}
            <div className="lg:col-span-6 rounded-lg border border-ink-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-[#111111]">
                Probability Calibration Reliability ({bt.ticker} · {bt.horizon_code})
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Compares predicted probability of finishing higher against observed out-of-sample hit rates.
              </p>

              {bt.calibration_bins.length === 0 ? (
                <p className="py-8 text-xs text-ink-400">
                  Insufficient independent validation bins to plot calibration curve at this horizon.
                </p>
              ) : (
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
                          title={`Predicted ${bin.predicted_mean}%`}
                          className="absolute top-0 bottom-0 w-0.5 bg-up"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 text-[11px] text-ink-400">
                    Black bar = empirical observed hit frequency; green tick = mean predicted probability.
                  </div>
                </div>
              )}
            </div>

            {/* Regime Breakdown */}
            <div className="lg:col-span-6 rounded-lg border border-ink-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-[#111111]">
                Performance Breakdown by Market Volatility Regime
              </h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Partitioned by S&amp;P 500 RiskMetrics annualized volatility at the moment each historical forecast was
                issued.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-ink-200 text-[11px] font-mono uppercase text-ink-500">
                      <th className="py-2 pr-3">Market Condition</th>
                      <th className="py-2 px-3 text-right">Samples</th>
                      <th className="py-2 px-3 text-right">Dir. Acc</th>
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

      {/* SECTION 2: Forecast Tracking System & Analysis History */}
      <section className="rounded-lg border border-ink-200 bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#111111]" />
              <h2 className="text-base font-semibold text-[#111111]">
                Forecast Tracking Ledger &amp; Realized Outcomes
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              Records prediction timestamp, source price, horizon, expected range, model version, and realized market
              outcome once elapsed ({livePendingCount} live forward predictions awaiting target session).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-ink-200 bg-ink-50 p-0.5 text-xs">
              {(
                [
                  ['all', 'All Records'],
                  ['live_user', 'Live Recorded'],
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
                <th className="py-2.5 px-4">Origin</th>
                <th className="py-2.5 px-4">Ticker</th>
                <th className="py-2.5 px-4">Source Date &amp; Price</th>
                <th className="py-2.5 px-4">Horizon → Target</th>
                <th className="py-2.5 px-4 text-right">Predicted Return</th>
                <th className="py-2.5 px-4 text-right">Predicted 68% Range</th>
                <th className="py-2.5 px-4 text-right">Realized Outcome</th>
                <th className="py-2.5 px-4 text-center">Verification</th>
                <th className="py-2.5 px-4">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-xs tabular-nums">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-ink-500">
                    No forecast records match the active filter. Analyze any stock to log a live tracked prediction.
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
                          {isLive ? 'Live' : 'Backtest'}
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
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold ${
                          pUp ? 'text-up' : 'text-down'
                        }`}
                      >
                        {pUp ? '+' : ''}
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
                            Awaiting {rec.target_date}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {rec.outcome_status === 'realized' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                                rec.directional_hit
                                  ? 'border-up-border bg-up-soft text-up'
                                  : 'border-down-border bg-down-soft text-down'
                              }`}
                            >
                              {rec.directional_hit ? 'Dir Hit' : 'Dir Miss'}
                            </span>
                            {rec.within_68_range && (
                              <span
                                title="Realized price landed inside 68% conformal forecast interval"
                                className="inline-flex items-center text-[10px] font-mono text-ink-500"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-0.5 text-ink-700" />
                                In 68%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-ink-400">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-ink-400">{rec.model_version}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {realizedAuditRecords.length > 0 && (
          <div className="border-t border-ink-200 bg-ink-50 px-5 py-3 text-xs text-ink-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              Showing {Math.min(40, filteredRecords.length)} of {filteredRecords.length} tracked entries.
            </span>
            <span>{SITE_COPY.responsibleDisclosure.shortBanner}</span>
          </div>
        )}
      </section>
    </div>
  );
};
