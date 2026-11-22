import { DigitStat, PatternDetection, TickData, TradeEntrySignal } from '../types/deriv';
import { computeDigitStats, scanPatterns, calculateConfidence, calculateMartingaleLadder, MartingaleStep } from './digitAnalysis';
import { generateDigitEntrySignal, generateMultiplierEntrySignal } from './entrySignals';

export type StrategyType = 
  | 'DROUGHT_MATCH'      // Mean reversion on overdue digits (9.2x payout)
  | 'COLD_DIFFER'        // Bet against ultra-cold digits (1.09x, ~90%+ win rate)
  | 'X2X_REVERSAL'       // X2X pattern reversal (1.09x)
  | 'TWIN_DIFFER'        // Twin pattern differ (1.09x)
  | 'STREAK_DIFFER'      // Parity/range streak exhaustion (1.09x)
  | 'TREND_MULTIPLIER'   // Low-leverage trend following (20-50x)
  | 'MEAN_REV_MULT'      // Multiplier mean reversion (20-50x)
  | 'SCALP_MULTIPLIER';  // Quick scalp with tight stops (10-20x)

export interface StrategyConfig {
  type: StrategyType;
  enabled: boolean;
  minConfidence: number;      // Minimum confidence to trade
  maxConcurrent: number;      // Max concurrent trades for this strategy
  stakePercent: number;       // % of balance per trade (0.5-5)
  maxDailyLoss: number;       // % of balance max daily loss
  cooldownTicks: number;      // Ticks to wait after trade
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface StrategySignal extends TradeEntrySignal {
  strategy: StrategyType;
  winRateEstimate: number;    // Historical win rate %
  expectedValue: number;      // EV per $1 risked
  kellyStake: number;         // Kelly criterion stake %
  maxStake: number;           // Max stake per trade (account %)
  reasoning: string[];
}

export interface TradeResult {
  strategy: StrategyType;
  contractType: string;
  stake: number;
  payout: number;
  won: boolean;
  profit: number;
  timestamp: number;
  digit?: number;
  multiplier?: number;
}

export interface StrategyPerformance {
  strategy: StrategyType;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  totalStaked: number;
  roi: number;
  avgConfidence: number;
  maxDrawdown: number;
  currentStreak: number;
  bestStreak: number;
  worstStreak: number;
  lastTradeTime: number;
}

const DEFAULT_CONFIGS: Record<StrategyType, StrategyConfig> = {
  DROUGHT_MATCH: {
    type: 'DROUGHT_MATCH',
    enabled: true,
    minConfidence: 75,
    maxConcurrent: 1,
    stakePercent: 1.0,
    maxDailyLoss: 5,
    cooldownTicks: 5,
    riskLevel: 'MEDIUM',
  },
  COLD_DIFFER: {
    type: 'COLD_DIFFER',
    enabled: true,
    minConfidence: 85,
    maxConcurrent: 2,
    stakePercent: 2.0,
    maxDailyLoss: 5,
    cooldownTicks: 3,
    riskLevel: 'LOW',
  },
  X2X_REVERSAL: {
    type: 'X2X_REVERSAL',
    enabled: true,
    minConfidence: 80,
    maxConcurrent: 1,
    stakePercent: 1.5,
    maxDailyLoss: 3,
    cooldownTicks: 5,
    riskLevel: 'LOW',
  },
  TWIN_DIFFER: {
    type: 'TWIN_DIFFER',
    enabled: true,
    minConfidence: 75,
    maxConcurrent: 1,
    stakePercent: 1.0,
    maxDailyLoss: 3,
    cooldownTicks: 3,
    riskLevel: 'LOW',
  },
  STREAK_DIFFER: {
    type: 'STREAK_DIFFER',
    enabled: true,
    minConfidence: 70,
    maxConcurrent: 1,
    stakePercent: 1.0,
    maxDailyLoss: 3,
    cooldownTicks: 5,
    riskLevel: 'MEDIUM',
  },
  TREND_MULTIPLIER: {
    type: 'TREND_MULTIPLIER',
    enabled: true,
    minConfidence: 75,
    maxConcurrent: 1,
    stakePercent: 1.0,
    maxDailyLoss: 5,
    cooldownTicks: 10,
    riskLevel: 'MEDIUM',
  },
  MEAN_REV_MULT: {
    type: 'MEAN_REV_MULT',
    enabled: false,
    minConfidence: 70,
    maxConcurrent: 1,
    stakePercent: 1.0,
    maxDailyLoss: 5,
    cooldownTicks: 10,
    riskLevel: 'HIGH',
  },
  SCALP_MULTIPLIER: {
    type: 'SCALP_MULTIPLIER',
    enabled: false,
    minConfidence: 80,
    maxConcurrent: 1,
    stakePercent: 0.5,
    maxDailyLoss: 2,
    cooldownTicks: 20,
    riskLevel: 'HIGH',
  },
};

const STRATEGY_WIN_RATES: Record<StrategyType, { base: number; confidenceMultiplier: number }> = {
  DROUGHT_MATCH: { base: 0.11, confidenceMultiplier: 0.005 },      // ~11% base, up to ~60% at high confidence
  COLD_DIFFER: { base: 0.90, confidenceMultiplier: 0.0008 },       // ~90% base, up to ~98%
  X2X_REVERSAL: { base: 0.75, confidenceMultiplier: 0.001 },       // ~75% base, up to ~85%
  TWIN_DIFFER: { base: 0.70, confidenceMultiplier: 0.0015 },       // ~70% base, up to ~85%
  STREAK_DIFFER: { base: 0.65, confidenceMultiplier: 0.002 },      // ~65% base, up to ~85%
  TREND_MULTIPLIER: { base: 0.55, confidenceMultiplier: 0.003 },   // ~55% base, up to ~70%
  MEAN_REV_MULT: { base: 0.50, confidenceMultiplier: 0.004 },      // ~50% base, up to ~70%
  SCALP_MULTIPLIER: { base: 0.60, confidenceMultiplier: 0.0025 },  // ~60% base, up to ~75%
};

export const STRATEGY_PAYOUTS: Record<StrategyType, number> = {
  DROUGHT_MATCH: 9.2,
  COLD_DIFFER: 1.09,
  X2X_REVERSAL: 1.09,
  TWIN_DIFFER: 1.09,
  STREAK_DIFFER: 1.09,
  TREND_MULTIPLIER: 50,
  MEAN_REV_MULT: 50,
  SCALP_MULTIPLIER: 20,
};

export const STRATEGY_CONTRACTS: Record<StrategyType, 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN'> = {
  DROUGHT_MATCH: 'DIGITMATCH',
  COLD_DIFFER: 'DIGITDIFF',
  X2X_REVERSAL: 'DIGITDIFF',
  TWIN_DIFFER: 'DIGITDIFF',
  STREAK_DIFFER: 'DIGITDIFF',
  TREND_MULTIPLIER: 'MULTUP',
  MEAN_REV_MULT: 'MULTUP',
  SCALP_MULTIPLIER: 'MULTUP',
};

