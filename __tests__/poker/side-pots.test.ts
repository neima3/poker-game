/**
 * Unit tests for side pot calculation and distribution.
 * Covers: 3-way all-in, partial call all-in, main+side+side pots,
 * and the fold-to-one case where winner should receive all chips.
 */
import { describe, it, expect } from 'vitest';
import { advanceTurn } from '@/lib/poker/engine';
import type { GameState } from '@/types/poker';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal river-phase GameState for side pot testing.
 * All players have hasActedThisStreet=true and currentBet=0 so the round
 * is considered complete by isRoundComplete.
 */
function makeRiverState(
  players: Array<{
    id: string;
    totalInPot: number;
    stack: number;
    isFolded: boolean;
    isAllIn: boolean;
    cards?: [string, string];
  }>,
  communityCards: string[] = ['2c', '7d', '9h', 'Js', 'Kc'],
): GameState {
  const pot = players.reduce((s, p) => s + p.totalInPot, 0);
  return {
    tableId: 'test',
    phase: 'river',
    pot,
    sidePots: [],
    communityCards,
    currentBet: 0,
    minRaise: 20,
    smallBlind: 10,
    bigBlind: 20,
    dealerSeat: 1,
    activeSeat: 1,
    smallBlindSeat: 2,
    bigBlindSeat: 3,
    deck: [],
    players: players.map((p, i) => ({
      playerId: p.id,
      username: p.id,
      seatNumber: i + 1,
      stack: p.stack,
      currentBet: 0,
      totalInPot: p.totalInPot,
      cards: (p.cards ?? ['2s', '3h']) as [string, string],
      isFolded: p.isFolded,
      isAllIn: p.isAllIn,
      isSittingOut: false,
      isConnected: true,
      hasActedThisStreet: true,
    })),
  };
}

function totalChips(state: GameState): number {
  return state.players.reduce((s, p) => s + p.stack, 0);
}

// ─── Fold-to-one: winner gets all chips ───────────────────────────────────────

describe('fold-to-one: sole remaining player wins entire pot', () => {
  it('awards all chips when winner contributed less than folded players', () => {
    // A is all-in for $50; B and C each put $200 then folded.
    // Without the fix, B and C's extra contributions would be "lost" (not awarded).
    const state = makeRiverState([
      { id: 'A', totalInPot: 50, stack: 0, isFolded: false, isAllIn: true },
      { id: 'B', totalInPot: 200, stack: 800, isFolded: true, isAllIn: false },
      { id: 'C', totalInPot: 200, stack: 800, isFolded: true, isAllIn: false },
    ]);

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');
    const A = result.players.find(p => p.playerId === 'A')!;
    expect(A.stack).toBe(450); // won all 450 in pot (50 + 200 + 200)

    // Chips conserved: 0 + 800 + 800 original stacks + 450 pot = 2050
    expect(totalChips(result)).toBe(2050);
  });

  it('awards all chips in a 2-player fold where winner was all-in for less', () => {
    const state = makeRiverState([
      { id: 'A', totalInPot: 100, stack: 0, isFolded: false, isAllIn: true },
      { id: 'B', totalInPot: 300, stack: 700, isFolded: true, isAllIn: false },
    ]);

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');
    const A = result.players.find(p => p.playerId === 'A')!;
    expect(A.stack).toBe(400); // all 400 in pot

    expect(totalChips(result)).toBe(1100); // 0 + 700 + 400 pot
  });
});

// ─── 3-way all-in at different amounts ────────────────────────────────────────

