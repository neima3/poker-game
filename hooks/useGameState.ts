'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState, ActionType, SeatRow } from '@/types/poker';
import { useTableChannel, type ChannelStatus } from './useTableChannel';
import { consumePendingGameState } from '@/lib/poker/pending-game-state';

interface UseGameStateOptions {
  tableId: string;
  playerId?: string;
  initialState?: Omit<GameState, 'deck'> | null;
  onSeatsChanged?: (seats: SeatRow[]) => void;
}

const ACTION_DEBOUNCE_MS = 400;

export function useGameState({ tableId, playerId, initialState, onSeatsChanged }: UseGameStateOptions) {
  const [gameState, setGameState] = useState<Omit<GameState, 'deck'> | null>(initialState ?? null);
  const [myCards, setMyCards] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce guard — prevents double-click double-submit
  const lastActionAt = useRef<number>(0);

  const prevPhaseRef = useRef<string | null>(initialState?.phase ?? null);

  const handleGameState = useCallback((state: Omit<GameState, 'deck'>) => {
    // Only clear cached cards when transitioning TO preflop from a non-preflop phase
    // (i.e., a new hand is starting), not on every preflop broadcast
    const prev = prevPhaseRef.current;
    if (state.phase === 'preflop' && prev !== 'preflop' && prev !== 'starting') {
      setMyCards([]);
    }
    prevPhaseRef.current = state.phase;
    setGameState(state);
  }, []);

  const handlePrivateCards = useCallback((cards: string[]) => {
    setMyCards(cards);
  }, []);

  useEffect(() => {
    if (initialState) return;
    const pendingState = consumePendingGameState(tableId);
    if (pendingState) {
      handleGameState(pendingState);
    }
  }, [tableId, initialState, handleGameState]);

  // When another player joins/leaves, refetch seats from server
  const handlePlayerJoined = useCallback(async () => {
    if (!onSeatsChanged) return;
    try {
      const res = await fetch(`/api/tables/${tableId}/seats`);
      if (res.ok) {
        const data = await res.json();
        onSeatsChanged(data.seats);
      }
    } catch {
      // Non-critical — UI will still be functional
    }
  }, [tableId, onSeatsChanged]);

  // On reconnect: force a full game state refresh to resolve any split-brain
  const handleReconnect = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${tableId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.gameState) handleGameState(data.gameState);
      }
    } catch {
      // Non-critical — next Realtime broadcast will resync
    }
  }, [tableId, handleGameState]);

  // Use a ref to read channelStatus inside submitAction without stale closure
  const channelStatusRef = useRef<ChannelStatus>('connecting');

  const channelStatus: ChannelStatus = useTableChannel({
    tableId,
    playerId,
    onGameState: handleGameState,
    onPrivateCards: handlePrivateCards,
    onPlayerJoined: onSeatsChanged ? handlePlayerJoined : undefined,
    onReconnect: handleReconnect,
  });

  // Keep ref in sync with current status
  channelStatusRef.current = channelStatus;

  // Clear any in-flight submitting state when we drop so buttons don't stay locked
  useEffect(() => {
    if (channelStatus === 'disconnected') {
      setIsSubmitting(false);
      lastActionAt.current = 0;
    }
  }, [channelStatus]);

  const submitAction = useCallback(async (action: ActionType, amount?: number) => {
    if (!playerId) return;
    // Block actions while disconnected to prevent zombie submissions
    if (channelStatusRef.current === 'disconnected') return;

    // Debounce: ignore calls within 400ms of last action
    const now = Date.now();
    if (now - lastActionAt.current < ACTION_DEBOUNCE_MS) return;
    lastActionAt.current = now;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tables/${tableId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Action failed');
        return;
      }

      if (data.state) {
        setGameState(data.state);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsSubmitting(false);
    }
  }, [tableId, playerId]);

  const startGame = useCallback(async (opts?: { fill_bots?: boolean; bot_difficulty?: string; run_it_twice?: boolean }) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/start`, {
        method: 'POST',
        headers: opts ? { 'Content-Type': 'application/json' } : undefined,
        body: opts ? JSON.stringify(opts) : undefined,
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed to start game');
      if (data.state) setGameState(data.state);
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }, [tableId]);

  // Auto-fold when timer expires (disconnect handling)
  const timeoutFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameState || !playerId) return;
    if (!gameState.actionDeadline) return;
    // Only fire timeout if someone else's turn expired (any seated player can trigger it)
    const activePlayer = gameState.players.find(p => p.seatNumber === gameState.activeSeat);
    if (!activePlayer || activePlayer.isBot) return;

    const key = `${gameState.activeSeat}-${gameState.actionDeadline}`;
    if (timeoutFiredRef.current === key) return;

    const remaining = gameState.actionDeadline - Date.now();
    if (remaining > 32_000) return; // Stale deadline, ignore

    // Fire timeout request 1.5s after deadline to allow for network grace
    const delay = Math.max(0, remaining + 1500);
    const timer = setTimeout(async () => {
      if (timeoutFiredRef.current === key) return;
      timeoutFiredRef.current = key;
      try {
        const res = await fetch(`/api/tables/${tableId}/timeout`, { method: 'POST' });
        const data = await res.json();
        if (data.state) setGameState(data.state);
      } catch { /* another client may have already handled it */ }
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState?.activeSeat, gameState?.actionDeadline, playerId, tableId]);

  // Merge private cards into game state so the player always sees their own cards
  const stateWithMyCards = gameState && playerId && myCards.length > 0
    ? {
        ...gameState,
        players: gameState.players.map(p =>
          p.playerId === playerId ? { ...p, cards: myCards } : p
        ),
      }
    : gameState;

  return {
    gameState: stateWithMyCards,
    myCards,
    isSubmitting,
    error,
    channelStatus,
    submitAction,
    startGame,
  };
}
