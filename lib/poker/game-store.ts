/**
 * In-memory game state store with per-table concurrency control.
 *
 * ## Authoritative source of truth
 *
 * The **in-memory Map** (`gameStates`) is the authoritative runtime store.
 * Every `setGameState` call writes to the Map AND upserts to `poker_game_states`
 * in the DB (via `persistGameState`). The DB row is the durable fallback used
 * only on cold starts (new Vercel instance, server restart, deploy).
 *
 * | Scenario               | Source of truth         |
 * |------------------------|-------------------------|
 * | Warm instance          | In-memory Map           |
 * | Cold start / restart   | poker_game_states (DB)  |
 * | After TTL expiry       | Neither — hand is reset |
 *
 * Player chips and seat assignments are owned by `poker_profiles` /
 * `poker_seats` tables and mutated only via atomic RPCs (`poker_sit_player`,
 * `poker_stand_player`). The in-memory GameState carries a *copy* of these
 * values (player.stack) for fast engine computation; on hand completion the
 * winning stacks are written back to `poker_seats.stack`.
 *
 * ## Sit/stand safety
 *
 * - **Sit**: `poker_sit_player` RPC deducts chips and assigns seat in one
 *   PostgreSQL transaction. The sit route calls this RPC; there are no
 *   separate non-atomic mutations.
 * - **Stand**: `hasActiveGame()` must return false before the stand route
 *   proceeds. This prevents removing a seat mid-hand (which would leave the
 *   engine referencing a missing player). The stand RPC then atomically
 *   returns chips and clears the seat row.
 *
 * withTableLock serializes all state mutations for a given table through a
 * promise chain (one-at-a-time queue). This prevents the race condition where
 * two simultaneous POST requests both read the same state, both pass turn
 * validation, and the second write silently overwrites the first.
 *
 * DB persistence: every write is also upserted to the `poker_game_states`
 * table via the service-role client. On a cold start (new Vercel instance or
 * server restart), ensureGameStateLoaded() re-hydrates the in-memory cache
 * from the DB before any route handler accesses the state.
 *
 * TTL: states idle for > 24 hours are treated as expired and discarded on
 * the next load attempt (stale row is deleted from the DB as well).
 */
import type { GameState } from '@/types/poker';
import { createServiceClient } from '@/lib/supabase/service';

// ─── Constants ────────────────────────────────────────────────────────────────

const GAME_STATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  // Remove from DB (fire-and-forget)
  void createServiceClient()
    .from('poker_game_states')
    .delete()
    .eq('table_id', tableId);
}

export function hasActiveGame(tableId: string): boolean {
  const state = gameStates.get(tableId);
  return !!state && state.phase !== 'waiting' && state.phase !== 'pot_awarded';
}

// ─── DB persistence ───────────────────────────────────────────────────────────

/**
 * Load game state from the DB into the in-memory cache, if not already present.
 * A no-op when the state is already in memory (avoids redundant DB round-trips
 * within a single warm instance).
 *
 * Call this at the top of any route handler that reads or mutates game state,
 * so that cold starts (new Vercel instance, server restart, deploy) are
 * transparently handled without losing mid-hand progress.
 *
 * States idle for > 24 hours are treated as expired: the row is deleted from
 * the DB and `undefined` is effectively returned (cache stays empty).
 */
export async function ensureGameStateLoaded(tableId: string): Promise<void> {
  if (gameStates.has(tableId)) return;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('poker_game_states')
    .select('state, last_active_at')
    .eq('table_id', tableId)
    .single();

  if (!data) return;

  // TTL check: discard states that have been idle for more than 24 hours
  const lastActive = new Date(data.last_active_at).getTime();
  if (Date.now() - lastActive > GAME_STATE_TTL_MS) {
    void supabase
      .from('poker_game_states')
      .delete()
      .eq('table_id', tableId);
    return;
  }

  const state = data.state as GameState;
  if (state) {
    gameStates.set(tableId, state);
  }
}

/**
 * Upsert the current in-memory game state to the DB.
 * Call this after every setGameState() call to durably persist the new state
 * before returning the response, so that a subsequent cold start can recover it.
 */
export async function persistGameState(tableId: string): Promise<void> {
  const state = gameStates.get(tableId);
  if (!state) return;

  const supabase = createServiceClient();
  await supabase
    .from('poker_game_states')
    .upsert(
      {
        table_id: tableId,
        state,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'table_id' }
    );
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
