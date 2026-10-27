import React, { useState } from 'react';
import { Dices, Menu, Search, SlidersHorizontal, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { DataProvenance } from '../types';

export type NavTab = 'overview' | 'analysis' | 'forecasts' | 'watchlist' | 'about';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenSearch: () => void;
  onGenerateRandomStock: () => void;
  onOpenFeedSettings: () => void;
  provenance?: DataProvenance | null;
  generatingStock?: boolean;
}

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'analysis', label: 'Candle Simulator' },
  { id: 'forecasts', label: 'AI Accuracy' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'about', label: 'About' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenSearch,
  onGenerateRandomStock,
  onOpenFeedSettings,
  generatingStock = false,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <BrandLogo
            onClick={() => {
              onSelectTab('overview');
              setMobileOpen(false);
            }}
          />

          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                    active
                      ? 'bg-ink-100 text-[#111111]'
                      : 'text-ink-500 hover:text-[#111111] hover:bg-ink-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFeedSettings}
            title="View procedural candle engine details"
            className="hidden xl:inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:border-ink-400 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-up" />
            <span>Synthetic Engine</span>
            <SlidersHorizontal className="h-3 w-3 text-ink-400" />
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-medium text-[#111111] hover:border-[#111111] transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Stocks</span>
            <kbd className="hidden lg:inline-block rounded border border-ink-200 bg-ink-50 px-1.5 py-0.2 text-[10px] font-mono text-ink-500">
              /
            </kbd>
          </button>

          <button
            type="button"
            onClick={onGenerateRandomStock}
            disabled={generatingStock}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-ink-700 disabled:opacity-50 transition-colors"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>{generatingStock ? 'Generating...' : 'Random Stock'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex md:hidden items-center justify-center rounded-md border border-ink-200 p-1.5 text-[#111111]"
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md ${
                    active ? 'bg-ink-100 text-[#111111]' : 'text-ink-500 hover:text-[#111111]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenSearch();
              }}
              className="mt-1 flex items-center justify-between rounded-md border border-ink-200 px-3 py-2 text-xs text-[#111111]"
            >
              <span>Search Synthetic Stocks</span>
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
