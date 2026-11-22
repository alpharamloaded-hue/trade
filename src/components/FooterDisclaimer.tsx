import { AlertTriangle, ShieldCheck } from 'lucide-react';
import React from 'react';

export const FooterDisclaimer: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#24322C] bg-[#0E1512] px-4 md:px-6 py-3.5 text-center text-[11px] text-[#8DA399]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="flex items-start md:items-center gap-2 text-left md:text-center">
          <AlertTriangle className="w-3.5 h-3.5 text-[#F28C28] shrink-0 mt-0.5 md:mt-0" />
          <span>
            <strong className="text-white font-semibold">Risk Disclaimer:</strong> This tool provides statistical analysis on synthetic indices. Synthetic indices are high-risk and not suitable for all investors. Past performance is not indicative of future results.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[#8DA399] shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#34D399]" />
            <span>Non-Custodial Architecture</span>
          </span>
          <span>·</span>
          <span>Deriv Options WebSocket</span>
        </div>
      </div>
    </footer>
  );
};
