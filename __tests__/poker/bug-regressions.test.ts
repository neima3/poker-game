/**
 * Regression tests for the 7 critical bugs documented in TEST_REPORT.md
 * Each test verifies the fix for a specific bug.
 */
import { describe, it, expect } from 'vitest';
import {
  initGame,
  dealHoleCards,
  applyAction,
  sanitizeForPlayer,
  sanitizeForSpectator,
  handleTimeout,
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

function toFlop(state: GameState): GameState {
  let s = state;
  const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
  s = applyAction(s, utg.playerId, { type: 'call' });
  if (s.phase === 'preflop') {
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, bb.playerId, { type: 'check' });
  }
  return s;
}

// ─── BUG-01: Betting Round Completion Logic ──────────────────────────────────
// isRoundComplete must not skip players on post-preflop streets
// where currentBet = 0. hasActedThisStreet prevents premature completion.

describe('BUG-01: Betting round progression', () => {
  it('does NOT advance to turn after only one player checks on flop', () => {
    let s = makeGame();
    s = toFlop(s);
    expect(s.phase).toBe('flop');

    // Only one player checks — should NOT advance to turn yet
    const actor1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, actor1.playerId, { type: 'check' });
    expect(s.phase).toBe('flop'); // Still on flop — second player hasn't acted
  });

  it('all players get to act on every post-flop street (3 players)', () => {
    let s = makeGame({ playerCount: 3 });

    // Complete preflop
    while (s.phase === 'preflop') {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    // Verify all 3 streets: flop, turn, river
    for (const expectedPhase of ['flop', 'turn', 'river'] as const) {
      expect(s.phase).toBe(expectedPhase);

      const playersWhoActed = new Set<string>();
      let actions = 0;
      while (s.phase === expectedPhase && actions++ < 10) {
        const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
        playersWhoActed.add(actor.playerId);
        s = applyAction(s, actor.playerId, { type: 'check' });
      }

      expect(playersWhoActed.size).toBe(3);
    }
  });

  it('after a raise, all other players must act again', () => {
    let s = makeGame({ playerCount: 3 });

    // Complete preflop
    while (s.phase === 'preflop') {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat)!;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }
    expect(s.phase).toBe('flop');

    // First player bets
    const actor1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, actor1.playerId, { type: 'bet', amount: 50 });
    expect(s.phase).toBe('flop'); // Still on flop

    // Second player raises
    const actor2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, actor2.playerId, { type: 'raise', amount: 150 });
    expect(s.phase).toBe('flop'); // Still on flop

    // Third player calls
    const actor3 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, actor3.playerId, { type: 'call' });
    expect(s.phase).toBe('flop'); // Still on flop — actor1 needs to match the raise

    // First player calls the raise
    const actor1again = s.players.find(p => p.seatNumber === s.activeSeat)!;
    expect(actor1again.playerId).toBe(actor1.playerId);
    s = applyAction(s, actor1again.playerId, { type: 'call' });
    expect(s.phase).toBe('turn'); // NOW it advances
  });
});

// ─── BUG-02: Showdown Card Visibility ────────────────────────────────────────
// Cards must be visible at showdown for non-folded players only.

describe('BUG-02: Showdown card visibility', () => {
  it('sanitizeForPlayer reveals non-folded opponent cards at showdown', () => {
    const state = makeGame();
    const showdownState: GameState = { ...state, phase: 'showdown' };
    const me = showdownState.players[0];
    const opponent = showdownState.players[1];

    const sanitized = sanitizeForPlayer(showdownState, me.playerId);
    const opponentView = sanitized.players.find(p => p.playerId === opponent.playerId)!;
    // Non-folded opponent's cards should be real cards (not '??' or undefined)
    expect(opponentView.cards).toBeDefined();
    expect(opponentView.cards!.every(c => c !== '??')).toBe(true);
  });

  it('sanitizeForSpectator reveals non-folded players at showdown', () => {
    const state = makeGame();
    const showdownState: GameState = { ...state, phase: 'pot_awarded' };

    const sanitized = sanitizeForSpectator(showdownState);
    for (const p of sanitized.players) {
      if (!p.isFolded) {
        expect(p.cards).toBeDefined();
      }
    }
  });

  it('sanitizeForPlayer hides folded players cards at showdown', () => {
    const state = makeGame({ playerCount: 3 });
    // Manually fold player 1
    const foldedState: GameState = {
      ...state,
      phase: 'pot_awarded',
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, isFolded: true } : p
      ),
    };

    const sanitized = sanitizeForPlayer(foldedState, 'player2');
    const foldedPlayer = sanitized.players.find(p => p.playerId === 'player1')!;
    expect(foldedPlayer.cards).toBeUndefined();
  });

  it('sanitizeForSpectator hides folded players cards at showdown', () => {
    const state = makeGame({ playerCount: 3 });
    const foldedState: GameState = {
      ...state,
      phase: 'pot_awarded',
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, isFolded: true } : p
      ),
    };

    const sanitized = sanitizeForSpectator(foldedState);
    const foldedPlayer = sanitized.players.find(p => p.playerId === 'player1')!;
    expect(foldedPlayer.cards).toBeUndefined();
  });
});

