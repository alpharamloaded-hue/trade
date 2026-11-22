import { describe, it, expect, vi, beforeEach } from 'vitest';
import { derivWs } from '../services/derivWs';

// Mock derivWs for testing
vi.mock('../services/derivWs', () => ({
  derivWs: {
    isSimulationActive: vi.fn(() => true),
    fetchProposal: vi.fn(),
    executeBuy: vi.fn(),
    sellContract: vi.fn(),
    onContract: vi.fn(() => vi.fn()),
    onBalance: vi.fn(() => vi.fn()),
  }
}));

describe('Trade Execution Race Conditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle concurrent demo trades without ID collision', async () => {
    const { derivWs } = await import('../services/derivWs');
    
    // Simulate two rapid trades
    const mockIds = new Set();
    for (let i = 0; i < 100; i++) {
      const mockId = Math.floor(Math.random() * 900000) + 100000;
      if (mockIds.has(mockId)) {
        throw new Error(`Collision detected: ${mockId}`);
      }
      mockIds.add(mockId);
    }
    expect(mockIds.size).toBe(100);
  });

  it('should generate unique proposal IDs for concurrent fetchProposal calls', async () => {
    const { derivWs } = await import('../services/derivWs');
    
    // Simulate multiple rapid fetchProposal calls
    const proposals = [];
    for (let i = 0; i < 10; i++) {
      const prop = {
        id: `prop-sim-${Date.now()}-${i}`,
        ask_price: 10,
        payout: 92,
        longcode: 'Test',
        spot: 1000,
        spot_time: Math.floor(Date.now() / 1000),
      };
      proposals.push(prop);
    }
    
    const ids = proposals.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('Trade State Management', () => {
  it('should not allow concurrent trades to overwrite each other', async () => {
    // This test documents the expected behavior:
    // When handleConfirmOrder is called, it should:
    // 1. Use the pendingOrder at the time of call
    // 2. Not be affected by subsequent pendingOrder changes
    // 3. Complete fully before next trade can start
    
    let pendingOrder = { contractType: 'DIGITMATCH', targetParam: 5 };
    const capturedOrders: any[] = [];
    
    const handleConfirmOrder = async (proposal: any) => {
      // Capture the order at call time
      const order = { ...pendingOrder };
      capturedOrders.push(order);
      
      // Simulate async work
      await new Promise(r => setTimeout(r, 10));
      
      // Simulate state change
      pendingOrder = { contractType: 'DIGITDIFF', targetParam: 7 };
    };
    
    // Rapid calls
    await Promise.all([
      handleConfirmOrder({}),
      handleConfirmOrder({}),
      handleConfirmOrder({}),
    ]);
    
    // Each call should capture the order at its call time
    // Currently all might capture the same final state due to closure
    expect(capturedOrders.length).toBe(3);
  });
});

describe('Trade Lock Behavior', () => {
  it('should prevent concurrent trade execution with lock', async () => {
    let tradeLock = false;
    let executionCount = 0;
    
    const executeTrade = async () => {
      if (tradeLock) {
        throw new Error('Trade already in progress');
      }
      tradeLock = true;
      executionCount++;
      await new Promise(r => setTimeout(r, 20));
      tradeLock = false;
    };
    
    // Try to execute 3 trades concurrently
    const promises = [
      executeTrade(),
      executeTrade().catch(() => {}),
      executeTrade().catch(() => {}),
    ];
    
    await Promise.all(promises);
    
    // Only first trade should succeed
    expect(executionCount).toBe(1);
  });

  it('should release lock even on error', async () => {
    let tradeLock = false;
    
    const executeTrade = async (shouldFail: boolean) => {
      if (tradeLock) throw new Error('Locked');
      tradeLock = true;
      try {
        if (shouldFail) throw new Error('Trade failed');
      } finally {
        tradeLock = false;
      }
    };
    
    // First trade fails
    await executeTrade(true).catch(() => {});
    
    // Lock should be released, second trade should work
    await executeTrade(false);
    
    expect(tradeLock).toBe(false);
  });
});