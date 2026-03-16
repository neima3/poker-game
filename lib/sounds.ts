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

export type SoundCategory = 'deal' | 'action' | 'win' | 'timer' | 'ambient';

export type SoundPack = 'classic' | 'arcade' | 'minimal' | 'casino';

interface SoundSettings {
  masterMute: boolean;
  categories: Record<SoundCategory, boolean>;
  soundPack: SoundPack;
  ambientVolume: number; // 0-1
}

const DEFAULT_SETTINGS: SoundSettings = {
  masterMute: false,
  categories: { deal: true, action: true, win: true, timer: true, ambient: false },
  soundPack: 'classic',
  ambientVolume: 0.3,
};

let _settings: SoundSettings = { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories } };
let _ambientNodes: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
let _tensionGain: GainNode | null = null;
let _tensionOsc: OscillatorNode | null = null;

export function initSoundSettings(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('poker_sound_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        _settings = { ...DEFAULT_SETTINGS, ...parsed, categories: { ...DEFAULT_SETTINGS.categories, ...parsed.categories } };
      }
      // Backwards compat: migrate old mute key
      const oldMuted = localStorage.getItem('poker_muted');
      if (oldMuted === '1' && !saved) {
        _settings.masterMute = true;
      }
    } catch { /* ignore parse errors */ }
  }
}

export function isMuted(): boolean {
  return _settings.masterMute;
}

export function setMuted(v: boolean): void {
  _settings.masterMute = v;
  saveSoundSettings();
}

export function isCategoryEnabled(cat: SoundCategory): boolean {
  return _settings.categories[cat];
}

export function setCategoryEnabled(cat: SoundCategory, enabled: boolean): void {
  _settings.categories[cat] = enabled;
  saveSoundSettings();
}

function saveSoundSettings(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('poker_sound_settings', JSON.stringify(_settings));
  }
}

function play(fn: (c: AudioContext) => void, category?: SoundCategory): void {
  if (_settings.masterMute) return;
  if (category && !_settings.categories[category]) return;
  const c = ctx();
  if (!c) return;
  try { fn(c); } catch { /* ignore audio errors */ }
}

// Card swoosh — paper slide + soft click
export function playCardDeal(): void {
  play(c => {
    sweep(c, 900, 300, 0.08, 0.06);
    noise(c, 0.05, 0.04);
  }, 'deal');
}

// Single chip clink
export function playChip(): void {
  play(c => {
    osc(c, 1_200, 0.06, 0.08, 'triangle');
    osc(c, 800, 0.04, 0.04, 'sine', 0.01);
  }, 'action');
}

// Multiple chip splash (bet/raise)
export function playChipSplash(): void {
  play(c => {
    [0, 0.04, 0.08, 0.12].forEach(when =>
      osc(c, 900 + Math.random() * 400, 0.05, 0.06, 'triangle', when)
    );
  }, 'action');
}

// Fold — low thud
export function playFold(): void {
  play(c => {
    sweep(c, 180, 80, 0.12, 0.09);
    noise(c, 0.06, 0.03);
  }, 'action');
}

// Check / call — soft tap
export function playCheck(): void {
  play(c => {
    osc(c, 400, 0.08, 0.07, 'triangle');
  }, 'action');
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
  }, 'win');
}

// Timer tick — urgent beep at ≤10s
export function playTimerTick(): void {
  play(c => {
    osc(c, 880, 0.06, 0.08, 'square');
  }, 'timer');
}

// New hand — soft "deal" fanfare
export function playNewHand(): void {
  play(c => {
    osc(c, 440, 0.1, 0.07, 'sine', 0);
    osc(c, 554.4, 0.1, 0.07, 'sine', 0.1);
    osc(c, 659.3, 0.12, 0.09, 'sine', 0.2);
  }, 'deal');
}

// All-in — dramatic rising sweep
export function playAllIn(): void {
  play(c => {
    sweep(c, 200, 1000, 0.25, 0.12);
    osc(c, 880, 0.2, 0.1, 'sawtooth', 0.15);
  }, 'action');
}

// Error / invalid action — negative buzz
export function playError(): void {
  play(c => {
    osc(c, 150, 0.12, 0.08, 'sawtooth');
    osc(c, 120, 0.1, 0.06, 'square', 0.05);
  }, 'action');
}

// Spin wheel tick — short click as wheel passes a segment
export function playSpinTick(): void {
  play(c => {
    osc(c, 1_400, 0.03, 0.05, 'triangle');
  }, 'action');
}

