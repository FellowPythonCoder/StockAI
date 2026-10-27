import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { InstrumentSummary } from '../types';
import { searchInstruments } from '../api/client';

interface SearchCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
}

const POPULAR_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'AMD', 'LLY', 'JPM', 'SPY'];

export const SearchCommandModal: React.FC<SearchCommandModalProps> = ({
  isOpen,
  onClose,
  onSelectTicker,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstrumentSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchInstruments(query)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        onSelectTicker(results[activeIndex].ticker);
        onClose();
      } else if (query.trim()) {
        onSelectTicker(query.trim().toUpperCase());
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-ink-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center border-b border-ink-200 px-4 py-3">
          <Search className="mr-3 h-4 w-4 text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ticker symbol or company name (e.g. NVDA, Apple, Microsoft)..."
            className="w-full bg-transparent text-sm text-[#111111] placeholder:text-ink-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-[#111111]"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400 mr-1 shrink-0">
            Quick:
          </span>
          {POPULAR_TICKERS.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => {
                onSelectTicker(sym);
                onClose();
              }}
              className="rounded border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-mono font-medium text-[#111111] hover:border-[#111111] transition-colors shrink-0"
            >
              {sym}
            </button>
          ))}
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-ink-100">
          {loading && results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-ink-500">Searching supported instruments...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[#111111]">No matching instrument in local catalog</p>
              <p className="mt-1 text-xs text-ink-500">
                Press Enter to query <span className="font-mono font-semibold">{query.toUpperCase()}</span> via live provider if configured.
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={item.ticker}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onSelectTicker(item.ticker);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    active ? 'bg-ink-100/80' : 'bg-white hover:bg-ink-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-14 shrink-0 font-mono text-xs font-semibold text-[#111111]">
                      {item.ticker}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#111111]">{item.name}</div>
                      <div className="truncate text-[11px] text-ink-500">
                        {item.exchange} · {item.sector}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                      {item.asset_type}
                    </span>
                    <ArrowRight className={`h-3.5 w-3.5 ${active ? 'text-[#111111]' : 'text-ink-400'}`} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink-200 bg-ink-50 px-4 py-2 text-[11px] text-ink-500">
          <span>↑↓ Navigate · Enter to Analyze · Esc to Close</span>
          <span>US Equities &amp; Index ETFs</span>
        </div>
      </div>
    </div>
  );
};
