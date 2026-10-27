/**
 * Centralized editorial copy & brand text configuration.
 * Edit values below to customize headlines, the personal origin story, or disclosures.
 */

export const SITE_COPY = {
  brand: {
    name: 'MARKET / SIGNAL',
    tagline: 'Quantitative Equity Research & Calibrated Forecasting',
  },
  hero: {
    eyebrow: 'QUANTITATIVE MARKET INTELLIGENCE',
    headline: 'See the market from a different perspective.',
    supportingText:
      'AI-powered stock analysis combining market data, historical trends, financial fundamentals, and quantitative forecasting to help you understand what might happen next.',
    primaryCta: 'Start Analyzing',
    secondaryCta: 'Explore the Dashboard',
  },
  personalStory: {
    eyebrow: 'ORIGIN',
    heading: 'Made because Danish asked.',
    body: 'I made this because my friend Danish wanted me to build a tool that uses AI to predict stock movements. What started as an idea became a project to explore how artificial intelligence, financial data, and quantitative analysis can work together to make market research smarter.',
    footnote: 'Designed around empirical walk-forward verification, transparent baselines, and calibrated uncertainty.',
  },
  responsibleDisclosure: {
    shortBanner:
      'Forecasts are probabilistic quantitative estimates derived from historical market data and fundamentals — not investment advice or a guarantee of future returns.',
    detailedStatement:
      'Equity prices are influenced by macroeconomic shifts, earnings surprises, liquidity shocks, and unscheduled events that statistical models cannot anticipate. MARKET / SIGNAL evaluates every horizon via chronological walk-forward backtesting without future-data leakage, compares error rates against No-Change and Historical-Average baselines, and reports calibrated intervals rather than certainty.',
  },
} as const;

export const HORIZON_OPTIONS = [
  { code: '1d' as const, shortLabel: '1 Session', fullLabel: 'Next trading session' },
  { code: '5d' as const, shortLabel: '5D', fullLabel: '5 trading days' },
  { code: '21d' as const, shortLabel: '1M', fullLabel: '1 month' },
  { code: '63d' as const, shortLabel: '3M', fullLabel: '3 months' },
  { code: '126d' as const, shortLabel: '6M', fullLabel: '6 months' },
];
