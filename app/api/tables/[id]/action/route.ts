import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyAction, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState, setGameState } from '@/lib/poker/game-store';
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
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  let newState;
  try {
    newState = applyAction(gameState, user.id, { type: action, amount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  setGameState(tableId, newState);

  // If hand is over, update DB stacks and player stats
  if (newState.phase === 'pot_awarded') {
    const winnerIds = new Set((newState.winners ?? []).map(w => w.playerId));

    // Update stacks (critical — must succeed)
    await Promise.all(
      newState.players.map(p =>
        supabase
          .from('poker_seats')
          .update({ stack: p.stack })
          .eq('table_id', tableId)
          .eq('player_id', p.playerId)
      )
    );

    // Update player stats (best-effort — don't block on failure)
    Promise.all(
      newState.players
        .filter(p => !p.isSittingOut)
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

    // Record hand in DB
    if (newState.winners && newState.winners.length > 0) {
      await supabase.from('poker_hands').insert({
        table_id: tableId,
        community_cards: newState.communityCards,
        pot_size: newState.pot,
        winners: newState.winners,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });
    }
  }

  // Broadcast new state via Supabase Realtime
  const channel = supabase.channel(`table:${tableId}`);
  await channel.subscribe();

  // Send sanitized state to all
  await channel.send({
    type: 'broadcast',
    event: 'game_state',
    payload: { state: sanitizeForSpectator(newState) },
  });

  // Re-send private cards on every action so players keep card visibility even
  // after reconnects/refreshes during an active hand.
  for (const p of newState.players) {
    if (!p.cards || p.cards.length === 0) continue;
    await channel.send({
      type: 'broadcast',
      event: `private_cards:${p.playerId}`,
      payload: { cards: p.cards },
    });
  }

  await supabase.removeChannel(channel);

  // Return state for the acting player
  return NextResponse.json({
    success: true,
    state: sanitizeForPlayer(newState, user.id),
  });
}
