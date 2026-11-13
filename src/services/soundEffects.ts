/**
 * Web Audio API Sound Synthesizer for DigitScope Analytics
 * Generates low-latency, pleasant tones without external audio file dependencies.
 */

class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.3;

  constructor() {
    // Read user preference from localStorage if available
    try {
      const savedMute = localStorage.getItem('digitscope_audio_muted');
      if (savedMute !== null) {
        this.isMuted = savedMute === 'true';
      }
      const savedVol = localStorage.getItem('digitscope_audio_volume');
      if (savedVol !== null) {
        this.volume = parseFloat(savedVol) || 0.3;
      }
    } catch {
      // Ignore storage restrictions
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('digitscope_audio_muted', String(muted));
    } catch {}
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('digitscope_audio_volume', String(this.volume));
    } catch {}
  }

  /**
   * Harmonious chime for pattern signals (X2X, twins, high confidence)
   */
  public playPatternAlert(type: 'x2x' | 'twin' | 'drought' | 'general' = 'general'): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.4, now);
    masterGain.connect(ctx.destination);

    // Frequencies for chords
    let notes: number[];
    if (type === 'x2x') {
      notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Bright major flourish)
    } else if (type === 'twin') {
      notes = [587.33, 739.99, 880.0]; // D5, F#5, A5
    } else if (type === 'drought') {
      notes = [440.0, 554.37, 659.25]; // A4, C#5, E5
    } else {
      notes = [523.25, 659.25, 783.99]; // C Major triad
    }

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const startTime = now + index * 0.06;
      const duration = 0.35;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  /**
   * Subtle click/blip on new tick
   */
  public playTickBlip(direction: 'up' | 'down' | 'flat'): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const freq = direction === 'up' ? 880 : direction === 'down' ? 440 : 660;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(this.volume * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Positive chime for trade placement or confirmation
   */
  public playOrderExecuted(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.15); // C6

    gain.gain.setValueAtTime(this.volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  /**
   * Distinctive ascending chime when a high-probability trade entry opportunity is detected
   */
  public playTradeSignalAlert(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.35, now);
    masterGain.connect(ctx.destination);

    // Dynamic ascending triad: E5 -> A5 -> E6
    const freqs = [659.25, 880.0, 1318.51];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const startTime = now + i * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      noteGain.gain.setValueAtTime(0, startTime);
      noteGain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.3);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }
}

export const soundEffects = new SoundService();

