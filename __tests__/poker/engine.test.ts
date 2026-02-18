import { describe, it, expect } from 'vitest';
import {
  initGame,
  dealHoleCards,
  applyAction,
  sanitizeForPlayer,
  sanitizeForSpectator,
  getActivePlayers,
  getActiveNonAllIn,
} from '@/lib/poker/engine';
import type { GameState } from '@/types/poker';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeGame(overrides?: { playerCount?: number; smallBlind?: number; bigBlind?: number }) {
  const { playerCount = 2, smallBlind = 10, bigBlind = 20 } = overrides ?? {};
  const playerIds = Array.from({ length: playerCount }, (_, i) => `player${i + 1}`);

  const players = playerIds.map((id, i) => ({
    playerId: id,
    username: `Player${i + 1}`,
    seatNumber: i + 1,
    stack: 1000,
    isSittingOut: false,
    isConnected: true,
  }));

  const init = initGame('table1', players, smallBlind, bigBlind);
  return dealHoleCards(init);
}

// ─── initGame ────────────────────────────────────────────────────────────────

describe('initGame', () => {
  it('creates a game with correct phase', () => {
    const state = initGame('t1', [
      { playerId: 'p1', username: 'A', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
      { playerId: 'p2', username: 'B', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
    ], 10, 20);
    expect(state.phase).toBe('starting');
  });

  it('assigns dealer, SB, and BB correctly for 2 players', () => {
    const state = makeGame();
    // In HU: dealer = player1's seat (first seat), SB = next seat
    expect(state.smallBlindSeat).toBeDefined();
    expect(state.bigBlindSeat).toBeDefined();
    expect(state.smallBlindSeat).not.toBe(state.bigBlindSeat);
  });
});

// ─── dealHoleCards ────────────────────────────────────────────────────────────

describe('dealHoleCards', () => {
  it('deals 2 cards to each active player', () => {
    const state = makeGame();
    for (const p of state.players) {
      if (!p.isSittingOut) {
        expect(p.cards).toHaveLength(2);
      }
    }
  });

  it('posts small and big blinds', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const sb = state.players.find(p => p.seatNumber === state.smallBlindSeat)!;
    const bb = state.players.find(p => p.seatNumber === state.bigBlindSeat)!;
    expect(sb.currentBet).toBe(10);
    expect(bb.currentBet).toBe(20);
  });

  it('sets pot equal to blinds posted', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    expect(state.pot).toBe(30);
  });

  it('transitions to preflop', () => {
    const state = makeGame();
    expect(state.phase).toBe('preflop');
  });

  it('removes dealt cards from deck', () => {
    const state = makeGame({ playerCount: 3 });
    // 3 players * 2 cards = 6 cards dealt
    expect(state.deck).toHaveLength(52 - 6);
  });
});

// ─── applyAction ─────────────────────────────────────────────────────────────

describe('applyAction', () => {
  it('throws if not player\'s turn', () => {
    const state = makeGame();
    const wrongPlayer = state.players.find(p => p.seatNumber !== state.activeSeat)!;
    expect(() => applyAction(state, wrongPlayer.playerId, { type: 'fold' })).toThrow('Not your turn');
  });

  it('fold marks player as folded', () => {
    const state = makeGame();
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const next = applyAction(state, active.playerId, { type: 'fold' });
    const folded = next.players.find(p => p.playerId === active.playerId)!;
    expect(folded.isFolded).toBe(true);
    expect(folded.lastAction).toBe('fold');
  });

  it('check is valid when no bet to call', () => {
    // In a 2-player game, preflop first actor is UTG who faces BB.
    // Need to call or raise. Get to a street where currentBet = 0.
    const state = makeGame();
    // UTG calls, BB checks → move to flop
    const utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const afterCall = applyAction(state, utg.playerId, { type: 'call' });
    // Now BB should be able to check (BB has option)
    const bbPlayer = afterCall.players.find(p => p.seatNumber === afterCall.activeSeat)!;
    expect(() => applyAction(afterCall, bbPlayer.playerId, { type: 'check' })).not.toThrow();
  });

  it('check throws if there is a bet to call', () => {
    const state = makeGame();
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    // In preflop, there's always a BB to call for UTG
    expect(() => applyAction(state, active.playerId, { type: 'check' })).toThrow('Cannot check');
  });

  it('call reduces stack by correct amount', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const callAmount = Math.max(0, state.currentBet - active.currentBet);
    const next = applyAction(state, active.playerId, { type: 'call' });
    const afterPlayer = next.players.find(p => p.playerId === active.playerId)!;
    expect(afterPlayer.stack).toBe(active.stack - callAmount);
  });

  it('call increases pot by call amount', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const callAmount = Math.max(0, state.currentBet - active.currentBet);
    const next = applyAction(state, active.playerId, { type: 'call' });
    expect(next.pot).toBe(state.pot + callAmount);
  });

  it('raise increases currentBet', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const raiseAmount = 40; // Raise to 60 total
    const next = applyAction(state, active.playerId, { type: 'raise', amount: raiseAmount });
    expect(next.currentBet).toBeGreaterThan(state.currentBet);
  });

  it('raise below minimum throws', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    // minRaise = bigBlind = 20. Raise of 5 is below minimum
    expect(() => applyAction(state, active.playerId, { type: 'raise', amount: 5 })).toThrow('Minimum raise');
  });

  it('all-in sets stack to 0 and isAllIn to true', () => {
    const state = makeGame();
    const active = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const next = applyAction(state, active.playerId, { type: 'all-in' });
    const after = next.players.find(p => p.playerId === active.playerId)!;
    expect(after.stack).toBe(0);
    expect(after.isAllIn).toBe(true);
    expect(after.lastAction).toBe('all-in');
  });

  it('advances turn to next player after action', () => {
    const state = makeGame();
    const firstActive = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const next = applyAction(state, firstActive.playerId, { type: 'call' });
    // activeSeat should have moved to the next player
    expect(next.activeSeat).not.toBe(firstActive.seatNumber);
  });
});

