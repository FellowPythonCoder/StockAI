import React from 'react';
import { BookOpen, Cpu, Database, Scale, ShieldAlert } from 'lucide-react';
import { SITE_COPY } from '../config/siteCopy';

interface AboutViewProps {
  onOpenFeedSettings: () => void;
  onStartAnalyzing: () => void;
}

export const AboutView: React.FC<AboutViewProps> = ({ onOpenFeedSettings, onStartAnalyzing }) => {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8 space-y-14">
      {/* Header */}
      <section className="max-w-3xl space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
          ABOUT MARKET / SIGNAL
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#111111] sm:text-4xl">
          Quantitative equity forecasting built on empirical rigor and transparent uncertainty.
        </h1>
        <p className="text-base leading-relaxed text-ink-500">
          MARKET / SIGNAL is a serious financial analysis platform designed to answer a single question with maximum
          intellectual honesty: <em>“What might this stock do next, and how reliable is that forecast?”</em>
        </p>
      </section>

      {/* Personal Origin Section ("Made because Danish asked.") */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center rounded-xl border border-ink-200 bg-ink-50/50 p-6 sm:p-8">
        <div className="md:col-span-7 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-400">
            {SITE_COPY.personalStory.eyebrow}
          </div>
          <h2 className="text-2xl font-semibold text-[#111111]">{SITE_COPY.personalStory.heading}</h2>
          <p className="text-sm sm:text-base leading-relaxed text-ink-700">{SITE_COPY.personalStory.body}</p>
          <p className="text-xs text-ink-400 pt-1">{SITE_COPY.personalStory.footnote}</p>
        </div>
        <div className="md:col-span-5">
          <img
            src="./images/research-desk.png"
            alt="Minimalist monochrome research desk studio study"
            className="h-52 w-full rounded-lg border border-ink-200 object-cover bg-white"
          />
        </div>
      </section>

      {/* Architecture & Quantitative Pipeline Separation */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-[#111111]">Four-Layer Quantitative Architecture</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Database className="h-4 w-4 text-[#111111]" />
              <span>01 · Data Retrieval &amp; Normalization</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Verified Market Feeds &amp; Calendar Integrity</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Connects to Finnhub, Alpha Vantage, Twelve Data, and Yahoo Finance with server-side secret key isolation,
              token-bucket rate limiting, NYSE holiday/weekend calendar alignment, and OHLC invariant checks. When run
              without live API keys or deployed statically on GitHub Pages, the platform serves a clearly labeled
              verified historical market snapshot — never fabricated price series.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Cpu className="h-4 w-4 text-[#111111]" />
              <span>02 · Multi-Horizon Quantitative Engine</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Causal Factor Ridge &amp; Conformal Volatility Cones</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Evaluates 16 strictly causal features across multi-scale momentum, SMA(20/50/200) alignment, Kaufman trend
              efficiency, Wilder RSI(14), RiskMetrics EWMA &amp; Parkinson range volatility, rolling 60-day S&amp;P 500
              beta, and GICS sector relative strength. Ensembles are used only when out-of-sample validation proves
              superior MAE over single models.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Scale className="h-4 w-4 text-[#111111]" />
              <span>03 · Horizon-Purged Walk-Forward Verification</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Zero Leakage &amp; Calibrated Probabilities</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              At every historical evaluation step <em>t</em> for horizon <em>h</em>, training samples are strictly
              restricted to origins <em>s ≤ t − h</em> so zero future price information leaks into model weights,
              scalers, or probability calibration. Performance is benchmarked directly against No-Change and
              Historical-Average Return baselines.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <BookOpen className="h-4 w-4 text-[#111111]" />
              <span>04 · Evidence-Attributed AI Explanations</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Facts Distinguished from Assumptions</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Rather than using LLM self-confidence as a proxy for forecast accuracy, explanations are synthesized
              directly from standardized factor weights, verified TTM fundamentals, scheduled earnings dates, and
              explicit price invalidation thresholds.
            </p>
          </div>
        </div>
      </section>

      {/* Monochrome Editorial Visuals */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <img
            src="./images/quant-methodology.png"
            alt="Conformal probability cone technical illustration"
            className="h-60 w-full object-cover"
          />
          <figcaption className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            Split-conformal residual quantiles scale conditional RiskMetrics EWMA volatility across 1-day to 6-month
            forecast horizons.
          </figcaption>
        </figure>

        <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <img
            src="./images/signal-perspective.png"
            alt="Minimalist monochrome geometric perspective study"
            className="h-60 w-full object-cover"
          />
          <figcaption className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            Structural discipline: clean monochrome hierarchy keeps analytical focus on price series, error metrics, and
            risk context.
          </figcaption>
        </figure>
      </section>

      {/* Responsible Forecasting Disclosure */}
      <section className="rounded-lg border border-ink-200 bg-ink-50 p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#111111]">
          <ShieldAlert className="h-4 w-4" />
          <span>Responsible Forecasting &amp; Risk Disclosure</span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-ink-700">
          {SITE_COPY.responsibleDisclosure.detailedStatement}
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStartAnalyzing}
            className="rounded-md bg-[#111111] px-4 py-2 text-xs font-medium text-white hover:bg-ink-700"
          >
            Open AI Market Analyst
          </button>
          <button
            type="button"
            onClick={onOpenFeedSettings}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-xs font-medium text-[#111111] hover:border-[#111111]"
          >
            Configure Live Data Provider
          </button>
        </div>
      </section>
    </div>
  );
};
