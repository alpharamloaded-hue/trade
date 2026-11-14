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

  // Execute trade after secondary user confirmation (auto-connects OTP/PAT auth socket if needed)
  const handleConfirmOrder = async (proposal: DerivProposal) => {
    const contractType = pendingOrder?.contractType || 'DIGITMATCH';
    const targetParam = pendingOrder?.targetParam;
    const currency = userAccount.currency || 'USD';

    // Virtual demo account execution (works even while streaming live Deriv ticks)
    if (userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive())) {
      const mockId = Math.floor(Math.random() * 900000) + 100000;
      const newContract: OpenContract = {
        contract_id: mockId,
        contract_type: contractType,
        buy_price: proposal.ask_price,
        current_spot: proposal.spot,
        profit: 0,
        profit_percentage: 0,
        status: 'open',
        entry_tick: proposal.spot,
        date_start: Math.floor(Date.now() / 1000),
      };
      setActiveContracts((prev) => [newContract, ...prev]);
      if (userAccount.balance !== undefined) {
        setUserAccount((prev) => ({
          ...prev,
          balance: Number(Math.max(0, (prev.balance || 10000) - proposal.ask_price).toFixed(2)),
        }));
      }
      return;
    }

    if (!userAccount.isAuthorized) {
      throw new Error(
        'No trading account connected. Click "Connect Account" below to sign in with Deriv OAuth 2.0, paste a token, or launch Demo Mode.'
      );
    }

    let targetProposal = proposal;
    let reconnectedAuth = false;

    if (userAccount.authMethod === 'oauth2' || userAccount.authMethod === 'pat-rest') {
      if (!derivWs.isAuthSocketOpen()) {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${userAccount.token}`,
          'Content-Type': 'application/json',
        };
        if (userAccount.appId && userAccount.appId !== '1089') {
          headers['Deriv-App-ID'] = userAccount.appId;
        }

        let accountId = userAccount.loginid;
        if (!accountId || accountId.startsWith('OAuth App') || accountId.startsWith('PAT App')) {
          const accResp = await fetch('/api/deriv/accounts', { headers });
          if (accResp.status === 401) {
            throw new Error('Your Deriv session expired (401). Please re-authorize in Connect API.');
          }
          const accData = (await accResp.json()) as { accounts?: Array<{ accountId: string; currency?: string; balance?: number }> };
          const first = accData.accounts?.[0];
          if (!first?.accountId) {
            throw new Error('No Deriv Options trading account found on this token.');
          }
          accountId = first.accountId;
          setUserAccount((prev) => ({
            ...prev,
            accounts: accData.accounts,
            loginid: first.accountId,
            balance: first.balance ?? prev.balance,
            currency: first.currency || prev.currency,
          }));
        }

        const otpResp = await fetch('/api/deriv/otp', {
          method: 'POST',
          headers,
          body: JSON.stringify({ accountId, appId: userAccount.appId }),
        });

        if (otpResp.status === 401) {
          throw new Error('Your Deriv session expired (401). Please re-authorize in Connect API.');
        }

        const otpData = (await otpResp.json()) as Record<string, unknown>;
        const otpUrl = String(otpData.url || otpData.ws_url || '');
        if (!otpResp.ok || !otpUrl.startsWith('wss://')) {
          throw new Error(
            String(otpData.message || otpData.error || 'Could not obtain a live OTP WebSocket URL from Deriv.')
          );
        }

        await derivWs.connectWithOtpUrlAndWait(otpUrl);
        setUserAccount((prev) => ({ ...prev, otpWsUrl: otpUrl }));
        reconnectedAuth = true;
      }
    } else if (userAccount.authMethod === 'pat') {
      if (!derivWs.isAuthSocketOpen()) {
        await derivWs.authorize(userAccount.token);
        reconnectedAuth = true;
      }
    }

    const fetchBoundProposal = async () => {
      const isDigit = contractType.startsWith('DIGIT');
      const fresh = await derivWs.fetchProposal({
        contractType: contractType as 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN',
        stake: proposal.ask_price,
        symbol,
        currency,
        duration: isDigit ? 1 : undefined,
        barrier: isDigit && targetParam !== undefined ? String(targetParam) : undefined,
        multiplier: !isDigit && targetParam !== undefined ? Number(targetParam) : undefined,
        preferAuthSocket: true,
      });
      if (!fresh) {
        throw new Error('Could not refresh live quote on authenticated Deriv socket. Please retry.');
      }
      return fresh;
    };

    if (reconnectedAuth) {
      targetProposal = await fetchBoundProposal();
    }

    let res: any;
    try {
      res = await derivWs.executeBuy(targetProposal.id, targetProposal.ask_price);
    } catch (buyErr) {
      // If proposal was originally quoted on the public WS before authWs opened, refresh on authWs and retry once
      if (!reconnectedAuth) {
        targetProposal = await fetchBoundProposal();
        res = await derivWs.executeBuy(targetProposal.id, targetProposal.ask_price);
      } else {
        throw buyErr;
      }
    }

    if (res && res.buy) {
      const newContract: OpenContract = {
        contract_id: res.buy.contract_id,
        contract_type: contractType,
        buy_price: Number(res.buy.buy_price ?? targetProposal.ask_price),
        current_spot: targetProposal.spot,
        profit: 0,
        profit_percentage: 0,
        status: 'open',
        entry_tick: targetProposal.spot,
        date_start: Math.floor(Date.now() / 1000),
      };
      setActiveContracts((prev) => [newContract, ...prev]);

      if (res.buy.balance_after !== undefined) {
        setUserAccount((prev) => ({
          ...prev,
          balance: Number(res.buy.balance_after),
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
    <div className="min-h-screen flex flex-col bg-[#0B100E] text-[#F2F6F4] font-sans selection:bg-[#F28C28] selection:text-[#0B100E]">
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6">
        {/* Navigation Mode Tabs Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#24322C]">
          <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto items-center gap-1.5 bg-[#121916] p-1.5 rounded-xl border border-[#24322C]">
            <button
              onClick={() => setActiveTab('digits')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'digits'
                  ? 'bg-[#0F5C45] text-white'
                  : 'text-[#9FB3AA] hover:text-white hover:bg-[#18221E]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Digit Matches & Differs</span>
            </button>
            <button
              onClick={() => setActiveTab('multipliers')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'multipliers'
                  ? 'bg-[#0F5C45] text-white'
                  : 'text-[#9FB3AA] hover:text-white hover:bg-[#18221E]'
              }`}
            >
              <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Multiplier Engine</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-[#9FB3AA] font-mono tabular-nums">
            <span>
              Buffer: <strong className="text-white">{ticks.length} / 1000</strong> ticks
            </span>
            <span className="text-[#4B5F57]">·</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Left Column: Market Stream & Price Focus (5 Cols on LG) */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6">
            <MarketStreamView
              symbol={symbol}
              latestTick={latestTick}
              ticks={ticks}
            />

            {/* Active Position Tracker */}
            <ActivePositionsTracker
              contracts={activeContracts}
              currency={userAccount.currency || 'USD'}
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
        onOpenAuth={() => {
          setPendingOrder(null);
          setIsAuthModalOpen(true);
        }}
        onConfirmOrder={handleConfirmOrder}
      />

      {/* High-Risk Trading Compliance Disclaimer */}
      <FooterDisclaimer />
    </div>
  );
}
