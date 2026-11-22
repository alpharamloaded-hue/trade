import { DigitStat, PatternDetection, TickData, TradeEntrySignal } from '../types/deriv';
import { computeDigitStats, scanPatterns, calculateConfidence, calculateMartingaleLadder, MartingaleStep } from './digitAnalysis';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'UNKNOWN';
export type IndexCategory = 'VOLATILITY' | 'BOOM_CRASH' | 'SNAP' | 'JUMP_DEX' | 'UNKNOWN';

export type FixedStrategyType = 
  | 'BOLLINGER_MEAN_REVERSION'
  | 'RSI_MEAN_REVERSION'
  | 'BOLLINGER_SQUEEZE'
  | 'DIGIT_DIFFER_COLD'
  | 'DIGIT_MATCH_DROUGHT'
  | 'RSI_BETWEEN_SPIKES'
  | 'BOLLINGER_SPIKE_AWARE'
  | 'SNAP_RHYTHM_TRADE'
  | 'SNAP_SIZE_PREDICTION'
  | 'JUMP_TIMING' 
  | 'GAP_FILL';

export type StrategyCategory = 'VOLATILITY' | 'BOOM_CRASH' | 'SNAP' | 'JUMP_DEX';

export interface FixedStrategyConfig {
  type: string;
  category: string;
  enabled: boolean;
  minConviction: number;
  minConfluenceCount: number;
  maxConcurrent: number;
  baseStakePercent: number;
  maxStakePercent: number;
  maxDailyLossPercent: number;
  cooldownTicks: number;
  minRiskReward: number;
  requireTrendAlignment: boolean;
  avoidHighVolatility: boolean;
  allowedSymbols: string[];
  forbiddenSymbols: string[];
  bestContract: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
  bestSymbols: string[];
  warning?: string;
}

export interface FixedSignal {
  id: string;
  strategy: string;
  category: string;
  conviction: number;
  confluenceFactors: string[];
  marketRegime: string;
  contractType: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
  param: number;
  stakePercent: number;
  stakeAmount: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward: number;
  expectedWinRate: number;
  expectedValue: number;
  headline: string;
  reasoning: string[];
  regimeReasoning: string[];
  timestamp: number;
  expiresAt: number;
  symbol: string;
  indexCategory: string;
}

export interface TradeResult {
  id: string;
  signalId: string;
  strategy: string;
  contractType: string;
  stake: number;
  entryPrice: number;
  exitPrice?: number;
  payout: number;
  won: boolean;
  profit: number;
  riskReward: number;
  holdTimeMs: number;
  exitReason: 'TP' | 'SL' | 'TRAILING' | 'MANUAL' | 'EXPIRED';
  timestamp: number;
  digit?: number;
  multiplier?: number;
}

export interface MarketState {
  regime: string;
  trendStrength: number;
  volatility: number;
  session: 'ASIAN' | 'LONDON' | 'NY' | 'CLOSED';
  trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  volatilityPercentile: number;
  lastSpikeAgo?: number;
  spikeActive?: boolean;
}

export interface StrategyPerformance {
  strategy: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  totalStaked: number;
  roi: number;
  avgConviction: number;
  maxDrawdown: number;
  currentStreak: number;
  bestStreak: number;
  worstStreak: number;
  avgHoldTime: number;
  profitFactor: number;
  sharpeRatio: number;
  lastTradeTime: number;
}

