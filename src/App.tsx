/**
 * DigitScope Analytics & Multiplier Risk Engine
 * High-performance analytics dashboard streaming live Deriv synthetic index tick data.
 */

import { BarChart3, Clock, Flame, Gauge, Layers, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
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

  // Trade execution lock to prevent concurrent trades
  const [tradeLock, setTradeLock] = useState(false);

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

  // Reusable helper to ensure authenticated WebSocket (OTP or legacy PAT) is open
  const ensureAuthSocketConnected = useCallback(async (): Promise<boolean> => {
    if (derivWs.isAuthSocketOpen()) {
      return false;
    }

    if (userAccount.authMethod === 'oauth2' || userAccount.authMethod === 'pat-rest') {
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
        const accData = (await accResp.json()) as {
          accounts?: Array<{ accountId: string; currency?: string; balance?: number }>;
        };
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
      const nestedOtpData =
        otpData.data && typeof otpData.data === 'object'
          ? (otpData.data as Record<string, unknown>)
          : undefined;
      const otpUrl = String(
        otpData.url || nestedOtpData?.url || otpData.websocket_url || otpData.ws_url || ''
      );
      if (!otpResp.ok || !otpUrl.startsWith('wss://')) {
        const errMsg =
          typeof otpData.message === 'string'
            ? otpData.message
            : typeof otpData.error === 'string'
              ? otpData.error
              : otpData.error && typeof otpData.error === 'object'
                ? String((otpData.error as Record<string, unknown>).message || '')
                : '';
        throw new Error(errMsg || 'Could not obtain a live OTP WebSocket URL from Deriv.');
      }

      await derivWs.connectWithOtpUrlAndWait(otpUrl);
      setUserAccount((prev) => ({ ...prev, otpWsUrl: otpUrl }));
      return true;
    }

    if (userAccount.authMethod === 'pat') {
      await derivWs.authorize(userAccount.token);
      return true;
    }

    throw new Error('No trading account connected.');
  }, [userAccount.appId, userAccount.authMethod, userAccount.loginid, userAccount.token]);

  // Subscribe to real-time contract updates (won/lost/sold/P&L) and live balance
  useEffect(() => {
    const unsubContract = derivWs.onContract((updated) => {
      setActiveContracts((prev) => {
        const idx = prev.findIndex((c) => c.contract_id === updated.contract_id);
        if (idx === -1) return prev;
        const existing = prev[idx];
        const merged: OpenContract = {
          ...existing,
          ...updated,
          contract_type: updated.contract_type || existing.contract_type,
          buy_price: updated.buy_price > 0 ? updated.buy_price : existing.buy_price,
          entry_tick: updated.entry_tick || existing.entry_tick,
        };
        const next = [...prev];
        next[idx] = merged;

        // If a live contract just transitioned from open -> settled, credit demo/update balance if needed
        if (existing.status === 'open' && merged.status !== 'open') {
          if (merged.sell_price !== undefined) {
            // Live WS balance subscription handles real balance; fallback if needed via REST below
          }
        }
        return next;
      });
    });

    const unsubBalance = derivWs.onBalance((bal, cur) => {
      setUserAccount((prev) => {
        if (!prev.isAuthorized || prev.authMethod === 'demo') return prev;
        return {
          ...prev,
          balance: bal,
          currency: cur || prev.currency,
        };
      });
    });

    return () => {
      unsubContract();
      unsubBalance();
    };
  }, []);

  // WebSocket Error Listener - surface errors to UI
  const [wsError, setWsError] = useState<string | null>(null);
  useEffect(() => {
    const unsubError = derivWs.onError((error, context) => {
      setWsError(`${context ? `[${context}] ` : ''}${error}`);
      // Auto-clear after 8 seconds
      setTimeout(() => setWsError(null), 8000);
    });
    return () => unsubError();
  }, []);

  // Poll open live contracts so fast 1-tick digit trades never stay stuck as 'open'
  const openLiveContractIds = activeContracts
    .filter((c) => c.status === 'open')
    .map((c) => c.contract_id)
    .join(',');

  useEffect(() => {
    if (!openLiveContractIds) return;
    if (userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive())) {
      return;
    }

    const ids = openLiveContractIds
      .split(',')
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);

    let cancelled = false;
    let reconnectAttempted = false;

    const pollOpen = async () => {
      if (cancelled) return;
      if (!derivWs.isAuthSocketOpen()) {
        if (reconnectAttempted) return;
        reconnectAttempted = true;
        try {
          await ensureAuthSocketConnected();
        } catch {
          return;
        }
      }
      for (const id of ids) {
        if (cancelled) return;
        try {
          await derivWs.fetchContractStatus(id);
        } catch {
          // Ignore transient poll errors
        }
      }
    };

    const firstTimer = window.setTimeout(pollOpen, 1200);
    const interval = window.setInterval(pollOpen, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [openLiveContractIds, userAccount.authMethod, userAccount.isAuthorized, ensureAuthSocketConnected]);

  // Simulate real-time P/L and auto-settlement on Virtual Demo Mode contracts
  useEffect(() => {
    if (!latestTick) return;
    const isDemo =
      userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive());
    if (!isDemo) return;

    setActiveContracts((prev) => {
      let hasChanges = false;
      let balanceDelta = 0;

      const next = prev.map((c) => {
        if (c.status !== 'open') return c;

        if (c.contract_type.startsWith('DIGIT')) {
          const target = Number(c.barrier ?? 0);
          const isMatch = c.contract_type === 'DIGITMATCH';
          const won = isMatch ? latestTick.lastDigit === target : latestTick.lastDigit !== target;
          const payout = c.payout ?? (isMatch ? Number((c.buy_price * 9.2).toFixed(2)) : Number((c.buy_price * 1.09).toFixed(2)));
          const profit = won ? Number((payout - c.buy_price).toFixed(2)) : Number((-c.buy_price).toFixed(2));
          const profitPct = c.buy_price > 0 ? Number(((profit / c.buy_price) * 100).toFixed(1)) : 0;

          if (won) {
            balanceDelta += payout;
          }
          hasChanges = true;
          return {
            ...c,
            current_spot: latestTick.quote,
            exit_tick: latestTick.quote,
            profit,
            profit_percentage: profitPct,
            status: (won ? 'won' : 'lost') as OpenContract['status'],
          };
        }

        if (c.contract_type.startsWith('MULT') && c.entry_tick > 0) {
          const mult = c.multiplier || 100;
          const dir = c.contract_type === 'MULTUP' ? 1 : -1;
          const rawPnl = c.buy_price * mult * dir * ((latestTick.quote - c.entry_tick) / c.entry_tick);
          const clampedPnl = Math.max(-c.buy_price, Number(rawPnl.toFixed(2)));
          const profitPct = c.buy_price > 0 ? Number(((clampedPnl / c.buy_price) * 100).toFixed(1)) : 0;
          const stoppedOut = clampedPnl <= -c.buy_price;

          hasChanges = true;
          return {
            ...c,
            current_spot: latestTick.quote,
            exit_tick: stoppedOut ? latestTick.quote : undefined,
            profit: clampedPnl,
            profit_percentage: profitPct,
            status: (stoppedOut ? 'lost' : 'open') as OpenContract['status'],
          };
        }

        return c;
      });

      if (balanceDelta > 0) {
        setUserAccount((acc) => ({
          ...acc,
          balance: Number(((acc.balance || 0) + balanceDelta).toFixed(2)),
        }));
      }

      return hasChanges ? next : prev;
    });
  }, [latestTick, userAccount.authMethod, userAccount.isAuthorized]);

  // Execute trade after secondary user confirmation (auto-connects OTP/PAT auth socket if needed)
  const handleConfirmOrder = async (proposal: DerivProposal) => {
    // Prevent concurrent trade execution
    if (tradeLock) {
      throw new Error('Trade already in progress. Please wait for current trade to complete.');
    }
    setTradeLock(true);

    // Capture order parameters at call time to prevent race conditions
    const capturedOrder = pendingOrder;
    const contractType = capturedOrder?.contractType || 'DIGITMATCH';
    const targetParam = capturedOrder?.targetParam;
    const currency = userAccount.currency || 'USD';

    try {
      // Virtual demo account execution (works even while streaming live Deriv ticks)
      if (userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive())) {
        // Use timestamp + random for unique ID (avoid Math.random collision)
        const mockId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        const isDigit = contractType.startsWith('DIGIT');
        const newContract: OpenContract = {
          contract_id: mockId,
          contract_type: contractType,
          buy_price: proposal.ask_price,
          current_spot: proposal.spot,
          profit: 0,
          profit_percentage: 0,
          status: 'open',
          entry_tick: proposal.spot,
          barrier: isDigit && targetParam !== undefined ? String(targetParam) : undefined,
          multiplier: !isDigit && targetParam !== undefined ? Number(targetParam) : undefined,
          payout: proposal.payout,
          is_valid_to_sell: isDigit ? 0 : 1,
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
      const reconnectedAuth = await ensureAuthSocketConnected();

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
        const isDigit = contractType.startsWith('DIGIT');
        const newContract: OpenContract = {
          contract_id: Number(res.buy.contract_id),
          contract_type: contractType,
          buy_price: Number(res.buy.buy_price ?? targetProposal.ask_price),
          current_spot: targetProposal.spot,
          profit: 0,
          profit_percentage: 0,
          status: 'open',
          entry_tick: targetProposal.spot,
          barrier: isDigit && targetParam !== undefined ? String(targetParam) : undefined,
          multiplier: !isDigit && targetParam !== undefined ? Number(targetParam) : undefined,
          payout: Number(res.buy.payout ?? targetProposal.payout),
          is_valid_to_sell: isDigit ? 0 : 1,
          date_start: Number(res.buy.start_time ?? Math.floor(Date.now() / 1000)),
        };
        setActiveContracts((prev) => [newContract, ...prev]);

        if (res.buy.balance_after !== undefined) {
          setUserAccount((prev) => ({
            ...prev,
            balance: Number(res.buy.balance_after),
          }));
        }
      }
    } finally {
      // Always release the lock
      setTradeLock(false);
      // Clear pending order after execution attempt
      setPendingOrder(null);
    }
  };

  const handleClosePosition = async (contractId: number) => {
    const isDemo =
      userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive());
    if (isDemo) {
      const target = activeContracts.find((c) => c.contract_id === contractId);
      setActiveContracts((prev) =>
        prev.map((c) => (c.contract_id === contractId ? { ...c, status: 'sold' as const } : c))
      );
      if (target) {
        const returnAmount = Math.max(0, target.buy_price + target.profit);
        setUserAccount((acc) => ({
          ...acc,
          balance: Number(((acc.balance || 0) + returnAmount).toFixed(2)),
        }));
      }
      return;
    }

    await ensureAuthSocketConnected();
    try {
      const sellRes = await derivWs.sellContract(contractId);
      const soldFor = sellRes?.sell?.sold_for !== undefined ? Number(sellRes.sell.sold_for) : undefined;
      setActiveContracts((prev) =>
        prev.map((c) => {
          if (c.contract_id !== contractId) return c;
          const profit = soldFor !== undefined ? Number((soldFor - c.buy_price).toFixed(2)) : c.profit;
          const profitPct =
            c.buy_price > 0 ? Number(((profit / c.buy_price) * 100).toFixed(1)) : c.profit_percentage;
          return {
            ...c,
            status: 'sold',
            profit,
            profit_percentage: profitPct,
          };
        })
      );
      if (sellRes?.sell?.balance_after !== undefined) {
        setUserAccount((prev) => ({
          ...prev,
          balance: Number(sellRes.sell.balance_after),
        }));
      }
    } catch (err) {
      // Refresh contract state immediately so already-settled trades flip from OPEN -> WON/LOST/SOLD
      await derivWs.fetchContractStatus(contractId).catch(() => {});
      throw err;
    }
  };

  const handleRefreshContract = async (contractId: number) => {
    const isDemo =
      userAccount.authMethod === 'demo' || (!userAccount.isAuthorized && derivWs.isSimulationActive());
    if (isDemo) return;
    await ensureAuthSocketConnected();
    await derivWs.fetchContractStatus(contractId);
  };

  const handleDismissContract = (contractId: number) => {
    setActiveContracts((prev) => prev.filter((c) => c.contract_id !== contractId));
  };

  const handleClearSettled = () => {
    setActiveContracts((prev) => prev.filter((c) => c.status === 'open'));
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

      {/* WebSocket Error Banner */}
      {wsError && (
        <div className="mx-3 sm:mx-4 md:mx-6 mt-3 mb-2 animate-in slide-in-from-top-2 duration-300">
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-red-300 min-w-0">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium break-words">{wsError}</span>
            </div>
            <button
              onClick={() => setWsError(null)}
              className="p-1.5 rounded-lg text-red-300/80 hover:text-white hover:bg-red-500/20 transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
              onClosePosition={handleClosePosition}
              onRefreshContract={handleRefreshContract}
              onDismissContract={handleDismissContract}
              onClearSettled={handleClearSettled}
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
        tradeLock={tradeLock}
      />

      {/* High-Risk Trading Compliance Disclaimer */}
      <FooterDisclaimer />
    </div>
  );
}
