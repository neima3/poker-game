/**
 * Bot player strategy engine.
 * All logic is deterministic given the game state — bots see only their own hole cards.
 */

import type { GameState, PlayerAction, BotDifficulty } from '@/types/poker';
import { evaluateBestHand } from '../poker/evaluator';

// ─── Hand Strength ──────────────────────────────────────────────────────────

const RANK_ORDER = '23456789TJQKA';

function rankValue(card: string): number {
  return RANK_ORDER.indexOf(card[0]);
}

/** Estimate preflop hand strength 0–1 using high-card + connectivity */
function preflopStrength(cards: string[]): number {
  if (cards.length < 2) return 0.1;
  const r1 = rankValue(cards[0]);
  const r2 = rankValue(cards[1]);
  const suited = cards[0][1] === cards[1][1];
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const gap = hi - lo;

  // Pairs: 22 ≈ 0.42, AA ≈ 0.98
  if (r1 === r2) return 0.42 + (hi / 12) * 0.56;

  // Non-pair: base from high card + connectivity
  const base = (hi * 1.5 + lo * 0.5) / (12 * 2);
  const suitedBonus = suited ? 0.07 : 0;
  const connBonus = gap <= 1 ? 0.06 : gap <= 2 ? 0.03 : 0;
  const gapPenalty = Math.max(0, gap - 2) * 0.05;

  return Math.min(0.92, Math.max(0.04, base + suitedBonus + connBonus - gapPenalty));
}

/**
 * Convert the tiebreaker portion of a score array into a 0–1 value.
 * Treats each element as a base-13 digit (card ranks are 0–12).
 */
function normalizeIntraRank(tiebreakers: number[]): number {
  if (tiebreakers.length === 0) return 0.5;
  const BASE = 13; // card ranks 0–12
  let value = 0;
  let weight = 1;
  for (let i = tiebreakers.length - 1; i >= 0; i--) {
    value += tiebreakers[i] * weight;
    weight *= BASE;
  }
  const maxVal = Math.pow(BASE, tiebreakers.length) - 1;
  return maxVal === 0 ? 0.5 : value / maxVal;
}

/** Postflop strength: evaluate best made hand 0–1 with intra-rank granularity */
export function postflopStrength(cards: string[], community: string[]): number {
  if (community.length === 0) return preflopStrength(cards);
  try {
    const result = evaluateBestHand(cards, community);
    // rank 0=high card … 9=royal flush
    // Each rank occupies 1/9 of the 0–1 scale.
    // Use 80% of the band for intra-rank tiebreaker variation, leaving a 20% gap
    // before the next rank so stronger rank always beats a weaker rank.
    const RANK_MAX = 9;
    const bandWidth = 1 / RANK_MAX;
    const bandStart = result.rank / RANK_MAX;
    const intraRank = normalizeIntraRank(result.score.slice(1));
    return Math.min(0.99, bandStart + intraRank * bandWidth * 0.8);
  } catch {
    return preflopStrength(cards);
  }
}

// ─── Bot Decision ────────────────────────────────────────────────────────────

interface Thresholds {
  callMin: number;
  betMin: number;
  raiseMin: number;
  bluffRate: number;
  foldEquityFactor: number; // how much pot odds increase calling threshold
}

const THRESHOLDS: Record<BotDifficulty, Thresholds> = {
  fish: {
    callMin: 0.18,
    betMin: 0.62,
    raiseMin: 0.80,
    bluffRate: 0.08,
    foldEquityFactor: 0.3,
  },
  regular: {
    callMin: 0.30,
    betMin: 0.52,
    raiseMin: 0.70,
    bluffRate: 0.18,
    foldEquityFactor: 0.6,
  },
  shark: {
    callMin: 0.25,
    betMin: 0.44,
    raiseMin: 0.62,
    bluffRate: 0.26,
    foldEquityFactor: 0.85,
  },
  pro: {
    callMin: 0.22,
    betMin: 0.38,
    raiseMin: 0.55,
    bluffRate: 0.30,
    foldEquityFactor: 0.95,
  },
};

// ─── Position & Board Texture ───────────────────────────────────────────────

