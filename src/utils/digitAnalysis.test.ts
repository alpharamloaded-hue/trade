import { describe, it, expect, vi } from 'vitest';
import { extractLastDigit, computeDigitStats, scanPatterns, calculateConfidence, calculateMartingaleLadder } from './digitAnalysis';
import { DigitStat, PatternDetection, TickData, RollingWindowSize } from '../types/deriv';

vi.mock('vitest');

describe('extractLastDigit', () => {
  it('extracts last digit from 2-decimal quote', () => {
    expect(extractLastDigit(123.45, 2)).toBe(5);
    expect(extractLastDigit(123.40, 2)).toBe(0);
    expect(extractLastDigit(123.99, 2)).toBe(9);
  });

  it('extracts last digit from 3-decimal quote', () => {
    expect(extractLastDigit(123.456, 3)).toBe(6);
    expect(extractLastDigit(123.450, 3)).toBe(0);
  });

  it('handles integer quotes (formatted with decimals)', () => {
    // 105.toFixed(2) = "105.00" -> last digit is 0
    expect(extractLastDigit(100, 2)).toBe(0);
    expect(extractLastDigit(105, 2)).toBe(0);
    // For integer quotes without decimals, use decimals=0
    expect(extractLastDigit(105, 0)).toBe(5);
    expect(extractLastDigit(100, 0)).toBe(0);
  });

  it('handles NaN and invalid input', () => {
    expect(extractLastDigit(NaN, 2)).toBe(0);
    expect(extractLastDigit(Infinity, 2)).toBe(0);
  });
});

describe('computeDigitStats', () => {
  const createTicks = (digits: number[]): TickData[] => {
    return digits.map((d, i) => ({
      epoch: 1000 + i,
      quote: 1000 + d,
      lastDigit: d,
      direction: 'up' as const,
      symbol: '1HZ100V',
    }));
  };

  it('returns default stats for empty ticks', () => {
    const stats = computeDigitStats([], 100);
    expect(stats).toHaveLength(10);
    stats.forEach((s) => {
      expect(s.count).toBe(0);
      expect(s.frequency).toBe(10);
      expect(s.deviation).toBe(0);
      expect(s.currentStreak).toBe(0);
      expect(s.maxStreak).toBe(0);
      expect(s.isHot).toBe(false);
      expect(s.isCold).toBe(false);
    });
  });

  it('calculates correct frequencies', () => {
    const ticks = createTicks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const stats = computeDigitStats(ticks, 50);
    
    stats.forEach((s) => {
      expect(s.count).toBe(1);
      expect(s.frequency).toBe(10);
      expect(s.deviation).toBe(0);
    });
  });

  it('detects hot and cold digits', () => {
    // 7 appears 5 times out of 10 = 50% (hot >= 12%)
    // 2 appears 1 time out of 10 = 10% (normal)
    // 8 appears 0 times out of 10 = 0% (cold <= 8%)
    const ticks = createTicks([7, 7, 7, 7, 7, 1, 2, 3, 4, 5]);
    const stats = computeDigitStats(ticks, 50);
    
    expect(stats[7].isHot).toBe(true);
    expect(stats[7].frequency).toBe(50);
    expect(stats[8].isCold).toBe(true);
    expect(stats[8].frequency).toBe(0);
    expect(stats[2].isHot).toBe(false);
    expect(stats[2].isCold).toBe(false);
  });

  it('calculates current streaks correctly', () => {
    // Last 3 ticks are 5, 5, 5
    const ticks = createTicks([1, 2, 3, 4, 5, 5, 5]);
    const stats = computeDigitStats(ticks, 50);
    
    // Digit 5 last appeared at index 6 (0-based), so streak = 0
    expect(stats[5].currentStreak).toBe(0);
    
    // Digit 4 last appeared at index 3, so streak = 7 - 1 - 3 = 3
    expect(stats[4].currentStreak).toBe(3);
    
    // Digit 6 never appeared, streak = total = 7
    expect(stats[6].currentStreak).toBe(7);
  });

  it('calculates max drought streaks correctly', () => {
    // 5 appears at index 0 and 5, with drought of 4 in between
    const ticks = createTicks([5, 1, 2, 3, 4, 5, 6]);
    const stats = computeDigitStats(ticks, 50);
    
    expect(stats[5].maxStreak).toBe(4);
  });
});

