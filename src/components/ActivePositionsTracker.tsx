import { CheckCircle2, Clock, DollarSign, XCircle } from 'lucide-react';
import React from 'react';
import { derivWs } from '../services/derivWs';
import { OpenContract } from '../types/deriv';

interface ActivePositionsTrackerProps {
  contracts: OpenContract[];
  onSellSuccess?: (contractId: number) => void;
}

export const ActivePositionsTracker: React.FC<ActivePositionsTrackerProps> = ({
  contracts,
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
    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80 shadow-lg space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Open Contract Tracker & Early Exit ({contracts.length})
          </h4>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Real-time P/L Stream</span>
      </div>

      <div className="space-y-2">
        {contracts.map((c) => {
          const isProfitable = c.profit >= 0;
          return (
            <div
              key={c.contract_id}
              className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{c.contract_type}</span>
                  <span className="text-slate-400">#{c.contract_id}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-semibold ${
                      c.status === 'open'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        : c.status === 'won'
                        ? 'bg-emerald-950 text-emerald-400'
                        : 'bg-rose-950 text-rose-400'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Stake: ${c.buy_price.toFixed(2)} · Entry Spot: {c.entry_tick || '---'}
                </div>
              </div>

              {/* Live P/L and Action */}
              <div className="flex items-center justify-between sm:justify-end gap-4">
                <div className="text-right">
                  <div
                    className={`font-extrabold text-sm ${
                      isProfitable ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isProfitable ? '+' : ''}${c.profit.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ({isProfitable ? '+' : ''}{c.profit_percentage.toFixed(1)}%)
                  </div>
                </div>

                {c.status === 'open' && (
                  <button
                    onClick={() => handleSell(c.contract_id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition-colors cursor-pointer shadow-sm"
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
