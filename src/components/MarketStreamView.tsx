import { ArrowDownRight, ArrowUpRight, Clock, Layers } from 'lucide-react';
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

  const { deltaPts, deltaPct, evenPct, oddPct, highPct, lowPct } = useMemo(() => {
    if (ticks.length === 0) {
      return {
        deltaPts: 0,
        deltaPct: 0,
        evenPct: 50,
        oddPct: 50,
        highPct: 50,
        lowPct: 50,
      };
    }

    let evenCount = 0;
    let highCount = 0;

    ticks.forEach((t) => {
      if (t.lastDigit % 2 === 0) evenCount++;
      if (t.lastDigit >= 5) highCount++;
    });

    const firstPrice = ticks[0].quote;
    const currentPrice = latestTick ? latestTick.quote : firstPrice;
    const deltaPts = currentPrice - firstPrice;
    const deltaPct = firstPrice > 0 ? (deltaPts / firstPrice) * 100 : 0;

    return {
      deltaPts,
      deltaPct,
      evenPct: Number(((evenCount / ticks.length) * 100).toFixed(1)),
      oddPct: Number((((ticks.length - evenCount) / ticks.length) * 100).toFixed(1)),
      highPct: Number(((highCount / ticks.length) * 100).toFixed(1)),
      lowPct: Number((((ticks.length - highCount) / ticks.length) * 100).toFixed(1)),
    };
  }, [ticks, latestTick]);

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

  const recentTape = useMemo(() => {
    return ticks.slice(-12).reverse();
  }, [ticks]);

  const formattedQuote = useMemo(() => {
    if (!latestTick) return { whole: '---', lastDigit: '-' };
    const str = latestTick.quote.toFixed(meta.decimals);
    const whole = str.slice(0, -1);
    const lastDigit = str.slice(-1);
    return { whole, lastDigit };
  }, [latestTick, meta.decimals]);

  const strokeColor = sparklineData?.isUp ? '#34D399' : '#F28C28';

  return (
    <div className="space-y-4">
      {/* Primary Live Price & Digit Extraction Display */}
      <div className="rounded-2xl bg-[#121916] border border-[#24322C] p-4 sm:p-5 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-[#9FB3AA] mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono font-bold text-[#34D399] truncate">{meta.displayName}</span>
            <span>·</span>
            <span className="text-[11px] text-[#9FB3AA] shrink-0">Live Ticks</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] shrink-0">
            <Clock className="w-3 h-3 text-[#9FB3AA]" />
            <span className="tabular-nums text-[#EBF2EE]">
              {latestTick ? new Date(latestTick.epoch * 1000).toLocaleTimeString() : '--:--:--'}
            </span>
          </div>
        </div>

        {/* Large Hero Price Section (responsive wrap on small phones) */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 my-2">
          <div>
            <div className="text-[11px] font-bold text-[#9FB3AA] uppercase tracking-wider mb-1">
              Live Index Spot
            </div>
            <div className="flex items-baseline font-mono tracking-tight">
              <span className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                {formattedQuote.whole}
              </span>
              <span
                className={`text-3xl sm:text-5xl font-black tabular-nums transition-all duration-150 inline-block px-1.5 ml-0.5 rounded-lg ${
                  latestTick?.direction === 'up'
                    ? 'text-white bg-[#0F5C45] border border-[#34D399]/50'
                    : latestTick?.direction === 'down'
                    ? 'text-[#0B100E] bg-[#F28C28]'
                    : 'text-[#6EE7B7] bg-[#0F5C45]/40 border border-[#34D399]/30'
                }`}
              >
                {formattedQuote.lastDigit}
              </span>
            </div>
          </div>

          <div className="sm:text-right">
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                deltaPts >= 0
                  ? 'bg-[#0F5C45]/35 text-[#6EE7B7] border border-[#34D399]/30'
                  : 'bg-[#F28C28]/15 text-[#FFB56B] border border-[#F28C28]/40'
              }`}
            >
              {deltaPts >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span className="tabular-nums">
                {deltaPts >= 0 ? '+' : ''}
                {deltaPts.toFixed(meta.decimals)} ({deltaPct.toFixed(2)}%)
              </span>
            </div>
            <div className="text-[11px] text-[#9FB3AA] mt-1 font-mono">
              Last Digit: <strong className="text-white text-xs">{formattedQuote.lastDigit}</strong> (
              {Number(formattedQuote.lastDigit) % 2 === 0 ? 'EVEN' : 'ODD'},{' '}
              {Number(formattedQuote.lastDigit) >= 5 ? 'HIGH' : 'LOW'})
            </div>
          </div>
        </div>

        {/* Real-time Tick Sparkline Chart */}
        <div className="mt-4 pt-3 border-t border-[#24322C]">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#9FB3AA] font-mono mb-1.5">
            <span>Tick Price Trajectory (Last 60)</span>
            {sparklineData && (
              <span className="tabular-nums text-[#EBF2EE]">
                {sparklineData.min.toFixed(meta.decimals)} – {sparklineData.max.toFixed(meta.decimals)}
              </span>
            )}
          </div>

          <div className="h-28 w-full bg-[#18221E] rounded-xl border border-[#24322C] p-1.5 relative flex items-center justify-center">
            {sparklineData ? (
              <svg
                viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="tickGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <path d={sparklineData.areaD} fill="url(#tickGradient)" />
                <path
                  d={sparklineData.pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx={sparklineData.lastPoint.x}
                  cy={sparklineData.lastPoint.y}
                  r="4"
                  fill="#0B100E"
                  stroke={strokeColor}
                  strokeWidth="2.5"
                />
              </svg>
            ) : (
              <div className="text-xs text-[#9FB3AA] font-mono animate-pulse">
                Buffering tick stream...
              </div>
            )}
          </div>
        </div>

        {/* Recent Ticks Live Tape Strip (3 cols on mobile, 6 cols on sm+) */}
        <div className="mt-4 pt-3 border-t border-[#24322C]">
          <div className="text-[11px] font-semibold text-[#9FB3AA] mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#34D399]" />
              <span>Recent Tick Tape</span>
            </span>
            <span className="text-[10px] text-[#9FB3AA] font-mono">
              {ticks.length} / 1000
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {recentTape.slice(0, 6).map((t, idx) => {
              const isEven = t.lastDigit % 2 === 0;
              const isHigh = t.lastDigit >= 5;
              return (
                <div
                  key={`${t.epoch}-${idx}`}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    idx === 0
                      ? 'bg-[#0F5C45]/30 border-[#34D399]/60'
                      : 'bg-[#18221E] border-[#24322C]'
                  }`}
                >
                  <div className="text-[10px] text-[#9FB3AA] font-mono truncate tabular-nums">
                    {t.quote.toFixed(meta.decimals)}
                  </div>
                  <div className="flex items-center justify-center my-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-extrabold ${
                        isEven
                          ? 'bg-[#0F5C45] text-white border border-[#34D399]/40'
                          : 'bg-[#F28C28] text-[#0B100E]'
                      }`}
                    >
                      {t.lastDigit}
                    </span>
                  </div>
                  <div className="text-[9px] text-[#B8C7C0] font-mono font-semibold">
                    {isEven ? 'EVEN' : 'ODD'} · {isHigh ? 'H' : 'L'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real-Time Parity & Bias Breakdown Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#121916] border border-[#24322C] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#9FB3AA] mb-2 font-mono">
            <span>Parity Ratio</span>
            <span>{ticks.length} Ticks</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5 tabular-nums">
            <span className="text-[#34D399]">EVEN {evenPct}%</span>
            <span className="text-[#FFB56B]">ODD {oddPct}%</span>
          </div>
          <div className="h-2.5 w-full bg-[#18221E] rounded-full overflow-hidden flex">
            <div
              className="bg-[#0F5C45] h-full transition-all duration-300"
              style={{ width: `${evenPct}%` }}
            />
            <div
              className="bg-[#F28C28] h-full transition-all duration-300"
              style={{ width: `${oddPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-[#121916] border border-[#24322C] p-3.5">
          <div className="flex items-center justify-between text-xs text-[#9FB3AA] mb-2 font-mono">
            <span>High / Low Range</span>
            <span>0–4 vs 5–9</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5 tabular-nums">
            <span className="text-[#34D399]">LOW (0–4) {lowPct}%</span>
            <span className="text-[#FFB56B]">HIGH (5–9) {highPct}%</span>
          </div>
          <div className="h-2.5 w-full bg-[#18221E] rounded-full overflow-hidden flex">
            <div
              className="bg-[#0F5C45] h-full transition-all duration-300"
              style={{ width: `${lowPct}%` }}
            />
            <div
              className="bg-[#F28C28] h-full transition-all duration-300"
              style={{ width: `${highPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
