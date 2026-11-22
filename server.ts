import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DERIV_AUTH_URL = 'https://auth.deriv.com/oauth2/auth';
const DERIV_TOKEN_URL = 'https://auth.deriv.com/oauth2/token';
const DERIV_API_BASE = 'https://api.derivws.com';

interface PendingOAuthSession {
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  createdAt: number;
  status: 'pending' | 'completed' | 'error';
  result?: {
    access_token: string;
    expires_in: number;
    token_type: string;
    expires_at: number;
    client_id: string;
    scope: string;
    accounts?: DerivRestAccount[];
  };
  error?: string;
}

interface DerivRestAccount {
  accountId: string;
  currency?: string;
  balance?: number;
  accountType?: string;
  raw?: Record<string, unknown>;
}

const oauthSessions = new Map<string, PendingOAuthSession>();

// Clean up stale OAuth sessions older than 15 minutes
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, session] of oauthSessions.entries()) {
    if (session.createdAt < cutoff) {
      oauthSessions.delete(key);
    }
  }
}, 5 * 60 * 1000);

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkcePair(): { codeVerifier: string; codeChallenge: string; state: string } {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const digest = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(digest);
  const state = base64UrlEncode(crypto.randomBytes(24));
  return { codeVerifier, codeChallenge, state };
}

function normalizeAccounts(payload: unknown): DerivRestAccount[] {
  const root = payload as Record<string, unknown> | unknown[];
  const list: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray((root as Record<string, unknown>)?.data)
      ? ((root as Record<string, unknown>).data as unknown[])
      : Array.isArray((root as Record<string, unknown>)?.accounts)
        ? ((root as Record<string, unknown>).accounts as unknown[])
        : [];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const accountId = String(
        item.accountId ?? item.account_id ?? item.id ?? item.loginid ?? ''
      );
      const balanceVal = item.balance !== undefined ? Number(item.balance) : undefined;
      return {
        accountId,
        currency: item.currency ? String(item.currency) : 'USD',
        balance: Number.isFinite(balanceVal) ? balanceVal : undefined,
        accountType: String(item.account_type ?? item.accountType ?? item.type ?? 'trading'),
        raw: item,
      };
    })
    .filter((acc) => acc.accountId.length > 0);
}

async function fetchDerivAccounts(accessToken: string): Promise<DerivRestAccount[]> {
  try {
    const resp = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    return normalizeAccounts(data);
  } catch {
    return [];
  }
}

function extractOtpWsUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const nested =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;
  const candidates = [
    nested?.url,
    nested?.websocket_url,
    nested?.ws_url,
    obj.url,
    obj.websocket_url,
    obj.ws_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('wss://')) {
      return c;
    }
  }
  return undefined;
}

function extractRestErrorMessage(payload: unknown, status?: number): string {
  if (!payload || typeof payload !== 'object') {
    return status ? `Deriv REST returned HTTP ${status}` : 'Deriv REST request failed';
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
  if (obj.error && typeof obj.error === 'object') {
    const errObj = obj.error as Record<string, unknown>;
    if (typeof errObj.message === 'string' && errObj.message.trim()) return errObj.message;
  }
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    const first = obj.errors[0] as Record<string, unknown>;
    if (typeof first?.message === 'string' && first.message.trim()) return first.message;
  }
  if (typeof obj.raw === 'string' && obj.raw.trim()) return obj.raw.slice(0, 200);
  return status ? `Deriv REST returned HTTP ${status}` : 'Deriv REST request failed';
}

function renderCallbackHtml(payload: {
  ok: boolean;
  state?: string;
  message: string;
  data?: unknown;
}): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Deriv OAuth Callback</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        background: #020617;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
        text-align: center;
      }
      .card {
        max-width: 420px;
        width: 100%;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 16px;
        padding: 24px;
      }
      .status { font-weight: 700; font-size: 16px; margin-bottom: 8px; color: ${payload.ok ? '#34d399' : '#fb7185'}; }
      .msg { font-size: 13px; color: #94a3b8; line-height: 1.5; }
      button {
        margin-top: 16px;
        background: #0891b2;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        font-weight: 600;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="status">${payload.ok ? 'Authorization Successful' : 'Authorization Failed'}</div>
      <div class="msg">${payload.message}</div>
      <button onclick="window.close()">Close Window</button>
    </div>
    <script>
      (function () {
        var result = ${safeJson};
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: result.ok ? 'DERIV_OAUTH_SUCCESS' : 'DERIV_OAUTH_ERROR',
              state: result.state,
              payload: result.data,
              error: result.ok ? null : result.message
            }, '*');
          }
        } catch (e) {}
        try {
          var bc = new BroadcastChannel('digitscope_deriv_oauth');
          bc.postMessage({
            type: result.ok ? 'DERIV_OAUTH_SUCCESS' : 'DERIV_OAUTH_ERROR',
            state: result.state,
            payload: result.data,
            error: result.ok ? null : result.message
          });
          bc.close();
        } catch (e) {}
        if (result.ok) {
          setTimeout(function () { window.close(); }, 600);
        }
      })();
    </script>
  </body>
