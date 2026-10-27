# MARKET / SIGNAL

**Procedural Random Stock Generator, Quantitative AI Forecasting & Live Candlestick Verification**

> *“Made because of what my friend Tanish said.”*

**MARKET / SIGNAL** is a minimalist monochrome fintech sandbox that generates 100% synthetic companies with realistic stochastic candlestick histories, computes multi-horizon quantitative AI predictions, and lets you **run future candlesticks randomly in real time** to check whether the AI got its prediction right (`✓ AI GOT IT RIGHT!` vs `✗ AI GOT IT WRONG`).

---

## Core Features

1. **Procedural Random Stock Generator (Zero Real Stocks)**
   - Click **Random Stock** anywhere in the app (or choose a regime: *Momentum Uptrend*, *Mean-Reverting Range*, *High-Volatility Swings*, *Cycle Turnaround*, or *Bearish Distribution*) to invent a brand-new fictional company with 3+ years of daily & intraday OHLCV candlesticks, synthetic fundamentals, and company catalysts.
   - Powered by GARCH(1,1) volatility clustering, regime drift, momentum persistence, RSI mean-reversion tension, and fat-tailed random candle shocks.

2. **Live Candle Progression & AI Correctness Verification**
   - Lock in the AI's current forecast (`1`, `5`, `21`, `63`, or `126` candles) and click **Run Candles & Check AI** (or **+1 Candle Check**, or **Auto-Test Loop**).
   - Watch random green and red candlesticks animate directly across the AI's locked forecast cone.
   - Immediately checks if the AI predicted the direction accurately (**`✓ AI GOT IT RIGHT!`** / **`✗ AI GOT IT WRONG`**), whether the final candle landed inside the 68% conformal range, and updates your live session win-rate scoreboard and Forecast Tracking Ledger.

3. **Quantitative Forecasting & Zero-Leakage Walk-Forward Backtests**
   - Strictly causal quantitative features (SMA 20/50/200, multi-scale momentum, Wilder RSI-14, EWMA volatility, and synthetic sector/MSX 500 spreads) — the AI never sees upcoming random candle shocks.
   - Chronological walk-forward backtests comparing directional hit rates, MAE, RMSE, conformal interval coverage, and Brier calibration against No-Change and Historical-Average baselines.

4. **Dual Runtime: Full-Stack FastAPI + 100% Standalone GitHub Pages**
   - Runs seamlessly with the **Python FastAPI** quantitative backend OR **100% client-side in the browser** (`frontend/src/engine/syntheticClientEngine.ts`) so unlimited random stock generation and live candle verification work on static **GitHub Pages** with zero server or API keys required.

---

## Editing Copy & the Origin Story

All brand copy and the **“Made because of what my friend Tanish said.”** origin story live in a single clean configuration file:
- `frontend/src/config/siteCopy.ts`

---

## Running Locally (Full-Stack FastAPI + React)

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

cd frontend
npm install
npm run build
cd ..

.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

## Deploying to GitHub Pages

1. **GitHub Actions (Automated)**: Go to **Settings → Pages → Source** and choose **GitHub Actions** (`.github/workflows/deploy-pages.yml`).
2. **Deploy from Branch `/docs` Folder**: Select branch `main` (or `arena/22872617-stockai`) and folder **`/docs`** (pre-built with `.nojekyll`, `404.html`, and relative asset paths).
