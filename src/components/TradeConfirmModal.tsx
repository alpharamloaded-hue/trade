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
  onConfirmOrder,
}) => {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !proposal) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Confirm Trade Execution</h3>
            <p className="text-xs text-slate-400">Secondary authorization required</p>
          </div>
        </div>

        {/* Order Details Breakdown */}
        <div className="space-y-2.5 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-4 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-slate-400">Market / Symbol</span>
            <span className="font-bold text-white">{symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Contract Type</span>
            <span className="font-bold text-cyan-400">{contractType}</span>
          </div>
          {targetParam !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">
                {isMultiplier ? 'Multiplier Leverage' : 'Target Digit'}
              </span>
              <span className="font-bold text-white">
                {isMultiplier ? `${targetParam}x` : `Digit ${targetParam}`}
              </span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-slate-800/60">
            <span className="text-slate-400">Stake (Total Risk)</span>
            <span className="font-bold text-white">${proposal.ask_price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Potential Payout</span>
            <span className="font-bold text-emerald-400">${proposal.payout.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Net Potential Profit</span>
            <span className="font-bold text-emerald-400">+${netProfit.toFixed(2)}</span>
          </div>
        </div>

        {/* Auth status notice */}
        {!userAccount.isAuthorized && (
          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 mb-4">
            Notice: You are in Demo Mode. Order will be simulated in the open contracts tracker without charging live funds.
          </div>
        )}

        {/* Risk Acknowledgement Checkbox */}
        <div className="mb-4">
          <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 bg-slate-950 accent-cyan-500 cursor-pointer"
            />
            <span>
              I understand that synthetic indices carry high risk. I confirm placement of this{' '}
              <strong className="text-white">${proposal.ask_price.toFixed(2)}</strong> contract.
            </span>
          </label>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 mb-4">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!hasAcknowledged || isSubmitting}
            onClick={handleExecute}
            className="py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting Order...' : 'Confirm & Execute'}
          </button>
        </div>
      </div>
    </div>
  );
};
