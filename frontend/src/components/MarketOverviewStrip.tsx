import React from 'react';
import { MarketOverviewItem, MarketOverviewResponse } from '../types';

interface SparklineProps {
  values: number[];
  positive: boolean;
}

export const MiniSparkline: React.FC<SparklineProps> = ({ values, positive }) => {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-4);
  const w = 68;
  const h = 22;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = 2 + (1 - (v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible shrink-0" aria-hidden="true">
      <polyline
        fill="none"
        stroke={positive ? '#15803D' : '#B91C1C'}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
};

interface MarketOverviewStripProps {
  overview: MarketOverviewResponse | null;
  onSelectSymbol?: (ticker: string) => void;
  showSectors?: boolean;
}

export const MarketOverviewStrip: React.FC<MarketOverviewStripProps> = ({
  overview,
  onSelectSymbol,
  showSectors = true,
}) => {
  if (!overview) return null;

  const renderIndexCard = (item: MarketOverviewItem) => {
    const isUp = item.change_pct >= 0;
    // For VIX, rising VIX is caution/neutral-gray rather than equity upside
    const isVix = item.category === 'volatility';
    const pctColor = isVix ? 'text-ink-700' : isUp ? 'text-up' : 'text-down';

    return (
      <div
        key={item.symbol}
        className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#111111]">{item.display_symbol}</span>
            <span className="text-[10px] font-mono text-ink-400">{item.as_of}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
            <span className="font-mono text-sm font-semibold text-[#111111]">
              {item.latest_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`font-mono text-xs font-medium ${pctColor}`}>
              {item.change_pct >= 0 ? '+' : ''}
              {item.change_pct.toFixed(2)}%
            </span>
          </div>
        </div>
        <MiniSparkline values={item.sparkline} positive={isVix ? item.change_pct <= 0 : isUp} />
      </div>
    );
  };

  return (
    <section aria-label="Market Overview" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-ink-500">
            Market Context
          </span>
          <span className="rounded border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-[#111111]">
            {overview.market_regime_label}
          </span>
          <span className="hidden lg:inline text-xs text-ink-500">{overview.market_regime_summary}</span>
        </div>
        <span className="text-[11px] text-ink-400">
          Source: {overview.provenance.provider_name} · As of {overview.provenance.as_of_timestamp}
        </span>
      </div>

      {/* Major Indices Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {overview.indices.map(renderIndexCard)}
      </div>

      {/* GICS Sector Performance Strip */}
      {showSectors && overview.sectors.length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-white p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-500">
              GICS Sector ETFs · Daily &amp; 1M Relative Performance
            </span>
            <span className="text-[11px] text-ink-500">
              Breadth: {overview.breadth_advancing_sectors}/{overview.breadth_total_sectors} advancing
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
            {overview.sectors.map((sec) => {
              const up = sec.change_pct >= 0;
              return (
                <button
                  key={sec.symbol}
                  type="button"
                  onClick={() => onSelectSymbol?.(sec.symbol)}
                  className="group rounded border border-ink-200 px-2.5 py-2 text-left hover:border-[#111111] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-[#111111]">{sec.symbol}</span>
                    <span
                      className={`font-mono text-[11px] font-medium tabular-nums ${
                        up ? 'text-up' : 'text-down'
                      }`}
                    >
                      {up ? '+' : ''}
                      {sec.change_pct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-ink-500">{sec.name}</div>
                  <div className="mt-1 text-[10px] font-mono text-ink-400 tabular-nums">
                    1M: {sec.return_1m_pct >= 0 ? '+' : ''}
                    {sec.return_1m_pct.toFixed(1)}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