// Spin wheel result — celebratory jingle
export function playSpinResult(): void {
  play(c => {
    const notes = [523.3, 659.3, 784.0, 1046.5];
    notes.forEach((f, i) => {
      osc(c, f, 0.25, 0.14, 'sine', i * 0.1);
    });
    [0.4, 0.44, 0.48].forEach(when =>
      osc(c, 1_200 + Math.random() * 300, 0.2, 0.08, 'sine', when)
    );
  }, 'win');
}

// Level up — triumphant ascending fanfare
export function playLevelUp(): void {
  play(c => {
    const notes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0];
    notes.forEach((f, i) => {
      osc(c, f, 0.35, 0.12, 'sine', i * 0.07);
    });
    osc(c, 1046.5, 0.5, 0.15, 'sine', 0.45);
  }, 'win');
}

// Win streak — rising power chord
export function playStreakBonus(): void {
  play(c => {
    sweep(c, 300, 900, 0.3, 0.1);
    osc(c, 880, 0.3, 0.1, 'sine', 0.15);
    osc(c, 1100, 0.25, 0.08, 'sine', 0.25);
  }, 'win');
}

// Achievement unlocked — sparkle cascade
export function playAchievement(): void {
  play(c => {
    const notes = [523.3, 659.3, 784.0, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      osc(c, f, 0.3, 0.1, 'sine', i * 0.06);
    });
    // Sparkle layer
    [0.3, 0.35, 0.4, 0.45].forEach(when =>
      osc(c, 1500 + Math.random() * 500, 0.2, 0.06, 'sine', when)
    );
  }, 'win');
}

// Mission complete — confident chord
export function playMissionComplete(): void {
  play(c => {
    osc(c, 392.0, 0.4, 0.12, 'sine', 0);
    osc(c, 523.3, 0.35, 0.12, 'sine', 0.08);
    osc(c, 659.3, 0.3, 0.1, 'sine', 0.16);
    osc(c, 784.0, 0.35, 0.14, 'sine', 0.24);
  }, 'win');
}

// ─── Ambient Casino Sound ────────────────────────────────────────────────────

/** Start ambient casino atmosphere — soft background noise + gentle music loop */
export function startAmbient(): void {
  if (_settings.masterMute || !_settings.categories.ambient) return;
  if (_ambientNodes) return; // Already playing

  const c = ctx();
  if (!c) return;

  try {
    // Create looping ambient noise (filtered pink noise for casino murmur)
    const bufLen = Math.floor(c.sampleRate * 4); // 4-second loop
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);

    // Generate pink-ish noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const source = c.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    // Heavy low-pass to make it a soft murmur
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;

    const g = c.createGain();
    g.gain.setValueAtTime(_settings.ambientVolume * 0.15, c.currentTime);

    source.connect(filter).connect(g).connect(c.destination);
    source.start();

    _ambientNodes = { source, gain: g };
  } catch { /* ignore */ }
}

/** Stop ambient sound */
export function stopAmbient(): void {
  if (_ambientNodes) {
    try {
      _ambientNodes.gain.gain.exponentialRampToValueAtTime(0.001, (_ambientNodes.gain.context.currentTime || 0) + 0.5);
      const nodes = _ambientNodes;
      setTimeout(() => {
        try { nodes.source.stop(); } catch { /* ignore */ }
      }, 600);
    } catch { /* ignore */ }
    _ambientNodes = null;
  }
}

/** Set ambient volume (0-1) */
export function setAmbientVolume(vol: number): void {
  _settings.ambientVolume = Math.max(0, Math.min(1, vol));
  saveSoundSettings();
  if (_ambientNodes) {
    try {
      _ambientNodes.gain.gain.setValueAtTime(vol * 0.15, _ambientNodes.gain.context.currentTime || 0);
    } catch { /* ignore */ }
  }
}

export function getAmbientVolume(): number {
  return _settings.ambientVolume;
}

// ─── Tension System ──────────────────────────────────────────────────────────

/**
 * Update tension level based on pot size relative to big blind.
 * Creates a subtle low drone that increases in intensity.
 * @param potRatio pot / bigBlind — higher = more tense
 */
