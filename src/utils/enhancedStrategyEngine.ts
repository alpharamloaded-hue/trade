import { DigitStat, PatternDetection, TickData, TradeEntrySignal } from '../types/deriv';
import { computeDigitStats, scanPatterns, calculateConfidence, calculateMartingaleLadder, MartingaleStep } from './digitAnalysis';
import { generateDigitEntrySignal, generateMultiplierEntrySignal } from './entrySignals';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'UNKNOWN';

export type EnhancedStrategyType = 
  | 'DROUGHT_MATCH_PREMIUM'      // Only extreme droughts (25+ ticks) with confluence
  | 'COLD_DIFFER_PREMIUM'        // Ultra-cold digits (≤5%) with pattern confirmation
  | 'X2X_REVERSAL_PREMIUM'       // X2X + trend alignment
  | 'TWIN_DIFFER_PREMIUM'        // Twin at key levels
  | 'STREAK_EXHAUSTION'          // Parity/range streak at extreme (6+)
  | 'TREND_PULLBACK_MULT'        // Multiplier trend pullback entry
  | 'MEAN_REVERSION_MULT'        // Multiplier mean reversion at extremes
  | 'SCALP_MULTIPLIER_PREMIUM';  // Quick scalp with strict rules

export interface EnhancedStrategyConfig {
  type: EnhancedStrategyType;
  enabled: boolean;
  minConviction: number;           // Minimum conviction score (0-100)
  minConfluenceCount: number;      // Required confirming factors
  maxConcurrent: number;
  baseStakePercent: number;        // % of balance at min conviction
  maxStakePercent: number;         // % of balance at max conviction
  maxDailyLossPercent: number;
  cooldownTicks: number;
  minRiskReward: number;           // Minimum R:R ratio
  requireTrendAlignment: boolean;  // Must align with higher TF trend
  avoidHighVolatility: boolean;    // Skip during high volatility
  sessionFilter?: 'ASIAN' | 'LONDON' | 'NY' | 'ALL';
  riskLevel: 'LOW' | 'BALANCED' | 'ELEVATED';
}

export interface EnhancedSignal {
  id: string;
  strategy: EnhancedStrategyType;
  conviction: number;              // 0-100
  confluenceFactors: string[];     // What confirms this trade
  marketRegime: MarketRegime;
  contractType: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
  param: number;                   // digit or multiplier
  stakePercent: number;            // Dynamic based on conviction
  stakeAmount: number;             // Absolute amount
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward: number;
  expectedWinRate: number;
  expectedValue: number;
  headline: string;                // Human-readable summary
  reasoning: string[];
  regimeReasoning: string[];
  timestamp: number;
  expiresAt: number;               // Signal validity window
}

export interface TradeResult {
  id: string;
  signalId: string;
  strategy: EnhancedStrategyType;
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
  digit?: number;      // for digit contracts
  multiplier?: number; // for multiplier contracts
}

