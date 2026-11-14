import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { DerivRestAccount, OAuthSessionResult, UserAuthAccount } from '../types/deriv';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAccount: UserAuthAccount;
  onUpdateAccount: (account: Partial<UserAuthAccount>) => void;
}

const AVAILABLE_SCOPES = [
  { id: 'trade', label: 'trade', desc: 'Execute & monitor trades' },
  { id: 'account_manage', label: 'account_manage', desc: 'Read accounts & balances' },
  { id: 'application_read', label: 'application_read', desc: 'Read app info' },
  { id: 'payment', label: 'payment', desc: 'Deposits & withdrawals' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  userAccount,
  onUpdateAccount,
}) => {
  const [authTab, setAuthTab] = useState<'oauth2' | 'pat'>('oauth2');
  const [tokenInput, setTokenInput] = useState(userAccount.token || '');
  const [appIdInput, setAppIdInput] = useState(() => {
    try {
      return localStorage.getItem('digitscope_oauth_client_id') || userAccount.appId || '1089';
    } catch {
      return userAccount.appId || '1089';
    }
  });
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['trade', 'account_manage']);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthWaiting, setOauthWaiting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const activeStateRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') return '/callback';
    return `${window.location.origin}/callback`;
  }, []);

  const stopOAuthWait = () => {
    setOauthWaiting(false);
    activeStateRef.current = null;
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const applyOAuthResult = (payload: OAuthSessionResult) => {
    stopOAuthWait();
    const firstAccount = payload.accounts && payload.accounts.length > 0 ? payload.accounts[0] : undefined;

    try {
      localStorage.setItem('digitscope_oauth_client_id', payload.client_id);
      sessionStorage.setItem(
        'digitscope_oauth_session',
        JSON.stringify({
          access_token: payload.access_token,
          expires_at: payload.expires_at,
          client_id: payload.client_id,
          scope: payload.scope,
          accounts: payload.accounts || [],
        })
      );
    } catch {}

    onUpdateAccount({
      isAuthorized: true,
      authMethod: 'oauth2',
      token: payload.access_token,
      appId: payload.client_id,
      expiresAt: payload.expires_at,
      scope: payload.scope,
      accounts: payload.accounts || [],
      loginid: firstAccount?.accountId || `OAuth App #${payload.client_id}`,
      balance: firstAccount?.balance,
      currency: firstAccount?.currency || 'USD',
      isTradeEnabled: payload.scope.includes('trade'),
    });

    setSuccessMsg('Authorized via Deriv OAuth 2.0 (PKCE).');
  };

  // Listen for postMessage & BroadcastChannel from the OAuth popup callback
  useEffect(() => {
    if (!isOpen) return;

    const handleOAuthMessage = (data: Record<string, unknown>) => {
      if (!data || typeof data !== 'object') return;
      if (data.state && activeStateRef.current && data.state !== activeStateRef.current) {
        return;
      }

      if (data.type === 'DERIV_OAUTH_SUCCESS' && data.payload) {
        applyOAuthResult(data.payload as OAuthSessionResult);
      } else if (data.type === 'DERIV_OAUTH_ERROR') {
        stopOAuthWait();
        setErrorMsg(String(data.error || 'Deriv OAuth authorization failed.'));
      }
    };

    const onWindowMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.endsWith('.onrender.com') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      handleOAuthMessage(event.data as Record<string, unknown>);
    };

    window.addEventListener('message', onWindowMessage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('digitscope_deriv_oauth');
      bc.onmessage = (ev) => handleOAuthMessage(ev.data as Record<string, unknown>);
    } catch {}

    return () => {
      window.removeEventListener('message', onWindowMessage);
      if (bc) bc.close();
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleCopyRedirect = () => {
    navigator.clipboard?.writeText(redirectUri).catch(() => {});
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 1800);
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  // Start Deriv OAuth2 Authorization Code + PKCE Flow in Popup
  const handleStartOAuth2 = async (prompt?: 'registration') => {
    const cleanAppId = appIdInput.trim();
    if (!cleanAppId) {
      setErrorMsg('Please enter your registered Deriv App ID (client_id).');
      return;
    }
    if (selectedScopes.length === 0) {
      setErrorMsg('Select at least one OAuth scope (e.g. trade).');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setOauthWaiting(true);

    try {
      const resp = await fetch('/api/oauth/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: cleanAppId,
          redirect_uri: redirectUri,
          scope: selectedScopes.join(' '),
          prompt,
        }),
      });

      const data = (await resp.json()) as { url?: string; state?: string; error?: string };
      if (!resp.ok || !data.url || !data.state) {
        throw new Error(data.error || 'Could not initialize OAuth 2.0 PKCE request.');
      }

      activeStateRef.current = data.state;

      const popup = window.open(
        data.url,
        'deriv_oauth_popup',
        'width=540,height=720,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        stopOAuthWait();
        setErrorMsg('Popup was blocked by your browser. Please allow popups for this site and try again.');
        return;
      }

      // COOP-safe poll fallback while popup completes
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
      pollIntervalRef.current = window.setInterval(async () => {
        const currentState = activeStateRef.current;
        if (!currentState) return;
        try {
          const pollResp = await fetch(`/api/oauth/poll?state=${encodeURIComponent(currentState)}`);
          if (!pollResp.ok) return;
          const pollData = (await pollResp.json()) as {
            status: 'pending' | 'completed' | 'error';
            payload?: OAuthSessionResult;
            error?: string;
          };
          if (pollData.status === 'completed' && pollData.payload) {
            applyOAuthResult(pollData.payload);
          } else if (pollData.status === 'error') {
            stopOAuthWait();
            setErrorMsg(pollData.error || 'OAuth authorization failed.');
          }
        } catch {}
      }, 1200);
    } catch (err: unknown) {
      stopOAuthWait();
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start OAuth 2.0 flow.');
    }
  };

  // Fetch / refresh REST accounts using OAuth2 Bearer token
  const handleRefreshAccounts = async () => {
    if (!userAccount.token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/deriv/accounts', {
        headers: { Authorization: `Bearer ${userAccount.token}` },
      });
      if (resp.status === 401) {
        setErrorMsg('Access token expired (401). Please re-authorize via Deriv OAuth 2.0.');
        setIsLoading(false);
        return;
      }
      const data = (await resp.json()) as { accounts?: DerivRestAccount[]; error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to fetch accounts');
      }
      const list = data.accounts || [];
      const first = list[0];
      onUpdateAccount({
        accounts: list,
        loginid: first?.accountId || userAccount.loginid,
        balance: first?.balance ?? userAccount.balance,
        currency: first?.currency || userAccount.currency,
      });
      setSuccessMsg(`Loaded ${list.length} account(s).`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to refresh accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  // Obtain OTP WebSocket URL for selected account
  const handleConnectOtpWs = async (account: DerivRestAccount) => {
    if (!userAccount.token) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const resp = await fetch('/api/deriv/otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userAccount.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: account.accountId }),
      });

      if (resp.status === 401) {
        throw new Error('Access token expired (401). Please re-authorize via Deriv OAuth 2.0.');
      }

      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        throw new Error(String(data.message || data.error || 'Failed to generate OTP WebSocket URL.'));
      }

      const otpUrl = String(data.url || data.ws_url || '');
      if (otpUrl.startsWith('wss://')) {
        derivWs.connectWithOtpUrl(otpUrl);
      }

      onUpdateAccount({
        loginid: account.accountId,
        balance: account.balance,
        currency: account.currency || 'USD',
        otpWsUrl: otpUrl || undefined,
      });

      setSuccessMsg(`Switched active account to ${account.accountId}${otpUrl ? ' via OTP WebSocket' : ''}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to obtain OTP WebSocket URL.');
    } finally {
      setIsLoading(false);
    }
  };

  // Instant Demo Account Login
  const handleDemoLogin = () => {
    setIsLoading(true);
    setErrorMsg(null);
    derivWs.clearCustomWsUrl();
    derivWs.toggleSimulation(true);
    onUpdateAccount({
      isAuthorized: true,
      authMethod: 'demo',
      token: 'demo-virtual-token',
      appId: appIdInput || '1089',
      loginid: 'VRTC_DEMO_98124',
      balance: 10000.0,
      currency: 'USD',
      email: 'demo-trader@deriv.com',
      isTradeEnabled: true,
    });
    setSuccessMsg('Logged into Virtual Demo Account ($10,000 USD)');
    setTimeout(() => {
      setIsLoading(false);
      onClose();
    }, 600);
  };

  // Legacy PAT / WebSocket authorize
  const handlePatAuthorize = async () => {
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setErrorMsg('Please enter a valid Deriv API token or use OAuth 2.0.');
      return;
    }

    if (cleanToken.toLowerCase() === 'demo') {
      handleDemoLogin();
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      derivWs.clearCustomWsUrl();
      derivWs.setConfig(appIdInput, cleanToken);
      const res = await derivWs.authorize(cleanToken);

      if (res && res.authorize) {
        const authData = res.authorize;
        onUpdateAccount({
          isAuthorized: true,
          authMethod: 'pat',
          token: cleanToken,
          appId: appIdInput,
          loginid: authData.loginid,
          balance: Number(authData.balance),
          currency: authData.currency,
          email: authData.email,
          isTradeEnabled: true,
        });
        setSuccessMsg(`Connected successfully to account ${authData.loginid}`);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setErrorMsg('Authorization failed. Please verify your token.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to authenticate with Deriv API.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    stopOAuthWait();
    derivWs.clearCustomWsUrl();
    derivWs.setConfig(appIdInput, '');
    try {
      sessionStorage.removeItem('digitscope_oauth_session');
    } catch {}
    onUpdateAccount({
      isAuthorized: false,
      authMethod: undefined,
      token: '',
      loginid: undefined,
      balance: undefined,
      expiresAt: undefined,
      scope: undefined,
      accounts: undefined,
      otpWsUrl: undefined,
      isTradeEnabled: false,
    });
    setTokenInput('');
    setSuccessMsg('Disconnected');
  };

  const isTokenExpired =
    userAccount.authMethod === 'oauth2' &&
    userAccount.expiresAt !== undefined &&
    Date.now() >= userAccount.expiresAt;

  const remainingLabel = (() => {
    if (!userAccount.expiresAt) return null;
    const diffSec = Math.max(0, Math.floor((userAccount.expiresAt - Date.now()) / 1000));
    if (diffSec === 0) return 'Expired';
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={() => {
            stopOAuthWait();
            onClose();
          }}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Deriv Account & OAuth 2.0</h3>
            <p className="text-xs text-slate-400">
              PKCE OAuth 2.0 login, API token, or instant virtual demo
            </p>
          </div>
        </div>

        {/* Authorized State */}
        {userAccount.isAuthorized ? (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border space-y-2.5 ${
                isTokenExpired
                  ? 'bg-amber-950/30 border-amber-800/60'
                  : 'bg-emerald-950/35 border-emerald-800/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-1.5 text-xs font-bold ${
                    isTokenExpired ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {userAccount.authMethod === 'oauth2'
                      ? isTokenExpired
                        ? 'OAuth 2.0 Session Expired'
                        : 'Authorized via Deriv OAuth 2.0 (PKCE)'
                      : userAccount.authMethod === 'demo'
                      ? 'Virtual Demo Session'
                      : 'Authorized via API Token'}
                  </span>
                </span>
                {userAccount.balance !== undefined && (
                  <span className="text-xs font-mono font-bold text-white tabular-nums">
                    {userAccount.currency || 'USD'} {userAccount.balance.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 font-mono">
                <span>
                  Active ID: <strong className="text-white">{userAccount.loginid}</strong>
                </span>
                {remainingLabel && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{remainingLabel}</span>
                  </span>
                )}
              </div>

              {userAccount.scope && (
                <div className="text-[11px] font-mono text-slate-400">
                  Scopes: <span className="text-cyan-300">{userAccount.scope}</span>
                </div>
              )}

              {userAccount.authMethod === 'oauth2' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleRefreshAccounts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-slate-200 font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Accounts</span>
                  </button>
                  {isTokenExpired && (
                    <button
                      type="button"
                      onClick={() => handleStartOAuth2()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs text-white font-semibold transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Renew Access Token</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Accounts selector when OAuth2 returns multiple accounts */}
            {userAccount.authMethod === 'oauth2' &&
              userAccount.accounts &&
              userAccount.accounts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Options Accounts (Obtain OTP WebSocket)
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {userAccount.accounts.map((acc) => {
                      const isCurrent = acc.accountId === userAccount.loginid;
                      return (
                        <div
                          key={acc.accountId}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-mono ${
                            isCurrent
                              ? 'bg-cyan-950/30 border-cyan-700/60'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-white">{acc.accountId}</div>
                            <div className="text-[11px] text-slate-400">
                              {acc.accountType || 'options'} · {acc.currency || 'USD'}{' '}
                              {acc.balance !== undefined ? acc.balance.toFixed(2) : '--'}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleConnectOtpWs(acc)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <Wifi className="w-3 h-3" />
                            <span>{isCurrent && userAccount.otpWsUrl ? 'OTP Active' : 'Connect OTP'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                {successMsg}
              </div>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full py-2 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs font-semibold hover:bg-rose-900/50 transition-colors cursor-pointer"
            >
              Disconnect Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick 1-Click Demo Option */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/50 to-slate-900 border border-cyan-800/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Instant Virtual Demo Mode</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  $10,000 USD Virtual
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-2.5">
                Test the digit heatmap, pattern alerts, and multiplier risk model immediately with no login required.
              </p>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>Launch Virtual Demo Mode</span>
              </button>
            </div>

            {/* Auth Method Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('oauth2');
                  setErrorMsg(null);
                }}
                className={`py-2 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'oauth2'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Deriv OAuth 2.0 (PKCE)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('pat');
                  setErrorMsg(null);
                }}
                className={`py-2 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'pat'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                API Token (PAT)
              </button>
            </div>

            {authTab === 'oauth2' ? (
              <div className="space-y-3.5">
                {/* App ID / client_id */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Registered App ID (client_id)
                    </label>
                    <a
                      href="https://developers.deriv.com/dashboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      <span>Deriv Dashboard</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter your Deriv App ID (e.g. 65432)"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                  />
                </div>

                {/* Exact Redirect URI Display & Copy */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Required Redirect URL (Add in Deriv App Settings)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={redirectUri}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-cyan-300 font-mono focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleCopyRedirect}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                    >
                      {copiedRedirect ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Scopes Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Requested Scopes
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AVAILABLE_SCOPES.map((sc) => {
                      const active = selectedScopes.includes(sc.id);
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => toggleScope(sc.id)}
                          className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-cyan-950/40 border-cyan-700/70 text-cyan-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-[11px] font-mono font-bold">{sc.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{sc.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* OAuth2 Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={oauthWaiting}
                    onClick={() => handleStartOAuth2()}
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>
                      {oauthWaiting ? 'Waiting for Deriv Login...' : 'Sign in with Deriv OAuth 2.0'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={oauthWaiting}
                    onClick={() => handleStartOAuth2('registration')}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                </div>

                {oauthWaiting && (
                  <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/50 text-[11px] text-cyan-300 flex items-center justify-between">
                    <span>Complete login in the popup window. Exchanging PKCE code on server...</span>
                    <button
                      type="button"
                      onClick={stopOAuthWait}
                      className="text-slate-300 hover:text-white underline ml-2 cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Legacy PAT Form */
              <div className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Deriv API Token (PAT)
                    </label>
                    <a
                      href="https://app.deriv.com/account/api-token"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      <span>Get token on Deriv</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      placeholder="Paste your authorized token (Read & Trade scopes)"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">Deriv App ID</label>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                      <span>Presets:</span>
                      {['1089', '36300', '16929'].map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setAppIdInput(id)}
                          className={`px-1.5 py-0.5 rounded cursor-pointer ${
                            appIdInput === id
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="1089"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                  />
                </div>

                <button
                  disabled={isLoading}
                  onClick={handlePatAuthorize}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Connecting to Deriv Gateway...' : 'Authorize API Token'}
                </button>
              </div>
            )}

            {/* Error & Troubleshooting */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="font-semibold">{errorMsg}</div>
                </div>
                <div className="pt-1.5 border-t border-rose-900/60 text-[11px] text-slate-400 flex items-start gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    For OAuth 2.0, ensure the <strong>Redirect URL</strong> above matches your Deriv app registration and that your selected scopes are enabled on your app.
                  </span>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                {successMsg}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800 flex items-start gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>PKCE & Non-Custodial Security:</strong> Authorization codes are exchanged server-side using SHA-256 PKCE verification. Access tokens are never logged and stay scoped to your browser session.
          </span>
        </div>
      </div>
    </div>
  );
};
