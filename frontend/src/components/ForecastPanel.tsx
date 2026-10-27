import React from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Calendar, CheckCircle2, Minus } from 'lucide-react';
import { HORIZON_OPTIONS } from '../config/siteCopy';
import { HorizonCode, HorizonForecast } from '../types';

interface ForecastPanelProps {
  forecast: HorizonForecast;
  selectedHorizon: HorizonCode;
  onSelectHorizon: (h: HorizonCode) => void;
  onViewAccuracyAudit?: () => void;
  loading?: boolean;
}

export const ForecastPanel: React.FC<ForecastPanelProps> = ({
  forecast,
  selectedHorizon,
  onSelectHorizon,
  onViewAccuracyAudit,
  loading = false,
}) => {
  const isUp = forecast.direction === 'upside';
  const isDown = forecast.direction === 'downside';

  const dirColorClass = isUp ? 'text-up' : isDown ? 'text-down' : 'text-ink-700';
  const dirPillClass = isUp
    ? 'border-up-border bg-up-soft text-up'
    : isDown
    ? 'border-down-border bg-down-soft text-down'
    : 'border-ink-200 bg-ink-50 text-ink-700';

  return (
    <aside className="rounded-lg border border-ink-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
      <div>
        {/* Header & Horizon Switcher */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-ink-500">
            AI FORECAST
          </span>
          <span className="text-[11px] font-mono text-ink-400">{forecast.model_version}</span>
        </div>

        <div className="mt-1 flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-[#111111]">
            {forecast.ticker} <span className="font-normal text-ink-400">·</span>{' '}
            <span className="font-normal text-ink-700">{forecast.horizon_label}</span>
          </h3>
        </div>

        {/* Horizon Selector */}
        <div className="mt-3 grid grid-cols-5 gap-1 rounded-md border border-ink-200 bg-ink-50 p-1">
          {HORIZON_OPTIONS.map((opt) => {
            const active = selectedHorizon === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                disabled={loading}
                onClick={() => onSelectHorizon(opt.code)}
                title={opt.fullLabel}
                className={`rounded py-1 text-center text-[11px] font-mono font-medium transition-colors ${
                  active
                    ? 'bg-[#111111] text-white shadow-sm'
                    : 'text-ink-500 hover:text-[#111111] hover:bg-white/60'
                }`}
              >
                {opt.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Scheduled Earnings Catalyst Notice */}
        {forecast.earnings_in_window && forecast.earnings_date_in_window && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-[#111111]">
            <Calendar className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-700" />
            <div>
              <span className="font-semibold">Earnings Event Inside Window:</span>{' '}
              <span className="font-mono">{forecast.earnings_date_in_window}</span>. Forecast range widened for event jump risk.
            </div>
          </div>
        )}

        {/* Core Quantitative Readout */}
        <div className="mt-4 divide-y divide-ink-100 border-y border-ink-200 text-sm">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">Outlook</span>
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${dirPillClass}`}
            >
              {isUp ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : isDown ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
              {forecast.direction_label}
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">
              Expected return <span className="text-ink-400">(from ${forecast.starting_price.toFixed(2)})</span>
            </span>
            <span className={`font-mono text-sm font-semibold tabular-nums ${dirColorClass}`}>
              {forecast.expected_return_pct >= 0 ? '+' : ''}
              {forecast.expected_return_pct.toFixed(2)}%
              <span className="ml-1.5 text-xs font-normal text-ink-500">
                (${forecast.expected_price.toFixed(2)})
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">Expected range (68% conformal)</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-[#111111]">
              ${forecast.range_68_low.toFixed(2)} – ${forecast.range_68_high.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">Target session</span>
            <span className="font-mono text-xs text-[#111111]">{forecast.target_date}</span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">Prob. of finishing higher</span>
            {forecast.prob_higher != null ? (
              <div className="text-right">
                <span className="font-mono text-xs font-semibold tabular-nums text-[#111111]">
                  {forecast.prob_higher.toFixed(1)}%
                </span>
                <span className="ml-1.5 text-[10px] text-ink-400">
                  {forecast.prob_calibrated ? '(Calibrated)' : '(Base-shrunk)'}
                </span>
              </div>
            ) : (
              <span className="text-xs text-ink-400">Validation limited</span>
            )}
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-500">Data quality</span>
            <span
              title={forecast.data_quality_detail}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#111111]"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-ink-500" />
              {forecast.data_quality}
            </span>
          </div>
        </div>

        {/* Key Supporting Signals */}
        <div className="mt-4">
          <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-500">
            Key Signals Supporting Outlook
          </h4>
          <ul className="mt-2 space-y-2">
            {forecast.key_reasons.slice(0, 4).map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-ink-700">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#111111]" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Main Downside & Invalidation Risks */}
        <div className="mt-4 pt-3 border-t border-ink-100">
          <h4 className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-500">
            <AlertTriangle className="h-3 w-3 text-ink-500" />
            <span>Risks &amp; Invalidation Conditions</span>
          </h4>
          <ul className="mt-2 space-y-1.5">
            {forecast.risks_and_invalidation.slice(0, 3).map((risk, idx) => (
              <li key={idx} className="text-xs leading-relaxed text-ink-500">
                • {risk}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer Timestamp & Audit Link */}
      <div className="mt-5 pt-3 border-t border-ink-200 flex items-center justify-between text-[11px] text-ink-400">
        <span>Data anchor: {forecast.starting_date}</span>
        {onViewAccuracyAudit && (
          <button
            type="button"
            onClick={onViewAccuracyAudit}
            className="font-medium text-[#111111] underline underline-offset-2 hover:text-ink-700"
          >
            Verify model accuracy →
          </button>
        )}
      </div>
    </aside>
  );
};
