import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Dices,
  FastForward,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  StepForward,
  XCircle,
} from 'lucide-react';
import { REGIME_OPTIONS } from '../config/siteCopy';
import {
  CandleCheckVerdict,
  HorizonCode,
  HorizonForecast,
  HorizonSummaryRow,
  RegimeArchetype,
} from '../types';

/**
 * Formats a percentage move in crisp trailing-sign notation (e.g. +0.61% -> "0.61+", -0.84% -> "0.84-").
 */
export function formatAiMoveToken(pct: number): string {
  const absVal = Math.abs(pct).toFixed(2);
  return `${absVal}${pct >= 0 ? '+' : '-'}`;
}

export interface SimulationProgressState {
  isAnimating: boolean;
  currentStep: number;
  totalSteps: number;
  livePrice: number;
  startPrice: number;
  predictedUp: boolean;
  lockedReturnPct?: number;
}

interface CandleSimulatorPanelProps {
  forecast: HorizonForecast;
  allHorizons?: HorizonSummaryRow[];
  selectedHorizon?: HorizonCode;
  onSelectHorizon?: (h: HorizonCode) => void;
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

const SHORT_HORIZON_LABELS: Record<HorizonCode, string> = {
  '1d': '1D',
  '5d': '5D',
  '21d': '21D',
  '63d': '63D',
  '126d': '126D',
};

export const CandleSimulatorPanel: React.FC<CandleSimulatorPanelProps> = ({
  forecast,
  allHorizons,
  selectedHorizon,
  onSelectHorizon,
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
  const [showAiDrawer, setShowAiDrawer] = useState<boolean>(false);
  const [showVerdictDetails, setShowVerdictDetails] = useState<boolean>(true);

  const displayedAiPct =
    progress?.isAnimating && progress.lockedReturnPct != null
      ? progress.lockedReturnPct
      : forecast.expected_return_pct;
  const predUp = displayedAiPct >= 0;
  const aiToken = formatAiMoveToken(displayedAiPct);

  const verdictMatchesTicker = latestVerdict && latestVerdict.ticker === forecast.ticker ? latestVerdict : null;

  const totalChecks = verdictHistory.length;
  const rightCount = verdictHistory.filter((v) => v.ai_got_it_right).length;
  const winRate = totalChecks > 0 ? (rightCount / totalChecks) * 100 : 0;
  const coneHits = verdictHistory.filter((v) => v.within_68_range).length;

  const busy = Boolean(progress?.isAnimating) || generatingStock;

  const liveMovePct =
    progress?.isAnimating && progress.startPrice > 0
      ? ((progress.livePrice / progress.startPrice - 1) * 100)
      : 0;

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-3.5">
      {/* Primary Action Row: Run Button + [AI Thinks: 0.61+] Button + [Was Correct / Not Correct] Button */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. RUN BUTTON */}
          <button
            type="button"
            onClick={onRunHorizonCheck}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-ink-700 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>
              Run {forecast.horizon_trading_days}{' '}
              {forecast.horizon_trading_days === 1 ? 'Candle' : 'Candles'}
            </span>
          </button>

          {/* 2. WHAT AI THINKS BUTTON (e.g. "AI Thinks: 0.61+") RIGHT NEXT TO RUN */}
          <button
            type="button"
            onClick={() => setShowAiDrawer((v) => !v)}
            title="Click to inspect Super-Smart AI signals and switch forecast horizon"
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-mono font-semibold tabular-nums transition-colors ${
              predUp
                ? 'border-up-border bg-up-soft text-up hover:border-up'
                : 'border-down-border bg-down-soft text-down hover:border-down'
            }`}
          >
            {predUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            <span>
              {progress?.isAnimating ? 'AI Locked:' : 'AI Thinks:'} <strong>{aiToken}</strong>
            </span>
            <span className="text-[10px] font-sans font-normal opacity-80">
              ({SHORT_HORIZON_LABELS[forecast.horizon_code]})
            </span>
          </button>

          {/* 3. AFTER-RUN CORRECTNESS BUTTON RIGHT NEXT TO AI THINKS */}
          {progress?.isAnimating ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-ink-50 px-3 py-2 text-xs font-mono font-semibold text-[#111111] tabular-nums"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#111111]" />
              <span>
                Checking... Live{' '}
                <span className={liveMovePct >= 0 ? 'text-up' : 'text-down'}>
                  {formatAiMoveToken(liveMovePct)}
                </span>
              </span>
            </button>
          ) : verdictMatchesTicker ? (
            <button
              type="button"
              onClick={() => setShowVerdictDetails((v) => !v)}
              title="Click to toggle detailed AI verification audit"
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-mono font-bold tabular-nums transition-colors ${
                verdictMatchesTicker.ai_got_it_right
                  ? 'border-up-border bg-up-soft text-up hover:border-up'
                  : 'border-down-border bg-down-soft text-down hover:border-down'
              }`}
            >
              {verdictMatchesTicker.ai_got_it_right ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                {verdictMatchesTicker.ai_got_it_right ? '✓ Correct!' : '✗ Not Correct'}
              </span>
              <span className="font-normal text-[11px] text-[#111111]">
                (AI {formatAiMoveToken(verdictMatchesTicker.predicted_return_pct)} → Actual{' '}
                {formatAiMoveToken(verdictMatchesTicker.actual_return_pct)})
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRunHorizonCheck}
              disabled={busy}
              title="Run random candles to check if AI prediction is correct"
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink-300 bg-ink-50/70 px-3 py-2 text-xs font-mono text-ink-500 hover:border-[#111111] hover:text-[#111111] disabled:opacity-50 transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Was AI Correct? Run to Check</span>
            </button>
          )}