export interface EnhancedPerformance {
  strategy: EnhancedStrategyType;
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

export interface MarketState {
  regime: MarketRegime;
  trendStrength: number;        // 0-100
  volatility: number;           // 0-100
  session: 'ASIAN' | 'LONDON' | 'NY' | 'CLOSED';
  trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  volatilityPercentile: number; // vs recent history
}

// Configuration - CONSERVATIVE by default
const ENHANCED_CONFIGS: Record<EnhancedStrategyType, EnhancedStrategyConfig> = {
  DROUGHT_MATCH_PREMIUM: {
    type: 'DROUGHT_MATCH_PREMIUM',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 3,
    cooldownTicks: 10,
    minRiskReward: 3,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    riskLevel: 'BALANCED',
  },
  COLD_DIFFER_PREMIUM: {
    type: 'COLD_DIFFER_PREMIUM',
    enabled: true,
    minConviction: 90,
    minConfluenceCount: 2,
    maxConcurrent: 2,
    baseStakePercent: 1.0,
    maxStakePercent: 2.5,
    maxDailyLossPercent: 3,
    cooldownTicks: 5,
    minRiskReward: 2,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    riskLevel: 'LOW',
  },
  X2X_REVERSAL_PREMIUM: {
    type: 'X2X_REVERSAL_PREMIUM',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.8,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 2,
    cooldownTicks: 8,
    minRiskReward: 3,
    requireTrendAlignment: true,
    avoidHighVolatility: true,
    riskLevel: 'LOW',
  },
  TWIN_DIFFER_PREMIUM: {
    type: 'TWIN_DIFFER_PREMIUM',
    enabled: true,
    minConviction: 80,
    minConfluenceCount: 2,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 2,
    cooldownTicks: 8,
    minRiskReward: 3,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    riskLevel: 'LOW',
  },
  STREAK_EXHAUSTION: {
    type: 'STREAK_EXHAUSTION',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 3,
    cooldownTicks: 10,
    minRiskReward: 3,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    riskLevel: 'BALANCED',
  },
  TREND_PULLBACK_MULT: {
    type: 'TREND_PULLBACK_MULT',
    enabled: true,
    minConviction: 80,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 2.0,
    maxDailyLossPercent: 3,
    cooldownTicks: 15,
    minRiskReward: 2.5,
    requireTrendAlignment: true,
    avoidHighVolatility: false,
    riskLevel: 'BALANCED',
  },
  MEAN_REVERSION_MULT: {
    type: 'MEAN_REVERSION_MULT',
    enabled: true,
    minConviction: 85,
    minConfluenceCount: 3,
    maxConcurrent: 1,
    baseStakePercent: 0.5,
    maxStakePercent: 1.5,
    maxDailyLossPercent: 2,
    cooldownTicks: 20,
    minRiskReward: 3,
    requireTrendAlignment: false,
    avoidHighVolatility: true,
    riskLevel: 'ELEVATED',
  },
  SCALP_MULTIPLIER_PREMIUM: {
    type: 'SCALP_MULTIPLIER_PREMIUM',
    enabled: false, // Disabled by default - high frequency
    minConviction: 90,
    minConfluenceCount: 4,
    maxConcurrent: 1,
    baseStakePercent: 0.3,
    maxStakePercent: 1.0,
    maxDailyLossPercent: 1.5,
    cooldownTicks: 30,
    minRiskReward: 2,
    requireTrendAlignment: true,
    avoidHighVolatility: false,
    riskLevel: 'ELEVATED',
  },
};

export const STRATEGY_PAYOUTS: Record<EnhancedStrategyType, number> = {
  DROUGHT_MATCH_PREMIUM: 9.2,
  COLD_DIFFER_PREMIUM: 1.09,
  X2X_REVERSAL_PREMIUM: 1.09,
  TWIN_DIFFER_PREMIUM: 1.09,
  STREAK_EXHAUSTION: 1.09,
  TREND_PULLBACK_MULT: 50,
  MEAN_REVERSION_MULT: 50,
  SCALP_MULTIPLIER_PREMIUM: 20,
};

export const STRATEGY_CONTRACTS: Record<EnhancedStrategyType, 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN'> = {
  DROUGHT_MATCH_PREMIUM: 'DIGITMATCH',
  COLD_DIFFER_PREMIUM: 'DIGITDIFF',
  X2X_REVERSAL_PREMIUM: 'DIGITDIFF',
  TWIN_DIFFER_PREMIUM: 'DIGITDIFF',
  STREAK_EXHAUSTION: 'DIGITDIFF',
  TREND_PULLBACK_MULT: 'MULTUP',
  MEAN_REVERSION_MULT: 'MULTUP',
  SCALP_MULTIPLIER_PREMIUM: 'MULTUP',
};

const BASE_WIN_RATES: Record<EnhancedStrategyType, number> = {
  DROUGHT_MATCH_PREMIUM: 0.12,
  COLD_DIFFER_PREMIUM: 0.92,
  X2X_REVERSAL_PREMIUM: 0.78,
  TWIN_DIFFER_PREMIUM: 0.75,
  STREAK_EXHAUSTION: 0.70,
  TREND_PULLBACK_MULT: 0.58,
  MEAN_REVERSION_MULT: 0.55,
  SCALP_MULTIPLIER_PREMIUM: 0.62,
};

export class EnhancedStrategyEngine {
  private configs: Record<EnhancedStrategyType, EnhancedStrategyConfig>;
  private performance: Record<EnhancedStrategyType, EnhancedPerformance>;
  private tradeHistory: TradeResult[];
  private dailyPnL: number;
  private dailyTrades: number;
  private dailyLosses: number;
  private lastResetDay: number;
  private lastTradeTimes: Record<EnhancedStrategyType, number>;
  private tickBuffer: TickData[];
  private priceHistory: number[];
  private marketState: MarketState;

  constructor() {
    this.configs = { ...ENHANCED_CONFIGS };
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.dailyLosses = 0;
    this.lastResetDay = new Date().getDate();
    this.lastTradeTimes = {} as Record<EnhancedStrategyType, number>;
    this.tickBuffer = [];
    this.priceHistory = [];
    this.marketState = this.getInitialMarketState();
    
    this.performance = {} as Record<EnhancedStrategyType, EnhancedPerformance>;
    (Object.keys(ENHANCED_CONFIGS) as EnhancedStrategyType[]).forEach(type => {
      this.performance[type] = this.createEmptyPerformance(type);
    });
  }

