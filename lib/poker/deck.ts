import type { Card, Rank, Suit } from '@/types/poker';

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['h', 'd', 'c', 's'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function deal(deck: Card[], count: number): { cards: Card[]; remaining: Card[] } {
  if (deck.length < count) throw new Error('Not enough cards in deck');
  return {
    cards: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

export function getRank(card: Card): Rank {
  return card[0] as Rank;
}

export function getSuit(card: Card): Suit {
  return card[1] as Suit;
}

export function rankValue(rank: Rank | string): number {
  return RANKS.indexOf(rank as Rank);
}

export function cardValue(card: Card): number {
  return rankValue(getRank(card));
}

/** Card display helpers */
export function suitSymbol(suit: Suit | string): string {
  const map: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
  return map[suit] ?? suit;
}

export function suitColor(suit: Suit | string): string {
  return suit === 'h' || suit === 'd' ? 'text-red-500' : 'text-foreground';
}

export function rankDisplay(rank: Rank | string): string {
  return rank === 'T' ? '10' : rank;
}