const INDEX_CATEGORIES: Record<string, string> = {
  '1HZ10V': 'VOLATILITY', '1HZ25V': 'VOLATILITY', '1HZ50V': 'VOLATILITY',
  '1HZ75V': 'VOLATILITY', '1HZ100V': 'VOLATILITY', '1HZ150V': 'VOLATILITY',
  '1HZ250V': 'VOLATILITY',
  'R_10': 'VOLATILITY', 'R_25': 'VOLATILITY', 'R_50': 'VOLATILITY',
  'R_75': 'VOLATILITY', 'R_100': 'VOLATILITY',
  'BOOM1000': 'BOOM_CRASH', 'CRASH1000': 'BOOM_CRASH',
  'BOOM500': 'BOOM_CRASH', 'CRASH500': 'BOOM_CRASH',
  'BOOM300': 'BOOM_CRASH', 'CRASH300': 'BOOM_CRASH',
  'SNAP50': 'SNAP', 'SNAP80': 'SNAP',
  'JUMP10': 'JUMP_DEX', 'JUMP25': 'JUMP_DEX', 'JUMP50': 'JUMP_DEX',
  'JUMP75': 'JUMP_DEX', 'JUMP100': 'JUMP_DEX',
  'DEX600': 'JUMP_DEX', 'DEX900': 'JUMP_DEX', 'DEX1500': 'JUMP_DEX',
};

const DROUGHT_THRESHOLDS: Record<string, number> = {
  '1HZ10V': 18, '1HZ25V': 20, '1HZ50V': 22, '1HZ75V': 24,
  '1HZ100V': 25, '1HZ150V': 28, '1HZ250V': 30,
  'R_10': 18, 'R_25': 20, 'R_50': 22, 'R_75': 24, 'R_100': 25,
};

const BASE_WIN_RATES: Record<string, number> = {
  BOLLINGER_MEAN_REVERSION: 0.65,
  RSI_MEAN_REVERSION: 0.60,
  BOLLINGER_SQUEEZE: 0.55,
  DIGIT_DIFFER_COLD: 0.90,
  DIGIT_MATCH_DROUGHT: 0.15,
  RSI_BETWEEN_SPIKES: 0.65,
  BOLLINGER_SPIKE_AWARE: 0.55,
  SNAP_RHYTHM_TRADE: 0.70,
  SNAP_SIZE_PREDICTION: 0.60,
  JUMP_TIMING: 0.55,
  GAP_FILL: 0.60,
};

const STRATEGY_PAYOUTS: Record<string, number> = {
  BOLLINGER_MEAN_REVERSION: 1.09,
  RSI_MEAN_REVERSION: 1.09,
  BOLLINGER_SQUEEZE: 1.09,
  DIGIT_DIFFER_COLD: 1.09,
  DIGIT_MATCH_DROUGHT: 9.2,
  RSI_BETWEEN_SPIKES: 1.09,
  BOLLINGER_SPIKE_AWARE: 1.09,
  SNAP_RHYTHM_TRADE: 20,
  SNAP_SIZE_PREDICTION: 50,
  JUMP_TIMING: 1.5,
  GAP_FILL: 1.8,
};

const STRATEGY_CONTRACTS: Record<string, 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN'> = {
  BOLLINGER_MEAN_REVERSION: 'DIGITDIFF',
  RSI_MEAN_REVERSION: 'DIGITDIFF',
  BOLLINGER_SQUEEZE: 'DIGITDIFF',
  DIGIT_DIFFER_COLD: 'DIGITDIFF',
  DIGIT_MATCH_DROUGHT: 'DIGITMATCH',
  RSI_BETWEEN_SPIKES: 'DIGITDIFF',
  BOLLINGER_SPIKE_AWARE: 'DIGITDIFF',
  SNAP_RHYTHM_TRADE: 'MULTUP',
  SNAP_SIZE_PREDICTION: 'MULTUP',
  JUMP_TIMING: 'MULTUP',
  GAP_FILL: 'MULTUP',
};

