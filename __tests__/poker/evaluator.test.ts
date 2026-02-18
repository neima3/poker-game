import { describe, it, expect } from 'vitest';
import { evaluateBestHand, compareHands, determineWinners } from '@/lib/poker/evaluator';

// ─── Hand Evaluation ──────────────────────────────────────────────────────────

describe('evaluateBestHand', () => {
  it('identifies Royal Flush', () => {
    const result = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3c']);
    expect(result.name).toBe('Royal Flush');
    expect(result.rank).toBe(9);
  });

  it('identifies Straight Flush', () => {
    const result = evaluateBestHand(['9h', '8h'], ['7h', '6h', '5h', 'Ad', '2c']);
    expect(result.name).toBe('Straight Flush');
    expect(result.rank).toBe(8);
  });

  it('identifies Wheel straight flush (A-2-3-4-5)', () => {
    const result = evaluateBestHand(['Ah', '2h'], ['3h', '4h', '5h', 'Kd', 'Qc']);
    expect(result.name).toBe('Straight Flush');
    expect(result.rank).toBe(8);
  });

  it('identifies Four of a Kind', () => {
    const result = evaluateBestHand(['Ah', 'As'], ['Ad', 'Ac', 'Kh', '2d', '3c']);
    expect(result.name).toBe('Four of a Kind');
    expect(result.rank).toBe(7);
  });

  it('identifies Full House', () => {
    const result = evaluateBestHand(['Ah', 'As'], ['Ad', 'Kh', 'Ks', '2d', '3c']);
    expect(result.name).toBe('Full House');
    expect(result.rank).toBe(6);
  });

  it('identifies Flush', () => {
    const result = evaluateBestHand(['Ah', '9h'], ['7h', '5h', '2h', 'Kd', 'Qc']);
    expect(result.name).toBe('Flush');
    expect(result.rank).toBe(5);
  });

  it('identifies Straight (normal)', () => {
    const result = evaluateBestHand(['9h', '8d'], ['7c', '6s', '5h', 'Ah', 'Kd']);
    expect(result.name).toBe('Straight');
    expect(result.rank).toBe(4);
  });

  it('identifies Wheel straight (A-2-3-4-5 as 5-high)', () => {
    const result = evaluateBestHand(['Ah', '2d'], ['3c', '4s', '5h', 'Kd', 'Qc']);
    expect(result.name).toBe('Straight');
    expect(result.rank).toBe(4);
  });

  it('identifies Three of a Kind', () => {
    const result = evaluateBestHand(['Ah', 'As'], ['Ad', '9h', '7d', '5c', '3s']);
    expect(result.name).toBe('Three of a Kind');
    expect(result.rank).toBe(3);
  });

  it('identifies Two Pair', () => {
    const result = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', '7d', '5c', '3s']);
    expect(result.name).toBe('Two Pair');
    expect(result.rank).toBe(2);
  });

  it('identifies One Pair', () => {
    const result = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', '7d', '5c', '3s']);
    expect(result.name).toBe('One Pair');
    expect(result.rank).toBe(1);
  });

  it('identifies High Card', () => {
    const result = evaluateBestHand(['Ah', 'Kd'], ['Qh', 'Jd', '9c', '7s', '2h']);
    expect(result.name).toBe('High Card');
    expect(result.rank).toBe(0);
  });

  it('picks best hand from 7 cards', () => {
    // Has both a pair of Aces (with board) and a flush opportunity — flush should win
    const result = evaluateBestHand(['Ah', 'Kh'], ['Qh', 'Jh', 'Th', '2d', '3d']);
    expect(result.name).toBe('Royal Flush');
  });

  it('handles fewer than 5 cards gracefully', () => {
    const result = evaluateBestHand(['Ah', 'Kd'], ['Qh']);
    expect(result.name).toBe('High Card');
    expect(result.rank).toBe(0);
  });
});

// ─── Hand Comparison ──────────────────────────────────────────────────────────

