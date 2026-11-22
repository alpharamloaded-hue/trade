/**
 * Type definitions for DigitScope Analytics & Deriv API integration
 */

export interface SyntheticSymbol {
  symbol: string;
  displayName: string;
  decimals: number;
  market: 'synthetic_index';
  description: string;
}

export interface TickData {
  epoch: number;
  quote: number;
  lastDigit: number;
  direction: 'up' | 'down' | 'flat';
  symbol: string;
}

export type RollingWindowSize = 50 | 100 | 500 | 1000;

export interface DigitStat {
  digit: number;
  count: number;
  frequency: number; // 0 to 100 %
  deviation: number; // percentage points from 10.0%
  currentStreak: number; // ticks since last appeared
  maxStreak: number; // maximum drought ticks recorded
  isHot: boolean; // frequency >= 12%
  isCold: boolean; // frequency <= 8%
}

export interface PatternDetection {
  id: string;
  type: 'X2X' | 'TWIN' | 'DROUGHT' | 'EVEN_STREAK' | 'ODD_STREAK' | 'OVER_STREAK' | 'UNDER_STREAK';
  title: string;
  description: string;
  confidence: number; // 0 to 100
  timestamp: number;
  digit?: number;
  streakCount?: number;
}

export interface MultiplierParameters {
  stake: number;
  multiplier: number;
  direction: 'MULTUP' | 'MULTDOWN';
  takeProfit?: number;
  stopLoss?: number;
}

export interface MultiplierRiskMetrics {
  liquidationPrice: number;
  distanceToLiquidationPts: number;
  distanceToLiquidationPct: number;
  maxLoss: number;
  breakevenPrice: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface DerivProposal {
  id: string;
  ask_price: number;
  payout: number;
  longcode: string;
  spot: number;
  spot_time: number;
  barrier?: string;
  commission?: number;
  cancellation?: number;
}

export interface OpenContract {
  contract_id: number;
  contract_type: string;
  buy_price: number;
  current_spot: number;
  profit: number;
  profit_percentage: number;
  status: 'open' | 'won' | 'lost' | 'sold' | 'cancelled';
  entry_tick: number;
  exit_tick?: number;
  barrier?: string;
  date_start: number;
  multiplier?: number;
  payout?: number;
  sell_price?: number;
  is_valid_to_sell?: number;
  is_sold?: number;
  validation_error?: string;
  symbol?: string;
  ticks_elapsed?: number;
}

export interface DerivRestAccount {
  accountId: string;
  currency?: string;
  balance?: number;
  accountType?: string;
}

export interface OAuthSessionResult {
  access_token: string;
  expires_in: number;
  token_type: string;
  expires_at: number;
  client_id: string;
  scope: string;
  accounts?: DerivRestAccount[];
}

export interface UserAuthAccount {
  isAuthorized: boolean;
  authMethod?: 'oauth2' | 'pat-rest' | 'pat' | 'demo';
  token: string;
  appId: string;
  loginid?: string;
  balance?: number;
  currency?: string;
  email?: string;
  isTradeEnabled: boolean;
  expiresAt?: number;
  scope?: string;
  accounts?: DerivRestAccount[];
  otpWsUrl?: string;
}

export interface ConnectionState {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  pingMs: number;
  isSimulation: boolean;
  symbol: string;
}

export interface TradeEntrySignal {
  id: string;
  category: 'DIGITS' | 'MULTIPLIER';
  status: 'STRONG_ENTRY' | 'FAVORABLE_SETUP' | 'AWAITING_SETUP';
  headline: string;
  actionLabel: string;
  rationale: string;
  confidenceScore: number;
  recommendedContract: 'DIGITMATCH' | 'DIGITDIFF' | 'MULTUP' | 'MULTDOWN';
  recommendedParam: number; // digit 0-9 or multiplier factor
  suggestedStake: number;
  riskLevel: 'LOW' | 'BALANCED' | 'ELEVATED';
  expectedPayoutMultiplier: string;
  triggerRule: string;
}

