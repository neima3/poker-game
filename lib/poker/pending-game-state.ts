import type { GameState } from '@/types/poker';

const PENDING_GAME_STATE_PREFIX = 'poker_pending_game_state:';

function getPendingGameStateKey(tableId: string) {
  return `${PENDING_GAME_STATE_PREFIX}${tableId}`;
}

export function storePendingGameState(tableId: string, state: Omit<GameState, 'deck'>) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(getPendingGameStateKey(tableId), JSON.stringify(state));
}

export function consumePendingGameState(tableId: string): Omit<GameState, 'deck'> | null {
  if (typeof window === 'undefined') return null;

  const key = getPendingGameStateKey(tableId);
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;

  sessionStorage.removeItem(key);

  try {
    return JSON.parse(stored) as Omit<GameState, 'deck'>;
  } catch {
    return null;
  }
}
