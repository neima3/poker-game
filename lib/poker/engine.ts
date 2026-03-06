/**
 * Poker Game Engine - Pure functions for managing game state
 * Server-side only. Never expose deck or hole cards to wrong players.
 */
import type { GameState, GamePhase, PlayerState, PlayerAction, SidePot, Winner, HandResult } from '@/types/poker';
import { createDeck, shuffle, deal } from './deck';
import { evaluateBestHand, compareHands, determineWinners } from './evaluator';

export const ACTION_TIMEOUT_MS = 30_000;

// ─── Seat Helpers ─────────────────────────────────────────────────────────────

export function getActivePlayers(state: GameState): PlayerState[] {
  return state.players.filter(p => !p.isFolded && !p.isSittingOut);
}

export function getActiveNonAllIn(state: GameState): PlayerState[] {
  return state.players.filter(p => !p.isFolded && !p.isSittingOut && !p.isAllIn);
}

function nextActiveSeat(state: GameState, fromSeat: number): number {
  const sorted = state.players
    .filter(p => !p.isFolded && !p.isSittingOut)
    .map(p => p.seatNumber)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return fromSeat;
  const next = sorted.find(s => s > fromSeat);
  return next ?? sorted[0];
}

function seatAfter(seats: number[], fromSeat: number): number {
  const sorted = [...seats].sort((a, b) => a - b);
  const next = sorted.find(s => s > fromSeat);
  return next ?? sorted[0];
}

// ─── Game Init ────────────────────────────────────────────────────────────────

export function initGame(
  tableId: string,
  players: Omit<PlayerState, 'currentBet' | 'totalInPot' | 'cards' | 'isFolded' | 'isAllIn' | 'lastAction'>[],
  smallBlind: number,
  bigBlind: number,
  currentDealerSeat?: number,
): GameState {
  const allSeats = players.map(p => p.seatNumber);
  const dealerSeat = currentDealerSeat !== undefined
    ? seatAfter(allSeats, currentDealerSeat)
    : allSeats[0];

  // In heads-up (2 players), the dealer/button IS the small blind and acts first preflop.
  // In multi-player, the SB is the seat immediately after the dealer.
  const isHeadsUp = allSeats.length === 2;
  const sbSeat = isHeadsUp ? dealerSeat : seatAfter(allSeats, dealerSeat);
  const bbSeat = seatAfter(allSeats, sbSeat);
  // Preflop: HU → button/SB acts first; multi-player → UTG (seat after BB) acts first
  const firstActSeat = isHeadsUp ? dealerSeat : seatAfter(allSeats, bbSeat);

  const deck = shuffle(createDeck());

  const initPlayers: PlayerState[] = players.map(p => ({
    ...p,
    currentBet: 0,
    totalInPot: 0,
    cards: [],
    isFolded: false,
    isAllIn: false,
    lastAction: undefined,
    hasActedThisStreet: false,
  }));

  return {
    tableId,
    phase: 'starting',
    pot: 0,
    sidePots: [],
    communityCards: [],
    currentBet: bigBlind,
    minRaise: bigBlind,
    smallBlind,
    bigBlind,
    dealerSeat,
    activeSeat: firstActSeat,
    smallBlindSeat: sbSeat,
    bigBlindSeat: bbSeat,
    players: initPlayers,
    deck,
    actionDeadline: Date.now() + ACTION_TIMEOUT_MS,
  };
}

// ─── Deal Hole Cards ──────────────────────────────────────────────────────────

export function dealHoleCards(state: GameState): GameState {
  let deck = [...state.deck];
  const players = state.players.map(p => {
    if (p.isSittingOut) return p;
    const { cards, remaining } = deal(deck, 2);
    deck = remaining;
    return { ...p, cards };
  });

  // Post blinds
  const sbSeat = state.smallBlindSeat;
  const bbSeat = state.bigBlindSeat;
  const smallBlind = state.smallBlind;
  const bigBlind = state.bigBlind;

  const withBlinds = players.map(p => {
    if (p.seatNumber === sbSeat) {
      const amount = Math.min(p.stack, smallBlind);
      return {
        ...p,
        stack: p.stack - amount,
        currentBet: amount,
        totalInPot: amount,
        isAllIn: amount === p.stack && p.stack > 0,
      };
    }
    if (p.seatNumber === bbSeat) {
      const amount = Math.min(p.stack, bigBlind);
      return { ...p, stack: p.stack - amount, currentBet: amount, totalInPot: amount, isAllIn: amount === p.stack && p.stack > 0 };
    }
    return p;
  });

  const pot = withBlinds.reduce((sum, p) => sum + p.currentBet, 0);

  return {
    ...state,
    phase: 'preflop',
    players: withBlinds,
    deck,
    pot,
  };
}

