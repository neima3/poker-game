import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyAction, sanitizeForPlayer } from '@/lib/poker/engine';
import { getGameState, setGameState } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import { getFastFoldSession, updateFastFoldSession, dealFastFoldHand, deleteFastFoldSession, POSITION_NAMES } from '@/lib/poker/fast-fold';
import type { ActionType } from '@/types/poker';

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

  // Fast Fold magic: if the player folded, immediately deal a new hand
  const playerInNewState = newState.players.find(p => p.playerId === user.id);
  let instantNewHand = false;
  let newHandState = null;

  if (action === 'fold' || (playerInNewState?.isFolded)) {
    // Update session stack (player already lost their bets from this hand)
    updateFastFoldSession(sessionId, {
      stack: player.stack - (player.currentBet || 0),
    });

    // Get fresh session to deal new hand
    const updatedSession = getFastFoldSession(sessionId);
    if (updatedSession && updatedSession.stack > updatedSession.bigBlind * 2) {
      const freshState = dealFastFoldHand(updatedSession);
      setGameState(`ff_table_${sessionId}`, freshState);
      newHandState = sanitizeForPlayer(freshState, user.id);
      instantNewHand = true;

      // Broadcast new hand via Supabase Realtime so subscribed clients update instantly
      const channel = supabase.channel(`fast_fold:${sessionId}`);
      await channel.subscribe();
      const sessionAfterDeal = getFastFoldSession(sessionId);
      const positionName = sessionAfterDeal
        ? POSITION_NAMES[(sessionAfterDeal.positionIndex + POSITION_NAMES.length - 1) % POSITION_NAMES.length]
        : undefined;
      await channel.send({
        type: 'broadcast',
        event: 'new_hand',
        payload: {
          gameState: newHandState,
          session: sessionAfterDeal,
          positionName,
        },
      });
      await supabase.removeChannel(channel);
    }
  }

  // If hand completed normally (pot_awarded), update session and deal new hand
  if (newState.phase === 'pot_awarded') {
    const updatedPlayer = newState.players.find(p => p.playerId === user.id);
    const newStack = updatedPlayer?.stack ?? 0;
    const didWin = (newState.winners ?? []).some(w => w.playerId === user.id);

    updateFastFoldSession(sessionId, {
      stack: newStack,
      handsWon: session.handsWon + (didWin ? 1 : 0),
      peakStack: Math.max(session.peakStack, newStack),
    });

    // Auto-deal next hand if player has enough chips
    if (newStack > session.bigBlind * 2) {
      const updatedSession = getFastFoldSession(sessionId);
      if (updatedSession) {
        updatedSession.stack = newStack;
        const freshState = dealFastFoldHand(updatedSession);
        setGameState(`ff_table_${sessionId}`, freshState);
        newHandState = sanitizeForPlayer(freshState, user.id);
        instantNewHand = true;

        // Broadcast next hand via Supabase Realtime
        const channel = supabase.channel(`fast_fold:${sessionId}`);
        await channel.subscribe();
        const sessionAfterDeal = getFastFoldSession(sessionId);
        const positionName = sessionAfterDeal
          ? POSITION_NAMES[(sessionAfterDeal.positionIndex + POSITION_NAMES.length - 1) % POSITION_NAMES.length]
          : undefined;
        await channel.send({
          type: 'broadcast',
          event: 'new_hand',
          payload: {
            gameState: newHandState,
            session: sessionAfterDeal,
            positionName,
          },
        });
        await supabase.removeChannel(channel);
      }
    } else {
      // Session over — cash out
      await supabase
        .from('poker_profiles')
        .select('chips')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('poker_profiles')
              .update({ chips: data.chips + newStack })
              .eq('id', user.id);
          }
        });
      deleteFastFoldSession(sessionId);
    }
  }

  return NextResponse.json({
    success: true,
    gameState: instantNewHand && newHandState
      ? newHandState
      : sanitizeForPlayer(newState, user.id),
    instantNewHand,
    session: getFastFoldSession(sessionId) ?? session,
    sessionEnded: !getFastFoldSession(sessionId),
  });
}