/** Get positional multiplier based on seat relative to dealer */
function getPositionMultiplier(
  seatNumber: number,
  dealerSeat: number,
  totalPlayers: number,
): number {
  // Calculate distance from dealer (0 = dealer, increasing = earlier position)
  const distance = ((seatNumber - dealerSeat + totalPlayers) % totalPlayers);
  const normalised = distance / totalPlayers; // 0 = dealer, ~1 = UTG

  // Late position (dealer, cutoff) gets a bonus; early position gets a penalty
  if (normalised <= 0.33) return 1.15; // late position (dealer, CO)
  if (normalised <= 0.60) return 1.0;  // middle position
  return 0.9;                           // early position (UTG, UTG+1)
}

/** Analyse board texture: returns wetness score 0–1 (0 = dry, 1 = very wet) */
function boardWetness(community: string[]): number {
  if (community.length < 3) return 0;
  let wetness = 0;

  // Check for flush draw potential (3+ of same suit)
  const suitCounts: Record<string, number> = {};
  for (const c of community) {
    const suit = c[1];
    suitCounts[suit] = (suitCounts[suit] || 0) + 1;
  }
  const maxSuit = Math.max(...Object.values(suitCounts));
  if (maxSuit >= 4) wetness += 0.5;
  else if (maxSuit >= 3) wetness += 0.3;

  // Check for straight draw potential (connected ranks)
  const ranks = community.map(c => rankValue(c)).sort((a, b) => a - b);
  const unique = [...new Set(ranks)];
  let maxConnected = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] - unique[i - 1] <= 2) {
      current++;
      maxConnected = Math.max(maxConnected, current);
    } else {
      current = 1;
    }
  }
  if (maxConnected >= 4) wetness += 0.4;
  else if (maxConnected >= 3) wetness += 0.2;

  return Math.min(1, wetness);
}

/** Choose a human-looking bet size */
function chooseBetSize(pot: number, stack: number, strength: number, minBet: number): number {
  const fraction = 0.35 + strength * 0.55; // 0.35–0.9 pot
  const raw = Math.floor(pot * fraction);
  return Math.min(stack, Math.max(minBet, raw));
}

/** Choose bet size with board texture awareness (for pro/shark) */
function chooseSmartBetSize(
  pot: number,
  stack: number,
  strength: number,
  minBet: number,
  wetness: number,
): number {
  // On wet boards, bet larger to deny equity; on dry boards, bet smaller for value
  const baseFraction = 0.35 + strength * 0.55;
  const textureMod = wetness * 0.2; // up to +0.2 pot on wet boards
  const fraction = Math.min(1.0, baseFraction + textureMod);
  const raw = Math.floor(pot * fraction);
  return Math.min(stack, Math.max(minBet, raw));
}

