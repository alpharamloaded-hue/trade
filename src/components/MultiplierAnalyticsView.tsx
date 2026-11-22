import { AlertOctagon, ChevronRight, Gauge, ShieldAlert, Sliders, TrendingDown, TrendingUp } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { DerivProposal, TickData } from '../types/deriv';
import { calculateMultiplierMetrics, simulateMultiplierPL } from '../utils/multiplierMath';
import { getSymbolMeta } from '../utils/symbols';

interface MultiplierAnalyticsViewProps {
  latestTick: TickData | null;
  symbol: string;
  currency?: string;
  onInitiateOrder: (proposal: DerivProposal, contractType: string, multiplier: number) => void;
  prefillConfig?: {
    direction: 'MULTUP' | 'MULTDOWN';
    multiplier: number;
    stake: number;
    key: number;
  };
}

const MULTIPLIER_PRESETS = [10, 20, 50, 100, 200, 500, 1000, 2000];

export const MultiplierAnalyticsView: React.FC<MultiplierAnalyticsViewProps> = ({
  latestTick,
  symbol,
  currency = 'USD',
  onInitiateOrder,
  prefillConfig,
}) => {
  const meta = getSymbolMeta(symbol);
  const entryPrice = latestTick ? latestTick.quote : 2854.38;

  const [stake, setStake] = useState<number>(20);
  const [multiplier, setMultiplier] = useState<number>(100);
  const [direction, setDirection] = useState<'MULTUP' | 'MULTDOWN'>('MULTUP');
  const [takeProfit, setTakeProfit] = useState<number>(15);
  const [stopLoss, setStopLoss] = useState<number>(10);

  useEffect(() => {
    if (prefillConfig) {
      setDirection(prefillConfig.direction);
      setMultiplier(prefillConfig.multiplier);
      setStake(prefillConfig.stake);
    }
  }, [prefillConfig]);

  const [simulatedMovePct, setSimulatedMovePct] = useState<number>(0);
  const [activeProposal, setActiveProposal] = useState<DerivProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState<boolean>(false);

  const metrics = useMemo(() => {
    return calculateMultiplierMetrics(entryPrice, {
      stake,
      multiplier,
      direction,
      takeProfit,
      stopLoss,
    });
  }, [entryPrice, stake, multiplier, direction, takeProfit, stopLoss]);

  const simulatedPrice = Number((entryPrice * (1 + simulatedMovePct / 100)).toFixed(meta.decimals));
  const simResult = useMemo(() => {
    return simulateMultiplierPL(entryPrice, simulatedPrice, stake, multiplier, direction);
  }, [entryPrice, simulatedPrice, stake, multiplier, direction]);

  useEffect(() => {
    let isCancelled = false;
    setProposalLoading(true);

    derivWs
      .fetchProposal({
        contractType: direction,
        stake,
        symbol,
        currency,
        multiplier,
      })
      .then((prop) => {
        if (!isCancelled) {
          setActiveProposal(prop);
          setProposalLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setProposalLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [stake, multiplier, direction, symbol, currency]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Multiplier Setup Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#24322C] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#24322C]">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#34D399]" />
              <span>Multiplier Leverage & Risk Configurator</span>
            </h3>
            <p className="text-[11px] text-[#9FB3AA]">
              Model profit/loss potential and liquidation thresholds up to 2000x
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-[#6EE7B7] bg-[#0F5C45]/35 border border-[#34D399]/30 px-2.5 py-1 rounded-lg tabular-nums">
            Max Loss: {currency} {stake}
          </span>
        </div>

        {/* Direction Switcher */}
        <div>
          <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1.5">
            Trade Direction
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={() => setDirection('MULTUP')}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-extrabold text-xs sm:text-sm transition-all cursor-pointer ${
                direction === 'MULTUP'
                  ? 'bg-[#0F5C45] text-white ring-2 ring-[#34D399]'
                  : 'bg-[#18221E] text-[#9FB3AA] border border-[#2C3E36] hover:text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>UP · MULTIPLIER UP</span>
            </button>
            <button
              onClick={() => setDirection('MULTDOWN')}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-extrabold text-xs sm:text-sm transition-all cursor-pointer ${
                direction === 'MULTDOWN'
                  ? 'bg-[#F28C28] text-[#0B100E] ring-2 ring-[#FFB56B]'
                  : 'bg-[#18221E] text-[#9FB3AA] border border-[#2C3E36] hover:text-white'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>DOWN · MULTIPLIER DOWN</span>
            </button>
          </div>
        </div>

        {/* Multiplier Presets */}
        <div>
          <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1.5">
            Multiplier Factor ({multiplier}x)
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {MULTIPLIER_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setMultiplier(m)}
                className={`py-2 rounded-lg font-mono text-xs font-extrabold transition-all cursor-pointer ${
                  multiplier === m
                    ? 'bg-[#0F5C45] text-white ring-1 ring-[#F28C28]'
                    : 'bg-[#18221E] text-[#EBF2EE] border border-[#2C3E36] hover:border-[#34D399]/50'
                }`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        {/* Stake & Protection Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1">
              Stake ({currency})
            </label>
            <input
              type="number"
              min="1"
              value={stake}
              onChange={(e) => setStake(Math.max(1, parseFloat(e.target.value) || 10))}
              className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] font-mono text-sm font-bold text-white focus:outline-hidden focus:border-[#34D399]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1">
              Take Profit ({currency})
            </label>
            <input
              type="number"
              min="1"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] font-mono text-sm font-bold text-[#34D399] focus:outline-hidden focus:border-[#34D399]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1">
              Stop Loss ({currency})
            </label>
            <input
              type="number"
              min="1"
              max={stake}
              value={stopLoss}
              onChange={(e) => setStopLoss(Math.min(stake, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] font-mono text-sm font-bold text-[#FFB56B] focus:outline-hidden focus:border-[#F28C28]"
            />
          </div>
        </div>
      </div>

      {/* 2. Liquidation & Stop-Out Risk Modeling Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#24322C] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#24322C]">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-[#F28C28]" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Stop-Out & Liquidation Level
            </h4>
          </div>
          <span className="text-[11px] font-mono font-bold text-red-400 tabular-nums">
            Capped Loss: -{currency} {metrics.maxLoss.toFixed(2)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] uppercase font-mono">Current Spot</div>
            <div className="text-sm sm:text-base font-mono font-extrabold text-white tabular-nums mt-0.5">
              {entryPrice.toFixed(meta.decimals)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F28C28]/12 border border-[#F28C28]/40">
            <div className="text-[10px] text-[#FFB56B] uppercase font-mono font-bold">Stop-Out Price</div>
            <div className="text-sm sm:text-base font-mono font-extrabold text-[#F28C28] tabular-nums mt-0.5">
              {metrics.liquidationPrice.toFixed(meta.decimals)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] uppercase font-mono">Buffer Distance</div>
            <div className="text-sm sm:text-base font-mono font-extrabold text-[#34D399] tabular-nums mt-0.5">
              {metrics.distanceToLiquidationPct.toFixed(2)}%
            </div>
            <div className="text-[10px] text-[#8DA399] font-mono tabular-nums">
              ({metrics.distanceToLiquidationPts.toFixed(meta.decimals)} pts)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] uppercase font-mono">Max Risk</div>
            <div className="text-sm sm:text-base font-mono font-extrabold text-red-400 tabular-nums mt-0.5">
              -{currency} {metrics.maxLoss.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#8DA399] font-mono">100% of Stake</div>
          </div>
        </div>

        {/* Visual Liquidation Distance Gauge */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-[#9FB3AA] mb-1.5">
            <span>Liquidation Buffer Gauge</span>
            <span
              className={`font-bold ${
                metrics.distanceToLiquidationPct < 0.2
                  ? 'text-red-400'
                  : metrics.distanceToLiquidationPct < 1
                  ? 'text-[#FFB56B]'
                  : 'text-[#34D399]'
              }`}
            >
              {metrics.distanceToLiquidationPct < 0.2
                ? 'CRITICAL / NARROW'
                : metrics.distanceToLiquidationPct < 1
                ? 'HIGH VOLATILITY'
                : 'MODERATE BUFFER'}
            </span>
          </div>

          <div className="h-3 w-full bg-[#18221E] rounded-full overflow-hidden p-0.5 border border-[#2C3E36]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.distanceToLiquidationPct < 0.2
                  ? 'bg-red-500'
                  : metrics.distanceToLiquidationPct < 1
                  ? 'bg-[#F28C28]'
                  : 'bg-[#168564]'
              }`}
              style={{
                width: `${Math.min(100, (metrics.distanceToLiquidationPct / 5) * 100)}%`,
              }}
            />
          </div>

          <div className="flex justify-between text-[9px] text-[#8DA399] font-mono mt-1">
            <span>0.05% (2000x)</span>
            <span>1.0% (100x)</span>
            <span>5.0% (20x Safe)</span>
          </div>
        </div>

        {(metrics.takeProfitPrice || metrics.stopLossPrice) && (
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36] flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
            {metrics.takeProfitPrice && (
              <span className="text-[#34D399] font-semibold">
                TP: <strong>{metrics.takeProfitPrice.toFixed(meta.decimals)}</strong> (+{currency} {takeProfit})
              </span>
            )}
            {metrics.stopLossPrice && (
              <span className="text-[#FFB56B] font-semibold">
                SL: <strong>{metrics.stopLossPrice.toFixed(meta.decimals)}</strong> (-{currency} {stopLoss})
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. Interactive P/L Simulator Slider */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#24322C] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#24322C]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#34D399]" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              P/L Price Movement Simulator
            </h4>
          </div>
          <button
            onClick={() => setSimulatedMovePct(0)}
            className="text-[11px] font-mono font-bold text-[#34D399] hover:underline cursor-pointer"
          >
            Reset (0.00%)
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-mono mb-2 tabular-nums">
            <span className="text-[#9FB3AA]">
              Simulated Price: <strong className="text-white">{simulatedPrice.toFixed(meta.decimals)}</strong>
            </span>
            <span
              className={`font-bold ${
                simulatedMovePct > 0
                  ? 'text-[#34D399]'
                  : simulatedMovePct < 0
                  ? 'text-[#FFB56B]'
                  : 'text-[#9FB3AA]'
              }`}
            >
              {simulatedMovePct >= 0 ? `+${simulatedMovePct.toFixed(2)}%` : `${simulatedMovePct.toFixed(2)}%`}
            </span>
          </div>

          <input
            type="range"
            min="-2.0"
            max="2.0"
            step="0.05"
            value={simulatedMovePct}
            onChange={(e) => setSimulatedMovePct(parseFloat(e.target.value))}
            className="w-full h-2 bg-[#18221E] rounded-lg appearance-none cursor-pointer accent-[#34D399]"
          />

          <div className="flex justify-between text-[10px] text-[#8DA399] font-mono mt-1">
            <span>-2.0% Drop</span>
            <span>0% Entry</span>
            <span>+2.0% Rally</span>
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            simResult.isLiquidated
              ? 'bg-red-500/12 border-red-500/40'
              : simResult.plAmount >= 0
              ? 'bg-[#0F5C45]/30 border-[#34D399]/35'
              : 'bg-[#F28C28]/12 border-[#F28C28]/40'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] text-[#B8C7C0] font-mono uppercase font-semibold">
                Simulated Profit / Loss
              </div>
              <div
                className={`text-xl sm:text-2xl font-mono font-extrabold tabular-nums mt-0.5 ${
                  simResult.isLiquidated
                    ? 'text-red-400'
                    : simResult.plAmount >= 0
                    ? 'text-[#34D399]'
                    : 'text-[#FFB56B]'
                }`}
              >
                {simResult.isLiquidated
                  ? `-${currency} ${stake.toFixed(2)} (STOPPED)`
                  : `${simResult.plAmount >= 0 ? '+' : ''}${currency} ${simResult.plAmount.toFixed(2)}`}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-[#B8C7C0] font-mono uppercase font-semibold">ROI</div>
              <div
                className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                  simResult.plPercentage >= 0 ? 'text-[#34D399]' : 'text-red-400'
                }`}
              >
                {simResult.plPercentage >= 0 ? '+' : ''}
                {simResult.plPercentage.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Live Multiplier Proposal & Execution Trigger */}
      <div
        id="order-execution-card"
        className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#1E8766]/60 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#34D399]" />
              <span>Live Proposal & Order Execution</span>
            </h4>
            <p className="text-[11px] text-[#9FB3AA]">
              Live quote streamed for {symbol} ({direction})
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-[#34D399]">
            {proposalLoading ? 'Fetching...' : 'Quote Active'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3.5 rounded-xl bg-[#18221E] border border-[#2C3E36] text-center font-mono">
          <div>
            <div className="text-[10px] text-[#9FB3AA] uppercase">Stake</div>
            <div className="text-sm sm:text-base font-extrabold text-white tabular-nums">
              {currency} {stake.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9FB3AA] uppercase">Multiplier</div>
            <div className="text-sm sm:text-base font-extrabold text-[#F28C28] tabular-nums">
              {multiplier}x
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9FB3AA] uppercase">Exposure</div>
            <div className="text-sm sm:text-base font-extrabold text-[#34D399] tabular-nums">
              {currency} {(stake * multiplier).toLocaleString()}
            </div>
          </div>
        </div>

        <button
          disabled={!activeProposal || proposalLoading || (activeProposal.ask_price || 0) <= 0}
          onClick={() => {
            if (activeProposal && activeProposal.ask_price > 0) {
              onInitiateOrder(activeProposal, direction, multiplier);
            }
          }}
          className={`w-full py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            direction === 'MULTUP'
              ? 'bg-[#0F5C45] hover:bg-[#147558] text-white'
              : 'bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E]'
          }`}
        >
          <span>
            {proposalLoading
              ? 'Streaming Multiplier Quote...'
              : activeProposal && activeProposal.ask_price <= 0
              ? 'Invalid Quote - Retry'
              : `Review & Place ${direction === 'MULTUP' ? 'Multiplier UP' : 'Multiplier DOWN'} (${multiplier}x)`}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
