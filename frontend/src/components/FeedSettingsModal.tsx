import React, { useEffect, useState } from 'react';
import { Check, KeyRound, Server, ShieldCheck, X } from 'lucide-react';
import { configureServerProviderKey, fetchProviderStatus, getRuntimeMode } from '../api/client';

interface FeedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const FeedSettingsModal: React.FC<FeedSettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchProviderStatus>> | null>(null);
  const [provider, setProvider] = useState<'finnhub' | 'alphavantage' | 'twelvedata'>('finnhub');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    setError(null);
    fetchProviderStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to read provider status'));
  }, [isOpen]);

  if (!isOpen) return null;

  const isStaticPages = getRuntimeMode() === 'static_pages';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await configureServerProviderKey(provider, apiKey);
      setApiKey('');
      setMessage(
        `Saved ${provider.toUpperCase()} key in server memory. Active providers: ${
          res.configured_providers.join(', ') || 'None (Demo Snapshot)'
        }`
      );
      const updated = await fetchProviderStatus();
      setStatus(updated);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update server provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-ink-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-ink-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-500">
              <Server className="h-3.5 w-3.5" />
              <span>Data Provenance &amp; Feed Architecture</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-[#111111]">Market Data Provider Configuration</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status && (
          <div className="mt-4 rounded-md border border-ink-200 bg-ink-50 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Active Feed Mode</span>
              <span className="font-mono font-semibold uppercase text-[#111111]">{status.active_mode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Provider</span>
              <span className="font-medium text-[#111111]">{status.provider_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Data Timestamp</span>
              <span className="font-mono text-[#111111]">{status.as_of_timestamp}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Session Status</span>
              <span className="text-ink-700">{status.market_status}</span>
            </div>
            <p className="pt-1.5 border-t border-ink-200 text-ink-500 leading-relaxed">
              {status.setup_instructions}
            </p>
          </div>
        )}

        {!isStaticPages ? (
          <form onSubmit={handleSave} className="mt-5 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#111111]">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Configure Server-Side Live API Key (Session)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['finnhub', 'alphavantage', 'twelvedata'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    provider === p
                      ? 'border-[#111111] bg-[#111111] text-white'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
                  }`}
                >
                  {p === 'alphavantage' ? 'Alpha Vantage' : p === 'twelvedata' ? 'Twelve Data' : 'Finnhub'}
                </button>
              ))}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter ${provider} server API key (leave empty to clear)...`}
              className="w-full rounded-md border border-ink-200 px-3 py-2 text-xs font-mono text-[#111111] placeholder:text-ink-400 focus:border-[#111111] focus:outline-none"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                <ShieldCheck className="h-3.5 w-3.5 text-ink-700" />
                Stored only in backend memory — never exposed to browser JS
              </span>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-ink-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{saving ? 'Applying...' : 'Apply on Server'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 rounded-md border border-ink-200 p-3.5 text-xs text-ink-700 leading-relaxed">
            <strong>GitHub Pages Static Deployment Detected:</strong> All 41 instruments, 5-year historical candles,
            multi-horizon forecasts, and chronological walk-forward backtests are served from verified precomputed JSON
            snapshots without exposing any secret API keys in client code.
          </div>
        )}

        {message && (
          <div className="mt-3 rounded-md border border-up-border bg-up-soft px-3 py-2 text-xs text-up">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-down-border bg-down-soft px-3 py-2 text-xs text-down">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
