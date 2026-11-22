import { MultiplierParameters, MultiplierRiskMetrics } from '../types/deriv';

/**
 * Multiplier Leverage & Liquidation Model for Synthetic Indices
 */
export function calculateMultiplierMetrics(
  entryPrice: number,
  params: MultiplierParameters
): MultiplierRiskMetrics {
  const { stake, multiplier, direction, takeProfit, stopLoss } = params;

  if (entryPrice <= 0 || multiplier <= 0 || stake <= 0) {
    return {
      liquidationPrice: 0,
      distanceToLiquidationPts: 0,
      distanceToLiquidationPct: 0,
      maxLoss: stake,
      breakevenPrice: entryPrice,
    };
  }

  // Exact price change percentage that wipes out 100% of stake
  const stopOutPct = 1 / multiplier; // e.g. 0.01 for 100x
  const distanceToLiquidationPct = Number((stopOutPct * 100).toFixed(4));
  const distanceToLiquidationPts = Number((entryPrice * stopOutPct).toFixed(4));

  let liquidationPrice: number;
  let breakevenPrice = entryPrice;
  let stopLossPrice: number | undefined;
  let takeProfitPrice: number | undefined;

  if (direction === 'MULTUP') {
    // Up: liquidated if price falls by 1 / multiplier
    liquidationPrice = Number((entryPrice * (1 - stopOutPct)).toFixed(4));

    if (stopLoss && stopLoss > 0) {
      // SL price where loss equals stopLoss amount
      const slRatio = Math.min(stake, stopLoss) / (stake * multiplier);
      stopLossPrice = Number((entryPrice * (1 - slRatio)).toFixed(4));
    }

    if (takeProfit && takeProfit > 0) {
      const tpRatio = takeProfit / (stake * multiplier);
      takeProfitPrice = Number((entryPrice * (1 + tpRatio)).toFixed(4));
    }
  } else {
    // Down: liquidated if price rises by 1 / multiplier
    liquidationPrice = Number((entryPrice * (1 + stopOutPct)).toFixed(4));

    if (stopLoss && stopLoss > 0) {
      const slRatio = Math.min(stake, stopLoss) / (stake * multiplier);
      stopLossPrice = Number((entryPrice * (1 + slRatio)).toFixed(4));
    }

    if (takeProfit && takeProfit > 0) {
      const tpRatio = takeProfit / (stake * multiplier);
      takeProfitPrice = Number((entryPrice * (1 - tpRatio)).toFixed(4));
    }
  }

  return {
    liquidationPrice,
    distanceToLiquidationPts,
    distanceToLiquidationPct,
    maxLoss: stake,
    breakevenPrice,
    stopLossPrice,
    takeProfitPrice,
  };
}

/**
 * Computes live P/L and percentage return given current spot price
 */
export function simulateMultiplierPL(
  entryPrice: number,
  currentPrice: number,
  stake: number,
  multiplier: number,
  direction: 'MULTUP' | 'MULTDOWN'
): {
  plAmount: number;
  plPercentage: number;
  priceDeltaPct: number;
  isLiquidated: boolean;
} {
  if (entryPrice <= 0) {
    return { plAmount: 0, plPercentage: 0, priceDeltaPct: 0, isLiquidated: false };
  }

  const rawDeltaPct = (currentPrice - entryPrice) / entryPrice;
  const effectiveDeltaPct = direction === 'MULTUP' ? rawDeltaPct : -rawDeltaPct;

  // Potential profit/loss without cap
  const theoreticalPL = stake * multiplier * effectiveDeltaPct;

  // Multipliers guarantee loss cannot exceed stake
  const isLiquidated = theoreticalPL <= -stake;
  const plAmount = isLiquidated ? -stake : Number(theoreticalPL.toFixed(2));
  const plPercentage = Number(((plAmount / stake) * 100).toFixed(2));

  return {
    plAmount,
    plPercentage,
    priceDeltaPct: Number((rawDeltaPct * 100).toFixed(4)),
    isLiquidated,
  };
}

/**
 * Generate a curve of price moves (-2% to +2%) for visual P/L modeling
 */
export function generatePLCurvePoints(
  entryPrice: number,
  stake: number,
  multiplier: number,
  direction: 'MULTUP' | 'MULTDOWN',
  steps: number = 21
): Array<{ movePct: number; simulatedPrice: number; pl: number; isStoppedOut: boolean }> {
  const points: Array<{ movePct: number; simulatedPrice: number; pl: number; isStoppedOut: boolean }> = [];
  // Max range based on multiplier sensitivity
  const maxRangePct = Math.max(1.5, Math.min(10, (2.5 / multiplier) * 100));

  for (let i = 0; i < steps; i++) {
    const factor = (i / (steps - 1)) * 2 - 1; // -1 to +1
    const movePct = Number((factor * maxRangePct).toFixed(3));
    const simulatedPrice = Number((entryPrice * (1 + movePct / 100)).toFixed(4));
    const result = simulateMultiplierPL(entryPrice, simulatedPrice, stake, multiplier, direction);

    points.push({
      movePct,
      simulatedPrice,
      pl: result.plAmount,
      isStoppedOut: result.isLiquidated,
    });
  }

  return points;
}
