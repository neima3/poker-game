import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { handleTimeout, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState, setGameState, withTableLock } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';

// POST /api/tables/[id]/timeout — auto-fold when player's timer expires
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return withTableLock(tableId, async () => {
    const gameState = getGameState(tableId);
    if (!gameState) {
      return NextResponse.json({ error: 'No active game' }, { status: 400 });
    }

    // Verify the timer has actually expired (with 2s grace period for network latency)
    if (gameState.actionDeadline && Date.now() < gameState.actionDeadline - 2000) {
      return NextResponse.json({ error: 'Timer has not expired yet' }, { status: 400 });
    }

    // Find the active player who timed out
    const activePlayer = gameState.players.find(p => p.seatNumber === gameState.activeSeat);
    if (!activePlayer) {
      return NextResponse.json({ error: 'No active player' }, { status: 400 });
    }

    // Only allow timeout if the active player is NOT a bot (bots act instantly)
    if (activePlayer.isBot) {
      return NextResponse.json({ error: 'Cannot timeout a bot' }, { status: 400 });
    }

    // Apply auto-fold
    let newState = handleTimeout(gameState);

    // Process any bot turns that follow
    newState = processBotTurns(newState);

    setGameState(tableId, newState);

    // If hand is over, update DB stacks
    if (newState.phase === 'pot_awarded') {
      const winnerIds = new Set((newState.winners ?? []).map(w => w.playerId));

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
      ).catch(() => {});

      if (newState.winners && newState.winners.length > 0) {
        const humanPlayerIds = newState.players
          .filter(p => !p.isBot)
          .map(p => p.playerId);

        const replayData = {
          players: newState.players.map(p => ({
            playerId: p.playerId,
            username: p.username,
            seatNumber: p.seatNumber,
            startingStack: p.stack + p.totalInPot - (newState.winners?.find(w => w.playerId === p.playerId)?.amount ?? 0),
            holeCards: !p.isFolded ? p.cards : undefined,
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

    // Broadcast new state
    const channel = supabase.channel(`table:${tableId}`);
    await channel.subscribe();

    await channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: { state: sanitizeForSpectator(newState) },
    });

    for (const p of newState.players) {
      if (!p.cards || p.cards.length === 0 || p.isBot) continue;
      await channel.send({
        type: 'broadcast',
        event: `private_cards:${p.playerId}`,
        payload: { cards: p.cards },
      });
    }

    await supabase.removeChannel(channel);

    return NextResponse.json({
      success: true,
      state: sanitizeForPlayer(newState, user.id),
    });
  });
}