// ─── BUG-04: minRaise Reset Between Streets ─────────────────────────────────

describe('BUG-04: minRaise reset between streets', () => {
  it('minRaise resets to bigBlind on each new street after large preflop raise', () => {
    let s = makeGame({ smallBlind: 10, bigBlind: 20 });

    // Preflop: UTG raises large
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'raise', amount: 200 });
    expect(s.minRaise).toBeGreaterThan(20); // minRaise grew

    // BB calls
    const bb = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, bb.playerId, { type: 'call' });

    expect(s.phase).toBe('flop');
    expect(s.minRaise).toBe(20); // Reset to bigBlind
    expect(s.currentBet).toBe(0); // Reset
  });

  it('minRaise resets on flop→turn and turn→river', () => {
    let s = makeGame({ smallBlind: 10, bigBlind: 20 });
    s = toFlop(s);
    expect(s.minRaise).toBe(20);

    // Flop: bet and raise to increase minRaise
    const f1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f1.playerId, { type: 'bet', amount: 100 });
    const f2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, f2.playerId, { type: 'call' });

    expect(s.phase).toBe('turn');
    expect(s.minRaise).toBe(20); // Reset to bigBlind on turn

    // Turn: both check
    const t1 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t1.playerId, { type: 'check' });
    const t2 = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, t2.playerId, { type: 'check' });

    expect(s.phase).toBe('river');
    expect(s.minRaise).toBe(20); // Reset to bigBlind on river
  });
});

// ─── BUG-05: SB All-In Edge Case ────────────────────────────────────────────

describe('BUG-05: SB all-in edge case', () => {
  it('SB with less chips than small blind is marked all-in', () => {
    const players = [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 5, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
    ];
    const init = initGame('t1', players, 10, 20);
    const state = dealHoleCards(init);

    const sb = state.players.find(p => p.seatNumber === state.smallBlindSeat)!;
    expect(sb.isAllIn).toBe(true);
    expect(sb.currentBet).toBe(5);
    expect(sb.stack).toBe(0);
  });

  it('game completes normally when SB is all-in from blind posting', () => {
    const players = [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 5, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
    ];
    const init = initGame('t1', players, 10, 20);
    let s = dealHoleCards(init);

    // The non-all-in player should be able to act and complete the hand
    let limit = 0;
    while (s.phase !== 'pot_awarded' && limit++ < 50) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    expect(s.phase).toBe('pot_awarded');
    expect(s.winners).toBeDefined();

    // Chips conserved
    const total = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(1005); // 5 + 1000
  });

  it('BB with less chips than big blind is marked all-in', () => {
    // In HU: seat 1 = dealer/SB, seat 2 = BB
    const players = [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 15, isSittingOut: false, isConnected: true },
    ];
    const init = initGame('t1', players, 10, 20);
    const state = dealHoleCards(init);

    const bb = state.players.find(p => p.seatNumber === state.bigBlindSeat)!;
    expect(bb.isAllIn).toBe(true);
    expect(bb.currentBet).toBe(15);
    expect(bb.stack).toBe(0);
  });
});

// ─── BUG-06: Broadcast Info Leaking ──────────────────────────────────────────
// sanitizeForSpectator and sanitizeForPlayer must not leak folded players' cards