describe('scanPatterns', () => {
  const createTicks = (digits: number[]): TickData[] => {
    return digits.map((d, i) => ({
      epoch: 1000 + i,
      quote: 1000 + d,
      lastDigit: d,
      direction: 'up' as const,
      symbol: '1HZ100V',
    }));
  };

  it('detects X2X pattern', () => {
    const ticks = createTicks([7, 2, 7]);
    const patterns = scanPatterns(ticks);
    
    expect(patterns).toHaveLength(1);
    expect(patterns[0].type).toBe('X2X');
    expect(patterns[0].digit).toBe(7);
  });

  it('detects Twin pattern', () => {
    const ticks = createTicks([1, 2, 8, 8]);
    const patterns = scanPatterns(ticks);
    
    const twin = patterns.find((p) => p.type === 'TWIN');
    expect(twin).toBeDefined();
    expect(twin?.digit).toBe(8);
  });

  it('detects even streak', () => {
    const ticks = createTicks([2, 4, 6, 8, 0]);
    const patterns = scanPatterns(ticks);
    
    const evenStreak = patterns.find((p) => p.type === 'EVEN_STREAK');
    expect(evenStreak).toBeDefined();
    expect(evenStreak?.streakCount).toBe(5);
  });

  it('detects odd streak', () => {
    const ticks = createTicks([1, 3, 5, 7, 9]);
    const patterns = scanPatterns(ticks);
    
    const oddStreak = patterns.find((p) => p.type === 'ODD_STREAK');
    expect(oddStreak).toBeDefined();
    expect(oddStreak?.streakCount).toBe(5);
  });

  it('detects over streak', () => {
    const ticks = createTicks([5, 6, 7, 8, 9]);
    const patterns = scanPatterns(ticks);
    
    const overStreak = patterns.find((p) => p.type === 'OVER_STREAK');
    expect(overStreak).toBeDefined();
    expect(overStreak?.streakCount).toBe(5);
  });

  it('detects under streak', () => {
    const ticks = createTicks([0, 1, 2, 3, 4]);
    const patterns = scanPatterns(ticks);
    
    const underStreak = patterns.find((p) => p.type === 'UNDER_STREAK');
    expect(underStreak).toBeDefined();
    expect(underStreak?.streakCount).toBe(5);
  });

  it('detects drought', () => {
    // Create 100 ticks where all digits appear at least once, but digit 7 has the longest drought
    // Digit 7 appears at index 7 (first 10), then not again until the end (or not at all)
    // Other digits 0-6, 8-9 repeat every 9 ticks
    const digits = Array.from({ length: 100 }, (_, i) => {
      if (i < 10) return i; // 0-9 at indices 0-9
      if (i === 99) return 9; // Some other digit at the end
      const cycle = (i - 10) % 9; // 0-8 repeating
      // Map 0-6 -> 0-6, 7 -> 8, 8 -> 9 (skip 7)
      return cycle >= 7 ? cycle + 1 : cycle;
    });
    const ticks = createTicks(digits);
    const patterns = scanPatterns(ticks);
    
    const drought = patterns.find((p) => p.type === 'DROUGHT');
    expect(drought).toBeDefined();
    // Digit 7 should have the highest drought streak (last seen at index 7, 92 ticks ago)
    expect(drought?.digit).toBe(7);
    expect(drought?.streakCount).toBeGreaterThan(50);
  });

  it('returns empty for insufficient ticks', () => {
    const ticks = createTicks([1, 2]);
    const patterns = scanPatterns(ticks);
    expect(patterns).toHaveLength(0);
  });
});