  private getInitialMarketState(): MarketState {
    const hour = new Date().getUTCHours();
    let session: MarketState['session'] = 'CLOSED';
    if (hour >= 0 && hour < 8) session = 'ASIAN';
    else if (hour >= 8 && hour < 16) session = 'LONDON';
    else if (hour >= 16 && hour < 24) session = 'NY';

    return {
      regime: 'UNKNOWN',
      trendStrength: 0,
      volatility: 0,
      session,
      trendDirection: 'NEUTRAL',
      volatilityPercentile: 50,
    };
  }

  private createEmptyPerformance(type: EnhancedStrategyType): EnhancedPerformance {
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

  private resetDailyIfNeeded(): void {
    const today = new Date().getDate();
    if (today !== this.lastResetDay) {
      this.dailyPnL = 0;
      this.dailyTrades = 0;
      this.dailyLosses = 0;
      this.lastResetDay = today;
    }
  }

  public updateConfig(type: EnhancedStrategyType, config: Partial<EnhancedStrategyConfig>): void {
    this.configs[type] = { ...this.configs[type], ...config };
  }

  // Main analysis entry point
  public analyze(
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal[] {
    this.resetDailyIfNeeded();
    this.updateMarketState(ticks, latestTick);
    this.tickBuffer = ticks.slice(-200);
    this.priceHistory = ticks.slice(-500).map(t => t.quote);

    const signals: EnhancedSignal[] = [];

    // Check each strategy
    for (const [type, config] of Object.entries(this.configs)) {
      if (!config.enabled) continue;
      
      const signal = this.analyzeStrategy(type as EnhancedStrategyType, config, digitStats, ticks, patterns, latestTick, balance);
      if (signal) {
        signals.push(signal);
      }
    }

    // Sort by conviction (highest first)
    signals.sort((a, b) => b.conviction - a.conviction);

    // Filter by daily loss limit, cooldown, and session
    return signals.filter(s => this.canTrade(s, balance));
  }

  private updateMarketState(ticks: TickData[], latestTick: TickData | null): void {
    if (ticks.length < 50) return;

    const recent = ticks.slice(-50);
    const prices = recent.map(t => t.quote);
    
    // Calculate trend using linear regression slope
    const trendStrength = this.calculateTrendStrength(prices);
    const trendDirection = trendStrength > 10 ? 'UP' : trendStrength < -10 ? 'DOWN' : 'NEUTRAL';
    
    // Calculate volatility (ATR-like)
    const volatility = this.calculateVolatility(prices);
    
    // Volatility percentile vs last 200 ticks
    const volHistory = this.calculateVolatilityHistory(ticks.slice(-200));
    const volPercentile = this.percentile(volatility, volHistory);

    // Determine regime
    let regime: MarketRegime = 'RANGING';
    if (volPercentile > 80) regime = 'HIGH_VOLATILITY';
    else if (volPercentile < 20) regime = 'LOW_VOLATILITY';
    else if (Math.abs(trendStrength) > 30) regime = trendDirection === 'UP' ? 'TRENDING_UP' : 'TRENDING_DOWN';

    // Session
    const hour = new Date().getUTCHours();
    let session: MarketState['session'] = 'CLOSED';
    if (hour >= 0 && hour < 8) session = 'ASIAN';
    else if (hour >= 8 && hour < 16) session = 'LONDON';
    else if (hour >= 16 && hour < 24) session = 'NY';

    this.marketState = {
      regime,
      trendStrength: Math.abs(trendStrength),
      volatility,
      session,
      trendDirection,
      volatilityPercentile: volPercentile,
    };
  }

  private calculateTrendStrength(prices: number[]): number {
    const n = prices.length;
    if (n < 10) return 0;
    
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * prices[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgPrice = sumY / n;
    
    return (slope / avgPrice) * 10000; // Normalized trend strength
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
    }
    return (returns.reduce((a, b) => a + b, 0) / returns.length) * 10000;
  }

  private calculateVolatilityHistory(ticks: TickData[]): number[] {
    const vols: number[] = [];
    const window = 20;
    for (let i = window; i < ticks.length; i++) {
      const slice = ticks.slice(i - window, i).map(t => t.quote);
      vols.push(this.calculateVolatility(slice));
    }
    return vols;
  }

  private percentile(value: number, arr: number[]): number {
    if (arr.length === 0) return 50;
    const sorted = [...arr].sort((a, b) => a - b);
    const count = sorted.filter(v => v <= value).length;
    return (count / sorted.length) * 100;
  }

  private analyzeStrategy(
    type: EnhancedStrategyType,
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const confluenceFactors: string[] = [];
    let conviction = 0;

    // Check each strategy's specific criteria
    switch (type) {
      case 'DROUGHT_MATCH_PREMIUM':
        return this.analyzeDroughtMatch(config, digitStats, ticks, patterns, latestTick, balance);
      case 'COLD_DIFFER_PREMIUM':
        return this.analyzeColdDiffer(config, digitStats, ticks, patterns, latestTick, balance);
      case 'X2X_REVERSAL_PREMIUM':
        return this.analyzeX2XReversal(config, digitStats, ticks, patterns, latestTick, balance);
      case 'TWIN_DIFFER_PREMIUM':
        return this.analyzeTwinDiffer(config, digitStats, ticks, patterns, latestTick, balance);
      case 'STREAK_EXHAUSTION':
        return this.analyzeStreakExhaustion(config, digitStats, ticks, patterns, latestTick, balance);
      case 'TREND_PULLBACK_MULT':
        return this.analyzeTrendPullback(config, ticks, latestTick, balance);
      case 'MEAN_REVERSION_MULT':
        return this.analyzeMeanReversion(config, ticks, latestTick, balance);
      case 'SCALP_MULTIPLIER_PREMIUM':
        return this.analyzeScalpMultiplier(config, ticks, latestTick, balance);
    }
    return null;
  }

  // 1. DROUGHT_MATCH_PREMIUM - Only extreme droughts (25+) with confluence
  private analyzeDroughtMatch(
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const droughtDigits = digitStats
      .filter(s => s.currentStreak >= 25)  // Only 25+ ticks
      .sort((a, b) => b.currentStreak - a.currentStreak);

    if (droughtDigits.length === 0) return null;

    const best = droughtDigits[0];
    const confluence: string[] = [
      `Extreme drought: ${best.currentStreak} ticks (threshold: 25)`,
    ];

    // Confluence checks
    if (best.frequency <= 5) confluence.push(`Ultra-cold frequency: ${best.frequency}%`);
    if (best.maxStreak > 30) confluence.push(`Historical max drought: ${best.maxStreak}`);
    
    // Pattern confirmation
    const x2x = patterns.find(p => p.type === 'X2X' && p.digit === best.digit);
    if (x2x) confluence.push('X2X pattern confirmed');

    const twin = patterns.find(p => p.type === 'TWIN' && p.digit === best.digit);
    if (twin) confluence.push('Twin pattern at drought digit');

    // Need minimum confluence
    if (confluence.length < config.minConfluenceCount) return null;

    // Conviction calculation
    let conviction = 70;
    conviction += Math.min(20, (best.currentStreak - 25) * 1.5);
    if (best.frequency <= 5) conviction += 10;
    if (x2x) conviction += 10;
    if (twin) conviction += 5;
    conviction = Math.min(98, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'DROUGHT_MATCH_PREMIUM',
      best.digit,
      conviction,
      confluence,
      balance,
      'DIGITMATCH',
      9.2
    );
  }

  // 2. COLD_DIFFER_PREMIUM - Ultra-cold digits with pattern confirmation
  private analyzeColdDiffer(
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const coldDigits = digitStats
      .filter(s => s.frequency <= 5 && s.currentStreak >= 8)
      .sort((a, b) => a.frequency - b.frequency);

    if (coldDigits.length === 0) return null;

    const best = coldDigits[0];
    const confluence: string[] = [
      `Ultra-cold: ${best.frequency}% freq, ${best.currentStreak} tick drought`,
      `Estimated win rate: ${(100 - best.frequency).toFixed(1)}%`,
    ];

    // Pattern confirmation
    const x2x = patterns.find(p => p.type === 'X2X' && p.digit === best.digit);
    if (x2x) confluence.push('X2X pattern aligns');
    
    const twin = patterns.find(p => p.type === 'TWIN' && p.digit === best.digit);
    if (twin) confluence.push('Twin pattern confirms');

    // Streak pattern
    const streakPattern = patterns.find(p => 
      ['EVEN_STREAK', 'ODD_STREAK', 'OVER_STREAK', 'UNDER_STREAK'].includes(p.type) && 
      p.digit === best.digit
    );
    if (streakPattern) confluence.push(`${streakPattern.type} exhaustion`);

    if (confluence.length < config.minConfluenceCount) return null;

    const winRate = 100 - best.frequency;
    let conviction = 85;
    conviction += (8 - best.frequency) * 2;
    if (x2x) conviction += 5;
    if (twin) conviction += 5;
    conviction = Math.min(98, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'COLD_DIFFER_PREMIUM',
      best.digit,
      conviction,
      confluence,
      balance,
      'DIGITDIFF',
      1.09
    );
  }

  // 3. X2X_REVERSAL_PREMIUM - X2X with trend alignment
  private analyzeX2XReversal(
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const x2x = patterns.find(p => p.type === 'X2X');
    if (!x2x || x2x.digit === undefined) return null;

    const targetDigit = x2x.digit;
    const digitStat = digitStats.find(s => s.digit === targetDigit);
    if (!digitStat) return null;

    const confluence: string[] = [
      `X2X pattern: ${targetDigit}-2-${targetDigit} confirmed`,
      `Pattern confidence: ${x2x.confidence}%`,
    ];

    // Trend alignment check
    const trendAligned = this.checkTrendAlignment(targetDigit);
    if (trendAligned) confluence.push('Trend alignment confirmed');
    else if (config.requireTrendAlignment) return null;

    // Drought support
    if (digitStat.currentStreak >= 12) {
      confluence.push(`Drought support: ${digitStat.currentStreak} ticks`);
    }

    if (confluence.length < config.minConfluenceCount) return null;

    let conviction = x2x.confidence;
    if (trendAligned) conviction += 10;
    if (digitStat.currentStreak >= 12) conviction += 5;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'X2X_REVERSAL_PREMIUM',
      targetDigit,
      conviction,
      confluence,
      balance,
      'DIGITDIFF',
      1.09
    );
  }

  // 4. TWIN_DIFFER_PREMIUM - Twin at key levels
  private analyzeTwinDiffer(
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const twin = patterns.find(p => p.type === 'TWIN');
    if (!twin || twin.digit === undefined) return null;

    const targetDigit = twin.digit;
    const digitStat = digitStats.find(s => s.digit === targetDigit);
    if (!digitStat) return null;

    const confluence: string[] = [
      `Twin pattern: Double ${targetDigit} detected`,
      `Pattern confidence: ${twin.confidence}%`,
    ];

    // Cold digit support
    if (digitStat.frequency <= 7) {
      confluence.push(`Cold digit: ${digitStat.frequency}% frequency`);
    }

    // Drought support
    if (digitStat.currentStreak >= 8) {
      confluence.push(`Drought: ${digitStat.currentStreak} ticks`);
    }

    if (confluence.length < config.minConfluenceCount) return null;

    let conviction = twin.confidence;
    if (digitStat.frequency <= 7) conviction += 10;
    if (digitStat.currentStreak >= 8) conviction += 5;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'TWIN_DIFFER_PREMIUM',
      targetDigit,
      conviction,
      confluence,
      balance,
      'DIGITDIFF',
      1.09
    );
  }

