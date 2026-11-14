/**
 * DigitScope Analytics & Multiplier Risk Engine
 * High-performance analytics dashboard streaming live Deriv synthetic index tick data.
 */

import { BarChart3, Clock, Flame, Gauge, Layers, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import React, { useState } from 'react';
import { ActivePositionsTracker } from './components/ActivePositionsTracker';
import { AuthModal } from './components/AuthModal';
import { DigitAnalyticsView } from './components/DigitAnalyticsView';
import { FooterDisclaimer } from './components/FooterDisclaimer';
import { Header } from './components/Header';
import { MarketStreamView } from './components/MarketStreamView';
import { MultiplierAnalyticsView } from './components/MultiplierAnalyticsView';
import { PatternAlertToast } from './components/PatternAlertToast';
import { TradeConfirmModal } from './components/TradeConfirmModal';
import { TradeEntryRadar } from './components/TradeEntryRadar';
import { useDerivTicks } from './hooks/useDerivTicks';
import { derivWs } from './services/derivWs';
import { soundEffects } from './services/soundEffects';
import { DerivProposal, OpenContract, TradeEntrySignal, UserAuthAccount } from './types/deriv';

export default function App() {
  // 1. Tick streaming & analytics hook
  const {
    symbol,
    selectSymbol,
    ticks,
    latestTick,
    windowSize,
    setWindowSize,
    digitStats,
    patterns,
    activeAlerts,
    dismissAlert,
    connection,
    toggleSimulation,
    popupsEnabled,
    togglePopups,
  } = useDerivTicks('1HZ100V');

  // 2. Active Tab Switcher (Module A vs Module B)
  const [activeTab, setActiveTab] = useState<'digits' | 'multipliers'>('digits');

  // 3. User Authentication State
  const [userAccount, setUserAccount] = useState<UserAuthAccount>(() => {
    try {
      const raw = sessionStorage.getItem('digitscope_oauth_session');
      if (raw) {
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          expires_at?: number;
          client_id?: string;
          scope?: string;
          accounts?: Array<{ accountId: string; currency?: string; balance?: number; accountType?: string }>;
        };
        if (parsed.access_token && parsed.expires_at && Date.now() < parsed.expires_at) {
          const first = parsed.accounts?.[0];
          return {
            isAuthorized: true,
            authMethod: 'oauth2',
            token: parsed.access_token,
            appId: parsed.client_id || derivWs.getAppId(),
            expiresAt: parsed.expires_at,
            scope: parsed.scope,
            accounts: parsed.accounts,
            loginid: first?.accountId || `OAuth App #${parsed.client_id}`,
            balance: first?.balance,
            currency: first?.currency || 'USD',
            isTradeEnabled: (parsed.scope || '').includes('trade'),
          };
        }
        sessionStorage.removeItem('digitscope_oauth_session');
      }
    } catch {}
    return {
      isAuthorized: false,
      token: derivWs.getToken(),
      appId: derivWs.getAppId(),
      isTradeEnabled: false,
    };
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // 4. Secondary Confirmation Modal State
  const [pendingOrder, setPendingOrder] = useState<{
    proposal: DerivProposal;
    contractType: string;
    targetParam?: string | number;
  } | null>(null);

  // 5. Active Placed Contracts Tracker
  const [activeContracts, setActiveContracts] = useState<OpenContract[]>([]);

  // 6. 1-Click Signal Setup Prefill State
  const [digitPrefill, setDigitPrefill] = useState<{
    contractType: 'DIGITMATCH' | 'DIGITDIFF';
    targetDigit: number;
    stake: number;
    key: number;
  } | undefined>(undefined);

  const [multiplierPrefill, setMultiplierPrefill] = useState<{
    direction: 'MULTUP' | 'MULTDOWN';
    multiplier: number;
    stake: number;
    key: number;
  } | undefined>(undefined);

  const handleApplySignal = (signal: TradeEntrySignal) => {
    soundEffects.playTradeSignalAlert();
    if (signal.category === 'DIGITS') {
      setActiveTab('digits');
      setDigitPrefill({
        contractType: signal.recommendedContract as 'DIGITMATCH' | 'DIGITDIFF',
        targetDigit: signal.recommendedParam,
        stake: signal.suggestedStake,
        key: Date.now(),
      });
    } else {
      setActiveTab('multipliers');
      setMultiplierPrefill({
        direction: signal.recommendedContract as 'MULTUP' | 'MULTDOWN',
        multiplier: signal.recommendedParam,
        stake: signal.suggestedStake,
        key: Date.now(),
      });
    }
    window.setTimeout(() => {
      document.getElementById('order-execution-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);
  };

  // Open trade confirmation modal
  const handleInitiateOrder = (
    proposal: DerivProposal,
    contractType: string,
    targetParam?: string | number
  ) => {
    setPendingOrder({ proposal, contractType, targetParam });
  };

  // Execute trade after secondary user confirmation
  const handleConfirmOrder = async (proposal: DerivProposal) => {
    const res = await derivWs.executeBuy(proposal.id, proposal.ask_price);

    // If simulated or active contract returned, add to open contract tracker
    if (res && res.buy) {
      const newContract: OpenContract = {
        contract_id: res.buy.contract_id,
        contract_type: pendingOrder?.contractType || 'CONTRACT',
        buy_price: proposal.ask_price,
        current_spot: proposal.spot,
        profit: 0,
        profit_percentage: 0,
        status: 'open',
        entry_tick: proposal.spot,
        date_start: Math.floor(Date.now() / 1000),
      };
      setActiveContracts((prev) => [newContract, ...prev]);

      // If simulated, update simulated balance
      if (res.buy.balance_after) {
        setUserAccount((prev) => ({
          ...prev,
          balance: res.buy.balance_after,
        }));
      }
    }
  };

  const handleSellSuccess = (contractId: number) => {
    setActiveContracts((prev) =>
      prev.map((c) => (c.contract_id === contractId ? { ...c, status: 'sold' as const } : c))
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Bar Header */}
      <Header
        currentSymbol={symbol}
        onSelectSymbol={selectSymbol}
        connection={connection}
        onToggleSimulation={toggleSimulation}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        isAuthorized={userAccount.isAuthorized}
        loginId={userAccount.loginid}
        balance={userAccount.balance}
        currency={userAccount.currency || 'USD'}
        onSelectCurrency={(cur) => setUserAccount((prev) => ({ ...prev, currency: cur }))}
        popupsEnabled={popupsEnabled}
        onTogglePopups={togglePopups}
      />

      {/* Main Workspace Layout (2-Column Desktop Grid) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {/* Navigation Mode Tabs Bar */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('digits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'digits'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Digit Matches & Differs</span>
            </button>
            <button
              onClick={() => setActiveTab('multipliers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'multipliers'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>Multiplier Liquidation Engine</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span>Buffer: <strong>{ticks.length} / 1000</strong> ticks</span>
            <span>·</span>
            <span>Sub-300ms Tick Pipeline</span>
          </div>
        </div>

        {/* Real-Time Trade Entry Radar & Tactical Recommendation Engine */}
        <TradeEntryRadar
          digitStats={digitStats}
          ticks={ticks}
          patterns={patterns}
          latestTick={latestTick}
          activeTab={activeTab}
          onApplySignal={handleApplySignal}
        />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Market Stream & Price Focus (5 Cols on LG) */}
          <div className="lg:col-span-5 space-y-6">
            <MarketStreamView
              symbol={symbol}
              latestTick={latestTick}
              ticks={ticks}
            />

            {/* Active Position Tracker */}
            <ActivePositionsTracker
              contracts={activeContracts}
              onSellSuccess={handleSellSuccess}
            />
          </div>

          {/* Right Column: Tabbed Analytics Engine (7 Cols on LG) */}
          <div className="lg:col-span-7">
            {activeTab === 'digits' ? (
              <DigitAnalyticsView
                digitStats={digitStats}
                windowSize={windowSize}
                onWindowChange={setWindowSize}
                patterns={patterns}
                latestTick={latestTick}
                symbol={symbol}
                currency={userAccount.currency || 'USD'}
                onInitiateOrder={handleInitiateOrder}
                prefillConfig={digitPrefill}
              />
            ) : (
              <MultiplierAnalyticsView
                latestTick={latestTick}
                symbol={symbol}
                currency={userAccount.currency || 'USD'}
                onInitiateOrder={handleInitiateOrder}
                prefillConfig={multiplierPrefill}
              />
            )}
          </div>
        </div>
      </main>

      {/* Floating Pattern Alert Notifications (Compact & Auto-Dismissing) */}
      <PatternAlertToast
        alerts={activeAlerts}
        onDismiss={dismissAlert}
        onDisablePopups={togglePopups}
      />

      {/* Account / API Token Authentication Drawer */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        userAccount={userAccount}
        onUpdateAccount={(updated) => setUserAccount((prev) => ({ ...prev, ...updated }))}
      />

      {/* Secondary Confirmation Modal for Trade Execution */}
      <TradeConfirmModal
        isOpen={pendingOrder !== null}
        onClose={() => setPendingOrder(null)}
        proposal={pendingOrder?.proposal || null}
        contractType={pendingOrder?.contractType || ''}
        targetParam={pendingOrder?.targetParam}
        symbol={symbol}
        userAccount={userAccount}
        onConfirmOrder={handleConfirmOrder}
      />

      {/* High-Risk Trading Compliance Disclaimer */}
      <FooterDisclaimer />
    </div>
  );
}
