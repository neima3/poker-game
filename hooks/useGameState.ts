'use client';

import { useState, useCallback, useRef } from 'react';
import type { GameState, ActionType, SeatRow } from '@/types/poker';
import { useTableChannel, type ChannelStatus } from './useTableChannel';

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

  const handleGameState = useCallback((state: Omit<GameState, 'deck'>) => {
    setGameState(state);
    // Clear cached cards at start of new hand so stale cards don't bleed in
    if (state.phase === 'preflop') {
      setMyCards([]);
    }
  }, []);

  const handlePrivateCards = useCallback((cards: string[]) => {
    setMyCards(cards);
  }, []);

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

  const channelStatus: ChannelStatus = useTableChannel({
    tableId,
    playerId,
    onGameState: handleGameState,
    onPrivateCards: handlePrivateCards,
    onPlayerJoined: onSeatsChanged ? handlePlayerJoined : undefined,
  });

  const submitAction = useCallback(async (action: ActionType, amount?: number) => {
    if (!playerId) return;

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

  const startGame = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tables/${tableId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed to start game');
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }, [tableId]);

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
