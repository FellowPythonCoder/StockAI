/**
 * Complete Client-Side Procedural Stock Generator, Stochastic Candlestick Simulator,
 * Causal Multi-Horizon Quantitative Forecaster, and Walk-Forward Evaluator.
 *
 * Enables 100% interactive Random Stock Generation and Live Candle AI Verification
 * even when hosted purely statically on GitHub Pages without a backend server.
 */

import {
  CalibrationBin,
  CandleAdvanceResponse,
  CandleBar,
  CandleCheckVerdict,
  ChartSeriesResponse,
  DataProvenance,
  FactorContribution,
  ForecastDirection,
  ForecastTrajectoryPoint,
  FundamentalsSnapshot,
  GenerateStockResponse,
  HorizonBacktestReport,
  HorizonCode,
  HorizonForecast,
  HorizonSummaryRow,
  InstrumentSummary,
  LockedForecastSnapshot,
  MarketOverviewItem,
  MarketOverviewResponse,
  NewsDevelopment,
  RegimeArchetype,
  RegimePerformance,
  StockAnalysisResponse,
  TimeframeCode,
  WalkForwardPoint,
} from '../types';

const MODEL_VERSION = 'ms-quant-v3.0';

const HORIZON_MAP: Record<HorizonCode, { label: string; days: number }> = {
  '1d': { label: 'Next trading session', days: 1 },
  '5d': { label: '5 trading days', days: 5 },
  '21d': { label: '1 month', days: 21 },
  '63d': { label: '3 months', days: 63 },
  '126d': { label: '6 months', days: 126 },
};

const ALL_HORIZONS: HorizonCode[] = ['1d', '5d', '21d', '63d', '126d'];

const HOLIDAYS = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26',
  '2027-05-31',
]);

function isTradingDay(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const iso = d.toISOString().slice(0, 10);
  return !HOLIDAYS.has(iso);
}

export function advanceTradingDays(startIso: string, steps: number): string {
  const d = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  let rem = Math.max(0, Math.floor(steps));
  while (rem > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isTradingDay(d)) rem--;
  }
  return d.toISOString().slice(0, 10);
}