const STRATEGY_LABELS: Record<string, string> = {
  BOLLINGER_MEAN_REVERSION: 'Bollinger Mean Reversion (1.09x)',
  RSI_MEAN_REVERSION: 'RSI Mean Reversion (1.09x)',
  BOLLINGER_SQUEEZE: 'Bollinger Squeeze (1.09x)',
  DIGIT_DIFFER_COLD: 'Cold Digit Differ (1.09x) ~90% WR',
  DIGIT_MATCH_DROUGHT: 'Drought Match (9.2x) HIGH RISK',
  RSI_BETWEEN_SPIKES: 'RSI Between Spikes (1.09x) ⚠️',
  BOLLINGER_SPIKE_AWARE: 'BB Spike Aware (1.09x) ⚠️⚠️',
  SNAP_RHYTHM_TRADE: 'Snap Rhythm Trade (20-50x)',
  SNAP_SIZE_PREDICTION: 'Snap Size Prediction (50x)',
  JUMP_TIMING: 'Jump Timing (1.5-2x)',
  GAP_FILL: 'Gap Fill (1.8x)',
};

const ENHANCED_CONFIGS: Record<string, any> = {
  BOLLINGER_MEAN_REVERSION: {
    type: 'BOLLINGER_MEAN_REVERSION',
    category: 'VOLATILITY',
    enabled: true,
    minConviction: 75,
    minConfluenceCount: 2,
    maxConcurrent: 2,
    baseStakePercent: 1.0,
    maxStakePercent: 2.5,
    maxDailyLossPercent: 3,
    cooldownTicks: 10,
    minRiskReward: 2.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
    forbiddenSymbols: ['BOOM1000', 'CRASH1000', 'BOOM500', 'CRASH500', 'BOOM300', 'CRASH300', 'SNAP50', 'SNAP80'],
    bestContract: 'DIGITDIFF',
    bestSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', 'R_10', 'R_25', 'R_50'],
    warning: 'Only on Volatility indices. Bollinger Bands are constant width = perfect mean reversion corridor. Touch upper/lower band = mean reversion entry.',
  },
  RSI_MEAN_REVERSION: {
    type: 'RSI_MEAN_REVERSION',
    category: 'VOLATILITY',
    enabled: true,
    minConviction: 70,
    minConfluenceCount: 2,
    maxConcurrent: 2,
    baseStakePercent: 1.0,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 15,
    minRiskReward: 2.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
    forbiddenSymbols: ['BOOM1000', 'CRASH1000', 'SNAP50', 'SNAP80'],
    bestContract: 'DIGITDIFF',
    bestSymbols: ['1HZ10V', '1HZ25V', 'R_10', 'R_25'],
    warning: 'Only on Volatility indices. RSI 30/70 on pure random walk. RSI 30 = oversold = buy call, RSI 70 = overbought = buy put.',
  },
  BOLLINGER_SQUEEZE: {
    type: 'BOLLINGER_SQUEEZE',
    category: 'VOLATILITY',
    enabled: true,
    minConviction: 80,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 2,
    cooldownTicks: 20,
    minRiskReward: 3.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'],
    forbiddenSymbols: ['BOOM1000', 'CRASH1000', 'SNAP50', 'SNAP80'],
    bestContract: 'DIGITDIFF',
    bestSymbols: ['1HZ10V', '1HZ25V'],
    warning: 'Rare on constant-vol indices. Bollinger Band width contraction signals impending expansion. Only trade if confirmed by RSI.',
  },
  DIGIT_DIFFER_COLD: {
    type: 'DIGIT_DIFFER_COLD',
    category: 'VOLATILITY',
    enabled: true,
    minConviction: 88,
    minConfluenceCount: 2,
    maxConcurrent: 2,
    baseStakePercent: 1.5,
    maxStakePercent: 3.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 5,
    minRiskReward: 2.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
    forbiddenSymbols: [],
    bestContract: 'DIGITDIFF',
    bestSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', 'R_10', 'R_25'],
    warning: 'HIGHEST WIN RATE STRATEGY (~90%). Bet against ultra-cold digit (freq ≤5%, drought ≥8). 1.09x payout with 90%+ win rate. Best for compounding.',
  },
  DIGIT_MATCH_DROUGHT: {
    type: 'DIGIT_MATCH_DROUGHT',
    category: 'VOLATILITY',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 4,
    cooldownTicks: 15,
    minRiskReward: 4.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V', 'R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
    forbiddenSymbols: [],
    bestContract: 'DIGITMATCH',
    bestSymbols: ['1HZ10V', '1HZ25V', '1HZ50V'],
    warning: 'High risk, high reward (9.2x). Only on EXTREME drought (≥25 ticks, adjust for symbol vol). Never exceed 1% stake. Use for rare home-run trades only.',
  },
  RSI_BETWEEN_SPIKES: {
    type: 'RSI_BETWEEN_SPIKES',
    category: 'BOOM_CRASH',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.0,
    maxDailyLossPercent: 2,
    cooldownTicks: 30,
    minRiskReward: 3.0,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    allowedSymbols: ['BOOM1000', 'CRASH1000', 'BOOM500', 'CRASH500', 'BOOM300', 'CRASH300'],
    forbiddenSymbols: ['1HZ10V', '1HZ25V', 'SNAP50', 'SNAP80'],
    bestContract: 'DIGITDIFF',
    bestSymbols: ['BOOM300', 'CRASH300'],
    warning: 'DANGEROUS. Spikes distort ALL windowed indicators for 14-50 bars. RSI only valid between spikes. Check spike timing before entry. Avoid entirely if possible.',
  },
  BOLLINGER_SPIKE_AWARE: {
    type: 'BOLLINGER_SPIKE_AWARE',
    category: 'BOOM_CRASH',
    enabled: false,
    minConviction: 90,
    minConfluenceCount: 4,
    maxConcurrent: 1,
    baseStakePercent: 0.3,
    maxStakePercent: 0.8,
    maxDailyLossPercent: 1.5,
    cooldownTicks: 50,
    minRiskReward: 4.0,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    allowedSymbols: ['BOOM1000', 'CRASH1000'],
    forbiddenSymbols: [],
    bestContract: 'DIGITDIFF',
    bestSymbols: [],
    warning: 'EXTREME CAUTION. Bollinger Bands distorted for 20 bars after EVERY spike. Only use if you can precisely time between spikes. Not recommended.',
  },
  SNAP_RHYTHM_TRADE: {
    type: 'SNAP_RHYTHM_TRADE',
    category: 'SNAP',
    enabled: true,
    minConviction: 80,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 1.0,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 10,
    minRiskReward: 2.5,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['SNAP50', 'SNAP80'],
    forbiddenSymbols: [],
    bestContract: 'MULTUP',
    bestSymbols: ['SNAP50', 'SNAP80'],
    warning: '99% of volatility in snaps (every ~4.5s). Trade the rhythm: small moves between, bigger moves on snap. Snap size correlates with wait time. Use low multiplier (20-50x).',
  },
  SNAP_SIZE_PREDICTION: {
    type: 'SNAP_SIZE_PREDICTION',
    category: 'SNAP',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 4,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 2,
    cooldownTicks: 15,
    minRiskReward: 3.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['SNAP50', 'SNAP80'],
    forbiddenSymbols: [],
    bestContract: 'MULTUP',
    bestSymbols: ['SNAP50', 'SNAP80'],
    warning: 'Advanced. Predict snap size from wait time: longer wait = bigger snap. Use 50x multiplier max. High conviction only.',
  },
  JUMP_TIMING: {
    type: 'JUMP_TIMING',
    category: 'JUMP_DEX',
    enabled: true,
    minConviction: 75,
    minConfluenceCount: 2,
    maxConcurrent: 1,
    baseStakePercent: 1.0,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 30,
    minRiskReward: 2.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['JUMP10', 'JUMP25', 'JUMP50', 'JUMP75', 'JUMP100'],
    forbiddenSymbols: [],
    bestContract: 'MULTUP',
    bestSymbols: ['JUMP25', 'JUMP50'],
    warning: 'Jump indices have scheduled jumps. Time entries around expected jump windows. Not for beginners.',
  },
  GAP_FILL: {
    type: 'GAP_FILL',
    category: 'JUMP_DEX',
    enabled: true,
    minConviction: 80,
    minConfluenceCount: 2,
    maxConcurrent: 1,
    baseStakePercent: 1.0,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 20,
    minRiskReward: 2.0,
    requireTrendAlignment: false,
    avoidHighVolatility: false,
    allowedSymbols: ['JUMP10', 'JUMP25', 'JUMP50', 'JUMP75', 'JUMP100', 'DEX600', 'DEX900', 'DEX1500'],
    forbiddenSymbols: [],
    bestContract: 'MULTUP',
    bestSymbols: ['JUMP25', 'JUMP50'],
    warning: 'Jump/DEX indices gap by design - gap fill is valid here unlike Volatility indices. Wait for gap, trade fill with 20-50x multiplier.',
  },
};