export function updateTension(potRatio: number): void {
  if (_settings.masterMute || !_settings.categories.ambient) return;

  const c = ctx();
  if (!c) return;

  const intensity = Math.min(potRatio / 50, 1); // Max tension at 50x BB

  if (intensity < 0.1) {
    // No tension at small pots
    stopTension();
    return;
  }

  try {
    if (!_tensionOsc) {
      // Create tension oscillator
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(55, c.currentTime); // Low A

      const g = c.createGain();
      g.gain.setValueAtTime(0.001, c.currentTime);

      o.connect(g).connect(c.destination);
      o.start();

      _tensionOsc = o;
      _tensionGain = g;
    }

    // Scale frequency and volume with intensity
    const freq = 55 + intensity * 30; // 55-85 Hz
    const vol = intensity * 0.04; // Very subtle

    _tensionOsc.frequency.linearRampToValueAtTime(freq, c.currentTime + 0.5);
    _tensionGain!.gain.linearRampToValueAtTime(Math.max(0.001, vol), c.currentTime + 0.5);
  } catch { /* ignore */ }
}

/** Stop tension drone */
export function stopTension(): void {
  if (_tensionOsc && _tensionGain) {
    try {
      _tensionGain.gain.exponentialRampToValueAtTime(0.001, (_tensionGain.context.currentTime || 0) + 0.3);
      const o = _tensionOsc;
      setTimeout(() => { try { o.stop(); } catch { /* ignore */ } }, 400);
    } catch { /* ignore */ }
    _tensionOsc = null;
    _tensionGain = null;
  }
}

// ─── Sound Pack ──────────────────────────────────────────────────────────────

export function getSoundPack(): SoundPack {
  return _settings.soundPack;
}

export function setSoundPack(pack: SoundPack): void {
  _settings.soundPack = pack;
  saveSoundSettings();
}

export const SOUND_PACKS: { id: SoundPack; name: string; description: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Standard poker sounds' },
  { id: 'arcade', name: 'Arcade', description: 'Retro gaming vibes' },
  { id: 'minimal', name: 'Minimal', description: 'Soft, subtle tones' },
  { id: 'casino', name: 'Casino', description: 'Authentic casino atmosphere' },
];

// Arcade pack overrides — higher pitched, more "digital"
export function playCardDealArcade(): void {
  play(c => {
    osc(c, 1200, 0.04, 0.1, 'square');
    osc(c, 600, 0.03, 0.06, 'square', 0.02);
  }, 'deal');
}

export function playWinArcade(): void {
  play(c => {
    // 8-bit victory jingle
    const notes = [523.3, 659.3, 784.0, 1046.5, 784.0, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      osc(c, f, 0.12, 0.1, 'square', i * 0.08);
    });
  }, 'win');
}

// Minimal pack overrides — quieter, shorter
export function playCardDealMinimal(): void {
  play(c => {
    osc(c, 600, 0.04, 0.03, 'sine');
  }, 'deal');
}

export function playWinMinimal(): void {
  play(c => {
    osc(c, 440, 0.4, 0.06, 'sine', 0);
    osc(c, 554.4, 0.35, 0.06, 'sine', 0.15);
    osc(c, 659.3, 0.3, 0.08, 'sine', 0.3);
  }, 'win');
}

// Casino pack — richer, warmer tones
export function playCardDealCasino(): void {
  play(c => {
    sweep(c, 800, 400, 0.06, 0.08);
    noise(c, 0.04, 0.06);
    osc(c, 1000, 0.03, 0.03, 'triangle', 0.04);
  }, 'deal');
}

export function playWinCasino(): void {
  play(c => {
    // Warm major chord with reverb-like tail
    const notes = [261.6, 329.6, 392.0, 523.3];
    notes.forEach((f, i) => {
      osc(c, f, 0.5, 0.1, 'sine', i * 0.06);
      osc(c, f * 2, 0.4, 0.04, 'sine', i * 0.06 + 0.02);
    });
    // Shimmer
    [0.3, 0.35, 0.4, 0.45, 0.5].forEach(when =>
      osc(c, 800 + Math.random() * 400, 0.3, 0.04, 'sine', when)
    );
  }, 'win');
}

/** Get the right sound function for the current pack */
export function getPackedSound(baseName: 'cardDeal' | 'win'): (() => void) {
  const pack = _settings.soundPack;
  if (baseName === 'cardDeal') {
    if (pack === 'arcade') return playCardDealArcade;
    if (pack === 'minimal') return playCardDealMinimal;
    if (pack === 'casino') return playCardDealCasino;
    return playCardDeal;
  }
  if (baseName === 'win') {
    if (pack === 'arcade') return playWinArcade;
    if (pack === 'minimal') return playWinMinimal;
    if (pack === 'casino') return playWinCasino;
    return playWin;
  }
  return playCardDeal;
}