export class StrategyEngine {
  private configs: Record<StrategyType, StrategyConfig>;
  private performance: Record<StrategyType, StrategyPerformance>;
  private tradeHistory: TradeResult[];
  private dailyPnL: number;
  private dailyTrades: number;
  private lastResetDay: number;
  private lastTradeTimes: Record<StrategyType, number>;

  constructor() {
    this.configs = { ...DEFAULT_CONFIGS };
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.lastResetDay = new Date().getDate();
    this.lastTradeTimes = {} as Record<StrategyType, number>;
    
    this.performance = {} as Record<StrategyType, StrategyPerformance>;
    (Object.keys(DEFAULT_CONFIGS) as StrategyType[]).forEach(type => {
      this.performance[type] = this.createEmptyPerformance(type);
    });
  }

  private createEmptyPerformance(type: StrategyType): StrategyPerformance {
    return {
      strategy: type,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfit: 0,
      totalStaked: 0,
      roi: 0,
      avgConfidence: 0,
      maxDrawdown: 0,
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
      lastTradeTime: 0,
    };
  }

  private resetDailyIfNeeded(): void {
    const today = new Date().getDate();
    if (today !== this.lastResetDay) {
      this.dailyPnL = 0;
      this.dailyTrades = 0;
      this.lastResetDay = today;
    }
  }

  public updateConfig(type: StrategyType, config: Partial<StrategyConfig>): void {
    this.configs[type] = { ...this.configs[type], ...config };
  }

  public getConfig(type: StrategyType): StrategyConfig {
    return { ...this.configs[type] };
  }

  public getAllConfigs(): Record<StrategyType, StrategyConfig> {
    return { ...this.configs };
  }