export class FixedStrategyEngine {
  private configs: Record<string, any>;
  private tradeHistory: any[];
  private dailyPnL: number;
  private dailyTrades: number;
  private dailyLosses: number;
  private lastResetDay: number;
  private lastTradeTimes: Record<string, number>;
  private tickBuffer: any[];
  private priceHistory: number[];
  private marketState: any;
  private lastSpikeTime: number = 0;
  private spikeCount: number = 0;
  private performance: Record<string, any>;

  constructor() {
    this.configs = { ...ENHANCED_CONFIGS };
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.dailyLosses = 0;
    this.lastResetDay = new Date().getDate();
    this.lastTradeTimes = {};
    this.tickBuffer = [];
    this.priceHistory = [];
    this.marketState = this.getInitialMarketState();
    this.lastSpikeTime = 0;
    this.spikeCount = 0;
    this.performance = {};
    (Object.keys(ENHANCED_CONFIGS) as string[]).forEach(type => {
      this.performance[type] = this.createEmptyPerformance(type);
    });
  }

  private getInitialMarketState(): any {
    return {
      regime: 'UNKNOWN',
      trendStrength: 0,
      volatility: 0,
      session: 'CLOSED',
      trendDirection: 'NEUTRAL',
      volatilityPercentile: 50,
    };
  }