// ─── Player Action ────────────────────────────────────────────────────────────

export function applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
  const playerIdx = state.players.findIndex(p => p.playerId === playerId);
  if (playerIdx === -1) throw new Error('Player not found');

  const player = state.players[playerIdx];
  if (player.seatNumber !== state.activeSeat) throw new Error('Not your turn');
  if (player.isFolded) throw new Error('Already folded');

  let newPlayers = [...state.players];
  let pot = state.pot;
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;

  const callAmount = Math.max(0, currentBet - player.currentBet);

  switch (action.type) {
    case 'fold': {
      newPlayers[playerIdx] = { ...player, isFolded: true, lastAction: 'fold' };
      break;
    }
    case 'check': {
      if (callAmount > 0) throw new Error('Cannot check — there is a bet to call');
      newPlayers[playerIdx] = { ...player, lastAction: 'check' };
      break;
    }
    case 'call': {
      const paid = Math.min(player.stack, callAmount);
      const isAllIn = paid >= player.stack;
      newPlayers[playerIdx] = {
        ...player,
        stack: player.stack - paid,
        currentBet: player.currentBet + paid,
        totalInPot: player.totalInPot + paid,
        isAllIn,
        lastAction: isAllIn ? 'all-in' : 'call',
      };
      pot += paid;
      break;
    }
    case 'bet':
    case 'raise': {
      const amount = action.amount ?? 0;
      const totalBet = player.currentBet + amount; // What player will have bet in total
      if (totalBet < currentBet + minRaise && amount < player.stack) {
        throw new Error(`Minimum raise is ${minRaise}`);
      }
      const actualPaid = Math.min(player.stack, amount);
      const isAllIn = actualPaid >= player.stack;
      const prevCurrentBet = currentBet;
      currentBet = player.currentBet + actualPaid;
      minRaise = Math.max(minRaise, currentBet - prevCurrentBet);

      newPlayers[playerIdx] = {
        ...player,
        stack: player.stack - actualPaid,
        currentBet,
        totalInPot: player.totalInPot + actualPaid,
        isAllIn,
        lastAction: isAllIn ? 'all-in' : action.type,
      };
      pot += actualPaid;
      break;
    }
    case 'all-in': {
      const allIn = player.stack;
      const newTotal = player.currentBet + allIn;
      if (newTotal > currentBet) {
        minRaise = Math.max(minRaise, newTotal - currentBet);
        currentBet = newTotal;
      }
      newPlayers[playerIdx] = {
        ...player,
        stack: 0,
        currentBet: newTotal,
        totalInPot: player.totalInPot + allIn,
        isAllIn: true,
        lastAction: 'all-in',
      };
      pot += allIn;
      break;
    }
  }

  // Mark acting player as having acted this street
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], hasActedThisStreet: true };

  // Determine next active seat
  const newState: GameState = {
    ...state,
    players: newPlayers,
    pot,
    currentBet,
    minRaise,
  };

  return advanceTurn(newState, player.seatNumber);
}

// ─── Turn Advancement ─────────────────────────────────────────────────────────

function isRoundComplete(state: GameState): boolean {
  const active = state.players.filter(p => !p.isFolded && !p.isSittingOut);

  // Only one player left
  if (active.length === 1) return true;

  // All active non-all-in players must have acted this street AND matched the current bet
  const needsToAct = active.filter(
    p => !p.isAllIn && (!p.hasActedThisStreet || p.currentBet < state.currentBet)
  );
  return needsToAct.length === 0;
}

export function advanceTurn(state: GameState, lastActedSeat: number): GameState {
  if (isRoundComplete(state)) {
    return runoutIfAllIn(advancePhase(state));
  }

  // Find next player who needs to act
  const active = state.players
    .filter(p => !p.isFolded && !p.isSittingOut && !p.isAllIn)
    .map(p => p.seatNumber)
    .sort((a, b) => a - b);

  if (active.length === 0) {
    return runoutIfAllIn(advancePhase(state));
  }

  const nextSeat = seatAfter(active, lastActedSeat);
  return {
    ...state,
    activeSeat: nextSeat,
    actionDeadline: Date.now() + ACTION_TIMEOUT_MS,
  };
}

/**
 * If all active players are all-in (no one can bet), auto-advance through
 * remaining streets until showdown or pot_awarded.
 */