  public analyze(
    digitStats: DigitStat[],
    ticks: TickData[],
    patterns: PatternDetection[],
    latestTick: TickData | null,
    balance: number
  ): StrategySignal[] {
    this.resetDailyIfNeeded();
    
    const signals: StrategySignal[] = [];
    const configs = this.configs;
    const windowSize = 100; // Standard window

    // 1. DROUGHT_MATCH - Digit overdue >= 18 ticks
    if (configs.DROUGHT_MATCH.enabled) {
      const droughtDigit = digitStats
        .filter(s => s.currentStreak >= 18)
        .sort((a, b) => b.currentStreak - a.currentStreak)[0];
      
      if (droughtDigit) {
        const confidence = Math.min(96, 75 + (droughtDigit.currentStreak - 18) * 3);
        if (confidence >= configs.DROUGHT_MATCH.minConfidence) {
          signals.push(this.createSignal(
            'DROUGHT_MATCH',
            droughtDigit.digit,
            confidence,
            balance,
            [`Digit ${droughtDigit.digit} overdue ${droughtDigit.currentStreak} ticks (threshold: 18)`,
             'Mean reversion probability elevated',
             `Historical win rate: ~${this.estimateWinRate('DROUGHT_MATCH', confidence)}%`]
          ));
        }
      }
    }

    // 2. COLD_DIFFER - Ultra-cold digit (freq <= 6.5%, streak >= 6)
    if (configs.COLD_DIFFER.enabled) {
      const coldDigits = digitStats
        .filter(s => s.frequency <= 6.5 && s.currentStreak >= 6)
        .sort((a, b) => a.frequency - b.frequency);
      
      coldDigits.forEach(digit => {
        const confidence = 94; // Fixed high confidence for cold differ
        if (confidence >= configs.COLD_DIFFER.minConfidence) {
          const winRate = 100 - digit.frequency;
          signals.push(this.createSignal(
            'COLD_DIFFER',
            digit.digit,
            confidence,
            balance,
            [`Digit ${digit.digit} frequency: ${digit.frequency}% (baseline: 10%)`,
             `Drought: ${digit.currentStreak} ticks`,
             `Estimated win rate: ~${winRate.toFixed(1)}%`]
          ));
        }
      });
    }

    // 3. X2X_REVERSAL
    if (configs.X2X_REVERSAL.enabled) {
      const x2xPattern = patterns.find(p => p.type === 'X2X');
      if (x2xPattern && x2xPattern.digit !== undefined) {
        const confidence = x2xPattern.confidence;
        if (confidence >= configs.X2X_REVERSAL.minConfidence) {
          signals.push(this.createSignal(
            'X2X_REVERSAL',
            x2xPattern.digit,
            confidence,
            balance,
            [`X2X pattern: ${x2xPattern.digit}-2-${x2xPattern.digit} confirmed`,
             'Flanking symmetry suggests immediate divergence',
             `Pattern confidence: ${confidence}%`]
          ));
        }
      }
    }

    // 4. TWIN_DIFFER
    if (configs.TWIN_DIFFER.enabled) {
      const twinPattern = patterns.find(p => p.type === 'TWIN');
      if (twinPattern && twinPattern.digit !== undefined) {
        const confidence = twinPattern.confidence;
        if (confidence >= configs.TWIN_DIFFER.minConfidence) {
          signals.push(this.createSignal(
            'TWIN_DIFFER',
            twinPattern.digit,
            confidence,
            balance,
            [`Twin pattern: Double ${twinPattern.digit} detected`,
             'High probability of immediate divergence',
             `Pattern confidence: ${confidence}%`]
          ));
        }
      }
    }

    // 5. STREAK_DIFFER (Parity/Range streaks)
    if (configs.STREAK_DIFFER.enabled) {
      const streakPatterns = patterns.filter(p => 
        ['EVEN_STREAK', 'ODD_STREAK', 'OVER_STREAK', 'UNDER_STREAK'].includes(p.type)
      );
      
      streakPatterns.forEach(pattern => {
        if (pattern.streakCount && pattern.streakCount >= 4) {
          const confidence = pattern.confidence;
          if (confidence >= configs.STREAK_DIFFER.minConfidence) {
            const targetDigit = this.getStreakTargetDigit(pattern.type, digitStats);
            if (targetDigit !== null) {
              signals.push(this.createSignal(
                'STREAK_DIFFER',
                targetDigit,
                confidence,
                balance,
                [`${pattern.streakCount}x ${pattern.type.replace('_', ' ')} detected`,
                 'Mean reversion toward opposite parity/range',
                 `Pattern confidence: ${confidence}%`]
              ));
            }
          }
        }
      });
    }

    // 6. TREND_MULTIPLIER
    if (configs.TREND_MULTIPLIER.enabled && latestTick) {
      const multSignal = generateMultiplierEntrySignal(ticks, latestTick);
      if (multSignal.status === 'STRONG_ENTRY' && multSignal.confidenceScore >= configs.TREND_MULTIPLIER.minConfidence) {
        signals.push(this.createSignal(
          'TREND_MULTIPLIER',
          multSignal.recommendedParam,
          multSignal.confidenceScore,
          balance,
          [multSignal.rationale,
           `Direction: ${multSignal.recommendedContract}`,
           `Leverage: ${multSignal.recommendedParam}x`],
          multSignal.recommendedContract === 'MULTDOWN' ? 'MULTDOWN' : 'MULTUP'
        ));
      }
    }

    // Filter by daily loss limit and cooldown
    return signals.filter(s => this.canTrade(s.strategy, balance));
  }

