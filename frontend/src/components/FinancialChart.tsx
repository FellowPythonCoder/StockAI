import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CandleBar, ForecastTrajectoryPoint, HorizonForecast, TimeframeCode } from '../types';

interface FinancialChartProps {
  ticker: string;
  bars: CandleBar[];
  timeframe: TimeframeCode;
  onChangeTimeframe: (tf: TimeframeCode) => void;
  forecast?: HorizonForecast | null;
  height?: number;
  compactControls?: boolean;
  fallbackNotice?: string | null;
}

const TIMEFRAMES: TimeframeCode[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function formatAxisDate(raw: string, tf: TimeframeCode): string {
  if (!raw) return '';
  if (raw.length > 10 && (tf === '1D' || tf === '1W')) {
    // "2026-10-26 16:30:00"
    const parts = raw.split(' ');
    const md = parts[0].slice(5);
    const hm = (parts[1] || '').slice(0, 5);
    return tf === '1D' ? hm : `${md} ${hm}`;
  }
  if (tf === '5Y' || tf === '1Y') {
    return raw.slice(0, 7); // YYYY-MM
  }
  return raw.slice(5, 10); // MM-DD
}

export const FinancialChart: React.FC<FinancialChartProps> = ({
  ticker,
  bars,
  timeframe,
  onChangeTimeframe,
  forecast,
  height = 390,
  compactControls = false,
  fallbackNotice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(820);
  const [chartMode, setChartMode] = useState<'line' | 'candle'>('line');
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [showSma20, setShowSma20] = useState<boolean>(true);
  const [showSma50, setShowSma50] = useState<boolean>(true);
  const [showSma200, setShowSma200] = useState<boolean>(false);
  const [showRsi, setShowRsi] = useState<boolean>(false);
  const [showForecastCone, setShowForecastCone] = useState<boolean>(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 120) setWidth(Math.floor(rect.width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only show forecast cone on daily timeframes (or 1W/1M/3M/1Y/5Y) where scale matches well
  const conePoints: ForecastTrajectoryPoint[] = useMemo(() => {
    if (!showForecastCone || !forecast || !forecast.trajectory || forecast.trajectory.length < 2) {
      return [];
    }
    if (timeframe === '1D' && forecast.horizon_trading_days > 5) {
      return [];
    }
    return forecast.trajectory.slice(1); // index 0 is spot anchor
  }, [showForecastCone, forecast, timeframe]);

  const totalSlots = bars.length + conePoints.length;
  const padLeft = 12;
  const padRight = 64;
  const padTop = 18;
  const padBottom = 26;
  const rsiHeight = showRsi && !compactControls ? 78 : 0;
  const rsiGap = rsiHeight > 0 ? 18 : 0;
  const mainPlotH = Math.max(180, height - padTop - padBottom - rsiHeight - rsiGap);
  const plotW = Math.max(120, width - padLeft - padRight);

  const { yMin, yMax, maxVol, periodPositive } = useMemo(() => {
    if (bars.length === 0) {
      return { yMin: 0, yMax: 100, maxVol: 1, periodPositive: true };
    }
    let minP = Infinity;
    let maxP = -Infinity;
    let mv = 1;

    for (const b of bars) {
      if (chartMode === 'candle') {
        minP = Math.min(minP, b.low);
        maxP = Math.max(maxP, b.high);
      } else {
        minP = Math.min(minP, b.close);
        maxP = Math.max(maxP, b.close);
      }
      if (showSma20 && b.sma20 != null) {
        minP = Math.min(minP, b.sma20);
        maxP = Math.max(maxP, b.sma20);
      }
      if (showSma50 && b.sma50 != null) {
        minP = Math.min(minP, b.sma50);
        maxP = Math.max(maxP, b.sma50);
      }
      if (showSma200 && b.sma200 != null) {
        minP = Math.min(minP, b.sma200);
        maxP = Math.max(maxP, b.sma200);
      }
      if (b.volume > mv) mv = b.volume;
    }

    for (const pt of conePoints) {
      minP = Math.min(minP, pt.range_90_low);
      maxP = Math.max(maxP, pt.range_90_high);
    }

    const span = Math.max(maxP - minP, maxP * 0.015, 0.5);
    const bottomPadFactor = showVolume ? 0.18 : 0.08;
    const pos = bars[bars.length - 1].close >= bars[0].close;
    return {
      yMin: minP - span * bottomPadFactor,
      yMax: maxP + span * 0.08,
      maxVol: mv,
      periodPositive: pos,
    };
  }, [bars, conePoints, chartMode, showSma20, showSma50, showSma200, showVolume]);

  const xAt = (idx: number): number => {
    if (totalSlots <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (totalSlots - 1)) * plotW;
  };

  const yAt = (price: number): number => {
    const denom = Math.max(yMax - yMin, 1e-6);
    return padTop + (1 - (price - yMin) / denom) * mainPlotH;
  };

  const rsiTop = padTop + mainPlotH + rsiGap;
  const yRsiAt = (rsi: number): number => {
    const clamped = Math.max(0, Math.min(100, rsi));
    return rsiTop + (1 - clamped / 100) * rsiHeight;
  };

  const buildPath = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };

  const linePoints = useMemo(
    () => bars.map((b, i) => ({ x: xAt(i), y: yAt(b.close) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, width, yMin, yMax, totalSlots, mainPlotH]
  );

  const areaPath = useMemo(() => {
    if (linePoints.length < 2) return '';
    const line = buildPath(linePoints);
    const last = linePoints[linePoints.length - 1];
    const first = linePoints[0];
    const baseY = (padTop + mainPlotH).toFixed(1);
    return `${line} L${last.x.toFixed(1)},${baseY} L${first.x.toFixed(1)},${baseY} Z`;
  }, [linePoints, mainPlotH]);

  const buildIndicatorPath = (getter: (b: CandleBar) => number | null | undefined): string => {
    const segs: string[] = [];
    let openSeg = false;
    bars.forEach((b, i) => {
      const val = getter(b);
      if (val == null || Number.isNaN(val)) {
        openSeg = false;
        return;
      }
      const x = xAt(i).toFixed(1);
      const y = yAt(val).toFixed(1);
      segs.push(`${openSeg ? 'L' : 'M'}${x},${y}`);
      openSeg = true;
    });
    return segs.join(' ');
  };

  const sma20Path = useMemo(
    () => (showSma20 ? buildIndicatorPath((b) => b.sma20) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, showSma20, width, yMin, yMax, totalSlots, mainPlotH]
  );
  const sma50Path = useMemo(
    () => (showSma50 ? buildIndicatorPath((b) => b.sma50) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, showSma50, width, yMin, yMax, totalSlots, mainPlotH]
  );
  const sma200Path = useMemo(
    () => (showSma200 ? buildIndicatorPath((b) => b.sma200) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, showSma200, width, yMin, yMax, totalSlots, mainPlotH]
  );

  const rsiPath = useMemo(() => {
    if (!rsiHeight) return '';
    const segs: string[] = [];
    let openSeg = false;
    bars.forEach((b, i) => {
      if (b.rsi14 == null) {
        openSeg = false;
        return;
      }
      segs.push(`${openSeg ? 'L' : 'M'}${xAt(i).toFixed(1)},${yRsiAt(b.rsi14).toFixed(1)}`);
      openSeg = true;
    });
    return segs.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, rsiHeight, width, totalSlots, mainPlotH]);

  // Forecast cone geometry
  const coneGeometry = useMemo(() => {
    if (conePoints.length === 0 || bars.length === 0) return null;
    const anchorIdx = bars.length - 1;
    const anchorPrice = bars[anchorIdx].close;
    const allCone = [
      {
        idx: anchorIdx,
        expected: anchorPrice,
        lo68: anchorPrice,
        hi68: anchorPrice,
        lo90: anchorPrice,
        hi90: anchorPrice,
      },
      ...conePoints.map((pt, j) => ({
        idx: bars.length + j,
        expected: pt.expected_price,
        lo68: pt.range_68_low,
        hi68: pt.range_68_high,
        lo90: pt.range_90_low,
        hi90: pt.range_90_high,
      })),
    ];

    const poly68Upper = allCone.map((p) => `${xAt(p.idx).toFixed(1)},${yAt(p.hi68).toFixed(1)}`);
    const poly68Lower = [...allCone]
      .reverse()
      .map((p) => `${xAt(p.idx).toFixed(1)},${yAt(p.lo68).toFixed(1)}`);

    const poly90Upper = allCone.map((p) => `${xAt(p.idx).toFixed(1)},${yAt(p.hi90).toFixed(1)}`);
    const poly90Lower = [...allCone]
      .reverse()
      .map((p) => `${xAt(p.idx).toFixed(1)},${yAt(p.lo90).toFixed(1)}`);

    const expPath = buildPath(allCone.map((p) => ({ x: xAt(p.idx), y: yAt(p.expected) })));
    const hi90Path = buildPath(allCone.map((p) => ({ x: xAt(p.idx), y: yAt(p.hi90) })));
    const lo90Path = buildPath(allCone.map((p) => ({ x: xAt(p.idx), y: yAt(p.lo90) })));

    const endPt = allCone[allCone.length - 1];
    return {
      anchorX: xAt(anchorIdx),
      anchorY: yAt(anchorPrice),
      poly68: [...poly68Upper, ...poly68Lower].join(' '),
      poly90: [...poly90Upper, ...poly90Lower].join(' '),
      expPath,
      hi90Path,
      lo90Path,
      endX: xAt(endPt.idx),
      endY: yAt(endPt.expected),
      endPrice: endPt.expected,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conePoints, bars, width, yMin, yMax, totalSlots, mainPlotH]);

  const yTicks = useMemo(() => {
    const count = 5;
    const out: { price: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const p = yMin + ((count - 1 - i) / (count - 1)) * (yMax - yMin);
      out.push({ price: p, y: yAt(p) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yMin, yMax, mainPlotH]);

  const xTicks = useMemo(() => {
    if (totalSlots < 2) return [];
    const targetTicks = Math.min(6, Math.max(3, Math.floor(plotW / 130)));
    const out: { x: number; label: string }[] = [];
    for (let i = 0; i < targetTicks; i++) {
      const slot = Math.round((i / (targetTicks - 1)) * (totalSlots - 1));
      const label =
        slot < bars.length
          ? formatAxisDate(bars[slot].time, timeframe)
          : `${formatAxisDate(conePoints[slot - bars.length]?.date || '', timeframe)} (Est)`;
      out.push({ x: xAt(slot), label });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, conePoints, totalSlots, plotW, timeframe]);

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (totalSlots === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left - padLeft;
    const ratio = Math.max(0, Math.min(1, relX / Math.max(1, plotW)));
    const idx = Math.round(ratio * (totalSlots - 1));
    setHoverIdx(idx);
  };

  const activeBar = hoverIdx != null && hoverIdx < bars.length ? bars[hoverIdx] : bars[bars.length - 1];
  const activeConePt =
    hoverIdx != null && hoverIdx >= bars.length ? conePoints[hoverIdx - bars.length] : null;

  const lineStrokeColor = periodPositive ? '#15803D' : '#B91C1C';
  const forecastColor =
    forecast?.direction === 'upside'
      ? '#15803D'
      : forecast?.direction === 'downside'
      ? '#B91C1C'
      : '#52525B';

  const candleWidth = Math.max(2, Math.min(11, (plotW / Math.max(bars.length, 20)) * 0.66));

  return (
    <div ref={containerRef} className="w-full select-none">
      {/* Chart Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 pb-2.5 mb-2">
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => onChangeTimeframe(tf)}
                className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                  active
                    ? 'bg-[#111111] text-white'
                    : 'text-ink-500 hover:bg-ink-100 hover:text-[#111111]'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded border border-ink-200 p-0.5 bg-ink-50">
            <button
              type="button"
              onClick={() => setChartMode('line')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                chartMode === 'line' ? 'bg-white text-[#111111] shadow-sm' : 'text-ink-500 hover:text-[#111111]'
              }`}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setChartMode('candle')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                chartMode === 'candle' ? 'bg-white text-[#111111] shadow-sm' : 'text-ink-500 hover:text-[#111111]'
              }`}
            >
              Candles
            </button>
          </div>

          {!compactControls && (
            <>
              <button
                type="button"
                onClick={() => setShowSma20((v) => !v)}
                className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                  showSma20
                    ? 'border-[#111111] bg-ink-100 text-[#111111]'
                    : 'border-ink-200 text-ink-500 hover:text-[#111111]'
                }`}
              >
                SMA 20
              </button>
              <button
                type="button"
                onClick={() => setShowSma50((v) => !v)}
                className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                  showSma50
                    ? 'border-[#111111] bg-ink-100 text-[#111111]'
                    : 'border-ink-200 text-ink-500 hover:text-[#111111]'
                }`}
              >
                SMA 50
              </button>
              <button
                type="button"
                onClick={() => setShowSma200((v) => !v)}
                className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                  showSma200
                    ? 'border-[#111111] bg-ink-100 text-[#111111]'
                    : 'border-ink-200 text-ink-500 hover:text-[#111111]'
                }`}
              >
                SMA 200
              </button>
              <button
                type="button"
                onClick={() => setShowVolume((v) => !v)}
                className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                  showVolume
                    ? 'border-[#111111] bg-ink-100 text-[#111111]'
                    : 'border-ink-200 text-ink-500 hover:text-[#111111]'
                }`}
              >
                Vol
              </button>
              <button
                type="button"
                onClick={() => setShowRsi((v) => !v)}
                className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                  showRsi
                    ? 'border-[#111111] bg-ink-100 text-[#111111]'
                    : 'border-ink-200 text-ink-500 hover:text-[#111111]'
                }`}
              >
                RSI(14)
              </button>
            </>
          )}

          {forecast && (
            <button
              type="button"
              onClick={() => setShowForecastCone((v) => !v)}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                showForecastCone
                  ? 'border-[#111111] bg-[#111111] text-white'
                  : 'border-ink-200 text-ink-500 hover:text-[#111111]'
              }`}
            >
              Forecast Cone
            </button>
          )}
        </div>
      </div>

      {/* Live Crosshair Readout Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[22px] text-[11px] font-mono text-ink-500 mb-1">
        {activeConePt ? (
          <div className="flex flex-wrap items-center gap-3 text-[#111111]">
            <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold">
              FORECAST · {activeConePt.date} (+{activeConePt.step_days}d)
            </span>
            <span>
              Est: <strong>${activeConePt.expected_price.toFixed(2)}</strong>
            </span>
            <span>
              68% Range: ${activeConePt.range_68_low.toFixed(2)}–${activeConePt.range_68_high.toFixed(2)}
            </span>
            <span className="text-ink-500">
              90% Outer: ${activeConePt.range_90_low.toFixed(2)}–${activeConePt.range_90_high.toFixed(2)}
            </span>
          </div>
        ) : activeBar ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[#111111] font-medium">{activeBar.time}</span>
            <span>O {activeBar.open.toFixed(2)}</span>
            <span>H {activeBar.high.toFixed(2)}</span>
            <span>L {activeBar.low.toFixed(2)}</span>
            <span className="text-[#111111] font-semibold">C {activeBar.close.toFixed(2)}</span>
            <span>Vol {formatVolume(activeBar.volume)}</span>
            {showSma20 && activeBar.sma20 != null && (
              <span className="text-ink-700">SMA20 {activeBar.sma20.toFixed(2)}</span>
            )}
            {showSma50 && activeBar.sma50 != null && (
              <span className="text-ink-500">SMA50 {activeBar.sma50.toFixed(2)}</span>
            )}
            {showRsi && activeBar.rsi14 != null && (
              <span className="text-[#111111]">RSI {activeBar.rsi14.toFixed(1)}</span>
            )}
          </div>
        ) : (
          <span>{ticker}</span>
        )}

        {fallbackNotice && <span className="text-[11px] font-sans text-ink-500">{fallbackNotice}</span>}
      </div>

      {/* Main Vector Financial Canvas */}
      {bars.length === 0 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-xs text-ink-500"
        >
          No historical price bars available for {ticker}.
        </div>
      ) : (
        <svg
          width={width}
          height={height}
          className="block overflow-visible cursor-crosshair"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`${ticker} historical price and quantitative forecast chart`}
        >
          <defs>
            <linearGradient id={`areaGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineStrokeColor} stopOpacity="0.11" />
              <stop offset="100%" stopColor={lineStrokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Price Gridlines & Right Axis Labels */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={t.y}
                y2={t.y}
                stroke="#F1F1F3"
                strokeWidth="1"
              />
              <text
                x={padLeft + plotW + 8}
                y={t.y + 3.5}
                className="fill-ink-400 font-mono text-[10px]"
              >
                ${t.price.toFixed(t.price >= 1000 ? 0 : 2)}
              </text>
            </g>
          ))}

          {/* Volume Histogram Bars (Bottom 16% of Main Plot) */}
          {showVolume &&
            bars.map((b, i) => {
              const x = xAt(i);
              const vRatio = b.volume / maxVol;
              const vH = Math.max(1, vRatio * (mainPlotH * 0.16));
              const vY = padTop + mainPlotH - vH;
              const upBar = b.close >= b.open;
              return (
                <rect
                  key={`v-${i}`}
                  x={x - Math.max(1, candleWidth * 0.45)}
                  y={vY}
                  width={Math.max(1.5, candleWidth * 0.9)}
                  height={vH}
                  fill={upBar ? '#15803D' : '#B91C1C'}
                  opacity={0.16}
                />
              );
            })}

          {/* Forecast Cone (90% Outer + 68% Central Range + Expected Trajectory) */}
          {coneGeometry && (
            <g>
              <line
                x1={coneGeometry.anchorX}
                x2={coneGeometry.anchorX}
                y1={padTop}
                y2={padTop + mainPlotH}
                stroke="#D4D4D8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <polygon points={coneGeometry.poly90} fill={forecastColor} fillOpacity="0.05" />
              <polygon points={coneGeometry.poly68} fill={forecastColor} fillOpacity="0.13" />
              <path
                d={coneGeometry.hi90Path}
                fill="none"
                stroke={forecastColor}
                strokeOpacity="0.35"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <path
                d={coneGeometry.lo90Path}
                fill="none"
                stroke={forecastColor}
                strokeOpacity="0.35"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <path
                d={coneGeometry.expPath}
                fill="none"
                stroke={forecastColor}
                strokeWidth="1.8"
                strokeDasharray="4 3"
              />
              <circle cx={coneGeometry.anchorX} cy={coneGeometry.anchorY} r="3" fill="#111111" />
              <circle cx={coneGeometry.endX} cy={coneGeometry.endY} r="3.5" fill={forecastColor} />
            </g>
          )}

          {/* Price Series: Line or Candlesticks */}
          {chartMode === 'line' ? (
            <g>
              <path d={areaPath} fill={`url(#areaGrad-${ticker})`} />
              <path
                d={buildPath(linePoints)}
                fill="none"
                stroke={lineStrokeColor}
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ) : (
            <g>
              {bars.map((b, i) => {
                const x = xAt(i);
                const yOpen = yAt(b.open);
                const yClose = yAt(b.close);
                const yHigh = yAt(b.high);
                const yLow = yAt(b.low);
                const isUp = b.close >= b.open;
                const color = isUp ? '#15803D' : '#B91C1C';
                const bodyTop = Math.min(yOpen, yClose);
                const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
                return (
                  <g key={`c-${i}`}>
                    <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1" />
                    <rect
                      x={x - candleWidth / 2}
                      y={bodyTop}
                      width={candleWidth}
                      height={bodyH}
                      fill={color}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* Moving Average Overlays */}
          {sma20Path && (
            <path d={sma20Path} fill="none" stroke="#111111" strokeWidth="1.15" strokeOpacity="0.75" />
          )}
          {sma50Path && (
            <path
              d={sma50Path}
              fill="none"
              stroke="#71717A"
              strokeWidth="1.15"
              strokeDasharray="4 2"
            />
          )}
          {sma200Path && (
            <path
              d={sma200Path}
              fill="none"
              stroke="#A1A1AA"
              strokeWidth="1.25"
              strokeDasharray="2 2"
            />
          )}

          {/* Optional RSI(14) Lower Subplot */}
          {rsiHeight > 0 && (
            <g>
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={rsiTop}
                y2={rsiTop}
                stroke="#E4E4E7"
                strokeWidth="1"
              />
              {/* 70 Overbought & 30 Oversold Guides */}
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={yRsiAt(70)}
                y2={yRsiAt(70)}
                stroke="#D4D4D8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={yRsiAt(30)}
                y2={yRsiAt(30)}
                stroke="#D4D4D8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text x={padLeft + 4} y={rsiTop + 11} className="fill-ink-400 font-mono text-[9px]">
                RSI(14)
              </text>
              <text x={padLeft + plotW + 8} y={yRsiAt(70) + 3} className="fill-ink-400 font-mono text-[9px]">
                70
              </text>
              <text x={padLeft + plotW + 8} y={yRsiAt(30) + 3} className="fill-ink-400 font-mono text-[9px]">
                30
              </text>
              <path d={rsiPath} fill="none" stroke="#111111" strokeWidth="1.3" />
            </g>
          )}

          {/* Interactive Hover Crosshair */}
          {hoverIdx != null && hoverIdx >= 0 && hoverIdx < totalSlots && (
            <g>
              <line
                x1={xAt(hoverIdx)}
                x2={xAt(hoverIdx)}
                y1={padTop}
                y2={rsiHeight > 0 ? rsiTop + rsiHeight : padTop + mainPlotH}
                stroke="#111111"
                strokeOpacity="0.35"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {hoverIdx < bars.length ? (
                <circle
                  cx={xAt(hoverIdx)}
                  cy={yAt(bars[hoverIdx].close)}
                  r="3.5"
                  fill="#111111"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ) : (
                conePoints[hoverIdx - bars.length] && (
                  <circle
                    cx={xAt(hoverIdx)}
                    cy={yAt(conePoints[hoverIdx - bars.length].expected_price)}
                    r="3.5"
                    fill={forecastColor}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                )
              )}
            </g>
          )}

          {/* Bottom Date Axis */}
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={height - padBottom + 4}
            y2={height - padBottom + 4}
            stroke="#E4E4E7"
            strokeWidth="1"
          />
          {xTicks.map((xt, i) => (
            <text
              key={i}
              x={xt.x}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-ink-400 font-mono text-[10px]"
            >
              {xt.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
};
