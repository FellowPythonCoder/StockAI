# MARKET / SIGNAL

**See the market from a different perspective.**

**MARKET / SIGNAL** is a minimalist black-and-white quantitative stock analysis and AI-assisted forecasting platform. It combines real historical and live market data, technical trend/volatility structure, company fundamentals, scheduled earnings catalysts, and horizon-purged chronological walk-forward backtesting to estimate where equity prices might move next — and how reliable each estimate actually is.

---

## Core Capabilities

- **Refined Monochrome Interface**: Designed around pure `#FFFFFF` surfaces, `#111111` typography, hairline `#E4E4E7` borders, tabular numerals, and restrained financial chart highlights (`#15803D` upside, `#B91C1C` downside).
- **AI Market Analyst Workstation**:
  - Instant search across supported US equities (`NVDA`, `AAPL`, `MSFT`, `GOOGL`, `AMZN`, `TSLA`, `META`, `AMD`, `LLY`, `JPM`, `ORCL`, `WMT`, `XOM`, `UNH`, `NFLX`, `ADBE`, `COST`, `V`, `MA`, `CRM`, `INTC`, etc.), benchmark ETFs (`SPY`, `QQQ`, `DIA`, `IWM`), and GICS sector ETFs.
  - Interactive vector charting across `1D`, `1W`, `1M`, `3M`, `1Y`, and `5Y` with **Line** and **Candlestick** views, optional **Volume**, **SMA 20 / 50 / 200**, **RSI(14)** subplot, and an interactive **68% / 90% Forecast Cone**.
- **Multi-Horizon Quantitative Forecasting Engine**:
  - Evaluates 5 horizons: **Next trading session (`1d`)**, **5 trading days (`5d`)**, **1 month (`21d`)**, **3 months (`63d`)**, and **6 months (`126d`)**.
  - Uses 16 strictly causal features (multi-scale log returns, SMA trend alignment, normalized MACD, Kaufman efficiency ratio, Wilder RSI-14, RiskMetrics EWMA & Parkinson range volatility, relative volume, rolling 60-day S&P 500 beta/alpha, and GICS sector relative strength).
  - Selects between **L2-Regularized Factor Ridge**, **Damped Trend/Mean-Reversion State**, and a **Shrinkage Ensemble** *only when chronological walk-forward validation proves lower MAE than simpler models*.
  - Adjusts forecast intervals via **Out-of-Sample Split-Conformal Residual Quantiles** and widens intervals when confirmed earnings dates fall inside the forecast window.
- **Accuracy Verification & Forecast Tracking Ledger**:
  - Chronological walk-forward backtesting with strict `h`-session horizon purging (zero future-data leakage).
  - Benchmarked directly against **No-Change (Random Walk)** and **Historical-Average Return** baselines across Directional Accuracy, MAE, RMSE, 68%/90% Interval Coverage, Brier Score, Probability Calibration Reliability Bins, and Market Volatility Regimes.
  - Persistent **Forecast Tracking Ledger** recording prediction timestamp, source price, horizon, range, model version, and realized outcome once elapsed.
- **Watchlist & Market Overview**:
  - Add, remove, reorder, customize per-instrument forecast horizons, and refresh watchlists alongside S&P 500, Nasdaq Composite, Dow 30, VIX, and GICS sector breadth.

---

## Dual Runtime Modes: Full-Stack FastAPI OR 100% Static GitHub Pages

### 1. Run on GitHub Pages (Zero Backend Required)

The repository is pre-configured to run **100% standalone on GitHub Pages** using precomputed Python quantitative snapshots (`frontend/public/static-data/` built into `./docs`) plus `localStorage` persistence for watchlists and live forecast tracking:

- **Option A — GitHub Actions (Recommended)**:
  1. Go to repository **Settings → Pages**.
  2. Under **Build and deployment → Source**, select **GitHub Actions**.
  3. `.github/workflows/deploy-pages.yml` automatically builds and deploys the site.
- **Option B — Deploy from Branch (`/docs`)**:
  1. Go to repository **Settings → Pages**.
  2. Select **Deploy from a branch**, pick your branch (`main`), and choose folder **`/docs`**.

To regenerate the static quantitative snapshots after updating archival data:

```bash
python3 scripts/export_static_pages_data.py
cd frontend && npm run build && cp ../docs/index.html ../docs/404.html && touch ../docs/.nojekyll
```

---

### 2. Run Full-Stack Locally (FastAPI Quantitative Server + React)

#### Backend Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Optional: configure server-side live market data keys (never exposed to browser)
cp backend/.env.example backend/.env
# Edit FINNHUB_API_KEY, ALPHAVANTAGE_API_KEY, or TWELVEDATA_API_KEY

uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Once running at `http://localhost:8000`, FastAPI serves both the `/api/*` quantitative endpoints and the compiled frontend from `./docs`.

#### Frontend Hot-Reload Development

```bash
cd frontend
npm install
npm run dev
```

Vite runs at `http://localhost:5173` and proxies `/api/*` requests to `http://127.0.0.1:8000`.

#### Run Automated Test Suite

```bash
.venv/bin/pytest -v
```

---

## Customizing Editorial Copy

To edit headlines, disclosures, or the personal origin story (*“Made because Danish asked.”*), update:

- `frontend/src/config/siteCopy.ts`

---

## Responsible Forecasting Notice

MARKET / SIGNAL is an analytical decision-support and quantitative research tool — not financial advice or a guarantee of investment returns. All forecasts are probabilistic estimates subject to macroeconomic shifts, earnings surprises, and unscheduled events outside historical model covariates.
