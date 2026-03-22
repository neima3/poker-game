/**
 * In-memory game state store with per-table concurrency control.
 *
 * withTableLock serializes all state mutations for a given table through a
 * promise chain (one-at-a-time queue). This prevents the race condition where
 * two simultaneous POST requests both read the same state, both pass turn
 * validation, and the second write silently overwrites the first.
 *
 * In production, replace with Redis + Redlock for multi-process safety.
 */
import type { GameState } from '@/types/poker';

// ─── State storage ────────────────────────────────────────────────────────────

const gameStates = new Map<string, GameState>();

export function getGameState(tableId: string): GameState | undefined {
  return gameStates.get(tableId);
}

export function setGameState(tableId: string, state: GameState): void {
  const existing = gameStates.get(tableId);
  gameStates.set(tableId, { ...state, version: (existing?.version ?? 0) + 1 });
}

export function deleteGameState(tableId: string): void {
  gameStates.delete(tableId);
  tableLocks.delete(tableId);
  inFlightPlayers.delete(tableId);
}

export function hasActiveGame(tableId: string): boolean {
  const state = gameStates.get(tableId);
  return !!state && state.phase !== 'waiting' && state.phase !== 'pot_awarded';
}

// ─── Per-table async lock (action queue) ─────────────────────────────────────

/**
 * Per-table promise chains. Each entry is the tail of the current lock chain.
 * New operations append to the tail, naturally serializing all mutations.
 */
const tableLocks = new Map<string, Promise<unknown>>();

/**
 * Run `fn` exclusively for `tableId`. If another operation is already running
 * for this table, `fn` is queued and executed after it completes.
 *
 * Errors inside `fn` are propagated to the caller but do NOT break the lock
 * chain — subsequent operations proceed normally.
 */
export function withTableLock<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
  const current = tableLocks.get(tableId) ?? Promise.resolve();

  const next = current.then(() => fn());

  // Store a version of the tail that swallows errors so the chain stays alive
  // even when `fn` rejects.
  tableLocks.set(tableId, next.catch(() => {}));

  return next;
}

// ─── In-flight player tracking ────────────────────────────────────────────────

/**
 * Tracks which players already have an action queued or executing for a given
 * table. Used to detect duplicate concurrent requests from the same player and
 * return 409 immediately rather than queuing a no-op behind the first request.
 */
const inFlightPlayers = new Map<string, Set<string>>();

/** Returns true if this player already has an action in flight for the table. */
export function isPlayerInFlight(tableId: string, playerId: string): boolean {
  return inFlightPlayers.get(tableId)?.has(playerId) ?? false;
}

/** Mark a player as having an action in flight. Call before withTableLock. */
export function markPlayerInFlight(tableId: string, playerId: string): void {
  if (!inFlightPlayers.has(tableId)) {
    inFlightPlayers.set(tableId, new Set());
  }
  inFlightPlayers.get(tableId)!.add(playerId);
}

/** Remove in-flight marker. Call in a finally block after the lock resolves. */
export function clearPlayerInFlight(tableId: string, playerId: string): void {
  inFlightPlayers.get(tableId)?.delete(playerId);
}
