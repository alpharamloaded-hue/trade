import { GoogleGenAI } from '@google/genai';
import { TradeResult, EnhancedStrategyType, MarketState } from './enhancedStrategyEngine';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface TradeAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  riskScore: number; // 1-10
  confidence: number; // 1-10
}

export interface SessionAnalysis {
  overallPerformance: string;
  strategyBreakdown: Record<EnhancedStrategyType, { trades: number; winRate: number; profit: number; notes: string }>;
  marketConditions: string;
  recommendations: string[];
  nextSessionFocus: string;
}

function buildTradeContext(trades: TradeResult[], marketState: MarketState, balance: number): string {
  const completedTrades = trades.filter(t => t.exitReason && t.exitReason !== 'MANUAL');
  const wins = completedTrades.filter(t => t.won);
  const losses = completedTrades.filter(t => !t.won);
  
  const totalProfit = completedTrades.reduce((sum, t) => sum + t.profit, 0);
  const winRate = completedTrades.length > 0 ? (wins.length / completedTrades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.profit, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.profit, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 999;

  const byStrategy: Record<string, { trades: TradeResult[]; profit: number; winRate: number }> = {};
  completedTrades.forEach(t => {
    if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { trades: [], profit: 0, winRate: 0 };
    byStrategy[t.strategy].trades.push(t);
    byStrategy[t.strategy].profit += t.profit;
  });
  
  Object.keys(byStrategy).forEach(s => {
    const stratTrades = byStrategy[s].trades;
    const stratWins = stratTrades.filter(t => t.won).length;
    byStrategy[s].winRate = stratTrades.length > 0 ? (stratWins / stratTrades.length) * 100 : 0;
  });

  return `
TRADING SESSION DATA:
- Current Balance: $${balance.toFixed(2)}
- Total Trades: ${completedTrades.length}
- Wins: ${wins.length} | Losses: ${losses.length}
- Win Rate: ${winRate.toFixed(1)}%
- Net P&L: $${totalProfit.toFixed(2)}
- Profit Factor: ${profitFactor.toFixed(2)}
- Avg Win: $${avgWin.toFixed(2)} | Avg Loss: $${avgLoss.toFixed(2)}

MARKET STATE:
- Regime: ${marketState.regime}
- Trend: ${marketState.trendDirection} (strength: ${marketState.trendStrength.toFixed(0)})
- Volatility: ${marketState.volatilityPercentile.toFixed(0)}th percentile
- Session: ${marketState.session}

BY STRATEGY:
${Object.entries(byStrategy).map(([strat, data]) => 
  `- ${strat}: ${data.trades.length} trades, ${data.winRate.toFixed(1)}% WR, $${data.profit.toFixed(2)} P&L`
).join('\n')}

RECENT TRADES (last 10):
${completedTrades.slice(-10).map(t => 
  `  ${t.won ? '✅' : '❌'} ${t.strategy} | $${t.stake.toFixed(2)} @ ${t.contractType} | P&L: $${t.profit.toFixed(2)} | ${t.exitReason}`
).join('\n')}
`.trim();
}

export async function analyzeTrade(trade: TradeResult, marketState: MarketState, balance: number): Promise<TradeAnalysis> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      summary: 'AI analysis unavailable (no API key)',
      strengths: [],
      weaknesses: [],
      suggestions: ['Add GEMINI_API_KEY to enable AI analysis'],
      riskScore: 5,
      confidence: 0,
    };
  }

  const context = `
TRADE TO ANALYZE:
- Strategy: ${trade.strategy}
- Contract: ${trade.contractType} ${trade.digit ? `Digit ${trade.digit}` : trade.multiplier ? `${trade.multiplier}x` : ''}
- Stake: $${trade.stake.toFixed(2)}
- Entry: ${trade.entryPrice.toFixed(5)}
- Exit: ${trade.exitPrice?.toFixed(5) || 'N/A'}
- Result: ${trade.won ? 'WIN' : 'LOSS'}
- P&L: $${trade.profit.toFixed(2)}
- Hold Time: ${(trade.holdTimeMs / 1000 / 60).toFixed(1)} min
- Exit Reason: ${trade.exitReason}

MARKET CONTEXT:
- Regime: ${marketState.regime}
- Trend: ${marketState.trendDirection}
- Volatility: ${marketState.volatilityPercentile}th percentile
- Session: ${marketState.session}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `You are an expert trading analyst. Analyze this completed trade and provide structured feedback.

${context}

Respond with ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence summary of the trade quality",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "suggestions": ["actionable suggestion 1", "actionable suggestion 2"],
  "riskScore": 5,
  "confidence": 7
}

