/**
 * Processes consecutive bot turns after a human or bot action.
 * Returns the new game state after all bots have acted.
 */

import type { GameState } from '@/types/poker';
import { applyAction } from '../poker/engine';
import { getBotAction } from './strategies';

export function processBotTurns(state: GameState): GameState {
  let current = state;
  let safety = 0;

  while (safety++ < 20) {
    if (
      current.phase === 'pot_awarded' ||
      current.phase === 'waiting' ||
      current.phase === 'starting'
    ) break;

    const activePlayer = current.players.find(p => p.seatNumber === current.activeSeat);
    if (!activePlayer || !activePlayer.isBot) break;

    try {
      const botAction = getBotAction(
        current,
        activePlayer.playerId,
        activePlayer.botDifficulty ?? 'regular',
      );
      current = applyAction(current, activePlayer.playerId, botAction);
    } catch {
      // If bot action fails (e.g. validation error), make it fold
      try {
        current = applyAction(current, activePlayer.playerId, { type: 'fold' });
      } catch {
        break; // Give up to prevent infinite loop
      }
    }
  }

  return current;
}
