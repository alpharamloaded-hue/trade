import { AlertCircle, Calculator, ChevronRight, Flame, Gauge, Snowflake, Target, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { DerivProposal, DigitStat, PatternDetection, RollingWindowSize, TickData } from '../types/deriv';
import { calculateConfidence, calculateMartingaleLadder, MartingaleStep } from '../utils/digitAnalysis';

interface DigitAnalyticsViewProps {
  digitStats: DigitStat[];
  windowSize: RollingWindowSize;
  onWindowChange: (size: RollingWindowSize) => void;
  patterns: PatternDetection[];
  latestTick: TickData | null;
  symbol: string;
  currency?: string;
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
  symbol,
  currency = 'USD',
  onInitiateOrder,
  prefillConfig,
}) => {
  const [selectedDigit, setSelectedDigit] = useState<number>(0);
  const [contractType, setContractType] = useState<'DIGITMATCH' | 'DIGITDIFF'>('DIGITMATCH');
  const [stake, setStake] = useState<number>(10);
  const [activeProposal, setActiveProposal] = useState<DerivProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState<boolean>(false);

  useEffect(() => {
    if (prefillConfig) {
      setContractType(prefillConfig.contractType);
      setSelectedDigit(prefillConfig.targetDigit);
      setStake(prefillConfig.stake);
    }
  }, [prefillConfig]);

  const [showMartingale, setShowMartingale] = useState<boolean>(false);
  const [martingaleBaseStake, setMartingaleBaseStake] = useState<number>(5);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState<number>(2.1);
  const [martingaleSteps, setMartingaleSteps] = useState<number>(6);

  useEffect(() => {
    let isCancelled = false;
    setProposalLoading(true);

    derivWs
      .fetchProposal({
        contractType,
        stake,
        symbol,
        currency,
        duration: 1,
        barrier: String(selectedDigit),
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
  }, [selectedDigit, contractType, stake, symbol, currency]);

  const selectedStat = digitStats.find((s) => s.digit === selectedDigit) || digitStats[0];
  const confidence = selectedStat
    ? calculateConfidence(selectedStat, windowSize)
    : { score: 50, signal: 'NEUTRAL', reason: 'Insufficient ticks' };

  const hottestDigit = [...digitStats].sort((a, b) => b.frequency - a.frequency)[0];
  const coldestDigit = [...digitStats].sort((a, b) => a.frequency - b.frequency)[0];

  const payoutFactor = contractType === 'DIGITMATCH' ? 9.2 : 1.09;
  const martingaleLadder: MartingaleStep[] = useMemo(
    () => calculateMartingaleLadder(martingaleBaseStake, martingaleMultiplier, martingaleSteps, payoutFactor),
    [martingaleBaseStake, martingaleMultiplier, martingaleSteps, payoutFactor]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Header Toolbar with Rolling Window Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#121916] border border-[#24322C]">
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <span className="text-xs font-bold text-[#9FB3AA] uppercase tracking-wider">
            Window:
          </span>
          <div className="flex items-center gap-1 bg-[#18221E] p-1 rounded-lg border border-[#2C3E36]">
            {([50, 100, 500, 1000] as RollingWindowSize[]).map((size) => (
              <button
                key={size}
                onClick={() => onWindowChange(size)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md transition-colors cursor-pointer ${
                  windowSize === size
                    ? 'bg-[#0F5C45] text-white'
                    : 'text-[#9FB3AA] hover:text-white hover:bg-[#24322C]'
                }`}
              >
                {size}T
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
          {hottestDigit && (
            <div className="flex items-center gap-1.5 text-[#6EE7B7] bg-[#0F5C45]/35 border border-[#34D399]/30 px-2.5 py-1 rounded-lg font-bold tabular-nums">
              <Flame className="w-3.5 h-3.5" />
              <span>
                Hot: {hottestDigit.digit} ({hottestDigit.frequency}%)
              </span>
            </div>
          )}
          {coldestDigit && (
            <div className="flex items-center gap-1.5 text-[#FFB56B] bg-[#F28C28]/15 border border-[#F28C28]/40 px-2.5 py-1 rounded-lg font-bold tabular-nums">
              <Snowflake className="w-3.5 h-3.5" />
              <span>
                Cold: {coldestDigit.digit} ({coldestDigit.frequency}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Digit Frequency Heatmap & Bar Chart (5x2 on mobile, 10x1 on sm+) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#24322C]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-[#34D399]" />
              <span>Digit Frequency Distribution (0–9)</span>
            </h3>
            <p className="text-[11px] text-[#9FB3AA]">
              10.0% baseline · Tap any digit below to select it for trading
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#9FB3AA]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#168564] inline-block" />
              <span>&ge;12% Hot</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F28C28] inline-block" />
              <span>&le;8% Cold</span>
            </span>
          </div>
        </div>

        <div className="relative pt-3 pb-1">
          {/* 10% Baseline line on desktop 10-col layout */}
          <div
            className="hidden sm:flex absolute left-0 right-0 border-b border-dashed border-[#34D399]/40 z-10 items-center justify-end pr-1 pointer-events-none"
            style={{ bottom: '76px' }}
          >
            <span className="text-[10px] font-mono font-bold text-[#6EE7B7] bg-[#121916] px-1.5 rounded -translate-y-2.5">
              10.0% Mean
            </span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-x-2 gap-y-4 sm:gap-2 items-end">
            {digitStats.map((stat) => {
              const barHeightPct = Math.min(100, Math.max(10, (stat.frequency / 22) * 100));
              const isSelected = stat.digit === selectedDigit;

              let barColor = 'bg-[#4B5F57] group-hover:bg-[#647D73]';
              if (stat.isHot) barColor = 'bg-[#168564] group-hover:bg-[#1E9E78]';
              else if (stat.isCold) barColor = 'bg-[#F28C28] group-hover:bg-[#FF9E3D]';

              return (
                <button
                  key={stat.digit}
                  onClick={() => setSelectedDigit(stat.digit)}
                  aria-label={`Select digit ${stat.digit} (${stat.frequency}% frequency${stat.isHot ? ', hot' : stat.isCold ? ', cold' : ''}${stat.currentStreak >= 18 ? ', drought alert' : ''})`}
                  className={`flex flex-col items-center justify-end group cursor-pointer focus:outline-hidden transition-transform ${
                    isSelected ? 'scale-[1.03]' : ''
                  }`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold mb-1 tabular-nums ${
                      isSelected
                        ? 'text-white'
                        : stat.isHot
                        ? 'text-[#34D399]'
                        : stat.isCold
                        ? 'text-[#FFB56B]'
                        : 'text-[#B8C7C0]'
                    }`}
                  >
                    {stat.frequency}%
                  </span>

                  <div className="w-full bg-[#18221E] border border-[#24322C] rounded-t-md p-0.5 flex flex-col justify-end h-24 sm:h-32">
                    <div
                      className={`w-full rounded-t-xs transition-all duration-300 ${barColor} ${
                        isSelected ? 'ring-2 ring-[#F28C28] ring-offset-1 ring-offset-[#121916]' : ''
                      }`}
                      style={{ height: `${barHeightPct}%` }}
                    />
                  </div>

                  <div
                    className={`mt-1.5 w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs sm:text-sm font-extrabold transition-all ${
                      isSelected
                        ? 'bg-[#0F5C45] text-white ring-2 ring-[#F28C28]'
                        : 'bg-[#18221E] text-white border border-[#2C3E36] group-hover:border-[#34D399]/50'
                    }`}
                  >
                    {stat.digit}
                  </div>

                  {stat.currentStreak >= 18 ? (
                    <span className="text-[8px] font-black font-mono text-[#0B100E] bg-[#F28C28] px-1.5 py-0.2 rounded mt-1 animate-pulse whitespace-nowrap">
                      MATCH
                    </span>
                  ) : stat.isCold && stat.frequency <= 6.5 ? (
                    <span className="text-[8px] font-black font-mono text-white bg-[#0F5C45] border border-[#34D399]/40 px-1.5 py-0.2 rounded mt-1 whitespace-nowrap">
                      DIFFER
                    </span>
                  ) : (
                    <span
                      className={`text-[9px] font-mono font-semibold mt-1 tabular-nums ${
                        stat.deviation > 0
                          ? 'text-[#34D399]'
                          : stat.deviation < 0
                          ? 'text-[#FFB56B]'
                          : 'text-[#8DA399]'
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
      <div className="p-4 rounded-2xl bg-[#121916] border border-[#24322C]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Digit Drought & Absence Streaks
            </h4>
            <span className="text-[10px] text-[#9FB3AA] font-mono">
              (Ticks since last seen)
            </span>
          </div>
          <span className="text-[10px] text-[#FFB56B] font-mono font-bold bg-[#F28C28]/15 px-2 py-0.5 rounded border border-[#F28C28]/35">
            Alert: 18+ Ticks
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
                className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                  stat.digit === selectedDigit
                    ? 'border-[#34D399] bg-[#0F5C45]/30'
                    : isHighDrought
                    ? 'border-[#F28C28] bg-[#F28C28]/15 animate-pulse'
                    : 'border-[#24322C] bg-[#18221E] hover:border-[#34D399]/50'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-1 tabular-nums">
                  <span className="font-extrabold text-white">{stat.digit}</span>
                  <span
                    className={`font-bold ${
                      isHighDrought ? 'text-[#FFB56B]' : 'text-[#B8C7C0]'
                    }`}
                  >
                    {stat.currentStreak}t
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#0E1512] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      isHighDrought
                        ? 'bg-[#F28C28]'
                        : stat.currentStreak >= 10
                        ? 'bg-[#168564]'
                        : 'bg-[#5A7068]'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[9px] text-[#8DA399] font-mono mt-1 tabular-nums">
                  Max {stat.maxStreak}t
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Tactical Signals & Pattern Scanner Feed */}
      <div className="p-4 rounded-2xl bg-[#121916] border border-[#24322C]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#F28C28]" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Real-Time Pattern Scanner
            </h4>
          </div>
          <span className="text-[10px] text-[#9FB3AA] font-mono">
            Live X2X · Twin · Drought Detection
          </span>
        </div>

        {patterns.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#18221E] border border-[#24322C] text-center text-xs text-[#9FB3AA] font-mono">
            Scanning incoming ticks for X2X reversals, twin pairs, and statistical droughts...
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {patterns.slice(0, 4).map((pattern) => (
              <div
                key={pattern.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#18221E] border border-[#24322C] hover:border-[#34D399]/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-extrabold shrink-0 ${
                      pattern.type === 'X2X'
                        ? 'bg-[#0F5C45] text-white border border-[#34D399]/40'
                        : pattern.type === 'TWIN'
                        ? 'bg-[#0F5C45]/35 text-[#6EE7B7] border border-[#34D399]/35'
                        : 'bg-[#F28C28]/15 text-[#FFB56B] border border-[#F28C28]/40'
                    }`}
                  >
                    {pattern.type === 'X2X' ? 'X2X' : pattern.type === 'TWIN' ? '2X' : 'DR'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {pattern.title}
                    </div>
                    <div className="text-[11px] text-[#9FB3AA] truncate">
                      {pattern.description}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-extrabold text-[#34D399] tabular-nums">
                    {pattern.confidence}% Edge
                  </div>
                  <div className="text-[10px] text-[#8DA399] font-mono tabular-nums">
                    {new Date(pattern.timestamp * 1000).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Contract Proposal Preview (Match / Differ Execution) */}
      <div
        id="order-execution-card"
        className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#1E8766]/60"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#34D399]" />
              <span>Order Form & Live Payout Quote</span>
            </h3>
            <p className="text-[11px] text-[#9FB3AA]">
              Live odds streamed from Deriv proposal engine
            </p>
          </div>
          <button
            onClick={() => setShowMartingale(!showMartingale)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#18221E] hover:bg-[#1E2B26] text-[#6EE7B7] border border-[#2C3E36] transition-colors cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5 text-[#F28C28]" />
            <span>Money Management</span>
          </button>
        </div>

        {/* Contract Type, Target Digit & Stake */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1.5">
              Contract Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 bg-[#18221E] p-1 rounded-xl border border-[#2C3E36]">
              <button
                onClick={() => setContractType('DIGITMATCH')}
                className={`py-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
                  contractType === 'DIGITMATCH'
                    ? 'bg-[#0F5C45] text-white'
                    : 'text-[#9FB3AA] hover:text-white'
                }`}
              >
                DIGIT MATCH
              </button>
              <button
                onClick={() => setContractType('DIGITDIFF')}
                className={`py-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
                  contractType === 'DIGITDIFF'
                    ? 'bg-[#F28C28] text-[#0B100E]'
                    : 'text-[#9FB3AA] hover:text-white'
                }`}
              >
                DIGIT DIFFER
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1.5">
              Target Digit: <span className="text-[#34D399] font-mono font-extrabold">{selectedDigit}</span>
            </label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 bg-[#18221E] p-1.5 rounded-xl border border-[#2C3E36]">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  aria-label={`Set target digit to ${d}${selectedDigit === d ? ' (selected)' : ''}`}
                  className={`h-8 rounded-lg font-mono text-xs font-extrabold transition-colors cursor-pointer ${
                    selectedDigit === d
                      ? 'bg-[#0F5C45] text-white ring-1 ring-[#F28C28]'
                      : 'text-[#EBF2EE] hover:bg-[#243E2C]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1.5">
              Stake ({currency})
            </label>
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <input
                  type="number"
                  min="0.35"
                  step="1"
                  value={stake}
                  onChange={(e) => setStake(Math.max(0.35, parseFloat(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] font-mono text-sm font-bold text-white focus:outline-hidden focus:border-[#34D399]"
                />
              </div>
              <div className="flex gap-1 shrink-0">
                {[5, 10, 25].map((val) => (
                  <button
                    key={val}
                    onClick={() => setStake(val)}
                    className={`px-2.5 py-2 rounded-lg text-[11px] font-mono font-bold cursor-pointer border ${
                      stake === val
                        ? 'bg-[#0F5C45] text-white border-[#34D399]/60'
                        : 'bg-[#18221E] hover:bg-[#24322C] text-[#EBF2EE] border-[#2C3E36]'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Proposal Pricing Card */}
        <div className="p-4 rounded-xl bg-[#18221E] border border-[#2C3E36] mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] text-[#9FB3AA] uppercase font-mono font-semibold">
                Potential Payout
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-[#34D399] tabular-nums">
                {activeProposal ? `${currency} ${activeProposal.payout.toFixed(2)}` : '---'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#9FB3AA] uppercase font-mono font-semibold">
                Net Profit
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-white tabular-nums">
                {activeProposal
                  ? `${currency} ${(activeProposal.payout - activeProposal.ask_price).toFixed(2)}`
                  : '---'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#9FB3AA] uppercase font-mono font-semibold">
                Return
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-[#F28C28] tabular-nums">
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
              <div className="text-[10px] text-[#9FB3AA] uppercase font-mono font-semibold">
                Confidence Edge
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-[#34D399] tabular-nums">
                {confidence.score}%
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#2C3E36] text-xs text-[#9FB3AA] font-mono flex flex-wrap items-center justify-between gap-2">
            <span>
              Rule: Last digit must {contractType === 'DIGITMATCH' ? 'MATCH' : 'DIFFER FROM'}{' '}
              <strong className="text-white">{selectedDigit}</strong>
            </span>
            <span>Duration: 1 Tick</span>
          </div>
        </div>

        {/* Order Execution Trigger Button */}
        <button
          disabled={!activeProposal || proposalLoading || (activeProposal.ask_price || 0) <= 0}
          onClick={() => {
            if (activeProposal && activeProposal.ask_price > 0) {
              onInitiateOrder(activeProposal, contractType, selectedDigit);
            }
          }}
          className="w-full py-3.5 rounded-xl bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>
            {proposalLoading
              ? 'Fetching Live Quote...'
              : activeProposal && activeProposal.ask_price <= 0
              ? 'Invalid Quote - Retry'
              : `Review & Place ${contractType} (Digit ${selectedDigit})`}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 6. Martingale Calculator Drawer */}
      {showMartingale && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#121916] border border-[#24322C] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#24322C]">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#34D399]" />
              <h4 className="text-sm font-bold text-white">
                Martingale & Money Management Ladder
              </h4>
            </div>
            <button
              onClick={() => setShowMartingale(false)}
              className="text-xs text-[#9FB3AA] hover:text-white font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-[#9FB3AA] font-mono font-semibold">
                Base Stake ({currency})
              </label>
              <input
                type="number"
                value={martingaleBaseStake}
                onChange={(e) => setMartingaleBaseStake(Math.max(1, parseFloat(e.target.value) || 1))}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#18221E] border border-[#2C3E36] font-mono text-xs font-bold text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#9FB3AA] font-mono font-semibold">
                Multiplier Factor
              </label>
              <input
                type="number"
                step="0.1"
                value={martingaleMultiplier}
                onChange={(e) =>
                  setMartingaleMultiplier(Math.max(1.1, parseFloat(e.target.value) || 2))
                }
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#18221E] border border-[#2C3E36] font-mono text-xs font-bold text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#9FB3AA] font-mono font-semibold">
                Max Rounds
              </label>
              <input
                type="number"
                min="3"
                max="10"
                value={martingaleSteps}
                onChange={(e) =>
                  setMartingaleSteps(Math.min(10, Math.max(3, parseInt(e.target.value, 10) || 5)))
                }
                className="w-full mt-1 px-3 py-2 rounded-lg bg-[#18221E] border border-[#2C3E36] font-mono text-xs font-bold text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-[#24322C] text-[#9FB3AA]">
                  <th className="py-2 pr-2">Step</th>
                  <th className="py-2 pr-2">Stake</th>
                  <th className="py-2 pr-2">Cum. Risk</th>
                  <th className="py-2 pr-2">Payout</th>
                  <th className="py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#24322C]">
                {martingaleLadder.map((step) => (
                  <tr key={step.step} className="hover:bg-[#18221E]">
                    <td className="py-2 pr-2 font-bold text-white">#{step.step}</td>
                    <td className="py-2 pr-2 text-[#EBF2EE]">{step.stake.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-red-400 font-semibold">
                      {step.cumulativeStake.toFixed(2)}
                    </td>
                    <td className="py-2 pr-2 text-[#34D399] font-semibold">
                      {step.payoutOnWin.toFixed(2)}
                    </td>
                    <td
                      className={`py-2 text-right font-bold ${
                        step.netProfitOnWin >= 0 ? 'text-[#34D399]' : 'text-red-400'
                      }`}
                    >
                      {step.netProfitOnWin.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-xl bg-[#F28C28]/12 border border-[#F28C28]/40 text-[11px] text-[#FFB56B] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#F28C28] shrink-0 mt-0.5" />
            <span>
              <strong className="text-white">Warning:</strong> Martingale staking exponentially increases risk exposure during losing streaks.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
