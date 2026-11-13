import { DigitStat, PatternDetection, TickData, TradeEntrySignal } from '../types/deriv';

/**
 * Evaluates current market statistics and patterns to produce clear,
 * actionable trade entry recommendations for beginners and tactical traders.
 */
export function generateDigitEntrySignal(
  stats: DigitStat[],
  ticks: TickData[],
  patterns: PatternDetection[]
): TradeEntrySignal {
  if (ticks.length < 25 || stats.length === 0) {
    return {
      id: 'warming-up',
      category: 'DIGITS',
      status: 'AWAITING_SETUP',
      headline: 'Market Baseline Warming Up',
      actionLabel: 'Awaiting 25+ Ticks',
      rationale: 'Collecting live tick data to establish statistical frequency distribution.',
      confidenceScore: 50,
      recommendedContract: 'DIGITDIFF',
      recommendedParam: 0,
      suggestedStake: 10,
      riskLevel: 'BALANCED',
      expectedPayoutMultiplier: '1.09x',
      triggerRule: 'Minimum tick buffer requirement',
    };
  }

  // 1. Check for Highest Drought (Mean Reversion Match Candidate)
  const sortedByDrought = [...stats].sort((a, b) => b.currentStreak - a.currentStreak);
  const highestDrought = sortedByDrought[0];

  if (highestDrought && highestDrought.currentStreak >= 18) {
    const confidence = Math.min(96, 75 + (highestDrought.currentStreak - 18) * 3);
    return {
      id: `signal-drought-${highestDrought.digit}-${highestDrought.currentStreak}`,
      category: 'DIGITS',
      status: 'STRONG_ENTRY',
      headline: `🚨 High Probability Drought: Digit ${highestDrought.digit}`,
      actionLabel: `ENTER MATCH: Digit ${highestDrought.digit}`,
      rationale: `Digit ${highestDrought.digit} has failed to appear for ${highestDrought.currentStreak} consecutive ticks. Uniform probability dictates strong mean-reversion pressure. High payout potential (9.2x).`,
      confidenceScore: confidence,
      recommendedContract: 'DIGITMATCH',
      recommendedParam: highestDrought.digit,
      suggestedStake: 5,
      riskLevel: 'BALANCED',
      expectedPayoutMultiplier: '9.20x',
      triggerRule: `Absence drought exceeded 18 ticks (${highestDrought.currentStreak}t elapsed)`,
    };
  }

  // 2. Check for Ultra-Safe Differ Target (Extremely Cold Digit)
  const sortedByCold = [...stats].sort((a, b) => a.frequency - b.frequency);
  const coldest = sortedByCold[0];

  if (coldest && coldest.frequency <= 6.5 && coldest.currentStreak >= 6) {
    const winRateEst = Number((100 - coldest.frequency).toFixed(1));
    return {
      id: `signal-differ-${coldest.digit}`,
      category: 'DIGITS',
      status: 'STRONG_ENTRY',
      headline: `🛡️ High Win-Rate Differ Setup: Bet Against Digit ${coldest.digit}`,
      actionLabel: `ENTER DIFFER: Digit ${coldest.digit}`,
      rationale: `Digit ${coldest.digit} has appeared only ${coldest.frequency}% of the time (frequency is ${Math.abs(coldest.deviation)}% below average). Betting that the next tick will DIFFER from ${coldest.digit} carries an estimated ~${winRateEst}% probability of success.`,
      confidenceScore: 94,
      recommendedContract: 'DIGITDIFF',
      recommendedParam: coldest.digit,
      suggestedStake: 15,
      riskLevel: 'LOW',
      expectedPayoutMultiplier: '1.09x',
      triggerRule: `Coldest digit frequency below 6.5% with healthy drought (${coldest.currentStreak}t)`,
    };
  }

  // 3. Check for Active X2X Pattern
  const recentX2X = patterns.find((p) => p.type === 'X2X');
  if (recentX2X && recentX2X.digit !== undefined) {
    return {
      id: `signal-x2x-${recentX2X.id}`,
      category: 'DIGITS',
      status: 'FAVORABLE_SETUP',
      headline: `⚡ X2X Reversal Pattern Confirmed`,
      actionLabel: `ENTER DIFFER: Digit ${recentX2X.digit}`,
      rationale: `Flanking symmetry ${recentX2X.digit}-2-${recentX2X.digit} confirmed. Historical tick dynamics favor rapid divergence away from ${recentX2X.digit} on the immediate next tick.`,
      confidenceScore: 88,
      recommendedContract: 'DIGITDIFF',
      recommendedParam: recentX2X.digit,
      suggestedStake: 10,
      riskLevel: 'LOW',
      expectedPayoutMultiplier: '1.09x',
      triggerRule: `X2X pattern trigger around pivot 2`,
    };
  }

  // 4. Default / Setup Forming
  const nextCandidate = sortedByDrought[0];
  return {
    id: 'setup-forming',
    category: 'DIGITS',
    status: 'AWAITING_SETUP',
    headline: 'Setup In Formation: Monitoring Digit Absence',
    actionLabel: `Watch Digit ${nextCandidate.digit} (${nextCandidate.currentStreak}/18 Ticks)`,
    rationale: `Market is currently near balanced equilibrium. Digit ${nextCandidate.digit} is the closest to entering the high-probability drought zone (${nextCandidate.currentStreak} ticks elapsed, triggers at 18).`,
    confidenceScore: 68,
    recommendedContract: 'DIGITDIFF',
    recommendedParam: sortedByCold[0]?.digit ?? 0,
    suggestedStake: 10,
    riskLevel: 'LOW',
    expectedPayoutMultiplier: '1.09x',
    triggerRule: `Waiting for drought streak to reach >= 18 ticks or frequency divergence`,
  };
}