describe('3-way all-in showdown', () => {
  it('distributes main pot and side pots correctly by eligibility', () => {
    // A: all-in $100 (smallest stack), has best hand (trips kings)
    // B: all-in $200, has weakest (one pair aces — loses to C's two pair)
    // C: all-in $300, second best (two pair: 3s and 2s)
    // Board: 2c 3d 7h Js Kh
    //   A (Ks,Kd): trips kings  → wins main pot (eligible: A,B,C)
    //   C (2s,3s): two pair 3s+2s → wins side pot 1 (eligible: B,C; two pair > one pair)
    //   C:                        → also wins side pot 2 (eligible: C only)
    const state = makeRiverState(
      [
        { id: 'A', totalInPot: 100, stack: 0, isFolded: false, isAllIn: true, cards: ['Ks', 'Kd'] },
        { id: 'B', totalInPot: 200, stack: 0, isFolded: false, isAllIn: true, cards: ['As', 'Ad'] },
        { id: 'C', totalInPot: 300, stack: 0, isFolded: false, isAllIn: true, cards: ['2s', '3s'] },
      ],
      ['2c', '3d', '7h', 'Js', 'Kh'],
    );

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');

    const A = result.players.find(p => p.playerId === 'A')!;
    const B = result.players.find(p => p.playerId === 'B')!;
    const C = result.players.find(p => p.playerId === 'C')!;

    // Main pot ($300): eligible [A,B,C], A wins (KKK trips beats AA and 33+22)
    // Side pot 1 ($200): eligible [B,C], C wins (two pair 33+22 beats one pair AA)
    // Side pot 2 ($100): eligible [C], C wins automatically
    expect(A.stack).toBe(300);
    expect(B.stack).toBe(0);
    expect(C.stack).toBe(300);

    // Chips conserved
    expect(A.stack + B.stack + C.stack).toBe(600);
  });

  it('conserves all chips across a 3-way all-in fold scenario', () => {
    const state = makeRiverState([
      { id: 'A', totalInPot: 100, stack: 0, isFolded: false, isAllIn: true },
      { id: 'B', totalInPot: 200, stack: 0, isFolded: true, isAllIn: true },
      { id: 'C', totalInPot: 300, stack: 0, isFolded: true, isAllIn: false },
    ]);

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');
    expect(totalChips(result)).toBe(600);

    const A = result.players.find(p => p.playerId === 'A')!;
    expect(A.stack).toBe(600); // sole remaining player wins all
  });
});

// ─── Partial call all-in (main + side pot split) ──────────────────────────────

describe('partial call all-in (main pot + side pot)', () => {
  it('correctly splits main pot and side pot at showdown', () => {
    // A: all-in $100 (raised), B: all-in $50 (partial call), C: called $100
    // Main pot: $150 (50 * 3), eligible [A, B, C]
    // Side pot: $100 (50 * 2 from A and C), eligible [A, C]
    //
    // Cards: A(As,Ah) has aces — wins both pots where eligible
    //        B(2s,3h) weakest
    //        C(Kd,Kc) pair of kings
    // Board: 2c 4d 8h Js Qh
    const state = makeRiverState(
      [
        { id: 'A', totalInPot: 100, stack: 0, isFolded: false, isAllIn: true, cards: ['As', 'Ah'] },
        { id: 'B', totalInPot: 50, stack: 0, isFolded: false, isAllIn: true, cards: ['2s', '3h'] },
        { id: 'C', totalInPot: 100, stack: 0, isFolded: false, isAllIn: true, cards: ['Kd', 'Kc'] },
      ],
      ['2c', '4d', '8h', 'Js', 'Qh'],
    );

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');

    const A = result.players.find(p => p.playerId === 'A')!;
    const B = result.players.find(p => p.playerId === 'B')!;
    const C = result.players.find(p => p.playerId === 'C')!;

    // A wins main pot ($150) and side pot ($100) = $250
    // B is not eligible for side pot but wins nothing from main either
    // C wins nothing (A beats C in side pot)
    expect(A.stack).toBe(250);
    expect(B.stack).toBe(0);
    expect(C.stack).toBe(0);

    expect(totalChips(result)).toBe(250);
  });

  it('correctly awards side pot to stronger eligible player when main pot winner is all-in for less', () => {
    // B is all-in for $50 (partial), A is all-in for $200, C called $200
    // Main pot: $150 (50 * 3), eligible [A, B, C]
    // Side pot: $300 (150 * 2 from A and C), eligible [A, C]
    //
    // B has best cards (AA) → wins main pot only (not eligible for side pot).
    // A beats C in side pot (KK > pair of 2s).
    // Board: 2c 4d 8h Js Qh
    const state = makeRiverState(
      [
        { id: 'A', totalInPot: 200, stack: 0, isFolded: false, isAllIn: true, cards: ['Ks', 'Kd'] },
        { id: 'B', totalInPot: 50, stack: 0, isFolded: false, isAllIn: true, cards: ['As', 'Ah'] },
        { id: 'C', totalInPot: 200, stack: 0, isFolded: false, isAllIn: true, cards: ['2s', '3h'] },
      ],
      ['2c', '4d', '8h', 'Js', 'Qh'],
    );

    const result = advanceTurn(state, 1);

    expect(result.phase).toBe('pot_awarded');

    const A = result.players.find(p => p.playerId === 'A')!;
    const B = result.players.find(p => p.playerId === 'B')!;
    const C = result.players.find(p => p.playerId === 'C')!;

    // Main pot ($150, eligible A/B/C): B has AA (best) → B wins $150
    // Side pot ($300, eligible A/C): A has KK, C has pair of 2s → A wins $300
    expect(B.stack).toBe(150);
    expect(A.stack).toBe(300);
    expect(C.stack).toBe(0);

    expect(totalChips(result)).toBe(450);
  });
});
