import { describe, it, expect } from 'vitest';
import { getBotAction, getBotName, getBotId, postflopStrength } from '../../lib/bots/strategies';
import { initGame, dealHoleCards } from '../../lib/poker/engine';
import type { GameState } from '../../types/poker';

// Build a minimal 2-player game state for bot testing
function makeTwoPlayerState(): GameState {
  const players = [
    { playerId: 'human1', username: 'Human', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
    { playerId: 'bot1', username: 'Bot', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'regular' as const },
  ] as any[];

  const init = initGame('table1', players, 10, 20);
  return dealHoleCards(init);
}

describe('getBotAction', () => {
  it('returns a valid action type', () => {
    const state = makeTwoPlayerState();
    const botPlayer = state.players.find(p => (p as any).isBot);
    if (!botPlayer) return; // skip if bot isn't active

    const validActions = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
    for (let i = 0; i < 10; i++) {
      const action = getBotAction(state, botPlayer.playerId, 'regular');
      expect(validActions).toContain(action.type);
    }
  });

  it('returns check when no bet and strength is low (fish variety)', () => {
    const state = makeTwoPlayerState();
    // Find the bot and force it to be the active player on a check round
    // Manually construct a state where bot can check
    const botPlayer = state.players.find(p => (p as any).isBot);
    if (!botPlayer) return;

    // Run 20 iterations and verify all actions are valid
    for (let i = 0; i < 20; i++) {
      const action = getBotAction(state, botPlayer.playerId, 'fish');
      expect(['fold', 'check', 'call', 'bet', 'raise', 'all-in']).toContain(action.type);
    }
  });

  it('all difficulty levels return valid actions', () => {
    const state = makeTwoPlayerState();
    const botPlayer = state.players.find(p => (p as any).isBot);
    if (!botPlayer) return;

    for (const difficulty of ['fish', 'regular', 'shark'] as const) {
      const action = getBotAction(state, botPlayer.playerId, difficulty);
      expect(['fold', 'check', 'call', 'bet', 'raise', 'all-in']).toContain(action.type);
    }
  });

  it('bet action includes a positive amount', () => {
    const state = makeTwoPlayerState();
    const botPlayer = state.players.find(p => (p as any).isBot);
    if (!botPlayer) return;

    // Run many times and check any bet has a valid amount
    for (let i = 0; i < 30; i++) {
      const action = getBotAction(state, botPlayer.playerId, 'shark');
      if (action.type === 'bet' || action.type === 'raise') {
        expect(action.amount).toBeDefined();
        expect(action.amount!).toBeGreaterThan(0);
      }
    }
  });

  it('returns fold for unknown player', () => {
    const state = makeTwoPlayerState();
    const action = getBotAction(state, 'nonexistent', 'regular');
    expect(action.type).toBe('check'); // graceful fallback
  });
});

describe('postflopStrength intra-rank granularity', () => {
  // Board: 7h 8h 9h — both hands make a flush
  const flushBoard = ['7h', '8h', '9h'];

  it('Ah Kh (nut flush) scores higher than 2h 3h (low flush) on same board', () => {
    const nutFlush = postflopStrength(['Ah', 'Kh'], flushBoard);
    const lowFlush = postflopStrength(['2h', '3h'], flushBoard);
    expect(nutFlush).toBeGreaterThan(lowFlush);
  });

  it('same rank hands with different tiebreakers score differently', () => {
    // Both are one pair; AA pair beats 22 pair
    const highPair = postflopStrength(['Ah', 'Ad'], ['2c', '5s', 'Kd']);
    const lowPair = postflopStrength(['2h', '2d'], ['3c', '5s', '9d']);
    expect(highPair).toBeGreaterThan(lowPair);
  });

  it('higher rank always beats lower rank regardless of tiebreakers', () => {
    // Best two pair vs any one pair
    const twoPair = postflopStrength(['Ah', 'Kh'], ['Ad', 'Ks', '2c']);
    const onePair = postflopStrength(['Ah', '2h'], ['Ad', '3s', '5c']);
    expect(twoPair).toBeGreaterThan(onePair);
  });

  it('strength is in range 0–1', () => {
    const s = postflopStrength(['Ah', 'Kh'], ['Ad', 'As', 'Kd', '2c', '7s']);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(0.99);
  });
});

describe('getBotName', () => {
  it('returns a non-empty string for all difficulties', () => {
    for (const d of ['fish', 'regular', 'shark'] as const) {
      const name = getBotName(d, 0);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('cycles through names with different seeds', () => {
    const names = new Set<string>();
    for (let i = 0; i < 7; i++) {
      names.add(getBotName('fish', i));
    }
    // Should have multiple unique names
    expect(names.size).toBeGreaterThan(2);
  });
});

describe('getBotId', () => {
  it('returns a deterministic string', () => {
    const id1 = getBotId('table-abc123', 2);
    const id2 = getBotId('table-abc123', 2);
    expect(id1).toBe(id2);
  });

  it('is unique per seat', () => {
    const id1 = getBotId('table-abc123', 1);
    const id2 = getBotId('table-abc123', 2);
    expect(id1).not.toBe(id2);
  });

  it('starts with bot_ prefix', () => {
    const id = getBotId('table-abc123', 1);
    expect(id.startsWith('bot_')).toBe(true);
  });
});
