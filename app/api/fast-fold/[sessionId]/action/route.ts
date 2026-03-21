import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyAction, sanitizeForPlayer } from '@/lib/poker/engine';
import { getGameState, setGameState, deleteGameState } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import {
  getFastFoldSession,
  updateFastFoldSession,
  dealFastFoldHand,
  deleteFastFoldSession,
  POSITION_NAMES,
} from '@/lib/poker/fast-fold';
import type { ActionType } from '@/types/poker';

/** Broadcast a new hand to all subscribed clients via Supabase Realtime. */
async function broadcastNewHand(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  sessionId: string,
  gameState: object,
) {
  const sessionAfterDeal = getFastFoldSession(sessionId);
  const positionName = sessionAfterDeal
    ? POSITION_NAMES[(sessionAfterDeal.positionIndex + POSITION_NAMES.length - 1) % POSITION_NAMES.length]
    : undefined;
  try {
    const channel = supabase.channel(`fast_fold:${sessionId}`);
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'new_hand',
      payload: { gameState, session: sessionAfterDeal, positionName },
    });
    await supabase.removeChannel(channel);
  } catch {
    // Non-fatal: client will receive game state in the HTTP response anyway
  }
}

/** Return chips to player's account and clean up session. */
async function cashOutSession(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userId: string,
  tableId: string,
  sessionId: string,
  chipsToReturn: number,
) {
  if (chipsToReturn > 0) {
    const { data: profile } = await supabase
      .from('poker_profiles')
      .select('chips')
      .eq('id', userId)
      .single();
    if (profile) {
      await supabase
        .from('poker_profiles')
        .update({ chips: profile.chips + chipsToReturn })
        .eq('id', userId);
    }
  }
  deleteGameState(tableId);
  deleteFastFoldSession(sessionId);
}

// POST /api/fast-fold/[sessionId]/action — submit action in fast fold
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = getFastFoldSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.playerId !== user.id) return NextResponse.json({ error: 'Not your session' }, { status: 403 });

  const body = await req.json();
  const { action, amount }: { action: ActionType; amount?: number } = body;
  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  if ((action === 'bet' || action === 'raise') && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'Bet/raise amount must be a positive number' }, { status: 400 });
  }

  const tableId = `ff_table_${sessionId}`;
  const gameState = getGameState(tableId);
  if (!gameState) return NextResponse.json({ error: 'No active hand' }, { status: 400 });

  const player = gameState.players.find(p => p.playerId === user.id);
  if (!player) return NextResponse.json({ error: 'Not in this hand' }, { status: 400 });
  if (player.seatNumber !== gameState.activeSeat) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  let newState;
  try {
    newState = applyAction(gameState, user.id, { type: action, amount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  newState = processBotTurns(newState);
  setGameState(tableId, newState);

  // ─── Fast Fold: instant new hand on fold ─────────────────────────────────────
  // When the player folds, skip waiting for the current hand to finish and
  // immediately deal a fresh hand at a new virtual table.
  const playerInNewState = newState.players.find(p => p.playerId === user.id);
  let instantNewHand = false;
  let newHandState = null;
  // Capture stats before potential deletion
  let endedStats: { handsPlayed: number; handsWon: number; profit: number; peakStack: number; duration: number } | null = null;

  if (action === 'fold' || playerInNewState?.isFolded) {
    // player.stack is the stack AFTER the engine already deducted posted blinds/bets —
    // so it is the correct remaining stack when the player folds.
    const stackAfterFold = player.stack;

    updateFastFoldSession(sessionId, {
      stack: stackAfterFold,
      peakStack: Math.max(session.peakStack, stackAfterFold),
    });

    const updatedSession = getFastFoldSession(sessionId);

    if (updatedSession && updatedSession.stack > updatedSession.bigBlind * 2) {
      // Player still has chips — deal the next hand immediately
      const freshState = dealFastFoldHand(updatedSession);
      setGameState(tableId, freshState);
      newHandState = sanitizeForPlayer(freshState, user.id);
      instantNewHand = true;
      await broadcastNewHand(supabase, sessionId, newHandState);
    } else {
      // Stack is too low to continue — end the session and cash out what's left
      const finalSession = updatedSession ?? session;
      endedStats = {
        handsPlayed: finalSession.handsPlayed,
        handsWon: finalSession.handsWon,
        profit: finalSession.stack - finalSession.startStack,
        peakStack: finalSession.peakStack,
        duration: Date.now() - finalSession.startedAt,
      };
      await cashOutSession(supabase, user.id, tableId, sessionId, finalSession.stack);
    }
  }

  // ─── Normal hand completion (pot_awarded) ────────────────────────────────────
  if (newState.phase === 'pot_awarded') {
    const updatedPlayer = newState.players.find(p => p.playerId === user.id);
    const newStack = updatedPlayer?.stack ?? 0;
    const didWin = (newState.winners ?? []).some(w => w.playerId === user.id);

    updateFastFoldSession(sessionId, {
      stack: newStack,
      handsWon: session.handsWon + (didWin ? 1 : 0),
      peakStack: Math.max(session.peakStack, newStack),
    });

    if (newStack > session.bigBlind * 2) {
      // Enough chips — auto-deal next hand
      const updatedSession = getFastFoldSession(sessionId);
      if (updatedSession) {
        updatedSession.stack = newStack;
        const freshState = dealFastFoldHand(updatedSession);
        setGameState(tableId, freshState);
        newHandState = sanitizeForPlayer(freshState, user.id);
        instantNewHand = true;
        await broadcastNewHand(supabase, sessionId, newHandState);
      }
    } else {
      // Busted at showdown — cash out and end session
      const finalSession = getFastFoldSession(sessionId) ?? session;
      endedStats = {
        handsPlayed: finalSession.handsPlayed,
        handsWon: session.handsWon + (didWin ? 1 : 0),
        profit: newStack - session.startStack,
        peakStack: Math.max(session.peakStack, newStack),
        duration: Date.now() - session.startedAt,
      };
      await cashOutSession(supabase, user.id, tableId, sessionId, newStack);
    }
  }

  const sessionEnded = !getFastFoldSession(sessionId);

  return NextResponse.json({
    success: true,
    gameState: instantNewHand && newHandState
      ? newHandState
      : sanitizeForPlayer(newState, user.id),
    instantNewHand,
    session: getFastFoldSession(sessionId) ?? session,
    sessionEnded,
    // Populated only when session ends — lets the client show the stats screen
    sessionStats: sessionEnded ? endedStats : undefined,
  });
}
