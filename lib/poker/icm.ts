/**
 * ICM (Independent Chip Model) Calculator
 * Uses the Malmuth-Harville model for tournament equity calculation.
 */

export type ICMPressure = 'red' | 'yellow' | 'green';

/**
 * Calculate ICM equity using the Malmuth-Harville model.
 * Each player's probability of finishing in each position is derived from
 * their chip proportion relative to the remaining field.
 *
 * @param stacks - Chip stacks for each player (parallel arrays)
 * @param payoutFractions - Payout fractions (must sum ≤ 1), e.g. [0.5, 0.3, 0.2]
 * @returns Array of equity fractions (parallel to stacks)
 */
export function calculateICMEquity(stacks: number[], payoutFractions: number[]): number[] {
  const n = stacks.length;
  const equities = new Array(n).fill(0);
  const p = Math.min(payoutFractions.length, n);

  function recurse(remaining: number[], payoutIdx: number, probability: number): void {
    if (payoutIdx >= p) return;
    const totalRemaining = remaining.reduce((a, b) => a + b, 0);
    if (totalRemaining === 0) return;

    for (let i = 0; i < n; i++) {
      if (remaining[i] === 0) continue;
      const winProb = remaining[i] / totalRemaining;
      equities[i] += probability * winProb * payoutFractions[payoutIdx];

      const newRemaining = [...remaining];
      newRemaining[i] = 0;
      recurse(newRemaining, payoutIdx + 1, probability * winProb);
    }
  }

  recurse([...stacks], 0, 1);
  return equities;
}

/**
 * Calculate Harrington's M-ratio.
 * M = stack / (SB + BB + ante × numActivePlayers)
 */
export function calcMRatio(
  stack: number,
  smallBlind: number,
  bigBlind: number,
  ante: number,
  numPlayers: number,
): number {
  const orbCost = smallBlind + bigBlind + ante * numPlayers;
  if (orbCost === 0) return 999;
  return stack / orbCost;
}

/**
 * Get ICM pressure zone from M-ratio.
 * red < 5 · yellow 5–15 · green ≥ 15
 */
export function getMPressure(mRatio: number): ICMPressure {
  if (mRatio < 5) return 'red';
  if (mRatio < 15) return 'yellow';
  return 'green';
}

/**
 * Get a push/fold suggestion from BB count.
 */
export function getPushFoldSuggestion(bbCount: number): string {
  if (bbCount < 5) return 'Emergency shove any two cards';
  if (bbCount < 10) return 'Push/fold only — shove or fold';
  if (bbCount < 15) return 'Short stack — push strong hands';
  if (bbCount < 25) return 'Mid stack — pick spots to steal';
  return 'Deep — play normal poker';
}

export interface ICMPlayerResult {
  playerId: string;
  username: string;
  stack: number;
  equity: number;        // fraction 0-1
  equityPct: number;     // percent 0-100
  equityAmount: number;  // chips equivalent in prize pool
  bbCount: number;
  mRatio: number;
  pressure: ICMPressure;
  suggestion: string;
  bubbleFactor?: number; // how much more painful a loss is vs a win
}

/**
 * Calculate bubble factor for a player in a specific matchup.
 *
 * Bubble factor = (equity_loss_if_bust) / (equity_gain_if_double)
 *
 * A factor > 1 means busting hurts more than doubling helps.
 * Near the bubble, this can reach 2-4x for short/medium stacks.
 *
 * @param stacks - All active stacks (index 0 = hero)
 * @param payoutFractions - Payout fractions (must sum ≤ 1)
 * @param heroIdx - Index of the player we're calculating for (default 0)
 * @param villainIdx - Index of the opponent in the matchup (default 1)
 */
export function calculateBubbleFactor(
  stacks: number[],
  payoutFractions: number[],
  heroIdx = 0,
  villainIdx = 1,
): number {
  if (stacks.length < 2) return 1;

  const equities = calculateICMEquity(stacks, payoutFractions);
  const currentEquity = equities[heroIdx];

  // Simulate hero doubling through villain
  const stacksIfWin = [...stacks];
  stacksIfWin[heroIdx] = stacks[heroIdx] + stacks[villainIdx];
  stacksIfWin[villainIdx] = 0;
  const equitiesIfWin = calculateICMEquity(stacksIfWin, payoutFractions);
  const equityGain = equitiesIfWin[heroIdx] - currentEquity;

  // Simulate hero busting to villain
  const stacksIfLose = [...stacks];
  stacksIfLose[villainIdx] = stacks[villainIdx] + stacks[heroIdx];
  stacksIfLose[heroIdx] = 0;
  const equitiesIfLose = calculateICMEquity(stacksIfLose, payoutFractions);
  const equityLoss = currentEquity - equitiesIfLose[heroIdx];

  if (equityGain <= 0) return 999; // pathological — bust is pure loss
  return Math.round((equityLoss / equityGain) * 100) / 100;
}

/**
 * Derive the bubble distance for a tournament:
 * how many players must bust before the money.
 *
 * @param playersRemaining - How many players are still alive
 * @param paidPlaces - How many places get paid
 */
export function getBubbleDistance(playersRemaining: number, paidPlaces: number): number {
  return Math.max(0, playersRemaining - paidPlaces);
}

/**
 * Get a human-readable bubble context label.
 */
export function getBubbleLabel(playersRemaining: number, paidPlaces: number): string {
  const dist = getBubbleDistance(playersRemaining, paidPlaces);
  if (dist === 0) return 'In the money';
  if (dist === 1) return 'On the bubble!';
  if (dist <= 3) return `${dist} from the money`;
  return `${dist} away from money`;
}
