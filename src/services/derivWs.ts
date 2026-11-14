/**
 * Deriv WebSocket Integration Client with Heartbeat, Reconnect,
 * Ring Buffer Sync, and Simulation Fallback
 */

import { DerivProposal, OpenContract, TickData } from '../types/deriv';
import { extractLastDigit } from '../utils/digitAnalysis';
import { getSymbolMeta } from '../utils/symbols';

type TickCallback = (tick: TickData) => void;
type HistoryCallback = (ticks: TickData[]) => void;
type ProposalCallback = (proposal: DerivProposal | null, error?: string) => void;
type OpenContractCallback = (contract: OpenContract) => void;
type StatusCallback = (status: 'connected' | 'connecting' | 'disconnected' | 'error', pingMs: number) => void;

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: unknown) => void;
  timeout: number;
}

class DerivWebSocketService {
  private ws: WebSocket | null = null;
  private appId: string = '1089';
  private token: string = '';
  private currentSymbol: string = '1HZ100V';
  private subscriptionId: string | null = null;
  private proposalSubscriptionId: string | null = null;

  private isSimulated: boolean = false;
  private simInterval: number | null = null;
  private simPrice: number = 2854.38;

  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private lastPingSentAt: number = 0;
  private pingMs: number = 42;

  private tickListeners: Set<TickCallback> = new Set();
  private historyListeners: Set<HistoryCallback> = new Set();
  private proposalListeners: Set<ProposalCallback> = new Set();
  private contractListeners: Set<OpenContractCallback> = new Set();
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
    if (appChanged) {
      this.reconnect();
    }
  }

  public async ensureConnected(timeoutMs: number = 7000): Promise<void> {
    if (this.isSimulated) {
      this.isSimulated = false;
      this.stopSimulation();
      this.connect();
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = window.setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(
            new Error(
              `Deriv WebSocket connection timed out. Please verify your internet connection or check if App ID ${this.appId} is valid.`
            )
          );
        }
      }, 100);
    });
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
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.startSimulation();
      this.notifyStatus('connected', 12);
    } else {
      this.stopSimulation();
      this.connect();
    }
  }

  private gatewayIndex: number = 0;
  private customWsUrl: string | null = null;
  private readonly GATEWAYS = [
    'wss://ws.derivws.com/websockets/v3',
    'wss://blue.derivws.com/websockets/v3',
    'wss://green.derivws.com/websockets/v3',
    'wss://red.derivws.com/websockets/v3',
  ];

  public connectWithOtpUrl(otpWsUrl: string): void {
    this.customWsUrl = otpWsUrl;
    this.isSimulated = false;
    this.stopSimulation();
    this.reconnect();
  }

  public clearCustomWsUrl(): void {
    this.customWsUrl = null;
  }

  public connect(): void {
    if (this.isSimulated) {
      this.startSimulation();
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.notifyStatus('connecting', 0);
    const baseGateway = this.GATEWAYS[this.gatewayIndex % this.GATEWAYS.length];
    const url = this.customWsUrl || `${baseGateway}?app_id=${this.appId}&l=EN&brand=deriv`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.notifyStatus('connected', this.pingMs);

        // Only send legacy { authorize } if a PAT token is set and we are not using an OTP URL
        if (this.token && !this.customWsUrl && !this.token.startsWith('ory_at_')) {
          this.authorize(this.token).catch(() => {});
        }

        // Subscribe to currently selected symbol
        this.subscribeSymbol(this.currentSymbol);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse Deriv WS message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn(`Deriv WebSocket error on ${baseGateway}:`, err);
        this.gatewayIndex++;
        this.notifyStatus('error', 0);
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.notifyStatus('disconnected', 0);
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('WebSocket connection init failed, starting fallback simulation', err);
      this.toggleSimulation(true);
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopSimulation();
  }

  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.isSimulated) return;
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= 3) {
      // If 3 consecutive failures to connect, fall back to simulation to ensure continuous user analytics
      console.info('Switching to simulated mode after connection failures');
      this.toggleSimulation(true);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSentAt = performance.now();
        this.sendRaw({ ping: 1 }).catch(() => {});
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

    // Test token shortcut for demo accounts
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

    // Ensure live WebSocket connection is open before issuing authorize request
    await this.ensureConnected();
    const resp = await this.sendRequest({ authorize: cleanToken });
    return resp;
  }

  public subscribeSymbol(symbol: string): void {
    this.currentSymbol = symbol;
    const meta = getSymbolMeta(symbol);

    if (this.isSimulated) {
      this.startSimulation();
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Forget previous subscription if active
    if (this.subscriptionId) {
      this.sendRaw({ forget: this.subscriptionId }).catch(() => {});
      this.subscriptionId = null;
    }

    // Request history (1,000 ticks) and subscribe to live stream
    const req = {
      ticks_history: symbol,
      end: 'latest',
      count: 1000,
      style: 'ticks',
      subscribe: 1,
      adjust_start_time: 1,
    };

    this.sendRaw(req).catch((err) => {
      console.warn('Failed to subscribe ticks_history:', err);
    });
  }

  public async fetchProposal(params: {
    contractType: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
    stake: number;
    symbol: string;
    duration?: number;
    barrier?: string;
    multiplier?: number;
  }): Promise<DerivProposal | null> {
    if (this.isSimulated) {
      // Simulate proposal pricing
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
      const payload: Record<string, any> = {
        proposal: 1,
        amount: params.stake,
        basis: 'stake',
        contract_type: params.contractType,
        currency: 'USD',
        symbol: params.symbol,
      };

      if (params.contractType.startsWith('DIGIT')) {
        payload.duration = params.duration || 1;
        payload.duration_unit = 't';
        if (params.barrier !== undefined) {
          payload.barrier = String(params.barrier);
        }
      } else if (params.contractType.startsWith('MULT')) {
        payload.multiplier = params.multiplier || 100;
      }

      const res: any = await this.sendRequest(payload);
      if (res && res.proposal) {
        const prop: DerivProposal = {
          id: res.proposal.id,
          ask_price: Number(res.proposal.ask_price),
          payout: Number(res.proposal.payout || res.proposal.ask_price),
          longcode: res.proposal.longcode,
          spot: Number(res.proposal.spot),
          spot_time: res.proposal.spot_time,
          barrier: res.proposal.barrier,
          commission: res.proposal.commission,
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

    const res: any = await this.sendRequest({
      buy: proposalId,
      price,
    });
    return res;
  }

  public async sellContract(contractId: number): Promise<any> {
    if (this.isSimulated) {
      return { sell: { sold_for: 10, contract_id: contractId } };
    }
    return this.sendRequest({
      sell: contractId,
      price: 0,
    });
  }

  // --- Internal Message Router ---
  private handleMessage(data: Record<string, any>): void {
    // 1. Check req_id promises
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

    // 2. Ping latency measurement
    if (data.msg_type === 'ping') {
      if (this.lastPingSentAt > 0) {
        this.pingMs = Math.round(performance.now() - this.lastPingSentAt);
        this.notifyStatus('connected', this.pingMs);
      }
      return;
    }

    // 3. Tick History initial payload
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

      if (data.subscription) {
        this.subscriptionId = data.subscription.id;
      }

      this.notifyHistory(parsedTicks);
      return;
    }

    // 4. Real-time tick stream
    if (data.msg_type === 'tick' && data.tick) {
      const meta = getSymbolMeta(data.tick.symbol || this.currentSymbol);
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
        symbol: data.tick.symbol || this.currentSymbol,
      };

      this.lastTick = tickObj;
      if (data.subscription) {
        this.subscriptionId = data.subscription.id;
      }

      this.notifyTick(tickObj);
      return;
    }

    // 5. Live proposal stream update
    if (data.msg_type === 'proposal' && data.proposal) {
      const prop: DerivProposal = {
        id: data.proposal.id,
        ask_price: Number(data.proposal.ask_price),
        payout: Number(data.proposal.payout || data.proposal.ask_price),
        longcode: data.proposal.longcode,
        spot: Number(data.proposal.spot),
        spot_time: data.proposal.spot_time,
        barrier: data.proposal.barrier,
        commission: data.proposal.commission,
      };
      this.notifyProposal(prop);
      return;
    }

    // 6. Proposal open contract stream update
    if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      const poc = data.proposal_open_contract;
      const contract: OpenContract = {
        contract_id: poc.contract_id,
        contract_type: poc.contract_type,
        buy_price: Number(poc.buy_price),
        current_spot: Number(poc.current_spot),
        profit: Number(poc.profit),
        profit_percentage: Number(poc.profit_percentage),
        status: poc.status,
        entry_tick: Number(poc.entry_tick || poc.barrier),
        barrier: poc.barrier,
        date_start: poc.date_start,
        multiplier: poc.multiplier,
        is_valid_to_sell: poc.is_valid_to_sell,
      };
      this.notifyContract(contract);
    }
  }

  // --- Request Promise wrapper ---
  private async sendRequest(payload: Record<string, any>, timeoutMs: number = 8000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.ensureConnected(4000).catch(() => {});
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(
          new Error(
            'Deriv WebSocket is currently connecting. Please check your internet connection and try again.'
          )
        );
      }

      const req_id = this.reqIdCounter++;
      payload.req_id = req_id;

      const timer = window.setTimeout(() => {
        this.pendingRequests.delete(req_id);
        reject(new Error(`Deriv API request timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(req_id, {
        resolve,
        reject,
        timeout: timer,
      });

      this.ws.send(JSON.stringify(payload));
    });
  }

  private sendRaw(payload: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not open'));
      }
      this.ws.send(JSON.stringify(payload));
      resolve();
    });
  }

  // --- Simulation Engine for Offline / Fallback Testing ---
  private startSimulation(): void {
    this.stopSimulation();
    const meta = getSymbolMeta(this.currentSymbol);

    // Initial base prices per symbol
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

    // Generate historical 1,000 ticks
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
    this.notifyHistory(mockHistory);

    // 1-second live tick generator
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

export const derivWs = new DerivWebSocketService();