Risk score 1-10 (1=very low risk, 10=extreme risk). Confidence 1-10 in your analysis.`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      summary: result.summary || 'Analysis complete',
      strengths: result.strengths || [],
      weaknesses: result.weaknesses || [],
      suggestions: result.suggestions || [],
      riskScore: Math.max(1, Math.min(10, result.riskScore || 5)),
      confidence: Math.max(1, Math.min(10, result.confidence || 5)),
    };
  } catch (error) {
    console.error('AI trade analysis failed:', error);
    return {
      summary: 'AI analysis failed',
      strengths: [],
      weaknesses: [],
      suggestions: ['Check API key and network'],
      riskScore: 5,
      confidence: 0,
    };
  }
}

export async function analyzeSession(
  trades: TradeResult[],
  marketState: MarketState,
  balance: number
): Promise<SessionAnalysis> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      overallPerformance: 'AI analysis unavailable',
      strategyBreakdown: getEmptyStrategyBreakdown(),
      marketConditions: 'N/A',
      recommendations: ['Add GEMINI_API_KEY'],
      nextSessionFocus: 'N/A',
    };
  }

  const context = buildTradeContext(trades, marketState, balance);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `You are an expert trading coach. Analyze this complete trading session and provide a comprehensive review.

${context}

Respond with ONLY valid JSON in this exact format:
{
  "overallPerformance": "2-3 sentence summary",
  "strategyBreakdown": {
    "DROUGHT_MATCH_PREMIUM": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "COLD_DIFFER_PREMIUM": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "X2X_REVERSAL_PREMIUM": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "TWIN_DIFFER_PREMIUM": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "STREAK_EXHAUSTION": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "TREND_PULLBACK_MULT": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "MEAN_REVERSION_MULT": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" },
    "SCALP_MULTIPLIER_PREMIUM": { "trades": 0, "winRate": 0, "profit": 0, "notes": "" }
  },
  "marketConditions": "Assessment of how market regime affected results",
  "recommendations": ["specific actionable recommendation 1", "specific actionable recommendation 2"],
  "nextSessionFocus": "One key area to focus on next session"
}

All strategy keys must be present. Include only strategies with trades in notes.`,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const result = JSON.parse(response.text || '{}');
    // Ensure all strategy keys are present
    const breakdown = { ...getEmptyStrategyBreakdown(), ...(result.strategyBreakdown || {}) };
    return {
      overallPerformance: result.overallPerformance || 'Session analyzed',
      strategyBreakdown: breakdown,
      marketConditions: result.marketConditions || 'N/A',
      recommendations: result.recommendations || [],
      nextSessionFocus: result.nextSessionFocus || 'Review strategy performance',
    };
  } catch (error) {
    console.error('AI session analysis failed:', error);
    return {
      overallPerformance: 'AI analysis failed',
      strategyBreakdown: getEmptyStrategyBreakdown(),
      marketConditions: 'N/A',
      recommendations: ['Check API key and network'],
      nextSessionFocus: 'N/A',
    };
  }
}

function getEmptyStrategyBreakdown() {
  return {
    DROUGHT_MATCH_PREMIUM: { trades: 0, winRate: 0, profit: 0, notes: '' },
    COLD_DIFFER_PREMIUM: { trades: 0, winRate: 0, profit: 0, notes: '' },
    X2X_REVERSAL_PREMIUM: { trades: 0, winRate: 0, profit: 0, notes: '' },
    TWIN_DIFFER_PREMIUM: { trades: 0, winRate: 0, profit: 0, notes: '' },
    STREAK_EXHAUSTION: { trades: 0, winRate: 0, profit: 0, notes: '' },
    TREND_PULLBACK_MULT: { trades: 0, winRate: 0, profit: 0, notes: '' },
    MEAN_REVERSION_MULT: { trades: 0, winRate: 0, profit: 0, notes: '' },
    SCALP_MULTIPLIER_PREMIUM: { trades: 0, winRate: 0, profit: 0, notes: '' },
  };
}

export async function getQuickInsight(trades: TradeResult[], marketState: MarketState): Promise<string> {
  if (!process.env.GEMINI_API_KEY || trades.length === 0) return '';
  
  const recent = trades.slice(-5).map(t => `${t.won ? 'W' : 'L'} ${t.strategy} $${t.profit.toFixed(2)}`).join(', ');
  const regime = marketState.regime;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Give ONE concise trading insight (max 2 sentences) based on: Recent trades: ${recent}. Market regime: ${regime}.`,
      config: { temperature: 0.5, maxOutputTokens: 60 },
    });
    return response.text || '';
  } catch {
    return '';
  }
}