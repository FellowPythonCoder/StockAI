import React from 'react';
import { BookOpen, Cpu, Dices, Play, Scale, ShieldAlert } from 'lucide-react';
import { SITE_COPY } from '../config/siteCopy';

interface AboutViewProps {
  onGenerateRandomStock: () => void;
  onStartAnalyzing: () => void;
}

export const AboutView: React.FC<AboutViewProps> = ({ onGenerateRandomStock, onStartAnalyzing }) => {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8 space-y-14">
      {/* Header */}
      <section className="max-w-3xl space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-500">
          ABOUT MARKET / SIGNAL
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#111111] sm:text-4xl">
          Procedural synthetic stocks, quantitative AI forecasts, and live candle verification.
        </h1>
        <p className="text-base leading-relaxed text-ink-500">
          MARKET / SIGNAL is a synthetic financial laboratory built to test a simple question honestly:{' '}
          <em>&ldquo;When an AI predicts where a candlestick chart goes next, how often does it actually get it right?&rdquo;</em>
        </p>
      </section>

      {/* Personal Origin Section ("my friend Tanish said") */}
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

      {/* Architecture */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-[#111111]">How the Simulator &amp; AI Checker Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Dices className="h-4 w-4 text-[#111111]" />
              <span>01 · Procedural Random Stock Generator</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Zero Real Tickers — 100% Synthetic Companies</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Generates fictional companies across Quantum, Neural Systems, Autonomous Robotics, Clean Fusion, and
              Programmable Biology with multi-year OHLCV candlestick histories driven by GARCH(1,1) volatility
              clustering, momentum persistence, and fat-tailed random shocks.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Cpu className="h-4 w-4 text-[#111111]" />
              <span>02 · Strictly Causal Quantitative AI Engine</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Past Candles Only — Zero Peeking Ahead</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              The AI model evaluates moving-average structure (SMA 20/50/200), multi-scale momentum, Wilder RSI(14)
              mean-reversion tension, EWMA volatility, and synthetic sector spread using strictly past candles — it
              never has access to upcoming random shocks.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Play className="h-4 w-4 text-[#111111]" />
              <span>03 · Live Random Candle Progression</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Animate Candlesticks &amp; Check If AI Got It Right</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Lock in the AI&apos;s prediction over 1, 5, 21, 63, or 126 candles, then run random future candlesticks
              live onto the chart. When the final candle closes, the simulator immediately checks whether the AI got
              the direction right and whether price stayed inside the 68% conformal cone.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-ink-500">
              <Scale className="h-4 w-4 text-[#111111]" />
              <span>04 · Dual Full-Stack &amp; GitHub Pages Ready</span>
            </div>
            <h3 className="text-sm font-semibold text-[#111111]">Runs Anywhere Without External API Keys</h3>
            <p className="text-xs leading-relaxed text-ink-500">
              Powered by both a Python FastAPI quantitative server and a matching client-side TypeScript engine so
              unlimited random stock generation and live candle verification work seamlessly even on static GitHub
              Pages hosting.
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
            Split-conformal 68% and 90% cones compared directly against unfolding stochastic candlesticks.
          </figcaption>
        </figure>

        <figure className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <img
            src="./images/signal-perspective.png"
            alt="Minimalist monochrome geometric perspective study"
            className="h-60 w-full object-cover"
          />
          <figcaption className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            Monochrome black-and-white visual system reserving green and red strictly for candle action and AI verdicts.
          </figcaption>
        </figure>
      </section>

      {/* Disclosure */}
      <section className="rounded-lg border border-ink-200 bg-ink-50 p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#111111]">
          <ShieldAlert className="h-4 w-4" />
          <span>Synthetic Sandbox Note</span>
        </div>
        <p className="text-xs sm:text-sm leading-relaxed text-ink-700">
          {SITE_COPY.responsibleDisclosure.detailedStatement}
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGenerateRandomStock}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#111111] px-4 py-2 text-xs font-medium text-white hover:bg-ink-700"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>Generate a Random Stock</span>
          </button>
          <button
            type="button"
            onClick={onStartAnalyzing}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 py-2 text-xs font-medium text-[#111111] hover:border-[#111111]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Open Candle Simulator</span>
          </button>
        </div>
      </section>
    </div>
  );
};
