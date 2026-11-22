import {
  Activity,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  Radio,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
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
  onSelectCurrency?: (currency: string) => void;
  popupsEnabled: boolean;
  onTogglePopups: () => void;
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'USDC'];

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
  onSelectCurrency,
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
    <header className="bg-[#0E1613]/95 backdrop-blur-md text-white border-b border-[#24322C] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 lg:gap-4">
        {/* Zone 1: Brand Wordmark */}
        <a href="/" className="flex items-center gap-2 shrink-0 order-1">
          <div className="w-8 h-8 rounded-lg bg-[#0F5C45] border border-[#1E8766]/60 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
            <span>DigitScope</span>
            <span className="text-[10px] font-bold tracking-wider text-[#FFB56B] bg-[#F28C28]/15 border border-[#F28C28]/40 px-1.5 py-0.5 rounded">
              PRO
            </span>
          </div>
        </a>

        {/* Zone 3 (Order 2 on mobile, Order 3 on lg): Account & Auth Action */}
        <div className="flex items-center gap-2 shrink-0 order-2 lg:order-3">
          {isAuthorized ? (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] hover:border-[#34D399]/60 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-[#34D399] shrink-0" />
              <span className="font-mono max-w-[92px] sm:max-w-none truncate">
                {loginId || 'Authorized'}
              </span>
              {balance !== undefined && (
                <span className="font-mono tabular-nums text-[#34D399] font-extrabold hidden xs:inline sm:inline">
                  {currency} {balance.toFixed(2)}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] text-xs font-extrabold transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Connect API</span>
            </button>
          )}
        </div>

        {/* Zone 2 (Full row on mobile/tablet, inline center on lg+): Market, Currency, Mode & Utility Controls */}
        <div className="w-full lg:w-auto flex items-center justify-between lg:justify-center gap-2 sm:gap-3 order-3 lg:order-2 pt-2 lg:pt-0 border-t border-[#24322C] lg:border-t-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Synthetic Market Selector Dropdown */}
            <div className="relative min-w-0">
              <button
                onClick={() => setIsSymbolOpen(!isSymbolOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] text-xs font-semibold text-white hover:border-[#0F5C45] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-[#F28C28] shrink-0" />
                <span className="font-mono">{selectedMeta.symbol}</span>
                <span className="text-[#9FB3AA] font-normal hidden md:inline">
                  · {selectedMeta.displayName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#9FB3AA] shrink-0" />
              </button>

              {isSymbolOpen && (
                <div className="fixed sm:absolute left-3 right-3 sm:left-0 sm:right-auto mt-2 sm:w-72 rounded-xl bg-[#121916] text-white border border-[#2C3E36] shadow-2xl p-1.5 z-50 max-h-80 overflow-y-auto">
                  <div className="px-2.5 py-1.5 text-[11px] font-bold text-[#9FB3AA] border-b border-[#24322C]">
                    Select Synthetic Index (24/7)
                  </div>
                  <div className="py-1 space-y-0.5">
                    {SYNTHETIC_SYMBOLS.map((item) => (
                      <button
                        key={item.symbol}
                        onClick={() => {
                          onSelectSymbol(item.symbol);
                          setIsSymbolOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          item.symbol === currentSymbol
                            ? 'bg-[#0F5C45]/35 text-[#6EE7B7] font-bold border border-[#34D399]/35'
                            : 'text-[#EBF2EE] hover:bg-[#18221E]'
                        }`}
                      >
                        <div>
                          <div className="font-mono text-xs">{item.displayName}</div>
                          <div className="text-[10px] text-[#8DA399]">{item.description}</div>
                        </div>
                        {item.symbol === currentSymbol && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stake Currency Selector */}
            {onSelectCurrency && (
              <select
                aria-label="Stake Currency"
                value={currency}
                onChange={(e) => onSelectCurrency(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] text-xs font-mono font-bold text-white hover:border-[#0F5C45] focus:outline-hidden focus:border-[#F28C28] cursor-pointer"
              >
                {SUPPORTED_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur} className="bg-[#121916] text-white">
                    {cur}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live WebSocket Connection Status */}
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-[#9FB3AA] font-mono px-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  connection.status === 'connected'
                    ? connection.isSimulation
                      ? 'bg-[#F28C28]'
                      : 'bg-[#34D399]'
                    : connection.status === 'connecting'
                    ? 'bg-[#F28C28] animate-ping'
                    : 'bg-red-400'
                }`}
              />
              <span className="capitalize text-[#EBF2EE]">
                {connection.isSimulation ? 'Simulated' : connection.status}
              </span>
              {connection.status === 'connected' && !connection.isSimulation && (
                <>
                  <span className="text-[#4B5F57]">·</span>
                  <span className="tabular-nums">{connection.pingMs}ms</span>
                </>
              )}
            </div>

            {/* Demo Simulation Toggle (Visible on mobile too) */}
            <button
              onClick={onToggleSimulation}
              title={
                connection.isSimulation
                  ? 'Switch to Live Deriv WebSocket'
                  : 'Switch to Offline Demo Simulation'
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-extrabold border transition-colors cursor-pointer ${
                connection.isSimulation
                  ? 'bg-[#F28C28] border-[#F28C28] text-[#0B100E]'
                  : 'bg-[#0F5C45] border-[#1E8766]/60 text-white hover:bg-[#147558]'
              }`}
            >
              <Zap className="w-3 h-3 fill-current shrink-0" />
              <span>{connection.isSimulation ? 'Demo' : 'Live'}</span>
            </button>

            {/* Visual Popup Alerts Toggle */}
            <button
              onClick={onTogglePopups}
              title={
                popupsEnabled
                  ? 'Floating Alerts: Active (Click to mute popups)'
                  : 'Floating Alerts: Muted (Click to enable popups)'
              }
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                popupsEnabled
                  ? 'bg-[#F28C28] border-[#F28C28] text-[#0B100E]'
                  : 'bg-[#18221E] border-[#2C3E36] text-[#9FB3AA] hover:text-white'
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
                    ? 'bg-[#18221E] border-[#2C3E36] text-[#9FB3AA] hover:text-white'
                    : 'bg-[#0F5C45] text-white border-[#1E8766]/60'
                }`}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {showVolumeSlider && !isAudioMuted && (
                <div
                  onMouseLeave={() => setShowVolumeSlider(false)}
                  className="absolute right-0 mt-1 p-2.5 bg-[#121916] border border-[#2C3E36] rounded-lg shadow-xl flex items-center gap-2 z-40 w-32"
                >
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-full accent-[#F28C28] h-1.5 bg-[#24322C] rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
