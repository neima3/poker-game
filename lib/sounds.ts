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

/** All named sounds in the engine. */
export type SoundName =
  | 'cardDeal'
  | 'chip'
  | 'chipSplash'
  | 'fold'
  | 'check'
  | 'win'
  | 'timerTick'
  | 'newHand'
  | 'allIn'
  | 'error'
  | 'spinTick'
  | 'spinResult'
  | 'levelUp'
  | 'streakBonus'
  | 'achievement'
  | 'missionComplete';

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

// ─── Sound category map ───────────────────────────────────────────────────────

const SOUND_CATEGORIES: Record<SoundName, SoundCategory> = {
  cardDeal: 'deal',
  chip: 'action',
  chipSplash: 'action',
  fold: 'action',
  check: 'action',
  win: 'win',
  timerTick: 'timer',
  newHand: 'deal',
  allIn: 'action',
  error: 'action',
  spinTick: 'action',
  spinResult: 'win',
  levelUp: 'win',
  streakBonus: 'win',
  achievement: 'win',
  missionComplete: 'win',
};

// ─── Base (classic) sound implementations ────────────────────────────────────

type SoundImpl = (c: AudioContext) => void;

export const BASE_SOUNDS: Record<SoundName, SoundImpl> = {
  cardDeal: (c) => {
    sweep(c, 900, 300, 0.08, 0.06);
    noise(c, 0.05, 0.04);
  },
  chip: (c) => {
    osc(c, 1_200, 0.06, 0.08, 'triangle');
    osc(c, 800, 0.04, 0.04, 'sine', 0.01);
  },
  chipSplash: (c) => {
    [0, 0.04, 0.08, 0.12].forEach(when =>
      osc(c, 900 + Math.random() * 400, 0.05, 0.06, 'triangle', when)
    );
  },
  fold: (c) => {
    sweep(c, 180, 80, 0.12, 0.09);
    noise(c, 0.06, 0.03);
  },
  check: (c) => {
    osc(c, 400, 0.08, 0.07, 'triangle');
  },
  win: (c) => {
    const notes = [261.6, 329.6, 392.0, 523.3];
    notes.forEach((f, i) => osc(c, f, 0.3, 0.12, 'sine', i * 0.08));
    [0.32, 0.36, 0.40].forEach(when =>
      osc(c, 1_046 + Math.random() * 200, 0.15, 0.06, 'sine', when)
    );
  },
  timerTick: (c) => {
    osc(c, 880, 0.06, 0.08, 'square');
  },
  newHand: (c) => {
    osc(c, 440, 0.1, 0.07, 'sine', 0);
    osc(c, 554.4, 0.1, 0.07, 'sine', 0.1);
    osc(c, 659.3, 0.12, 0.09, 'sine', 0.2);
  },
  allIn: (c) => {
    sweep(c, 200, 1000, 0.25, 0.12);
    osc(c, 880, 0.2, 0.1, 'sawtooth', 0.15);
  },
  error: (c) => {
    osc(c, 150, 0.12, 0.08, 'sawtooth');
    osc(c, 120, 0.1, 0.06, 'square', 0.05);
  },
  spinTick: (c) => {
    osc(c, 1_400, 0.03, 0.05, 'triangle');
  },
  spinResult: (c) => {
    const notes = [523.3, 659.3, 784.0, 1046.5];
    notes.forEach((f, i) => osc(c, f, 0.25, 0.14, 'sine', i * 0.1));
    [0.4, 0.44, 0.48].forEach(when =>
      osc(c, 1_200 + Math.random() * 300, 0.2, 0.08, 'sine', when)
    );
  },
  levelUp: (c) => {
    const notes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0];
    notes.forEach((f, i) => osc(c, f, 0.35, 0.12, 'sine', i * 0.07));
    osc(c, 1046.5, 0.5, 0.15, 'sine', 0.45);
  },
  streakBonus: (c) => {
    sweep(c, 300, 900, 0.3, 0.1);
    osc(c, 880, 0.3, 0.1, 'sine', 0.15);
    osc(c, 1100, 0.25, 0.08, 'sine', 0.25);
  },
  achievement: (c) => {
    const notes = [523.3, 659.3, 784.0, 1046.5, 1318.5];
    notes.forEach((f, i) => osc(c, f, 0.3, 0.1, 'sine', i * 0.06));
    [0.3, 0.35, 0.4, 0.45].forEach(when =>
      osc(c, 1500 + Math.random() * 500, 0.2, 0.06, 'sine', when)
    );
  },
  missionComplete: (c) => {
    osc(c, 392.0, 0.4, 0.12, 'sine', 0);
    osc(c, 523.3, 0.35, 0.12, 'sine', 0.08);
    osc(c, 659.3, 0.3, 0.1, 'sine', 0.16);
    osc(c, 784.0, 0.35, 0.14, 'sine', 0.24);
  },
};

