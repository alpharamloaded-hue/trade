import { Activity, Bell, BellOff, CheckCircle2, ChevronDown, KeyRound, Radio, Volume2, VolumeX, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { soundEffects } from '../services/soundEffects';
import { ConnectionState } from '../types/deriv';
import { SYNTHETIC_SYMBOLS } from '../utils/symbols';

interface HeaderProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  connection: ConnectionState;
  onToggleSimulation: () => void;
  onOpenAuth: () => void;
  isAuthorized: boolean;
  loginId?: string;
  balance?: number;
  currency?: string;
  popupsEnabled: boolean;
  onTogglePopups: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSymbol,
  onSelectSymbol,
  connection,
  onToggleSimulation,
  onOpenAuth,
  isAuthorized,
  loginId,
  balance,
  currency = 'USD',
  popupsEnabled,
  onTogglePopups,
}) => {
  const [isSymbolOpen, setIsSymbolOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(soundEffects.getMuted());
  const [volume, setVolume] = useState(soundEffects.getVolume());
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const selectedMeta = SYNTHETIC_SYMBOLS.find((s) => s.symbol === currentSymbol) || SYNTHETIC_SYMBOLS[0];

  const handleToggleMute = () => {
    const next = !isAudioMuted;
    setIsAudioMuted(next);
    soundEffects.setMuted(next);
    if (!next) {
      soundEffects.playPatternAlert('general');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    soundEffects.setVolume(val);
  };

  return (
    <header className="flex items-center justify-between gap-6 px-4 md:px-6 py-3 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-30">
      {/* Zone 1: Clean Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-950/40">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
              <span>DigitScope</span>
              <span className="text-[10px] font-semibold tracking-wider text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.2 rounded">
                PRO
              </span>
            </div>
          </div>
        </a>
      </div>

      {/* Zone 2: Navigation & Status Affordances */}
      <div className="flex items-center gap-3 md:gap-5">
        {/* Synthetic Market Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsSymbolOpen(!isSymbolOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 hover:border-slate-700 hover:bg-slate-850 transition-colors whitespace-nowrap cursor-pointer shadow-sm"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono">{selectedMeta.symbol}</span>
            <span className="text-slate-400 font-normal hidden sm:inline">· {selectedMeta.displayName}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {isSymbolOpen && (
            <div className="absolute left-0 mt-1.5 w-64 md:w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 max-h-96 overflow-y-auto">
              <div className="px-2 py-1.5 text-[11px] font-medium text-slate-400 border-b border-slate-800">
                Select Synthetic Index
              </div>
              <div className="py-1 space-y-0.5">
                {SYNTHETIC_SYMBOLS.map((item) => (
                  <button
                    key={item.symbol}
                    onClick={() => {
                      onSelectSymbol(item.symbol);
                      setIsSymbolOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      item.symbol === currentSymbol
                        ? 'bg-cyan-950/60 text-cyan-300 font-semibold border border-cyan-800/40'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs">{item.displayName}</div>
                      <div className="text-[10px] text-slate-500">{item.description}</div>
                    </div>
                    {item.symbol === currentSymbol && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live WebSocket Connection Status */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              connection.status === 'connected'
                ? connection.isSimulation
                  ? 'bg-amber-400'
                  : 'bg-emerald-400 shadow-xs shadow-emerald-400/50'
                : connection.status === 'connecting'
                ? 'bg-cyan-400 animate-ping'
                : 'bg-rose-500'
            }`}
          />
          <span className="capitalize">{connection.isSimulation ? 'Simulated' : connection.status}</span>
          {connection.status === 'connected' && !connection.isSimulation && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 tabular-nums">{connection.pingMs}ms</span>
            </>
          )}
        </div>

        {/* Demo Simulation Toggle */}
        <button
          onClick={onToggleSimulation}
          title={connection.isSimulation ? 'Switch to Live Deriv WebSocket' : 'Switch to Offline Simulation Mode'}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            connection.isSimulation
              ? 'bg-amber-950/40 border-amber-800/70 text-amber-300 hover:bg-amber-900/50'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Zap className="w-3 h-3 text-amber-400" />
          <span>{connection.isSimulation ? 'Demo Mode' : 'Live Stream'}</span>
        </button>

        {/* Visual Popup Alerts Toggle */}
        <button
          onClick={onTogglePopups}
          title={popupsEnabled ? 'Floating Alerts: Active (Click to mute popups)' : 'Floating Alerts: Muted (Click to enable popups)'}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            popupsEnabled
              ? 'bg-cyan-950/40 border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/40'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          {popupsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>

        {/* Audio Alerts Control */}
        <div className="relative">
          <button
            onClick={handleToggleMute}
            onMouseEnter={() => setShowVolumeSlider(true)}
            title={isAudioMuted ? 'Unmute Audio Chimes' : 'Mute Audio Chimes'}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isAudioMuted
                ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                : 'bg-cyan-950/40 border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/40'
            }`}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {showVolumeSlider && !isAudioMuted && (
            <div
              onMouseLeave={() => setShowVolumeSlider(false)}
              className="absolute right-0 mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg shadow-xl flex items-center gap-2 z-40 w-32"
            >
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Account & Auth Action */}
      <div className="flex items-center gap-2 shrink-0">
        {isAuthorized ? (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-semibold hover:bg-emerald-900/40 transition-colors cursor-pointer"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono">{loginId || 'Authorized'}</span>
            {balance !== undefined && (
              <span className="font-mono tabular-nums text-slate-200">
                ${balance.toFixed(2)}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Connect API</span>
          </button>
        )}
      </div>
    </header>
  );
};
