import type { Card, HandResult, HandRankName } from '@/types/poker';
import { rankValue, getRank, getSuit } from './deck';

// Get all C(n,k) combinations
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function sortByRankDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => rankValue(getRank(b)) - rankValue(getRank(a)));
}

function evaluate5(cards: Card[]): HandResult {
  const sorted = sortByRankDesc(cards);
  const ranks = sorted.map(c => rankValue(getRank(c)));
  const suits = sorted.map(c => getSuit(c));

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including wheel: A-2-3-4-5)
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (uniqueRanks.join(',') === '12,3,2,1,0') {
      // Wheel: A-2-3-4-5
      isStraight = true;
      straightHigh = 3; // 5-high straight
    }
  }

  // Count rank frequencies
  const freq = new Map<number, number>();
  for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);

  // Sort by frequency desc, then rank desc
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map(g => g[1]);
  const groupRanks = groups.map(g => g[0]);

  let rank: number;
  let name: HandRankName;
  let score: number[];

  if (isFlush && isStraight) {
    rank = straightHigh === 12 ? 9 : 8;
    name = straightHigh === 12 ? 'Royal Flush' : 'Straight Flush';
    score = [rank, straightHigh];
  } else if (counts[0] === 4) {
    rank = 7;
    name = 'Four of a Kind';
    score = [rank, groupRanks[0], groupRanks[1]];
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 6;
    name = 'Full House';
    score = [rank, groupRanks[0], groupRanks[1]];
  } else if (isFlush) {
    rank = 5;
    name = 'Flush';
    score = [rank, ...ranks];
  } else if (isStraight) {
    rank = 4;
    name = 'Straight';
    score = [rank, straightHigh];
  } else if (counts[0] === 3) {
    rank = 3;
    name = 'Three of a Kind';
    score = [rank, groupRanks[0], ...groupRanks.slice(1)];
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 2;
    name = 'Two Pair';
    score = [rank, groupRanks[0], groupRanks[1], groupRanks[2]];
  } else if (counts[0] === 2) {
    rank = 1;
    name = 'One Pair';
    score = [rank, groupRanks[0], ...groupRanks.slice(1)];
  } else {
    rank = 0;
    name = 'High Card';
    score = [rank, ...groupRanks];
  }

  return { rank, name, cards: sorted, score };
}

function compareScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Evaluate best hand from hole cards + community cards */
export function evaluateBestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    // Not enough cards yet — return high card from what we have
    const sorted = sortByRankDesc(allCards);
    return {
      rank: 0,
      name: 'High Card',
      cards: sorted.slice(0, 5),
      score: [0, ...sorted.slice(0, 5).map(c => rankValue(getRank(c)))],
    };
  }

  const combos = combinations(allCards, 5);
  let best: HandResult | null = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareScore(result.score, best.score) > 0) {
      best = result;
    }
  }

  return best!;
}

/** Compare two HandResults: returns positive if a > b, negative if a < b, 0 if tie */
export function compareHands(a: HandResult, b: HandResult): number {
  return compareScore(a.score, b.score);
}

/** Determine winners from showdown. Returns array of winner playerIds (multiple = split pot) */
export function determineWinners(
  players: { playerId: string; holeCards: Card[]; communityCards: Card[] }[]
): { playerId: string; hand: HandResult }[] {
  const results = players.map(p => ({
    playerId: p.playerId,
    hand: evaluateBestHand(p.holeCards, p.communityCards),
  }));

  results.sort((a, b) => compareHands(b.hand, a.hand));
  const best = results[0].hand;

  return results.filter(r => compareScore(r.hand.score, best.score) === 0);
}