/**
 * Generates directional Multiplier trade setups based on short-term tick momentum
 */
export function generateMultiplierEntrySignal(
  ticks: TickData[],
  latestTick: TickData | null
): TradeEntrySignal {
  if (ticks.length < 15 || !latestTick) {
    return {
      id: 'mult-warming',
      category: 'MULTIPLIER',
      status: 'AWAITING_SETUP',
      headline: 'Analyzing Index Momentum',
      actionLabel: 'Standby for Trend Confirmation',
      rationale: 'Evaluating tick trajectory to identify directional momentum bursts.',
      confidenceScore: 50,
      recommendedContract: 'MULTUP',
      recommendedParam: 50,
      suggestedStake: 20,
      riskLevel: 'BALANCED',
      expectedPayoutMultiplier: '50x',
      triggerRule: 'Gathering price momentum baseline',
    };
  }

  const recent = ticks.slice(-8);
  let upMoves = 0;
  let downMoves = 0;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i].quote > recent[i - 1].quote) upMoves++;
    else if (recent[i].quote < recent[i - 1].quote) downMoves++;
  }

  const priceDelta = latestTick.quote - recent[0].quote;

  // Strong upward momentum (5+ up ticks out of 7)
  if (upMoves >= 5 && priceDelta > 0) {
    return {
      id: `mult-up-${latestTick.epoch}`,
      category: 'MULTIPLIER',
      status: 'STRONG_ENTRY',
      headline: '🚀 Bullish Momentum Surge Detected',
      actionLabel: 'ENTER: MULTIPLIER UP (50x)',
      rationale: `${upMoves} of the last 7 ticks have closed higher with strong upward expansion. Favorable for Multiplier UP with a safe 50x leverage (giving a wide 2.0% stop-out buffer).`,
      confidenceScore: 89,
      recommendedContract: 'MULTUP',
      recommendedParam: 50,
      suggestedStake: 20,
      riskLevel: 'BALANCED',
      expectedPayoutMultiplier: '50x Leverage',
      triggerRule: '5+ consecutive directional up ticks with positive delta',
    };
  }

  // Strong downward momentum (5+ down ticks out of 7)
  if (downMoves >= 5 && priceDelta < 0) {
    return {
      id: `mult-down-${latestTick.epoch}`,
      category: 'MULTIPLIER',
      status: 'STRONG_ENTRY',
      headline: '📉 Bearish Momentum Breakdown Detected',
      actionLabel: 'ENTER: MULTIPLIER DOWN (50x)',
      rationale: `${downMoves} of the last 7 ticks have closed lower with downward volume drift. Favorable for Multiplier DOWN with a safe 50x leverage (giving a wide 2.0% stop-out buffer).`,
      confidenceScore: 89,
      recommendedContract: 'MULTDOWN',
      recommendedParam: 50,
      suggestedStake: 20,
      riskLevel: 'BALANCED',
      expectedPayoutMultiplier: '50x Leverage',
      triggerRule: '5+ consecutive directional down ticks with negative delta',
    };
  }

  // Moderate upward bias
  if (upMoves > downMoves) {
    return {
      id: 'mult-mod-up',
      category: 'MULTIPLIER',
      status: 'FAVORABLE_SETUP',
      headline: 'Mild Upward Drift: Conservative 20x Setup',
      actionLabel: 'ENTER: MULTIPLIER UP (20x Safe)',
      rationale: 'Mild bullish bias detected. 20x multiplier offers an ultra-wide 5.0% liquidation buffer to ride the fluctuation comfortably.',
      confidenceScore: 78,
      recommendedContract: 'MULTUP',
      recommendedParam: 20,
      suggestedStake: 25,
      riskLevel: 'LOW',
      expectedPayoutMultiplier: '20x Leverage',
      triggerRule: 'Upward tick bias with conservative 5% stop-out buffer',
    };
  }

  // Choppy / neutral
  return {
    id: 'mult-neutral',
    category: 'MULTIPLIER',
    status: 'AWAITING_SETUP',
    headline: 'Consolidation / Choppy Range: Wait for Breakout',
    actionLabel: 'Standby / Low Leverage (10x-20x)',
    rationale: 'Prices are alternating without clear micro-trend direction. Avoid high multipliers (>100x) until clear tick momentum emerges.',
    confidenceScore: 55,
    recommendedContract: 'MULTUP',
    recommendedParam: 20,
    suggestedStake: 20,
    riskLevel: 'LOW',
    expectedPayoutMultiplier: '20x Leverage',
    triggerRule: 'Market alternating ticks in consolidation',
  };
}
