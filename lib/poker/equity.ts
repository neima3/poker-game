import { createDeck } from './deck';
import { evaluateBestHand, compareHands } from './evaluator';
import type { Card } from '@/types/poker';

export interface EquityResult {
  playerId: string;
  username: string;
  /** Fraction of sims won outright (0-1) */
  winEquity: number;
  /** Fraction of sims split (0-1, each split counted as 1/n) */
  tieEquity: number;
  /** winEquity + tieEquity — the number to display */
  totalEquity: number;
}

export type StreetName = 'preflop' | 'flop' | 'turn' | 'river';

export interface StreetEquity {
  street: StreetName;
  /** Community cards visible at this street (0 preflop, 3 flop, 4 turn, 5 river) */
  communityCards: Card[];
  equities: EquityResult[];
}

/**
 * Compute equity snapshots at each street for a set of players.
 * Only streets that exist in the hand are returned (e.g. if the hand ended
 * preflop the result only contains the preflop snapshot).
 *
 * @param players  Players with known hole cards
 * @param finalCommunityCards  The full board (up to 5 cards) dealt in the hand
 * @param simulations  Monte Carlo sim count per street
 */
export function calculateStreetEquities(
  players: { playerId: string; username: string; holeCards: Card[] }[],
  finalCommunityCards: Card[],
  simulations = 600,
): StreetEquity[] {
  const active = players.filter(p => p.holeCards.length >= 2);
  if (active.length < 2) return [];

  const results: StreetEquity[] = [];

  // Define street thresholds: preflop = 0, flop = 3, turn = 4, river = 5
  const streets: { name: StreetName; cardCount: number }[] = [
    { name: 'preflop', cardCount: 0 },
    { name: 'flop',    cardCount: 3 },
    { name: 'turn',    cardCount: 4 },
    { name: 'river',   cardCount: 5 },
  ];

  for (const { name, cardCount } of streets) {
    // Only include streets that were actually reached
    if (cardCount > 0 && finalCommunityCards.length < cardCount) break;

    const communityCards = finalCommunityCards.slice(0, cardCount);
    const equities = calculateEquity(active, communityCards, simulations);
    results.push({ street: name, communityCards, equities });
  }

  return results;
}

/**
 * Calculate equity for each player via Monte Carlo simulation.
 *
 * Players with fewer than 2 hole cards are ignored.
 * Runs `simulations` random runouts of the remaining board cards
 * and tallies win/tie fractions.
 */
export function calculateEquity(
  players: { playerId: string; username: string; holeCards: Card[] }[],
  communityCards: Card[],
  simulations = 800,
): EquityResult[] {
  const active = players.filter(p => p.holeCards.length >= 2);

  if (active.length === 0) return [];

  if (active.length === 1) {
    return [{ playerId: active[0].playerId, username: active[0].username, winEquity: 1, tieEquity: 0, totalEquity: 1 }];
  }

  const needed = Math.max(0, 5 - communityCards.length);

  // Fully-known board — single deterministic evaluation
  if (needed === 0) {
    const evals = active.map(p => ({
      playerId: p.playerId,
      username: p.username,
      hand: evaluateBestHand(p.holeCards, communityCards),
    }));

    let best = evals[0].hand;
    for (const e of evals) {
      if (compareHands(e.hand, best) > 0) best = e.hand;
    }

    const winners = evals.filter(e => compareHands(e.hand, best) === 0);
    const splitShare = 1 / winners.length;

    return active.map(p => {
      const isWin = winners.some(w => w.playerId === p.playerId);
      return {
        playerId: p.playerId,
        username: p.username,
        winEquity: isWin && winners.length === 1 ? 1 : 0,
        tieEquity: isWin && winners.length > 1 ? splitShare : 0,
        totalEquity: isWin ? splitShare : 0,
      };
    });
  }

  // Build remaining deck — remove all known cards
  const known = new Set([...active.flatMap(p => p.holeCards), ...communityCards]);
  const remaining = createDeck().filter(c => !known.has(c));

  const wins = new Array(active.length).fill(0);
  const tieParts = new Array(active.length).fill(0);

  for (let sim = 0; sim < simulations; sim++) {
    // Partial Fisher-Yates: select `needed` random cards in-place
    const deck = [...remaining];
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(Math.random() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const board = [...communityCards, ...deck.slice(0, needed)];

    // Evaluate all hands
    const hands = active.map(p => evaluateBestHand(p.holeCards, board));

    // Find best
    let bestHand = hands[0];
    for (const h of hands) {
      if (compareHands(h, bestHand) > 0) bestHand = h;
    }

    // Collect winner indices
    const winnerIdxs: number[] = [];
    for (let i = 0; i < hands.length; i++) {
      if (compareHands(hands[i], bestHand) === 0) winnerIdxs.push(i);
    }

    if (winnerIdxs.length === 1) {
      wins[winnerIdxs[0]]++;
    } else {
      const share = 1 / winnerIdxs.length;
      for (const idx of winnerIdxs) {
        tieParts[idx] += share;
      }
    }
  }

  return active.map((p, i) => ({
    playerId: p.playerId,
    username: p.username,
    winEquity: wins[i] / simulations,
    tieEquity: tieParts[i] / simulations,
    totalEquity: (wins[i] + tieParts[i]) / simulations,
  }));
}
