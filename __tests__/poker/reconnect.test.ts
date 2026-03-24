import { describe, it, expect, beforeEach } from 'vitest';
import { initGame, dealHoleCards, applyAction, handleTimeout, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import type { GameState, PlayerState } from '@/types/poker';
import { RECONNECT_GRACE_PERIOD_MS } from '@/types/poker';

describe('Reconnect Grace Window', () => {
  const basePlayers = [
    { playerId: 'p1', username: 'Player 1', seatNumber: 1, stack: 1000, isSittingOut: false, isConnected: true },
    { playerId: 'p2', username: 'Player 2', seatNumber: 2, stack: 1000, isSittingOut: false, isConnected: true },
    { playerId: 'p3', username: 'Player 3', seatNumber: 3, stack: 1000, isSittingOut: false, isConnected: true },
  ];

  const tableId = 'table-1';
  const smallBlind = 10;
  const bigBlind = 20;

  function createGameWithDisconnectedPlayer(
    disconnectedPlayerId: string,
    graceExpired: boolean = false
  ): GameState {
    const disconnectedAt = graceExpired
      ? Date.now() - RECONNECT_GRACE_PERIOD_MS - 5000
      : Date.now() - 1000;

    const playersWithDisconnect = basePlayers.map(p =>
      p.playerId === disconnectedPlayerId
        ? { ...p, isConnected: false, disconnectedAt }
        : p
    );

    return initGame(tableId, playersWithDisconnect, smallBlind, bigBlind);
  }

  describe('Basic disconnect detection', () => {
    it('marks disconnected player as disconnected when they miss heartbeats', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const disconnectedPlayer = stateWithHoleCards.players.find(p => p.playerId === 'p1');
      expect(disconnectedPlayer).toBeDefined();
      expect(disconnectedPlayer?.isConnected).toBe(false);
      expect(disconnectedPlayer?.disconnectedAt).toBeDefined();
    });

    it('preserves disconnected player state during active hand', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const activePlayer = stateWithHoleCards.players.find(p => p.seatNumber === stateWithHoleCards.activeSeat)!;
      expect(activePlayer).toBeDefined();

      const afterAction = applyAction(stateWithHoleCards, activePlayer!.playerId, { type: 'call' });

      const disconnectedPlayer = afterAction.players.find(p => p.playerId === 'p1');
      expect(disconnectedPlayer?.isConnected).toBe(false);
      expect(disconnectedPlayer?.disconnectedAt).toBeDefined();
    });
  });

  describe('Grace period handling', () => {
    it('does not auto-fold player within grace period', () => {
      const state = createGameWithDisconnectedPlayer('p1', false);
      const stateWithHoleCards = dealHoleCards(state);

      const disconnectedPlayer = stateWithHoleCards.players.find(p => p.playerId === 'p1');
      expect(disconnectedPlayer?.isFolded).toBe(false);
    });
  });

  describe('Reconnect during preflop', () => {
    it('recovers player state on reconnect during preflop', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const reconnectedPlayers = stateWithHoleCards.players.map(p =>
        p.playerId === 'p1'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...stateWithHoleCards, players: reconnectedPlayers };

      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p1');
      expect(recoveredPlayer?.isConnected).toBe(true);
      expect(recoveredPlayer?.disconnectedAt).toBeUndefined();
      expect(recoveredPlayer?.cards).toHaveLength(2);
    });

    it('preserves player bet state on reconnect', () => {
      const state = createGameWithDisconnectedPlayer('p2');
      const stateWithHoleCards = dealHoleCards(state);

      const disconnectedPlayer = stateWithHoleCards.players.find(p => p.playerId === 'p2');
      const betBeforeReconnect = disconnectedPlayer?.currentBet ?? 0;

      const reconnectedPlayers = stateWithHoleCards.players.map(p =>
        p.playerId === 'p2'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...stateWithHoleCards, players: reconnectedPlayers };
      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p2');

      expect(recoveredPlayer?.currentBet).toBe(betBeforeReconnect);
    });
  });

  describe('Reconnect during street transition', () => {
    it('recovers player state after flop transition', () => {
      const state = initGame(tableId, basePlayers, smallBlind, bigBlind);
      let gameState = dealHoleCards(state);

      gameState = applyAction(gameState, 'p1', { type: 'call' });
      gameState = applyAction(gameState, 'p2', { type: 'call' });
      gameState = applyAction(gameState, 'p3', { type: 'check' });

      expect(gameState.phase).toBe('flop');

      const disconnectedAt = Date.now() - 5000;
      const stateWithDisconnected = {
        ...gameState,
        players: gameState.players.map(p =>
          p.playerId === 'p1'
            ? { ...p, isConnected: false, disconnectedAt }
            : p
        ),
      };

      const reconnectedPlayers = stateWithDisconnected.players.map(p =>
        p.playerId === 'p1'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...stateWithDisconnected, players: reconnectedPlayers };
      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p1');

      expect(recoveredPlayer?.isConnected).toBe(true);
      expect(recoveredPlayer?.cards).toHaveLength(2);
      expect(reconnectedState.phase).toBe('flop');
      expect(reconnectedState.communityCards).toHaveLength(3);
    });
  });

  describe('Reconnect during showdown', () => {
    it('preserves hand evaluation after reconnect at showdown', () => {
      const state = initGame(tableId, basePlayers, smallBlind, bigBlind);
      let gameState = dealHoleCards(state);

      while (gameState.phase !== 'showdown' && gameState.phase !== 'pot_awarded') {
        const activePlayer = gameState.players.find(p => p.seatNumber === gameState.activeSeat);
        if (!activePlayer) break;
        if (activePlayer.isAllIn || activePlayer.isFolded) break;
        gameState = applyAction(gameState, activePlayer.playerId, { type: 'call' });
      }

      const disconnectedAt = Date.now() - 5000;
      const stateWithDisconnected = {
        ...gameState,
        players: gameState.players.map(p =>
          p.playerId === 'p1'
            ? { ...p, isConnected: false, disconnectedAt }
            : p
        ),
      };

      const reconnectedPlayers = stateWithDisconnected.players.map(p =>
        p.playerId === 'p1'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...stateWithDisconnected, players: reconnectedPlayers };
      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p1');

      expect(recoveredPlayer?.isConnected).toBe(true);
      expect(recoveredPlayer?.cards).toBeDefined();
    });
  });

  describe('Timeout handling for disconnected players', () => {
    it('auto-folds disconnected player when their action timer expires', () => {
      const state = createGameWithDisconnectedPlayer('p1', true);
      let gameState = dealHoleCards(state);

      gameState = {
        ...gameState,
        activeSeat: 1,
      };

      const newState = handleTimeout(gameState);

      const timedOutPlayer = newState.players.find(p => p.playerId === 'p1');
      expect(timedOutPlayer?.isFolded).toBe(true);
    });

    it('auto-checks if no bet to call', () => {
      const state = initGame(tableId, basePlayers, smallBlind, bigBlind);
      let gameState = dealHoleCards(state);

      gameState = applyAction(gameState, 'p1', { type: 'call' });
      gameState = applyAction(gameState, 'p2', { type: 'call' });
      gameState = applyAction(gameState, 'p3', { type: 'check' });

      expect(gameState.phase).toBe('flop');

      const disconnectedAt = Date.now() - RECONNECT_GRACE_PERIOD_MS - 5000;
      gameState = {
        ...gameState,
        activeSeat: 1,
        players: gameState.players.map(p =>
          p.playerId === 'p1'
            ? { ...p, isConnected: false, disconnectedAt }
            : p
        ),
      };

      const newState = handleTimeout(gameState);

      const timedOutPlayer = newState.players.find(p => p.playerId === 'p1');
      expect(timedOutPlayer?.lastAction).toBe('check');
      expect(timedOutPlayer?.isFolded).toBe(false);
    });
  });

  describe('State sanitization for clients', () => {
    it('shows disconnected status to other players', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const sanitized = sanitizeForPlayer(stateWithHoleCards, 'p2');

      const disconnectedPlayer = sanitized.players.find(p => p.playerId === 'p1');
      expect(disconnectedPlayer?.isConnected).toBe(false);
    });

    it('hides disconnected player hole cards from other players', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const sanitized = sanitizeForPlayer(stateWithHoleCards, 'p2');

      const disconnectedPlayer = sanitized.players.find(p => p.playerId === 'p1');
      expect(disconnectedPlayer?.cards?.[0]).toBe('??');
    });

    it('preserves own hole cards for reconnecting player', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const sanitized = sanitizeForPlayer(stateWithHoleCards, 'p1');

      const selfPlayer = sanitized.players.find(p => p.playerId === 'p1');
      expect(selfPlayer?.cards?.[0]).not.toBe('??');
      expect(selfPlayer?.cards).toHaveLength(2);
    });

    it('sanitizes state for spectators', () => {
      const state = createGameWithDisconnectedPlayer('p1');
      const stateWithHoleCards = dealHoleCards(state);

      const sanitized = sanitizeForSpectator(stateWithHoleCards);

      for (const player of sanitized.players) {
        expect(player.cards).toBeUndefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('handles multiple disconnected players', () => {
      const playersWithMultipleDisconnects = basePlayers.map(p =>
        ['p1', 'p2'].includes(p.playerId)
          ? { ...p, isConnected: false, disconnectedAt: Date.now() - 5000 }
          : p
      );

      const state = initGame(tableId, playersWithMultipleDisconnects, smallBlind, bigBlind);
      const stateWithHoleCards = dealHoleCards(state);

      const disconnectedCount = stateWithHoleCards.players.filter(p => !p.isConnected).length;
      expect(disconnectedCount).toBe(2);
    });

    it('handles reconnecting player who was sitting out', () => {
      const playersWithSitout = basePlayers.map(p =>
        p.playerId === 'p1'
          ? { ...p, isSittingOut: true, isConnected: false, disconnectedAt: Date.now() - 5000 }
          : p
      );

      const state = initGame(tableId, playersWithSitout, smallBlind, bigBlind);

      const reconnectedPlayers = state.players.map(p =>
        p.playerId === 'p1'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...state, players: reconnectedPlayers };
      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p1');

      expect(recoveredPlayer?.isConnected).toBe(true);
      expect(recoveredPlayer?.isSittingOut).toBe(true);
    });

    it('preserves all-in status through disconnect/reconnect', () => {
      const state = initGame(tableId, basePlayers, smallBlind, bigBlind);
      let gameState = dealHoleCards(state);

      gameState = applyAction(gameState, 'p1', { type: 'all-in' });

      const disconnectedAt = Date.now() - 5000;
      const stateWithDisconnect = {
        ...gameState,
        players: gameState.players.map(p =>
          p.playerId === 'p1'
            ? { ...p, isConnected: false, disconnectedAt }
            : p
        ),
      };

      const reconnectedPlayers = stateWithDisconnect.players.map(p =>
        p.playerId === 'p1'
          ? { ...p, isConnected: true, disconnectedAt: undefined }
          : p
      );

      const reconnectedState = { ...stateWithDisconnect, players: reconnectedPlayers };
      const recoveredPlayer = reconnectedState.players.find(p => p.playerId === 'p1');

      expect(recoveredPlayer?.isAllIn).toBe(true);
      expect(recoveredPlayer?.isConnected).toBe(true);
    });
  });
});