// ─── Pack-specific overrides ──────────────────────────────────────────────────

/** Per-pack sound implementations. Keys not present fall back to BASE_SOUNDS. */
export const PACK_OVERRIDES: Record<SoundPack, Record<SoundName, SoundImpl>> = {
  // classic === base
  classic: { ...BASE_SOUNDS },

  // Arcade — higher-pitched, digital, square waves
  arcade: {
    cardDeal: (c) => {
      osc(c, 1200, 0.04, 0.1, 'square');
      osc(c, 600, 0.03, 0.06, 'square', 0.02);
    },
    chip: (c) => {
      osc(c, 1600, 0.04, 0.09, 'square');
      osc(c, 800, 0.03, 0.05, 'square', 0.01);
    },
    chipSplash: (c) => {
      [0, 0.03, 0.06, 0.09].forEach(when =>
        osc(c, 1200 + Math.random() * 600, 0.04, 0.07, 'square', when)
      );
    },
    fold: (c) => {
      osc(c, 200, 0.1, 0.07, 'square');
      osc(c, 100, 0.06, 0.05, 'square', 0.05);
    },
    check: (c) => {
      osc(c, 600, 0.05, 0.08, 'square');
    },
    win: (c) => {
      const notes = [523.3, 659.3, 784.0, 1046.5, 784.0, 1046.5, 1318.5];
      notes.forEach((f, i) => osc(c, f, 0.12, 0.1, 'square', i * 0.08));
    },
    timerTick: (c) => {
      osc(c, 1200, 0.04, 0.1, 'square');
    },
    newHand: (c) => {
      osc(c, 880, 0.08, 0.08, 'square', 0);
      osc(c, 1100, 0.08, 0.08, 'square', 0.08);
      osc(c, 1320, 0.1, 0.1, 'square', 0.16);
    },
    allIn: (c) => {
      sweep(c, 300, 1500, 0.2, 0.12);
      osc(c, 1200, 0.15, 0.1, 'square', 0.1);
    },
    error: (c) => {
      osc(c, 200, 0.1, 0.1, 'square');
      osc(c, 100, 0.08, 0.08, 'square', 0.06);
    },
    spinTick: (c) => {
      osc(c, 1800, 0.02, 0.06, 'square');
    },
    spinResult: (c) => {
      const notes = [523.3, 659.3, 784.0, 1046.5, 1318.5];
      notes.forEach((f, i) => osc(c, f, 0.12, 0.12, 'square', i * 0.08));
    },
    levelUp: (c) => {
      const notes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1046.5];
      notes.forEach((f, i) => osc(c, f, 0.12, 0.11, 'square', i * 0.07));
    },
    streakBonus: (c) => {
      sweep(c, 400, 1200, 0.25, 0.1);
      osc(c, 1100, 0.2, 0.1, 'square', 0.15);
    },
    achievement: (c) => {
      const notes = [659.3, 784.0, 1046.5, 1318.5, 1568.0];
      notes.forEach((f, i) => osc(c, f, 0.12, 0.1, 'square', i * 0.06));
    },
    missionComplete: (c) => {
      osc(c, 523.3, 0.15, 0.12, 'square', 0);
      osc(c, 659.3, 0.15, 0.12, 'square', 0.1);
      osc(c, 784.0, 0.15, 0.12, 'square', 0.2);
      osc(c, 1046.5, 0.2, 0.14, 'square', 0.3);
    },
  },

  // Minimal — short, quiet, pure sine waves
  minimal: {
    cardDeal: (c) => {
      osc(c, 600, 0.04, 0.03, 'sine');
    },
    chip: (c) => {
      osc(c, 900, 0.05, 0.03, 'sine');
    },
    chipSplash: (c) => {
      [0, 0.05, 0.1, 0.15].forEach(when =>
        osc(c, 700 + Math.random() * 200, 0.04, 0.02, 'sine', when)
      );
    },
    fold: (c) => {
      osc(c, 250, 0.08, 0.04, 'sine');
    },
    check: (c) => {
      osc(c, 450, 0.06, 0.04, 'sine');
    },
    win: (c) => {
      osc(c, 440, 0.4, 0.06, 'sine', 0);
      osc(c, 554.4, 0.35, 0.06, 'sine', 0.15);
      osc(c, 659.3, 0.3, 0.08, 'sine', 0.3);
    },
    timerTick: (c) => {
      osc(c, 660, 0.04, 0.05, 'sine');
    },
    newHand: (c) => {
      osc(c, 440, 0.08, 0.05, 'sine', 0);
      osc(c, 550, 0.08, 0.05, 'sine', 0.12);
    },
    allIn: (c) => {
      sweep(c, 250, 700, 0.2, 0.08);
    },
    error: (c) => {
      osc(c, 180, 0.08, 0.05, 'sine');
    },
    spinTick: (c) => {
      osc(c, 1000, 0.02, 0.03, 'sine');
    },
    spinResult: (c) => {
      osc(c, 440, 0.3, 0.05, 'sine', 0);
      osc(c, 550, 0.25, 0.05, 'sine', 0.15);
      osc(c, 660, 0.2, 0.07, 'sine', 0.3);
    },
    levelUp: (c) => {
      osc(c, 440, 0.25, 0.06, 'sine', 0);
      osc(c, 550, 0.2, 0.06, 'sine', 0.2);
      osc(c, 660, 0.15, 0.08, 'sine', 0.4);
    },
    streakBonus: (c) => {
      osc(c, 550, 0.3, 0.07, 'sine', 0);
      osc(c, 660, 0.25, 0.07, 'sine', 0.15);
    },
    achievement: (c) => {
      const notes = [440, 550, 660, 880];
      notes.forEach((f, i) => osc(c, f, 0.2, 0.05, 'sine', i * 0.08));
    },
    missionComplete: (c) => {
      osc(c, 392.0, 0.3, 0.07, 'sine', 0);
      osc(c, 523.3, 0.25, 0.07, 'sine', 0.15);
      osc(c, 659.3, 0.2, 0.09, 'sine', 0.3);
    },
  },

  // Casino — rich, warm, layered tones
  casino: {
    cardDeal: (c) => {
      sweep(c, 800, 400, 0.06, 0.08);
      noise(c, 0.04, 0.06);
      osc(c, 1000, 0.03, 0.03, 'triangle', 0.04);
    },
    chip: (c) => {
      osc(c, 1_400, 0.07, 0.1, 'triangle');
      osc(c, 900, 0.05, 0.05, 'sine', 0.01);
      osc(c, 700, 0.03, 0.03, 'sine', 0.02);
    },
    chipSplash: (c) => {
      [0, 0.04, 0.08, 0.12, 0.16].forEach(when =>
        osc(c, 1000 + Math.random() * 500, 0.06, 0.07, 'triangle', when)
      );
    },
    fold: (c) => {
      sweep(c, 200, 90, 0.15, 0.1);
      noise(c, 0.08, 0.04);
      osc(c, 150, 0.1, 0.05, 'sine', 0.05);
    },
    check: (c) => {
      osc(c, 500, 0.1, 0.09, 'triangle');
      osc(c, 400, 0.06, 0.05, 'sine', 0.04);
    },
    win: (c) => {
      const notes = [261.6, 329.6, 392.0, 523.3];
      notes.forEach((f, i) => {
        osc(c, f, 0.5, 0.1, 'sine', i * 0.06);
        osc(c, f * 2, 0.4, 0.04, 'sine', i * 0.06 + 0.02);
      });
      [0.3, 0.35, 0.4, 0.45, 0.5].forEach(when =>
        osc(c, 800 + Math.random() * 400, 0.3, 0.04, 'sine', when)
      );
    },
    timerTick: (c) => {
      osc(c, 800, 0.07, 0.07, 'triangle');
      osc(c, 600, 0.04, 0.04, 'sine', 0.02);
    },
    newHand: (c) => {
      osc(c, 440, 0.12, 0.09, 'sine', 0);
      osc(c, 554.4, 0.12, 0.09, 'sine', 0.1);
      osc(c, 659.3, 0.14, 0.11, 'sine', 0.2);
      osc(c, 784.0, 0.12, 0.1, 'sine', 0.3);
    },
    allIn: (c) => {
      sweep(c, 180, 1100, 0.3, 0.14);
      osc(c, 880, 0.25, 0.1, 'sine', 0.15);
      osc(c, 1100, 0.2, 0.08, 'sine', 0.2);
    },
    error: (c) => {
      osc(c, 160, 0.14, 0.09, 'sawtooth');
      osc(c, 130, 0.12, 0.07, 'sawtooth', 0.06);
    },
    spinTick: (c) => {
      osc(c, 1600, 0.03, 0.06, 'triangle');
      osc(c, 800, 0.02, 0.03, 'sine', 0.01);
    },
    spinResult: (c) => {
      const notes = [523.3, 659.3, 784.0, 1046.5];
      notes.forEach((f, i) => {
        osc(c, f, 0.3, 0.14, 'sine', i * 0.1);
        osc(c, f * 1.5, 0.2, 0.05, 'sine', i * 0.1 + 0.05);
      });
      [0.45, 0.5, 0.55].forEach(when =>
        osc(c, 900 + Math.random() * 400, 0.25, 0.06, 'sine', when)
      );
    },
    levelUp: (c) => {
      const notes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0];
      notes.forEach((f, i) => {
        osc(c, f, 0.4, 0.12, 'sine', i * 0.07);
        osc(c, f * 2, 0.3, 0.04, 'sine', i * 0.07 + 0.03);
      });
      osc(c, 1046.5, 0.55, 0.15, 'sine', 0.45);
    },
    streakBonus: (c) => {
      sweep(c, 280, 950, 0.35, 0.11);
      osc(c, 880, 0.3, 0.1, 'sine', 0.15);
      osc(c, 1100, 0.25, 0.08, 'sine', 0.25);
      osc(c, 1320, 0.2, 0.06, 'sine', 0.3);
    },
    achievement: (c) => {
      const notes = [523.3, 659.3, 784.0, 1046.5, 1318.5];
      notes.forEach((f, i) => {
        osc(c, f, 0.35, 0.1, 'sine', i * 0.06);
        osc(c, f * 1.5, 0.25, 0.04, 'sine', i * 0.06 + 0.02);
      });
      [0.32, 0.37, 0.42, 0.47, 0.52].forEach(when =>
        osc(c, 1400 + Math.random() * 600, 0.25, 0.05, 'sine', when)
      );
    },
    missionComplete: (c) => {
      osc(c, 392.0, 0.45, 0.12, 'sine', 0);
      osc(c, 523.3, 0.4, 0.12, 'sine', 0.08);
      osc(c, 659.3, 0.35, 0.1, 'sine', 0.16);
      osc(c, 784.0, 0.4, 0.14, 'sine', 0.24);
      osc(c, 1046.5, 0.3, 0.12, 'sine', 0.36);
    },
  },
};