describe('calculateConfidence', () => {
  const baseStat: DigitStat = {
    digit: 5,
    count: 10,
    frequency: 10,
    deviation: 0,
    currentStreak: 5,
    maxStreak: 10,
    isHot: false,
    isCold: false,
  };

  it('returns neutral for insufficient ticks', () => {
    const result = calculateConfidence(baseStat, 25);
    expect(result.signal).toBe('NEUTRAL');
    expect(result.score).toBe(50);
  });

  it('returns STRONG_MATCH for high drought', () => {
    const stat = { ...baseStat, currentStreak: 20 };
    const result = calculateConfidence(stat, 100);
    expect(result.signal).toBe('STRONG_MATCH');
    // Score = 65 + (20 - 18) * 3 = 71
    expect(result.score).toBe(71);
  });

  it('returns STRONG_MATCH for hot digit', () => {
    const stat = { ...baseStat, frequency: 15 };
    const result = calculateConfidence(stat, 100);
    expect(result.signal).toBe('STRONG_MATCH');
    expect(result.score).toBe(82);
  });

  it('returns FAVOR_DIFFER for ultra-cold digit with drought', () => {
    const stat = { ...baseStat, frequency: 5, currentStreak: 10 };
    const result = calculateConfidence(stat, 100);
    expect(result.signal).toBe('FAVOR_DIFFER');
    expect(result.score).toBe(91);
  });

  it('returns NEUTRAL for normal variance', () => {
    const result = calculateConfidence(baseStat, 100);
    expect(result.signal).toBe('NEUTRAL');
    expect(result.score).toBe(50);
  });
});

describe('calculateMartingaleLadder', () => {
  it('calculates correct ladder for DIGITMATCH (9.2x payout)', () => {
    const ladder = calculateMartingaleLadder(5, 2.0, 3, 9.2);
    
    expect(ladder).toHaveLength(3);
    expect(ladder[0].step).toBe(1);
    expect(ladder[0].stake).toBe(5);
    expect(ladder[0].cumulativeStake).toBe(5);
    expect(ladder[0].payoutOnWin).toBe(46); // 5 * 9.2
    expect(ladder[0].netProfitOnWin).toBe(41); // 46 - 5
    
    expect(ladder[1].step).toBe(2);
    expect(ladder[1].stake).toBe(10); // 5 * 2
    expect(ladder[1].cumulativeStake).toBe(15); // 5 + 10
    expect(ladder[1].payoutOnWin).toBe(92); // 10 * 9.2
    expect(ladder[1].netProfitOnWin).toBe(77); // 92 - 15
    
    expect(ladder[2].step).toBe(3);
    expect(ladder[2].stake).toBe(20); // 10 * 2
    expect(ladder[2].cumulativeStake).toBe(35); // 5 + 10 + 20
    expect(ladder[2].payoutOnWin).toBe(184); // 20 * 9.2
    expect(ladder[2].netProfitOnWin).toBe(149); // 184 - 35
  });

  it('calculates correct ladder for DIGITDIFF (1.09x payout)', () => {
    const ladder = calculateMartingaleLadder(10, 2.0, 2, 1.09);
    
    expect(ladder[0].stake).toBe(10);
    expect(ladder[0].payoutOnWin).toBe(10.9); // 10 * 1.09
    expect(ladder[0].netProfitOnWin).toBe(0.9); // 10.9 - 10
    
    expect(ladder[1].stake).toBe(20);
    expect(ladder[1].cumulativeStake).toBe(30);
    expect(ladder[1].payoutOnWin).toBe(21.8); // 20 * 1.09
    expect(ladder[1].netProfitOnWin).toBe(-8.2); // 21.8 - 30
  });

  it('uses default multiplier factor of 2.0', () => {
    const ladder = calculateMartingaleLadder(5, undefined, 2, 2);
    expect(ladder[1].stake).toBe(10); // 5 * 2 (default)
  });

  it('uses default max steps of 6', () => {
    const ladder = calculateMartingaleLadder(5, 2, undefined, 2);
    expect(ladder).toHaveLength(6);
  });
});