  private createEmptyPerformance(type: string): any {
    return {
      strategy: type,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      totalStaked: 0,
      roi: 0,
      avgConviction: 0,
      maxDrawdown: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
      avgHoldTime: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      lastTradeTime: 0,
    };
  }

  public getIndexCategory(symbol: string): string {
    return INDEX_CATEGORIES[symbol] || 'UNKNOWN';
  }

  public getAllowedStrategiesForSymbol(symbol: string): string[] {
    const category = this.getIndexCategory(symbol);
    return Object.entries(ENHANCED_CONFIGS)
      .filter(([_, config]) => config.category === this.getIndexCategory(symbol) && config.enabled)
      .map(([type]) => type);
  }

  public getBestSymbolsForStrategy(type: string): string[] {
    return ENHANCED_CONFIGS[type]?.bestSymbols || [];
  }

  public isStrategyAllowedForSymbol(type: string, symbol: string): boolean {
    const config = ENHANCED_CONFIGS[type];
    if (!config || !config.enabled) return false;
    if (config.forbiddenSymbols.includes(symbol)) return false;
    if (config.allowedSymbols.length > 0 && !config.allowedSymbols.includes(symbol)) return false;
    return true;
  }

  public getConfig(type: string): any {
    return { ...ENHANCED_CONFIGS[type] };
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public updateConfig(type: string, config: Partial<any>): void {
    if (ENHANCED_CONFIGS[type]) {
      ENHANCED_CONFIGS[type] = { ...ENHANCED_CONFIGS[type], ...config };
    }
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public getPerformance(type: string): any {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<string, any> {
    return { ...this.performance };
  }

  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): any {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }

  private calculateBollingerBands(prices: number[], period = 20, stdDev = 2): { upper: number; lower: number; middle: number } {
    if (prices.length < period) return { upper: 0, lower: 0, middle: 0 };
    const slice = prices.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: middle + stdDev * std,
      lower: middle - stdDev * std,
      middle,
    };
  }

  private calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(prices: number[]): number {
    if (prices.length < 2) return 0;
    const ranges = [];
    for (let i = 1; i < prices.length; i++) {
      ranges.push(Math.abs(prices[i] - prices[i-1]));
    }
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
    }
    return (returns.reduce((a, b) => a + b, 0) / returns.length) * 10000;
  }

