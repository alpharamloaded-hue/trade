import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
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
  const [showToken, setShowToken] = useState(false);
  const [appIdInput, setAppIdInput] = useState(() => {
    try {
      const saved = localStorage.getItem('digitscope_oauth_client_id');
      if (saved && saved !== '1089') return saved;
      if (userAccount.appId && userAccount.appId !== '1089') return userAccount.appId;
      return '';
    } catch {
      return userAccount.appId && userAccount.appId !== '1089' ? userAccount.appId : '';
    }
  });
  const [hasServerAppId, setHasServerAppId] = useState(false);
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

    // Ensure live Deriv tick stream replaces simulated demo ticks immediately
    if (derivWs.isSimulationActive()) {
      derivWs.toggleSimulation(false);
    } else {
      derivWs.connect();
    }

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

    setSuccessMsg('Authorized via Deriv OAuth 2.0 (PKCE). Live stream active.');

    // Auto-obtain OTP WebSocket URL for the primary account so live trading works immediately
    if (firstAccount?.accountId) {
      fetch('/api/deriv/otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: firstAccount.accountId, appId: payload.client_id }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Record<string, unknown> | null) => {
          const nested =
            data?.data && typeof data.data === 'object'
              ? (data.data as Record<string, unknown>)
              : undefined;
          const otpUrl = String(
            data?.url || nested?.url || data?.websocket_url || data?.ws_url || ''
          );
          if (otpUrl.startsWith('wss://')) {
            derivWs.connectWithOtpUrl(otpUrl);
            onUpdateAccount({ otpWsUrl: otpUrl });
          }
        })
        .catch(() => {});
    }
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

  // Fetch server-side DERIV_APP_ID status when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/oauth/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { hasServerAppId?: boolean; serverAppId?: string } | null) => {
        if (!cfg) return;
        setHasServerAppId(Boolean(cfg.hasServerAppId));
        if (cfg.serverAppId) {
          setAppIdInput((prev) => (prev && prev !== '1089' ? prev : cfg.serverAppId || ''));
        }
      })
      .catch(() => {});
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
    if (!cleanAppId && !hasServerAppId) {
      setErrorMsg(
        'Enter your Registered App ID (client_id) from developers.deriv.com/dashboard, or set DERIV_APP_ID in Render Environment.'
      );
      return;
    }
    if (cleanAppId === '1089') {
      setErrorMsg(
        'App ID "1089" is Deriv\'s public sample WebSocket ID and does not exist in OAuth 2.0 (which causes Deriv\'s 404 error page). Enter your own registered App ID from developers.deriv.com/dashboard.'
      );
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

  // Fetch / refresh REST accounts using OAuth2 or PAT Bearer token
  const handleRefreshAccounts = async () => {
    if (!userAccount.token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${userAccount.token}`,
      };
      if (userAccount.appId && userAccount.appId !== '1089') {
        headers['Deriv-App-ID'] = userAccount.appId;
      }
      const resp = await fetch('/api/deriv/accounts', { headers });
      if (resp.status === 401) {
        setErrorMsg('Access token expired or rejected (401). Please re-authorize.');
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
      const headers: Record<string, string> = {
        Authorization: `Bearer ${userAccount.token}`,
        'Content-Type': 'application/json',
      };
      if (userAccount.appId && userAccount.appId !== '1089') {
        headers['Deriv-App-ID'] = userAccount.appId;
      }
      const resp = await fetch('/api/deriv/otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ accountId: account.accountId, appId: userAccount.appId }),
      });

      if (resp.status === 401) {
        throw new Error('Token expired or unauthorized (401). Please re-authorize.');
      }

      const data = (await resp.json()) as Record<string, unknown>;
      if (!resp.ok) {
        throw new Error(String(data.message || data.error || 'Failed to generate OTP WebSocket URL.'));
      }

      const nested =
        data.data && typeof data.data === 'object'
          ? (data.data as Record<string, unknown>)
          : undefined;
      const otpUrl = String(data.url || nested?.url || data.websocket_url || data.ws_url || '');
      if (!otpUrl.startsWith('wss://')) {
        throw new Error('Deriv OTP response did not include a valid WebSocket URL.');
      }

      await derivWs.connectWithOtpUrlAndWait(otpUrl);

      onUpdateAccount({
        loginid: account.accountId,
        balance: account.balance,
        currency: account.currency || 'USD',
        otpWsUrl: otpUrl,
      });

      setSuccessMsg(`Switched active account to ${account.accountId} via OTP WebSocket.`);
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

  // Authorize PAT (supports both new developers.deriv.com REST PATs and legacy app.deriv.com WS tokens)
  const handlePatAuthorize = async () => {
    const cleanToken = tokenInput.trim();
    const cleanAppId = appIdInput.trim();
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
      // 1. If a registered App ID (not 1089) is provided or configured on server, test new REST PAT flow first
      let restPatError: string | null = null;
      if ((cleanAppId && cleanAppId !== '1089') || hasServerAppId) {
        try {
          const restResp = await fetch('/api/deriv/pat/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: cleanToken,
              appId: cleanAppId && cleanAppId !== '1089' ? cleanAppId : undefined,
            }),
          });
          const restData = (await restResp.json()) as {
            ok?: boolean;
            accounts?: DerivRestAccount[];
            otpWsUrl?: string;
            error?: string;
          };

          if (restResp.ok && restData.ok) {
            const list = restData.accounts || [];
            const first = list[0];
            if (cleanAppId && cleanAppId !== '1089') {
              try {
                localStorage.setItem('digitscope_oauth_client_id', cleanAppId);
              } catch {}
            }
            if (restData.otpWsUrl) {
              derivWs.connectWithOtpUrl(restData.otpWsUrl);
            } else if (derivWs.isSimulationActive()) {
              derivWs.toggleSimulation(false);
            } else {
              derivWs.connect();
            }
            onUpdateAccount({
              isAuthorized: true,
              authMethod: 'pat-rest',
              token: cleanToken,
              appId: cleanAppId || userAccount.appId,
              accounts: list,
              loginid: first?.accountId || `PAT App #${cleanAppId || 'Server'}`,
              balance: first?.balance,
              currency: first?.currency || 'USD',
              otpWsUrl: restData.otpWsUrl,
              isTradeEnabled: true,
            });
            setSuccessMsg(
              `Connected via Deriv REST PAT${first ? ` (${first.accountId})` : ''}${
                restData.otpWsUrl ? ' + OTP WebSocket' : ''
              }.`
            );
            setIsLoading(false);
            return;
          }
          restPatError = restData.error || null;
        } catch {
          // Fall through to legacy WebSocket authorize check
        }
      }

      // 2. Fallback: Legacy WebSocket v3 { authorize } (for tokens created at app.deriv.com/account/api-token)
      const wsAppId = cleanAppId || '1089';
      derivWs.clearCustomWsUrl();
      derivWs.setConfig(wsAppId, cleanToken);
      const res = await derivWs.authorize(cleanToken);

      if (res && res.authorize) {
        const authData = res.authorize;
        onUpdateAccount({
          isAuthorized: true,
          authMethod: 'pat',
          token: cleanToken,
          appId: wsAppId,
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
        setErrorMsg(restPatError || 'Authorization failed. Please verify your token.');
      }
    } catch (err: unknown) {
      const wsErr = err instanceof Error ? err.message : 'Failed to authenticate with Deriv API.';
      if (!cleanAppId || cleanAppId === '1089') {
        setErrorMsg(
          `${wsErr} — Note: If you created a Personal Access Token (PAT) on developers.deriv.com, you MUST also enter your Registered App ID (not 1089) above. Legacy WebSocket tokens must be generated at app.deriv.com/account/api-token.`
        );
      } else {
        setErrorMsg(
          `${wsErr} — Verify whether this is a developers.deriv.com PAT (matching App ID ${cleanAppId} with trade/account_manage scopes) or a legacy app.deriv.com API token.`
        );
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-[#121916] border border-[#2C3E36] shadow-2xl p-4 sm:p-6 relative max-h-[92dvh] overflow-y-auto">
        <button
          onClick={() => {
            stopOAuthWait();
            onClose();
          }}
          className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 p-1.5 rounded-lg text-[#9FB3AA] hover:text-white hover:bg-[#18221E] transition-colors cursor-pointer"
          aria-label="Close account modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#0F5C45]/35 border border-[#34D399]/35 flex items-center justify-center text-[#34D399] shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Deriv Account & OAuth 2.0</h3>
            <p className="text-xs text-[#9FB3AA]">
              PKCE OAuth 2.0 login, API token, or instant virtual demo
            </p>
          </div>
        </div>

        {/* Authorized State */}
        {userAccount.isAuthorized ? (
          <div className="space-y-4">
            <div
              className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${
                isTokenExpired
                  ? 'bg-[#F28C28]/12 border-[#F28C28]/40'
                  : 'bg-[#0F5C45]/25 border-[#34D399]/35'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-1.5 text-xs font-bold ${
                    isTokenExpired ? 'text-[#FFB56B]' : 'text-[#34D399]'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {userAccount.authMethod === 'oauth2'
                      ? isTokenExpired
                        ? 'OAuth 2.0 Session Expired'
                        : 'Authorized via Deriv OAuth 2.0 (PKCE)'
                      : userAccount.authMethod === 'pat-rest'
                      ? 'Authorized via Deriv REST PAT'
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

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#B8C7C0] font-mono">
                <span>
                  Active ID: <strong className="text-white">{userAccount.loginid}</strong>
                </span>
                {remainingLabel && (
                  <span className="flex items-center gap-1 text-[11px] text-[#9FB3AA]">
                    <Clock className="w-3 h-3" />
                    <span>{remainingLabel}</span>
                  </span>
                )}
              </div>

              {userAccount.scope && (
                <div className="text-[11px] font-mono text-[#9FB3AA] break-all">
                  Scopes: <span className="text-[#6EE7B7] font-semibold">{userAccount.scope}</span>
                </div>
              )}

              {(userAccount.authMethod === 'oauth2' || userAccount.authMethod === 'pat-rest') && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleRefreshAccounts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18221E] border border-[#2C3E36] hover:border-[#34D399]/50 text-xs text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Accounts</span>
                  </button>
                  {userAccount.authMethod === 'oauth2' && isTokenExpired && (
                    <button
                      type="button"
                      onClick={() => handleStartOAuth2()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-xs text-[#0B100E] font-extrabold transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Renew Access Token</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Accounts selector when OAuth2 or REST PAT returns accounts */}
            {(userAccount.authMethod === 'oauth2' || userAccount.authMethod === 'pat-rest') &&
              userAccount.accounts &&
              userAccount.accounts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-white">
                    Options Accounts (Obtain OTP WebSocket)
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {userAccount.accounts.map((acc) => {
                      const isCurrent = acc.accountId === userAccount.loginid;
                      return (
                        <div
                          key={acc.accountId}
                          className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono ${
                            isCurrent
                              ? 'bg-[#0F5C45]/30 border-[#34D399]/45'
                              : 'bg-[#18221E] border-[#2C3E36]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate">{acc.accountId}</div>
                            <div className="text-[11px] text-[#9FB3AA] tabular-nums">
                              {acc.accountType || 'options'} · {acc.currency || 'USD'}{' '}
                              {acc.balance !== undefined ? acc.balance.toFixed(2) : '--'}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleConnectOtpWs(acc)}
                            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0F5C45] hover:bg-[#147558] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50 shrink-0"
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
              <div className="p-2.5 rounded-xl bg-red-500/12 border border-red-500/40 text-xs text-red-300 font-medium">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-xl bg-[#0F5C45]/30 border border-[#34D399]/35 text-xs text-[#6EE7B7] font-medium">
                {successMsg}
              </div>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full py-2.5 rounded-xl bg-red-500/12 border border-red-500/35 text-red-300 text-xs font-bold hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              Disconnect Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick 1-Click Demo Option */}
            <div className="p-3.5 rounded-xl bg-[#0F5C45]/25 border border-[#34D399]/30">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F28C28]" />
                  <span>Instant Virtual Demo Mode</span>
                </span>
                <span className="text-[10px] font-mono text-[#34D399] font-bold">
                  $10,000 USD Virtual
                </span>
              </div>
              <p className="text-[11px] text-[#B8C7C0] leading-relaxed mb-2.5">
                Test the digit heatmap, pattern alerts, and multiplier risk model immediately with no login required.
              </p>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full py-2 rounded-lg bg-[#F28C28] hover:bg-[#FF9E3D] text-[#0B100E] font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Launch Virtual Demo Mode</span>
              </button>
            </div>

            {/* Auth Method Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#18221E] border border-[#2C3E36] text-[11px] sm:text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('oauth2');
                  setErrorMsg(null);
                }}
                className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer truncate ${
                  authTab === 'oauth2'
                    ? 'bg-[#0F5C45] text-white'
                    : 'text-[#9FB3AA] hover:text-white'
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
                className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer truncate ${
                  authTab === 'pat'
                    ? 'bg-[#0F5C45] text-white'
                    : 'text-[#9FB3AA] hover:text-white'
                }`}
              >
                API Token (PAT)
              </button>
            </div>

            {authTab === 'oauth2' ? (
              <div className="space-y-3.5">
                {/* App ID / client_id */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="text-xs font-semibold text-[#EBF2EE]">
                      Registered App ID (client_id)
                    </label>
                    <a
                      href="https://developers.deriv.com/dashboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#34D399] hover:text-[#F28C28] hover:underline flex items-center gap-1 font-mono font-semibold"
                    >
                      <span>Deriv Dashboard</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="text"
                    placeholder={
                      hasServerAppId
                        ? 'Configured on server (or enter App ID to override)'
                        : 'Paste your App ID from developers.deriv.com/dashboard'
                    }
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-xs text-white placeholder-[#7B9187] focus:outline-hidden focus:border-[#34D399] font-mono"
                  />
                  {!hasServerAppId && !appIdInput.trim() && (
                    <p className="mt-1 text-[11px] text-[#FFB56B] font-medium">
                      Required: paste the App ID from your OAuth 2.0 app on developers.deriv.com (sample ID 1089 causes a 404).
                    </p>
                  )}
                </div>

                {/* Exact Redirect URI Display & Copy */}
                <div>
                  <label className="block text-xs font-semibold text-[#EBF2EE] mb-1">
                    Required Redirect URL (Add in Deriv App Settings)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={redirectUri}
                      className="w-full min-w-0 px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-[11px] text-[#6EE7B7] font-mono font-medium focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleCopyRedirect}
                      className="px-3 py-2 rounded-xl bg-[#18221E] hover:bg-[#24322C] border border-[#2C3E36] text-white text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                    >
                      {copiedRedirect ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#34D399]" />
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
                  <label className="block text-xs font-semibold text-[#EBF2EE] mb-1.5">
                    Requested Scopes
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {AVAILABLE_SCOPES.map((sc) => {
                      const active = selectedScopes.includes(sc.id);
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => toggleScope(sc.id)}
                          className={`p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#0F5C45]/35 border-[#34D399]/60 text-white'
                              : 'bg-[#18221E] border-[#2C3E36] text-[#9FB3AA] hover:border-[#34D399]/40'
                          }`}
                        >
                          <div className="text-[11px] font-mono font-bold text-[#6EE7B7]">{sc.label}</div>
                          <div className="text-[10px] text-[#9FB3AA] truncate">{sc.desc}</div>
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
                    className="sm:col-span-2 py-2.5 px-4 rounded-xl bg-[#0F5C45] hover:bg-[#147558] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                    className="py-2.5 px-3 rounded-xl bg-[#18221E] hover:bg-[#24322C] text-white font-semibold text-xs border border-[#2C3E36] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                </div>

                {oauthWaiting && (
                  <div className="p-2.5 rounded-xl bg-[#F28C28]/12 border border-[#F28C28]/40 text-[11px] text-[#FFB56B] flex items-center justify-between gap-2">
                    <span>Complete login in the popup window. Exchanging PKCE code on server...</span>
                    <button
                      type="button"
                      onClick={stopOAuthWait}
                      className="text-white font-semibold hover:underline ml-2 cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* PAT Form (supports both developers.deriv.com REST PAT & legacy app.deriv.com WS token) */
              <div className="space-y-3.5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="text-xs font-semibold text-[#EBF2EE]">
                      Deriv API Token / PAT
                    </label>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <a
                        href="https://developers.deriv.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#34D399] hover:text-[#F28C28] hover:underline flex items-center gap-0.5 font-semibold"
                      >
                        <span>New PAT</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-[#4B5F57]">·</span>
                      <a
                        href="https://app.deriv.com/account/api-token"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#9FB3AA] hover:text-[#34D399] hover:underline flex items-center gap-0.5"
                      >
                        <span>Legacy WS</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-[#7B9187]">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder="Paste your PAT (developers.deriv.com) or legacy WS token"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-xs text-white placeholder-[#7B9187] focus:outline-hidden focus:border-[#34D399] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((prev) => !prev)}
                      className="absolute right-2.5 top-2 p-0.5 text-[#9FB3AA] hover:text-white cursor-pointer"
                      aria-label={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <label className="text-xs font-semibold text-[#EBF2EE]">
                      Registered Deriv App ID
                    </label>
                    <span className="text-[10px] font-mono text-[#9FB3AA]">
                      Required for developers.deriv.com PATs
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder={
                      hasServerAppId
                        ? 'Configured on server (or enter App ID to override)'
                        : 'Enter your registered App ID from developers.deriv.com'
                    }
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#18221E] border border-[#2C3E36] text-xs text-white placeholder-[#7B9187] focus:outline-hidden focus:border-[#34D399] font-mono"
                  />
                </div>

                <button
                  disabled={isLoading}
                  onClick={handlePatAuthorize}
                  className="w-full py-2.5 rounded-xl bg-[#0F5C45] hover:bg-[#147558] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Verifying Token with Deriv...' : 'Authorize API Token'}
                </button>
              </div>
            )}

            {/* Error & Troubleshooting */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/12 border border-red-500/40 text-xs text-red-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="font-semibold break-words">{errorMsg}</div>
                </div>
                <div className="pt-1.5 border-t border-red-500/25 text-[11px] text-[#B8C7C0] flex items-start gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#F28C28] shrink-0 mt-0.5" />
                  <span>
                    For OAuth 2.0, ensure the <strong className="text-white">Redirect URL</strong> above matches your Deriv app registration and that your selected scopes are enabled on your app.
                  </span>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-xl bg-[#0F5C45]/30 border border-[#34D399]/35 text-xs text-[#6EE7B7] font-medium">
                {successMsg}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-[#24322C] flex items-start gap-2 text-[11px] text-[#9FB3AA]">
          <ShieldCheck className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
          <span>
            <strong className="text-white">PKCE & Non-Custodial Security:</strong> Authorization codes are exchanged server-side using SHA-256 PKCE verification. Access tokens are never logged and stay scoped to your browser session.
          </span>
        </div>
      </div>
    </div>
  );
};
