import { AlertOctagon, ArrowDown, ArrowUp, ChevronRight, Gauge, Info, Play, ShieldAlert, Sliders, TrendingDown, TrendingUp } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { DerivProposal, MultiplierParameters, TickData } from '../types/deriv';
import { calculateMultiplierMetrics, generatePLCurvePoints, simulateMultiplierPL } from '../utils/multiplierMath';
import { getSymbolMeta } from '../utils/symbols';

interface MultiplierAnalyticsViewProps {
  latestTick: TickData | null;
  symbol: string;
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
  onInitiateOrder,
  prefillConfig,
}) => {
  const meta = getSymbolMeta(symbol);
  const entryPrice = latestTick ? latestTick.quote : 2854.38;

  // Multiplier parameters
  const [stake, setStake] = useState<number>(20);
  const [multiplier, setMultiplier] = useState<number>(100);
  const [direction, setDirection] = useState<'MULTUP' | 'MULTDOWN'>('MULTUP');
  const [takeProfit, setTakeProfit] = useState<number>(15);
  const [stopLoss, setStopLoss] = useState<number>(10);

  // Sync with radar prefill action
  useEffect(() => {
    if (prefillConfig) {
      setDirection(prefillConfig.direction);
      setMultiplier(prefillConfig.multiplier);
      setStake(prefillConfig.stake);
    }
  }, [prefillConfig]);

  // Interactive P/L Slider simulation (-2% to +2% price change)
  const [simulatedMovePct, setSimulatedMovePct] = useState<number>(0);

  // Proposal state
  const [activeProposal, setActiveProposal] = useState<DerivProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState<boolean>(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Calculate liquidation metrics
  const metrics = useMemo(() => {
    return calculateMultiplierMetrics(entryPrice, {
      stake,
      multiplier,
      direction,
      takeProfit,
      stopLoss,
    });
  }, [entryPrice, stake, multiplier, direction, takeProfit, stopLoss]);

  // Compute live simulated P/L at slider position
  const simulatedPrice = Number((entryPrice * (1 + simulatedMovePct / 100)).toFixed(meta.decimals));
  const simResult = useMemo(() => {
    return simulateMultiplierPL(entryPrice, simulatedPrice, stake, multiplier, direction);
  }, [entryPrice, simulatedPrice, stake, multiplier, direction]);

  // Generate curve points for visual modeling
  const curvePoints = useMemo(() => {
    return generatePLCurvePoints(entryPrice, stake, multiplier, direction, 15);
  }, [entryPrice, stake, multiplier, direction]);

  // Fetch live proposal from Deriv
  useEffect(() => {
    let isCancelled = false;
    setProposalLoading(true);
    setProposalError(null);

    derivWs
      .fetchProposal({
        contractType: direction,
        stake,
        symbol,
        multiplier,
      })
      .then((prop) => {
        if (!isCancelled) {
          setActiveProposal(prop);
          setProposalLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setProposalError(err?.message || 'Proposal failed');
          setProposalLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [stake, multiplier, direction, symbol]);

  return (
    <div className="space-y-5">
      {/* 1. Multiplier Setup Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Multiplier Leverage & Risk Configurator</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Model profit/loss potential and liquidation thresholds up to 2000x leverage
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
            Loss Capped at Stake (${stake})
          </span>
        </div>

        {/* Direction Switcher (MULTUP / MULTDOWN) */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Trade Direction
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDirection('MULTUP')}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                direction === 'MULTUP'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-400/50'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>UP / MULTIPLIER UP</span>
            </button>
            <button
              onClick={() => setDirection('MULTDOWN')}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                direction === 'MULTDOWN'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50 ring-2 ring-rose-400/50'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>DOWN / MULTIPLIER DOWN</span>
            </button>
          </div>
        </div>

        {/* Multiplier Presets */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Multiplier Factor ({multiplier}x)
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {MULTIPLIER_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setMultiplier(m)}
                className={`py-2 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer ${
                  multiplier === m
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        {/* Stake & Protection Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Stake */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Stake ($ USD)
            </label>
            <input
              type="number"
              min="1"
              value={stake}
              onChange={(e) => setStake(Math.max(1, parseFloat(e.target.value) || 10))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm text-white focus:outline-hidden focus:border-cyan-500"
            />
          </div>

          {/* Take Profit */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Take Profit ($ USD)
            </label>
            <input
              type="number"
              min="1"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm text-emerald-400 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Stop Loss */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Stop Loss ($ USD)
            </label>
            <input
              type="number"
              min="1"
              max={stake}
              value={stopLoss}
              onChange={(e) => setStopLoss(Math.min(stake, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm text-rose-400 focus:outline-hidden focus:border-rose-500"
            />
          </div>
        </div>
      </div>

      {/* 2. Liquidation & Stop-Out Risk Modeling Card */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Stop-Out & Liquidation Level
            </h4>
          </div>
          <span className="text-[11px] font-mono text-rose-400">
            Capped Loss: -${metrics.maxLoss.toFixed(2)}
          </span>
        </div>

        {/* Key Liquidation Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Current Spot</div>
            <div className="text-base font-mono font-bold text-white tabular-nums mt-0.5">
              {entryPrice.toFixed(meta.decimals)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50">
            <div className="text-[10px] text-rose-300 uppercase font-mono">Stop-Out Price</div>
            <div className="text-base font-mono font-bold text-rose-400 tabular-nums mt-0.5">
              {metrics.liquidationPrice.toFixed(meta.decimals)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Distance to Stop-Out</div>
            <div className="text-base font-mono font-bold text-amber-400 tabular-nums mt-0.5">
              {metrics.distanceToLiquidationPct.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              ({metrics.distanceToLiquidationPts.toFixed(meta.decimals)} pts)
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Max Potential Loss</div>
            <div className="text-base font-mono font-bold text-rose-400 tabular-nums mt-0.5">
              -${metrics.maxLoss.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">100% of Stake</div>
          </div>
        </div>

        {/* Visual Liquidation Distance Gauge */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
            <span>Liquidation Buffer Gauge</span>
            <span
              className={
                metrics.distanceToLiquidationPct < 0.2
                  ? 'text-rose-400 font-bold'
                  : metrics.distanceToLiquidationPct < 1
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              {metrics.distanceToLiquidationPct < 0.2
                ? 'CRITICAL / ULTRA-NARROW'
                : metrics.distanceToLiquidationPct < 1
                ? 'HIGH VOLATILITY RISK'
                : 'MODERATE BUFFER'}
            </span>
          </div>

          <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.distanceToLiquidationPct < 0.2
                  ? 'bg-rose-500'
                  : metrics.distanceToLiquidationPct < 1
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{
                width: `${Math.min(100, (metrics.distanceToLiquidationPct / 5) * 100)}%`,
              }}
            />
          </div>

          <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
            <span>0.05% (2000x - Immediate)</span>
            <span>1.0% (100x)</span>
            <span>5.0% (20x - Safe)</span>
          </div>
        </div>

        {/* Protection Trigger Levels */}
        {(metrics.takeProfitPrice || metrics.stopLossPrice) && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
            {metrics.takeProfitPrice && (
              <span className="text-emerald-400">
                TP Target: <strong>{metrics.takeProfitPrice.toFixed(meta.decimals)}</strong> (+${takeProfit})
              </span>
            )}
            {metrics.stopLossPrice && (
              <span className="text-rose-400">
                SL Barrier: <strong>{metrics.stopLossPrice.toFixed(meta.decimals)}</strong> (-${stopLoss})
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. Interactive P/L Simulator Slider */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Dynamic P/L Price Movement Simulator
            </h4>
          </div>
          <button
            onClick={() => setSimulatedMovePct(0)}
            className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            Reset to Flat (0.00%)
          </button>
        </div>

        {/* Range Slider */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-slate-400">
              Simulated Price: <strong className="text-white">{simulatedPrice.toFixed(meta.decimals)}</strong>
            </span>
            <span
              className={`font-bold ${
                simulatedMovePct > 0
                  ? 'text-emerald-400'
                  : simulatedMovePct < 0
                  ? 'text-rose-400'
                  : 'text-slate-400'
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
            className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />

          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>-2.0% Drop</span>
            <span>0% Entry</span>
            <span>+2.0% Rally</span>
          </div>
        </div>

        {/* Simulated Outcome Display */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            simResult.isLiquidated
              ? 'bg-rose-950/40 border-rose-800/60'
              : simResult.plAmount >= 0
              ? 'bg-emerald-950/30 border-emerald-800/50'
              : 'bg-slate-950/80 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase">
                Simulated Profit / Loss
              </div>
              <div
                className={`text-2xl font-mono font-extrabold tabular-nums mt-0.5 ${
                  simResult.isLiquidated
                    ? 'text-rose-400'
                    : simResult.plAmount >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {simResult.isLiquidated
                  ? `-$${stake.toFixed(2)} (STOPPED OUT)`
                  : `${simResult.plAmount >= 0 ? '+' : ''}$${simResult.plAmount.toFixed(2)}`}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-mono uppercase">ROI on Stake</div>
              <div
                className={`text-lg font-mono font-bold tabular-nums mt-0.5 ${
                  simResult.plPercentage >= 0 ? 'text-emerald-400' : 'text-rose-400'
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
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/90 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <span>Live Proposal Stream & Execution</span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Live quote streamed from Deriv API for {symbol} ({direction})
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-400">
            {proposalLoading ? 'Fetching...' : 'Quote Active'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center font-mono">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Stake</div>
            <div className="text-base font-bold text-white tabular-nums">${stake.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Multiplier</div>
            <div className="text-base font-bold text-cyan-400 tabular-nums">{multiplier}x</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400 uppercase">Effective Power</div>
            <div className="text-base font-bold text-emerald-400 tabular-nums">
              ${(stake * multiplier).toLocaleString()}
            </div>
          </div>
        </div>

        <button
          disabled={!activeProposal || proposalLoading}
          onClick={() => {
            if (activeProposal) {
              onInitiateOrder(activeProposal, direction, multiplier);
            }
          }}
          className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-white ${
            direction === 'MULTUP'
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50'
              : 'bg-rose-600 hover:bg-rose-500 shadow-rose-950/50'
          }`}
        >
          <span>
            {proposalLoading
              ? 'Streaming Multiplier Quote...'
              : `Review & Place ${direction === 'MULTUP' ? 'Multiplier UP' : 'Multiplier DOWN'} (${multiplier}x)`}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