</html>`;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/oauth/config', (_req: Request, res: Response) => {
    const serverAppId = (process.env.DERIV_APP_ID || '').trim();
    res.json({
      hasServerAppId: Boolean(serverAppId && serverAppId !== '1089'),
      serverAppId: serverAppId && serverAppId !== '1089' ? serverAppId : '',
    });
  });

  // 1. Construct Deriv OAuth2 + PKCE Authorization URL
  app.post('/api/oauth/url', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const clientId = String(body.client_id || process.env.DERIV_APP_ID || '').trim();
    const fallbackOrigin = process.env.APP_URL || `http://localhost:${PORT}`;
    const redirectUri = String(body.redirect_uri || `${fallbackOrigin.replace(/\/+$/, '')}/callback`).trim();
    const scope = String(body.scope || 'trade account_manage').trim();
    const prompt = body.prompt ? String(body.prompt).trim() : '';

    if (!clientId) {
      res.status(400).json({ error: 'Missing Deriv App ID (client_id).' });
      return;
    }

    if (clientId === '1089') {
      res.status(400).json({
        error:
          'App ID "1089" is Deriv\'s legacy public sample ID and is not registered for OAuth 2.0. Enter your own OAuth 2.0 App ID from developers.deriv.com/dashboard (or set DERIV_APP_ID in Render Environment).',
      });
      return;
    }

    const { codeVerifier, codeChallenge, state } = createPkcePair();

    oauthSessions.set(state, {
      codeVerifier,
      clientId,
      redirectUri,
      scope,
      createdAt: Date.now(),
      status: 'pending',
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (prompt === 'registration') {
      params.set('prompt', 'registration');
    }

    const url = `${DERIV_AUTH_URL}?${params.toString()}`;
    res.json({ url, state, redirect_uri: redirectUri });
  });

  // 2. Deriv OAuth2 Callback (receives ?code=...&state=..., exchanges on backend)
  const handleCallback = async (req: Request, res: Response) => {
    const code = req.query.code ? String(req.query.code) : '';
    const state = req.query.state ? String(req.query.state) : '';
    const errorParam = req.query.error ? String(req.query.error) : '';
    const errorDescription = req.query.error_description
      ? String(req.query.error_description)
      : '';

    if (errorParam) {
      if (state && oauthSessions.has(state)) {
        const sess = oauthSessions.get(state)!;
        sess.status = 'error';
        sess.error = errorDescription || errorParam;
      }
      res.status(400).send(
        renderCallbackHtml({
          ok: false,
          state,
          message: errorDescription || errorParam,
        })
      );
      return;
    }

    if (!code || !state) {
      res.status(400).send(
        renderCallbackHtml({
          ok: false,
          state,
          message: 'Missing authorization code or state parameter in callback.',
        })
      );
      return;
    }

    const session = oauthSessions.get(state);
    if (!session) {
      res.status(400).send(
        renderCallbackHtml({
          ok: false,
          state,
          message: 'OAuth state mismatch or expired session. Please try signing in again.',
        })
      );
      return;
    }

    try {
      const formBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: session.clientId,
        code,
        redirect_uri: session.redirectUri,
        code_verifier: session.codeVerifier,
      });

      const tokenResp = await fetch(DERIV_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formBody.toString(),
      });

      const tokenData = (await tokenResp.json()) as Record<string, unknown>;

      if (!tokenResp.ok || !tokenData.access_token) {
        const errMsg = String(
          tokenData.error_description || tokenData.error || 'Token exchange failed.'
        );
        session.status = 'error';
        session.error = errMsg;
        res.status(400).send(
          renderCallbackHtml({
            ok: false,
            state,
            message: errMsg,
          })
        );
        return;
      }

      const accessToken = String(tokenData.access_token);
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const tokenType = String(tokenData.token_type || 'Bearer');
      const expiresAt = Date.now() + expiresIn * 1000;

      const accounts = await fetchDerivAccounts(accessToken);

      const result = {
        access_token: accessToken,
        expires_in: expiresIn,
        token_type: tokenType,
        expires_at: expiresAt,
        client_id: session.clientId,
        scope: session.scope,
        accounts,
      };

      session.status = 'completed';
      session.result = result;

      res.send(
        renderCallbackHtml({
          ok: true,
          state,
          message: 'Connected to Deriv. You may close this window.',
          data: result,
        })
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unexpected token exchange error.';
      session.status = 'error';
      session.error = errMsg;
      res.status(500).send(
        renderCallbackHtml({
          ok: false,
          state,
          message: errMsg,
        })
      );
    }
  };

  app.get(['/callback', '/callback/', '/auth/callback', '/auth/callback/'], handleCallback);

  // 3. Poll OAuth session status (COOP-safe fallback when window.opener is blocked)
  app.get('/api/oauth/poll', (req: Request, res: Response) => {
    const state = req.query.state ? String(req.query.state) : '';
    if (!state || !oauthSessions.has(state)) {
      res.status(404).json({ status: 'not_found' });
      return;
    }

    const session = oauthSessions.get(state)!;
    if (session.status === 'pending') {
      res.json({ status: 'pending' });
      return;
    }

    if (session.status === 'error') {
      const error = session.error || 'OAuth authorization failed';
      oauthSessions.delete(state);
      res.json({ status: 'error', error });
      return;
    }

    const payload = session.result;
    oauthSessions.delete(state);
    res.json({ status: 'completed', payload });
  });

  // 4. Verify a new Deriv Personal Access Token (PAT) via REST + fetch OTP WS URL
  app.post('/api/deriv/pat/verify', async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const token = String(body.token || '').trim();
    const appId = String(body.appId || process.env.DERIV_APP_ID || '').trim();

    if (!token) {
      res.status(400).json({ error: 'Missing Personal Access Token.' });
      return;
    }
    if (!appId || appId === '1089') {
      res.status(400).json({
        error:
          'A registered Deriv App ID (from developers.deriv.com/dashboard, not 1089) is required to authenticate a REST Personal Access Token.',
      });
      return;
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Deriv-App-ID': appId,
        Accept: 'application/json',
      };

      const accResp = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
        method: 'GET',
        headers,
      });

      const accText = await accResp.text();
      let accParsed: unknown = {};
      try {
        accParsed = accText ? JSON.parse(accText) : {};
      } catch {
        accParsed = { raw: accText };
      }

      if (!accResp.ok) {
        res.status(accResp.status).json({
          error: extractRestErrorMessage(accParsed, accResp.status),
          details: accParsed,
        });
        return;
      }

      const accounts = normalizeAccounts(accParsed);
      let otpWsUrl: string | undefined;

      if (accounts.length > 0) {
        try {
          const otpResp = await fetch(
            `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(accounts[0].accountId)}/otp`,
            {
              method: 'POST',
              headers: {
                ...headers,
                'Content-Type': 'application/json',
              },
            }
          );
          if (otpResp.ok) {
            const otpData = await otpResp.json();
            otpWsUrl = extractOtpWsUrl(otpData);
          }
        } catch {
          // Non-fatal; user can still click Connect OTP later
        }
      }

      res.json({ ok: true, accounts, otpWsUrl });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to reach Deriv REST API',
      });
    }
  });

  // 5. Proxy Options Accounts lookup using Bearer token (+ optional Deriv-App-ID for PATs)
  app.get('/api/deriv/accounts', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer access token' });
      return;
    }

    const derivAppId = String(req.headers['deriv-app-id'] || process.env.DERIV_APP_ID || '').trim();
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: 'application/json',
    };
    if (derivAppId && derivAppId !== '1089') {
      headers['Deriv-App-ID'] = derivAppId;
    }

    try {
      const resp = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
        method: 'GET',
        headers,
      });

      const text = await resp.text();
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (!resp.ok) {
        res.status(resp.status).json({
          error: extractRestErrorMessage(parsed, resp.status),
          details: parsed,
        });
        return;
      }

      res.json({ accounts: normalizeAccounts(parsed), raw: parsed });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to reach Deriv REST API',
      });
    }
  });

  // 6. Proxy OTP WebSocket URL generation for an account
  app.post('/api/deriv/otp', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer access token' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const accountId = String(body.accountId || '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    const derivAppId = String(
      req.headers['deriv-app-id'] || body.appId || process.env.DERIV_APP_ID || ''
    ).trim();
    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (derivAppId && derivAppId !== '1089') {
      headers['Deriv-App-ID'] = derivAppId;
    }

    try {
      const resp = await fetch(
        `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
        {
          method: 'POST',
          headers,
        }
      );

      const text = await resp.text();
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (!resp.ok) {
        res.status(resp.status).json({
          error: extractRestErrorMessage(parsed, resp.status),
          details: parsed,
        });
        return;
      }

      const otpUrl = extractOtpWsUrl(parsed);
      if (!otpUrl) {
        res.status(502).json({
          error: 'Deriv OTP response did not include a WebSocket URL.',
          details: parsed,
        });
        return;
      }

      res.json({
        ...(typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}),
        url: otpUrl,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to request OTP WebSocket URL',
      });
    }
  });

  // Mount Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    console.log('[Server] Serving static from:', distDir);
    console.log('[Server] Dist exists:', existsSync(distDir));
    console.log('[Server] Dist contents:', readdirSync(distDir));
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      console.log('[Server] SPA fallback:', indexPath);
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DigitScope server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DigitScope server:', err);
  process.exit(1);
});
