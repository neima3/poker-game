/**
 * Custom Payout Structure Store
 *
 * Allows admins to override the default payout percentages for any tournament
 * preset. Overrides are kept in memory; they layer on top of the built-in
 * TOURNAMENT_PRESETS / MTT_PRESETS without mutating them.
 */

// Keyed by tournament config id, e.g. "sng-6", "mtt-18"
const payoutOverrides = new Map<string, number[]>();

/**
 * Built-in default payouts (mirrors the engine presets).
 * Kept here so the admin UI can display them even without overrides.
 */
export const DEFAULT_PAYOUTS: Record<string, { name: string; payout: number[] }> = {
  'sng-3':        { name: 'Turbo 3-Max',         payout: [65, 35] },
  'sng-6':        { name: 'Standard 6-Max',       payout: [50, 30, 20] },
  'sng-9':        { name: 'Full Ring 9-Max',       payout: [50, 30, 20] },
  'mtt-18':       { name: '18-Player Freezeout',  payout: [40, 25, 18, 12, 5] },
  'mtt-18-rebuy': { name: '18-Player Rebuy',      payout: [40, 25, 18, 12, 5] },
  'mtt-27':       { name: '27-Player Freezeout',  payout: [35, 22, 15, 10, 8, 5, 3, 2] },
  'mtt-45':       { name: '45-Player Freezeout',  payout: [30, 20, 14, 10, 7, 5, 4, 3, 3, 2, 2] },
};

export function getPayoutForConfig(configId: string): number[] {
  return payoutOverrides.get(configId) ?? DEFAULT_PAYOUTS[configId]?.payout ?? [];
}

export function setPayoutOverride(configId: string, payout: number[]): void {
  validatePayout(payout);
  payoutOverrides.set(configId, payout);
}

export function clearPayoutOverride(configId: string): void {
  payoutOverrides.delete(configId);
}

export function listPayoutStructures(): {
  id: string;
  name: string;
  payout: number[];
  isCustom: boolean;
}[] {
  return Object.entries(DEFAULT_PAYOUTS).map(([id, def]) => ({
    id,
    name: def.name,
    payout: payoutOverrides.get(id) ?? def.payout,
    isCustom: payoutOverrides.has(id),
  }));
}

/**
 * Validate that a payout array is well-formed:
 * - At least 1 paid place
 * - All values > 0
 * - Sum equals 100 (within 0.1 rounding tolerance)
 */
export function validatePayout(payout: number[]): void {
  if (!Array.isArray(payout) || payout.length === 0) {
    throw new Error('Payout structure must have at least one place');
  }
  for (const pct of payout) {
    if (typeof pct !== 'number' || pct <= 0) {
      throw new Error('Each payout percentage must be a positive number');
    }
  }
  const sum = payout.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.1) {
    throw new Error(`Payout percentages must sum to 100 (got ${sum.toFixed(1)})`);
  }
}
