/**
 * Procedural sound engine — no audio files required.
 * All sounds synthesized via Web Audio API.
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try {
      _ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function gain(c: AudioContext, value: number, when = 0): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(value, c.currentTime + when);
  return g;
}

/** White noise burst (short) */
function noise(c: AudioContext, duration = 0.04, vol = 0.08): void {
  const bufLen = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2_000;
  filter.Q.value = 0.5;

  const g = gain(c, vol);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime);
  src.stop(c.currentTime + duration);
}

/** Sine / triangle oscillator burst */
function osc(
  c: AudioContext,
  freq: number,
  duration: number,
  vol = 0.12,
  type: OscillatorType = 'sine',
  when = 0,
): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + when);

  const g = gain(c, 0.001, when);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + duration);

  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when);
  o.stop(c.currentTime + when + duration + 0.01);
}

/** Frequency sweep */
function sweep(c: AudioContext, from: number, to: number, duration: number, vol = 0.1): void {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);

  const g = gain(c, vol);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  o.connect(g).connect(c.destination);
  o.start(c.currentTime);
  o.stop(c.currentTime + duration + 0.01);
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _muted = false;

export function initSoundMute(): void {
  if (typeof localStorage !== 'undefined') {
    _muted = localStorage.getItem('poker_muted') === '1';
  }
}

export function isMuted(): boolean {
  return _muted;
}

export function setMuted(v: boolean): void {
  _muted = v;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('poker_muted', v ? '1' : '0');
  }
}

function play(fn: (c: AudioContext) => void): void {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  try { fn(c); } catch { /* ignore audio errors */ }
}

// Card swoosh — paper slide + soft click
export function playCardDeal(): void {
  play(c => {
    sweep(c, 900, 300, 0.08, 0.06);
    noise(c, 0.05, 0.04);
  });
}

// Single chip clink
export function playChip(): void {
  play(c => {
    osc(c, 1_200, 0.06, 0.08, 'triangle');
    osc(c, 800, 0.04, 0.04, 'sine', 0.01);
  });
}

// Multiple chip splash (bet/raise)
export function playChipSplash(): void {
  play(c => {
    [0, 0.04, 0.08, 0.12].forEach(when =>
      osc(c, 900 + Math.random() * 400, 0.05, 0.06, 'triangle', when)
    );
  });
}

// Fold — low thud
export function playFold(): void {
  play(c => {
    sweep(c, 180, 80, 0.12, 0.09);
    noise(c, 0.06, 0.03);
  });
}

// Check / call — soft tap
export function playCheck(): void {
  play(c => {
    osc(c, 400, 0.08, 0.07, 'triangle');
  });
}

// Winner — ascending major arpeggio + fanfare
export function playWin(): void {
  play(c => {
    // C4, E4, G4, C5 — major chord
    const notes = [261.6, 329.6, 392.0, 523.3];
    notes.forEach((f, i) => {
      osc(c, f, 0.3, 0.12, 'sine', i * 0.08);
    });
    // Sparkle layer
    [0.32, 0.36, 0.40].forEach(when =>
      osc(c, 1_046 + Math.random() * 200, 0.15, 0.06, 'sine', when)
    );
  });
}

// Timer tick — urgent beep at ≤10s
export function playTimerTick(): void {
  play(c => {
    osc(c, 880, 0.06, 0.08, 'square');
  });
}

// New hand — soft "deal" fanfare
export function playNewHand(): void {
  play(c => {
    osc(c, 440, 0.1, 0.07, 'sine', 0);
    osc(c, 554.4, 0.1, 0.07, 'sine', 0.1);
    osc(c, 659.3, 0.12, 0.09, 'sine', 0.2);
  });
}
