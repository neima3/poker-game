import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, deal, getRank, getSuit, rankValue } from '@/lib/poker/deck';

describe('createDeck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('contains all 4 suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map(c => c[1]));
    expect(suits).toEqual(new Set(['h', 'd', 'c', 's']));
  });

  it('contains all 13 ranks', () => {
    const deck = createDeck();
    const ranks = new Set(deck.map(c => c[0]));
    expect(ranks.size).toBe(13);
  });
});

describe('shuffle', () => {
  it('returns same 52 cards in different order', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled).size).toBe(52);
    // Very unlikely to be identical order (1/52! chance)
    expect(shuffled.join(',')).not.toBe(deck.join(','));
  });

  it('does not mutate original deck', () => {
    const deck = createDeck();
    const copy = [...deck];
    shuffle(deck);
    expect(deck).toEqual(copy);
  });
});

describe('deal', () => {
  it('returns correct number of cards', () => {
    const deck = createDeck();
    const { cards, remaining } = deal(deck, 5);
    expect(cards).toHaveLength(5);
    expect(remaining).toHaveLength(47);
  });

  it('throws if not enough cards', () => {
    expect(() => deal([], 1)).toThrow('Not enough cards');
  });

  it('cards + remaining = original deck', () => {
    const deck = createDeck();
    const { cards, remaining } = deal(deck, 7);
    expect([...cards, ...remaining]).toEqual(deck);
  });
});

describe('getRank / getSuit', () => {
  it('extracts rank from card', () => {
    expect(getRank('Ah')).toBe('A');
    expect(getRank('Td')).toBe('T');
    expect(getRank('2c')).toBe('2');
  });

  it('extracts suit from card', () => {
    expect(getSuit('Ah')).toBe('h');
    expect(getSuit('Kd')).toBe('d');
    expect(getSuit('Qc')).toBe('c');
    expect(getSuit('Js')).toBe('s');
  });
});

describe('rankValue', () => {
  it('returns correct values (2=0, A=12)', () => {
    expect(rankValue('2')).toBe(0);
    expect(rankValue('A')).toBe(12);
    expect(rankValue('K')).toBe(11);
    expect(rankValue('T')).toBe(8);
  });

  it('returns -1 for unknown rank', () => {
    expect(rankValue('X')).toBe(-1);
  });
});
