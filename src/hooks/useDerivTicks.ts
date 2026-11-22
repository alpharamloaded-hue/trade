import { useCallback, useEffect, useRef, useState } from 'react';
import { derivWs } from '../services/derivWs';
import { soundEffects } from '../services/soundEffects';
import { ConnectionState, DigitStat, PatternDetection, RollingWindowSize, TickData } from '../types/deriv';
import { computeDigitStats, scanPatterns } from '../utils/digitAnalysis';

const MAX_TICKS_BUFFER = 1000;

export function useDerivTicks(initialSymbol: string = '1HZ100V') {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [ticks, setTicks] = useState<TickData[]>([]);
  const [latestTick, setLatestTick] = useState<TickData | null>(null);
  const [windowSize, setWindowSize] = useState<RollingWindowSize>(100);
  const [digitStats, setDigitStats] = useState<DigitStat[]>([]);
  const [patterns, setPatterns] = useState<PatternDetection[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<PatternDetection[]>([]);

  const [connection, setConnection] = useState<ConnectionState>({
    status: 'connecting',
    pingMs: 0,
    isSimulation: false,
    symbol: initialSymbol,
  });

  // Track fired pattern IDs to avoid audio spam
  const firedPatternsRef = useRef<Set<string>>(new Set());
  const windowSizeRef = useRef<RollingWindowSize>(windowSize);
  windowSizeRef.current = windowSize;

  // Popups toggleable by user (persisted in localStorage)
  const [popupsEnabled, setPopupsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('digitscope_popups_enabled') === 'true'; // Default to false to avoid blocking view
    } catch {
      return false;
    }
  });
  const popupsEnabledRef = useRef<boolean>(popupsEnabled);
  popupsEnabledRef.current = popupsEnabled;

  const alertTimerRef = useRef<number | null>(null);

  const togglePopups = useCallback(() => {
    setPopupsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('digitscope_popups_enabled', String(next));
      } catch {}
      if (!next) {
        setActiveAlerts([]);
      }
      return next;
    });
  }, []);

  // Handle symbol change
  const handleSelectSymbol = useCallback((newSymbol: string) => {
    setSymbol(newSymbol);
    setTicks([]);
    setLatestTick(null);
    setActiveAlerts([]);
    firedPatternsRef.current.clear(); // Clear fired patterns on symbol change
    derivWs.subscribeSymbol(newSymbol);
    setConnection((prev) => ({ ...prev, symbol: newSymbol }));
  }, []);

  // Set up WebSocket lifecycle once on mount
  useEffect(() => {
    derivWs.connect();

    const unsubStatus = derivWs.onStatus((status, pingMs) => {
      setConnection((prev) => ({
        ...prev,
        status,
        pingMs,
        isSimulation: derivWs.isSimulationActive(),
      }));
    });

    const unsubHistory = derivWs.onHistory((incomingTicks) => {
      const buffer = incomingTicks.slice(-MAX_TICKS_BUFFER);
      setTicks(buffer);
      if (buffer.length > 0) {
        setLatestTick(buffer[buffer.length - 1]);
        const stats = computeDigitStats(buffer, windowSizeRef.current);
        setDigitStats(stats);
        const scanned = scanPatterns(buffer);
        setPatterns(scanned);
      }
    });

    const unsubTick = derivWs.onTick((newTick) => {
      setLatestTick(newTick);

      setTicks((prev) => {
        const next = [...prev, newTick];
        if (next.length > MAX_TICKS_BUFFER) {
          next.shift();
        }

        // Compute updated stats
        const stats = computeDigitStats(next, windowSizeRef.current);
        setDigitStats(stats);

        // Scan patterns
        const currentPatterns = scanPatterns(next);
        setPatterns(currentPatterns);

        // Check for new patterns to trigger audio & toasts
        if (currentPatterns.length > 0) {
          const fresh = currentPatterns.filter((p) => !firedPatternsRef.current.has(p.id));
          if (fresh.length > 0) {
            fresh.forEach((p) => {
              firedPatternsRef.current.add(p.id);
              // Audio alerts for key patterns
              if (p.type === 'X2X') {
                soundEffects.playPatternAlert('x2x');
              } else if (p.type === 'DROUGHT' && (p.streakCount || 0) >= 20) {
                soundEffects.playPatternAlert('drought');
              }
            });

            // Only show popups if enabled by the user and for high-significance patterns (X2X or severe drought)
            if (popupsEnabledRef.current) {
              const highPriority = fresh.filter(
                (p) => p.type === 'X2X' || (p.type === 'DROUGHT' && (p.streakCount || 0) >= 20)
              );

              if (highPriority.length > 0) {
                // Keep only 1 single unobtrusive toast at a time
                const topAlert = highPriority[0];
                setActiveAlerts([topAlert]);

                // Auto-dismiss after 3.2 seconds so it never lingers or blocks view
                if (alertTimerRef.current) {
                  window.clearTimeout(alertTimerRef.current);
                }
                alertTimerRef.current = window.setTimeout(() => {
                  setActiveAlerts([]);
                }, 3200);
              }
            }
          }
        }

        return next;
      });
    });

    const cleanupInterval = window.setInterval(() => {
      // Limit firedPatternsRef size to prevent memory leak (keep last 500 entries)
      if (firedPatternsRef.current.size > 500) {
        const entries = Array.from(firedPatternsRef.current);
        const toKeep = entries.slice(-500);
        firedPatternsRef.current = new Set(toKeep);
      }
    }, 60000); // Run every minute

    return () => {
      unsubStatus();
      unsubHistory();
      unsubTick();
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
      }
      window.clearInterval(cleanupInterval);
    };
  }, []);

  // Recompute stats if window size changes
  const handleWindowChange = useCallback(
    (newSize: RollingWindowSize) => {
      setWindowSize(newSize);
      if (ticks.length > 0) {
        setDigitStats(computeDigitStats(ticks, newSize));
      }
    },
    [ticks]
  );

  const dismissAlert = useCallback((id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleSimulation = useCallback(() => {
    const nextSim = !derivWs.isSimulationActive();
    if (!nextSim) {
      setTicks([]);
      setLatestTick(null);
      setActiveAlerts([]);
    }
    derivWs.toggleSimulation(nextSim);
    setConnection((prev) => ({
      ...prev,
      isSimulation: derivWs.isSimulationActive(),
    }));
  }, []);

  return {
    symbol,
    selectSymbol: handleSelectSymbol,
    ticks,
    latestTick,
    windowSize,
    setWindowSize: handleWindowChange,
    digitStats,
    patterns,
    activeAlerts,
    dismissAlert,
    connection,
    toggleSimulation,
    popupsEnabled,
    togglePopups,
  };
}
