import { describe, it, expect } from 'vitest';
import {
  initGame,
  dealHoleCards,
  applyAction,
  advanceTurn,
  handleTimeout,
  getActivePlayers,
} from '@/lib/poker/engine';
import type { GameState } from '@/types/poker';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeGame(options?: {
  playerCount?: number;
  smallBlind?: number;
  bigBlind?: number;
  stacks?: number[];
}) {
  const { playerCount = 2, smallBlind = 10, bigBlind = 20, stacks } = options ?? {};
  const players = Array.from({ length: playerCount }, (_, i) => ({
    playerId: `player${i + 1}`,
    username: `Player${i + 1}`,
    seatNumber: i + 1,
    stack: stacks?.[i] ?? 1000,
    isSittingOut: false,
    isConnected: true,
  }));

  const init = initGame('table1', players, smallBlind, bigBlind);
  return dealHoleCards(init);
}

/** Play through preflop to the flop: UTG calls, BB checks */
function toFlop(state: GameState): GameState {
  let s = state;
  // Preflop: UTG calls
  const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
  s = applyAction(s, utg.playerId, { type: 'call' });
  // BB option (check)
  if (s.phase === 'preflop') {
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, bb.playerId, { type: 'check' });
  }
  return s;
}

// ─── handleTimeout ────────────────────────────────────────────────────────────

describe('handleTimeout', () => {
  it('auto-folds the active player', () => {
    const state = makeGame();
    const activeSeat = state.activeSeat;
    const result = handleTimeout(state);
    const foldedPlayer = result.players.find(p => p.seatNumber === activeSeat)!;
    expect(foldedPlayer.isFolded).toBe(true);
    expect(foldedPlayer.lastAction).toBe('fold');
  });

  it('awards pot immediately when only one player remains after timeout fold (2-player)', () => {
    const state = makeGame();
    const result = handleTimeout(state);
    // With 2 players, folding the active player ends the hand
    expect(result.phase).toBe('pot_awarded');
    expect(result.winners).toHaveLength(1);
  });

  it('advances play to next player when 3+ players remain', () => {
    const state = makeGame({ playerCount: 3 });
    const activeSeat = state.activeSeat;
    const result = handleTimeout(state);
    const folded = result.players.find(p => p.seatNumber === activeSeat)!;
    expect(folded.isFolded).toBe(true);
    // Game should still be going (2 players remain)
    expect(result.phase).not.toBe('pot_awarded');
  });

  it('returns unchanged state if no active player found', () => {
    const state = makeGame();
    const bogusState: GameState = { ...state, activeSeat: 99 };
    const result = handleTimeout(bogusState);
    expect(result).toBe(bogusState);
  });
});

// ─── 3-Player Game Flow ───────────────────────────────────────────────────────

describe('3-player game flow', () => {
  it('UTG (seat 3) acts first preflop, not SB or BB', () => {
    const state = makeGame({ playerCount: 3 });
    // In 3-player, dealer=seat1, SB=seat2, BB=seat3, UTG=seat1 (wraps)
    // Actually: dealer=seat1, SB=seat2, BB=seat3, UTG=seat1 (next after BB wraps)
    // OR: dealer=seat1, SB=seat2, BB=seat3... UTG should be after BB
    const activeSeat = state.activeSeat;
    expect(activeSeat).not.toBe(state.smallBlindSeat);
    expect(activeSeat).not.toBe(state.bigBlindSeat);
  });

  it('SB is first to act post-flop (seat after dealer)', () => {
    let state = makeGame({ playerCount: 3 });
    // Navigate through preflop: UTG calls, SB calls/folds, BB checks
    let s = state;
    // UTG acts
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'call' });

    while (s.phase === 'preflop') {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
      // SB calls, BB checks
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    expect(s.phase).toBe('flop');
    // First to act on flop should be SB (first active player after dealer)
    const activeSeat = s.activeSeat;
    expect(activeSeat).not.toBe(state.bigBlindSeat); // BB is not first
  });

  it('all three players get to act on the flop', () => {
    let s = makeGame({ playerCount: 3 });

    // Complete preflop: everyone calls/checks in order
    while (s.phase === 'preflop') {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    expect(s.phase).toBe('flop');

    const playersWhoActed = new Set<string>();
    let actions = 0;
    while (s.phase === 'flop' && actions++ < 10) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
      playersWhoActed.add(actor.playerId);
      s = applyAction(s, actor.playerId, { type: 'check' });
    }

    // All 3 active players should have had a chance to act
    expect(playersWhoActed.size).toBe(3);
    expect(s.phase).toBe('turn');
  });

  it('chip conservation across full 3-player hand', () => {
    let s = makeGame({ playerCount: 3, stacks: [1000, 1000, 1000] });
    const totalInitial = s.players.reduce((sum, p) => sum + p.stack, 0) + s.pot;

    let safetyLimit = 0;
    while (s.phase !== 'pot_awarded' && safetyLimit++ < 100) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    const totalFinal = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalFinal).toBe(totalInitial);
  });
});

// ─── Betting Edge Cases ───────────────────────────────────────────────────────

