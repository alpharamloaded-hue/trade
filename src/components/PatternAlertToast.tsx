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

  // Only display the single most recent alert
  const alert = alerts[0];

  return (
    <div className="fixed top-16 right-4 z-40 max-w-xs w-full pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="pointer-events-auto p-2.5 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-xl backdrop-blur-md flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-purple-950 text-purple-300 border border-purple-800 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white text-[11px] truncate">
              {alert.title}
            </div>
            <div className="text-[10px] text-cyan-400 font-mono">
              {alert.confidence}% Statistical Edge
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onDisablePopups && (
            <button
              onClick={onDisablePopups}
              title="Mute floating popups (keep in feed)"
              className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            title="Dismiss"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