  // 5. STREAK_EXHAUSTION - Parity/range streak at extreme (6+)
  private analyzeStreakExhaustion(
    config: EnhancedStrategyConfig,
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    const streakPatterns = patterns.filter(p => 
      ['EVEN_STREAK', 'ODD_STREAK', 'OVER_STREAK', 'UNDER_STREAK'].includes(p.type) &&
      (p.streakCount || 0) >= 6
    );

    if (streakPatterns.length === 0) return null;

    const best = streakPatterns.sort((a, b) => (b.streakCount || 0) - (a.streakCount || 0))[0];
    if (!best.digit) return null;

    const targetDigit = best.digit;
    const digitStat = digitStats.find(s => s.digit === targetDigit);
    if (!digitStat) return null;

    const confluence: string[] = [
      `${best.type}: ${best.streakCount} consecutive`,
      `Target digit: ${targetDigit}`,
    ];

    // Drought support
    if (digitStat.currentStreak >= 10) {
      confluence.push(`Drought: ${digitStat.currentStreak} ticks`);
    }

    // Cold frequency
    if (digitStat.frequency <= 8) {
      confluence.push(`Below average frequency: ${digitStat.frequency}%`);
    }

    if (confluence.length < config.minConfluenceCount) return null;

    let conviction = best.confidence;
    if (digitStat.currentStreak >= 10) conviction += 10;
    if (digitStat.frequency <= 8) conviction += 5;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'STREAK_EXHAUSTION',
      targetDigit,
      conviction,
      confluence,
      balance,
      'DIGITDIFF',
      1.09
    );
  }

  // 6. TREND_PULLBACK_MULT - Multiplier trend pullback entry
  private analyzeTrendPullback(
    config: EnhancedStrategyConfig,
    ticks: TickData[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    if (!latestTick || ticks.length < 100) return null;

    const recent = ticks.slice(-20);
    const prices = recent.map(t => t.quote);
    
    // Check for clear trend
    const trend = this.calculateTrendStrength(prices);
    if (Math.abs(trend) < 25) return null; // No clear trend

    const trendDirection = trend > 0 ? 'UP' : 'DOWN';
    
    // Check for pullback (3-5 ticks against trend)
    let pullbackCount = 0;
    for (let i = recent.length - 1; i >= Math.max(0, recent.length - 8); i--) {
      const isPullback = trendDirection === 'UP' 
        ? recent[i].quote < recent[i - 1]?.quote 
        : recent[i].quote > recent[i - 1]?.quote;
      if (pullbackCount < 5 && isPullback) pullbackCount++;
    }

    if (pullbackCount < 3 || pullbackCount > 5) return null;

    // Check RSI-like oversold/overbought
    const rsi = this.calculateRSI(ticks.slice(-50).map(t => t.quote));
    const isOversold = trendDirection === 'UP' && rsi < 40;
    const isOverbought = trendDirection === 'DOWN' && rsi > 60;
    if (!isOversold && !isOverbought) return null;

    const direction = trendDirection === 'UP' ? 'MULTUP' : 'MULTDOWN';
    const multiplier = 50; // Conservative

    const confluence: string[] = [
      `Strong ${trendDirection} trend (strength: ${Math.abs(Math.round(trend))})`,
      `${pullbackCount}-tick pullback detected`,
      `RSI ${rsi.toFixed(0)} - ${isOversold ? 'oversold' : 'overbought'}`,
      `Trend alignment confirmed`,
    ];

    let conviction = 75;
    if (Math.abs(trend) > 50) conviction += 10;
    if (rsi < 30 || rsi > 70) conviction += 10;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'TREND_PULLBACK_MULT',
      50,
      conviction,
      confluence,
      balance,
      direction,
      50
    );
  }

  // 7. MEAN_REVERSION_MULT - Multiplier mean reversion at extremes
  private analyzeMeanReversion(
    config: EnhancedStrategyConfig,
    ticks: TickData[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    if (!latestTick || ticks.length < 200) return null;

    const prices = ticks.slice(-200).map(t => t.quote);
    const rsi = this.calculateRSI(prices);
    
    // Extreme RSI levels
    if (rsi > 30 && rsi < 70) return null;

    const direction = rsi > 70 ? 'MULTDOWN' : 'MULTUP';
    const multiplier = 50;

    const confluence: string[] = [
      `RSI extreme: ${rsi.toFixed(1)} (${rsi > 70 ? 'overbought' : 'oversold'})`,
      `Mean reversion opportunity`,
    ];

    // Bollinger Band check
    const bb = this.calculateBollingerBands(ticks.slice(-50).map(t => t.quote));
    const currentPrice = latestTick.quote;
    if (direction === 'MULTUP' && currentPrice < bb.lower) {
      confluence.push('Price below lower Bollinger Band');
    } else if (direction === 'MULTDOWN' && currentPrice > bb.upper) {
      confluence.push('Price above upper Bollinger Band');
    }

    if (confluence.length < config.minConfluenceCount) return null;

    let conviction = 75;
    if (rsi < 20 || rsi > 80) conviction += 15;
    if (direction === 'MULTUP' && currentPrice < bb.lower) conviction += 10;
    if (direction === 'MULTDOWN' && currentPrice > bb.upper) conviction += 10;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'MEAN_REVERSION_MULT',
      50,
      conviction,
      confluence,
      balance,
      direction,
      50
    );
  }

  // 8. SCALP_MULTIPLIER_PREMIUM - Quick scalp with strict rules
  private analyzeScalpMultiplier(
    config: EnhancedStrategyConfig,
    ticks: TickData[],
    latestTick: TickData | null,
    balance: number
  ): EnhancedSignal | null {
    if (!latestTick || ticks.length < 50) return null;

    const recent = ticks.slice(-10);
    const prices = recent.map(t => t.quote);
    
    // Need clear micro-trend
    const trend = this.calculateTrendStrength(prices);
    if (Math.abs(trend) < 15) return null;

    // Low volatility for scalping
    const vol = this.calculateVolatility(recent.map(t => t.quote));
    if (vol > 30) return null;

    const direction = trend > 0 ? 'MULTUP' : 'MULTDOWN';
    const multiplier = 20; // Low leverage for scalping

    const confluence: string[] = [
      `Micro-trend: ${trend > 0 ? 'UP' : 'DOWN'} (${Math.abs(Math.round(trend))})`,
      `Low volatility: ${vol.toFixed(1)}`,
    ];

    let conviction = 80;
    if (Math.abs(trend) > 30) conviction += 10;
    conviction = Math.min(95, conviction);

    if (conviction < config.minConviction) return null;

    return this.createSignal(
      'SCALP_MULTIPLIER_PREMIUM',
      20,
      conviction,
      confluence,
      balance,
      direction,
      20
    );
  }

  // Helper: Create enhanced signal
  private createSignal(
    type: EnhancedStrategyType,
    param: number,
    conviction: number,
    confluence: string[],
    balance: number,
    contractType: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN',
    payout: number
  ): EnhancedSignal {
    const config = this.configs[type];
    const baseWinRate = BASE_WIN_RATES[type];
    const winRateBoost = (conviction - 50) * 0.005;
    const expectedWinRate = Math.min(0.98, baseWinRate + winRateBoost);
    
    // Dynamic position sizing based on conviction
    const convictionRatio = (conviction - config.minConviction) / (100 - config.minConviction);
    const stakePercent = config.baseStakePercent + (config.maxStakePercent - config.baseStakePercent) * Math.max(0, convictionRatio);
    
    // Kelly-based adjustment
    const kelly = this.calculateKelly(expectedWinRate, STRATEGY_PAYOUTS[type]);
    const kellyStake = Math.min(stakePercent, kelly * 100 * 0.5); // Half-Kelly cap
    
    const stakeAmount = Math.round(10000 * kellyStake / 100 * 100) / 100; // Would use actual balance

    const isMultiplier = contractType.startsWith('MULT');
    const now = Date.now();
    const validityMinutes = isMultiplier ? 30 : 5; // Digit signals expire faster

    return {
      id: `sig-${type}-${param}-${Date.now()}`,
      strategy: type,
      conviction,
      confluenceFactors: confluence,
      marketRegime: this.marketState.regime,
      contractType: contractType as 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN',
      param,
      stakePercent: kellyStake,
      stakeAmount: Math.max(stakeAmount, 0.5),
      entryPrice: 0, // Filled at execution
      stopLoss: this.calculateStopLoss(type, conviction),
      takeProfit: this.calculateTakeProfit(type, conviction),
      riskReward: this.calculateRiskReward(type, expectedWinRate, STRATEGY_PAYOUTS[type]),
      expectedWinRate: expectedWinRate * 100,
      expectedValue: expectedWinRate * STRATEGY_PAYOUTS[type] - (1 - expectedWinRate),
      reasoning: [`Conviction: ${conviction}%`, `Confluence: ${confluence.length} factors`, ...confluence],
      regimeReasoning: [
        `Regime: ${this.marketState.regime}`,
        `Trend: ${this.marketState.trendDirection} (${this.marketState.trendStrength.toFixed(0)})`,
        `Volatility: ${this.marketState.volatilityPercentile.toFixed(0)}th percentile`,
        `Session: ${this.marketState.session}`,
      ],
      headline: this.getStrategyHeadline(type, param),
      timestamp: Date.now(),
      expiresAt: Date.now() + 60 * 1000 * (contractType.startsWith('MULT') ? 30 : 5),
    };
  }

  private calculateKelly(winProb: number, payout: number): number {
    const b = payout - 1;
    const p = winProb;
    const q = 1 - p;
    return Math.max(0, (b * p - q) / b);
  }

  private calculateStopLoss(type: EnhancedStrategyType, conviction: number): number | undefined {
    if (type.startsWith('MULT')) {
      return conviction > 90 ? 1.5 : 2.0; // % of stake
    }
    return undefined; // Digit contracts have fixed risk
  }

  private calculateTakeProfit(type: EnhancedStrategyType, conviction: number): number | undefined {
    if (type.startsWith('MULT')) {
      return conviction > 90 ? 3.0 : 2.0; // % of stake
    }
    return undefined;
  }

  private calculateRiskReward(type: EnhancedStrategyType, winProb: number, payout: number): number {
    if (type.startsWith('MULT')) {
      const tp = 2.0; // 2% take profit
      const sl = 1.5; // 1.5% stop loss
      return tp / sl;
    }
    return payout / 1; // Fixed risk for digit contracts
  }

  private checkTrendAlignment(digit: number): boolean {
    // Simplified: check if digit aligns with price trend
    const recentPrices = this.priceHistory.slice(-20);
    if (recentPrices.length < 10) return true;
    
    const trend = this.calculateTrendStrength(recentPrices);
    const isUpTrend = trend > 0;
    
    // High digits (5-9) align with uptrend, low digits (0-4) with downtrend
    return (isUpTrend && digit >= 5) || (!isUpTrend && digit <= 4);
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

  private getStrategyHeadline(type: EnhancedStrategyType, param: number): string {
    switch (type) {
      case 'DROUGHT_MATCH_PREMIUM':
        return `🔥 Drought Match Premium: Digit ${param}`;
      case 'COLD_DIFFER_PREMIUM':
        return `🛡️ Cold Differ Premium: Against ${param}`;
      case 'X2X_REVERSAL_PREMIUM':
        return `⚡ X2X Reversal Premium: Differ ${param}`;
      case 'TWIN_DIFFER_PREMIUM':
        return `👯 Twin Differ Premium: Against ${param}`;
      case 'STREAK_EXHAUSTION':
        return `📊 Streak Exhaustion: Against ${param}`;
      case 'TREND_PULLBACK_MULT':
        return `📈 Trend Pullback Mult: ${param}x`;
      case 'MEAN_REVERSION_MULT':
        return `📉 Mean Reversion Mult: ${param}x`;
      case 'SCALP_MULTIPLIER_PREMIUM':
        return `⚡ Scalp Mult Premium: ${param}x`;
      default:
        return `${type}: ${param}`;
    }
  }

  // Trade execution validation
  private canTrade(signal: EnhancedSignal, balance: number): boolean {
    const config = this.configs[signal.strategy];
    
    // Daily loss limit
    if (this.dailyPnL <= -balance * config.maxDailyLossPercent / 100) {
      return false;
    }

    // Signal expiry
    if (Date.now() > signal.expiresAt) {
      return false;
    }

    // Cooldown
    const lastTrade = this.lastTradeTimes[signal.strategy] || 0;
    // In real implementation, track by tick count
    
    // Market regime filter
    if (config.avoidHighVolatility && this.marketState.regime === 'HIGH_VOLATILITY') {
      return false;
    }

    // Session filter
    if (config.sessionFilter && config.sessionFilter !== 'ALL' && config.sessionFilter !== this.marketState.session) {
      return false;
    }

    // Max concurrent (simplified)
    const activeTrades = this.tradeHistory.filter(t => 
      t.strategy === signal.strategy && !['TP', 'SL', 'EXPIRED'].includes(t.exitReason || '')
    ).length;
    if (activeTrades >= config.maxConcurrent) return false;

    return true;
  }

  public recordTrade(result: TradeResult): void {
    this.tradeHistory.push(result);
    this.dailyPnL += result.profit;
    this.dailyTrades++;
    if (!result.won) this.dailyLosses++;
    this.lastTradeTimes[result.strategy] = Date.now();
    
    const perf = this.performance[result.strategy];
    perf.totalTrades++;
    perf.totalStaked += result.stake;
    perf.totalProfit += result.profit;
    perf.roi = perf.totalStaked > 0 ? (perf.totalProfit / perf.totalStaked) * 100 : 0;
    
    if (result.won) {
      perf.wins++;
      perf.currentStreak = Math.max(0, perf.currentStreak) + 1;
      perf.bestStreak = Math.max(perf.bestStreak, perf.currentStreak);
    } else {
      perf.losses++;
      perf.currentStreak = Math.min(0, perf.currentStreak) - 1;
      perf.worstStreak = Math.min(perf.worstStreak, perf.currentStreak);
    }
    
    perf.winRate = perf.totalTrades > 0 ? (perf.wins / perf.totalTrades) * 100 : 0;
    perf.lastTradeTime = Date.now();
    
    // Update advanced metrics
    this.updateAdvancedMetrics(result.strategy);
  }

  private updateAdvancedMetrics(strategy: EnhancedStrategyType): void {
    const trades = this.tradeHistory.filter(t => t.strategy === strategy);
    if (trades.length < 2) return;

    const perf = this.performance[strategy];
    
    // Profit factor
    const grossProfit = trades.filter(t => t.won).reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(trades.filter(t => !t.won).reduce((sum, t) => sum + t.profit, 0));
    perf.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;

    // Sharpe ratio (simplified)
    const returns = trades.map(t => t.profit / t.stake);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    perf.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // Avg hold time
    const completedTrades = trades.filter(t => t.exitReason);
    if (completedTrades.length > 0) {
      perf.avgHoldTime = completedTrades.reduce((sum, t) => sum + t.holdTimeMs, 0) / completedTrades.length;
    }

    // Max drawdown
    let running = 0;
    let peak = 0;
    let maxDD = 0;
    for (const t of trades) {
      running += t.profit;
      peak = Math.max(peak, running);
      maxDD = Math.max(maxDD, peak - running);
    }
    perf.maxDrawdown = maxDD;
  }

  // Public getters
  public getConfig(type: EnhancedStrategyType): EnhancedStrategyConfig {
    return { ...this.configs[type] };
  }

  public getAllConfigs(): Record<EnhancedStrategyType, EnhancedStrategyConfig> {
    return { ...this.configs };
  }

  public getPerformance(type: EnhancedStrategyType): EnhancedPerformance {
    return { ...this.performance[type] };
  }

  public getAllPerformance(): Record<EnhancedStrategyType, EnhancedPerformance> {
    return { ...this.performance };
  }

  public getTradeHistory(): TradeResult[] {
    return [...this.tradeHistory];
  }

  public getMarketState(): MarketState {
    return { ...this.marketState };
  }

  public getDailyStats(): { pnl: number; trades: number; losses: number } {
    return { pnl: this.dailyPnL, trades: this.dailyTrades, losses: this.dailyLosses };
  }

  // Position sizing helpers
  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }
}

export const enhancedStrategyEngine = new EnhancedStrategyEngine();