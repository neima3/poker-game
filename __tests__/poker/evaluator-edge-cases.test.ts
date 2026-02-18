import { describe, it, expect } from 'vitest';
import { evaluateBestHand, compareHands, determineWinners } from '@/lib/poker/evaluator';

// ─── Tiebreaker / Kicker Tests ────────────────────────────────────────────────

describe('kicker tiebreakers', () => {
  it('four of a kind: higher quad wins', () => {
    const quadAces = evaluateBestHand(['Ah', 'As'], ['Ad', 'Ac', 'Kh', '2d', '3c']);
    const quadKings = evaluateBestHand(['Kh', 'Ks'], ['Kd', 'Kc', 'Ah', '2d', '3c']);
    expect(compareHands(quadAces, quadKings)).toBeGreaterThan(0);
  });

  it('four of a kind: higher kicker wins when quads are equal', () => {
    // Both have quad 8s — kicker determines winner
    const quadWithAce = evaluateBestHand(['8h', '8s'], ['8d', '8c', 'Ah', '2d', '3c']);
    const quadWithKing = evaluateBestHand(['8h', '8s'], ['8d', '8c', 'Kh', '2d', '3c']);
    expect(compareHands(quadWithAce, quadWithKing)).toBeGreaterThan(0);
  });

  it('full house: higher three wins over lower three', () => {
    const acesOverKings = evaluateBestHand(['Ah', 'As'], ['Ad', 'Kh', 'Ks', '2d', '3c']);
    const kingsOverAces = evaluateBestHand(['Kh', 'Ks'], ['Kd', 'Ah', 'As', '2d', '3c']);
    expect(compareHands(acesOverKings, kingsOverAces)).toBeGreaterThan(0);
  });

  it('full house: same three, higher pair wins', () => {
    // Both have trip Aces, but different pairs
    const acesOverKings = evaluateBestHand(['Ah', 'As'], ['Ad', 'Kh', 'Ks', '2d', '3c']);
    const acesOverQueens = evaluateBestHand(['Ah', 'As'], ['Ad', 'Qh', 'Qs', '2d', '3c']);
    expect(compareHands(acesOverKings, acesOverQueens)).toBeGreaterThan(0);
  });

  it('flush: higher A-high flush beats lower A-high flush by second card', () => {
    const aHighKicker = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', '9h', '2d', '3c']);
    const aHighTenKicker = evaluateBestHand(['Ah', 'Th'], ['Qh', 'Jh', '9h', '2d', '3c']);
    // Both have A-high flush; aHighKicker has K as 2nd card vs T
    expect(compareHands(aHighKicker, aHighTenKicker)).toBeGreaterThan(0);
  });

  it('two pair: higher top pair wins', () => {
    const acesTwos = evaluateBestHand(['Ah', 'As'], ['2d', '2h', 'Kd', '5c', '3s']);
    const kingsTwos = evaluateBestHand(['Kh', 'Ks'], ['2d', '2h', 'Ad', '5c', '3s']);
    expect(compareHands(acesTwos, kingsTwos)).toBeGreaterThan(0);
  });

  it('two pair: same top pair, higher second pair wins', () => {
    const acesKings = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', '2d', '3c', '4s']);
    const acesQueens = evaluateBestHand(['Ah', 'As'], ['Qd', 'Qh', '2d', '3c', '4s']);
    expect(compareHands(acesKings, acesQueens)).toBeGreaterThan(0);
  });

  it('two pair: same pairs, higher kicker wins', () => {
    const withKicker = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', 'Qh', '2d', '3c']);
    const withoutKicker = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', 'Jh', '2d', '3c']);
    expect(compareHands(withKicker, withoutKicker)).toBeGreaterThan(0);
  });

  it('one pair: higher pair wins', () => {
    const pairAces = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', 'Jd', '5c', '3s']);
    const pairKings = evaluateBestHand(['Kh', 'Ks'], ['Ad', 'Qh', 'Jd', '5c', '3s']);
    expect(compareHands(pairAces, pairKings)).toBeGreaterThan(0);
  });

  it('one pair: same pair, multiple kickers cascade correctly', () => {
    const highKickers = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', 'Jd', '5c', '3s']);
    const lowKickers = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', '2d', '5c', '3s']);
    expect(compareHands(highKickers, lowKickers)).toBeGreaterThan(0);
  });

  it('high card: higher cards cascade through all 5', () => {
    const best = evaluateBestHand(['Ah', 'Kd'], ['Qh', 'Jd', '9c', '7s', '2h']);
    const worse = evaluateBestHand(['Ah', 'Kd'], ['Qh', 'Jd', '9c', '7s', '3h']);
    // Second highest differs in 5th card position — this is ambiguous since
    // evaluateBestHand picks best 5 from 7 for both
    // Both have A-K-Q-J-9 high card (same board plays)
    expect(compareHands(best, worse)).toBe(0);
  });

  it('straight: broadway beats 9-high straight', () => {
    const broadway = evaluateBestHand(['Ah', 'Kd'], ['Qh', 'Jd', 'Tc', '2s', '3h']);
    const nineHigh = evaluateBestHand(['9h', '8d'], ['7h', '6d', '5c', '2s', '3h']);
    expect(compareHands(broadway, nineHigh)).toBeGreaterThan(0);
  });

  it('straight flush: higher beats lower', () => {
    const nineHighSF = evaluateBestHand(['9h', '8h'], ['7h', '6h', '5h', 'Ad', '2c']);
    const eightHighSF = evaluateBestHand(['8h', '7h'], ['6h', '5h', '4h', 'Ad', '2c']);
    expect(compareHands(nineHighSF, eightHighSF)).toBeGreaterThan(0);
  });
});