  private createSignal(
    strategy: StrategyType,
    param: number,
    confidence: number,
    balance: number,
    reasoning: string[],
    contractOverride?: string
  ): StrategySignal {
    const config = this.configs[strategy];
    const payout = STRATEGY_PAYOUTS[strategy];
    const winRateData = STRATEGY_WIN_RATES[strategy];
    const estimatedWinRate = Math.min(99, winRateData.base * 100 + (confidence - 50) * winRateData.confidenceMultiplier * 100);
    const kellyStake = this.calculateKelly(estimatedWinRate / 100, payout);
    const maxStake = config.stakePercent;
    
    // Cap at Kelly * 0.5 (half-Kelly for safety)
    const suggestedStakePercent = Math.min(maxStake, kellyStake * 50);
    const stakeAmount = Math.round(balance * suggestedStakePercent / 100 * 100) / 100;

    return {
      id: `sig-${strategy}-${param}-${Date.now()}`,
      category: strategy.startsWith('MULT') ? 'MULTIPLIER' : 'DIGITS',
      status: confidence >= 85 ? 'STRONG_ENTRY' : confidence >= 70 ? 'FAVORABLE_SETUP' : 'AWAITING_SETUP',
      headline: this.getStrategyHeadline(strategy, param),
      actionLabel: this.getActionLabel(strategy, param),
      rationale: reasoning.join(' | '),
      confidenceScore: confidence,
      recommendedContract: (contractOverride || STRATEGY_CONTRACTS[strategy]) as 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN',
      recommendedParam: param,
      suggestedStake: Math.max(stakeAmount, 0.5),
      riskLevel: config.riskLevel === 'HIGH' ? 'ELEVATED' : config.riskLevel === 'MEDIUM' ? 'BALANCED' : 'LOW',
      expectedPayoutMultiplier: `${payout}x`,
      triggerRule: reasoning[0],
      strategy,
      winRateEstimate: estimatedWinRate,
      expectedValue: (estimatedWinRate / 100) * payout - (1 - estimatedWinRate / 100),
      kellyStake: kellyStake * 100,
      maxStake,
      reasoning,
    };
  }

  private calculateKelly(winProb: number, payout: number): number {
    // Kelly Criterion: f* = (bp - q) / b
    // where b = payout - 1, p = win prob, q = 1 - p
    const b = payout - 1;
    const p = winProb;
    const q = 1 - p;
    const kelly = (b * p - q) / b;
    return Math.max(0, kelly);
  }

  private estimateWinRate(strategy: StrategyType, confidence: number): number {
    const data = STRATEGY_WIN_RATES[strategy];
    return Math.min(99, Math.round(data.base * 100 + (confidence - 50) * data.confidenceMultiplier * 100));
  }

  private getStrategyHeadline(strategy: StrategyType, param: number): string {
    switch (strategy) {
      case 'DROUGHT_MATCH': return `🔥 Drought Match: Digit ${param} (${this.configs.DROUGHT_MATCH.stakePercent}% stake)`;
      case 'COLD_DIFFER': return `🛡️ Cold Differ: Against ${param} (~${this.estimateWinRate('COLD_DIFFER', 94)}% win rate)`;
      case 'X2X_REVERSAL': return `⚡ X2X Reversal: Differ ${param}`;
      case 'TWIN_DIFFER': return `👯 Twin Differ: Against ${param}`;
      case 'STREAK_DIFFER': return `📊 Streak Differ: Against ${param}`;
      case 'TREND_MULTIPLIER': return `📈 Trend Multiplier: ${param}x ${param > 0 ? 'UP' : 'DOWN'}`;
      default: return `${strategy}: ${param}`;
    }
  }