describe('compareHands', () => {
  it('flush beats straight', () => {
    const flush = evaluateBestHand(['Ah', '9h'], ['7h', '5h', '2h', 'Kd', '3c']);
    const straight = evaluateBestHand(['9h', '8d'], ['7c', '6s', '5h', 'Ah', 'Kd']);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  it('two pair loses to three of a kind', () => {
    const twoPair = evaluateBestHand(['Ah', 'As'], ['Kd', 'Kh', '7d', '5c', '3s']);
    const trips = evaluateBestHand(['Ah', 'As'], ['Ad', '9h', '7d', '5c', '3s']);
    expect(compareHands(twoPair, trips)).toBeLessThan(0);
  });

  it('higher kicker wins tie between same pair', () => {
    const pairAcesKicker = evaluateBestHand(['Ah', 'As'], ['Kd', 'Qh', 'Jd', '5c', '3s']);
    const pairAcesTenKicker = evaluateBestHand(['Ah', 'As'], ['Td', '9h', '8d', '5c', '3s']);
    expect(compareHands(pairAcesKicker, pairAcesTenKicker)).toBeGreaterThan(0);
  });

  it('returns 0 for identical hands (split pot)', () => {
    const a = evaluateBestHand(['2h', '3d'], ['Ah', 'Kd', 'Qc', 'Js', 'Th']);
    const b = evaluateBestHand(['5h', '6d'], ['Ah', 'Kd', 'Qc', 'Js', 'Th']);
    // Both use the broadway straight from board — tie
    expect(compareHands(a, b)).toBe(0);
  });

  it('wheel straight loses to 6-high straight', () => {
    const wheel = evaluateBestHand(['Ah', '2d'], ['3c', '4s', '5h', 'Kd', 'Qc']);
    const sixHigh = evaluateBestHand(['6h', '2d'], ['3c', '4s', '5h', 'Kd', 'Qc']);
    expect(compareHands(wheel, sixHigh)).toBeLessThan(0);
  });
});

// ─── Winner Determination ─────────────────────────────────────────────────────

describe('determineWinners', () => {
  it('finds single winner', () => {
    const players = [
      { playerId: 'alice', holeCards: ['Ah', 'As'] as any, communityCards: ['Kd', 'Qh', 'Jd', '5c', '3s'] as any },
      { playerId: 'bob', holeCards: ['2h', '3d'] as any, communityCards: ['Kd', 'Qh', 'Jd', '5c', '3s'] as any },
    ];
    const winners = determineWinners(players);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe('alice');
  });

  it('detects split pot (identical board plays)', () => {
    const community = ['Ah', 'Kd', 'Qc', 'Js', 'Th'] as any;
    const players = [
      { playerId: 'alice', holeCards: ['2h', '3d'] as any, communityCards: community },
      { playerId: 'bob', holeCards: ['4h', '5d'] as any, communityCards: community },
    ];
    // Both chop with broadway
    const winners = determineWinners(players);
    expect(winners).toHaveLength(2);
    expect(winners.map(w => w.playerId).sort()).toEqual(['alice', 'bob']);
  });

  it('handles three-way pot with clear winner', () => {
    const community = ['Kd', 'Qh', 'Jd', '5c', '3s'] as any;
    const players = [
      { playerId: 'alice', holeCards: ['Ah', 'As'] as any, communityCards: community },
      { playerId: 'bob', holeCards: ['2h', '4d'] as any, communityCards: community },
      { playerId: 'carol', holeCards: ['7h', '8d'] as any, communityCards: community },
    ];
    const winners = determineWinners(players);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe('alice');
  });

  it('includes hand details in winner result', () => {
    const players = [
      { playerId: 'alice', holeCards: ['Ah', 'As'] as any, communityCards: ['Kd', 'Qh', 'Jd', '5c', '3s'] as any },
    ];
    const winners = determineWinners(players);
    expect(winners[0].hand).toBeDefined();
    expect(winners[0].hand.name).toBe('One Pair');
  });
});
