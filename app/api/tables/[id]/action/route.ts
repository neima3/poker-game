import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { broadcastToTable } from '@/lib/supabase/broadcast';
import { applyAction, sanitizeForPlayer, sanitizeForSpectator, InvalidRaiseError } from '@/lib/poker/engine';
import {
  getGameState,
  setGameState,
  withTableLock,
  isPlayerInFlight,
  markPlayerInFlight,
  clearPlayerInFlight,
  ensureGameStateLoaded,
  persistGameState,
} from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import type { ActionType } from '@/types/poker';

// POST /api/tables/[id]/action — player submits an action
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, amount }: { action: ActionType; amount?: number } = body;

  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  // Validate amount for bet/raise actions
  if ((action === 'bet' || action === 'raise') && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'Bet/raise amount must be a positive number' }, { status: 400 });
  }

  // Warm the in-memory cache from DB in case this is a cold-start instance
  await ensureGameStateLoaded(tableId);

  // Detect duplicate concurrent requests from this player before queuing.
  // Two simultaneous submissions of the same action → 409 with current state.
  if (isPlayerInFlight(tableId, user.id)) {
    const currentState = getGameState(tableId);
    return NextResponse.json(
      {
        error: 'Conflict: an action from this player is already being processed',
        state: currentState ? sanitizeForPlayer(currentState, user.id) : null,
      },
      { status: 409 }
    );
  }

  markPlayerInFlight(tableId, user.id);

  try {
    return await withTableLock(tableId, async () => {
      const gameState = getGameState(tableId);
      if (!gameState) {
        return NextResponse.json({ error: 'No active game' }, { status: 400 });
      }

      // Validate it's this player's turn
      const player = gameState.players.find(p => p.playerId === user.id);
      if (!player) {
        return NextResponse.json({ error: 'Not seated at this table' }, { status: 400 });
      }
      if (player.seatNumber !== gameState.activeSeat) {
        return NextResponse.json(
          {
            error: 'Not your turn',
            state: sanitizeForPlayer(gameState, user.id),
          },
          { status: 400 }
        );
      }

      // Apply the human player's action
      let newState;
      try {
        newState = applyAction(gameState, user.id, { type: action, amount });
      } catch (err: any) {
        if (err instanceof InvalidRaiseError) {
          return NextResponse.json(
            { error: err.message, minimumRaiseAmount: err.minimumRaiseAmount },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: err.message }, { status: 400 });
      }

      // Immediately process any bot turns that follow
      newState = processBotTurns(newState);

      setGameState(tableId, newState);
      await persistGameState(tableId);

      // If hand is over, update DB stacks and player stats
      if (newState.phase === 'pot_awarded') {
        const winnerIds = new Set((newState.winners ?? []).map(w => w.playerId));

        // Update stacks for human players only (bots don't have DB records)
        await Promise.all(
          newState.players
            .filter(p => !p.isBot)
            .map(p =>
              supabase
                .from('poker_seats')
                .update({ stack: p.stack })
                .eq('table_id', tableId)
                .eq('player_id', p.playerId)
            )
        );

        // Update player stats for humans (best-effort)
        Promise.all(
          newState.players
            .filter(p => !p.isSittingOut && !p.isBot)
            .map(p =>
              supabase.rpc('increment_player_stats', {
                p_player_id: p.playerId,
                p_hands_played: 1,
                p_hands_won: winnerIds.has(p.playerId) ? 1 : 0,
                p_chips_won: winnerIds.has(p.playerId)
                  ? (newState.winners!.find(w => w.playerId === p.playerId)?.amount ?? 0)
                  : 0,
              })
            )
        ).catch(() => { /* RPC not yet deployed — skip silently */ });

        // Record hand in DB (only human participants matter for history)
        if (newState.winners && newState.winners.length > 0) {
          const humanPlayerIds = newState.players
            .filter(p => !p.isBot)
            .map(p => p.playerId);

          // Build replay data for hand replay viewer
          const replayData = {
            players: newState.players.map(p => ({
              playerId: p.playerId,
              username: p.username,
              seatNumber: p.seatNumber,
              startingStack: p.stack + p.totalInPot - (newState.winners?.find(w => w.playerId === p.playerId)?.amount ?? 0),
              holeCards: (!p.isFolded || p.playerId === user.id) ? p.cards : undefined,
              isBot: p.isBot,
            })),
            actionLog: newState.actionLog ?? [],
            communityCards: newState.communityCards,
            pot: newState.pot,
            winners: newState.winners,
            smallBlind: newState.smallBlind,
            bigBlind: newState.bigBlind,
            dealerSeat: newState.dealerSeat,
            ritResult: newState.ritResult,
          };

          await supabase.from('poker_hands').insert({
            table_id: tableId,
            community_cards: newState.communityCards,
            pot_size: newState.pot,
            winners: newState.winners,
            player_ids: humanPlayerIds,
            replay_data: replayData,
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
          });
        }
      }

      // Broadcast new state via REST API (no WebSocket connection needed)
      const privateMsgs = newState.players
        .filter(p => p.cards && p.cards.length > 0 && !p.isBot)
        .map(p => ({ event: `private_cards:${p.playerId}`, payload: { cards: p.cards } as Record<string, unknown> }));
      await broadcastToTable(tableId, [
        { event: 'game_state', payload: { state: sanitizeForSpectator(newState) } as Record<string, unknown> },
        ...privateMsgs,
      ]);

      return NextResponse.json({
        success: true,
        state: sanitizeForPlayer(newState, user.id),
      });
    });
  } finally {
    clearPlayerInFlight(tableId, user.id);
  }
}
