import { describe, it, expect } from 'vitest';
import { processBotTurns } from '../../lib/bots/bot-runner';
import { initGame, dealHoleCards } from '../../lib/poker/engine';

function makeBotOnlyGame() {
  const players = [
    {
      playerId: 'bot1', username: 'Bot1', seatNumber: 1, stack: 1000,
      isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'regular' as const,
    },
    {
      playerId: 'bot2', username: 'Bot2', seatNumber: 2, stack: 1000,
      isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'fish' as const,
    },
  ] as any[];

  return dealHoleCards(initGame('test-table', players, 10, 20));
}

function makeHumanBotGame() {
  const players = [
    {
      playerId: 'human1', username: 'Human', seatNumber: 1, stack: 1000,
      isSittingOut: false, isConnected: true, isBot: false,
    },
    {
      playerId: 'bot1', username: 'Bot', seatNumber: 2, stack: 1000,
      isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'regular' as const,
    },
  ] as any[];

  return dealHoleCards(initGame('test-table', players, 10, 20));
}

describe('processBotTurns', () => {
  it('processes all bot turns until human or game over', () => {
    const state = makeHumanBotGame();
    const result = processBotTurns(state);

    // The result should either be waiting for the human, or game over
    const activePlayer = result.players.find(p => p.seatNumber === result.activeSeat);
    const isTerminal = result.phase === 'pot_awarded' || result.phase === 'waiting';

    expect(activePlayer?.isBot === false || isTerminal).toBe(true);
  });

  it('completes a full bot-vs-bot game without infinite loop', () => {
    const state = makeBotOnlyGame();
    const result = processBotTurns(state);

    // All-bot game should terminate at pot_awarded or at least not hang
    expect(['preflop', 'flop', 'turn', 'river', 'showdown', 'pot_awarded']).toContain(result.phase);
  });

  it('returns state unchanged when no bots active', () => {
    const players = [
      {
        playerId: 'human1', username: 'Human1', seatNumber: 1, stack: 1000,
        isSittingOut: false, isConnected: true, isBot: false,
      },
      {
        playerId: 'human2', username: 'Human2', seatNumber: 2, stack: 1000,
        isSittingOut: false, isConnected: true, isBot: false,
      },
    ] as any[];

    const state = dealHoleCards(initGame('test-table', players, 10, 20));
    const result = processBotTurns(state);

    // Should be unchanged since the active player is human
    expect(result.activeSeat).toBe(state.activeSeat);
    expect(result.pot).toBe(state.pot);
  });

  it('handles multiple consecutive bot turns', () => {
    // Make a game where human goes first, then 3 bots
    const players = [
      {
        playerId: 'human1', username: 'Human', seatNumber: 1, stack: 1000,
        isSittingOut: false, isConnected: true, isBot: false,
      },
      {
        playerId: 'bot1', username: 'Bot1', seatNumber: 2, stack: 1000,
        isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'fish' as const,
      },
      {
        playerId: 'bot2', username: 'Bot2', seatNumber: 3, stack: 1000,
        isSittingOut: false, isConnected: true, isBot: true, botDifficulty: 'shark' as const,
      },
    ] as any[];

    const state = dealHoleCards(initGame('test-table', players, 10, 20));

    // Run bot turns — should stop before or when it reaches the human
    const result = processBotTurns(state);
    expect(result).toBeDefined();
    expect(result.phase).not.toBe('starting');
  });
});
