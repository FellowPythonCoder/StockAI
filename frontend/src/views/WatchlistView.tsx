import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Dices,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { HORIZON_OPTIONS } from '../config/siteCopy';
import { HorizonCode, InstrumentSummary, WatchlistItem } from '../types';
import { MiniSparkline } from '../components/MarketOverviewStrip';
import { searchInstruments } from '../api/client';

interface WatchlistViewProps {
  items: WatchlistItem[];
  onAdd: (ticker: string, horizon: HorizonCode) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
  onReorder: (tickers: string[]) => Promise<void>;
  onChangeItemHorizon: (ticker: string, horizon: HorizonCode) => Promise<void>;
  onOpenStock: (ticker: string, horizon: HorizonCode) => void;
  onGenerateAndAddRandom: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
  loading: boolean;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  items,
  onAdd,
  onRemove,
  onReorder,
  onChangeItemHorizon,
  onOpenStock,
  onGenerateAndAddRandom,
  onRefreshAll,
  loading,
}) => {
  const [tickerInput, setTickerInput] = useState('');
  const [newHorizon, setNewHorizon] = useState<HorizonCode>('5d');
  const [suggestions, setSuggestions] = useState<InstrumentSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleInputChange = async (val: string) => {
    setTickerInput(val);
    setError(null);
    if (val.trim().length >= 1) {
      try {
        const res = await searchInstruments(val);
        setSuggestions(res.slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  };

  const submitAdd = async (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setAdding(true);
    setError(null);
    try {
      await onAdd(clean, newHorizon);
      setTickerInput('');
      setSuggestions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not add ${clean}`);
    } finally {
      setAdding(false);
    }
  };

  const moveItem = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const copy = items.map((i) => i.ticker);
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    await onReorder(copy);
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-ink-200 pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
            SYNTHETIC PORTFOLIO MONITOR
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111] sm:text-3xl">
            Generated Stocks Watchlist
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Save favorite procedurally generated stocks, customize AI candle horizons, or generate a brand-new stock
            directly into your watchlist.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerateAndAddRandom}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-2 text-xs font-medium text-white hover:bg-ink-700 disabled:opacity-50"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>+ Generate Random Stock</span>
          </button>

          <button
            type="button"
            onClick={onRefreshAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-[#111111] hover:border-[#111111] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Add Synthetic Stock Form */}
      <div className="relative rounded-lg border border-ink-200 bg-ink-50/60 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd(tickerInput);
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Add synthetic stock (e.g. VELX, KRNL, MRDN, OBLX, or invent any 4-letter ticker)..."
              className="w-full rounded-md border border-ink-200 bg-white px-3.5 py-2 text-xs text-[#111111] placeholder:text-ink-400 focus:border-[#111111] focus:outline-none"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-ink-200 bg-white shadow-lg divide-y divide-ink-100">
                {suggestions.map((s) => (
                  <button
                    key={s.ticker}
                    type="button"
                    onClick={() => submitAdd(s.ticker)}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs hover:bg-ink-50"
                  >
                    <span>
                      <strong className="font-mono text-[#111111] mr-2">{s.ticker}</strong>
                      <span className="text-ink-700">{s.name}</span>
                    </span>
                    <span className="text-[10px] text-ink-400">{s.sector}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={newHorizon}
            onChange={(e) => setNewHorizon(e.target.value as HorizonCode)}
            aria-label="Default forecast horizon"
            className="rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-mono text-[#111111] focus:border-[#111111] focus:outline-none"
          >
            {HORIZON_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                Horizon: {opt.fullLabel}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={adding || !tickerInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#111111] px-4 py-2 text-xs font-medium text-white hover:bg-ink-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Synthetic Stock</span>
          </button>
        </form>

        {error && <p className="mt-2 text-xs text-down">{error}</p>}
      </div>

      {/* Watchlist Table */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white p-12 text-center">
          <div className="text-sm font-medium text-[#111111]">Your synthetic watchlist is empty</div>
          <p className="mt-1 text-xs text-ink-500">
            Click &ldquo;+ Generate Random Stock&rdquo; above to create and track synthetic stocks.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70 text-[11px] font-mono uppercase text-ink-500">
                  <th className="py-3 px-3 w-16">Order</th>
                  <th className="py-3 px-4">Synthetic Stock</th>
                  <th className="py-3 px-4 text-right">Current Price</th>
                  <th className="py-3 px-4 text-right">Last Candle</th>
                  <th className="py-3 px-4">25-Candle Spark</th>
                  <th className="py-3 px-4">AI Horizon</th>
                  <th className="py-3 px-4">AI Call</th>
                  <th className="py-3 px-4 text-right">68% Price Cone</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-xs tabular-nums">
                {items.map((item, idx) => {
                  const chgUp = item.change_pct >= 0;
                  const fcUp = item.expected_return_pct >= 0;
                  return (
                    <tr key={item.ticker} className="hover:bg-ink-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveItem(idx, -1)}
                            title="Move up"
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-[#111111] disabled:opacity-25"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === items.length - 1}
                            onClick={() => moveItem(idx, 1)}
                            title="Move down"
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-[#111111] disabled:opacity-25"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenStock(item.ticker, item.preferred_horizon)}
                          className="text-left group"
                        >
                          <div className="font-mono font-semibold text-[#111111] group-hover:underline">
                            {item.ticker}
                          </div>
                          <div className="text-[11px] text-ink-500 truncate max-w-[180px]">{item.name}</div>
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#111111]">
                        ${item.latest_price.toFixed(2)}
                      </td>

                      <td className={`py-3 px-4 text-right font-mono font-medium ${chgUp ? 'text-up' : 'text-down'}`}>
                        {chgUp ? '+' : ''}
                        {item.change_pct.toFixed(2)}%
                      </td>

                      <td className="py-3 px-4">
                        <MiniSparkline
                          values={item.sparkline}
                          positive={
                            item.sparkline.length > 1
                              ? item.sparkline[item.sparkline.length - 1] >= item.sparkline[0]
                              : chgUp
                          }
                        />
                      </td>

                      <td className="py-3 px-4">
                        <select
                          value={item.preferred_horizon}
                          onChange={(e) => onChangeItemHorizon(item.ticker, e.target.value as HorizonCode)}
                          className="rounded border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-[#111111] focus:border-[#111111] focus:outline-none"
                        >
                          {HORIZON_OPTIONS.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.shortLabel}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                            fcUp
                              ? 'border-up-border bg-up-soft text-up'
                              : item.forecast_direction === 'downside'
                              ? 'border-down-border bg-down-soft text-down'
                              : 'border-ink-200 bg-ink-50 text-ink-700'
                          }`}
                        >
                          {fcUp ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : item.forecast_direction === 'downside' ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {fcUp ? 'UP' : 'DOWN'} ({item.expected_return_pct >= 0 ? '+' : ''}
                          {item.expected_return_pct.toFixed(2)}%)
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-[#111111]">
                        ${item.range_low.toFixed(2)} – ${item.range_high.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenStock(item.ticker, item.preferred_horizon)}
                            className="inline-flex items-center gap-1 rounded border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-[#111111] hover:border-[#111111]"
                          >
                            <span>Run Candles</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(item.ticker)}
                            title={`Remove ${item.ticker}`}
                            className="rounded p-1.5 text-ink-400 hover:bg-down-soft hover:text-down transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