  private calculateVolatilityHistory(ticks: any[]): number[] {
    const vols: number[] = [];
    const window = 20;
    for (let i = window; i < ticks.length; i++) {
      const slice = ticks.slice(i - window, i).map(t => t.quote);
      vols.push(this.calculateVolatility(slice));
    }
    return vols;
  }

  private getHistoricalBBWidths(ticks: any[]): number[] {
    const widths: number[] = [];
    const window = 20;
    for (let i = window; i < ticks.length; i++) {
      const slice = ticks.slice(i - window, i).map(t => t.quote);
      const bb = this.calculateBollingerBands(slice);
      widths.push((bb.upper - bb.lower) / bb.middle);
    }
    return widths;
  }

  private percentile(value: number, arr: number[]): number {
    if (arr.length === 0) return 50;
    const sorted = [...arr].sort((a, b) => a - b);
    const count = sorted.filter(v => v <= value).length;
    return (count / sorted.length) * 100;
  }

  public getIndexCategory(symbol: string): string {
    return INDEX_CATEGORIES[symbol] || 'UNKNOWN';
  }

  public getAllowedStrategiesForSymbol(symbol: string): string[] {
    const category = this.getIndexCategory(symbol);
    return Object.entries(ENHANCED_CONFIGS)
      .filter(([_, config]) => config.category === this.getIndexCategory(symbol) && config.enabled)
      .map(([type]) => type);
  }

  public getBestSymbolsForStrategy(type: string): string[] {
    return ENHANCED_CONFIGS[type]?.bestSymbols || [];
  }

  public isStrategyAllowedForSymbol(type: string, symbol: string): boolean {
    const config = ENHANCED_CONFIGS[type];
    if (!config || !config.enabled) return false;
    if (config.forbiddenSymbols.includes(symbol)) return false;
    if (config.allowedSymbols.length > 0 && !config.allowedSymbols.includes(symbol)) return false;
    return true;
  }

  public getConfig(type: string): any {
    return { ...ENHANCED_CONFIGS[type] };
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public updateConfig(type: string, config: Partial<any>): void {
    if (ENHANCED_CONFIGS[type]) {
      ENHANCED_CONFIGS[type] = { ...ENHANCED_CONFIGS[type], ...config };
    }
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public getPerformance(type: string): any {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<string, any> {
    return { ...this.performance };
  }

  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): any {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }

  private calculateBollingerBands(prices: number[], period = 20, stdDev = 2): { upper: number; lower: number; middle: number } {
    if (prices.length < period) return { upper: 0, lower: 0, middle: 0 };
    const slice = prices.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: middle + stdDev * std,
      lower: middle - stdDev * std,
      middle,
    };
  }

  private calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(prices: number[]): number {
    if (prices.length < 2) return 0;
    const ranges = [];
    for (let i = 1; i < prices.length; i++) {
      ranges.push(Math.abs(prices[i] - prices[i-1]));
    }
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
    }
    return (returns.reduce((a, b) => a + b, 0) / returns.length) * 10000;
  }

  private calculateVolatilityHistory(ticks: any[]): number[] {
    const vols: number[] = [];
    const window = 20;
    for (let i = window; i < ticks.length; i++) {
      const slice = ticks.slice(i - window, i).map(t => t.quote);
      vols.push(this.calculateVolatility(slice));
    }
    return vols;
  }

  private getHistoricalBBWidths(ticks: any[]): number[] {
    const widths: number[] = [];
    const window = 20;
    for (let i = window; i < ticks.length; i++) {
      const slice = ticks.slice(i - window, i).map(t => t.quote);
      const bb = this.calculateBollingerBands(slice);
      widths.push((bb.upper - bb.lower) / bb.middle);
    }
    return widths;
  }

