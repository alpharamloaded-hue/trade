import { DigitStat, PatternDetection, RollingWindowSize, TickData } from '../types/deriv';

/**
 * Robust decimal digit extraction taking into account symbol precision
 */
export function extractLastDigit(quote: number, decimals: number): number {
  if (typeof quote !== 'number' || isNaN(quote)) return 0;
  const formatted = quote.toFixed(decimals);
  const lastChar = formatted.charAt(formatted.length - 1);
  const digit = parseInt(lastChar, 10);
  return isNaN(digit) ? 0 : digit;
}

/**
 * Computes frequency distribution, deviations, and streaks for digits 0-9
 */
export function computeDigitStats(
  ticks: TickData[],
  windowSize: RollingWindowSize
): DigitStat[] {
  const windowTicks = ticks.slice(-windowSize);
  const total = windowTicks.length;

  if (total === 0) {
    return Array.from({ length: 10 }, (_, d) => ({
      digit: d,
      count: 0,
      frequency: 10,
      deviation: 0,
      currentStreak: 0,
      maxStreak: 0,
      isHot: false,
      isCold: false,
    }));
  }

  // Count occurrences
  const counts = new Array(10).fill(0);
  windowTicks.forEach((t) => {
    if (t.lastDigit >= 0 && t.lastDigit <= 9) {
      counts[t.lastDigit]++;
    }
  });

  // Calculate streaks (ticks since last appearance from the most recent tick backwards)
  const currentStreaks = new Array(10).fill(total);
  const maxStreaks = new Array(10).fill(0);

  for (let d = 0; d <= 9; d++) {
    // Current streak: distance from end of array
    let found = false;
    for (let i = total - 1; i >= 0; i--) {
      if (windowTicks[i].lastDigit === d) {
        currentStreaks[d] = total - 1 - i;
        found = true;
        break;
      }
    }
    if (!found) {
      currentStreaks[d] = total;
    }

    // Max drought streak within window
    let currentDrought = 0;
    let maxDrought = 0;
    for (let i = 0; i < total; i++) {
      if (windowTicks[i].lastDigit === d) {
        if (currentDrought > maxDrought) {
          maxDrought = currentDrought;
        }
        currentDrought = 0;
      } else {
        currentDrought++;
      }
    }
    if (currentDrought > maxDrought) {
      maxDrought = currentDrought;
    }
    maxStreaks[d] = maxDrought;
  }

  return counts.map((count, digit) => {
    const frequency = Number(((count / total) * 100).toFixed(1));
    const deviation = Number((frequency - 10.0).toFixed(1));
    return {
      digit,
      count,
      frequency,
      deviation,
      currentStreak: currentStreaks[digit],
      maxStreak: maxStreaks[digit],
      isHot: frequency >= 12.0,
      isCold: frequency <= 8.0,
    };
  });
}

/**
 * Scan tick stream for key tactical patterns (X2X, twins, streaks, drought)
 */
