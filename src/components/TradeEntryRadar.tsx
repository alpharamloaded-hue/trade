import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Compass, Flame, HelpCircle, Lightbulb, Radio, Shield, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
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

  // Generate current signals
  const digitSignal = generateDigitEntrySignal(digitStats, ticks, patterns);
  const multiplierSignal = generateMultiplierEntrySignal(ticks, latestTick);

  const activeSignal = signalMode === 'digits' ? digitSignal : multiplierSignal;
  const isStrong = activeSignal.status === 'STRONG_ENTRY';
  const isFavorable = activeSignal.status === 'FAVORABLE_SETUP';

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl overflow-hidden relative">
      {/* Subtle background beacon aura */}
      <div
        className={`absolute -left-20 -top-20 w-56 h-56 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-500 ${
          isStrong
            ? 'bg-emerald-500'
            : isFavorable
            ? 'bg-cyan-500'
            : 'bg-slate-600'
        }`}
      />

      {/* Top Banner with Mode Selector & Status Beacon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isStrong
                  ? 'bg-emerald-400 animate-ping'
                  : isFavorable
                  ? 'bg-cyan-400'
                  : 'bg-slate-500'
              }`}
            />
            <span
              className={`text-xs font-mono font-bold tracking-wider uppercase ${
                isStrong
                  ? 'text-emerald-400'
                  : isFavorable
                  ? 'text-cyan-400'
                  : 'text-slate-400'
              }`}
            >
              {isStrong
                ? '⚡ PRIME ENTRY OPPORTUNITY DETECTED'
                : isFavorable
                ? '🟡 FAVORABLE SETUP IN PROGRESS'
                : '⚪ SCANNING FOR HIGH-PROBABILITY EDGE'}
            </span>
          </div>
        </div>

        {/* Quick Signal Mode Tabs & Strategy Guide Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setSignalMode('digits')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                signalMode === 'digits'
                  ? 'bg-cyan-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Digit Radar
            </button>
            <button
              onClick={() => setSignalMode('multiplier')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                signalMode === 'multiplier'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Multiplier Radar
            </button>
          </div>

          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs border border-slate-800 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Strategy Rules</span>
            {showGuide ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Main Signal Card Content */}
      <div className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Actionable Signal Headline & Plain-English Rationale */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {activeSignal.headline}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  activeSignal.riskLevel === 'LOW'
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                    : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60'
                }`}
              >
                {activeSignal.riskLevel} Risk Profile
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              {activeSignal.rationale}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-1">
              <span>Trigger: <strong className="text-slate-200">{activeSignal.triggerRule}</strong></span>
              <span>·</span>
              <span>Target: <strong className="text-cyan-300 font-bold">{activeSignal.recommendedContract}</strong></span>
              <span>·</span>
              <span>Payout Potential: <strong className="text-emerald-400">{activeSignal.expectedPayoutMultiplier}</strong></span>
            </div>
          </div>

          {/* Confidence Score & 1-Click "Auto-Apply Setup" Action */}
          <div className="flex items-center gap-4 shrink-0 bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-xl">
            {/* Visual Probability Edge Meter */}
            <div className="text-center pr-3 border-r border-slate-800/80">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Probability Edge
              </div>
              <div
                className={`text-2xl font-black font-mono tabular-nums ${
                  activeSignal.confidenceScore >= 85
                    ? 'text-emerald-400'
                    : activeSignal.confidenceScore >= 70
                    ? 'text-cyan-400'
                    : 'text-slate-400'
                }`}
              >
                {activeSignal.confidenceScore}%
              </div>
              <div className="text-[9px] text-slate-500 font-mono">
                {isStrong ? 'High Edge' : isFavorable ? 'Moderate' : 'Neutral'}
              </div>
            </div>

            {/* Quick 1-Click Setup Action */}
            <button
              onClick={() => onApplySignal(activeSignal)}
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/60 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>Use This Trade Setup</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Beginner-Friendly Strategy Guide */}
      {showGuide && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-800/80 bg-slate-950/80 animate-in fade-in duration-200 text-xs">
          <div className="text-slate-200 font-bold mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span>How to Time Your Entries (Simple 3-Rule Playbook)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-400">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="font-bold text-cyan-300 font-mono mb-1">
                Rule 1: The Safe Differ Setup (90%+ Win Rate)
              </div>
              <p className="text-[11px] leading-relaxed">
                When a digit's frequency drops below 6.5% and it has not appeared for 6+ ticks, enter a <strong>DIGIT DIFFER</strong> against that digit. You win on 9 out of 10 digits for steady 9% returns.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="font-bold text-emerald-400 font-mono mb-1">
                Rule 2: The Drought Match Setup (9.2x High Payout)
              </div>
              <p className="text-[11px] leading-relaxed">
                When a digit has not appeared for 18+ ticks (Drought Alert), probability dictates mean reversion. A small stake ($1–$5) on <strong>DIGIT MATCH</strong> pays out 9.2x your money if it hits.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="font-bold text-amber-400 font-mono mb-1">
                Rule 3: Multiplier Safe Buffer Rule
              </div>
              <p className="text-[11px] leading-relaxed">
                Never use high multipliers (500x–2000x) in choppy markets. Use <strong>20x–50x</strong> on directional tick surges to maintain a wide 2%–5% liquidation buffer while collecting leveraged gains.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
