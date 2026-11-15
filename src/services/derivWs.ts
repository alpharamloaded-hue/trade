/**
 * Deriv WebSocket Integration Client
 * - Dedicated public tick stream via wss://api.derivws.com/trading/v1/options/ws/public
 * - Dedicated authenticated trading socket for OTP WebSocket URLs or legacy WS tokens
 * - Heartbeat, stale-socket-safe reconnect, 1,000-tick ring buffer sync, and offline demo simulation
 */

import { DerivProposal, OpenContract, TickData } from '../types/deriv';
import { extractLastDigit } from '../utils/digitAnalysis';
import { getSymbolMeta } from '../utils/symbols';

type TickCallback = (tick: TickData) => void;
type HistoryCallback = (ticks: TickData[]) => void;
type ProposalCallback = (proposal: DerivProposal | null, error?: string) => void;
type OpenContractCallback = (contract: OpenContract) => void;
type BalanceCallback = (balance: number, currency?: string, loginid?: string) => void;
type StatusCallback = (status: 'connected' | 'connecting' | 'disconnected' | 'error', pingMs: number) => void;

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: unknown) => void;
  timeout: number;
}

const PUBLIC_OPTIONS_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
const LEGACY_GATEWAYS = [
  'wss://ws.derivws.com/websockets/v3',
  'wss://blue.derivws.com/websockets/v3',
  'wss://green.derivws.com/websockets/v3',
  'wss://red.derivws.com/websockets/v3',
];

class DerivWebSocketService {
  // Public market stream (always streams live ticks when not in demo simulation)
  private publicWs: WebSocket | null = null;
  // Authenticated trading socket (OTP WebSocket URL or legacy { authorize } socket)
  private authWs: WebSocket | null = null;
  private customWsUrl: string | null = null;

  private appId: string = '1089';
  private token: string = '';
  private currentSymbol: string = '1HZ100V';
  private subscriptionId: string | null = null;

  private isSimulated: boolean = false;
  private simInterval: number | null = null;
  private simPrice: number = 2854.38;

  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private lastPingSentAt: number = 0;
  private pingMs: number = 42;
  private gatewayIndex: number = 0;

  private tickListeners: Set<TickCallback> = new Set();
  private historyListeners: Set<HistoryCallback> = new Set();
  private proposalListeners: Set<ProposalCallback> = new Set();
  private contractListeners: Set<OpenContractCallback> = new Set();
  private balanceListeners: Set<BalanceCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  private pendingRequests: Map<number, PendingRequest> = new Map();
  private reqIdCounter: number = 1;
  private lastTick: TickData | null = null;

  constructor() {
    try {
      const savedAppId = localStorage.getItem('digitscope_app_id');
      if (savedAppId) this.appId = savedAppId;
      const savedToken = localStorage.getItem('digitscope_api_token');
      if (savedToken) this.token = savedToken;
    } catch {}
  }

  public setConfig(appId?: string, token?: string): void {
    let appChanged = false;
    if (appId && appId.trim() && appId.trim() !== this.appId) {
      this.appId = appId.trim();
      try {
        localStorage.setItem('digitscope_app_id', this.appId);
      } catch {}
      appChanged = true;
    }
    if (token !== undefined) {
      this.token = token.trim();
      try {
        if (this.token) localStorage.setItem('digitscope_api_token', this.token);
        else localStorage.removeItem('digitscope_api_token');
      } catch {}
    }
    if (appChanged && this.authWs) {
      this.closeSocket(this.authWs);
      this.authWs = null;
    }
  }