export function scanPatterns(ticks: TickData[]): PatternDetection[] {
  const detections: PatternDetection[] = [];
  const len = ticks.length;
  if (len < 3) return detections;

  const latestTick = ticks[len - 1];
  const prevTick = ticks[len - 2];
  const prev2Tick = ticks[len - 3];

  // 1. X2X Pattern (e.g. 7-2-7 or 4-2-4)
  if (
    prev2Tick.lastDigit === latestTick.lastDigit &&
    prevTick.lastDigit === 2 &&
    latestTick.lastDigit !== 2
  ) {
    detections.push({
      id: `x2x-${latestTick.epoch}-${latestTick.lastDigit}`,
      type: 'X2X',
      title: `X2X Reversal: ${latestTick.lastDigit}-2-${latestTick.lastDigit}`,
      description: `Flanking digit ${latestTick.lastDigit} confirmed around pivot 2. Historically signals momentum or symmetry exhaustion.`,
      confidence: 88,
      timestamp: latestTick.epoch,
      digit: latestTick.lastDigit,
    });
  }

  // 2. Twin digits (e.g. 8-8 or 0-0)
  if (prevTick.lastDigit === latestTick.lastDigit) {
    detections.push({
      id: `twin-${latestTick.epoch}-${latestTick.lastDigit}`,
      type: 'TWIN',
      title: `Twin Repetition: Double ${latestTick.lastDigit}`,
      description: `Consecutive match on digit ${latestTick.lastDigit}. High probability of divergence on the immediate next tick.`,
      confidence: 84,
      timestamp: latestTick.epoch,
      digit: latestTick.lastDigit,
    });
  }

  // 3. Parity Streak (4+ consecutive Even or Odd)
  let evenStreak = 0;
  let oddStreak = 0;
  for (let i = len - 1; i >= Math.max(0, len - 10); i--) {
    const isEven = ticks[i].lastDigit % 2 === 0;
    if (i === len - 1) {
      if (isEven) evenStreak = 1;
      else oddStreak = 1;
    } else {
      if (evenStreak > 0 && isEven) evenStreak++;
      else if (oddStreak > 0 && !isEven) oddStreak++;
      else break;
    }
  }

  if (evenStreak >= 4) {
    detections.push({
      id: `even-${latestTick.epoch}-${evenStreak}`,
      type: 'EVEN_STREAK',
      title: `${evenStreak}x Even Streak`,
      description: `Run of ${evenStreak} consecutive even digits. Statistical mean reversion toward odd digits is elevated.`,
      confidence: Math.min(95, 60 + evenStreak * 7),
      timestamp: latestTick.epoch,
      streakCount: evenStreak,
    });
  } else if (oddStreak >= 4) {
    detections.push({
      id: `odd-${latestTick.epoch}-${oddStreak}`,
      type: 'ODD_STREAK',
      title: `${oddStreak}x Odd Streak`,
      description: `Run of ${oddStreak} consecutive odd digits. Statistical mean reversion toward even digits is elevated.`,
      confidence: Math.min(95, 60 + oddStreak * 7),
      timestamp: latestTick.epoch,
      streakCount: oddStreak,
    });
  }

  // 4. Over / Under Streak (Over: 5-9, Under: 0-4)
  let overStreak = 0;
  let underStreak = 0;
  for (let i = len - 1; i >= Math.max(0, len - 10); i--) {
    const isOver = ticks[i].lastDigit >= 5;
    if (i === len - 1) {
      if (isOver) overStreak = 1;
      else underStreak = 1;
    } else {
      if (overStreak > 0 && isOver) overStreak++;
      else if (underStreak > 0 && !isOver) underStreak++;
      else break;
    }
  }

  if (overStreak >= 4) {
    detections.push({
      id: `over-${latestTick.epoch}-${overStreak}`,
      type: 'OVER_STREAK',
      title: `${overStreak}x High Digits (5-9)`,
      description: `Run of ${overStreak} ticks in upper half. High probability of mean reversion toward 0-4.`,
      confidence: Math.min(94, 62 + overStreak * 6),
      timestamp: latestTick.epoch,
      streakCount: overStreak,
    });
  } else if (underStreak >= 4) {
    detections.push({
      id: `under-${latestTick.epoch}-${underStreak}`,
      type: 'UNDER_STREAK',
      title: `${underStreak}x Low Digits (0-4)`,
      description: `Run of ${underStreak} ticks in lower half. High probability of mean reversion toward 5-9.`,
      confidence: Math.min(94, 62 + underStreak * 6),
      timestamp: latestTick.epoch,
      streakCount: underStreak,
    });
  }

  // 5. Drought Alert (Digit missing for >= 18 ticks in recent window)
  const stats = computeDigitStats(ticks, 100);
  stats.forEach((s) => {
    if (s.currentStreak >= 18) {
      detections.push({
        id: `drought-${latestTick.epoch}-${s.digit}`,
        type: 'DROUGHT',
        title: `Drought Alert: Digit ${s.digit} (${s.currentStreak} Ticks)`,
        description: `Digit ${s.digit} has not appeared for ${s.currentStreak} consecutive ticks. Mean-reversion match pressure is strong.`,
        confidence: Math.min(96, 65 + (s.currentStreak - 15) * 3),
        timestamp: latestTick.epoch,
        digit: s.digit,
        streakCount: s.currentStreak,
      });
    }
  });

  return detections;
}

/**
 * Calculate statistical confidence score for a specific digit strategy
 */
export function calculateConfidence(
  stat: DigitStat,
  totalTicks: number
): { score: number; signal: 'STRONG_MATCH' | 'FAVOR_DIFFER' | 'NEUTRAL'; reason: string } {
  if (totalTicks < 30) {
    return {
      score: 50,
      signal: 'NEUTRAL',
      reason: 'Sample size warming up (< 30 ticks)',
    };
  }

  // Cold digit with high drought streak: ideal for Match Mean Reversion
  if (stat.currentStreak >= 18) {
    const score = Math.min(95, 65 + (stat.currentStreak - 18) * 3);
    return {
      score,
      signal: 'STRONG_MATCH',
      reason: `Significant drought of ${stat.currentStreak} ticks. Mean-reversion probability elevated.`,
    };
  }

  // Hot digit (>14%) with low streak: momentum or Differ caution
  if (stat.frequency >= 14.0) {
    return {
      score: 82,
      signal: 'STRONG_MATCH',
      reason: `High cluster density (${stat.frequency}% vs 10% baseline). Momentum favor.`,
    };
  }

  // Cold digit (<6%): high confidence for Differ contract (betting against it)
  if (stat.frequency <= 6.0 && stat.currentStreak > 5) {
    return {
      score: 91,
      signal: 'FAVOR_DIFFER',
      reason: `Ultra-cold frequency (${stat.frequency}%). High statistical safety for Differ contract.`,
    };
  }

  return {
    score: 50,
    signal: 'NEUTRAL',
    reason: `Normal statistical variance (${stat.frequency}% vs 10% expected).`,
  };
}

/**
 * Martingale Staking Progression & Exposure Calculator
 */
export interface MartingaleStep {
  step: number;
  stake: number;
  cumulativeStake: number;
  payoutOnWin: number;
  netProfitOnWin: number;
}

export function calculateMartingaleLadder(
  initialStake: number,
  multiplierFactor: number = 2.0,
  maxSteps: number = 6,
  payoutMultiplier: number = 1.95 // e.g. 1.95x payout for 50/50, or 9x for match, or 1.09x for differ
): MartingaleStep[] {
  const steps: MartingaleStep[] = [];
  let cumStake = 0;

  for (let i = 1; i <= maxSteps; i++) {
    const currentStake =
      i === 1 ? initialStake : Number((steps[i - 2].stake * multiplierFactor).toFixed(2));
    cumStake = Number((cumStake + currentStake).toFixed(2));
    const payout = Number((currentStake * payoutMultiplier).toFixed(2));
    const netProfit = Number((payout - cumStake).toFixed(2));

    steps.push({
      step: i,
      stake: currentStake,
      cumulativeStake: cumStake,
      payoutOnWin: payout,
      netProfitOnWin: netProfit,
    });
  }

  return steps;
}