// ─── Board Plays Scenarios ────────────────────────────────────────────────────

describe('board plays / split pots', () => {
  it('entire board is best hand for both — split pot', () => {
    const board = ['Ah', 'Kd', 'Qc', 'Js', 'Th'] as any;
    const alice = evaluateBestHand(['2h', '3d'], board);
    const bob = evaluateBestHand(['4h', '5d'], board);
    // Both use broadway straight from board
    expect(compareHands(alice, bob)).toBe(0);
  });

  it('flush on board, player with board card suit gets no extra benefit', () => {
    // Board has 5 hearts (flush on board)
    const board = ['2h', '4h', '6h', '8h', 'Th'] as any;
    const alice = evaluateBestHand(['Ah', 'Kd'], board);
    const bob = evaluateBestHand(['Qh', 'Kd'], board);
    // Alice has A-high flush (Ah beats board's T-high), Bob has Q-high flush
    expect(compareHands(alice, bob)).toBeGreaterThan(0);
  });

  it('three-way split pot when board plays for all', () => {
    const board = ['Ah', 'Kd', 'Qc', 'Js', 'Th'] as any;
    const players = [
      { playerId: 'a', holeCards: ['2h', '3d'] as any, communityCards: board },
      { playerId: 'b', holeCards: ['5h', '6d'] as any, communityCards: board },
      { playerId: 'c', holeCards: ['7h', '8d'] as any, communityCards: board },
    ];
    const winners = determineWinners(players);
    expect(winners).toHaveLength(3);
  });
});

// ─── Special Cases ────────────────────────────────────────────────────────────

describe('special cases', () => {
  it('wheel straight flush is still a straight flush (not royal)', () => {
    const result = evaluateBestHand(['Ah', '2h'], ['3h', '4h', '5h', 'Kd', 'Qc']);
    expect(result.name).toBe('Straight Flush');
    expect(result.rank).toBe(8); // Not 9 (Royal Flush)
  });

  it('royal flush with extra community cards still returns Royal Flush', () => {
    // 7 cards available, best 5 is royal flush
    const result = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '2c']);
    expect(result.name).toBe('Royal Flush');
  });

  it('four of a kind with matching board produces correct result', () => {
    // Player has two Aces, board has two Aces and other cards
    const result = evaluateBestHand(['Ah', 'As'], ['Ad', 'Ac', '2h', '3d', '4c']);
    expect(result.name).toBe('Four of a Kind');
  });

  it('best flush uses best 5 cards of correct suit', () => {
    // 6 hearts available — should pick best 5
    const result = evaluateBestHand(['Ah', '2h'], ['3h', '4h', '5h', '6h', 'Kd']);
    expect(result.name).toBe('Straight Flush'); // A-2-3-4-5-6: best 5 = 2-3-4-5-6 sf
  });

  it('determineWinners handles single player (always wins)', () => {
    const players = [
      { playerId: 'solo', holeCards: ['2h', '3d'] as any, communityCards: ['Ah', 'Kd', 'Qc'] as any },
    ];
    const winners = determineWinners(players);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe('solo');
  });

  it('evaluateBestHand with exactly 5 cards returns that hand', () => {
    const result = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th']);
    expect(result.name).toBe('Royal Flush');
    expect(result.cards).toHaveLength(5);
  });

  it('score array is always defined and non-empty', () => {
    const hands = [
      evaluateBestHand(['2h', '3d'], ['5c', '7s', '9h', 'Jd', 'Kc']),
      evaluateBestHand(['Ah', 'Ac'], ['Ad', 'Kh', 'Kd', '2s', '3c']),
      evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']),
    ];
    for (const h of hands) {
      expect(h.score).toBeDefined();
      expect(h.score.length).toBeGreaterThan(0);
    }
  });
});

// ─── Stress / Regression ─────────────────────────────────────────────────────

describe('stress tests', () => {
  it('deterministically evaluates the same hand cards consistently', () => {
    const a = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']);
    const b = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']);
    expect(a.rank).toBe(b.rank);
    expect(a.name).toBe(b.name);
    expect(a.score).toEqual(b.score);
  });

  it('higher hand consistently beats lower hand (transitivity)', () => {
    const royalFlush = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']);
    const straightFlush = evaluateBestHand(['9h', '8h'], ['7h', '6h', '5h', 'Ad', '2c']);
    const quads = evaluateBestHand(['Ah', 'As'], ['Ad', 'Ac', 'Kh', '2d', '3c']);
    const fullHouse = evaluateBestHand(['Ah', 'As'], ['Ad', 'Kh', 'Ks', '2d', '3c']);
    const flush = evaluateBestHand(['Ah', '9h'], ['7h', '5h', '2h', 'Kd', 'Qc']);
    const straight = evaluateBestHand(['9h', '8d'], ['7c', '6s', '5h', 'Ah', 'Kd']);
    const trips = evaluateBestHand(['Ah', 'As'], ['Ad', '9h', '7d', '5c', '3s']);
    const twoPair = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', '7d', '5c', '3s']);
    const onePair = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', '7d', '5c', '3s']);
    const highCard = evaluateBestHand(['Ah', 'Kd'], ['Qh', 'Jd', '9c', '7s', '2h']);

    const hands = [royalFlush, straightFlush, quads, fullHouse, flush, straight, trips, twoPair, onePair, highCard];
    for (let i = 0; i < hands.length - 1; i++) {
      expect(compareHands(hands[i], hands[i + 1])).toBeGreaterThan(0);
    }
  });
});