  private getActionLabel(strategy: StrategyType, param: number): string {
    const contract = STRATEGY_CONTRACTS[strategy];
    return contract.startsWith('MULT') 
      ? `AUTO: ${contract} ${param}x` 
      : `AUTO: ${contract} Digit ${param}`;
  }

  private getStreakTargetDigit(type: string, stats: DigitStat[]): number | null {
    if (type === 'EVEN_STREAK') {
      // Target odd digit with highest drought
      const oddDigits = stats.filter(s => s.digit % 2 === 1);
      return oddDigits.sort((a, b) => b.currentStreak - a.currentStreak)[0]?.digit ?? null;
    }
    if (type === 'ODD_STREAK') {
      const evenDigits = stats.filter(s => s.digit % 2 === 0);
      return evenDigits.sort((a, b) => b.currentStreak - a.currentStreak)[0]?.digit ?? null;
    }
    if (type === 'OVER_STREAK') {
      const underDigits = stats.filter(s => s.digit <= 4);
      return underDigits.sort((a, b) => b.currentStreak - a.currentStreak)[0]?.digit ?? null;
    }
    if (type === 'UNDER_STREAK') {
      const overDigits = stats.filter(s => s.digit >= 5);
      return overDigits.sort((a, b) => b.currentStreak - a.currentStreak)[0]?.digit ?? null;
    }
    return null;
  }

  public canTrade(strategy: StrategyType, balance: number): boolean {
    const config = this.configs[strategy];
    
    // Check daily loss limit
    if (this.dailyPnL <= -balance * config.maxDailyLoss / 100) {
      return false;
    }
    
    // Check cooldown
    const lastTrade = this.lastTradeTimes[strategy] || 0;
    const ticksSinceLastTrade = Date.now() - lastTrade; // Simplified - would use tick count in production
    // In real implementation, track actual tick count
    
    // Check max concurrent (would need active trade tracking)
    // For now, allow if not in cooldown
    
    return true;
  }

  public recordTrade(result: TradeResult): void {
    this.tradeHistory.push(result);
    this.dailyPnL += result.profit;
    this.dailyTrades++;
    this.lastTradeTimes[result.strategy] = Date.now();
    
    // Update performance
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
    
    // Update max drawdown
    const runningPnL = this.tradeHistory
      .filter(t => t.strategy === result.strategy)
      .reduce((sum, t) => sum + t.profit, 0);
    const peak = Math.max(0, ...this.getRunningPnLSeries(result.strategy));
    const drawdown = peak - runningPnL;
    perf.maxDrawdown = Math.max(perf.maxDrawdown, drawdown);
  }

  private getRunningPnLSeries(strategy: StrategyType): number[] {
    let running = 0;
    return this.tradeHistory
      .filter(t => t.strategy === strategy)
      .map(t => {
        running += t.profit;
        return running;
      });
  }

  public getPerformance(strategy: StrategyType): StrategyPerformance {
    return { ...this.performance[strategy] };
  }

  public getAllPerformance(): Record<StrategyType, StrategyPerformance> {
    return { ...this.performance };
  }

  public getTradeHistory(): TradeResult[] {
    return [...this.tradeHistory];
  }

  public getDailyStats(): { pnl: number; trades: number; maxLoss: number } {
    return {
      pnl: this.dailyPnL,
      trades: this.dailyTrades,
      maxLoss: this.dailyPnL,
    };
  }

  // Position sizing helpers
  public calculateFixedFractionalStake(balance: number, riskPercent: number): number {
    return Math.round(balance * riskPercent / 100 * 100) / 100;
  }

  public calculateMartingaleStake(
    baseStake: number,
    multiplier: number,
    step: number,
    maxSteps: number
  ): { stake: number; totalRisk: number; payout: number }[] {
    const steps = calculateMartingaleLadder(baseStake, multiplier, maxSteps, STRATEGY_PAYOUTS.DROUGHT_MATCH);
    return steps.map(s => ({
      stake: s.stake,
      totalRisk: s.cumulativeStake,
      payout: s.payoutOnWin,
    }));
  }
}

export const strategyEngine = new StrategyEngine();