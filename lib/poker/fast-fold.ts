/**
 * Fast Fold / Rush Poker Engine
 * When a player folds, they instantly get a new hand at a virtual table.
 * Implemented as a single-player rapid-fire mode vs bots.
 */

import type { GameState, BotDifficulty } from '@/types/poker';
import { initGame, dealHoleCards } from './engine';
import { processBotTurns } from '@/lib/bots/bot-runner';
import { getBotName, getBotId } from '@/lib/bots/strategies';

export interface FastFoldSession {
  sessionId: string;
  playerId: string;
  username: string;
  stack: number;
  handsPlayed: number;
  handsWon: number;
  peakStack: number;
  startStack: number;
  botDifficulty: BotDifficulty;
  smallBlind: number;
  bigBlind: number;
  tableSize: number;
  startedAt: number;
  /** Tracks position rotation: 0=BTN, 1=SB, 2=BB, 3=UTG, 4=HJ, 5=CO */
  positionIndex: number;
}

// In-memory store for fast fold sessions
const sessions = new Map<string, FastFoldSession>();

export function createFastFoldSession(
  playerId: string,
  username: string,
  stack: number,
  botDifficulty: BotDifficulty = 'regular',
  smallBlind: number = 25,
  bigBlind: number = 50,
): FastFoldSession {
  const sessionId = `ff_${playerId}_${Date.now()}`;
  // Start at a random position so every session feels different
  const startPosition = Math.floor(Math.random() * 6);
  const session: FastFoldSession = {
    sessionId,
    playerId,
    username,
    stack,
    handsPlayed: 0,
    handsWon: 0,
    peakStack: stack,
    startStack: stack,
    botDifficulty,
    smallBlind,
    bigBlind,
    tableSize: 6,
    startedAt: Date.now(),
    positionIndex: startPosition,
  };
  sessions.set(sessionId, session);
  return session;
}

/** Returns the number of currently active fast fold sessions. */
export function getActiveSessionCount(): number {
  return sessions.size;
}

export function getFastFoldSession(sessionId: string): FastFoldSession | undefined {
  return sessions.get(sessionId);
}

export function updateFastFoldSession(sessionId: string, updates: Partial<FastFoldSession>): void {
  const session = sessions.get(sessionId);
  if (session) {
    Object.assign(session, updates);
    sessions.set(sessionId, session);
  }
}

export function deleteFastFoldSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Position names for the 6-max rotation cycle.
 * Index 0 = BTN (Dealer), 1 = SB, 2 = BB, 3 = UTG, 4 = HJ, 5 = CO.
 */
export const POSITION_NAMES = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'] as const;

/**
 * Deal a new fast fold hand — fresh table with bots every time.
 * The player's table position rotates deterministically through BTN → SB → BB → UTG → HJ → CO.
 * This mirrors real Zoom/Rush poker where the player cycles through all positions.
 */
export function dealFastFoldHand(session: FastFoldSession): GameState {
  const tableId = `ff_table_${session.sessionId}`;

  // Fix player at seat 3 (center) and rotate the dealer seat to place them
  // in the correct position relative to the button.
  // Formula: dealerSeat = ((humanSeat - positionIndex - 1 + tableSize) % tableSize) + 1
  const humanSeat = 3;
  const dealerSeat =
    ((humanSeat - session.positionIndex - 1 + session.tableSize) % session.tableSize) + 1;

  const players: any[] = [];

  for (let seat = 1; seat <= session.tableSize; seat++) {
    if (seat === humanSeat) {
      players.push({
        playerId: session.playerId,
        username: session.username,
        seatNumber: seat,
        stack: session.stack,
        isSittingOut: false,
        isConnected: true,
        isBot: false,
      });
    } else {
      // Vary bot stacks slightly for realism (70-130% of player stack)
      const stackVariance = 0.7 + Math.random() * 0.6;
      const botStack = Math.floor(session.stack * stackVariance);
      players.push({
        playerId: getBotId(tableId, seat),
        username: getBotName(session.botDifficulty, seat),
        seatNumber: seat,
        stack: Math.max(session.bigBlind * 10, botStack),
        isSittingOut: false,
        isConnected: true,
        isBot: true,
        botDifficulty: session.botDifficulty,
      });
    }
  }

  let gameState = dealHoleCards(
    initGame(tableId, players, session.smallBlind, session.bigBlind, dealerSeat, 'fast_fold')
  );

  // Process leading bot turns (e.g. when bots are UTG and act before player)
  gameState = processBotTurns(gameState);

  // Advance to next position for the following hand
  session.handsPlayed++;
  session.positionIndex = (session.positionIndex + 1) % session.tableSize;
  sessions.set(session.sessionId, session);

  return gameState;
}