  private percentile(value: number, arr: number[]): number {
    if (arr.length === 0) return 50;
    const sorted = [...arr].sort((a, b) => a - b);
    const count = sorted.filter(v => v <= value).length;
    return (count / sorted.length) * 100;
  }

  public getIndexCategory(symbol: string): string {
    return INDEX_CATEGORIES[symbol] || 'UNKNOWN';
  }

  public getAllowedStrategiesForSymbol(symbol: string): string[] {
    const category = this.getIndexCategory(symbol);
    return Object.entries(ENHANCED_CONFIGS)
      .filter(([_, config]) => config.category === this.getIndexCategory(symbol) && config.enabled)
      .map(([type]) => type);
  }

  public getBestSymbolsForStrategy(type: string): string[] {
    return ENHANCED_CONFIGS[type]?.bestSymbols || [];
  }

  public isStrategyAllowedForSymbol(type: string, symbol: string): boolean {
    const config = ENHANCED_CONFIGS[type];
    if (!config || !config.enabled) return false;
    if (config.forbiddenSymbols.includes(symbol)) return false;
    if (config.allowedSymbols.length > 0 && !config.allowedSymbols.includes(symbol)) return false;
    return true;
  }

  public getConfig(type: string): any {
    return { ...ENHANCED_CONFIGS[type] };
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public updateConfig(type: string, config: Partial<any>): void {
    if (ENHANCED_CONFIGS[type]) {
      ENHANCED_CONFIGS[type] = { ...ENHANCED_CONFIGS[type], ...config };
    }
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public getPerformance(type: string): any {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<string, any> {
    return { ...this.performance };
  }

  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): any {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }
export const fixedStrategyEngine = new (class {
  private configs: Record<string, any>;
  private tradeHistory: any[];
  private dailyPnL: number;
  private dailyTrades: number;
  private dailyLosses: number;
  private lastResetDay: number;
  private lastTradeTimes: Record<string, number>;
  private tickBuffer: any[];
  private priceHistory: number[];
  private marketState: any;
  private lastSpikeTime: number = 0;
  private spikeCount: number = 0;
  private performance: Record<string, any>;

  constructor() {
    this.configs = { ...ENHANCED_CONFIGS };
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.dailyLosses = 0;
    this.lastResetDay = new Date().getDate();
    this.lastTradeTimes = {};
    this.tickBuffer = [];
    this.priceHistory = [];
    this.marketState = this.getInitialMarketState();
    this.lastSpikeTime = 0;
    this.spikeCount = 0;
    this.performance = {};
    (Object.keys(ENHANCED_CONFIGS) as string[]).forEach(type => {
      this.performance[type] = this.createEmptyPerformance(type);
    });
  }

  private getInitialMarketState(): any {
    return {
      regime: 'UNKNOWN',
      trendStrength: 0,
      volatility: 0,
      session: 'CLOSED',
      trendDirection: 'NEUTRAL',
      volatilityPercentile: 50,
    };
  }

  private createEmptyPerformance(type: string): any {
    return {
      strategy: type,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      totalStaked: 0,
      roi: 0,
      avgConviction: 0,
      maxDrawdown: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
      avgHoldTime: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      lastTradeTime: 0,
    };
  }

  public getIndexCategory(symbol: string): string {
    return INDEX_CATEGORIES[symbol] || 'UNKNOWN';
  }

  public getAllowedStrategiesForSymbol(symbol: string): string[] {
    const category = this.getIndexCategory(symbol);
    return Object.entries(ENHANCED_CONFIGS)
      .filter(([_, config]) => config.category === this.getIndexCategory(symbol) && config.enabled)
      .map(([type]) => type);
  }

  public getBestSymbolsForStrategy(type: string): string[] {
    return ENHANCED_CONFIGS[type]?.bestSymbols || [];
  }

  public isStrategyAllowedForSymbol(type: string, symbol: string): boolean {
    const config = ENHANCED_CONFIGS[type];
    if (!config || !config.enabled) return false;
    if (config.forbiddenSymbols.includes(symbol)) return false;
    if (config.allowedSymbols.length > 0 && !config.allowedSymbols.includes(symbol)) return false;
    return true;
  }

  public getConfig(type: string): any {
    return { ...ENHANCED_CONFIGS[type] };
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public updateConfig(type: string, config: Partial<any>): void {
    if (ENHANCED_CONFIGS[type]) {
      ENHANCED_CONFIGS[type] = { ...ENHANCED_CONFIGS[type], ...config };
    }
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public getPerformance(type: string): any {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<string, any> {
    return { ...this.performance };
  }

  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): any {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
export const fixedStrategyEngine = new (class {
  private configs: Record<string, any>;
  private tradeHistory: any[];
  private dailyPnL: number;
  private dailyTrades: number;
  private dailyLosses: number;
  private lastResetDay: number;
  private lastTradeTimes: Record<string, number>;
  private tickBuffer: any[];
  private priceHistory: number[];
  private marketState: any;
  private lastSpikeTime: number = 0;
  private spikeCount: number = 0;
  private performance: Record<string, any>;

  constructor() {
    this.configs = { ...ENHANCED_CONFIGS };
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.dailyLosses = 0;
    this.lastResetDay = new Date().getDate();
    this.lastTradeTimes = {};
    this.tickBuffer = [];
    this.priceHistory = [];
    this.marketState = this.getInitialMarketState();
    this.lastSpikeTime = 0;
    this.spikeCount = 0;
    this.performance = {};
    (Object.keys(ENHANCED_CONFIGS) as string[]).forEach(type => {
      this.performance[type] = this.createEmptyPerformance(type);
    });
  }

  private getInitialMarketState(): any {
    return {
      regime: 'UNKNOWN',
      trendStrength: 0,
      volatility: 0,
      session: 'CLOSED',
      trendDirection: 'NEUTRAL',
      volatilityPercentile: 50,
    };
  }

  private createEmptyPerformance(type: string): any {
    return {
      strategy: type,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      totalStaked: 0,
      roi: 0,
      avgConviction: 0,
      maxDrawdown: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
      avgHoldTime: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      lastTradeTime: 0,
    };
  }

  public getIndexCategory(symbol: string): string {
    return INDEX_CATEGORIES[symbol] || 'UNKNOWN';
  }

  public getAllowedStrategiesForSymbol(symbol: string): string[] {
    const category = this.getIndexCategory(symbol);
    return Object.entries(ENHANCED_CONFIGS)
      .filter(([_, config]) => config.category === this.getIndexCategory(symbol) && config.enabled)
      .map(([type]) => type);
  }

  public getBestSymbolsForStrategy(type: string): string[] {
    return ENHANCED_CONFIGS[type]?.bestSymbols || [];
  }

  public isStrategyAllowedForSymbol(type: string, symbol: string): boolean {
    const config = ENHANCED_CONFIGS[type];
    if (!config || !config.enabled) return false;
    if (config.forbiddenSymbols.includes(symbol)) return false;
    if (config.allowedSymbols.length > 0 && !config.allowedSymbols.includes(symbol)) return false;
    return true;
  }

  public getConfig(type: string): any {
    return { ...ENHANCED_CONFIGS[type] };
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public updateConfig(type: string, config: Partial<any>): void {
    if (ENHANCED_CONFIGS[type]) {
      ENHANCED_CONFIGS[type] = { ...ENHANCED_CONFIGS[type], ...config };
    }
  }

  public getAllConfigs(): Record<string, any> {
    return { ...ENHANCED_CONFIGS };
  }

  public getPerformance(type: string): any {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<string, any> {
    return { ...this.performance };
  }

  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): any {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }

}
})();