// ─── Core sound routing ───────────────────────────────────────────────────────

/**
 * Returns the AudioContext implementation for the given pack and sound name.
 * Falls back to the classic/base implementation if the pack has no override.
 */
export function getSoundFn(pack: SoundPack, name: SoundName): SoundImpl {
  return PACK_OVERRIDES[pack][name] ?? BASE_SOUNDS[name];
}

// ─── Public play functions ────────────────────────────────────────────────────

export function playCardDeal(): void {
  play(getSoundFn(_settings.soundPack, 'cardDeal'), SOUND_CATEGORIES.cardDeal);
}

export function playChip(): void {
  play(getSoundFn(_settings.soundPack, 'chip'), SOUND_CATEGORIES.chip);
}

export function playChipSplash(): void {
  play(getSoundFn(_settings.soundPack, 'chipSplash'), SOUND_CATEGORIES.chipSplash);
}

export function playFold(): void {
  play(getSoundFn(_settings.soundPack, 'fold'), SOUND_CATEGORIES.fold);
}

export function playCheck(): void {
  play(getSoundFn(_settings.soundPack, 'check'), SOUND_CATEGORIES.check);
}

export function playWin(): void {
  play(getSoundFn(_settings.soundPack, 'win'), SOUND_CATEGORIES.win);
}