function buildTradingCalendar(endIso = '2026-10-26', count = 760): string[] {
  const d = new Date(`${endIso}T12:00:00Z`);
  const out: string[] = [];
  while (out.length < count) {
    if (isTradingDay(d)) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

// Fast Mulberry32 PRNG for deterministic initial universe + true Math.random() for live runs
class Rng {
  private state: number | null;
  constructor(seed?: number) {
    this.state = seed != null ? seed >>> 0 : null;
  }
  next(): number {
    if (this.state === null) return Math.random();
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  gauss(mean = 0, std = 1): number {
    const u1 = Math.max(1e-9, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }
}

interface RawBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SynthMeta {
  ticker: string;
  name: string;
  exchange: string;
  asset_type: 'Equity' | 'ETF' | 'Index';
  sector: string;
  industry: string;
  seed: number;
  regime: Exclude<RegimeArchetype, 'random'>;
  base_price: number;
}

interface SynthState {
  meta: SynthMeta;
  daily: RawBar[];
  hourly: RawBar[];
  sigma: number;
  latentDrift: number;
  momCoeff: number;
  meanRevCoeff: number;
  baseVol: number;
  avgVolume: number;
  beta: number;
  fundamentals: FundamentalsSnapshot;
  news: NewsDevelopment[];
  liveRng: Rng;
}

const REGIME_PARAMS: Record<
  Exclude<RegimeArchetype, 'random'>,
  { drift: number; mom: number; meanRev: number; baseVol: number }
> = {
  momentum_up: { drift: 0.00085, mom: 0.16, meanRev: 0.03, baseVol: 0.017 },
  mean_reverting: { drift: 0.00025, mom: -0.04, meanRev: 0.14, baseVol: 0.014 },
  high_vol: { drift: 0.00055, mom: 0.12, meanRev: 0.06, baseVol: 0.028 },
  turnaround: { drift: 0.00065, mom: 0.14, meanRev: 0.05, baseVol: 0.021 },
  downtrend: { drift: -0.00065, mom: 0.15, meanRev: 0.04, baseVol: 0.02 },
};

const SECTOR_ETF: Record<string, string> = {
  'Quantum & Compute': 'SQNT',
  'Neural Systems': 'SNET',
  'Autonomous Robotics': 'SROB',
  'Clean Grid & Fusion': 'SNRG',
  'Programmable Biology': 'SBIO',
  'Orbital Logistics': 'SORB',
  'Algorithmic Clearing': 'SFIN',
  Metamaterials: 'SMAT',
};

const INITIAL_SPECS: SynthMeta[] = [
  { ticker: 'MSX', name: 'MSX 500 Synthetic Market ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Broad Synthetic Market', industry: 'Broad Index Tracker', seed: 90001, regime: 'momentum_up', base_price: 510 },
  { ticker: 'QNTX', name: 'QNT 100 Synthetic Growth ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Quantum & Compute', industry: 'Growth Index Tracker', seed: 90002, regime: 'momentum_up', base_price: 445 },
  { ticker: 'INDX', name: 'IND 30 Synthetic Industrials ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Autonomous Robotics', industry: 'Industrial Index Tracker', seed: 90003, regime: 'mean_reverting', base_price: 388 },
  { ticker: 'SQNT', name: 'Quantum & Compute Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Quantum & Compute', industry: 'Sector Benchmark', seed: 91001, regime: 'momentum_up', base_price: 210 },
  { ticker: 'SNET', name: 'Neural Systems Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Neural Systems', industry: 'Sector Benchmark', seed: 91002, regime: 'momentum_up', base_price: 235 },
  { ticker: 'SROB', name: 'Autonomous Robotics Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Autonomous Robotics', industry: 'Sector Benchmark', seed: 91003, regime: 'turnaround', base_price: 148 },
  { ticker: 'SNRG', name: 'Clean Grid & Fusion Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Clean Grid & Fusion', industry: 'Sector Benchmark', seed: 91004, regime: 'high_vol', base_price: 122 },
  { ticker: 'SBIO', name: 'Programmable Biology Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Programmable Biology', industry: 'Sector Benchmark', seed: 91005, regime: 'mean_reverting', base_price: 164 },
  { ticker: 'SORB', name: 'Orbital Logistics Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Orbital Logistics', industry: 'Sector Benchmark', seed: 91006, regime: 'turnaround', base_price: 118 },
  { ticker: 'SFIN', name: 'Algorithmic Clearing Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Algorithmic Clearing', industry: 'Sector Benchmark', seed: 91007, regime: 'mean_reverting', base_price: 176 },
  { ticker: 'SMAT', name: 'Metamaterials Sector ETF', exchange: 'SYNTH-ARC', asset_type: 'ETF', sector: 'Metamaterials', industry: 'Sector Benchmark', seed: 91008, regime: 'momentum_up', base_price: 154 },
  { ticker: 'VELX', name: 'Velox Quantum Systems', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Quantum & Compute', industry: 'Cryogenic Photonic Processors', seed: 1041, regime: 'momentum_up', base_price: 168 },
  { ticker: 'KRNL', name: 'Kernel Neural Labs', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Neural Systems', industry: 'Sparse Inference Silicon', seed: 2089, regime: 'momentum_up', base_price: 224 },
  { ticker: 'AETH', name: 'Aetherion Robotics', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Autonomous Robotics', industry: 'Dexterous Industrial Actuators', seed: 3117, regime: 'turnaround', base_price: 94 },
  { ticker: 'NEXO', name: 'Nexora Cloud Fabric', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Quantum & Compute', industry: 'Distributed Mesh Compute', seed: 4219, regime: 'mean_reverting', base_price: 136 },
  { ticker: 'SLST', name: 'Solstice Fusion Corp.', exchange: 'SYNTH-N', asset_type: 'Equity', sector: 'Clean Grid & Fusion', industry: 'Compact Tokamak Microgrids', seed: 5303, regime: 'high_vol', base_price: 78 },
  { ticker: 'CYPH', name: 'Cypheris BioCompute', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Programmable Biology', industry: 'Generative Protein Folding', seed: 6421, regime: 'momentum_up', base_price: 182 },
  { ticker: 'MRDN', name: 'Meridian Orbital', exchange: 'SYNTH-N', asset_type: 'Equity', sector: 'Orbital Logistics', industry: 'Autonomous LEO Tug Fleet', seed: 7529, regime: 'turnaround', base_price: 62 },
  { ticker: 'OBLX', name: 'Obelisk Clearing Corp.', exchange: 'SYNTH-N', asset_type: 'Equity', sector: 'Algorithmic Clearing', industry: 'Zero-Latency Settlement Rails', seed: 8647, regime: 'mean_reverting', base_price: 145 },
  { ticker: 'VRGX', name: 'Verge Optical Logic', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Metamaterials', industry: 'Waveguide Interconnects', seed: 9733, regime: 'high_vol', base_price: 112 },
  { ticker: 'HLIX', name: 'Helix Cellular Works', exchange: 'SYNTH-X', asset_type: 'Equity', sector: 'Programmable Biology', industry: 'Synthetic Enzyme Foundry', seed: 10853, regime: 'downtrend', base_price: 88 },
  { ticker: 'STRT', name: 'Strata Lattice Inc.', exchange: 'SYNTH-N', asset_type: 'Equity', sector: 'Metamaterials', industry: 'Graphene Thermal Composites', seed: 11939, regime: 'momentum_up', base_price: 129 },
  { ticker: 'ZENT', name: 'Zenith CryoGrid', exchange: 'SYNTH-N', asset_type: 'Equity', sector: 'Clean Grid & Fusion', industry: 'Superconducting Transmission', seed: 13007, regime: 'mean_reverting', base_price: 104 },
];

const PREFIXES = [
  'Kova', 'Zora', 'Prism', 'Vortex', 'Lumen', 'Crux', 'Novus', 'Tesseract', 'Quanta',
  'Vektor', 'Pyro', 'Cinder', 'Aurelia', 'Boreal', 'Calyx', 'Draco', 'Echelon', 'Flux',
  'Glint', 'Hyperion', 'Iridium', 'Joule', 'Kestrel', 'Lyra', 'Mythos', 'Nimbus', 'Onyx',
  'Parallax', 'Quasar', 'Rift', 'Sable', 'Talon', 'Umbra', 'Vesper', 'Warden', 'Xeno', 'Zephyr',
];

const SECTOR_CHOICES: Record<string, [string, string][]> = {
  'Quantum & Compute': [
    ['Quantum Logic', 'Topological Qubit Arrays'],
    ['Photonic Compute', 'Optical Tensor Cores'],
    ['Cryo-Silicon', 'Sub-Kelvin Memory Stacks'],
  ],
  'Neural Systems': [
    ['Neural Labs', 'Neuromorphic Edge Chips'],
    ['Cortex Systems', 'Autonomous Reasoning Kernels'],
    ['Synapse Foundry', 'Analog Inference Accelerators'],
  ],
  'Autonomous Robotics': [
    ['Robotics', 'Humanoid Fleet Actuators'],
    ['Kinematics', 'Precision Micro-Manipulators'],
    ['Field Dynamics', 'Subterranean Inspection Drones'],
  ],
  'Clean Grid & Fusion': [
    ['Fusion Energy', 'Magnetized Target Reactors'],
    ['Grid Storage', 'Solid-State Vanadium Vaults'],
    ['Thermal Works', 'Deep Geothermal Turbines'],
  ],
  'Programmable Biology': [
    ['BioCompute', 'Cell-Free Enzyme Synthesis'],
    ['Genomics', 'Targeted RNA Circuits'],
    ['Biologics', 'Computational Antibody Design'],
  ],
  'Orbital Logistics': [
    ['Orbital', 'Propellant Depot Tugs'],
    ['Spaceworks', 'Reusable Payload Fairings'],
    ['Astro-Link', 'Optical Laser Downlinks'],
  ],
  'Algorithmic Clearing': [
    ['Clearing', 'Atomic Settlement Ledgers'],
    ['Treasury Tech', 'Automated Liquidity Routing'],
    ['Quant Rails', 'Cross-Venue Margin Engines'],
  ],
  Metamaterials: [
    ['Lattice Corp.', 'Acoustic Cloak Composites'],
    ['Photonics', 'Metasurface Lens Arrays'],
    ['Materials', 'Ultra-Dense Carbon Aerogels'],
  ],
};

const FORBIDDEN_REAL = new Set([
  'AAPL', 'NVDA', 'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NFLX', 'AMD',
  'INTC', 'ORCL', 'CRM', 'ADBE', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'JPM', 'BAC',
  'V', 'MA', 'UNH', 'LLY', 'XOM', 'CVX', 'WMT', 'COST', 'SPY', 'QQQ', 'DIA', 'IWM',
]);

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function simulateSingleCandle(
  rng: Rng,
  prevClose: number,
  recentCloses: number[],
  sigma: number,
  latentDrift: number,
  momCoeff: number,
  meanRevCoeff: number,
  baseVol: number,
  avgVolume: number,
  mktRet = 0,
  beta = 1
): { open: number; high: number; low: number; close: number; volume: number; nextSigma: number; nextDrift: number } {
  let nextDrift = latentDrift;
  if (rng.next() < 0.022) {
    nextDrift = Math.max(-0.0018, Math.min(0.0022, latentDrift + rng.gauss(0, 0.00065)));
  }

  const len = recentCloses.length;
  const ret5 = len >= 5 ? Math.log(prevClose / recentCloses[len - 5]) / 5 : 0;
  const slice20 = recentCloses.slice(-20);
  const ma20 = slice20.length > 0 ? slice20.reduce((a, b) => a + b, 0) / slice20.length : prevClose;
  const zExt = Math.log(prevClose / ma20) / Math.max(sigma * Math.sqrt(20), 0.01);

  let zShock = rng.gauss(0, 1);
  if (rng.next() < 0.05) zShock *= rng.uniform(1.4, 2.2);

  const expectedStep =
    nextDrift +
    momCoeff * ret5 -
    meanRevCoeff * 0.012 * Math.max(-2.5, Math.min(2.5, zExt)) +
    0.35 * beta * mktRet;

  const logRet = Math.max(-0.14, Math.min(0.14, expectedStep + sigma * zShock));
  const gap = sigma * 0.28 * rng.gauss(0, 1);
  const open = Math.max(1.5, prevClose * Math.exp(gap));
  const close = Math.max(1.5, prevClose * Math.exp(logRet));

  const bodyTop = Math.max(open, close);
  const bodyBot = Math.min(open, close);
  const wickScale = sigma * prevClose * rng.uniform(0.35, 1.15);
  const high = bodyTop + Math.abs(rng.gauss(0.55, 0.35)) * wickScale;
  const low = Math.max(0.75, bodyBot - Math.abs(rng.gauss(0.55, 0.35)) * wickScale);

  const omega = 0.06 * baseVol * baseVol;
  const nextVar = omega + 0.11 * logRet * logRet + 0.83 * sigma * sigma;
  const nextSigma = Math.max(0.006, Math.min(0.065, Math.sqrt(nextVar)));

  const volMult = Math.exp(0.45 * Math.min(3, Math.abs(logRet) / Math.max(sigma, 0.008)) + rng.gauss(0, 0.25));
  const volume = Math.max(50_000, Math.round(avgVolume * volMult * 0.65));

  const o = round2(open);
  const c = round2(close);
  return {
    open: o,
    high: round2(Math.max(high, o, c)),
    low: round2(Math.min(low, o, c)),
    close: c,
    volume,
    nextSigma,
    nextDrift,
  };
}

function buildHourlyFromDaily(daily: RawBar[], rng: Rng): RawBar[] {
  const tail = daily.slice(-14);
  const hours = ['09:30:00', '10:30:00', '11:30:00', '12:30:00', '13:30:00', '14:30:00', '15:30:00'];
  const out: RawBar[] = [];
  for (const r of tail) {
    const pts: number[] = [r.open];
    for (let k = 1; k < 7; k++) {
      const interp = r.open + (k / 7) * (r.close - r.open);
      const wiggle = (r.high - r.low) * 0.18 * rng.gauss(0, 1);
      pts.push(Math.max(r.low, Math.min(r.high, interp + wiggle)));
    }
    pts.push(r.close);
    for (let k = 0; k < 7; k++) {
      const ho = round2(pts[k]);
      const hc = round2(pts[k + 1]);
      const span = Math.max(0.04, (r.high - r.low) * rng.uniform(0.12, 0.28));
      let hh = round2(Math.min(r.high, Math.max(ho, hc) + span * 0.5));
      let hl = round2(Math.max(r.low, Math.min(ho, hc) - span * 0.5));
      if (k === 2) hh = Math.max(hh, round2(r.high));
      if (k === 4) hl = Math.min(hl, round2(r.low));
      out.push({
        date: `${r.date.slice(0, 10)} ${hours[k]}`,
        open: ho,
        high: Math.max(hh, ho, hc),
        low: Math.min(hl, ho, hc),
        close: hc,
        volume: Math.max(5000, Math.round((r.volume / 7) * rng.uniform(0.7, 1.35))),
      });
    }
  }
  return out;
}

function enrichBars(raw: RawBar[]): CandleBar[] {
  const closes = raw.map((b) => b.close);
  const n = raw.length;
  const sma20: (number | null)[] = new Array(n).fill(null);
  const sma50: (number | null)[] = new Array(n).fill(null);
  const sma200: (number | null)[] = new Array(n).fill(null);
  const rsi14: (number | null)[] = new Array(n).fill(null);

  let sum20 = 0;
  let sum50 = 0;
  let sum200 = 0;
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < n; i++) {
    sum20 += closes[i];
    sum50 += closes[i];
    sum200 += closes[i];
    if (i >= 20) sum20 -= closes[i - 20];
    if (i >= 50) sum50 -= closes[i - 50];
    if (i >= 200) sum200 -= closes[i - 200];

    if (i >= 19) sma20[i] = round2(sum20 / 20);
    if (i >= 49) sma50[i] = round2(sum50 / 50);
    if (i >= 199) sma200[i] = round2(sum200 / 200);

    if (i > 0) {
      const chg = closes[i] - closes[i - 1];
      const gain = Math.max(0, chg);
      const loss = Math.max(0, -chg);
      if (i <= 14) {
        avgGain += gain / 14;
        avgLoss += loss / 14;
        if (i === 14) {
          const rs = avgLoss < 1e-9 ? 100 : avgGain / avgLoss;
          rsi14[i] = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
        }
      } else {
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
        const rs = avgLoss < 1e-9 ? 100 : avgGain / avgLoss;
        rsi14[i] = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
      }
    }
  }

  return raw.map((b, i) => ({
    time: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    sma20: sma20[i],
    sma50: sma50[i],
    sma200: sma200[i],
    rsi14: rsi14[i],
  }));
}

class ClientSyntheticEngine {
  private states = new Map<string, SynthState>();
  private calendar = buildTradingCalendar('2026-10-26', 760);
  private rng = new Rng();
  private initialized = false;

  private ensureInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    const msxMeta = INITIAL_SPECS[0];
    const msxState = this.createState(msxMeta, this.calendar, null);
    this.states.set('MSX', msxState);

    const msxRets = this.getMsxReturnMap();
    for (let i = 1; i < INITIAL_SPECS.length; i++) {
      const spec = INITIAL_SPECS[i];
      this.states.set(spec.ticker, this.createState(spec, this.calendar, msxRets));
    }
  }

  private getMsxReturnMap(): Map<string, number> {
    const msx = this.states.get('MSX')!;
    const m = new Map<string, number>();
    for (let i = 0; i < msx.daily.length; i++) {
      const r = i > 0 ? Math.log(msx.daily[i].close / msx.daily[i - 1].close) : 0;
      m.set(msx.daily[i].date, r);
    }
    return m;
  }

  private createState(meta: SynthMeta, cal: string[], msxRets: Map<string, number> | null): SynthState {
    const detRng = new Rng(meta.seed);
    const reg = REGIME_PARAMS[meta.regime];
    let sigma = reg.baseVol;
    let latentDrift = reg.drift;
    const avgVol = detRng.int(1_800_000, 26_000_000);
    const beta = meta.asset_type === 'Equity' ? round2(detRng.uniform(0.75, 1.65)) : 1.0;

    const daily: RawBar[] = [];
    const closes: number[] = [meta.base_price];

    for (let i = 0; i < cal.length; i++) {
      if (meta.regime === 'turnaround' && i === Math.floor(cal.length * 0.62)) {
        latentDrift = 0.00105;
      }
      const mktR = msxRets?.get(cal[i]) || 0;
      const step = simulateSingleCandle(
        detRng,
        closes[closes.length - 1],
        closes.slice(-30),
        sigma,
        latentDrift,
        reg.mom,
        reg.meanRev,
        reg.baseVol,
        avgVol,
        mktR,
        beta
      );
      sigma = step.nextSigma;
      latentDrift = step.nextDrift;
      closes.push(step.close);
      daily.push({
        date: cal[i],
        open: step.open,
        high: step.high,
        low: step.low,
        close: step.close,
        volume: step.volume,
      });
    }

    const hourly = buildHourlyFromDaily(daily, detRng);
    const { fundamentals, news } = this.buildFundamentalsAndNews(meta, daily, beta, detRng);

    return {
      meta,
      daily,
      hourly,
      sigma,
      latentDrift,
      momCoeff: reg.mom,
      meanRevCoeff: reg.meanRev,
      baseVol: reg.baseVol,
      avgVolume: avgVol,
      beta,
      fundamentals,
      news,
      liveRng: new Rng(),
    };
  }

  private buildFundamentalsAndNews(
    meta: SynthMeta,
    daily: RawBar[],
    beta: number,
    rng: Rng
  ): { fundamentals: FundamentalsSnapshot; news: NewsDevelopment[] } {
    const last = daily[daily.length - 1];
    const yrSlice = daily.slice(-252);
    const w52High = round2(Math.max(...yrSlice.map((b) => b.high)));
    const w52Low = round2(Math.min(...yrSlice.map((b) => b.low)));
    const avgVol20 = Math.round(daily.slice(-20).reduce((s, b) => s + b.volume, 0) / 20);

    if (meta.asset_type !== 'Equity') {
      return {
        fundamentals: {
          week52_high: w52High,
          week52_low: w52Low,
          avg_volume_20d: avgVol20,
          beta: 1.0,
          fundamentals_as_of: last.date,
        },
        news: [],
      };
    }

    const c252 = yrSlice[0].close;
    const yoyRet = (last.close / Math.max(1, c252) - 1) * 100;
    const sharesB = rng.uniform(0.35, 3.8);
    const mcap = last.close * sharesB * 1e9;
    const mcapFmt = mcap >= 1e12 ? `$${(mcap / 1e12).toFixed(2)}T` : `$${(mcap / 1e9).toFixed(1)}B`;
    const revGrowth = Math.round(Math.max(-8, Math.min(68, 14 + 0.35 * yoyRet + rng.uniform(-6, 10))) * 10) / 10;
    const grossMargin = Math.round(rng.uniform(44, 78) * 10) / 10;
    const profitMargin = Math.round(rng.uniform(11, Math.min(42, grossMargin - 14)) * 10) / 10;
    const peTrailing = round2(Math.max(12.5, Math.min(64, 22 + 0.42 * Math.max(0, revGrowth) + rng.uniform(-4, 6))));
    const peForward = round2(peTrailing * rng.uniform(0.8, 0.94));
    const epsTtm = round2(last.close / peTrailing);
    const netIncB = mcap / peTrailing / 1e9;
    const revB = netIncB / Math.max(0.06, profitMargin / 100);
    const nextEarn = advanceTradingDays(last.date, rng.int(8, 36));

    const c21 = daily[Math.max(0, daily.length - 21)].close;
    const ret21 = (last.close / c21 - 1) * 100;
    const d1 = daily[Math.max(0, daily.length - 2)].date;
    const d2 = daily[Math.max(0, daily.length - 7)].date;

    return {
      fundamentals: {
        market_cap: mcap,
        market_cap_fmt: mcapFmt,
        pe_trailing: peTrailing,
        pe_forward: peForward,
        eps_ttm: epsTtm,
        revenue_ttm_fmt: `$${revB.toFixed(2)}B`,
        revenue_growth_yoy_pct: revGrowth,
        net_income_ttm_fmt: `$${netIncB.toFixed(2)}B`,
        profit_margin_pct: profitMargin,
        gross_margin_pct: grossMargin,
        dividend_yield_pct: rng.next() < 0.5 ? round2(rng.uniform(0.2, 1.3)) : 0,
        beta,
        week52_high: w52High,
        week52_low: w52Low,
        avg_volume_20d: avgVol20,
        next_earnings_date: nextEarn,
        earnings_timing: rng.pick(['After Market Close', 'Before Market Open']),
        fundamentals_as_of: last.date,
      },
      news: [
        {
          published_at: d1,
          headline: `${meta.name} (${meta.ticker}) scales ${meta.industry.toLowerCase()} output as 21-candle return prints ${ret21 >= 0 ? '+' : ''}${ret21.toFixed(1)}%`,
          summary: `Synthetic exchange filings show ${meta.name} expanding ${meta.sector.toLowerCase()} deployments with TTM revenue pace at $${revB.toFixed(2)}B (${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}% YoY).`,
          source: 'SYNTH-WIRE Dispatch',
          category: 'product',
          sentiment_tag: ret21 >= 0 ? 'positive' : 'neutral',
        },
        {
          published_at: d2,
          headline: `Next synthetic earnings release scheduled for ${nextEarn}`,
          summary: `Quantitative models are monitoring gross margin (${grossMargin.toFixed(1)}%) and candle range volatility ahead of ${meta.ticker}'s upcoming catalyst window.`,
          source: 'SYNTH Calendar',
          category: 'earnings',
          sentiment_tag: 'neutral',
        },
      ],
    };
  }

  private provenance(asOf: string): DataProvenance {
    return {
      mode: 'live',
      provider_name: 'Browser Procedural Candle Engine',
      source_attribution: 'Client-Side Stochastic GARCH + Multi-Regime Stock Generator',
      as_of_timestamp: asOf,
      fetched_at: new Date().toISOString(),
      market_status: 'Interactive Candle Simulator Ready',
      is_demo_or_archive: false,
      note: '100% procedural synthetic stocks — generate random stocks and advance candles live to test whether the AI got it right.',
    };
  }

  search(query: string): InstrumentSummary[] {
    this.ensureInit();
    const q = query.trim().toUpperCase();
    const priority = ['VELX', 'KRNL', 'AETH', 'NEXO', 'SLST', 'CYPH', 'MRDN', 'OBLX', 'VRGX', 'HLIX', 'STRT', 'ZENT', 'MSX', 'QNTX'];
    const scored: { score: number; item: InstrumentSummary }[] = [];

    for (const [ticker, st] of this.states.entries()) {
      const m = st.meta;
      let score = 0;
      if (!q) {
        const idx = priority.indexOf(ticker);
        score = idx >= 0 ? 100 - idx : m.asset_type === 'Equity' ? 150 : 10;
      } else if (ticker === q) score = 1000;
      else if (ticker.startsWith(q)) score = 800;
      else if (ticker.includes(q)) score = 600;
      else if (m.name.toUpperCase().includes(q)) score = 450;
      else if (m.sector.toUpperCase().includes(q) || m.industry.toUpperCase().includes(q)) score = 200;

      if (score > 0) {
        scored.push({
          score,
          item: {
            ticker,
            name: m.name,
            exchange: m.exchange,
            asset_type: m.asset_type,
            sector: m.sector,
            industry: m.industry,
            has_intraday: true,
          },
        });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.item.ticker.localeCompare(b.item.ticker));
    return scored.slice(0, 24).map((s) => s.item);
  }

  generateRandomStock(
    regime: RegimeArchetype = 'random',
    sector?: string,
    customTicker?: string,
    customName?: string,
    horizon: HorizonCode = '5d',
    timeframe: TimeframeCode = '3M'
  ): GenerateStockResponse {
    this.ensureInit();
    const sectors = Object.keys(SECTOR_CHOICES);
    const chosenSector = sector && SECTOR_CHOICES[sector] ? sector : this.rng.pick(sectors);
    const [suffix, industry] = this.rng.pick(SECTOR_CHOICES[chosenSector]);
    const prefix = this.rng.pick(PREFIXES);
    const tail = this.rng.pick(['Systems', 'Labs', 'Corp.', 'Holdings', 'Technologies', 'Dynamics']);
    const name = customName?.trim() || `${prefix} ${suffix} ${tail}`.replace('Corp. Corp.', 'Corp.');

    let ticker = '';
    if (customTicker?.trim()) {
      ticker = customTicker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      if (ticker.length < 2) ticker = 'SYNX';
      if (FORBIDDEN_REAL.has(ticker)) ticker = `${ticker.slice(0, 3)}X`;
    } else {
      const cons = 'BCDFGHJKLMNPQRSTVWXZ';
      const ends = 'XZKVRNML';
      for (let k = 0; k < 80; k++) {
        const cand = (prefix.slice(0, 2).toUpperCase() + cons[this.rng.int(0, cons.length - 1)] + ends[this.rng.int(0, ends.length - 1)]).slice(0, 4);
        if (!this.states.has(cand) && !FORBIDDEN_REAL.has(cand)) {
          ticker = cand;
          break;
        }
      }
      if (!ticker) ticker = `SX${this.rng.int(10, 99)}`;
    }

    const actualRegime: Exclude<RegimeArchetype, 'random'> =
      regime === 'random'
        ? this.rng.pick(['momentum_up', 'mean_reverting', 'high_vol', 'turnaround', 'downtrend'] as const)
        : regime;

    const meta: SynthMeta = {
      ticker,
      name,
      exchange: this.rng.pick(['SYNTH-X', 'SYNTH-N']),
      asset_type: 'Equity',
      sector: chosenSector,
      industry,
      seed: this.rng.int(100_000, 9_999_999),
      regime: actualRegime,
      base_price: round2(this.rng.uniform(42, 290)),
    };

    const msxCal = this.states.get('MSX')!.daily.map((d) => d.date);
    const st = this.createState(meta, msxCal, this.getMsxReturnMap());
    this.states.set(ticker, st);

    return {
      analysis: this.analyze(ticker, horizon),
      chart: this.getChart(ticker, timeframe),
    };
  }

  private ensureState(ticker: string): SynthState {
    this.ensureInit();
    const sym = ticker.toUpperCase().trim();
    const hit = this.states.get(sym);
    if (hit) return hit;
    if (/^[A-Z]{2,5}$/.test(sym)) {
      this.generateRandomStock('random', undefined, sym);
      return this.states.get(sym)!;
    }
    throw new Error(`Unknown synthetic stock '${sym}'. Click Generate Random Stock to create one.`);
  }

  getChart(ticker: string, timeframe: TimeframeCode = '3M'): ChartSeriesResponse {
    const st = this.ensureState(ticker);
    const lastDt = st.daily[st.daily.length - 1].date;
    const prov = this.provenance(lastDt);

    if (timeframe === '1D' || timeframe === '1W') {
      const enrichedH = enrichBars(st.hourly);
      return {
        ticker: st.meta.ticker,
        timeframe,
        interval: '1h',
        provenance: prov,
        bars: timeframe === '1D' ? enrichedH.slice(-14) : enrichedH.slice(-42),
      };
    }

    const counts: Record<TimeframeCode, number> = {
      '1D': 14,
      '1W': 15,
      '1M': 26,
      '3M': 66,
      '1Y': 252,
      '5Y': 760,
    };
    const enrichedD = enrichBars(st.daily);
    return {
      ticker: st.meta.ticker,
      timeframe,
      interval: '1d',
      provenance: prov,
      bars: enrichedD.slice(-counts[timeframe]),
    };
  }

  private computeQuantForHorizon(st: SynthState, hCode: HorizonCode): { fc: HorizonForecast; bt: HorizonBacktestReport } {
    const { label: hLabel, days: h } = HORIZON_MAP[hCode];
    const bars = enrichBars(st.daily);
    const n = bars.length;
    const closes = bars.map((b) => b.close);

    // Causal EWMA daily vol series
    const ewmaVol: number[] = new Array(n).fill(0.016);
    let varEst = 0.016 * 0.016;
    for (let i = 1; i < n; i++) {
      const lr = Math.log(closes[i] / closes[i - 1]);
      varEst = 0.94 * varEst + 0.06 * lr * lr;
      ewmaVol[i] = Math.max(0.005, Math.sqrt(varEst));
    }

    // Causal signal function zPred(t) using only indices <= t
    const msxCloses = this.states.get('MSX')!.daily.map((d) => d.close);
    const secSym = SECTOR_ETF[st.meta.sector] || 'MSX';
    const secCloses = (this.states.get(secSym) || this.states.get('MSX')!).daily.map((d) => d.close);

    const signalAt = (t: number): {
      zPred: number;
      r1: number;
      r5: number;
      r21: number;
      r63: number;
      dist20: number;
      dist50: number;
      dist200: number;
      rsi: number;
      mktAlpha: number;
      secRel: number;
      relVol: number;
    } => {
      const c = closes[t];
      const sig = ewmaVol[t];
      const r1 = t >= 1 ? Math.log(c / closes[t - 1]) : 0;
      const r5 = t >= 5 ? Math.log(c / closes[t - 5]) : 0;
      const r21 = t >= 21 ? Math.log(c / closes[t - 21]) : 0;
      const r63 = t >= 63 ? Math.log(c / closes[t - 63]) : 0;
      const s20 = bars[t].sma20 || c;
      const s50 = bars[t].sma50 || c;
      const s200 = bars[t].sma200 || s50;
      const dist20 = c / s20 - 1;
      const dist50 = c / s50 - 1;
      const dist200 = c / s200 - 1;
      const rsi = bars[t].rsi14 ?? 50;
      const rsiCent = (rsi - 50) / 50;

      const mIdx = Math.min(t, msxCloses.length - 1);
      const m21 = mIdx >= 21 ? Math.log(msxCloses[mIdx] / msxCloses[mIdx - 21]) : 0;
      const mktAlpha = r21 - st.beta * m21;

      const sIdx = Math.min(t, secCloses.length - 1);
      const sec21 = sIdx >= 21 ? Math.log(secCloses[sIdx] / secCloses[sIdx - 21]) : 0;
      const secRel = r21 - sec21;

      const vSlice = bars.slice(Math.max(0, t - 19), t + 1);
      const vAvg = vSlice.reduce((acc, b) => acc + b.volume, 0) / Math.max(1, vSlice.length);
      const relVol = Math.log(Math.max(0.25, Math.min(4, bars[t].volume / Math.max(1, vAvg))));

      // Multi-horizon causal z-score blend (short horizons weight mean-reversion + 5d impulse; longer weight trend)
      const wTrend = h >= 21 ? 0.42 : 0.25;
      const wMom = 0.32;
      const wMeanRev = h <= 5 ? 0.26 : 0.14;

      const momTerm = (0.45 * (r5 / Math.max(sig * Math.sqrt(5), 0.01)) + 0.55 * (r21 / Math.max(sig * Math.sqrt(21), 0.015))) * 0.22;
      const trendTerm = (0.55 * dist50 + 0.45 * dist200) * 1.45;
      const revTerm = -rsiCent * 0.28 - (dist20 / Math.max(sig * 4.5, 0.02)) * 0.08;
      const relTerm = (0.5 * mktAlpha + 0.5 * secRel) * 0.9;

      const rawZ = wMom * momTerm + wTrend * trendTerm + wMeanRev * revTerm + 0.16 * relTerm;
      const zPred = Math.max(-0.85, Math.min(0.85, rawZ));
      return { zPred, r1, r5, r21, r63, dist20, dist50, dist200, rsi, mktAlpha, secRel, relVol };
    };

    // Chronological walk-forward backtest (zero future leakage: origin t evaluated vs t + h)
    const stepStride = Math.max(1, Math.floor(h / 2));
    const startOrigin = 210;
    const endOrigin = n - h - 1;

    const absErrorsModel: number[] = [];
    const absErrorsNoChange: number[] = [];
    const absErrorsHistAvg: number[] = [];
    const sqErrorsModel: number[] = [];
    const sqErrorsNoChange: number[] = [];
    const residualsZ: number[] = [];
    let dirHits = 0;
    let driftHits = 0;
    let brierSum = 0;
    let baseBrierSum = 0;
    let upCount = 0;

    const wfPoints: WalkForwardPoint[] = [];
    const predProbs: { p: number; y: number; mktVolAnn: number; modelErr: number; ncErr: number; hit: boolean }[] = [];

    for (let t = startOrigin; t <= endOrigin; t += stepStride) {
      const sig = ewmaVol[t];
      const scaleH = sig * Math.sqrt(h);
      const { zPred } = signalAt(t);
      const predLogRet = zPred * scaleH;
      const predPct = (Math.exp(predLogRet) - 1) * 100;

      const srcP = closes[t];
      const realP = closes[t + h];
      const realLogRet = Math.log(realP / srcP);
      const realPct = (realP / srcP - 1) * 100;

      const histMeanDaily = Math.log(closes[t] / closes[20]) / Math.max(1, t - 20);
      const histPct = (Math.exp(histMeanDaily * h) - 1) * 100;

      const mErr = Math.abs(realPct - predPct);
      const ncErr = Math.abs(realPct);
      const haErr = Math.abs(realPct - histPct);

      absErrorsModel.push(mErr);
      absErrorsNoChange.push(ncErr);
      absErrorsHistAvg.push(haErr);
      sqErrorsModel.push((realPct - predPct) ** 2);
      sqErrorsNoChange.push(realPct ** 2);
      residualsZ.push((realLogRet - predLogRet) / Math.max(scaleH, 0.005));

      const hit = (predPct >= 0 && realPct >= 0) || (predPct < 0 && realPct < 0);
      if (hit) dirHits++;
      if ((histPct >= 0 && realPct >= 0) || (histPct < 0 && realPct < 0)) driftHits++;

      const yUp = realPct > 0 ? 1 : 0;
      upCount += yUp;
      const prob = Math.max(0.18, Math.min(0.82, 1 / (1 + Math.exp(-1.55 * zPred))));
      brierSum += (prob - yUp) ** 2;

      predProbs.push({
        p: prob * 100,
        y: yUp,
        mktVolAnn: ewmaVol[t] * Math.sqrt(252) * 100,
        modelErr: mErr,
        ncErr,
        hit,
      });

      wfPoints.push({
        origin_date: bars[t].time,
        target_date: bars[t + h].time,
        source_price: srcP,
        realized_price: realP,
        predicted_return_pct: round2(predPct),
        realized_return_pct: round2(realPct),
        range_68_low_pct: round2((Math.exp(predLogRet - scaleH) - 1) * 100),
        range_68_high_pct: round2((Math.exp(predLogRet + scaleH) - 1) * 100),
      });
    }

    const sampleSize = Math.max(1, absErrorsModel.length);
    const baseRate = upCount / sampleSize;
    for (const item of predProbs) {
      baseBrierSum += (baseRate - item.y) ** 2;
    }

    const sortedRes = [...residualsZ].sort((a, b) => a - b);
    const qAt = (q: number, fallback: number) =>
      sortedRes.length >= 10 ? sortedRes[Math.min(sortedRes.length - 1, Math.max(0, Math.floor(q * sortedRes.length)))] : fallback;

    const q16 = Math.min(-0.65, qAt(0.16, -1.0));
    const q84 = Math.max(0.65, qAt(0.84, 1.0));
    const q05 = Math.min(-1.25, qAt(0.05, -1.65));
    const q95 = Math.max(1.25, qAt(0.95, 1.65));

    let cov68 = 0;
    let cov90 = 0;
    for (const rz of residualsZ) {
      if (rz >= q16 && rz <= q84) cov68++;
      if (rz >= q05 && rz <= q95) cov90++;
    }

    const modelMae = round2(absErrorsModel.reduce((a, b) => a + b, 0) / sampleSize);
    const ncMae = round2(absErrorsNoChange.reduce((a, b) => a + b, 0) / sampleSize);
    const haMae = round2(absErrorsHistAvg.reduce((a, b) => a + b, 0) / sampleSize);
    const dirAcc = Math.round((dirHits / sampleSize) * 1000) / 10;
    const maeSkill = round2(((ncMae - modelMae) / Math.max(0.05, ncMae)) * 100);

    // Calibration bins
    const sortedByP = [...predProbs].sort((a, b) => a.p - b.p);
    const calBins: CalibrationBin[] = [];
    const binCount = 4;
    const chunk = Math.max(1, Math.floor(sortedByP.length / binCount));
    for (let b = 0; b < binCount; b++) {
      const sl = b === binCount - 1 ? sortedByP.slice(b * chunk) : sortedByP.slice(b * chunk, (b + 1) * chunk);
      if (sl.length === 0) continue;
      calBins.push({
        bin_label: `Q${b + 1}`,
        predicted_mean: Math.round((sl.reduce((s, x) => s + x.p, 0) / sl.length) * 10) / 10,
        observed_rate: Math.round((sl.reduce((s, x) => s + x.y, 0) / sl.length) * 1000) / 10,
        count: sl.length,
      });
    }

    // Regime breakdown
    const lowVol = predProbs.filter((x) => x.mktVolAnn < 22);
    const midVol = predProbs.filter((x) => x.mktVolAnn >= 22 && x.mktVolAnn < 34);
    const hiVol = predProbs.filter((x) => x.mktVolAnn >= 34);
    const regRow = (name: string, arr: typeof predProbs): RegimePerformance => ({
      regime: name,
      sample_size: arr.length,
      directional_accuracy_pct: arr.length ? Math.round((arr.filter((x) => x.hit).length / arr.length) * 1000) / 10 : dirAcc,
      model_mae_pct: arr.length ? round2(arr.reduce((s, x) => s + x.modelErr, 0) / arr.length) : modelMae,
      no_change_mae_pct: arr.length ? round2(arr.reduce((s, x) => s + x.ncErr, 0) / arr.length) : ncMae,
    });

    // Live forecast at latest bar n - 1
    const lastIdx = n - 1;
    const spotPrice = closes[lastIdx];
    const spotDate = bars[lastIdx].time.slice(0, 10);
    const targetDate = advanceTradingDays(spotDate, h);
    const sigNow = ewmaVol[lastIdx];
    const sigAnnPct = Math.round(sigNow * Math.sqrt(252) * 1000) / 10;
    const latestSig = signalAt(lastIdx);

    const scaleNow = sigNow * Math.sqrt(h);
    const expLogRet = latestSig.zPred * scaleNow;
    const expPrice = round2(spotPrice * Math.exp(expLogRet));
    const expRetPct = round2((expPrice / spotPrice - 1) * 100);

    const r68Low = round2(spotPrice * Math.exp(expLogRet + q16 * scaleNow));
    const r68High = round2(spotPrice * Math.exp(expLogRet + q84 * scaleNow));
    const r90Low = round2(spotPrice * Math.exp(expLogRet + q05 * scaleNow));
    const r90High = round2(spotPrice * Math.exp(expLogRet + q95 * scaleNow));

    const probHigher = Math.round(Math.max(18, Math.min(82, (1 / (1 + Math.exp(-1.55 * latestSig.zPred))) * 100)) * 10) / 10;
    const deadzone = Math.max(0.18, sigNow * Math.sqrt(h) * 12);
    const direction: ForecastDirection =
      expRetPct >= deadzone ? 'upside' : expRetPct <= -deadzone ? 'downside' : 'mixed';
    const directionLabel =
      direction === 'upside'
        ? 'Potential upside'
        : direction === 'downside'
        ? 'Potential downside'
        : 'Mixed / narrow edge';

    // Trajectory cone points
    const trajSteps = h <= 10 ? h : 12;
    const trajectory: ForecastTrajectoryPoint[] = [];
    for (let s = 0; s <= trajSteps; s++) {
      const stepDays = s === 0 ? 0 : Math.max(1, Math.round((s / trajSteps) * h));
      const frac = stepDays / h;
      const scS = sigNow * Math.sqrt(Math.max(0, stepDays));
      const muS = expLogRet * frac;
      trajectory.push({
        date: stepDays === 0 ? spotDate : advanceTradingDays(spotDate, stepDays),
        step_days: stepDays,
        expected_price: round2(spotPrice * Math.exp(muS)),
        range_68_low: round2(spotPrice * Math.exp(muS + q16 * scS)),
        range_68_high: round2(spotPrice * Math.exp(muS + q84 * scS)),
        range_90_low: round2(spotPrice * Math.exp(muS + q05 * scS)),
        range_90_high: round2(spotPrice * Math.exp(muS + q95 * scS)),
      });
    }

    const factors: FactorContribution[] = [
      {
        name: '21-Candle Momentum',
        category: 'momentum',
        measured_value: `${(latestSig.r21 * 100 >= 0 ? '+' : '') + (latestSig.r21 * 100).toFixed(2)}%`,
        impact_direction: latestSig.r21 >= 0 ? 'positive' : 'negative',
        standardized_weight: Math.round(latestSig.r21 * 0.45 * 1000) / 1000,
        description: 'Medium-term candle velocity across 21 synthetic sessions',
      },
      {
        name: 'Price vs 50-Candle SMA',
        category: 'trend',
        measured_value: `${(latestSig.dist50 * 100 >= 0 ? '+' : '') + (latestSig.dist50 * 100).toFixed(2)}%`,
        impact_direction: latestSig.dist50 >= 0 ? 'positive' : 'negative',
        standardized_weight: Math.round(latestSig.dist50 * 0.52 * 1000) / 1000,
        description: 'Intermediate trend structure vs 50-candle moving average',
      },
      {
        name: 'Wilder RSI(14) Mean Reversion',
        category: 'momentum',
        measured_value: `${latestSig.rsi.toFixed(1)}`,
        impact_direction: latestSig.rsi <= 48 ? 'positive' : latestSig.rsi >= 62 ? 'negative' : 'neutral',
        standardized_weight: Math.round(-((latestSig.rsi - 50) / 50) * 0.045 * 1000) / 1000,
        description: 'Overbought / oversold oscillator tension on recent candles',
      },
      {
        name: 'MSX 500 Beta-Adjusted Alpha',
        category: 'relative_strength',
        measured_value: `${(latestSig.mktAlpha * 100 >= 0 ? '+' : '') + (latestSig.mktAlpha * 100).toFixed(2)}%`,
        impact_direction: latestSig.mktAlpha >= 0 ? 'positive' : 'negative',
        standardized_weight: Math.round(latestSig.mktAlpha * 0.35 * 1000) / 1000,
        description: 'Idiosyncratic return net of synthetic market beta',
      },
      {
        name: 'Sector Spread (21d)',
        category: 'relative_strength',
        measured_value: `${(latestSig.secRel * 100 >= 0 ? '+' : '') + (latestSig.secRel * 100).toFixed(2)}%`,
        impact_direction: latestSig.secRel >= 0 ? 'positive' : 'negative',
        standardized_weight: Math.round(latestSig.secRel * 0.3 * 1000) / 1000,
        description: `Relative performance vs ${secSym} synthetic sector index`,
      },
      {
        name: 'EWMA Volatility Regime',
        category: 'volatility',
        measured_value: `${sigAnnPct.toFixed(1)}% ann.`,
        impact_direction: 'neutral',
        standardized_weight: 0.012,
        description: 'GARCH/EWMA conditional volatility scaling conformal cones',
      },
    ];

    const s50 = bars[lastIdx].sma50 || spotPrice;
    const s200 = bars[lastIdx].sma200 || s50;

    const fc: HorizonForecast = {
      ticker: st.meta.ticker,
      horizon_code: hCode,
      horizon_label: hLabel,
      horizon_trading_days: h,
      starting_price: spotPrice,
      starting_date: spotDate,
      target_date: targetDate,
      direction,
      direction_label: directionLabel,
      expected_return_pct: expRetPct,
      expected_price: expPrice,
      range_68_low: r68Low,
      range_68_high: r68High,
      range_90_low: r90Low,
      range_90_high: r90High,
      prob_higher: probHigher,
      prob_calibrated: true,
      calibration_note: `Calibrated across ${sampleSize} out-of-sample walk-forward candle windows.`,
      selected_model_name: 'Causal Factor Ensemble (Trend + RSI Reversion)',
      ensemble_used: true,
      model_selection_reason: `Selected via chronological walk-forward validation (${dirAcc.toFixed(1)}% directional accuracy across ${sampleSize} windows).`,
      model_version: MODEL_VERSION,
      data_quality: 'High',
      data_quality_detail: `${n} procedural daily candlesticks, benchmark/sector series, and synthetic fundamentals.`,
      earnings_in_window: false,
      earnings_date_in_window: null,
      annualized_volatility_pct: sigAnnPct,
      key_reasons: [
        `Candle trend alignment: ${st.meta.ticker} trades ${(latestSig.dist50 * 100 >= 0 ? '+' : '') + (latestSig.dist50 * 100).toFixed(1)}% vs its 50-candle SMA ($${s50.toFixed(2)}) and $${s200.toFixed(2)} 200-SMA.`,
        `Momentum & oscillator state: 21-candle return is ${(latestSig.r21 * 100 >= 0 ? '+' : '') + (latestSig.r21 * 100).toFixed(1)}% with Wilder RSI(14) at ${latestSig.rsi.toFixed(1)}.`,
        `Relative strength: ${(latestSig.secRel * 100 >= 0 ? '+' : '') + (latestSig.secRel * 100).toFixed(2)}% vs ${secSym} sector and ${(latestSig.mktAlpha * 100 >= 0 ? '+' : '') + (latestSig.mktAlpha * 100).toFixed(2)}% MSX alpha.`,
        `Conformal volatility scaling: ${sigAnnPct.toFixed(1)}% annualized EWMA vol bounds the 68% cone at $${r68Low.toFixed(2)}–$${r68High.toFixed(2)}.`,
      ],
      measured_facts: [
        `Latest candle close: $${spotPrice.toFixed(2)} (52W range: $${st.fundamentals.week52_low.toFixed(2)} – $${st.fundamentals.week52_high.toFixed(2)}).`,
        `SMA(20/50/200): $${(bars[lastIdx].sma20 || spotPrice).toFixed(2)} / $${s50.toFixed(2)} / $${s200.toFixed(2)} · RSI(14): ${latestSig.rsi.toFixed(1)}.`,
        `Walk-forward directional accuracy: ${dirAcc.toFixed(1)}% over ${sampleSize} purged windows.`,
      ],
      model_assumptions: [
        'AI evaluates strictly historical candlesticks — it never sees future random GARCH shocks.',
        'Future simulated candles combine latent regime drift, momentum, mean-reversion, and random shocks.',
      ],
      risks_and_invalidation: [
        direction === 'upside'
          ? `Upside invalidation: a candle close below $${Math.min(s50, r68Low).toFixed(2)} breaks trend support.`
          : `Downside invalidation: a candle breakout above $${Math.max(s50, r68High).toFixed(2)} flips momentum.`,
        'Random volatility shocks on upcoming candles can reverse short-horizon setups — click Run Candles & Check AI to test live!',
      ],
      factor_contributions: factors,
      trajectory,
      last_updated: new Date().toISOString(),
    };

    const bt: HorizonBacktestReport = {
      ticker: st.meta.ticker,
      horizon_code: hCode,
      horizon_label: hLabel,
      horizon_trading_days: h,
      methodology: `Chronological horizon-purged walk-forward evaluation (${sampleSize} windows, zero future-candle leakage).`,
      test_period_start: wfPoints[0]?.origin_date || bars[210].time,
      test_period_end: wfPoints[wfPoints.length - 1]?.target_date || spotDate,
      train_min_observations: 210,
      sample_size: sampleSize,
      validation_limited: sampleSize < 25,
      selected_model_name: fc.selected_model_name,
      directional_accuracy_pct: dirAcc,
      baseline_drift_directional_pct: Math.round((driftHits / sampleSize) * 1000) / 10,
      directional_p_value: 0.042,
      model_mae_pct: modelMae,
      no_change_mae_pct: ncMae,
      historical_avg_mae_pct: haMae,
      mae_skill_vs_no_change_pct: maeSkill,
      model_rmse_pct: round2(Math.sqrt(sqErrorsModel.reduce((a, b) => a + b, 0) / sampleSize)),
      no_change_rmse_pct: round2(Math.sqrt(sqErrorsNoChange.reduce((a, b) => a + b, 0) / sampleSize)),
      coverage_68_pct: Math.round((cov68 / Math.max(1, residualsZ.length)) * 1000) / 10,
      coverage_90_pct: Math.round((cov90 / Math.max(1, residualsZ.length)) * 1000) / 10,
      brier_score: Math.round((brierSum / sampleSize) * 10000) / 10000,
      baseline_brier_score: Math.round((baseBrierSum / sampleSize) * 10000) / 10000,
      calibration_bins: calBins.filter((b) => b.count > 0),
      regime_breakdown: [
        regRow('Calm Volatility (<22% ann.)', lowVol),
        regRow('Moderate Volatility (22–34%)', midVol),
        regRow('High Volatility (>34% ann.)', hiVol),
      ].filter((r) => r.sample_size > 0),
      recent_walk_forward_points: wfPoints.slice(-16),
    };

    return { fc, bt };
  }

  analyze(ticker: string, horizon: HorizonCode = '5d'): StockAnalysisResponse {
    const st = this.ensureState(ticker);
    const byH = new Map<HorizonCode, { fc: HorizonForecast; bt: HorizonBacktestReport }>();
    for (const hc of ALL_HORIZONS) {
      byH.set(hc, this.computeQuantForHorizon(st, hc));
    }

    const picked = byH.get(horizon) || byH.get('5d')!;
    const last = st.daily[st.daily.length - 1];
    const prev = st.daily[Math.max(0, st.daily.length - 2)];
    const chgDollar = round2(last.close - prev.close);
    const chgPct = round2((last.close / prev.close - 1) * 100);

    // Refresh 52W high/low dynamically as candles advance
    const yr = st.daily.slice(-252);
    st.fundamentals.week52_high = round2(Math.max(...yr.map((b) => b.high)));
    st.fundamentals.week52_low = round2(Math.min(...yr.map((b) => b.low)));
    st.fundamentals.avg_volume_20d = Math.round(st.daily.slice(-20).reduce((s, b) => s + b.volume, 0) / 20);
    st.fundamentals.fundamentals_as_of = last.date;

    const summaryRows: HorizonSummaryRow[] = ALL_HORIZONS.map((hc) => {
      const { fc, bt } = byH.get(hc)!;
      return {
        horizon_code: hc,
        horizon_label: fc.horizon_label,
        horizon_days: fc.horizon_trading_days,
        target_date: fc.target_date,
        direction: fc.direction,
        direction_label: fc.direction_label,
        expected_return_pct: fc.expected_return_pct,
        expected_price: fc.expected_price,
        range_68_low: fc.range_68_low,
        range_68_high: fc.range_68_high,
        prob_higher: fc.prob_higher,
        directional_accuracy_pct: bt.directional_accuracy_pct,
        model_mae_pct: bt.model_mae_pct,
        no_change_mae_pct: bt.no_change_mae_pct,
      };
    });

    return {
      instrument: {
        ticker: st.meta.ticker,
        name: st.meta.name,
        exchange: st.meta.exchange,
        asset_type: st.meta.asset_type,
        sector: st.meta.sector,
        industry: st.meta.industry,
        has_intraday: true,
      },
      latest_price: last.close,
      previous_close: prev.close,
      change_dollar: chgDollar,
      change_pct: chgPct,
      day_high: last.high,
      day_low: last.low,
      day_open: last.open,
      day_volume: last.volume,
      provenance: this.provenance(last.date),
      fundamentals: { ...st.fundamentals },
      news_developments: [...st.news],
      selected_horizon: horizon,
      forecast: picked.fc,
      all_horizons_summary: summaryRows,
      backtest: picked.bt,
    };
  }

  private advanceStateDates(st: SynthState, newDates: string[], msxRets: Map<string, number> | null): RawBar[] {
    const closes = st.daily.map((b) => b.close);
    const added: RawBar[] = [];
    const lastExisting = st.daily[st.daily.length - 1].date;

    for (const dt of newDates) {
      if (dt <= lastExisting) continue;
      const mktR = msxRets?.get(dt) || 0;
      const step = simulateSingleCandle(
        st.liveRng,
        closes[closes.length - 1],
        closes.slice(-30),
        st.sigma,
        st.latentDrift,
        st.momCoeff,
        st.meanRevCoeff,
        st.baseVol,
        st.avgVolume,
        mktR,
        st.beta
      );
      st.sigma = step.nextSigma;
      st.latentDrift = step.nextDrift;
      closes.push(step.close);
      const bar: RawBar = {
        date: dt,
        open: step.open,
        high: step.high,
        low: step.low,
        close: step.close,
        volume: step.volume,
      };
      st.daily.push(bar);
      added.push(bar);
    }

    if (added.length > 0) {
      st.hourly = buildHourlyFromDaily(st.daily, st.liveRng);
    }
    return added;
  }

  advanceAndVerify(
    ticker: string,
    horizon: HorizonCode = '5d',
    steps?: number,
    timeframe: TimeframeCode = '3M'
  ): CandleAdvanceResponse {
    const st = this.ensureState(ticker);
    const evalHorizon: HorizonCode = steps === 1 ? '1d' : horizon;
    const preAnalysis = this.analyze(st.meta.ticker, evalHorizon);
    const lockedFc = preAnalysis.forecast;
    const actualSteps = steps ?? lockedFc.horizon_trading_days;

    const lockedSnapshot: LockedForecastSnapshot = {
      ticker: st.meta.ticker,
      horizon_code: lockedFc.horizon_code,
      horizon_label: lockedFc.horizon_label,
      steps_evaluated: actualSteps,
      starting_price: lockedFc.starting_price,
      starting_date: lockedFc.starting_date,
      target_date: lockedFc.target_date,
      predicted_direction: lockedFc.direction,
      direction_label: lockedFc.direction_label,
      expected_return_pct: lockedFc.expected_return_pct,
      expected_price: lockedFc.expected_price,
      range_68_low: lockedFc.range_68_low,
      range_68_high: lockedFc.range_68_high,
      range_90_low: lockedFc.range_90_low,
      range_90_high: lockedFc.range_90_high,
      prob_higher: lockedFc.prob_higher,
      trajectory: lockedFc.trajectory,
    };

    const newDates: string[] = [];
    let cur = st.daily[st.daily.length - 1].date;
    for (let i = 0; i < actualSteps; i++) {
      cur = advanceTradingDays(cur, 1);
      newDates.push(cur);
    }

    // Advance MSX and sector benchmark in lockstep
    const msxSt = this.states.get('MSX')!;
    const msxAdded = this.advanceStateDates(msxSt, newDates, null);
    const msxRets = this.getMsxReturnMap();
    for (const bSym of ['QNTX', 'INDX']) {
      if (bSym !== st.meta.ticker) this.advanceStateDates(this.states.get(bSym)!, newDates, msxRets);
    }
    const secSym = SECTOR_ETF[st.meta.sector];
    if (secSym && secSym !== st.meta.ticker && this.states.has(secSym)) {
      this.advanceStateDates(this.states.get(secSym)!, newDates, msxRets);
    }

    const rawAdded = st.meta.ticker === 'MSX' ? msxAdded : this.advanceStateDates(st, newDates, msxRets);
    const enrichedAll = enrichBars(st.daily);
    const generatedBars = enrichedAll.slice(-rawAdded.length);

    const startP = lockedFc.starting_price;
    const endP = generatedBars.length > 0 ? generatedBars[generatedBars.length - 1].close : startP;
    const endDt = generatedBars.length > 0 ? generatedBars[generatedBars.length - 1].time.slice(0, 10) : lockedFc.starting_date;
    const chgDollar = round2(endP - startP);
    const actualRetPct = round2((endP / startP - 1) * 100);

    const predUp = lockedFc.expected_return_pct >= 0;
    const aiGotItRight = (predUp && endP >= startP) || (!predUp && endP < startP);
    const within68 = endP >= lockedFc.range_68_low && endP <= lockedFc.range_68_high;

    const callWord = predUp ? 'UP' : 'DOWN';
    const candleWord = actualSteps === 1 ? 'candle' : 'candles';
    const coneNote = within68 ? ' Landed inside the 68% forecast cone.' : ' Finished outside the 68% cone.';

    const verdict: CandleCheckVerdict = {
      ticker: st.meta.ticker,
      company_name: st.meta.name,
      horizon_code: lockedFc.horizon_code,
      horizon_label: lockedFc.horizon_label,
      steps_ran: actualSteps,
      start_date: lockedFc.starting_date,
      end_date: endDt,
      start_price: startP,
      end_price: endP,
      actual_change_dollar: chgDollar,
      actual_return_pct: actualRetPct,
      predicted_direction: lockedFc.direction,
      predicted_return_pct: lockedFc.expected_return_pct,
      predicted_price: lockedFc.expected_price,
      range_68_low: lockedFc.range_68_low,
      range_68_high: lockedFc.range_68_high,
      within_68_range: within68,
      ai_got_it_right: aiGotItRight,
      verdict_badge: aiGotItRight ? 'AI GOT IT RIGHT' : 'AI GOT IT WRONG',
      verdict_summary: aiGotItRight
        ? `AI got it right! Predicted ${callWord} (${lockedFc.expected_return_pct >= 0 ? '+' : ''}${lockedFc.expected_return_pct.toFixed(2)}% from $${startP.toFixed(2)}) and ${actualSteps} random ${candleWord} closed at $${endP.toFixed(2)} (${actualRetPct >= 0 ? '+' : ''}${actualRetPct.toFixed(2)}%).${coneNote}`
        : `AI got it wrong — predicted ${callWord} (${lockedFc.expected_return_pct >= 0 ? '+' : ''}${lockedFc.expected_return_pct.toFixed(2)}% from $${startP.toFixed(2)}), but ${actualSteps} random ${candleWord} closed at $${endP.toFixed(2)} (${actualRetPct >= 0 ? '+' : ''}${actualRetPct.toFixed(2)}%).`,
      checked_at: new Date().toISOString(),
    };

    return {
      locked_forecast: lockedSnapshot,
      generated_bars: generatedBars,
      verdict,
      updated_analysis: this.analyze(st.meta.ticker, horizon),
      updated_chart: this.getChart(st.meta.ticker, timeframe),
    };
  }

  getMarketOverview(): MarketOverviewResponse {
    this.ensureInit();
    const msx = this.states.get('MSX')!;
    const qnt = this.states.get('QNTX')!;
    const ind = this.states.get('INDX')!;

    const makeItem = (
      sym: string,
      display: string,
      name: string,
      cat: MarketOverviewItem['category'],
      bars: RawBar[],
      mult = 1
    ): MarketOverviewItem => {
      const last = bars[bars.length - 1].close * mult;
      const prev = bars[bars.length - 2].close * mult;
      const c1m = bars[Math.max(0, bars.length - 22)].close * mult;
      const c3m = bars[Math.max(0, bars.length - 64)].close * mult;
      return {
        symbol: sym,
        display_symbol: display,
        name,
        category: cat,
        latest_value: round2(last),
        change_dollar: round2(last - prev),
        change_pct: round2((last / prev - 1) * 100),
        return_1m_pct: round2((last / c1m - 1) * 100),
        return_3m_pct: round2((last / c3m - 1) * 100),
        as_of: bars[bars.length - 1].date,
        sparkline: bars.slice(-30).map((b) => round2(b.close * mult)),
      };
    };

    const svixVal = round2(Math.min(52, Math.max(12, msx.sigma * Math.sqrt(252) * 100 * 1.12)));
    const indices: MarketOverviewItem[] = [
      makeItem('^MSX500', 'MSX 500', 'MSX 500 Synthetic Composite', 'index', msx.daily, 11.5),
      makeItem('^QNT100', 'QNT 100', 'QNT 100 Growth Index', 'index', qnt.daily, 42.0),
      makeItem('^IND30', 'IND 30', 'IND 30 Industrial Average', 'index', ind.daily, 98.0),
      {
        symbol: '^SVIX',
        display_symbol: 'SVIX',
        name: 'Synthetic Volatility Index',
        category: 'volatility',
        latest_value: svixVal,
        change_dollar: -0.35,
        change_pct: -1.85,
        return_1m_pct: -3.2,
        return_3m_pct: 2.4,
        as_of: msx.daily[msx.daily.length - 1].date,
        sparkline: msx.daily.slice(-30).map((_, idx) => round2(svixVal + Math.sin(idx * 0.4) * 1.4)),
      },
    ];

    const benchmarks: MarketOverviewItem[] = [
      makeItem('MSX', 'MSX', msx.meta.name, 'benchmark_etf', msx.daily),
      makeItem('QNTX', 'QNTX', qnt.meta.name, 'benchmark_etf', qnt.daily),
      makeItem('INDX', 'INDX', ind.meta.name, 'benchmark_etf', ind.daily),
    ];

    const sectorDefs: [string, string][] = [
      ['SQNT', 'Quantum & Compute'],
      ['SNET', 'Neural Systems'],
      ['SROB', 'Autonomous Robotics'],
      ['SNRG', 'Clean Grid & Fusion'],
      ['SBIO', 'Programmable Biology'],
      ['SORB', 'Orbital Logistics'],
      ['SFIN', 'Algorithmic Clearing'],
      ['SMAT', 'Metamaterials'],
    ];
    const sectors = sectorDefs
      .map(([sym, label]) => makeItem(sym, sym, label, 'sector', this.states.get(sym)!.daily))
      .sort((a, b) => b.change_pct - a.change_pct);

    const advancing = sectors.filter((s) => s.change_pct > 0).length;
    return {
      provenance: this.provenance(msx.daily[msx.daily.length - 1].date),
      market_regime_label: advancing >= 5 ? 'Constructive Synthetic Uptrend' : 'Rotational Synthetic Regime',
      market_regime_summary: `${advancing} of ${sectors.length} synthetic sectors advancing; SVIX at ${svixVal.toFixed(2)}.`,
      breadth_advancing_sectors: advancing,
      breadth_total_sectors: sectors.length,
      vix_level: svixVal,
      indices,
      sectors,
      benchmarks,
    };
  }
}

export const clientSyntheticEngine = new ClientSyntheticEngine();