function runoutIfAllIn(state: GameState): GameState {
  // Already terminal — nothing to do
  if (state.phase === 'pot_awarded' || state.phase === 'showdown') return state;

  const canAct = state.players.filter(p => !p.isFolded && !p.isSittingOut && !p.isAllIn);
  if (canAct.length >= 1) return state; // Someone can still act — normal flow

  // Everyone is all-in (or only one player with action remaining): run the board
  let s = state;
  let safetyLimit = 0;
  while (s.phase !== 'pot_awarded' && s.phase !== 'showdown' && safetyLimit++ < 5) {
    const next = advancePhase(s);
    if (next === s) break; // No change — prevent infinite loop
    s = next;
  }
  return s;
}

function advancePhase(state: GameState): GameState {
  const phaseOrder: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const currentIdx = phaseOrder.indexOf(state.phase as GamePhase);
  const streetMinRaise = state.bigBlind ?? state.minRaise;

  // Check if only one player remains (everyone else folded)
  const active = state.players.filter(p => !p.isFolded && !p.isSittingOut);
  if (active.length === 1) {
    return awardPot(state, undefined, [active[0].playerId]);
  }

  // Reset bets for new round
  const resetPlayers = state.players.map(p => ({ ...p, currentBet: 0, hasActedThisStreet: false }));

  if (state.phase === 'preflop') {
    const { cards: flop, remaining } = deal(state.deck, 3);
    const firstSeat = firstToActSeat(state);
    return {
      ...state,
      phase: 'flop',
      communityCards: flop,
      deck: remaining,
      players: resetPlayers,
      currentBet: 0,
      minRaise: streetMinRaise,
      activeSeat: firstSeat,
      actionDeadline: Date.now() + ACTION_TIMEOUT_MS,
    };
  }

  if (state.phase === 'flop') {
    const { cards: [turn], remaining } = deal(state.deck, 1);
    const firstSeat = firstToActSeat(state);
    return {
      ...state,
      phase: 'turn',
      communityCards: [...state.communityCards, turn],
      deck: remaining,
      players: resetPlayers,
      currentBet: 0,
      minRaise: streetMinRaise,
      activeSeat: firstSeat,
      actionDeadline: Date.now() + ACTION_TIMEOUT_MS,
    };
  }

  if (state.phase === 'turn') {
    const { cards: [river], remaining } = deal(state.deck, 1);
    const firstSeat = firstToActSeat(state);
    return {
      ...state,
      phase: 'river',
      communityCards: [...state.communityCards, river],
      deck: remaining,
      players: resetPlayers,
      currentBet: 0,
      minRaise: streetMinRaise,
      activeSeat: firstSeat,
      actionDeadline: Date.now() + ACTION_TIMEOUT_MS,
    };
  }

  if (state.phase === 'river') {
    return resolveShowdown(state);
  }

  return state;
}

function firstToActSeat(state: GameState): number {
  const active = state.players
    .filter(p => !p.isFolded && !p.isSittingOut && !p.isAllIn)
    .map(p => p.seatNumber)
    .sort((a, b) => a - b);

  if (active.length === 0) return state.dealerSeat;

  // In heads-up, the dealer/SB acts first post-flop
  const isHeadsUp = state.players.filter(p => !p.isSittingOut).length === 2;
  if (isHeadsUp) {
    // Dealer is SB in heads-up — they act first post-flop
    return active.includes(state.dealerSeat) ? state.dealerSeat : active[0];
  }

  // Multi-way: first active seat after dealer (SB position)
  const after = active.find(s => s > state.dealerSeat);
  return after ?? active[0];
}

// ─── Showdown & Pot Award ─────────────────────────────────────────────────────

function resolveShowdown(state: GameState): GameState {
  const activePlayers = state.players.filter(p => !p.isFolded && !p.isSittingOut);

  // Evaluate each active player's best hand
  const playerHands = activePlayers.map(p => ({
    playerId: p.playerId,
    hand: evaluateBestHand(p.cards ?? [], state.communityCards),
  }));

  const showdownState: GameState = {
    ...state,
    phase: 'showdown',
  };

  return awardPot(showdownState, playerHands);
}