export function playTimerTick(): void {
  play(getSoundFn(_settings.soundPack, 'timerTick'), SOUND_CATEGORIES.timerTick);
}

export function playNewHand(): void {
  play(getSoundFn(_settings.soundPack, 'newHand'), SOUND_CATEGORIES.newHand);
}

export function playAllIn(): void {
  play(getSoundFn(_settings.soundPack, 'allIn'), SOUND_CATEGORIES.allIn);
}

export function playError(): void {
  play(getSoundFn(_settings.soundPack, 'error'), SOUND_CATEGORIES.error);
}

export function playSpinTick(): void {
  play(getSoundFn(_settings.soundPack, 'spinTick'), SOUND_CATEGORIES.spinTick);
}

export function playSpinResult(): void {
  play(getSoundFn(_settings.soundPack, 'spinResult'), SOUND_CATEGORIES.spinResult);
}

export function playLevelUp(): void {
  play(getSoundFn(_settings.soundPack, 'levelUp'), SOUND_CATEGORIES.levelUp);
}

export function playStreakBonus(): void {
  play(getSoundFn(_settings.soundPack, 'streakBonus'), SOUND_CATEGORIES.streakBonus);
}

export function playAchievement(): void {
  play(getSoundFn(_settings.soundPack, 'achievement'), SOUND_CATEGORIES.achievement);
}

export function playMissionComplete(): void {
  play(getSoundFn(_settings.soundPack, 'missionComplete'), SOUND_CATEGORIES.missionComplete);
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

/**
 * Returns a no-arg wrapper that plays the named sound using the current pack.
 * Supports all SoundName values.
 */
export function getPackedSound(name: SoundName): () => void {
  return () => play(getSoundFn(_settings.soundPack, name), SOUND_CATEGORIES[name]);
}
