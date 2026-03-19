'use client';

import { useRef, useState, useEffect } from 'react';
import type { GameState, ActionLogEntry } from '@/types/poker';

export interface PlayerHudStats {
  handsPlayed: number;
  vpip: number;        // Voluntarily Put $ In Pot %
  pfr: number;         // Pre-Flop Raise %
  threeBet: number;    // 3-bet %
  af: number;          // Aggression Factor (bets+raises / calls)
  foldToCbet: number;  // Fold to Continuation Bet % on flop
}

interface HandAccumulator {
  handsPlayed: number;
  vpipCount: number;
  pfrCount: number;
  threeBetCount: number;
  threeBetOpps: number;
  aggressiveActions: number; // bets + raises
  callCount: number;
  foldToCbetCount: number;
  cbetFaced: number;
}

function emptyAccum(): HandAccumulator {
  return {
    handsPlayed: 0,
    vpipCount: 0,
    pfrCount: 0,
    threeBetCount: 0,
    threeBetOpps: 0,
    aggressiveActions: 0,
    callCount: 0,
    foldToCbetCount: 0,
    cbetFaced: 0,
  };
}

function computeStats(acc: HandAccumulator): PlayerHudStats {
  const { handsPlayed } = acc;
  if (handsPlayed === 0) {
    return { handsPlayed: 0, vpip: 0, pfr: 0, threeBet: 0, af: 0, foldToCbet: 0 };
  }
  return {
    handsPlayed,
    vpip: Math.round((acc.vpipCount / handsPlayed) * 100),
    pfr: Math.round((acc.pfrCount / handsPlayed) * 100),
    threeBet: acc.threeBetOpps > 0
      ? Math.round((acc.threeBetCount / acc.threeBetOpps) * 100)
      : 0,
    af: acc.callCount > 0
      ? parseFloat((acc.aggressiveActions / acc.callCount).toFixed(1))
      : acc.aggressiveActions > 0 ? 99 : 0,
    foldToCbet: acc.cbetFaced > 0
      ? Math.round((acc.foldToCbetCount / acc.cbetFaced) * 100)
      : 0,
  };
}

/**
 * Processes a completed hand's action log to update per-player accumulators.
 * VPIP = voluntarily put money in preflop (call/bet/raise/all-in, not blinds)
 * PFR  = raised preflop (bet/raise/all-in from non-blind position)
 * 3bet = re-raised after an open raise preflop
 * AF   = (bets + raises) / calls (all streets)
 * FoldToCbet = folded on flop when opponent had bet (cbet spot)
 */
