import { ArrowRight, ChevronDown, ChevronUp, HelpCircle, Lightbulb, Lock, Unlock, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { DigitStat, PatternDetection, TickData, TradeEntrySignal } from '../types/deriv';
import { generateDigitEntrySignal, generateMultiplierEntrySignal } from '../utils/entrySignals';

interface TradeEntryRadarProps {
  digitStats: DigitStat[];
  ticks: TickData[];
  patterns: PatternDetection[];
  latestTick: TickData | null;
  activeTab: 'digits' | 'multipliers';
  onApplySignal: (signal: TradeEntrySignal) => void;
}

export const TradeEntryRadar: React.FC<TradeEntryRadarProps> = ({
  digitStats,
  ticks,
  patterns,
  latestTick,
  activeTab,
  onApplySignal,
}) => {
  const [signalMode, setSignalMode] = useState<'digits' | 'multiplier'>(
    activeTab === 'digits' ? 'digits' : 'multiplier'
  );
  const [showGuide, setShowGuide] = useState(false);
  const [frozenSignal, setFrozenSignal] = useState<TradeEntrySignal | null>(null);

  const digitSignal = generateDigitEntrySignal(digitStats, ticks, patterns);
  const multiplierSignal = generateMultiplierEntrySignal(ticks, latestTick);

  const liveSignal = signalMode === 'digits' ? digitSignal : multiplierSignal;
  const activeSignal = frozenSignal || liveSignal;
  const isStrong = activeSignal.status === 'STRONG_ENTRY';
  const isFavorable = activeSignal.status === 'FAVORABLE_SETUP';

  return (
    <div className="mb-5 sm:mb-6 rounded-2xl bg-[#121916] text-white border border-[#24322C] overflow-hidden relative">
      {/* Top Banner with Mode Selector, Freeze & Status Beacon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-b border-[#1E8766]/40 bg-[#0F5C45]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isStrong
                ? 'bg-[#F28C28] animate-ping'
                : isFavorable
                ? 'bg-[#F28C28]'
                : 'bg-white/70'
            }`}
          />
          <span className="text-[11px] sm:text-xs font-mono font-bold tracking-wider uppercase text-white truncate">
            {isStrong
              ? 'Prime Entry Opportunity Detected'
              : isFavorable
              ? 'Favorable Setup In Progress'
              : 'Scanning For High-Probability Edge'}
          </span>
        </div>

        {/* Mode Tabs, Freeze & Strategy Guide */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-[#093A2B] p-0.5 rounded-lg border border-white/15 text-[11px] sm:text-xs font-mono">
            <button
              onClick={() => {
                setSignalMode('digits');
                setFrozenSignal(null);
              }}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                signalMode === 'digits'
                  ? 'bg-white text-[#0B100E] font-extrabold'
                  : 'text-[#D7E6DF] hover:text-white'
              }`}
            >
              Digit Radar
            </button>
            <button
              onClick={() => {
                setSignalMode('multiplier');
                setFrozenSignal(null);
              }}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                signalMode === 'multiplier'
                  ? 'bg-white text-[#0B100E] font-extrabold'
                  : 'text-[#D7E6DF] hover:text-white'
              }`}
            >
              Multiplier Radar
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFrozenSignal((prev) => (prev ? null : liveSignal))}
            title={
              frozenSignal
                ? 'Resume live probability updates'
                : 'Freeze this setup so it stops changing while you trade'
            }
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
              frozenSignal
                ? 'bg-[#F28C28] border-[#F28C28] text-[#0B100E] font-extrabold'
                : 'bg-[#093A2B] hover:bg-[#072F23] text-white border-white/20 font-semibold'
            }`}
          >
            {frozenSignal ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{frozenSignal ? 'Locked' : 'Freeze Setup'}</span>
          </button>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#093A2B] hover:bg-[#072F23] text-white text-xs font-semibold border border-white/20 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#F28C28]" />
            <span>Rules</span>
            {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main Signal Card Content */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {activeSignal.headline}
              </span>
              <span className="text-[11px] font-mono font-bold uppercase text-[#FFB56B]">
                · {activeSignal.riskLevel} Risk
              </span>
            </div>

            <p className="text-xs text-[#B8C7C0] leading-relaxed max-w-2xl">
              {activeSignal.rationale}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#9FB3AA] pt-0.5">
              <span>
                Trigger: <strong className="text-white">{activeSignal.triggerRule}</strong>
              </span>
              <span className="hidden sm:inline text-[#4B5F57]">·</span>
              <span>
                Target: <strong className="text-[#F28C28]">{activeSignal.recommendedContract}</strong>
              </span>
              <span className="hidden sm:inline text-[#4B5F57]">·</span>
              <span>
                Payout: <strong className="text-[#34D399]">{activeSignal.expectedPayoutMultiplier}</strong>
              </span>
            </div>
          </div>

          {/* Confidence Score & 1-Click Setup Action (stacks cleanly on mobile) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 shrink-0 bg-[#18221E] border border-[#2C3E36] p-3.5 rounded-xl">
            <div className="flex sm:block items-center justify-between sm:text-center sm:pr-4 sm:border-r border-[#2C3E36]">
              <div className="text-[10px] font-mono font-bold text-[#9FB3AA] uppercase">
                Probability Edge
              </div>
              <div className="flex items-baseline gap-2 sm:block">
                <div
                  className={`text-2xl font-black font-mono tabular-nums ${
                    activeSignal.confidenceScore >= 85
                      ? 'text-[#34D399]'
                      : activeSignal.confidenceScore >= 70
                      ? 'text-[#F28C28]'
                      : 'text-white'
                  }`}
                >
                  {activeSignal.confidenceScore}%
                </div>
                <div className="text-[10px] text-[#9FB3AA] font-mono">
                  {isStrong ? 'High Edge' : isFavorable ? 'Moderate' : 'Neutral'}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setFrozenSignal(activeSignal);
                onApplySignal(activeSignal);
              }}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap active:scale-[0.99]"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>Use This Trade Setup</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Beginner-Friendly Strategy Guide */}
      {showGuide && (
        <div className="px-4 sm:px-5 pb-5 pt-3.5 border-t border-[#24322C] bg-[#0E1512] text-xs">
          <div className="text-white font-bold mb-2.5 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[#F28C28]" />
            <span>How to Time Your Entries (3-Rule Playbook)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
              <div className="font-bold text-[#34D399] font-mono mb-1">
                Rule 1: Safe Differ (90%+ Win Rate)
              </div>
              <p className="text-[11px] leading-relaxed text-[#B8C7C0]">
                When a digit drops below 6.5% and hasn't appeared for 6+ ticks, pick{' '}
                <strong className="text-white">DIGIT DIFFER</strong> against it. You win on 9 of 10 digits.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
              <div className="font-bold text-[#FFB56B] font-mono mb-1">
                Rule 2: Drought Match (9.2x Payout)
              </div>
              <p className="text-[11px] leading-relaxed text-[#B8C7C0]">
                When a digit misses 18+ ticks, click <strong className="text-white">Freeze Setup</strong> and stake small on{' '}
                <strong className="text-white">DIGIT MATCH</strong> for mean-reversion payout.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
              <div className="font-bold text-[#34D399] font-mono mb-1">
                Rule 3: Safe Multiplier Buffer
              </div>
              <p className="text-[11px] leading-relaxed text-[#B8C7C0]">
                Use <strong className="text-white">20x–50x</strong> on directional moves for a wide 2%–5% stop-out buffer instead of 2000x.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
