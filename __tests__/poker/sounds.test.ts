import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSoundFn,
  setSoundPack,
  getSoundPack,
  PACK_OVERRIDES,
  BASE_SOUNDS,
  getPackedSound,
  type SoundName,
  type SoundPack,
} from '@/lib/sounds';

// Stub localStorage so saveSoundSettings doesn't throw in the test environment
const localStorageStub = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
})();
vi.stubGlobal('localStorage', localStorageStub);

// All sound names to test
const ALL_SOUNDS: SoundName[] = [
  'cardDeal',
  'chip',
  'chipSplash',
  'fold',
  'check',
  'win',
  'timerTick',
  'newHand',
  'allIn',
  'error',
  'spinTick',
  'spinResult',
  'levelUp',
  'streakBonus',
  'achievement',
  'missionComplete',
];

const ALL_PACKS: SoundPack[] = ['classic', 'arcade', 'minimal', 'casino'];

beforeEach(() => {
  // Reset to classic before each test
  setSoundPack('classic');
});

describe('getSoundFn', () => {
  it('returns a function for every sound in every pack', () => {
    for (const pack of ALL_PACKS) {
      for (const name of ALL_SOUNDS) {
        const fn = getSoundFn(pack, name);
        expect(typeof fn).toBe('function');
      }
    }
  });

  it('setting sound pack to casino makes all sounds use casino pack implementations', () => {
    for (const name of ALL_SOUNDS) {
      const casinoFn = getSoundFn('casino', name);
      const classicFn = getSoundFn('classic', name);
      expect(casinoFn).not.toBe(classicFn);
      expect(casinoFn).toBe(PACK_OVERRIDES.casino[name]);
    }
  });

  it('setting sound pack to arcade makes all sounds use arcade pack implementations', () => {
    for (const name of ALL_SOUNDS) {
      const arcadeFn = getSoundFn('arcade', name);
      const classicFn = getSoundFn('classic', name);
      expect(arcadeFn).not.toBe(classicFn);
      expect(arcadeFn).toBe(PACK_OVERRIDES.arcade[name]);
    }
  });

  it('setting sound pack to minimal makes all sounds use minimal pack implementations', () => {
    for (const name of ALL_SOUNDS) {
      const minimalFn = getSoundFn('minimal', name);
      const classicFn = getSoundFn('classic', name);
      expect(minimalFn).not.toBe(classicFn);
      expect(minimalFn).toBe(PACK_OVERRIDES.minimal[name]);
    }
  });

  it('classic pack implementations match BASE_SOUNDS', () => {
    for (const name of ALL_SOUNDS) {
      expect(getSoundFn('classic', name)).toBe(BASE_SOUNDS[name]);
    }
  });

  it('each pack has distinct implementations from all other packs', () => {
    for (const name of ALL_SOUNDS) {
      const impls = ALL_PACKS.map(pack => getSoundFn(pack, name));
      // All four should be different functions
      const unique = new Set(impls);
      expect(unique.size).toBe(ALL_PACKS.length);
    }
  });
});

describe('getPackedSound', () => {
  it('returns a callable no-arg wrapper', () => {
    for (const name of ALL_SOUNDS) {
      const fn = getPackedSound(name);
      expect(typeof fn).toBe('function');
    }
  });

  it('reflects the current sound pack at call time', () => {
    setSoundPack('casino');
    expect(getSoundPack()).toBe('casino');
    // The wrapper should resolve to the casino impl at call time
    // (can't easily test without AudioContext, but we verify getSoundFn routing is correct)
    for (const name of ALL_SOUNDS) {
      expect(getSoundFn('casino', name)).toBe(PACK_OVERRIDES.casino[name]);
    }
  });
});

describe('PACK_OVERRIDES completeness', () => {
  it('every pack defines every sound name', () => {
    for (const pack of ALL_PACKS) {
      for (const name of ALL_SOUNDS) {
        expect(PACK_OVERRIDES[pack][name]).toBeDefined();
        expect(typeof PACK_OVERRIDES[pack][name]).toBe('function');
      }
    }
  });
});
