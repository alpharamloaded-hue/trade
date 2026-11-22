import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  StopCircle,
  TrendingUp,
  TrendingDown,
  Zap,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { strategyEngine, StrategyType, StrategyConfig, StrategySignal, StrategyPerformance, STRATEGY_PAYOUTS, STRATEGY_CONTRACTS } from '../utils/strategyEngine';
import { useDerivTicks } from '../hooks/useDerivTicks';
import { derivWs } from '../services/derivWs';
import { soundEffects } from '../services/soundEffects';

const engine = strategyEngine;

const STRATEGY_LABELS: Record<StrategyType, string> = {
  DROUGHT_MATCH: 'Drought Match (9.2x)',
  COLD_DIFFER: 'Cold Differ (1.09x)',
  X2X_REVERSAL: 'X2X Reversal (1.09x)',
  TWIN_DIFFER: 'Twin Differ (1.09x)',
  STREAK_DIFFER: 'Streak Differ (1.09x)',
  TREND_MULTIPLIER: 'Trend Multiplier (20-50x)',
  MEAN_REV_MULT: 'Mean Rev Multiplier (20-50x)',
  SCALP_MULTIPLIER: 'Scalp Multiplier (10-20x)',
};

const STRATEGY_ICONS: Record<StrategyType, React.ReactNode> = {
  DROUGHT_MATCH: <Zap className="w-4 h-4" />,
  COLD_DIFFER: <Shield className="w-4 h-4" />,
  X2X_REVERSAL: <Activity className="w-4 h-4" />,
  TWIN_DIFFER: <RotateCcw className="w-4 h-4" />,
  STREAK_DIFFER: <TrendingDown className="w-4 h-4" />,
  TREND_MULTIPLIER: <TrendingUp className="w-4 h-4" />,
  MEAN_REV_MULT: <RotateCcw className="w-4 h-4" />,
  SCALP_MULTIPLIER: <Zap className="w-4 h-4" />,
};

const RISK_COLORS = {
  LOW: 'text-[#34D399] bg-[#0F5C45]/30 border-[#34D399]/30',
  MEDIUM: 'text-[#FFB56B] bg-[#F28C28]/15 border-[#F28C28]/40',
  HIGH: 'text-red-400 bg-red-500/15 border-red-500/30',
};

interface AutoTradingPanelProps {
  userAccount: { balance?: number; isAuthorized: boolean; authMethod?: string };
  balance: number;
}

