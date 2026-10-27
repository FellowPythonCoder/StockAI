import React, { useEffect, useState } from 'react';
import { Cpu, Dices, ShieldCheck, X } from 'lucide-react';
import { fetchProviderStatus, getRuntimeMode } from '../api/client';

interface FeedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateRandomStock: () => void;
}

export const FeedSettingsModal: React.FC<FeedSettingsModalProps> = ({
  isOpen,
  onClose,
  onGenerateRandomStock,
}) => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchProviderStatus>> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchProviderStatus().then(setStatus).catch(() => null);
  }, [isOpen]);

  if (!isOpen) return null;

  const isStaticPages = getRuntimeMode() === 'static_pages';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-ink-200 bg-white p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-ink-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-500">
              <Cpu className="h-3.5 w-3.5" />
              <span>Procedural Candle Engine</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-[#111111]">Synthetic Market &amp; AI Simulator Info</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-md border border-ink-200 bg-ink-50 p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Execution Runtime</span>
            <span className="font-mono font-semibold text-[#111111]">
              {isStaticPages ? 'Browser Engine (GitHub Pages Mode)' : 'FastAPI + Browser Candle Engine'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Stock Universe</span>
            <span className="font-medium text-[#111111]">100% Procedural Fictional Stocks</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Candle Physics</span>
            <span className="font-mono text-[#111111]">GARCH(1,1) + Multi-Regime + Random Shocks</span>
          </div>
          {status && (
            <p className="pt-2 border-t border-ink-200 text-ink-500 leading-relaxed">{status.setup_instructions}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
            <ShieldCheck className="h-3.5 w-3.5 text-ink-700" />
            Zero real stocks · Zero external API keys required
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onGenerateRandomStock();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-2 text-xs font-medium text-white hover:bg-ink-700"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>Generate Random Stock</span>
          </button>
        </div>
      </div>
    </div>
  );
};