          {/* +1 Candle & Auto-Test Controls */}
          <button
            type="button"
            onClick={onStepOneCandle}
            disabled={busy}
            title="Advance 1 random candlestick and check the AI's 1-candle prediction"
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111] disabled:opacity-50 transition-colors"
          >
            <StepForward className="h-3.5 w-3.5" />
            <span>+1 Candle</span>
          </button>

          <button
            type="button"
            onClick={onToggleAutoLoop}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
              autoLoop
                ? 'border-[#111111] bg-ink-100 text-[#111111]'
                : 'border-ink-200 bg-white text-ink-700 hover:border-[#111111]'
            }`}
          >
            {autoLoop ? <Pause className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />}
            <span>{autoLoop ? 'Stop Loop' : 'Auto-Test'}</span>
          </button>
        </div>

        {/* Right Controls: Speed + Regime + Random Stock */}
        <div className="flex flex-wrap items-center gap-2">
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
                    speedMs === s.ms
                      ? 'bg-white text-[#111111] shadow-sm font-semibold'
                      : 'text-ink-500 hover:text-[#111111]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

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
            <span>{generatingStock ? 'Generating...' : 'Random Stock'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Horizon "What AI Thinks" Quick Buttons Strip + Live Scoreboard */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-200 bg-ink-50/70 px-3.5 py-2 text-xs tabular-nums">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ink-500 mr-1">
            <BrainCircuit className="h-3.5 w-3.5 text-[#111111]" />
            <span>Super-Smart AI Calls:</span>
          </span>

          {allHorizons && allHorizons.length > 0 && onSelectHorizon ? (
            allHorizons.map((row) => {
              const active = (selectedHorizon || forecast.horizon_code) === row.horizon_code;
              const rowUp = row.expected_return_pct >= 0;
              return (
                <button
                  key={row.horizon_code}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelectHorizon(row.horizon_code)}
                  title={`${row.horizon_label}: AI predicts ${row.expected_return_pct >= 0 ? '+' : ''}${row.expected_return_pct.toFixed(2)}% (Target $${row.expected_price.toFixed(2)})`}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                    active
                      ? 'border-[#111111] bg-[#111111] text-white font-semibold'
                      : 'border-ink-200 bg-white text-[#111111] hover:border-[#111111]'
                  }`}
                >
                  <span className={active ? 'text-ink-300' : 'text-ink-500'}>
                    {SHORT_HORIZON_LABELS[row.horizon_code]}
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
            })
          ) : (
            <span className={`font-mono font-bold ${predUp ? 'text-up' : 'text-down'}`}>
              {aiToken} (${forecast.starting_price.toFixed(2)} → ${forecast.expected_price.toFixed(2)})
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          {forecast.prob_higher != null && (
            <span className="text-ink-500">
              Win Prob: <strong className="text-[#111111]">{predUp ? forecast.prob_higher.toFixed(0) : (100 - forecast.prob_higher).toFixed(0)}%</strong>
            </span>
          )}
          {totalChecks > 0 && (
            <span className="rounded border border-ink-200 bg-white px-2 py-0.5 text-[#111111]">
              Score: <strong>{rightCount}/{totalChecks}</strong> ({winRate.toFixed(0)}% Correct)
              {!compact && <span className="text-ink-400"> · Cone {coneHits}/{totalChecks}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Expandable Super-Smart AI Reasoning Drawer (toggled by clicking "AI Thinks: 0.61+") */}
      {showAiDrawer && (
        <div className="rounded-md border border-ink-200 bg-ink-50/50 p-3.5 text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-[#111111]">
              Why Super-Smart AI Thinks{' '}
              <span className={`font-mono ${predUp ? 'text-up' : 'text-down'}`}>
                {aiToken} ({forecast.expected_return_pct >= 0 ? '+' : ''}
                {forecast.expected_return_pct.toFixed(2)}%)
              </span>{' '}
              over {forecast.horizon_trading_days}{' '}
              {forecast.horizon_trading_days === 1 ? 'Candle' : 'Candles'}
            </div>
            <span className="font-mono text-[11px] text-ink-500">{forecast.selected_model_name}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {forecast.factor_contributions.slice(0, 3).map((fcItem) => (
              <div key={fcItem.name} className="rounded border border-ink-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[#111111] truncate">{fcItem.name}</span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      fcItem.impact_direction === 'positive'
                        ? 'text-up'
                        : fcItem.impact_direction === 'negative'
                        ? 'text-down'
                        : 'text-ink-500'
                    }`}
                  >
                    {fcItem.measured_value}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-500 truncate">{fcItem.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Animating Progress OR Detailed Verdict Banner */}
      {progress?.isAnimating ? (
        <div className="rounded-md border border-ink-300 bg-ink-50 px-4 py-3 space-y-2 tabular-nums">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-[#111111]">
              Simulating Random Candle {progress.currentStep} / {progress.totalSteps} · Testing AI{' '}
              <span className={predUp ? 'text-up' : 'text-down'}>{aiToken}</span>
            </span>
            <span className="font-mono">
              Live: <strong>${progress.livePrice.toFixed(2)}</strong> (
              <span className={liveMovePct >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                {formatAiMoveToken(liveMovePct)}
              </span>
              )
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
            <div
              style={{
                width: `${Math.min(100, (progress.currentStep / Math.max(1, progress.totalSteps)) * 100)}%`,
              }}
              className="h-full bg-[#111111] transition-all duration-100"
            />
          </div>
        </div>
      ) : (
        verdictMatchesTicker &&
        showVerdictDetails && (
          <div
            className={`rounded-md border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 tabular-nums ${
              verdictMatchesTicker.ai_got_it_right
                ? 'border-up-border bg-up-soft'
                : 'border-down-border bg-down-soft'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {verdictMatchesTicker.ai_got_it_right ? (
                <CheckCircle2 className="h-5 w-5 text-up shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-down shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold uppercase tracking-wider ${
                      verdictMatchesTicker.ai_got_it_right ? 'text-up' : 'text-down'
                    }`}
                  >
                    {verdictMatchesTicker.ai_got_it_right ? '✓ AI WAS CORRECT!' : '✗ AI WAS NOT CORRECT'}
                  </span>
                  <span className="rounded border border-ink-200 bg-white px-2 py-0.5 font-mono text-[11px] text-[#111111]">
                    AI Thought: <strong>{formatAiMoveToken(verdictMatchesTicker.predicted_return_pct)}</strong> · Actual:{' '}
                    <strong className={verdictMatchesTicker.actual_return_pct >= 0 ? 'text-up' : 'text-down'}>
                      {formatAiMoveToken(verdictMatchesTicker.actual_return_pct)}
                    </strong>
                  </span>
                  {verdictMatchesTicker.within_68_range && (
                    <span className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#111111]">
                      Inside 68% Cone
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#111111] leading-relaxed">{verdictMatchesTicker.verdict_summary}</p>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono text-xs shrink-0">
              <div className="text-ink-500">
                ${verdictMatchesTicker.start_price.toFixed(2)} →{' '}
                <strong className="text-[#111111]">${verdictMatchesTicker.end_price.toFixed(2)}</strong>
              </div>
              <div className={verdictMatchesTicker.actual_return_pct >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                Move: {formatAiMoveToken(verdictMatchesTicker.actual_return_pct)} (
                {verdictMatchesTicker.actual_return_pct >= 0 ? '+' : ''}
                {verdictMatchesTicker.actual_return_pct.toFixed(2)}%)
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
              <span>{v.ai_got_it_right ? '✓ Correct' : '✗ Wrong'}</span>
              <span className="text-[#111111]">{v.ticker}</span>
              <span>
                (AI {formatAiMoveToken(v.predicted_return_pct)} → {formatAiMoveToken(v.actual_return_pct)})
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
