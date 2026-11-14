import { BellOff, X, Zap } from 'lucide-react';
import React from 'react';
import { PatternDetection } from '../types/deriv';

interface PatternAlertToastProps {
  alerts: PatternDetection[];
  onDismiss: (id: string) => void;
  onDisablePopups?: () => void;
}

export const PatternAlertToast: React.FC<PatternAlertToastProps> = ({
  alerts,
  onDismiss,
  onDisablePopups,
}) => {
  if (alerts.length === 0) return null;

  const alert = alerts[0];

  return (
    <div className="fixed top-20 right-3 left-3 sm:left-auto sm:right-4 z-40 sm:max-w-xs pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="pointer-events-auto p-3 rounded-xl bg-[#121916]/95 backdrop-blur-md border border-[#F28C28]/60 shadow-2xl flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#F28C28]/15 text-[#F28C28] border border-[#F28C28]/40 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-[11px] truncate">
              {alert.title}
            </div>
            <div className="text-[10px] text-[#34D399] font-mono font-semibold">
              {alert.confidence}% Statistical Edge
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onDisablePopups && (
            <button
              onClick={onDisablePopups}
              title="Mute floating popups (keep in feed)"
              className="p-1.5 rounded-lg text-[#9FB3AA] hover:text-[#F28C28] hover:bg-[#18221E] transition-colors cursor-pointer"
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            title="Dismiss"
            className="p-1.5 rounded-lg text-[#9FB3AA] hover:text-white hover:bg-[#18221E] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
