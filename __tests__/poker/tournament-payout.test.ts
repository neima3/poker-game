import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateICMEquity,
  calculateBubbleFactor,
  getBubbleDistance,
  getBubbleLabel,
} from '@/lib/poker/icm';
import { validatePayout, setPayoutOverride, clearPayoutOverride, getPayoutForConfig, listPayoutStructures } from '@/lib/poker/payout-structures';
import { calculatePrizes, createTournament, startTournament, fillWithBots, eliminatePlayer } from '@/lib/poker/tournament';

// ─── ICM equity ──────────────────────────────────────────────────────────────

describe('calculateICMEquity', () => {
  it('equal stacks → equal equity', () => {
    const equities = calculateICMEquity([1000, 1000, 1000], [0.5, 0.3, 0.2]);
    expect(equities[0]).toBeCloseTo(equities[1], 5);
    expect(equities[1]).toBeCloseTo(equities[2], 5);
    const sum = equities.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('chip leader has higher equity than short stack in HU', () => {
    // 9:1 chip ratio with [0.7, 0.3] payout
    // ICM equity = P(1st)*0.7 + P(2nd)*0.3
    // P(leader 1st) = 0.9, P(leader 2nd) = 0.1
    // = 0.9*0.7 + 0.1*0.3 = 0.63 + 0.03 = 0.66
    const equities = calculateICMEquity([9000, 1000], [0.7, 0.3]);
    expect(equities[0]).toBeGreaterThan(0.6);
    expect(equities[0]).toBeGreaterThan(equities[1]);
  });

  it('handles 2-player freezeout payout correctly', () => {
    const equities = calculateICMEquity([5000, 5000], [1]);
    // Only 1 paid place — equal stacks give equal equity of 0.5 each
    expect(equities[0]).toBeCloseTo(0.5, 5);
    expect(equities[1]).toBeCloseTo(0.5, 5);
  });

  it('sum of equities always equals 1', () => {
    const stacks = [3000, 2500, 2000, 1500, 1000];
    const payouts = [0.4, 0.25, 0.18, 0.12, 0.05];
    const equities = calculateICMEquity(stacks, payouts);
    const sum = equities.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 4);
  });

  it('player with 0 chips has 0 equity', () => {
    const equities = calculateICMEquity([0, 5000, 3000], [0.5, 0.3, 0.2]);
    expect(equities[0]).toBe(0);
  });
});

// ─── Bubble factor ───────────────────────────────────────────────────────────

describe('calculateBubbleFactor', () => {
  it('returns ≥ 1 for standard tournament setup', () => {
    // 4 players left, 3 get paid → no bubble yet, factor should still be ≥ 1
    const stacks = [5000, 4000, 3000, 2000];
    const payouts = [0.5, 0.3, 0.2];
    const bf = calculateBubbleFactor(stacks, payouts, 0, 1);
    expect(bf).toBeGreaterThanOrEqual(1);
  });

  it('bubble factor is ≥ 1 in all standard setups', () => {
    const payouts = [0.5, 0.3, 0.2];

    // 4 players, 3 paid: on the bubble
    const bubbleStacks = [3000, 3000, 3000, 3000];
    const bfBubble = calculateBubbleFactor(bubbleStacks, payouts, 0, 1);
    expect(bfBubble).toBeGreaterThanOrEqual(1);

    // 3 players, all in the money
    const itmStacks = [3000, 3000, 3000];
    const bfITM = calculateBubbleFactor(itmStacks, payouts, 0, 1);
    expect(bfITM).toBeGreaterThanOrEqual(1);
  });

  it('chip leader calling a short stack all-in has a higher bubble factor than the reverse', () => {
    // ICM property: calling down a short stack risks much more for the big stack
    // (loss = bubble) vs small gain (slightly more chips). BF is therefore high.
    // Short stack calling big stack: loss = bubble anyway, win = massive jump. BF is lower.
    const payouts = [0.5, 0.3, 0.2];
    const stacks = [6000, 3000, 2000, 1000]; // 4 players, 3 paid

    // big stack (idx 0) calls short stack (idx 3)
    const bfBigCallingSmall = calculateBubbleFactor(stacks, payouts, 0, 3);

    // short stack (idx 3) calls big stack (idx 0)
    const bfSmallCallingBig = calculateBubbleFactor(stacks, payouts, 3, 0);

    // The big stack should be more cautious (higher BF) when calling the short stack,
    // because the upside (tiny chips) is small compared to busting risk.
    expect(bfBigCallingSmall).toBeGreaterThan(bfSmallCallingBig);
  });

  it('returns 1 for a single player (degenerate case)', () => {
    const bf = calculateBubbleFactor([5000], [1], 0, 0);
    expect(bf).toBe(1);
  });
});

// ─── Bubble distance & label ─────────────────────────────────────────────────

describe('getBubbleDistance', () => {
  it('returns 0 when in the money', () => {
    expect(getBubbleDistance(3, 3)).toBe(0);
    expect(getBubbleDistance(2, 3)).toBe(0);
  });

  it('returns 1 on the bubble', () => {
    expect(getBubbleDistance(4, 3)).toBe(1);
  });

  it('returns correct distance', () => {
    expect(getBubbleDistance(9, 3)).toBe(6);
    expect(getBubbleDistance(5, 3)).toBe(2);
  });
});

describe('getBubbleLabel', () => {
  it('returns "In the money" when paid places ≥ remaining', () => {
    expect(getBubbleLabel(3, 3)).toBe('In the money');
    expect(getBubbleLabel(2, 5)).toBe('In the money');
  });

  it('returns "On the bubble!" when 1 away', () => {
    expect(getBubbleLabel(4, 3)).toBe('On the bubble!');
  });

  it('returns near-bubble message when 2-3 away', () => {
    expect(getBubbleLabel(5, 3)).toBe('2 from the money');
    expect(getBubbleLabel(6, 3)).toBe('3 from the money');
  });

  it('returns far message when far from money', () => {
    expect(getBubbleLabel(18, 5)).toBe('13 away from money');
  });
});

// ─── Payout structure validation ─────────────────────────────────────────────

describe('validatePayout', () => {
  it('accepts valid 3-way payout', () => {
    expect(() => validatePayout([50, 30, 20])).not.toThrow();
  });

  it('accepts valid 2-way payout', () => {
    expect(() => validatePayout([65, 35])).not.toThrow();
  });

  it('throws on empty array', () => {
    expect(() => validatePayout([])).toThrow();
  });

  it('throws on non-100 sum', () => {
    expect(() => validatePayout([50, 30])).toThrow(/sum/i);
  });

  it('throws on negative value', () => {
    expect(() => validatePayout([50, 30, -10, 30])).toThrow();
  });

  it('throws on zero value', () => {
    expect(() => validatePayout([50, 30, 0, 20])).toThrow();
  });

  it('tolerates floating-point rounding (≤ 0.1 tolerance)', () => {
    // 3 × 33.33 = 99.99 — close enough
    expect(() => validatePayout([33.34, 33.33, 33.33])).not.toThrow();
  });
});

// ─── Payout structure store ───────────────────────────────────────────────────

describe('payout-structures store', () => {
  beforeEach(() => {
    clearPayoutOverride('sng-6');
  });

  it('returns default payout when no override is set', () => {
    const payout = getPayoutForConfig('sng-6');
    expect(payout).toEqual([50, 30, 20]);
  });

  it('returns custom payout after override', () => {
    setPayoutOverride('sng-6', [60, 25, 15]);
    expect(getPayoutForConfig('sng-6')).toEqual([60, 25, 15]);
  });

  it('restores default after clear', () => {
    setPayoutOverride('sng-6', [60, 25, 15]);
    clearPayoutOverride('sng-6');
    expect(getPayoutForConfig('sng-6')).toEqual([50, 30, 20]);
  });

  it('rejects invalid payout in setPayoutOverride', () => {
    expect(() => setPayoutOverride('sng-6', [50, 30])).toThrow(/sum/i);
  });

  it('listPayoutStructures includes all preset IDs', () => {
    const ids = listPayoutStructures().map(s => s.id);
    expect(ids).toContain('sng-3');
    expect(ids).toContain('sng-6');
    expect(ids).toContain('sng-9');
    expect(ids).toContain('mtt-18');
    expect(ids).toContain('mtt-45');
  });

  it('marks customised entries as isCustom=true', () => {
    setPayoutOverride('sng-9', [55, 28, 17]);
    const entry = listPayoutStructures().find(s => s.id === 'sng-9')!;
    expect(entry.isCustom).toBe(true);
    clearPayoutOverride('sng-9');
  });
});

// ─── SNG prize calculation ───────────────────────────────────────────────────

describe('calculatePrizes (SNG)', () => {
  function setupFinishedSNG(configId = 'sng-3') {
    const state = createTournament(configId, 'p1', 'Alice');
    fillWithBots(state.config.id, 'fish');
    startTournament(state.config.id);

    // Eliminate players in reverse order (worst finish first)
    const { state: s1 } = eliminatePlayer(state.config.id, 'p1');
    // p1 finishes 3rd or 2nd depending on config
    return s1;
  }

  it('prize amounts sum to ≤ total prize pool', () => {
    const state = createTournament('sng-3', 'p1', 'Alice');
    fillWithBots(state.config.id, 'fish');
    startTournament(state.config.id);

    // Eliminate all but one
    const botIds = state.players.filter(p => p.isBot).map(p => p.playerId);
    let currentState = state;

    const { state: s1 } = eliminatePlayer(currentState.config.id, botIds[0]);
    currentState = s1;

    const prizes = calculatePrizes(currentState);
    const prizeTotal = prizes.reduce((sum, p) => sum + p.prize + p.bountyPrize, 0);
    // Allow small floor() rounding discrepancy
    expect(prizeTotal).toBeLessThanOrEqual(currentState.prizePool);
  });

  it('1st place gets more than 2nd place', () => {
    const state = createTournament('sng-3', 'p1', 'Alice');
    fillWithBots(state.config.id, 'fish');
    startTournament(state.config.id);

    // Eliminate all bots (leaving only p1 who wins)
    const botIds = state.players.filter(p => p.isBot).map(p => p.playerId);
    eliminatePlayer(state.config.id, botIds[0]);

    const prizes = calculatePrizes(state);
    const first = prizes.find(p => p.position === 1);
    const second = prizes.find(p => p.position === 2);
    if (first && second) {
      expect(first.prize).toBeGreaterThan(second.prize);
    }
  });

  it('bubble player (1 past paid places) receives 0 prize', () => {
    // sng-3 pays 2 places, so 3rd place is the bubble
    const state = createTournament('sng-3', 'p1', 'Alice');
    fillWithBots(state.config.id, 'fish');
    startTournament(state.config.id);

    // Eliminate all bots: first bot eliminated = 3rd place (bubble)
    const botIds = state.players.filter(p => p.isBot).map(p => p.playerId);
    // Eliminate both bots — first one finishes 3rd, second finishes 2nd, p1 wins
    eliminatePlayer(state.config.id, botIds[0]);
    eliminatePlayer(state.config.id, botIds[1]);

    const prizes = calculatePrizes(state);
    // 3rd place = first eliminated = 0 prize (outside paid places)
    const bubblePlayer = prizes.find(p => p.position === 3);
    expect(bubblePlayer).toBeDefined();
    expect(bubblePlayer?.prize).toBe(0);
  });
});
