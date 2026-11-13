import { ArrowDownRight, ArrowUpRight, Clock, Hash, Layers, TrendingUp } from 'lucide-react';
import React, { useMemo } from 'react';
import { TickData } from '../types/deriv';
import { getSymbolMeta } from '../utils/symbols';

interface MarketStreamViewProps {
  symbol: string;
  latestTick: TickData | null;
  ticks: TickData[];
}

export const MarketStreamView: React.FC<MarketStreamViewProps> = ({
  symbol,
  latestTick,
  ticks,
}) => {
  const meta = getSymbolMeta(symbol);

  // Compute session stats from current ticks buffer
  const { minPrice, maxPrice, deltaPts, deltaPct, evenPct, oddPct, highPct, lowPct } = useMemo(() => {
    if (ticks.length === 0) {
      return {
        minPrice: 0,
        maxPrice: 0,
        deltaPts: 0,
        deltaPct: 0,
        evenPct: 50,
        oddPct: 50,
        highPct: 50,
        lowPct: 50,
      };
    }

    let min = Infinity;
    let max = -Infinity;
    let evenCount = 0;
    let highCount = 0;

    ticks.forEach((t) => {
      if (t.quote < min) min = t.quote;
      if (t.quote > max) max = t.quote;
      if (t.lastDigit % 2 === 0) evenCount++;
      if (t.lastDigit >= 5) highCount++;
    });

    const firstPrice = ticks[0].quote;
    const currentPrice = latestTick ? latestTick.quote : firstPrice;
    const deltaPts = currentPrice - firstPrice;
    const deltaPct = firstPrice > 0 ? (deltaPts / firstPrice) * 100 : 0;

    return {
      minPrice: min,
      maxPrice: max,
      deltaPts,
      deltaPct,
      evenPct: Number(((evenCount / ticks.length) * 100).toFixed(1)),
      oddPct: Number((((ticks.length - evenCount) / ticks.length) * 100).toFixed(1)),
      highPct: Number(((highCount / ticks.length) * 100).toFixed(1)),
      lowPct: Number((((ticks.length - highCount) / ticks.length) * 100).toFixed(1)),
    };
  }, [ticks, latestTick]);

  // Sparkline SVG generation for the recent 60 ticks
  const sparklineData = useMemo(() => {
    const recent = ticks.slice(-60);
    if (recent.length < 2) return null;

    const width = 460;
    const height = 110;
    const padding = 10;

    const prices = recent.map((t) => t.quote);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const points = recent.map((t, i) => {
      const x = padding + (i / (recent.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((t.quote - min) / range) * (height - 2 * padding);
      return { x, y, quote: t.quote, digit: t.lastDigit };
    });

    const pathD = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    const lastPoint = points[points.length - 1];
    const isUp = recent[recent.length - 1].quote >= recent[0].quote;

    return { points, pathD, areaD, lastPoint, isUp, width, height, min, max };
  }, [ticks]);

  // Recent 12 ticks for the visual tape
  const recentTape = useMemo(() => {
    return ticks.slice(-12).reverse();
  }, [ticks]);

  // Format price string and separate prefix from the last digit
  const formattedQuote = useMemo(() => {
    if (!latestTick) return { whole: '---', lastDigit: '-' };
    const str = latestTick.quote.toFixed(meta.decimals);
    const whole = str.slice(0, -1);
    const lastDigit = str.slice(-1);
    return { whole, lastDigit };
  }, [latestTick, meta.decimals]);

  return (
    <div className="space-y-4">
      {/* Primary Live Price & Digit Extraction Display */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800/80 p-5 shadow-xl relative overflow-hidden">
        {/* Subtle background glow based on direction */}
        <div
          className={`absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-300 ${
            latestTick?.direction === 'up'
              ? 'bg-emerald-500'
              : latestTick?.direction === 'down'
              ? 'bg-rose-500'
              : 'bg-cyan-500'
          }`}
        />

        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-slate-200">{meta.displayName}</span>
            <span>·</span>
            <span className="text-[11px] text-slate-400">1s Ticks</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Clock className="w-3 h-3 text-slate-500" />
            <span className="tabular-nums">
              {latestTick ? new Date(latestTick.epoch * 1000).toLocaleTimeString() : '--:--:--'}
            </span>
          </div>
        </div>

        {/* Large Hero Price Section */}
        <div className="flex items-end justify-between gap-4 my-2">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Live Index Spot
            </div>
            <div className="flex items-baseline font-mono tracking-tight">
              <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
                {formattedQuote.whole}
              </span>
              {/* Highlighted Last Digit - Core edge visual */}
              <span
                className={`text-4xl sm:text-5xl font-black tabular-nums transition-all duration-150 inline-block px-1 rounded-md ${
                  latestTick?.direction === 'up'
                    ? 'text-emerald-400 bg-emerald-950/60 shadow-lg shadow-emerald-500/20'
                    : latestTick?.direction === 'down'
                    ? 'text-rose-400 bg-rose-950/60 shadow-lg shadow-rose-500/20'
                    : 'text-cyan-400 bg-cyan-950/60'
                }`}
              >
                {formattedQuote.lastDigit}
              </span>
            </div>
          </div>

          {/* Direction & Net Session Move */}
          <div className="text-right">
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                deltaPts >= 0
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                  : 'bg-rose-950/60 text-rose-400 border border-rose-800/50'
              }`}
            >
              {deltaPts >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              <span className="tabular-nums">
                {deltaPts >= 0 ? '+' : ''}
                {deltaPts.toFixed(meta.decimals)} ({deltaPct.toFixed(2)}%)
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Last Digit: <strong className="text-white text-xs">{formattedQuote.lastDigit}</strong> ({Number(formattedQuote.lastDigit) % 2 === 0 ? 'EVEN' : 'ODD'}, {Number(formattedQuote.lastDigit) >= 5 ? 'HIGH' : 'LOW'})
            </div>
          </div>
        </div>

        {/* Real-time Tick Sparkline Chart */}
        <div className="mt-4 pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
            <span>Tick Price Trajectory (Last 60 Ticks)</span>
            {sparklineData && (
              <span className="tabular-nums text-slate-400">
                Range: {sparklineData.min.toFixed(meta.decimals)} - {sparklineData.max.toFixed(meta.decimals)}
              </span>
            )}
          </div>

          <div className="h-28 w-full bg-slate-950/60 rounded-xl border border-slate-800/60 p-1 relative flex items-center justify-center">
            {sparklineData ? (
              <svg
                viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="tickGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={sparklineData.isUp ? '#10b981' : '#f43f5e'}
                      stopOpacity="0.3"
                    />
                    <stop
                      offset="100%"
                      stopColor={sparklineData.isUp ? '#10b981' : '#f43f5e'}
                      stopOpacity="0.0"
                    />
                  </linearGradient>
                </defs>

                {/* Area under curve */}
                <path d={sparklineData.areaD} fill="url(#tickGradient)" />

                {/* Sparkline path */}
                <path
                  d={sparklineData.pathD}
                  fill="none"
                  stroke={sparklineData.isUp ? '#10b981' : '#f43f5e'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Live Head Point */}
                <circle
                  cx={sparklineData.lastPoint.x}
                  cy={sparklineData.lastPoint.y}
                  r="4"
                  fill="#ffffff"
                  stroke={sparklineData.isUp ? '#10b981' : '#f43f5e'}
                  strokeWidth="2"
                />
              </svg>
            ) : (
              <div className="text-xs text-slate-500 font-mono animate-pulse">
                Buffering tick stream...
              </div>
            )}
          </div>
        </div>

        {/* Recent Ticks Live Tape Strip */}
        <div className="mt-4 pt-3 border-t border-slate-800/60">
          <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>Tick Tape (Most Recent First)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Buffered: {ticks.length} / 1000
            </span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-6 gap-1.5">
            {recentTape.slice(0, 6).map((t, idx) => {
              const isEven = t.lastDigit % 2 === 0;
              const isHigh = t.lastDigit >= 5;
              return (
                <div
                  key={`${t.epoch}-${idx}`}
                  className={`p-1.5 rounded-lg border text-center transition-all ${
                    idx === 0
                      ? 'bg-slate-800/90 border-cyan-500/60 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800/60'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {t.quote.toFixed(meta.decimals)}
                  </div>
                  <div className="flex items-center justify-center gap-1 my-0.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                        isEven
                          ? 'bg-blue-950 text-blue-300 border border-blue-800/50'
                          : 'bg-purple-950 text-purple-300 border border-purple-800/50'
                      }`}
                    >
                      {t.lastDigit}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    {isEven ? 'E' : 'O'} · {isHigh ? 'H' : 'L'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real-Time Parity & Bias Breakdown Strip */}
      <div className="grid grid-cols-2 gap-3">
        {/* Even vs Odd Distribution */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
            <span>Parity Ratio</span>
            <span>{ticks.length} Ticks</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
            <span className="text-blue-400">EVEN {evenPct}%</span>
            <span className="text-purple-400">ODD {oddPct}%</span>
          </div>
          {/* Ratio bar */}
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${evenPct}%` }}
            />
            <div
              className="bg-purple-500 h-full transition-all duration-300"
              style={{ width: `${oddPct}%` }}
            />
          </div>
        </div>

        {/* High vs Low Distribution */}
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
            <span>High/Low Range</span>
            <span>0-4 vs 5-9</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
            <span className="text-teal-400">LOW (0-4) {lowPct}%</span>
            <span className="text-amber-400">HIGH (5-9) {highPct}%</span>
          </div>
          {/* Ratio bar */}
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="bg-teal-500 h-full transition-all duration-300"
              style={{ width: `${lowPct}%` }}
            />
            <div
              className="bg-amber-500 h-full transition-all duration-300"
              style={{ width: `${highPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