function processHandLog(
  actionLog: ActionLogEntry[],
  accums: Map<string, HandAccumulator>,
  playerIds: string[],
) {
  // Ensure all players at this hand have an accumulator
  for (const pid of playerIds) {
    if (!accums.has(pid)) accums.set(pid, emptyAccum());
  }

  // Per-player per-hand flags (reset each hand)
  const didVpip = new Set<string>();
  const didPfr = new Set<string>();

  // 3bet tracking: count raises seen in preflop
  let preflopRaiseCount = 0;
  const did3bet = new Set<string>();
  const had3betOpp = new Set<string>(); // faced a raise and had opportunity to re-raise

  // Cbet tracking: detect flop continuation bet
  // A cbet = aggressor from preflop bets on flop first
  let preflopAggressor: string | null = null;
  let flopFirstBetter: string | null = null;

  const preflopEntries = actionLog.filter(e => e.phase === 'preflop');
  const flopEntries = actionLog.filter(e => e.phase === 'flop');

  // Find preflop aggressor (last raiser preflop)
  for (const entry of preflopEntries) {
    if (entry.action === 'bet' || entry.action === 'raise' || entry.action === 'all-in') {
      preflopAggressor = entry.playerId;
    }
  }

  // Find first bettor on flop
  for (const entry of flopEntries) {
    if (entry.action === 'bet' || entry.action === 'raise') {
      flopFirstBetter = entry.playerId;
      break;
    }
  }

  const isCbet = flopFirstBetter !== null && flopFirstBetter === preflopAggressor;

  // Process preflop actions
  for (const entry of preflopEntries) {
    const { playerId, action } = entry;

    // VPIP: voluntary money in preflop
    if (action === 'call' || action === 'bet' || action === 'raise' || action === 'all-in') {
      didVpip.add(playerId);
    }

    // PFR: raised preflop
    if (action === 'bet' || action === 'raise' || action === 'all-in') {
      didPfr.add(playerId);
    }

    // 3bet: track raise count; if there's already a raise and someone re-raises
    if (action === 'raise' || action === 'all-in') {
      if (preflopRaiseCount >= 1) {
        // This is a re-raise
        did3bet.add(playerId);
      }
      preflopRaiseCount++;
    }
  }

  // Determine 3bet opportunities: players who faced at least one raise and acted after
  {
    let sawRaise = false;
    for (const entry of preflopEntries) {
      const { playerId, action } = entry;
      if (sawRaise && !did3bet.has(playerId)) {
        // Player acted after seeing a raise — they had a 3bet opportunity
        had3betOpp.add(playerId);
      }
      if (action === 'raise' || action === 'all-in') {
        sawRaise = true;
      }
    }
  }

  // Update per-player aggregates for all participating players
  for (const pid of playerIds) {
    const acc = accums.get(pid)!;
    acc.handsPlayed++;

    if (didVpip.has(pid)) acc.vpipCount++;
    if (didPfr.has(pid)) acc.pfrCount++;
    if (did3bet.has(pid)) acc.threeBetCount++;
    if (had3betOpp.has(pid) || did3bet.has(pid)) acc.threeBetOpps++;
  }

  // Aggression factor and fold-to-cbet (all streets)
  for (const entry of actionLog) {
    const acc = accums.get(entry.playerId);
    if (!acc) continue;

    if (entry.action === 'bet' || entry.action === 'raise') {
      acc.aggressiveActions++;
    } else if (entry.action === 'call') {
      acc.callCount++;
    }
  }

  // Fold to cbet: players who folded on flop after cbet was made
  if (isCbet && flopFirstBetter) {
    const cbetter = flopFirstBetter;
    for (const entry of flopEntries) {
      if (entry.playerId === cbetter) continue; // skip the cbetter themselves
      const acc = accums.get(entry.playerId);
      if (!acc) continue;
      // This player faced a cbet
      acc.cbetFaced++;
      if (entry.action === 'fold') {
        acc.foldToCbetCount++;
      }
    }
  }
}

/**
 * useHudStats — accumulates in-session HUD statistics per player.
 * Stats are computed client-side from completed hand action logs.
 * Returns a map from playerId → PlayerHudStats.
 * Does NOT track cross-session data (privacy).
 */
export function useHudStats(
  gameState: Omit<GameState, 'deck'> | null,
  selfPlayerId?: string,
): Map<string, PlayerHudStats> {
  // Persistent accumulator across hands
  const accumsRef = useRef<Map<string, HandAccumulator>>(new Map());
  // Tracks which handIds we've already processed
  const processedHandsRef = useRef<Set<string>>(new Set());

  const [statsMap, setStatsMap] = useState<Map<string, PlayerHudStats>>(new Map());

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== 'pot_awarded') return;
    if (!gameState.actionLog || gameState.actionLog.length === 0) return;

    // Use handId if available, else fall back to pot+winner fingerprint
    const handKey = gameState.handId
      ?? `${gameState.pot}-${(gameState.winners ?? []).map(w => w.playerId).sort().join(',')}`;

    if (processedHandsRef.current.has(handKey)) return;
    processedHandsRef.current.add(handKey);

    const playerIds = gameState.players
      .filter(p => !p.isSittingOut)
      .map(p => p.playerId);

    processHandLog(gameState.actionLog, accumsRef.current, playerIds);

    // Rebuild stats map (excluding self)
    const next = new Map<string, PlayerHudStats>();
    for (const [pid, acc] of accumsRef.current.entries()) {
      if (pid === selfPlayerId) continue; // don't show HUD for yourself
      next.set(pid, computeStats(acc));
    }
    setStatsMap(next);
  }, [gameState?.phase, gameState?.handId, selfPlayerId]);

  return statsMap;
}
