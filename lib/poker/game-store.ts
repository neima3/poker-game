/**
 * In-memory game state store.
 * In production, this should be replaced with Redis or a persistent DB store.
 * For MVP, we use Node.js module-level Map (persists between requests in same process).
 */
import type { GameState } from '@/types/poker';

// Global singleton store
const gameStates = new Map<string, GameState>();

export function getGameState(tableId: string): GameState | undefined {
  return gameStates.get(tableId);
}

export function setGameState(tableId: string, state: GameState): void {
  gameStates.set(tableId, state);
}

export function deleteGameState(tableId: string): void {
  gameStates.delete(tableId);
}

export function hasActiveGame(tableId: string): boolean {
  const state = gameStates.get(tableId);
  return !!state && state.phase !== 'waiting' && state.phase !== 'pot_awarded';
}