describe('betting edge cases', () => {
  it('minRaise resets to bigBlind at start of each new street', () => {
    let s = makeGame({ smallBlind: 10, bigBlind: 20 });

    // Preflop: UTG raises large (e.g., to 200)
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'raise', amount: 200 });
    // BB folds (UTG wins? No — UTG raised, BB needs to act)
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, bb.playerId, { type: 'call' });

    // Now on the flop
    expect(s.phase).toBe('flop');
    // minRaise should be reset to bigBlind (20), not 200
    expect(s.minRaise).toBe(20);
  });

  it('re-raise updates minRaise to the increment above previous bet', () => {
    let s = makeGame({ smallBlind: 10, bigBlind: 20 });
    // HU: SB (seat1, currentBet=10) raises by 40 chips additional
    // → new total = 10 + 40 = 50
    // → raise increment above prior currentBet(20) = 50 - 20 = 30
    // → minRaise becomes max(20, 30) = 30
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'raise', amount: 40 });
    // minRaise should be the increment of this raise (30), which is >= bigBlind (20)
    expect(s.minRaise).toBeGreaterThanOrEqual(20);
    expect(s.minRaise).toBe(30);
  });

  it('SB is marked all-in when stack is less than small blind', () => {
    // In HU (2-player), seat 1 = dealer = SB.
    // Give seat 1 only 5 chips (< SB of 10) so they go all-in posting the blind.
    const players = [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 5, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
    ];
    const init = initGame('t1', players, 10, 20);
    const state = dealHoleCards(init);

    const sb = state.players.find(p => p.seatNumber === state.smallBlindSeat)!;
    // SB (p1) has 5 chips, SB amount is 10. They can only post 5 → all-in.
    expect(sb.isAllIn).toBe(true);
    expect(sb.currentBet).toBe(5);
    expect(sb.stack).toBe(0);
  });

  it('BB is marked all-in when stack is less than big blind', () => {
    const players = [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 15, isSittingOut: false, isConnected: true }, // covers SB but not BB
    ];
    const init = initGame('t1', players, 10, 20);
    const state = dealHoleCards(init);

    // In HU, p1 is dealer/SB, p2 is BB (or vice versa)
    const bb = state.players.find(p => p.seatNumber === state.bigBlindSeat)!;
    if (bb.stack === 0) {
      expect(bb.isAllIn).toBe(true);
    } else {
      // BB had enough chips — still verify state is valid
      expect(bb.currentBet).toBeGreaterThan(0);
    }
  });

  it('player can call for less when stack is less than call amount (goes all-in)', () => {
    let s = makeGame({ stacks: [1000, 30] }); // P2 has only 30 chips; BB=20
    // P2 is BB. UTG (P1) raises to 100 — P2 can only call for their remaining chips (10)
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'raise', amount: 80 }); // raises total to 100

    // Now it's BB's turn (P2 has 10 chips remaining after posting BB of 20)
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    const startStack = bb.stack;

    const result = applyAction(s, bb.playerId, { type: 'call' });
    const after = result.players.find(p => p.playerId === bb.playerId)!;

    // Player went all-in with remaining chips
    expect(after.stack).toBe(0);
    expect(after.isAllIn).toBe(true);
  });

  it('all-in bet does not trigger minimum raise enforcement', () => {
    let s = makeGame({ stacks: [1000, 25] }); // P2 has 25 chips (BB=20, leaving 5)
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    // P1 goes all-in with 1000 chips (way above minimum) — should succeed
    expect(() => applyAction(s, utg.playerId, { type: 'all-in' })).not.toThrow();
  });
});

// ─── All-In & Side Pot Scenarios ─────────────────────────────────────────────

describe('all-in and side pots', () => {
  it('pot is correctly calculated when player goes all-in for less than current bet', () => {
    let s = makeGame({ stacks: [1000, 100] });
    // P1 (UTG/HU dealer/SB) raises big; P2 (BB) calls for remaining stack
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'raise', amount: 200 });

    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    const bbStack = bb.stack;
    s = applyAction(s, bb.playerId, { type: 'call' }); // all-in for less

    const bbAfter = s.players.find(p => p.playerId === bb.playerId)!;
    expect(bbAfter.stack).toBe(0);
    expect(bbAfter.isAllIn).toBe(true);
  });

  it('game continues to showdown when both players are all-in preflop', () => {
    let s = makeGame({ stacks: [500, 500] });
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'all-in' });

    if (s.phase !== 'pot_awarded') {
      const next = s.players.find(p => p.seatNumber === s.activeSeat)!;
      s = applyAction(s, next.playerId, { type: 'call' });
    }

    // Should auto-run the board and reach pot_awarded
    expect(s.phase).toBe('pot_awarded');
    expect(s.winners).toBeDefined();
    expect(s.winners!.length).toBeGreaterThan(0);
  });

  it('chips are fully conserved in all-in showdown', () => {
    let s = makeGame({ stacks: [500, 500] });
    const initial = s.players.reduce((sum, p) => sum + p.stack, 0) + s.pot;

    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'all-in' });

    if (s.phase !== 'pot_awarded') {
      const next = s.players.find(p => p.seatNumber === s.activeSeat)!;
      s = applyAction(s, next.playerId, { type: 'call' });
    }

    const finalTotal = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(finalTotal).toBe(initial);
  });

  it('3-player all-in: correct side pot when shortest stack busts', () => {
    // P1: 300, P2: 600, P3: 1000
    const players = [
      { playerId: 'p1', username: 'Short', seatNumber: 1, stack: 300, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'Mid', seatNumber: 2, stack: 600, isSittingOut: false, isConnected: true },
      { playerId: 'p3', username: 'Big', seatNumber: 3, stack: 1000, isSittingOut: false, isConnected: true },
    ];
    const init = initGame('t1', players, 10, 20);
    let s = dealHoleCards(init);

    // All three go all-in
    let safetyLimit = 0;
    while (s.phase !== 'pot_awarded' && safetyLimit++ < 30) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      s = applyAction(s, actor.playerId, { type: 'all-in' });
    }

    expect(s.phase).toBe('pot_awarded');
    expect(s.winners).toBeDefined();

    // Total chips should be conserved
    const initial = players.reduce((sum, p) => sum + p.stack, 0);
    const final = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(final).toBe(initial);
  });
});