// ─── Full hand flow ───────────────────────────────────────────────────────────

describe('full hand flow', () => {
  it('transitions to pot_awarded when only one player remains', () => {
    const state = makeGame();
    // P1 (UTG) folds → P2 wins
    const p1 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const final = applyAction(state, p1.playerId, { type: 'fold' });
    expect(final.phase).toBe('pot_awarded');
    expect(final.winners).toHaveLength(1);
  });

  it('pot is awarded to winner on fold', () => {
    const state = makeGame({ smallBlind: 10, bigBlind: 20 });
    const p1 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    const p2 = state.players.find(p => p.playerId !== p1.playerId)!;
    const potBeforeFold = state.pot;
    const final = applyAction(state, p1.playerId, { type: 'fold' });
    const winner = final.players.find(p => p.playerId === p2.playerId)!;
    // Winner's stack should have increased by pot amount
    expect(winner.stack).toBeGreaterThan(p2.stack);
  });

  it('advances through all streets in 2-player game', () => {
    let state = makeGame();

    // Preflop: UTG calls, BB checks (BB option)
    const utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, utg.playerId, { type: 'call' });
    expect(['flop', 'preflop']).toContain(state.phase);

    // If BB still needs to act (BB option)
    if (state.phase === 'preflop') {
      const bb = state.players.find(p => p.seatNumber === state.activeSeat)!;
      state = applyAction(state, bb.playerId, { type: 'check' });
    }

    expect(state.phase).toBe('flop');
    expect(state.communityCards).toHaveLength(3);

    // Flop: both check
    const flopActor1 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, flopActor1.playerId, { type: 'check' });
    const flopActor2 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, flopActor2.playerId, { type: 'check' });

    expect(state.phase).toBe('turn');
    expect(state.communityCards).toHaveLength(4);

    // Turn: both check
    const turnActor1 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, turnActor1.playerId, { type: 'check' });
    const turnActor2 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, turnActor2.playerId, { type: 'check' });

    expect(state.phase).toBe('river');
    expect(state.communityCards).toHaveLength(5);

    // River: both check → showdown → pot_awarded
    const riverActor1 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, riverActor1.playerId, { type: 'check' });
    const riverActor2 = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, riverActor2.playerId, { type: 'check' });

    expect(state.phase).toBe('pot_awarded');
    expect(state.winners).toBeDefined();
    expect(state.winners!.length).toBeGreaterThan(0);
  });

  it('resets currentBet to 0 on new street', () => {
    let state = makeGame();
    // Preflop call + BB check
    const utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, utg.playerId, { type: 'call' });
    if (state.phase === 'preflop') {
      const bb = state.players.find(p => p.seatNumber === state.activeSeat)!;
      state = applyAction(state, bb.playerId, { type: 'check' });
    }
    expect(state.phase).toBe('flop');
    expect(state.currentBet).toBe(0);
  });

  it('resets hasActedThisStreet on new street', () => {
    let state = makeGame();
    const utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, utg.playerId, { type: 'call' });
    if (state.phase === 'preflop') {
      const bb = state.players.find(p => p.seatNumber === state.activeSeat)!;
      state = applyAction(state, bb.playerId, { type: 'check' });
    }
    expect(state.phase).toBe('flop');
    for (const p of state.players) {
      if (!p.isFolded && !p.isSittingOut) {
        expect(p.hasActedThisStreet).toBe(false);
      }
    }
  });

  it('conserves chips across hand (pot + all stacks = initial total)', () => {
    let state = makeGame({ playerCount: 2 });
    const initialTotal = state.players.reduce((s, p) => s + p.stack, 0) + state.pot;

    // Play to completion
    let utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, utg.playerId, { type: 'call' });
    if (state.phase === 'preflop') {
      const bb = state.players.find(p => p.seatNumber === state.activeSeat)!;
      state = applyAction(state, bb.playerId, { type: 'check' });
    }

    while (state.phase !== 'pot_awarded') {
      const actor = state.players.find(p => p.seatNumber === state.activeSeat)!;
      state = applyAction(state, actor.playerId, { type: 'check' });
    }

    const finalTotal = state.players.reduce((s, p) => s + p.stack, 0);
    expect(finalTotal).toBe(initialTotal);
  });
});