function awardPot(
  state: GameState,
  playerHands?: { playerId: string; hand: HandResult }[],
  singleWinnerIds?: string[],
): GameState {
  // Calculate side pots based on all-in amounts
  const sidePots = calculateSidePots(state);
  const winnerMap = new Map<string, number>();

  // Track which players won which pots (for the winners[] summary)
  const potWinners = new Map<string, { hand: HandResult }>();

  for (const pot of sidePots) {
    let potWinnerIds: string[];

    if (singleWinnerIds) {
      // Direct winner override (fold case — no showdown needed)
      potWinnerIds = singleWinnerIds.filter(id => pot.eligiblePlayers.includes(id));
    } else if (playerHands) {
      // Determine best hand among eligible players for THIS pot
      const eligibleHands = playerHands.filter(h => pot.eligiblePlayers.includes(h.playerId));
      if (eligibleHands.length === 0) continue;

      eligibleHands.sort((a, b) => compareHands(b.hand, a.hand));
      const bestScore = eligibleHands[0].hand.score;
      const potWinnersForPot = eligibleHands.filter(
        h => compareHands(h.hand, { ...h.hand, score: bestScore }) === 0
      );
      potWinnerIds = potWinnersForPot.map(h => h.playerId);

      // Track hand details for summary
      for (const w of potWinnersForPot) {
        if (!potWinners.has(w.playerId)) {
          potWinners.set(w.playerId, { hand: w.hand });
        }
      }
    } else {
      continue;
    }

    if (potWinnerIds.length === 0) continue;
    const share = Math.floor(pot.amount / potWinnerIds.length);
    const remainder = pot.amount - share * potWinnerIds.length;

    for (const id of potWinnerIds) {
      winnerMap.set(id, (winnerMap.get(id) || 0) + share);
    }
    // Give remainder chips to first winner (standard casino practice)
    if (remainder > 0) {
      winnerMap.set(potWinnerIds[0], (winnerMap.get(potWinnerIds[0]) || 0) + remainder);
    }
  }

  const newPlayers = state.players.map(p => {
    const winnings = winnerMap.get(p.playerId) || 0;
    return { ...p, stack: p.stack + winnings };
  });

  const winners: Winner[] = [...winnerMap.entries()].map(([playerId, amount]) => {
    const player = state.players.find(p => p.playerId === playerId);
    const handInfo = potWinners.get(playerId);
    return {
      playerId,
      username: player?.username ?? '',
      amount,
      handName: handInfo?.hand.name,
      cards: handInfo?.hand.cards,
    };
  });

  return {
    ...state,
    phase: 'pot_awarded',
    players: newPlayers,
    winners,
  };
}

function calculateSidePots(state: GameState): SidePot[] {
  // Only players who put chips in are relevant
  const contributors = state.players
    .filter(p => !p.isSittingOut && p.totalInPot > 0)
    .sort((a, b) => a.totalInPot - b.totalInPot);

  if (contributors.length === 0) {
    return [{ amount: state.pot, eligiblePlayers: [] }];
  }

  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (let i = 0; i < contributors.length; i++) {
    const level = contributors[i].totalInPot;
    if (level <= previousLevel) continue;

    const increment = level - previousLevel;
    // All contributors at or above this level contributed to this side pot
    const eligible = contributors.slice(i);
    const potAmount = increment * (i + eligible.length); // players below already counted

    // Actually: all contributors that have totalInPot >= level can win this pot
    const eligibleAll = contributors.filter(p => p.totalInPot >= level && !p.isFolded);

    pots.push({
      amount: increment * contributors.length - increment * i,
      eligiblePlayers: eligibleAll.map(p => p.playerId),
    });

    previousLevel = level;
  }

  // Sanity-check: sum of side pots must equal total pot
  const total = pots.reduce((s, p) => s + p.amount, 0);
  if (total !== state.pot && pots.length > 0) {
    // Adjust last pot for any discrepancy (rounding/uncollected chips)
    pots[pots.length - 1].amount += state.pot - total;
  }

  return pots.length > 0 ? pots : [{ amount: state.pot, eligiblePlayers: contributors.map(p => p.playerId) }];
}

// ─── Auto-fold on timeout ─────────────────────────────────────────────────────

export function handleTimeout(state: GameState): GameState {
  const player = state.players.find(p => p.seatNumber === state.activeSeat);
  if (!player) return state;

  // Auto-check if possible (no bet to call), otherwise fold
  const callAmount = Math.max(0, state.currentBet - player.currentBet);
  const action = callAmount === 0 ? 'check' : 'fold';
  return applyAction(state, player.playerId, { type: action as any });
}

// ─── Sanitize state for client ────────────────────────────────────────────────

/** Remove deck and hide other players' hole cards */
export function sanitizeForPlayer(state: GameState, viewerPlayerId: string): Omit<GameState, 'deck'> {
  const { deck: _deck, ...rest } = state;

  const players = rest.players.map(p => {
    if (p.playerId === viewerPlayerId) return p;
    // Hide cards unless showdown
    if (rest.phase === 'showdown' || rest.phase === 'pot_awarded') return p;
    return { ...p, cards: p.cards?.map(() => '??') };
  });

  return { ...rest, players };
}

/** State visible to spectators - hide all hole cards */
export function sanitizeForSpectator(state: GameState): Omit<GameState, 'deck'> {
  const { deck: _deck, ...rest } = state;
  const players = rest.players.map(p => {
    if (rest.phase === 'showdown' || rest.phase === 'pot_awarded') return p;
    return { ...p, cards: undefined };
  });
  return { ...rest, players };
}
