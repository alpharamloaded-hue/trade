import { AlertTriangle, ShieldCheck } from 'lucide-react';
import React from 'react';

export const FooterDisclaimer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-900 bg-slate-950/80 px-4 md:px-6 py-3 text-center text-[11px] text-slate-500 font-normal">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>
            <strong className="text-slate-400 font-medium">Risk Disclaimer:</strong> This tool provides statistical analysis on synthetic indices. Synthetic indices are high-risk and not suitable for all investors. Past performance is not indicative of future results.
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Non-Custodial Architecture</span>
          </span>
          <span>·</span>
          <span>Deriv WebSocket v3 Gateway</span>
        </div>
      </div>
    </footer>
  );
};