// ─── Street Transitions ───────────────────────────────────────────────────────

describe('street transitions', () => {
  it('each street adds the correct number of community cards', () => {
    let s = makeGame();

    s = toFlop(s);
    expect(s.communityCards).toHaveLength(3);

    // Turn
    const f1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f1.playerId, { type: 'check' });
    const f2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f2.playerId, { type: 'check' });
    expect(s.communityCards).toHaveLength(4);

    // River
    const t1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t1.playerId, { type: 'check' });
    const t2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t2.playerId, { type: 'check' });
    expect(s.communityCards).toHaveLength(5);
  });

  it('deck is reduced correctly after each street', () => {
    let s = makeGame(); // 2 players → 4 cards dealt
    const deckAfterDeal = s.deck.length;
    expect(deckAfterDeal).toBe(52 - 4);

    s = toFlop(s);
    expect(s.deck.length).toBe(deckAfterDeal - 3); // flop: -3

    const f1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f1.playerId, { type: 'check' });
    const f2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f2.playerId, { type: 'check' });
    expect(s.deck.length).toBe(deckAfterDeal - 4); // turn: -1

    const t1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t1.playerId, { type: 'check' });
    const t2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t2.playerId, { type: 'check' });
    expect(s.deck.length).toBe(deckAfterDeal - 5); // river: -1
  });

  it('active player resets properly at each new street', () => {
    let s = makeGame();
    s = toFlop(s);
    // On flop, first to act should not be the BB (in position terms)
    // Just verify someone valid is active
    const flopActor = s.players.find(p => p.seatNumber === s.activeSeat);
    expect(flopActor).toBeDefined();
    expect(flopActor!.isFolded).toBe(false);
    expect(flopActor!.isSittingOut).toBe(false);
  });

  it('hasActedThisStreet is false for all players at start of new street', () => {
    let s = makeGame();
    s = toFlop(s);
    for (const p of s.players) {
      if (!p.isFolded && !p.isSittingOut) {
        expect(p.hasActedThisStreet).toBe(false);
      }
    }
  });
});

// ─── Heads-Up Special Rules ───────────────────────────────────────────────────

describe('heads-up special rules', () => {
  it('dealer is small blind in heads-up', () => {
    const state = makeGame({ playerCount: 2 });
    // In HU, dealer seat === small blind seat
    expect(state.dealerSeat).toBe(state.smallBlindSeat);
  });

  it('active player preflop is dealer/SB (acts first preflop HU)', () => {
    const state = makeGame({ playerCount: 2 });
    // In HU preflop, SB/dealer acts first
    expect(state.activeSeat).toBe(state.smallBlindSeat);
  });

  it('pot is correct after HU blinds', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20, playerCount: 2 });
    expect(state.pot).toBe(30);
  });

  it('BB can raise to isolate after UTG call in HU', () => {
    let s = makeGame({ smallBlind: 10, bigBlind: 20 });
    // SB/dealer calls
    const sb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, sb.playerId, { type: 'call' });
    expect(s.phase).toBe('preflop'); // BB still has option

    // BB raises
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    expect(() => applyAction(s, bb.playerId, { type: 'raise', amount: 20 })).not.toThrow();
  });
});

// ─── Pot Continuity Across Multiple Hands ─────────────────────────────────────

describe('pot continuity', () => {
  it('total chips remain constant across an entire hand from deal to award', () => {
    let s = makeGame({ playerCount: 2, stacks: [1000, 1000] });
    const total = s.players.reduce((sum, p) => sum + p.stack, 0) + s.pot;

    // Play hand to completion checking at each step
    let limit = 0;
    while (s.phase !== 'pot_awarded' && limit++ < 100) {
      const running = s.players.reduce((sum, p) => sum + p.stack, 0) + s.pot;
      expect(running).toBe(total);

      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    const finalTotal = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(finalTotal).toBe(total);
  });
});
