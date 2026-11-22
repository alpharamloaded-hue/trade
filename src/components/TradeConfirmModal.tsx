import { AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import React, { useState } from 'react';
import { soundEffects } from '../services/soundEffects';
import { DerivProposal, UserAuthAccount } from '../types/deriv';

interface TradeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: DerivProposal | null;
  contractType: string;
  targetParam?: string | number;
  symbol: string;
  userAccount: UserAuthAccount;
  onOpenAuth?: () => void;
  onConfirmOrder: (proposal: DerivProposal) => Promise<void>;
}

export const TradeConfirmModal: React.FC<TradeConfirmModalProps> = ({
  isOpen,
  onClose,
  proposal,
  contractType,
  targetParam,
  symbol,
  userAccount,
  onOpenAuth,
  onConfirmOrder,
}) => {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !proposal) return null;

  // Guard against invalid proposal with zero/negative stake
  if ((proposal.ask_price || 0) <= 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="w-full max-w-md rounded-2xl bg-[#121916] border border-red-500/40 shadow-2xl p-4 sm:p-6 relative max-h-[92dvh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 p-1.5 rounded-lg text-[#9FB3AA] hover:text-white hover:bg-[#18221E] transition-colors cursor-pointer"
            aria-label="Close confirmation modal"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="p-4 rounded-xl bg-red-500/12 border border-red-500/40 text-center text-xs text-red-300">
            Invalid quote received (stake: 0). Please wait for live quote and try again.
          </div>
          <button
            onClick={onClose}
            className="w-full mt-4 py-2.5 rounded-xl bg-[#18221E] hover:bg-[#24322C] text-[#EBF2EE] border border-[#2C3E36] font-semibold text-xs transition-colors cursor-pointer"
          >
            Close & Retry
          </button>
        </div>
      </div>
    );
  }

  const handleExecute = async () => {
    if (!hasAcknowledged) {
      setErrorMsg('Please acknowledge the risk confirmation before executing.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onConfirmOrder(proposal);
      soundEffects.playOrderExecuted();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Trade execution failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMultiplier = contractType.startsWith('MULT');
  const netProfit = proposal.payout - proposal.ask_price;
  const currency = userAccount.currency || 'USD';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[#121916] border border-[#2C3E36] shadow-2xl p-4 sm:p-6 relative max-h-[92dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 p-1.5 rounded-lg text-[#9FB3AA] hover:text-white hover:bg-[#18221E] transition-colors cursor-pointer"
          aria-label="Close confirmation modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#F28C28]/15 border border-[#F28C28]/40 flex items-center justify-center text-[#F28C28] shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Confirm Trade Execution</h3>
            <p className="text-xs text-[#9FB3AA]">Secondary authorization required</p>
          </div>
        </div>

        {/* Order Details Breakdown */}
        <div className="space-y-2.5 p-3.5 sm:p-4 rounded-xl bg-[#18221E] border border-[#24322C] mb-4 text-xs font-mono tabular-nums">
          <div className="flex justify-between gap-2">
            <span className="text-[#9FB3AA]">Market / Symbol</span>
            <span className="font-bold text-white">{symbol}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#9FB3AA]">Contract Type</span>
            <span className="font-bold text-[#34D399]">{contractType}</span>
          </div>
          {targetParam !== undefined && (
            <div className="flex justify-between gap-2">
              <span className="text-[#9FB3AA]">
                {isMultiplier ? 'Multiplier Leverage' : 'Target Digit'}
              </span>
              <span className="font-bold text-white">
                {isMultiplier ? `${targetParam}x` : `Digit ${targetParam}`}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-2 pt-2 border-t border-[#24322C]">
            <span className="text-[#9FB3AA]">Stake (Total Risk)</span>
            <span className="font-bold text-white">
              {currency} {proposal.ask_price.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#9FB3AA]">Potential Payout</span>
            <span className="font-bold text-[#34D399]">
              {currency} {proposal.payout.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[#9FB3AA]">Net Potential Profit</span>
            <span className="font-bold text-[#34D399]">
              +{currency} {netProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Auth status notice */}
        {!userAccount.isAuthorized && (
          <div className="p-3 rounded-xl bg-[#F28C28]/12 border border-[#F28C28]/40 text-xs text-[#FFB56B] mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span>
              No account connected. Connect your Deriv account or launch Virtual Demo Mode to execute orders.
            </span>
            {onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-[11px] shrink-0 cursor-pointer self-start sm:self-center transition-colors"
              >
                Connect API
              </button>
            )}
          </div>
        )}

        {/* Risk Acknowledgement Checkbox */}
        <div className="mb-4">
          <label className="flex items-start gap-2.5 text-xs text-[#B8C7C0] cursor-pointer">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-[#2C3E36] bg-[#18221E] accent-[#34D399] cursor-pointer"
            />
            <span>
              I understand that synthetic indices carry high risk. I confirm placement of this{' '}
              <strong className="text-white">
                {currency} {proposal.ask_price.toFixed(2)}
              </strong>{' '}
              contract.
            </span>
          </label>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/12 border border-red-500/40 text-xs text-red-300 font-medium mb-4">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button
            onClick={onClose}
            className="py-2.5 rounded-xl bg-[#18221E] hover:bg-[#24322C] text-[#EBF2EE] border border-[#2C3E36] font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!hasAcknowledged || isSubmitting}
            onClick={handleExecute}
            className="py-2.5 rounded-xl bg-[#0F5C45] hover:bg-[#147558] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting Order...' : 'Confirm & Execute'}
          </button>
        </div>
      </div>
    </div>
  );
};
