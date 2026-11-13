import { SyntheticSymbol } from '../types/deriv';

export const SYNTHETIC_SYMBOLS: SyntheticSymbol[] = [
  {
    symbol: 'R_10',
    displayName: 'Volatility 10 Index',
    decimals: 3,
    market: 'synthetic_index',
    description: 'Constant volatility of 10% with regular ticks',
  },
  {
    symbol: '1HZ10V',
    displayName: 'Volatility 10 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: '1-second tick frequency with 10% volatility',
  },
  {
    symbol: 'R_25',
    displayName: 'Volatility 25 Index',
    decimals: 3,
    market: 'synthetic_index',
    description: 'Constant volatility of 25% with regular ticks',
  },
  {
    symbol: '1HZ25V',
    displayName: 'Volatility 25 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: '1-second tick frequency with 25% volatility',
  },
  {
    symbol: 'R_50',
    displayName: 'Volatility 50 Index',
    decimals: 4,
    market: 'synthetic_index',
    description: 'Constant volatility of 50% with regular ticks',
  },
  {
    symbol: '1HZ50V',
    displayName: 'Volatility 50 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: '1-second tick frequency with 50% volatility',
  },
  {
    symbol: 'R_75',
    displayName: 'Volatility 75 Index',
    decimals: 4,
    market: 'synthetic_index',
    description: 'Constant volatility of 75% with regular ticks',
  },
  {
    symbol: '1HZ75V',
    displayName: 'Volatility 75 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: '1-second tick frequency with 75% volatility',
  },
  {
    symbol: 'R_100',
    displayName: 'Volatility 100 Index',
    decimals: 2,
    market: 'synthetic_index',
    description: 'Constant volatility of 100% with regular ticks',
  },
  {
    symbol: '1HZ100V',
    displayName: 'Volatility 100 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: '1-second tick frequency with 100% volatility',
  },
  {
    symbol: '1HZ150V',
    displayName: 'Volatility 150 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: 'High frequency 1-second ticks with 150% volatility',
  },
  {
    symbol: '1HZ250V',
    displayName: 'Volatility 250 (1s) Index',
    decimals: 2,
    market: 'synthetic_index',
    description: 'Ultra high frequency 1-second ticks with 250% volatility',
  },
];

export function getSymbolMeta(symbol: string): SyntheticSymbol {
  return (
    SYNTHETIC_SYMBOLS.find((s) => s.symbol === symbol) || {
      symbol,
      displayName: symbol,
      decimals: 2,
      market: 'synthetic_index',
      description: 'Synthetic Volatility Index',
    }
  );
}