describe('BUG-06: Broadcast info leaking', () => {
  it('spectator view hides all cards during active play', () => {
    const state = makeGame();
    const sanitized = sanitizeForSpectator(state);
    for (const p of sanitized.players) {
      expect(p.cards).toBeUndefined();
    }
  });

  it('spectator view does not include deck', () => {
    const state = makeGame();
    const sanitized = sanitizeForSpectator(state);
    expect('deck' in sanitized).toBe(false);
  });

  it('player view hides opponents but shows own cards', () => {
    const state = makeGame();
    const me = state.players[0];
    const sanitized = sanitizeForPlayer(state, me.playerId);

    const myView = sanitized.players.find(p => p.playerId === me.playerId)!;
    expect(myView.cards).toEqual(me.cards);

    const oppView = sanitized.players.find(p => p.playerId !== me.playerId)!;
    expect(oppView.cards?.every(c => c === '??')).toBe(true);
  });

  it('folded player cards stay hidden at showdown in spectator view', () => {
    let s = makeGame({ playerCount: 3 });
    // Fold player at activeSeat, then play to showdown
    const folder = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, folder.playerId, { type: 'fold' });

    // Play remaining 2 players to completion
    let limit = 0;
    while (s.phase !== 'pot_awarded' && limit++ < 50) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    expect(s.phase).toBe('pot_awarded');

    const sanitized = sanitizeForSpectator(s);
    const foldedView = sanitized.players.find(p => p.playerId === folder.playerId)!;
    expect(foldedView.cards).toBeUndefined();

    // Non-folded players should have their cards visible
    const activePlayers = sanitized.players.filter(p => !p.isFolded);
    for (const p of activePlayers) {
      expect(p.cards).toBeDefined();
    }
  });

  it('folded player cards stay hidden at showdown in player view', () => {
    let s = makeGame({ playerCount: 3 });
    const folder = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, folder.playerId, { type: 'fold' });

    let limit = 0;
    while (s.phase !== 'pot_awarded' && limit++ < 50) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    // View from a non-folded player
    const viewer = s.players.find(p => !p.isFolded)!;
    const sanitized = sanitizeForPlayer(s, viewer.playerId);
    const foldedView = sanitized.players.find(p => p.playerId === folder.playerId)!;
    expect(foldedView.cards).toBeUndefined();
  });
});

// ─── Combined: Full hand integrity with all fixes ────────────────────────────

describe('Full hand integrity with all bug fixes', () => {
  it('3-player hand: fold + showdown preserves chips and hides folded cards', () => {
    let s = makeGame({ playerCount: 3, stacks: [500, 500, 500] });
    const totalChips = s.players.reduce((sum, p) => sum + p.stack, 0) + s.pot;

    // UTG folds
    const utg = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = applyAction(s, utg.playerId, { type: 'fold' });

    // Remaining 2 play to completion
    let limit = 0;
    while (s.phase !== 'pot_awarded' && limit++ < 50) {
      const actor = s.players.find(p => p.seatNumber === s.activeSeat);
      if (!actor) break;
      const callAmt = Math.max(0, s.currentBet - actor.currentBet);
      s = applyAction(s, actor.playerId, callAmt > 0 ? { type: 'call' } : { type: 'check' });
    }

    expect(s.phase).toBe('pot_awarded');

    // Chip conservation
    const finalChips = s.players.reduce((sum, p) => sum + p.stack, 0);
    expect(finalChips).toBe(totalChips);

    // Folded player cards hidden in spectator view
    const spectator = sanitizeForSpectator(s);
    const foldedView = spectator.players.find(p => p.playerId === utg.playerId)!;
    expect(foldedView.cards).toBeUndefined();

    // Winner info present
    expect(s.winners).toBeDefined();
    expect(s.winners!.length).toBeGreaterThan(0);
  });

  it('timeout auto-checks when no bet to call', () => {
    let s = makeGame();
    s = toFlop(s);
    expect(s.phase).toBe('flop');
    expect(s.currentBet).toBe(0);

    // Timeout should auto-check (not fold) when currentBet is 0
    const activeBefore = s.players.find(p => p.seatNumber === s.activeSeat)!;
    s = handleTimeout(s);
    const activeAfter = s.players.find(p => p.playerId === activeBefore.playerId)!;
    expect(activeAfter.isFolded).toBe(false);
    expect(activeAfter.lastAction).toBe('check');
  });
});
