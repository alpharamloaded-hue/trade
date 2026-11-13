import { AlertCircle, CheckCircle2, ExternalLink, HelpCircle, KeyRound, Lock, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { derivWs } from '../services/derivWs';
import { UserAuthAccount } from '../types/deriv';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAccount: UserAuthAccount;
  onUpdateAccount: (account: Partial<UserAuthAccount>) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  userAccount,
  onUpdateAccount,
}) => {
  const [tokenInput, setTokenInput] = useState(userAccount.token || '');
  const [appIdInput, setAppIdInput] = useState(userAccount.appId || '1089');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  if (!isOpen) return null;

  // Instant Demo Account Login - Zero external network dependency
  const handleDemoLogin = () => {
    setIsLoading(true);
    setErrorMsg(null);
    derivWs.toggleSimulation(true);
    onUpdateAccount({
      isAuthorized: true,
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

  const handleAuthorize = async () => {
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setErrorMsg('Please enter a valid Deriv API token or click "Instant Demo Mode"');
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
      derivWs.setConfig(appIdInput, cleanToken);
      const res = await derivWs.authorize(cleanToken);

      if (res && res.authorize) {
        const authData = res.authorize;
        onUpdateAccount({
          isAuthorized: true,
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
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to authenticate with Deriv API.');
      setShowTroubleshooter(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    derivWs.setConfig(appIdInput, '');
    onUpdateAccount({
      isAuthorized: false,
      token: '',
      loginid: undefined,
      balance: undefined,
      isTradeEnabled: false,
    });
    setTokenInput('');
    setSuccessMsg('Disconnected');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Deriv Account & API Connection</h3>
            <p className="text-xs text-slate-400">Live trading token or instant virtual demo</p>
          </div>
        </div>

        {/* Status banner */}
        {userAccount.isAuthorized ? (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 mb-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Authorized Active Account</span>
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {userAccount.currency} {userAccount.balance?.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-slate-300 font-mono">
              Login ID: <strong className="text-white">{userAccount.loginid}</strong>
            </div>
            <button
              onClick={handleDisconnect}
              className="mt-2 w-full py-2 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs font-medium hover:bg-rose-900/50 transition-colors cursor-pointer"
            >
              Disconnect Token
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick 1-Click Demo Option */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/50 to-slate-900 border border-cyan-800/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Option 1: Instant Demo Account</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">$10,000 USD Virtual</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                No API token needed. Test the full digit scanner, streak alerts, and risk visualizers immediately with zero risk.
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

            <div className="flex items-center gap-3 my-1">
              <div className="h-px bg-slate-800 flex-1" />
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Or Connect Live Deriv Token
              </span>
              <div className="h-px bg-slate-800 flex-1" />
            </div>

            {/* Live Token Form */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Deriv API Token
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

            {/* App ID Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Deriv App ID
                </label>
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                  <span>Presets:</span>
                  {[
                    { id: '1089', label: '1089 (Standard)' },
                    { id: '36300', label: '36300' },
                    { id: '16929', label: '16929' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAppIdInput(p.id)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        appIdInput === p.id
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                      }`}
                    >
                      {p.id}
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

            {/* Error Message & Interactive Troubleshooter */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="font-semibold">{errorMsg}</div>
                </div>

                <div className="pt-2 border-t border-rose-900/60 text-[11px] text-slate-300 space-y-1.5">
                  <div className="font-bold text-amber-300 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Why did the connection time out?</span>
                  </div>
                  <ul className="list-disc list-inside text-slate-400 space-y-0.5 pl-1">
                    <li><strong>Regional / Network Restrictions:</strong> Deriv restricts WebSocket connections in certain countries (e.g. UK, USA, parts of EU) or on strict corporate/proxy firewalls.</li>
                    <li><strong>Alternative App ID:</strong> Try clicking preset <strong>36300</strong> or <strong>16929</strong> above.</li>
                    <li><strong>Instant Workaround:</strong> Click the green <strong>"Launch Virtual Demo Mode"</strong> button at the top to explore and trade with full analytics without network restrictions.</li>
                  </ul>
                </div>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                {successMsg}
              </div>
            )}

            <button
              disabled={isLoading}
              onClick={handleAuthorize}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoading ? 'Connecting to Deriv Gateway...' : 'Authorize Live Token'}
            </button>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800 flex items-start gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Zero-Custody Guarantee:</strong> Tokens are stored strictly in client memory and are never transmitted to any third-party server.
          </span>
        </div>
      </div>
    </div>
  );
};