  private closeSocket(sock: WebSocket | null): void {
    if (!sock) return;
    sock.onopen = null;
    sock.onmessage = null;
    sock.onerror = null;
    sock.onclose = null;
    try {
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
        sock.close();
      }
    } catch {}
  }

  public getAppId(): string {
    return this.appId;
  }

  public getToken(): string {
    return this.token;
  }

  public isSimulationActive(): boolean {
    return this.isSimulated;
  }

  public toggleSimulation(active?: boolean): void {
    const target = active !== undefined ? active : !this.isSimulated;
    this.isSimulated = target;
    if (target) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.stopHeartbeat();
      this.closeSocket(this.publicWs);
      this.publicWs = null;
      this.closeSocket(this.authWs);
      this.authWs = null;
      this.startSimulation();
      this.notifyStatus('connected', 12);
    } else {
      this.stopSimulation();
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  public isAuthSocketOpen(): boolean {
    return Boolean(this.authWs && this.authWs.readyState === WebSocket.OPEN);
  }

  public connectWithOtpUrl(otpWsUrl: string): void {
    this.connectWithOtpUrlAndWait(otpWsUrl).catch(() => {});
  }

  public connectWithOtpUrlAndWait(otpWsUrl: string, timeoutMs: number = 7000): Promise<void> {
    this.customWsUrl = otpWsUrl;
    this.isSimulated = false;
    this.stopSimulation();
    this.reconnectAttempts = 0;

    // Ensure public market tick stream is active and moving
    this.connectPublicStream();

    // Open authenticated OTP WebSocket for trading & open contracts
    this.closeSocket(this.authWs);
    this.authWs = null;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out connecting to Deriv OTP trading WebSocket.'));
      }, timeoutMs);

      try {
        const sock = new WebSocket(otpWsUrl);
        this.authWs = sock;

        sock.onopen = () => {
          if (this.authWs !== sock) return;
          this.notifyStatus('connected', this.pingMs);
          this.sendRaw(sock, { balance: 1, subscribe: 1 }).catch(() => {});
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            resolve();
          }
        };

        sock.onmessage = (event) => {
          if (this.authWs !== sock) return;
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.error('Failed to parse Deriv OTP WS message:', e);
          }
        };

        sock.onerror = (err) => {
          if (this.authWs !== sock) return;
          console.warn('Deriv OTP WebSocket error:', err);
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(new Error('Deriv OTP WebSocket connection failed. Try refreshing your session in Connect API.'));
          }
        };

        sock.onclose = () => {
          if (this.authWs !== sock) return;
          this.authWs = null;
          // OTP URLs are single-use (120s TTL), so clear after close to avoid reconnecting with a spent URL
          this.customWsUrl = null;
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            reject(new Error('Deriv OTP WebSocket closed before opening.'));
          }
        };
      } catch (err) {
        window.clearTimeout(timer);
        this.customWsUrl = null;
        reject(err instanceof Error ? err : new Error('Failed to open Deriv OTP WebSocket.'));
      }
    });
  }

  public clearCustomWsUrl(): void {
    this.customWsUrl = null;
    this.closeSocket(this.authWs);
    this.authWs = null;
  }

  public connect(): void {
    if (this.isSimulated) {
      this.startSimulation();
      return;
    }

    this.connectPublicStream();
  }

  private connectPublicStream(): void {
    if (this.isSimulated) return;

    if (
      this.publicWs &&
      (this.publicWs.readyState === WebSocket.CONNECTING || this.publicWs.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    this.notifyStatus('connecting', 0);

    try {
      const sock = new WebSocket(PUBLIC_OPTIONS_WS_URL);
      this.publicWs = sock;

      sock.onopen = () => {
        if (this.publicWs !== sock) return;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.notifyStatus('connected', this.pingMs);
        this.subscribeSymbol(this.currentSymbol);
      };

      sock.onmessage = (event) => {
        if (this.publicWs !== sock) return;
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse Deriv Public WS message:', e);
        }
      };

      sock.onerror = (err) => {
        if (this.publicWs !== sock) return;
        console.warn('Deriv Public WebSocket error:', err);
        this.notifyStatus('error', 0);
      };

      sock.onclose = () => {
        if (this.publicWs !== sock) return;
        this.publicWs = null;
        this.stopHeartbeat();
        this.notifyStatus('disconnected', 0);
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('Public WebSocket init failed, switching to simulated mode:', err);
      this.toggleSimulation(true);
    }
  }

  public async ensureConnected(timeoutMs: number = 7000): Promise<void> {
    if (this.isSimulated) {
      this.isSimulated = false;
      this.stopSimulation();
    }

    this.connectPublicStream();

    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = window.setInterval(() => {
        if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Deriv WebSocket connection timed out. Please verify your internet connection.'));
        }
      }, 100);
    });
  }

  private async ensureLegacyAuthSocket(timeoutMs: number = 7000): Promise<WebSocket> {
    if (this.authWs && this.authWs.readyState === WebSocket.OPEN) {
      return this.authWs;
    }

    this.closeSocket(this.authWs);
    this.authWs = null;

    const gateway = LEGACY_GATEWAYS[this.gatewayIndex % LEGACY_GATEWAYS.length];
    const url = `${gateway}?app_id=${encodeURIComponent(this.appId || '1089')}&l=EN&brand=deriv`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.gatewayIndex++;
        this.closeSocket(sock);
        if (this.authWs === sock) this.authWs = null;
        reject(new Error('Legacy Deriv WebSocket gateway timed out.'));
      }, timeoutMs);

      const sock = new WebSocket(url);
      this.authWs = sock;

      sock.onopen = () => {
        if (settled || this.authWs !== sock) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(sock);
      };

      sock.onmessage = (event) => {
        if (this.authWs !== sock) return;
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch {}
      };

      sock.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.gatewayIndex++;
        this.closeSocket(sock);
        if (this.authWs === sock) this.authWs = null;
        reject(new Error('Legacy Deriv WebSocket gateway could not be reached.'));
      };

      sock.onclose = () => {
        if (this.authWs === sock) {
          this.authWs = null;
        }
      };
    });
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket(this.publicWs);
    this.publicWs = null;
    this.closeSocket(this.authWs);
    this.authWs = null;
    this.stopSimulation();
  }

  public reconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.isSimulated) return;
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= 5) {
      console.info('Switching to simulated mode after repeated live connection failures');
      this.toggleSimulation(true);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connectPublicStream();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
        this.lastPingSentAt = performance.now();
        this.sendRaw(this.publicWs, { ping: 1 }).catch(() => {});
      }
      if (this.authWs && this.authWs.readyState === WebSocket.OPEN) {
        this.sendRaw(this.authWs, { ping: 1 }).catch(() => {});
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public async authorize(token: string): Promise<any> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error('Please enter a valid Deriv API token');
    }

    if (cleanToken.toLowerCase() === 'demo' || cleanToken.toLowerCase().startsWith('demo-')) {
      return {
        authorize: {
          loginid: 'CR_DEMO_98124',
          balance: 10000.0,
          currency: 'USD',
          email: 'demo-trader@deriv.com',
          scopes: ['read', 'trade'],
        },
      };
    }

    this.isSimulated = false;
    this.stopSimulation();
    this.connectPublicStream();

    const sock = await this.ensureLegacyAuthSocket();
    const res = await this.sendRequestOnSocket(sock, { authorize: cleanToken });
    if (res?.authorize) {
      this.sendRaw(sock, { balance: 1, subscribe: 1 }).catch(() => {});
    }
    return res;
  }

  public subscribeSymbol(symbol: string): void {
    this.currentSymbol = symbol;
    this.lastTick = null;

    if (this.isSimulated) {
      this.startSimulation();
      return;
    }

    if (!this.publicWs || this.publicWs.readyState !== WebSocket.OPEN) {
      this.connectPublicStream();
      return;
    }

    if (this.subscriptionId) {
      this.sendRaw(this.publicWs, { forget: this.subscriptionId }).catch(() => {});
      this.subscriptionId = null;
    }

    const req = {
      ticks_history: symbol,
      end: 'latest',
      count: 1000,
      style: 'ticks',
      subscribe: 1,
      adjust_start_time: 1,
    };

    this.sendRaw(this.publicWs, req).catch((err) => {
      console.warn('Failed to subscribe ticks_history:', err);
    });
  }

  private getActiveTradingOrPublicSocket(): WebSocket | null {
    if (this.authWs && this.authWs.readyState === WebSocket.OPEN) {
      return this.authWs;
    }
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
      return this.publicWs;
    }
    return null;
  }

  private isNewApiSocket(sock: WebSocket | null): boolean {
    if (!sock) return true;
    return sock.url.includes('api.derivws.com');
  }

  public async fetchProposal(params: {
    contractType: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
    stake: number;
    symbol: string;
    currency?: string;
    duration?: number;
    barrier?: string;
    multiplier?: number;
    preferAuthSocket?: boolean;
  }): Promise<DerivProposal | null> {
    const currency = params.currency || 'USD';
    if (this.isSimulated) {
      const meta = getSymbolMeta(params.symbol);
      const isMatch = params.contractType === 'DIGITMATCH';
      const isDiffer = params.contractType === 'DIGITDIFF';
      const payout = isMatch
        ? Number((params.stake * 9.2).toFixed(2))
        : isDiffer
        ? Number((params.stake * 1.09).toFixed(2))
        : Number((params.stake * (params.multiplier || 50)).toFixed(2));

      const mockProp: DerivProposal = {
        id: `prop-sim-${Date.now()}`,
        ask_price: params.stake,
        payout,
        longcode: `Win payout if spot ${params.contractType} target on ${meta.displayName}`,
        spot: this.simPrice,
        spot_time: Math.floor(Date.now() / 1000),
        barrier: params.barrier,
      };
      this.notifyProposal(mockProp);
      return mockProp;
    }

    try {
      let sock = params.preferAuthSocket
        ? (this.authWs && this.authWs.readyState === WebSocket.OPEN ? this.authWs : null)
        : this.getActiveTradingOrPublicSocket();
      if (!sock && !params.preferAuthSocket) {
        await this.ensureConnected(4000).catch(() => {});
        sock = this.getActiveTradingOrPublicSocket();
      }
      if (!sock) {
        return null;
      }

      const payload: Record<string, unknown> = {
        proposal: 1,
        amount: params.stake,
        basis: 'stake',
        contract_type: params.contractType,
        currency,
      };

      if (this.isNewApiSocket(sock)) {
        payload.underlying_symbol = params.symbol;
      } else {
        payload.symbol = params.symbol;
      }

      if (params.contractType.startsWith('DIGIT')) {
        payload.duration = params.duration || 1;
        payload.duration_unit = 't';
        if (params.barrier !== undefined) {
          payload.barrier = String(params.barrier);
        }
      } else if (params.contractType.startsWith('MULT')) {
        payload.multiplier = params.multiplier || 100;
      }

      const res: any = await this.sendRequestOnSocket(sock, payload);
      if (res && res.proposal) {
        const prop: DerivProposal = {
          id: res.proposal.id,
          ask_price: Number(res.proposal.ask_price),
          payout: Number(res.proposal.payout || res.proposal.ask_price),
          longcode: res.proposal.longcode,
          spot: Number(res.proposal.spot),
          spot_time: res.proposal.spot_time,
          barrier: res.proposal.contract_details?.barrier ?? res.proposal.barrier,
          commission: res.proposal.commission !== undefined ? Number(res.proposal.commission) : undefined,
        };
        this.notifyProposal(prop);
        return prop;
      }
      return null;
    } catch (err: any) {
      this.notifyProposal(null, err?.message || 'Proposal request failed');
      return null;
    }
  }

  public async executeBuy(proposalId: string, price: number): Promise<any> {
    if (this.isSimulated) {
      const mockContract: OpenContract = {
        contract_id: Math.floor(Math.random() * 900000) + 100000,
        contract_type: 'SIMULATION',
        buy_price: price,
        current_spot: this.simPrice,
        profit: 0,
        profit_percentage: 0,
        status: 'open',
        entry_tick: this.simPrice,
        date_start: Math.floor(Date.now() / 1000),
      };
      this.notifyContract(mockContract);
      return { buy: { contract_id: mockContract.contract_id, balance_after: 9850 } };
    }

    if (!this.authWs || this.authWs.readyState !== WebSocket.OPEN) {
      throw new Error(
        'Authenticated trading WebSocket is not active. Open Connect API and authorize your account or launch Demo Mode.'
      );
    }

    const buyRes: any = await this.sendRequestOnSocket(this.authWs, {
      buy: proposalId,
      price,
      subscribe: 1,
    });

    if (buyRes?.buy?.contract_id && !buyRes?.subscription) {
      this.sendRaw(this.authWs, {
        proposal_open_contract: 1,
        contract_id: buyRes.buy.contract_id,
        subscribe: 1,
      }).catch(() => {});
    }

    return buyRes;
  }

  public async fetchContractStatus(contractId: number, subscribe: boolean = false): Promise<OpenContract | null> {
    if (this.isSimulated) return null;
    if (!this.authWs || this.authWs.readyState !== WebSocket.OPEN) {
      return null;
    }

    let parsed: OpenContract | null = null;
    try {
      const payload: Record<string, unknown> = {
        proposal_open_contract: 1,
        contract_id: contractId,
      };
      if (subscribe) {
        payload.subscribe = 1;
      }
      const res: any = await this.sendRequestOnSocket(this.authWs, payload);
      if (res?.proposal_open_contract) {
        parsed = this.parseOpenContract(res.proposal_open_contract);
        if (parsed.status !== 'open') {
          return parsed;
        }
      }
    } catch {
      // Fall through to profit_table check below
    }

    // Fallback: check profit_table in case a 1-tick contract settled before proposal_open_contract updated
    try {
      const ptRes: any = await this.sendRequestOnSocket(this.authWs, {
        profit_table: 1,
        limit: 15,
        sort: 'DESC',
      });
      const txList: any[] = ptRes?.profit_table?.transactions || [];
      const match = txList.find((tx) => Number(tx.contract_id) === Number(contractId));
      if (match) {
        const buyPrice = Number(match.buy_price ?? parsed?.buy_price ?? 0);
        const sellPrice = Number(match.sell_price ?? 0);
        const profit = Number((sellPrice - buyPrice).toFixed(2));
        const profitPct = buyPrice > 0 ? Number(((profit / buyPrice) * 100).toFixed(1)) : 0;
        const settled: OpenContract = {
          ...(parsed || {
            contract_id: Number(contractId),
            contract_type: String(match.contract_type || ''),
            buy_price: buyPrice,
            current_spot: 0,
            entry_tick: 0,
            date_start: Number(match.purchase_time ?? Math.floor(Date.now() / 1000)),
          }),
          buy_price: buyPrice,
          sell_price: sellPrice,
          payout: Number(match.payout ?? sellPrice),
          profit,
          profit_percentage: profitPct,
          is_sold: 1,
          is_valid_to_sell: 0,
          status: sellPrice > 0 ? 'won' : 'lost',
        };
        this.notifyContract(settled);
        return settled;
      }
    } catch {
      // Ignore profit_table fallback failure
    }

    return parsed;
  }

  public async sellContract(contractId: number): Promise<any> {
    if (this.isSimulated) {
      return { sell: { sold_for: 10, contract_id: contractId } };
    }
    if (!this.authWs || this.authWs.readyState !== WebSocket.OPEN) {
      throw new Error('Authenticated trading WebSocket is not active. Reconnect OTP in Account modal.');
    }
    const sellRes: any = await this.sendRequestOnSocket(this.authWs, {
      sell: contractId,
      price: 0,
    });
    if (sellRes?.sell?.balance_after !== undefined) {
      this.notifyBalance(Number(sellRes.sell.balance_after));
    }
    this.sendRaw(this.authWs, {
      proposal_open_contract: 1,
      contract_id: contractId,
    }).catch(() => {});
    return sellRes;
  }

  // --- Internal Message Router ---
  private handleMessage(data: Record<string, any>): void {
    if (data.req_id && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      window.clearTimeout(pending.timeout);

      if (data.error) {
        pending.reject(new Error(data.error.message || 'Deriv API Error'));
      } else {
        pending.resolve(data);
      }
    }

    if (data.msg_type === 'ping') {
      if (this.lastPingSentAt > 0) {
        this.pingMs = Math.round(performance.now() - this.lastPingSentAt);
        this.notifyStatus('connected', this.pingMs);
      }
      return;
    }

    if (data.msg_type === 'history' && data.history) {
      const meta = getSymbolMeta(this.currentSymbol);
      const times: number[] = data.history.times || [];
      const prices: number[] = data.history.prices || [];

      const parsedTicks: TickData[] = [];
      for (let i = 0; i < times.length; i++) {
        const quote = Number(prices[i]);
        const prevQuote = i > 0 ? Number(prices[i - 1]) : quote;
        const direction: 'up' | 'down' | 'flat' =
          quote > prevQuote ? 'up' : quote < prevQuote ? 'down' : 'flat';
        const lastDigit = extractLastDigit(quote, meta.decimals);

        parsedTicks.push({
          epoch: times[i],
          quote,
          lastDigit,
          direction,
          symbol: this.currentSymbol,
        });
      }

      if (parsedTicks.length > 0) {
        this.lastTick = parsedTicks[parsedTicks.length - 1];
      }

      if (data.subscription) {
        this.subscriptionId = data.subscription.id;
      }

      this.notifyHistory(parsedTicks);
      return;
    }

    if (data.msg_type === 'tick' && data.tick) {
      const symbol = data.tick.symbol || this.currentSymbol;
      const meta = getSymbolMeta(symbol);
      const quote = Number(data.tick.quote);
      const prevQuote = this.lastTick ? this.lastTick.quote : quote;
      const direction: 'up' | 'down' | 'flat' =
        quote > prevQuote ? 'up' : quote < prevQuote ? 'down' : 'flat';
      const lastDigit = extractLastDigit(quote, meta.decimals);

      const tickObj: TickData = {
        epoch: data.tick.epoch,
        quote,
        lastDigit,
        direction,
        symbol,
      };

      this.lastTick = tickObj;
      if (data.subscription) {
        this.subscriptionId = data.subscription.id;
      }

      this.notifyTick(tickObj);
      return;
    }

    if (data.msg_type === 'proposal' && data.proposal) {
      const prop: DerivProposal = {
        id: data.proposal.id,
        ask_price: Number(data.proposal.ask_price),
        payout: Number(data.proposal.payout || resFallback(data.proposal.ask_price)),
        longcode: data.proposal.longcode,
        spot: Number(data.proposal.spot),
        spot_time: data.proposal.spot_time,
        barrier: data.proposal.contract_details?.barrier ?? data.proposal.barrier,
        commission: data.proposal.commission !== undefined ? Number(data.proposal.commission) : undefined,
      };
      this.notifyProposal(prop);
      return;
    }

    if (data.msg_type === 'balance' && data.balance) {
      const bal = Number(data.balance.balance);
      if (Number.isFinite(bal)) {
        this.notifyBalance(bal, data.balance.currency, data.balance.loginid);
      }
      return;
    }

    if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      const contract = this.parseOpenContract(data.proposal_open_contract);
      this.notifyContract(contract);
    }
  }

  private parseOpenContract(poc: Record<string, any>): OpenContract {
    const buyPrice = Number(poc.buy_price ?? 0);
    const profit = Number(poc.profit ?? 0);
    const rawStatus = poc.status as string | null | undefined;
    const isSoldFlag = Number(poc.is_sold || 0) === 1;
    const isExpiredFlag = Number(poc.is_expired || 0) === 1;

    let status: OpenContract['status'] =
      rawStatus === 'won' ||
      rawStatus === 'lost' ||
      rawStatus === 'sold' ||
      rawStatus === 'cancelled'
        ? rawStatus
        : isExpiredFlag
          ? profit >= 0
            ? 'won'
            : 'lost'
          : isSoldFlag
            ? 'sold'
            : 'open';

    const profitPct =
      poc.profit_percentage !== undefined && Number.isFinite(Number(poc.profit_percentage))
        ? Number(poc.profit_percentage)
        : buyPrice > 0
          ? Number(((profit / buyPrice) * 100).toFixed(2))
          : 0;

    return {
      contract_id: Number(poc.contract_id),
      contract_type: String(poc.contract_type || ''),
      buy_price: buyPrice,
      current_spot: Number(poc.current_spot ?? poc.exit_spot ?? poc.entry_spot ?? poc.entry_tick ?? 0),
      profit,
      profit_percentage: profitPct,
      status,
      entry_tick: Number(poc.entry_spot ?? poc.entry_tick ?? poc.barrier ?? 0),
      exit_tick:
        poc.exit_spot !== undefined && poc.exit_spot !== null
          ? Number(poc.exit_spot)
          : poc.exit_tick !== undefined && poc.exit_tick !== null
            ? Number(poc.exit_tick)
            : undefined,
      barrier: poc.barrier !== undefined && poc.barrier !== null ? String(poc.barrier) : undefined,
      date_start: Number(poc.date_start ?? poc.purchase_time ?? Math.floor(Date.now() / 1000)),
      multiplier: poc.multiplier !== undefined ? Number(poc.multiplier) : undefined,
      payout: poc.payout !== undefined ? Number(poc.payout) : undefined,
      sell_price: poc.sell_price !== undefined && poc.sell_price !== null ? Number(poc.sell_price) : undefined,
      is_valid_to_sell: poc.is_valid_to_sell !== undefined ? Number(poc.is_valid_to_sell) : undefined,
      is_sold: poc.is_sold !== undefined ? Number(poc.is_sold) : undefined,
      validation_error: typeof poc.validation_error === 'string' ? poc.validation_error : undefined,
      symbol: typeof poc.underlying_symbol === 'string' ? poc.underlying_symbol : undefined,
    };
  }

  private sendRequestOnSocket(
    sock: WebSocket | null,
    payload: Record<string, any>,
    timeoutMs: number = 8000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        return reject(new Error('Deriv WebSocket is not open. Please try again.'));
      }

      const req_id = this.reqIdCounter++;
      const reqPayload = { ...payload, req_id };

      const timer = window.setTimeout(() => {
        this.pendingRequests.delete(req_id);
        reject(new Error(`Deriv API request timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(req_id, {
        resolve,
        reject,
        timeout: timer,
      });

      sock.send(JSON.stringify(reqPayload));
    });
  }

  private sendRaw(sock: WebSocket | null, payload: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not open'));
      }
      sock.send(JSON.stringify(payload));
      resolve();
    });
  }

  // --- Simulation Engine for Offline / Fallback Testing ---
  private startSimulation(): void {
    this.stopSimulation();
    const meta = getSymbolMeta(this.currentSymbol);

    const baseMap: Record<string, number> = {
      R_10: 5410.25,
      '1HZ10V': 3120.45,
      R_25: 4180.12,
      '1HZ25V': 2950.88,
      R_50: 184.234,
      '1HZ50V': 412.56,
      R_75: 751.294,
      '1HZ75V': 620.45,
      R_100: 2854.38,
      '1HZ100V': 1420.75,
      '1HZ150V': 8540.2,
      '1HZ250V': 12450.9,
    };
    this.simPrice = baseMap[this.currentSymbol] || 1500.5;

    const now = Math.floor(Date.now() / 1000);
    const mockHistory: TickData[] = [];
    let p = this.simPrice;

    for (let i = 1000; i >= 1; i--) {
      const step = (Math.random() - 0.495) * (p * 0.0004);
      const nextP = Number((p + step).toFixed(meta.decimals));
      const dir: 'up' | 'down' | 'flat' = nextP > p ? 'up' : nextP < p ? 'down' : 'flat';
      p = nextP;

      mockHistory.push({
        epoch: now - i,
        quote: p,
        lastDigit: extractLastDigit(p, meta.decimals),
        direction: dir,
        symbol: this.currentSymbol,
      });
    }

    this.simPrice = p;
    this.lastTick = mockHistory[mockHistory.length - 1] || null;
    this.notifyHistory(mockHistory);

    this.simInterval = window.setInterval(() => {
      const step = (Math.random() - 0.498) * (this.simPrice * 0.0004);
      const nextP = Number((this.simPrice + step).toFixed(meta.decimals));
      const dir: 'up' | 'down' | 'flat' = nextP > this.simPrice ? 'up' : nextP < this.simPrice ? 'down' : 'flat';
      this.simPrice = nextP;

      const tick: TickData = {
        epoch: Math.floor(Date.now() / 1000),
        quote: nextP,
        lastDigit: extractLastDigit(nextP, meta.decimals),
        direction: dir,
        symbol: this.currentSymbol,
      };
      this.lastTick = tick;
      this.notifyTick(tick);
    }, 1000);
  }

  private stopSimulation(): void {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  // --- Subscriptions & Listeners ---
  public onTick(cb: TickCallback): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  public onHistory(cb: HistoryCallback): () => void {
    this.historyListeners.add(cb);
    return () => this.historyListeners.delete(cb);
  }

  public onProposal(cb: ProposalCallback): () => void {
    this.proposalListeners.add(cb);
    return () => this.proposalListeners.delete(cb);
  }

  public onContract(cb: OpenContractCallback): () => void {
    this.contractListeners.add(cb);
    return () => this.contractListeners.delete(cb);
  }

  public onBalance(cb: BalanceCallback): () => void {
    this.balanceListeners.add(cb);
    return () => this.balanceListeners.delete(cb);
  }

  public onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private notifyTick(tick: TickData): void {
    this.tickListeners.forEach((cb) => {
      try {
        cb(tick);
      } catch (err) {
        console.error('Tick listener error:', err);
      }
    });
  }

  private notifyHistory(ticks: TickData[]): void {
    this.historyListeners.forEach((cb) => {
      try {
        cb(ticks);
      } catch (err) {
        console.error('History listener error:', err);
      }
    });
  }

  private notifyProposal(prop: DerivProposal | null, error?: string): void {
    this.proposalListeners.forEach((cb) => {
      try {
        cb(prop, error);
      } catch (err) {
        console.error('Proposal listener error:', err);
      }
    });
  }

  private notifyContract(c: OpenContract): void {
    this.contractListeners.forEach((cb) => {
      try {
        cb(c);
      } catch (err) {
        console.error('Contract listener error:', err);
      }
    });
  }

  private notifyBalance(balance: number, currency?: string, loginid?: string): void {
    this.balanceListeners.forEach((cb) => {
      try {
        cb(balance, currency, loginid);
      } catch (err) {
        console.error('Balance listener error:', err);
      }
    });
  }

  private notifyStatus(
    status: 'connected' | 'connecting' | 'disconnected' | 'error',
    ping: number
  ): void {
    this.statusListeners.forEach((cb) => {
      try {
        cb(status, ping);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    });
  }
}

function resFallback(val: unknown): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export const derivWs = new DerivWebSocketService();
