/**
 * Centralized editorial copy & brand text configuration.
 * Edit values below to customize headlines, the personal origin story, or disclosures.
 */

export const SITE_COPY = {
  brand: {
    name: 'MARKET / SIGNAL',
    tagline: 'Procedural Stock Generator & AI Candle Forecast Verification',
  },
  hero: {
    eyebrow: 'PROCEDURAL CANDLE ENGINE · LIVE AI VERIFICATION',
    headline: 'See the market from a different perspective.',
    supportingText:
      'Generate synthetic stocks with realistic candlestick histories, let the quantitative AI forecast the next move, and run random future candles live on the chart to check whether the AI got it right.',
    primaryCta: 'Generate Random Stock',
    secondaryCta: 'Explore the Simulator',
  },
  personalStory: {
    eyebrow: 'ORIGIN',
    heading: 'Made because of what my friend Tanish said.',
    body: 'I made this because my friend Tanish said I should build a tool that uses AI to predict stock movements. Instead of pulling real-world tickers, it pairs a random stock generator with stochastic candlestick simulation—turning what my friend Tanish said into an interactive lab where you can run future candles forward and immediately see if the AI got it right.',
    footnote: 'Inspired by what my friend Tanish said — built with walk-forward calibration, conformal volatility cones, and live candle verification.',
  },
  responsibleDisclosure: {
    shortBanner:
      '100% synthetic stock generator & educational AI sandbox — all tickers, companies, and candlestick movements are procedurally simulated and never represent real securities or investment advice.',
    detailedStatement:
      'Every company, ticker symbol, fundamental snapshot, and candlestick series on MARKET / SIGNAL is procedurally generated using multi-regime GARCH(1,1) volatility clustering, momentum persistence, and fat-tailed random shocks. The AI forecasting model evaluates strictly past candles without seeing future random shocks, allowing you to advance candles randomly and test its directional accuracy honestly.',
  },
} as const;

export const HORIZON_OPTIONS = [
  { code: '1d' as const, shortLabel: '1 Candle', fullLabel: 'Next candle (1d)', candles: 1 },
  { code: '5d' as const, shortLabel: '5 Candles', fullLabel: '5 candles (5d)', candles: 5 },
  { code: '21d' as const, shortLabel: '21 Candles', fullLabel: '21 candles (1M)', candles: 21 },
  { code: '63d' as const, shortLabel: '63 Candles', fullLabel: '63 candles (3M)', candles: 63 },
  { code: '126d' as const, shortLabel: '126 Candles', fullLabel: '126 candles (6M)', candles: 126 },
];

export const REGIME_OPTIONS = [
  { code: 'random' as const, label: 'Surprise Me (Random Regime)' },
  { code: 'momentum_up' as const, label: 'Momentum Uptrend' },
  { code: 'mean_reverting' as const, label: 'Mean-Reverting Range' },
  { code: 'high_vol' as const, label: 'High-Volatility Swings' },
  { code: 'turnaround' as const, label: 'Cycle Turnaround' },
  { code: 'downtrend' as const, label: 'Bearish Distribution' },
];
