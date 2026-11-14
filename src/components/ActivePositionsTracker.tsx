import { Clock } from 'lucide-react';
import React from 'react';
import { derivWs } from '../services/derivWs';
import { OpenContract } from '../types/deriv';

interface ActivePositionsTrackerProps {
  contracts: OpenContract[];
  currency?: string;
  onSellSuccess?: (contractId: number) => void;
}

export const ActivePositionsTracker: React.FC<ActivePositionsTrackerProps> = ({
  contracts,
  currency = 'USD',
  onSellSuccess,
}) => {
  if (contracts.length === 0) return null;

  const handleSell = async (contractId: number) => {
    try {
      await derivWs.sellContract(contractId);
      if (onSellSuccess) onSellSuccess(contractId);
    } catch (err) {
      console.error('Failed to close position:', err);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#121916] border border-[#24322C] space-y-3">
      <div className="flex items-center justify-between pb-2.5 border-b border-[#24322C]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#34D399]" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Open Contracts ({contracts.length})
          </h4>
        </div>
        <span className="text-[11px] text-[#9FB3AA] font-mono">Real-time P/L</span>
      </div>

      <div className="space-y-2">
        {contracts.map((c) => {
          const isProfitable = c.profit >= 0;
          return (
            <div
              key={c.contract_id}
              className="p-3 rounded-xl bg-[#18221E] border border-[#24322C] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white">{c.contract_type}</span>
                  <span className="text-[#8DA399]">#{c.contract_id}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                      c.status === 'open'
                        ? 'bg-[#F28C28]/15 text-[#FFB56B] border border-[#F28C28]/40'
                        : c.status === 'won'
                        ? 'bg-[#0F5C45]/40 text-[#6EE7B7] border border-[#34D399]/30'
                        : 'bg-red-500/15 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#9FB3AA] mt-1">
                  Stake: {currency} {c.buy_price.toFixed(2)} · Entry: {c.entry_tick || '---'}
                </div>
              </div>

              {/* Live P/L and Action */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#24322C]">
                <div className="sm:text-right">
                  <div
                    className={`font-extrabold text-sm tabular-nums ${
                      isProfitable ? 'text-[#34D399]' : 'text-red-400'
                    }`}
                  >
                    {isProfitable ? '+' : ''}
                    {currency} {c.profit.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[#9FB3AA] tabular-nums">
                    ({isProfitable ? '+' : ''}
                    {c.profit_percentage.toFixed(1)}%)
                  </div>
                </div>

                {c.status === 'open' && (
                  <button
                    onClick={() => handleSell(c.contract_id)}
                    className="px-3 py-1.5 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-xs transition-colors cursor-pointer shrink-0"
                  >
                    Close Position
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