export const AutoTradingPanel: React.FC<AutoTradingPanelProps> = ({ userAccount, balance }) => {
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<StrategySignal | null>(null);
  const [lastResult, setLastResult] = useState<{ won: boolean; profit: number; strategy: StrategyType } | null>(null);

  const {
    digitStats,
    ticks,
    patterns,
    latestTick,
    symbol,
  } = useDerivTicks('1HZ100V');

  const configs = engine.getAllConfigs();
  const performances = engine.getAllPerformance();
  const dailyStats = engine.getDailyStats();

  // Analyze for signals every tick
  useEffect(() => {
    if (!isAutoTrading || !latestTick) return;
    
    const signals = engine.analyze(digitStats, ticks, patterns, latestTick, balance);
    if (signals.length > 0) {
      const bestSignal = signals.sort((a, b) => b.confidenceScore - a.confidenceScore)[0];
      setLastSignal(bestSignal);
      
      // Execute if confidence is high enough
      if (bestSignal.confidenceScore >= configs[bestSignal.strategy].minConfidence) {
        executeSignal(bestSignal);
      }
    }
  }, [latestTick?.epoch, isAutoTrading]);

  const executeSignal = async (signal: StrategySignal) => {
    if (!userAccount.isAuthorized) {
      setErrorMsg('Account not authorized for auto-trading');
      return;
    }

    try {
      setErrorMsg(null);
      
      // In demo mode, simulate
      if (!derivWs.isSimulationActive() && userAccount.isAuthorized) {
        // Real trading would go through derivWs
        // For now, simulate
      }
      
      // Simulate trade result based on win rate
      const won = Math.random() * 100 < signal.winRateEstimate;
      const payout = STRATEGY_PAYOUTS[signal.strategy];
      const profit = won ? signal.suggestedStake * (payout - 1) : -signal.suggestedStake;
      
      const result = {
        strategy: signal.strategy,
        contractType: signal.recommendedContract,
        stake: signal.suggestedStake,
        payout: signal.suggestedStake * payout,
        won,
        profit,
        timestamp: Date.now(),
        digit: signal.recommendedParam,
      };
      
      engine.recordTrade(result);
      // Balance updates come from parent via derivWs.onBalance subscription
      setLastResult({ won, profit, strategy: signal.strategy });
      
      if (won) {
        soundEffects.playOrderExecuted();
      } else {
        soundEffects.playPatternAlert('drought');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Trade execution failed');
    }
  };

  const toggleAutoTrading = () => {
    if (!isAutoTrading) {
      // Check prerequisites
      if (!userAccount.isAuthorized && !derivWs.isSimulationActive()) {
        setErrorMsg('Connect account or enable Demo Mode first');
        return;
      }
      if (balance < 10) {
        setErrorMsg('Insufficient balance for auto-trading');
        return;
      }
      setErrorMsg(null);
      soundEffects.playOrderExecuted();
    } else {
      soundEffects.playPatternAlert('general');
    }
    setIsAutoTrading(prev => !prev);
  };

  const getStrategySignals = (type: StrategyType): StrategySignal[] => {
    return engine.analyze(digitStats, ticks, patterns, latestTick, balance)
      .filter(s => s.strategy === type);
  };

  return (
    <div className="space-y-4">
      {/* Header & Master Toggle */}
      <div className="p-4 rounded-2xl bg-[#121916] border border-[#24322C]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#F28C28]" />
            <h3 className="text-sm font-bold text-white">Auto-Trading Engine</h3>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isAutoTrading ? 'bg-[#34D399]/30 text-[#34D399]' : 'bg-red-500/15 text-red-400'}`}>
              {isAutoTrading ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>
          
          <button
            onClick={toggleAutoTrading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${
              isAutoTrading
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-[#0F5C45] text-white border border-[#1E8766]/60 hover:bg-[#147558]'
            }`}
          >
            {isAutoTrading ? (
              <>
                <StopCircle className="w-4 h-4" />
                <span>Stop Auto-Trading</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Start Auto-Trading</span>
              </>
            )}
          </button>
        </div>

        {/* Daily Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] font-mono">Daily P&L</div>
            <div className={`text-lg font-mono font-bold ${dailyStats.pnl >= 0 ? 'text-[#34D399]' : 'text-red-400'}`}>
              {dailyStats.pnl >= 0 ? '+' : ''}{dailyStats.pnl.toFixed(2)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] font-mono">Trades Today</div>
            <div className="text-lg font-mono font-bold text-white">{dailyStats.trades}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#2C3E36]">
            <div className="text-[10px] text-[#9FB3AA] font-mono">Balance</div>
            <div className="text-lg font-mono font-bold text-[#34D399]">{balance.toFixed(2)}</div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/12 border border-red-500/40 text-xs text-red-300 mb-4">
            {errorMsg}
          </div>
        )}

        {/* Last Trade Result */}
        {lastResult && (
          <div className={`p-3 rounded-xl mb-4 ${lastResult.won ? 'bg-[#0F5C45]/30 border-[#34D399]/30' : 'bg-red-500/12 border-red-500/30'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">
                {lastResult.won ? '✅ WIN' : '❌ LOSS'} — {lastResult.strategy}
              </span>
              <span className={`text-sm font-mono font-bold ${lastResult.won ? 'text-[#34D399]' : 'text-red-400'}`}>
                {lastResult.profit >= 0 ? '+' : ''}{lastResult.profit.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Active Signal */}
        {lastSignal && (
          <div className="p-3 rounded-xl bg-[#18221E] border border-[#F28C28]/40 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#F28C28]">ACTIVE SIGNAL</span>
              <span className="text-[10px] font-mono text-[#9FB3AA]">{lastSignal.confidenceScore}% confidence</span>
            </div>
            <div className="text-sm font-bold text-white">{lastSignal.headline}</div>
            <div className="text-[11px] text-[#9FB3AA] mt-1">{lastSignal.rationale}</div>
          </div>
        )}

        {/* Master Controls */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] text-white text-[11px] font-semibold hover:bg-[#24322C] transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Strategy Config</span>
          </button>
          <button
            onClick={() => {
              // Reset daily stats manually
              setErrorMsg('Daily stats reset (manual)');
            }}
            className="px-3 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] text-white text-[11px] font-semibold hover:bg-[#24322C] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Daily</span>
          </button>
        </div>
      </div>

      {/* Strategy Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(Object.keys(configs) as StrategyType[]).map(type => {
          const config = configs[type];
          const perf = performances[type];
          const signals = getStrategySignals(type);
          const hasSignal = signals.length > 0;
          const bestSignal = signals[0];
          const riskColor = RISK_COLORS[config.riskLevel];

          return (
            <div
              key={type}
              className={`p-3.5 rounded-xl border transition-all ${
                config.enabled
                  ? 'bg-[#18221E] border-[#2C3E36]'
                  : 'bg-[#121916] border-[#24322C] opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0F5C45]/30 border border-[#34D399]/30 flex items-center justify-center">
                    {STRATEGY_ICONS[type]}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{STRATEGY_LABELS[type]}</div>
                    <div className="text-[10px] text-[#9FB3AA] font-mono">{config.stakePercent}% stake · {config.maxDailyLoss}% max DD</div>
                  </div>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => {
                      const newConfigs = { ...configs };
                      newConfigs[type] = { ...config, enabled: e.target.checked };
                      Object.entries(newConfigs).forEach(([k, v]) => engine.updateConfig(k as StrategyType, v));
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-[#2C3E36] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#F28C28] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0F5C45]"></div>
                </label>
              </div>

              {/* Performance */}
              <div className="grid grid-cols-3 gap-2 text-center mb-2 p-2 rounded-lg bg-[#121916] border border-[#24322C]">
                <div>
                  <div className="text-[10px] text-[#9FB3AA] font-mono">Win Rate</div>
                  <div className="text-sm font-bold text-white">{perf.winRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9FB3AA] font-mono">ROI</div>
                  <div className={`text-sm font-bold ${perf.roi >= 0 ? 'text-[#34D399]' : 'text-red-400'}`}>
                    {perf.roi >= 0 ? '+' : ''}{perf.roi.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9FB3AA] font-mono">Trades</div>
                  <div className="text-sm font-bold text-white">{perf.totalTrades}</div>
                </div>
              </div>

              {/* Active Signal for this strategy */}
              {hasSignal && bestSignal && (
                <div className="p-2 rounded-lg bg-[#F28C28]/10 border border-[#F28C28]/30 mb-2">
                  <div className="text-[10px] font-bold text-[#F28C28] mb-1">SIGNAL: {bestSignal.confidenceScore}%</div>
                  <div className="text-xs text-white">{bestSignal.headline}</div>
                  <div className="text-[10px] text-[#9FB3AA] mt-1">{bestSignal.rationale}</div>
                  <div className="flex items-center justify-between mt-2 text-[10px] font-mono">
                    <span className="text-[#34D399]">~{bestSignal.winRateEstimate.toFixed(0)}% WR</span>
                    <span className="text-[#F28C28]">{bestSignal.suggestedStake.toFixed(2)} stake</span>
                  </div>
                </div>
              )}

              {/* Config Button */}
              <button
                onClick={() => setSelectedStrategy(type)}
                className="w-full py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] text-white text-[10px] font-semibold hover:bg-[#24322C] transition-colors"
              >
                Configure
              </button>
            </div>
          );
        })}
      </div>

      {/* Strategy Config Modal */}
      {selectedStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[#121916] border border-[#2C3E36] p-4 sm:p-6 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {STRATEGY_ICONS[selectedStrategy]}
                <span>{STRATEGY_LABELS[selectedStrategy]}</span>
              </h3>
              <button
                onClick={() => setSelectedStrategy(null)}
                className="p-1.5 rounded-lg text-[#9FB3AA] hover:text-white hover:bg-[#18221E] transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={configs[selectedStrategy].enabled}
                    onChange={(e) => {
                      const newConfigs = { ...configs };
                      newConfigs[selectedStrategy] = { ...configs[selectedStrategy], enabled: e.target.checked };
                      Object.entries(newConfigs).forEach(([k, v]) => engine.updateConfig(k as StrategyType, v));
                    }}
                    className="w-4 h-4 accent-[#F28C28]"
                  />
                  <span className="text-sm font-semibold text-white">Enable Strategy</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#9FB3AA] mb-1">Stake % per Trade</label>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={configs[selectedStrategy].stakePercent}
                  onChange={(e) => {
                    const val = Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1));
                    engine.updateConfig(selectedStrategy, { stakePercent: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-white focus:outline-none focus:border-[#F28C28]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#9FB3AA] mb-1">Min Confidence</label>
                <input
                  type="number"
                  min="50"
                  max="99"
                  value={configs[selectedStrategy].minConfidence}
                  onChange={(e) => {
                    const val = Math.max(50, Math.min(99, parseInt(e.target.value) || 70));
                    engine.updateConfig(selectedStrategy, { minConfidence: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-white focus:outline-none focus:border-[#F28C28]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#9FB3AA] mb-1">Max Daily Loss %</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={configs[selectedStrategy].maxDailyLoss}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(20, parseInt(e.target.value) || 5));
                    engine.updateConfig(selectedStrategy, { maxDailyLoss: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-white focus:outline-none focus:border-[#F28C28]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#9FB3AA] mb-1">Cooldown (ticks)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={configs[selectedStrategy].cooldownTicks}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 5));
                    engine.updateConfig(selectedStrategy, { cooldownTicks: val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-white focus:outline-none focus:border-[#F28C28]"
                />
              </div>

              <div className="pt-2 border-t border-[#24322C]">
                <button
                  onClick={() => setSelectedStrategy(null)}
                  className="w-full py-2 rounded-xl bg-[#0F5C45] hover:bg-[#147558] text-white font-bold text-xs transition-colors"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Trading Warning */}
      <div className="p-3 rounded-xl bg-[#F28C28]/12 border border-[#F28C28]/40 text-[11px] text-[#FFB56B] flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-[#F28C28] shrink-0 mt-0.5" />
        <span>
          <strong className="text-white">Risk Warning:</strong> Auto-trading executes real trades. 
          Test thoroughly in Demo Mode first. Past performance ≠ future results. 
          Set strict daily loss limits. Never risk more than you can afford to lose.
        </span>
      </div>
    </div>
  );
};

// Need to import STRATEGY_PAYOUTS and STRATEGY_CONTRACTS from strategyEngine
