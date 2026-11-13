import { AlertCircle, ArrowUpRight, Calculator, CheckCircle2, ChevronRight, Flame, Gauge, Info, Snowflake, Target, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { soundEffects } from '../services/soundEffects';
import { DerivProposal, DigitStat, PatternDetection, RollingWindowSize, TickData } from '../types/deriv';
import { calculateConfidence, calculateMartingaleLadder, MartingaleStep } from '../utils/digitAnalysis';

interface DigitAnalyticsViewProps {
  digitStats: DigitStat[];
  windowSize: RollingWindowSize;
  onWindowChange: (size: RollingWindowSize) => void;
  patterns: PatternDetection[];
  latestTick: TickData | null;
  symbol: string;
  onInitiateOrder: (proposal: DerivProposal, contractType: string, targetDigit: number) => void;
  prefillConfig?: {
    contractType: 'DIGITMATCH' | 'DIGITDIFF';
    targetDigit: number;
    stake: number;
    key: number;
  };
}

export const DigitAnalyticsView: React.FC<DigitAnalyticsViewProps> = ({
  digitStats,
  windowSize,
  onWindowChange,
  patterns,
  latestTick,
  symbol,
  onInitiateOrder,
  prefillConfig,
}) => {
  // Strategy & Proposal state
  const [selectedDigit, setSelectedDigit] = useState<number>(0);
  const [contractType, setContractType] = useState<'DIGITMATCH' | 'DIGITDIFF'>('DIGITMATCH');
  const [stake, setStake] = useState<number>(10);
  const [activeProposal, setActiveProposal] = useState<DerivProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState<boolean>(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Sync with radar prefill action
  useEffect(() => {
    if (prefillConfig) {
      setContractType(prefillConfig.contractType);
      setSelectedDigit(prefillConfig.targetDigit);
      setStake(prefillConfig.stake);
    }
  }, [prefillConfig]);

  // Martingale Calculator Drawer
  const [showMartingale, setShowMartingale] = useState<boolean>(false);
  const [martingaleBaseStake, setMartingaleBaseStake] = useState<number>(5);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState<number>(2.1);
  const [martingaleSteps, setMartingaleSteps] = useState<number>(6);

  // Fetch proposal whenever digit, contractType, stake, or symbol changes
  useEffect(() => {
    let isCancelled = false;
    setProposalLoading(true);
    setProposalError(null);

    derivWs
      .fetchProposal({
        contractType,
        stake,
        symbol,
        duration: 1,
        barrier: String(selectedDigit),
      })
      .then((prop) => {
        if (!isCancelled) {
          setActiveProposal(prop);
          setProposalLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setProposalError(err?.message || 'Failed to fetch proposal');
          setProposalLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDigit, contractType, stake, symbol]);

  // Selected digit stats
  const selectedStat = digitStats.find((s) => s.digit === selectedDigit) || digitStats[0];
  const confidence = selectedStat
    ? calculateConfidence(selectedStat, windowSize)
    : { score: 50, signal: 'NEUTRAL', reason: 'Insufficient ticks' };

  // Sort hottest and coldest
  const hottestDigit = [...digitStats].sort((a, b) => b.frequency - a.frequency)[0];
  const coldestDigit = [...digitStats].sort((a, b) => a.frequency - b.frequency)[0];

  // Martingale ladder calculation
  const payoutFactor = contractType === 'DIGITMATCH' ? 9.2 : 1.09;
  const martingaleLadder: MartingaleStep[] = calculateMartingaleLadder(
    martingaleBaseStake,
    martingaleMultiplier,
    martingaleSteps,
    payoutFactor
  );

  return (
    <div className="space-y-5">
      {/* 1. Header Toolbar with Rolling Window Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Analysis Window:
          </span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {([50, 100, 500, 1000] as RollingWindowSize[]).map((size) => (
              <button
                key={size}
                onClick={() => onWindowChange(size)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  windowSize === size
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {size}T
              </button>
            ))}
          </div>
        </div>

        {/* Quick Hot & Cold Indicators */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {hottestDigit && (
            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-1 rounded-lg">
              <Flame className="w-3.5 h-3.5" />
              <span>Hot: {hottestDigit.digit} ({hottestDigit.frequency}%)</span>
            </div>
          )}
          {coldestDigit && (
            <div className="flex items-center gap-1.5 text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2 py-1 rounded-lg">
              <Snowflake className="w-3.5 h-3.5" />
              <span>Cold: {coldestDigit.digit} ({coldestDigit.frequency}%)</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Digit Frequency Heatmap & Bar Chart (0 to 9) */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span>Digit Frequency Distribution (0–9)</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Dashed line represents theoretical uniform distribution (10.0%)
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-emerald-500 inline-block" />
              <span>&gt;12% Hot</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-rose-500 inline-block" />
              <span>&lt;8% Cold</span>
            </span>
          </div>
        </div>

        {/* Bars Container */}
        <div className="relative pt-6 pb-2">
          {/* 10% Baseline line */}
          <div
            className="absolute left-0 right-0 border-b border-dashed border-cyan-500/50 z-10 flex items-center justify-end pr-1 pointer-events-none"
            style={{ bottom: '70px' }} // Height corresponding to 10% baseline in 140px chart
          >
            <span className="text-[10px] font-mono text-cyan-400 bg-slate-900/90 px-1 rounded -translate-y-2">
              10.0% Mean
            </span>
          </div>

          <div className="grid grid-cols-10 gap-1.5 sm:gap-2.5 h-44 items-end">
            {digitStats.map((stat) => {
              // Map percentage (0 to 25%) to height percentage
              const barHeightPct = Math.min(100, Math.max(8, (stat.frequency / 22) * 100));
              const isSelected = stat.digit === selectedDigit;

              let barColor = 'bg-slate-700 hover:bg-slate-600';
              if (stat.isHot) barColor = 'bg-emerald-500 hover:bg-emerald-400';
              else if (stat.isCold) barColor = 'bg-rose-500 hover:bg-rose-400';

              return (
                <button
                  key={stat.digit}
                  onClick={() => setSelectedDigit(stat.digit)}
                  className={`flex flex-col items-center justify-end h-full group cursor-pointer focus:outline-hidden transition-all ${
                    isSelected ? 'scale-105' : ''
                  }`}
                >
                  {/* Frequency percentage label above bar */}
                  <span
                    className={`text-[10px] font-mono font-bold mb-1 transition-colors ${
                      isSelected
                        ? 'text-cyan-300'
                        : stat.isHot
                        ? 'text-emerald-400'
                        : stat.isCold
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {stat.frequency}%
                  </span>

                  {/* Vertical bar */}
                  <div className="w-full bg-slate-950/60 rounded-t-md p-0.5 flex flex-col justify-end h-32">
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 relative shadow-sm ${barColor} ${
                        isSelected ? 'ring-2 ring-cyan-400' : ''
                      }`}
                      style={{ height: `${barHeightPct}%` }}
                    />
                  </div>

                  {/* Digit Button Label */}
                  <div
                    className={`mt-2 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-mono text-xs sm:text-sm font-extrabold transition-all ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-black'
                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                    }`}
                  >
                    {stat.digit}
                  </div>

                  {/* Actionable Signal Badge or Deviation */}
                  {stat.currentStreak >= 18 ? (
                    <span className="text-[8px] font-black font-mono text-amber-300 bg-amber-950 border border-amber-700/80 px-1 rounded mt-0.5 animate-pulse whitespace-nowrap shadow-xs">
                      MATCH
                    </span>
                  ) : stat.isCold && stat.frequency <= 6.5 ? (
                    <span className="text-[8px] font-black font-mono text-cyan-300 bg-cyan-950 border border-cyan-700/80 px-1 rounded mt-0.5 whitespace-nowrap shadow-xs">
                      DIFFER
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] font-mono mt-0.5 ${
                        stat.deviation > 0
                          ? 'text-emerald-400'
                          : stat.deviation < 0
                          ? 'text-rose-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {stat.deviation > 0 ? `+${stat.deviation}%` : `${stat.deviation}%`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Digit Drought & Streak Tracker */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Digit Drought & Absence Streaks
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              (Ticks since last appearance)
            </span>
          </div>
          <span className="text-[10px] text-amber-400 font-mono">
            Alert Threshold: 18+ Ticks
          </span>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {digitStats.map((stat) => {
            const isHighDrought = stat.currentStreak >= 18;
            const progress = Math.min(100, (stat.currentStreak / 20) * 100);

            return (
              <div
                key={stat.digit}
                onClick={() => setSelectedDigit(stat.digit)}
                className={`p-2 rounded-lg border text-center cursor-pointer transition-all ${
                  stat.digit === selectedDigit
                    ? 'border-cyan-500 bg-cyan-950/40 shadow-sm'
                    : isHighDrought
                    ? 'border-amber-700/80 bg-amber-950/30 animate-pulse'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className="font-bold text-slate-300">{stat.digit}</span>
                  <span
                    className={`font-bold ${
                      isHighDrought ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    {stat.currentStreak}t
                  </span>
                </div>
                {/* Drought bar */}
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      isHighDrought
                        ? 'bg-amber-400'
                        : stat.currentStreak >= 10
                        ? 'bg-cyan-500'
                        : 'bg-slate-600'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 font-mono mt-1">
                  Max: {stat.maxStreak}t
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Tactical Signals & Pattern Scanner Feed */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Real-Time Signal & Pattern Scanner
            </h4>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Automated Audio Chimes Enabled
          </span>
        </div>

        {patterns.length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/60 text-center text-xs text-slate-400 font-mono">
            Scanning 1-second ticks for X2X reversals, twin pairs, and statistical drought streaks...
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {patterns.slice(0, 4).map((pattern) => (
              <div
                key={pattern.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                      pattern.type === 'X2X'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : pattern.type === 'TWIN'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {pattern.type === 'X2X' ? 'X2X' : pattern.type === 'TWIN' ? '2X' : 'DR'}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {pattern.title}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">
                      {pattern.description}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-3">
                  <div className="text-xs font-mono font-bold text-cyan-400">
                    {pattern.confidence}% Edge
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono">
                    {new Date(pattern.timestamp * 1000).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Contract Proposal Preview (Match / Differ Execution) */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800/90 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Contract Proposal Preview & Order Form</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Live odds streamed directly from Deriv proposal engine
            </p>
          </div>
          <button
            onClick={() => setShowMartingale(!showMartingale)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5 text-cyan-400" />
            <span>Money Management</span>
          </button>
        </div>

        {/* Contract Type & Target Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Match vs Differ Switcher */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Contract Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setContractType('DIGITMATCH')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  contractType === 'DIGITMATCH'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                DIGIT MATCH
              </button>
              <button
                onClick={() => setContractType('DIGITDIFF')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  contractType === 'DIGITDIFF'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                DIGIT DIFFER
              </button>
            </div>
          </div>

          {/* Target Prediction Digit */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Target Digit: <span className="text-cyan-400 font-mono font-bold">{selectedDigit}</span>
            </label>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  className={`w-7 h-8 rounded-lg font-mono text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                    selectedDigit === d
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Stake Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Stake (USD)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">$</span>
                <input
                  type="number"
                  min="0.35"
                  step="1"
                  value={stake}
                  onChange={(e) => setStake(Math.max(0.35, parseFloat(e.target.value) || 1))}
                  className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm text-white focus:outline-hidden focus:border-cyan-500"
                />
              </div>
              <div className="flex gap-1">
                {[5, 10, 25].map((val) => (
                  <button
                    key={val}
                    onClick={() => setStake(val)}
                    className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-300 cursor-pointer"
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Proposal Pricing Card */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/80 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Potential Payout</div>
              <div className="text-lg font-mono font-extrabold text-emerald-400 tabular-nums">
                {activeProposal ? `$${activeProposal.payout.toFixed(2)}` : '---'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Net Profit</div>
              <div className="text-lg font-mono font-extrabold text-cyan-400 tabular-nums">
                {activeProposal
                  ? `$${(activeProposal.payout - activeProposal.ask_price).toFixed(2)}`
                  : '---'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Return on Stake</div>
              <div className="text-lg font-mono font-extrabold text-purple-400 tabular-nums">
                {activeProposal && activeProposal.ask_price > 0
                  ? `${(
                      ((activeProposal.payout - activeProposal.ask_price) /
                        activeProposal.ask_price) *
                      100
                    ).toFixed(1)}%`
                  : '---'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Confidence Edge</div>
              <div className="text-lg font-mono font-extrabold text-amber-400 tabular-nums">
                {confidence.score}%
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/60 text-xs text-slate-400 font-mono flex items-center justify-between">
            <span>
              Target: Last digit must {contractType === 'DIGITMATCH' ? 'MATCH' : 'DIFFER FROM'}{' '}
              <strong className="text-white">{selectedDigit}</strong>
            </span>
            <span>Duration: 1 Tick</span>
          </div>
        </div>

        {/* Order Execution Trigger Button */}
        <button
          disabled={!activeProposal || proposalLoading}
          onClick={() => {
            if (activeProposal) {
              onInitiateOrder(activeProposal, contractType, selectedDigit);
            }
          }}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>
            {proposalLoading
              ? 'Fetching Live Quote...'
              : `Review & Place ${contractType} (${selectedDigit})`}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 6. Martingale Calculator Drawer / Modal */}
      {showMartingale && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-bold text-white">
                Martingale & Money Management Ladder
              </h4>
            </div>
            <button
              onClick={() => setShowMartingale(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 font-mono">Base Stake ($)</label>
              <input
                type="number"
                value={martingaleBaseStake}
                onChange={(e) => setMartingaleBaseStake(Math.max(1, parseFloat(e.target.value) || 1))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-mono">Multiplier Factor</label>
              <input
                type="number"
                step="0.1"
                value={martingaleMultiplier}
                onChange={(e) =>
                  setMartingaleMultiplier(Math.max(1.1, parseFloat(e.target.value) || 2))
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 font-mono">Max Step Rounds</label>
              <input
                type="number"
                min="3"
                max="10"
                value={martingaleSteps}
                onChange={(e) =>
                  setMartingaleSteps(Math.min(10, Math.max(3, parseInt(e.target.value, 10) || 5)))
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-white"
              />
            </div>
          </div>

          {/* Ladder Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2">Step</th>
                  <th className="py-2">Stake</th>
                  <th className="py-2">Cumulative Risk</th>
                  <th className="py-2">Payout</th>
                  <th className="py-2 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {martingaleLadder.map((step) => (
                  <tr key={step.step} className="hover:bg-slate-800/30">
                    <td className="py-2 font-bold text-slate-300">Round #{step.step}</td>
                    <td className="py-2 text-white">${step.stake.toFixed(2)}</td>
                    <td className="py-2 text-rose-400 font-semibold">
                      ${step.cumulativeStake.toFixed(2)}
                    </td>
                    <td className="py-2 text-emerald-400">${step.payoutOnWin.toFixed(2)}</td>
                    <td
                      className={`py-2 text-right font-bold ${
                        step.netProfitOnWin >= 0 ? 'text-cyan-400' : 'text-rose-400'
                      }`}
                    >
                      ${step.netProfitOnWin.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Strict Warning:</strong> Martingale staking exponentially increases risk exposure during losing streaks. Never trade funds you cannot afford to lose.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
