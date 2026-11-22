import { AlertCircle, Clock, RefreshCw, X } from 'lucide-react';
import React, { useState } from 'react';
import { OpenContract } from '../types/deriv';

interface ActivePositionsTrackerProps {
  contracts: OpenContract[];
  currency?: string;
  onClosePosition: (contractId: number) => Promise<void>;
  onRefreshContract?: (contractId: number) => Promise<void>;
  onDismissContract?: (contractId: number) => void;
  onClearSettled?: () => void;
}

export const ActivePositionsTracker: React.FC<ActivePositionsTrackerProps> = ({
  contracts,
  currency = 'USD',
  onClosePosition,
  onRefreshContract,
  onDismissContract,
  onClearSettled,
}) => {
  const [closingId, setClosingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (contracts.length === 0) return null;

  const openCount = contracts.filter((c) => c.status === 'open').length;
  const hasSettled = contracts.some((c) => c.status !== 'open');

  const handleSell = async (contractId: number) => {
    setClosingId(contractId);
    setErrorMsg(null);
    try {
      await onClosePosition(contractId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to close position.');
    } finally {
      setClosingId(null);
    }
  };

  const handleRefresh = async (contractId: number) => {
    if (!onRefreshContract) return;
    setRefreshingId(contractId);
    setErrorMsg(null);
    try {
      await onRefreshContract(contractId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to refresh contract status.');
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#121916] border border-[#24322C] space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#24322C]">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-[#34D399] shrink-0" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider truncate">
            {openCount > 0 ? `Open Contracts (${openCount})` : `Trade Activity (${contracts.length})`}
          </h4>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] text-[#9FB3AA] font-mono hidden sm:inline">Real-time P/L</span>
          {hasSettled && onClearSettled && (
            <button
              type="button"
              onClick={onClearSettled}
              className="text-[11px] font-semibold text-[#9FB3AA] hover:text-white px-2 py-0.5 rounded bg-[#18221E] border border-[#2C3E36] transition-colors cursor-pointer"
            >
              Clear Settled
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-red-500/12 border border-red-500/40 text-xs text-red-300 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-300/80 hover:text-white shrink-0 cursor-pointer"
            aria-label="Dismiss position error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {contracts.map((c) => {
          const isProfitable = c.profit >= 0;
          const isDigitContract = c.contract_type.startsWith('DIGIT');
          const canEarlySell =
            c.status === 'open' && !isDigitContract && (c.is_valid_to_sell ?? 1) !== 0;

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
                        ? 'bg-[#0F5C45]/45 text-[#6EE7B7] border border-[#34D399]/40'
                        : c.status === 'sold'
                        ? 'bg-[#0F5C45]/30 text-[#B8C7C0] border border-[#2C3E36]'
                        : 'bg-red-500/15 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#9FB3AA] mt-1 tabular-nums">
                  Stake: {currency} {c.buy_price.toFixed(2)} · Entry: {c.entry_tick || '---'}
                  {c.exit_tick !== undefined ? ` · Exit: ${c.exit_tick}` : ''}
                </div>
              </div>

              {/* Live P/L and Action */}
              <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#24322C]">
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

                {c.status === 'open' ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canEarlySell ? (
                      <button
                        type="button"
                        disabled={closingId === c.contract_id}
                        onClick={() => handleSell(c.contract_id)}
                        className="px-3 py-1.5 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {closingId === c.contract_id ? 'Closing...' : 'Close Position'}
                      </button>
                    ) : (
                      <span
                        title={
                          isDigitContract
                            ? '1-tick digit contracts auto-settle on the next tick and do not support manual early close.'
                            : 'Early close not available for this contract (Deriv returned is_valid_to_sell = 0).'
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#121916] border border-[#2C3E36] text-[10px] text-[#9FB3AA] font-semibold"
                      >
                        {isDigitContract ? 'Auto-settles (1 tick)' : 'No Early Close'}
                      </span>
                    )}
                    {onRefreshContract && (
                      <button
                        type="button"
                        disabled={refreshingId === c.contract_id}
                        onClick={() => handleRefresh(c.contract_id)}
                        title="Sync live contract status"
                        className="p-1.5 rounded-lg bg-[#121916] hover:bg-[#24322C] border border-[#2C3E36] text-[#9FB3AA] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                        aria-label="Refresh contract status"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            refreshingId === c.contract_id ? 'animate-spin text-[#34D399]' : ''
                          }`}
                        />
                      </button>
                    )}
                  </div>
                ) : (
                  onDismissContract && (
                    <button
                      type="button"
                      onClick={() => onDismissContract(c.contract_id)}
                      title="Dismiss settled trade"
                      className="p-1.5 rounded-lg bg-[#121916] hover:bg-[#24322C] border border-[#2C3E36] text-[#9FB3AA] hover:text-white transition-colors cursor-pointer shrink-0"
                      aria-label="Dismiss settled trade"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
