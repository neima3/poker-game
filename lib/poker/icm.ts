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
}