// ─── Sanitization ─────────────────────────────────────────────────────────────

describe('sanitizeForPlayer', () => {
  it('shows own cards', () => {
    const state = makeGame();
    const me = state.players[0];
    const sanitized = sanitizeForPlayer(state, me.playerId);
    const myPlayer = sanitized.players.find(p => p.playerId === me.playerId)!;
    expect(myPlayer.cards).toEqual(me.cards);
  });

  it('hides opponent cards during play', () => {
    const state = makeGame();
    const me = state.players[0];
    const opponent = state.players[1];
    const sanitized = sanitizeForPlayer(state, me.playerId);
    const opponentPlayer = sanitized.players.find(p => p.playerId === opponent.playerId)!;
    expect(opponentPlayer.cards?.every(c => c === '??')).toBe(true);
  });

  it('never includes deck', () => {
    const state = makeGame();
    const sanitized = sanitizeForPlayer(state, state.players[0].playerId);
    expect('deck' in sanitized).toBe(false);
  });

  it('reveals opponent cards at showdown', () => {
    const state = makeGame();
    // Artificially set phase to showdown
    const showdownState: GameState = { ...state, phase: 'showdown' };
    const me = showdownState.players[0];
    const opponent = showdownState.players[1];
    const sanitized = sanitizeForPlayer(showdownState, me.playerId);
    const opponentPlayer = sanitized.players.find(p => p.playerId === opponent.playerId)!;
    expect(opponentPlayer.cards?.every(c => c !== '??')).toBe(true);
  });
});

describe('sanitizeForSpectator', () => {
  it('hides all hole cards during play', () => {
    const state = makeGame();
    const sanitized = sanitizeForSpectator(state);
    for (const p of sanitized.players) {
      expect(p.cards).toBeUndefined();
    }
  });

  it('never includes deck', () => {
    const state = makeGame();
    const sanitized = sanitizeForSpectator(state);
    expect('deck' in sanitized).toBe(false);
  });
});

// ─── Helper functions ─────────────────────────────────────────────────────────

describe('getActivePlayers', () => {
  it('excludes folded players', () => {
    let state = makeGame();
    const utg = state.players.find(p => p.seatNumber === state.activeSeat)!;
    state = applyAction(state, utg.playerId, { type: 'fold' });
    // After fold, hand ends (2-player game). Test before fold.
    const fresh = makeGame();
    const freshUtg = fresh.players.find(p => p.seatNumber === fresh.activeSeat)!;
    // Manually fold one player
    const foldedState: GameState = {
      ...fresh,
      players: fresh.players.map(p =>
        p.seatNumber === freshUtg.seatNumber ? { ...p, isFolded: true } : p
      ),
    };
    const active = getActivePlayers(foldedState);
    expect(active.some(p => p.isFolded)).toBe(false);
  });
});

describe('getActiveNonAllIn', () => {
  it('excludes all-in players', () => {
    const state = makeGame();
    const allInState: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, isAllIn: true } : p
      ),
    };
    const active = getActiveNonAllIn(allInState);
    expect(active.some(p => p.isAllIn)).toBe(false);
  });
});