export function getBotAction(
  state: GameState,
  botPlayerId: string,
  difficulty: BotDifficulty,
): PlayerAction {
  const player = state.players.find(p => p.playerId === botPlayerId);
  if (!player || player.isFolded || player.isAllIn) return { type: 'check' };

  // All-In or Fold mode: simplified decision (fast_fold and bounty use standard logic)
  if (state.gameMode === 'allin_or_fold') {
    const cards = player.cards ?? [];
    const strength = postflopStrength(cards, state.communityCards);
    // Threshold varies by difficulty
    const aofThreshold: Record<BotDifficulty, number> = { fish: 0.25, regular: 0.35, shark: 0.30, pro: 0.28 };
    const noise = (Math.random() - 0.4) * 0.15;
    if (strength + noise >= aofThreshold[difficulty]) {
      return { type: 'all-in' };
    }
    return { type: 'fold' };
  }

  const cards = player.cards ?? [];
  const callAmount = Math.max(0, state.currentBet - player.currentBet);
  const canCheck = callAmount === 0;

  const t = THRESHOLDS[difficulty];
  const activePlayers = state.players.filter(p => !p.isFolded && !p.isSittingOut);
  const isPreflop = state.communityCards.length === 0;

  // Base strength
  let baseStrength = postflopStrength(cards, state.communityCards);

  // ─── Position awareness (shark & pro) ─────────────────────────────────────
  if (difficulty === 'shark' || difficulty === 'pro') {
    const posMult = getPositionMultiplier(player.seatNumber, state.dealerSeat, activePlayers.length);
    baseStrength = Math.min(0.99, baseStrength * posMult);
  }

  // ─── Board texture (shark & pro) ──────────────────────────────────────────
  const wetness = boardWetness(state.communityCards);
  if ((difficulty === 'shark' || difficulty === 'pro') && !isPreflop) {
    // On wet boards: boost strong made hands, penalise marginal ones
    if (baseStrength >= 0.5) {
      baseStrength = Math.min(0.99, baseStrength + wetness * 0.08);
    } else if (baseStrength < 0.35) {
      baseStrength = Math.max(0, baseStrength - wetness * 0.10);
    }
  }

  // ─── Pro: GTO-inspired preflop range tightening by position ───────────────
  if (difficulty === 'pro' && isPreflop) {
    const posMult = getPositionMultiplier(player.seatNumber, state.dealerSeat, activePlayers.length);
    if (posMult <= 0.9) {
      // Early position: only play premium hands (tighten range significantly)
      baseStrength = baseStrength * 0.85;
    } else if (posMult >= 1.15) {
      // Late position: widen range slightly
      baseStrength = Math.min(0.99, baseStrength * 1.08);
    }
  }

  // Noise by difficulty
  const noiseRange: Record<BotDifficulty, number> = { fish: 0.30, regular: 0.14, shark: 0.08, pro: 0.05 };
  const noise = (Math.random() - 0.35) * noiseRange[difficulty];
  const strength = Math.max(0, Math.min(1, baseStrength + noise));

  // Bluff decision
  let isBluffing: boolean;
  if (difficulty === 'pro') {
    // Pro: calculated bluff frequency based on pot odds for balance
    // Bluff more when pot odds are favourable (cheap to bluff) and less when expensive
    const potOddsForBluff = callAmount > 0 ? callAmount / (state.pot + callAmount) : 0.2;
    const adjustedBluffRate = t.bluffRate * (1 - potOddsForBluff * 0.5);
    isBluffing = Math.random() < adjustedBluffRate;
  } else {
    isBluffing = Math.random() < t.bluffRate;
  }
  const effectiveStrength = isBluffing ? Math.min(1, strength + 0.28) : strength;

  // Pot odds (fraction we must invest to call)
  const potOdds = callAmount > 0 ? callAmount / (state.pot + callAmount) : 0;

  // Use smart bet sizing for shark and pro
  const useSmartSizing = difficulty === 'shark' || difficulty === 'pro';

  if (canCheck) {
    // Check or bet
    if (effectiveStrength >= t.betMin && player.stack >= state.minRaise) {
      const betSize = useSmartSizing
        ? chooseSmartBetSize(state.pot, player.stack, effectiveStrength, state.minRaise, wetness)
        : chooseBetSize(state.pot, player.stack, effectiveStrength, state.minRaise);
      return { type: 'bet', amount: betSize };
    }
    return { type: 'check' };
  }

  // Must call or fold
  const adjustedCallMin = Math.max(0.05, t.callMin + potOdds * t.foldEquityFactor - 0.15);

  if (effectiveStrength < adjustedCallMin) {
    return { type: 'fold' };
  }

  // Consider raising
  if (effectiveStrength >= t.raiseMin && player.stack > callAmount + state.minRaise) {
    const raiseSize = useSmartSizing
      ? chooseSmartBetSize(state.pot, player.stack, effectiveStrength, callAmount + state.minRaise, wetness)
      : chooseBetSize(state.pot, player.stack, effectiveStrength, callAmount + state.minRaise);
    if (raiseSize >= player.stack) return { type: 'all-in' };
    return { type: 'raise', amount: raiseSize };
  }

  // All-in if call covers entire stack
  if (callAmount >= player.stack) return { type: 'all-in' };

  return { type: 'call' };
}

// ─── Bot Identity ────────────────────────────────────────────────────────────

const BOT_NAMES: Record<BotDifficulty, string[]> = {
  fish: ['Donky_Dave', 'FishFace', 'LuckyLarry', 'LooseGoose', 'CallMeKing', 'AllInAl', 'CrazyLeg'],
  regular: ['SteadyEddie', 'MidStackMo', 'PokerPete', 'SolidSam', 'TagPlayer', 'BookSmart'],
  shark: ['SharkBait', 'GTO_Ghost', 'Predator', 'ValueBetV', 'NitPicker', 'HuntingPot'],
  pro: ['Solver_X', 'RangeKing', 'BalancedBot', 'ICM_Master', 'NashEquil', 'PolarizedPro'],
};

export function getBotName(difficulty: BotDifficulty, seed: number): string {
  const names = BOT_NAMES[difficulty];
  return names[seed % names.length];
}

export function getBotId(tableId: string, seatNumber: number): string {
  return `bot_${tableId.slice(-8)}_seat${seatNumber}`;
}
