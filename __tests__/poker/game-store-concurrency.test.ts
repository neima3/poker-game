import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGameState,
  setGameState,
  deleteGameState,
  withTableLock,
  isPlayerInFlight,
  markPlayerInFlight,
  clearPlayerInFlight,
} from '@/lib/poker/game-store';
import { initGame, dealHoleCards, applyAction } from '@/lib/poker/engine';
import type { GameState } from '@/types/poker';

const TABLE_ID = 'test-concurrency-table';

function makeGameState(): GameState {
  const players = [
    { playerId: 'p1', username: 'Alice', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
    { playerId: 'p2', username: 'Bob',   seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
  ];
  return dealHoleCards(initGame(TABLE_ID, players, 10, 20));
}

beforeEach(() => {
  deleteGameState(TABLE_ID);
});

// ─── withTableLock serialization ─────────────────────────────────────────────

describe('withTableLock', () => {
  it('serializes concurrent operations — second runs only after first completes', async () => {
    const order: string[] = [];

    const first = withTableLock(TABLE_ID, async () => {
      order.push('first-start');
      await new Promise(r => setTimeout(r, 20)); // simulate async work
      order.push('first-end');
    });

    const second = withTableLock(TABLE_ID, async () => {
      order.push('second-start');
      await new Promise(r => setTimeout(r, 5));
      order.push('second-end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('continues the chain even when a locked operation throws', async () => {
    const results: string[] = [];

    const failing = withTableLock(TABLE_ID, async () => {
      results.push('failing');
      throw new Error('boom');
    });

    const succeeding = withTableLock(TABLE_ID, async () => {
      results.push('succeeding');
    });

    await failing.catch(() => {});
    await succeeding;

    expect(results).toEqual(['failing', 'succeeding']);
  });

  it('prevents two simultaneous writes from overwriting each other', async () => {
    setGameState(TABLE_ID, makeGameState());

    let writeCount = 0;

    // Simulate two concurrent requests both trying to write state
    const write1 = withTableLock(TABLE_ID, async () => {
      const state = getGameState(TABLE_ID)!;
      await new Promise(r => setTimeout(r, 10)); // yield
      setGameState(TABLE_ID, { ...state, pot: state.pot + 100 });
      writeCount++;
    });

    const write2 = withTableLock(TABLE_ID, async () => {
      const state = getGameState(TABLE_ID)!;
      setGameState(TABLE_ID, { ...state, pot: state.pot + 200 });
      writeCount++;
    });

    await Promise.all([write1, write2]);

    // Both writes executed, each read after the previous finished — no lost update
    expect(writeCount).toBe(2);
    // write1 raised by 100, write2 read that result and raised by 200
    const finalState = getGameState(TABLE_ID)!;
    const initialPot = makeGameState().pot;
    expect(finalState.pot).toBe(initialPot + 100 + 200);
  });
});

// ─── version auto-increment ───────────────────────────────────────────────────

describe('setGameState version', () => {
  it('increments version on each write', () => {
    const state = makeGameState();
    expect(state.version).toBeUndefined(); // fresh from engine, no version yet

    setGameState(TABLE_ID, state);
    expect(getGameState(TABLE_ID)!.version).toBe(1);

    setGameState(TABLE_ID, getGameState(TABLE_ID)!);
    expect(getGameState(TABLE_ID)!.version).toBe(2);

    setGameState(TABLE_ID, getGameState(TABLE_ID)!);
    expect(getGameState(TABLE_ID)!.version).toBe(3);
  });
});

// ─── in-flight player tracking ───────────────────────────────────────────────

describe('in-flight player tracking', () => {
  it('detects duplicate concurrent requests from the same player', () => {
    expect(isPlayerInFlight(TABLE_ID, 'p1')).toBe(false);

    markPlayerInFlight(TABLE_ID, 'p1');
    expect(isPlayerInFlight(TABLE_ID, 'p1')).toBe(true);
    expect(isPlayerInFlight(TABLE_ID, 'p2')).toBe(false);

    clearPlayerInFlight(TABLE_ID, 'p1');
    expect(isPlayerInFlight(TABLE_ID, 'p1')).toBe(false);
  });

  it('clears on deleteGameState', () => {
    markPlayerInFlight(TABLE_ID, 'p1');
    deleteGameState(TABLE_ID);
    expect(isPlayerInFlight(TABLE_ID, 'p1')).toBe(false);
  });
});

// ─── Simulated simultaneous player actions ────────────────────────────────────

describe('simultaneous player actions simulation', () => {
  it('only one of two concurrent same-turn actions succeeds', async () => {
    setGameState(TABLE_ID, makeGameState());

    const activeSeat = getGameState(TABLE_ID)!.activeSeat;
    const activePlayer = getGameState(TABLE_ID)!.players.find(p => p.seatNumber === activeSeat)!;

    const results: Array<'success' | 'not-your-turn' | 'conflict'> = [];

    // Simulate the route handler logic:
    // - check in-flight (synchronous) → 409 immediately if duplicate
    // - otherwise mark in-flight, acquire lock, validate inside lock
    async function simulateAction(playerId: string): Promise<void> {
      if (isPlayerInFlight(TABLE_ID, playerId)) {
        results.push('conflict');
        return;
      }
      markPlayerInFlight(TABLE_ID, playerId);
      try {
        await withTableLock(TABLE_ID, async () => {
          const state = getGameState(TABLE_ID)!;
          const player = state.players.find(p => p.playerId === playerId);
          if (!player || player.seatNumber !== state.activeSeat) {
            results.push('not-your-turn');
            return;
          }
          try {
            const newState = applyAction(state, playerId, { type: 'fold' });
            setGameState(TABLE_ID, newState);
            results.push('success');
          } catch {
            results.push('not-your-turn');
          }
        });
      } finally {
        clearPlayerInFlight(TABLE_ID, playerId);
      }
    }

    // Fire two simultaneous requests from the same player
    await Promise.all([
      simulateAction(activePlayer.playerId),
      simulateAction(activePlayer.playerId),
    ]);

    // Exactly one should succeed; the other returns conflict (409) or not-your-turn
    expect(results.filter(r => r === 'success').length).toBe(1);
    expect(results.filter(r => r === 'conflict' || r === 'not-your-turn').length).toBe(1);
  });

  it('inactive player acquires lock first but still fails — active player queued behind succeeds', async () => {
    setGameState(TABLE_ID, makeGameState());

    const state = getGameState(TABLE_ID)!;
    const activeSeat = state.activeSeat;
    const activePlayer = state.players.find(p => p.seatNumber === activeSeat)!;
    const inactivePlayer = state.players.find(p => p.seatNumber !== activeSeat)!;

    const results = new Map<string, string>();

    async function simulateAction(playerId: string): Promise<void> {
      markPlayerInFlight(TABLE_ID, playerId);
      try {
        await withTableLock(TABLE_ID, async () => {
          const s = getGameState(TABLE_ID)!;
          const player = s.players.find(p => p.playerId === playerId);
          if (!player || player.seatNumber !== s.activeSeat) {
            results.set(playerId, 'not-your-turn');
            return;
          }
          try {
            const newState = applyAction(s, playerId, { type: 'fold' });
            setGameState(TABLE_ID, newState);
            results.set(playerId, 'success');
          } catch (e: any) {
            results.set(playerId, e.message);
          }
        });
      } finally {
        clearPlayerInFlight(TABLE_ID, playerId);
      }
    }

    // Inactive player queues first (gets lock first), active player queues behind.
    // Despite the inactive player holding the lock first, they fail the turn check.
    // The active player then acquires the lock and succeeds.
    const inactiveFirst = simulateAction(inactivePlayer.playerId);
    const activeBehind = simulateAction(activePlayer.playerId);
    await Promise.all([inactiveFirst, activeBehind]);

    expect(results.get(inactivePlayer.playerId)).toBe('not-your-turn');
    expect(results.get(activePlayer.playerId)).toBe('success');
  });
});
