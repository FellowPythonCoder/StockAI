import React from 'react';
import {
  CheckCircle2,
  Dices,
  FastForward,
  Pause,
  Play,
  StepForward,
  XCircle,
} from 'lucide-react';
import { REGIME_OPTIONS } from '../config/siteCopy';
import { CandleCheckVerdict, HorizonForecast, RegimeArchetype } from '../types';

export interface SimulationProgressState {
  isAnimating: boolean;
  currentStep: number;
  totalSteps: number;
  livePrice: number;
  startPrice: number;
  predictedUp: boolean;
}

interface CandleSimulatorPanelProps {
  forecast: HorizonForecast;
  regime: RegimeArchetype;
  onChangeRegime: (r: RegimeArchetype) => void;
  onGenerateRandomStock: () => void;
  onRunHorizonCheck: () => void;
  onStepOneCandle: () => void;
  autoLoop: boolean;
  onToggleAutoLoop: () => void;
  speedMs: number;
  onChangeSpeedMs: (ms: number) => void;
  progress: SimulationProgressState | null;
  latestVerdict: CandleCheckVerdict | null;
  verdictHistory: CandleCheckVerdict[];
  generatingStock?: boolean;
  compact?: boolean;
}

export const CandleSimulatorPanel: React.FC<CandleSimulatorPanelProps> = ({
  forecast,
  regime,
  onChangeRegime,
  onGenerateRandomStock,
  onRunHorizonCheck,
  onStepOneCandle,
  autoLoop,
  onToggleAutoLoop,
  speedMs,
  onChangeSpeedMs,
  progress,
  latestVerdict,
  verdictHistory,
  generatingStock = false,
  compact = false,
}) => {
  const predUp = forecast.expected_return_pct >= 0;
  const totalChecks = verdictHistory.length;
  const rightCount = verdictHistory.filter((v) => v.ai_got_it_right).length;
  const winRate = totalChecks > 0 ? (rightCount / totalChecks) * 100 : 0;
  const coneHits = verdictHistory.filter((v) => v.within_68_range).length;

  const busy = Boolean(progress?.isAnimating) || generatingStock;

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-3.5">
      {/* Top Bar: Random Stock Generator + Live Candle Progress Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRunHorizonCheck}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-ink-700 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>
              Run {forecast.horizon_trading_days}{' '}
              {forecast.horizon_trading_days === 1 ? 'Candle' : 'Candles'} &amp; Check AI
            </span>
          </button>

          <button
            type="button"
            onClick={onStepOneCandle}
            disabled={busy}
            title="Advance 1 random candlestick and check the AI's 1-candle prediction"
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-[#111111] hover:border-[#111111] disabled:opacity-50 transition-colors"
          >
            <StepForward className="h-3.5 w-3.5" />
            <span>+1 Candle Check</span>
          </button>

          <button
            type="button"
            onClick={onToggleAutoLoop}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              autoLoop
                ? 'border-[#111111] bg-ink-100 text-[#111111]'
                : 'border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
            }`}
          >
            {autoLoop ? <Pause className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />}
            <span>{autoLoop ? 'Stop Auto-Test' : 'Auto-Test Loop'}</span>
          </button>

          {!compact && (
            <div className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 p-0.5 text-[11px] font-mono">
              {[
                { label: 'Smooth', ms: 220 },
                { label: 'Fast', ms: 75 },
                { label: 'Instant', ms: 0 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onChangeSpeedMs(s.ms)}
                  className={`rounded px-2 py-1 transition-colors ${
                    speedMs === s.ms ? 'bg-white text-[#111111] shadow-sm font-semibold' : 'text-ink-500 hover:text-[#111111]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Random Stock Generator Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!compact && (
            <select
              value={regime}
              onChange={(e) => onChangeRegime(e.target.value as RegimeArchetype)}
              aria-label="Random stock generator regime"
              className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-2 text-xs text-[#111111] focus:border-[#111111] focus:outline-none"
            >
              {REGIME_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={onGenerateRandomStock}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#111111] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#111111] hover:text-white disabled:opacity-50 transition-colors"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>{generatingStock ? 'Generating...' : 'Generate Random Stock'}</span>
          </button>
        </div>
      </div>

      {/* Active Locked AI Prediction Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-200 bg-ink-50/70 px-3.5 py-2 text-xs tabular-nums">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-500">Current AI Call:</span>
          <span className={`font-mono font-bold ${predUp ? 'text-up' : 'text-down'}`}>
            {predUp ? '▲ UP' : '▼ DOWN'} ({forecast.expected_return_pct >= 0 ? '+' : ''}
            {forecast.expected_return_pct.toFixed(2)}%)
          </span>
          <span className="text-ink-500">
            from <strong className="font-mono text-[#111111]">${forecast.starting_price.toFixed(2)}</strong> → Est{' '}
            <strong className="font-mono text-[#111111]">${forecast.expected_price.toFixed(2)}</strong>
          </span>
          <span className="hidden sm:inline text-ink-400">
            (68% Cone: ${forecast.range_68_low.toFixed(2)}–${forecast.range_68_high.toFixed(2)})
          </span>
        </div>

        {totalChecks > 0 && (
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-[#111111]">
              AI Score: <strong>{rightCount}/{totalChecks}</strong> ({winRate.toFixed(0)}% Right)
            </span>
            {!compact && (
              <span className="text-ink-500">
                68% Cone: {coneHits}/{totalChecks}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Live Animating Progress OR Verdict Banner */}
      {progress?.isAnimating ? (
        <div className="rounded-md border border-ink-300 bg-ink-50 px-4 py-3 space-y-2 tabular-nums">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-[#111111]">
              Running Random Candles... Candle {progress.currentStep} / {progress.totalSteps}
            </span>
            <span className="font-mono">
              Live Candle: <strong>${progress.livePrice.toFixed(2)}</strong> (
              <span className={progress.livePrice >= progress.startPrice ? 'text-up font-semibold' : 'text-down font-semibold'}>
                {progress.livePrice >= progress.startPrice ? '+' : ''}
                {((progress.livePrice / progress.startPrice - 1) * 100).toFixed(2)}%
              </span>
              )
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
            <div
              style={{ width: `${Math.min(100, (progress.currentStep / Math.max(1, progress.totalSteps)) * 100)}%` }}
              className="h-full bg-[#111111] transition-all duration-100"
            />
          </div>
        </div>
      ) : (
        latestVerdict && (
          <div
            className={`rounded-md border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 tabular-nums ${
              latestVerdict.ai_got_it_right
                ? 'border-up-border bg-up-soft'
                : 'border-down-border bg-down-soft'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {latestVerdict.ai_got_it_right ? (
                <CheckCircle2 className="h-5 w-5 text-up shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-down shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold uppercase tracking-wider ${
                      latestVerdict.ai_got_it_right ? 'text-up' : 'text-down'
                    }`}
                  >
                    {latestVerdict.ai_got_it_right ? '✓ AI GOT IT RIGHT!' : '✗ AI GOT IT WRONG'}
                  </span>
                  <span className="font-mono text-[11px] text-ink-700">
                    {latestVerdict.ticker} · {latestVerdict.steps_ran}{' '}
                    {latestVerdict.steps_ran === 1 ? 'Candle' : 'Candles'}
                  </span>
                  {latestVerdict.within_68_range && (
                    <span className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#111111]">
                      Inside 68% Cone
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#111111] leading-relaxed">{latestVerdict.verdict_summary}</p>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono text-xs shrink-0">
              <div className="text-ink-500">
                ${latestVerdict.start_price.toFixed(2)} →{' '}
                <strong className="text-[#111111]">${latestVerdict.end_price.toFixed(2)}</strong>
              </div>
              <div className={latestVerdict.actual_return_pct >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                Actual: {latestVerdict.actual_return_pct >= 0 ? '+' : ''}
                {latestVerdict.actual_return_pct.toFixed(2)}%
              </div>
            </div>
          </div>
        )
      )}

      {/* Recent Checks History Strip */}
      {!compact && verdictHistory.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-ink-100 text-[11px] font-mono">
          <span className="text-ink-400 shrink-0 mr-1">Recent AI Checks:</span>
          {verdictHistory.slice(0, 8).map((v, idx) => (
            <span
              key={`${v.checked_at}-${idx}`}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 shrink-0 ${
                v.ai_got_it_right
                  ? 'border-up-border bg-up-soft text-up'
                  : 'border-down-border bg-down-soft text-down'
              }`}
            >
              <span>{v.ai_got_it_right ? '✓ Right' : '✗ Wrong'}</span>
              <span className="text-[#111111]">{v.ticker}</span>
              <span>
                ({v.actual_return_pct >= 0 ? '+' : ''}
                {v.actual_return_pct.toFixed(1)}%)
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
