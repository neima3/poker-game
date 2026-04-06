import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { broadcastToTable } from '@/lib/supabase/broadcast';
import { getGameState, setGameState, withTableLock, ensureGameStateLoaded, persistGameState } from '@/lib/poker/game-store';
import { handleTimeout, sanitizeForSpectator } from '@/lib/poker/engine';
import { processBotTurns } from '@/lib/bots/bot-runner';
import { RECONNECT_GRACE_PERIOD_MS } from '@/types/poker';

const HEARTBEAT_TIMEOUT_MS = 15_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureGameStateLoaded(tableId);

  const { data: table } = await serviceClient
    .from('poker_tables')
    .select('reconnect_grace_seconds')
    .eq('id', tableId)
    .single();

  const graceSeconds = table?.reconnect_grace_seconds ?? 30;

  const { data: seats } = await serviceClient
    .from('poker_seats')
    .select('player_id, seat_number, last_heartbeat_at, is_connected, disconnected_at')
    .eq('table_id', tableId)
    .not('player_id', 'is', null);

  if (!seats || seats.length === 0) {
    return NextResponse.json({ success: true, changes: [] });
  }

  const now = Date.now();
  const changes: Array<{
    playerId: string;
    action: 'disconnected' | 'expired';
    seatNumber: number;
    graceRemaining?: number;
  }> = [];

  for (const seat of seats) {
    if (!seat.player_id) continue;

    const lastHeartbeat = seat.last_heartbeat_at 
      ? new Date(seat.last_heartbeat_at).getTime() 
      : now;
    const timeSinceHeartbeat = now - lastHeartbeat;

    if (seat.is_connected && timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      await serviceClient
        .from('poker_seats')
        .update({
          is_connected: false,
          disconnected_at: new Date(now).toISOString(),
        })
        .eq('table_id', tableId)
        .eq('player_id', seat.player_id);

      changes.push({
        playerId: seat.player_id,
        action: 'disconnected',
        seatNumber: seat.seat_number,
        graceRemaining: graceSeconds * 1000,
      });
    } else if (!seat.is_connected && seat.disconnected_at) {
      const disconnectedAt = new Date(seat.disconnected_at).getTime();
      const gracePeriodMs = graceSeconds * 1000;
      
      if (now - disconnectedAt > gracePeriodMs) {
        changes.push({
          playerId: seat.player_id,
          action: 'expired',
          seatNumber: seat.seat_number,
        });
      }
    }
  }

  if (changes.length === 0) {
    return NextResponse.json({ success: true, changes: [] });
  }

  const gameState = getGameState(tableId);
  const disconnectedPlayers = changes.filter(c => c.action === 'disconnected');
  const expiredPlayers = changes.filter(c => c.action === 'expired');

  // Broadcast player_disconnected events via REST API
  if (disconnectedPlayers.length > 0) {
    await broadcastToTable(tableId, disconnectedPlayers.map(change => ({
      event: 'player_disconnected',
      payload: { playerId: change.playerId, disconnectedAt: now, graceRemaining: change.graceRemaining } as Record<string, unknown>,
    })));
  }

  if (expiredPlayers.length > 0 && gameState) {
    await withTableLock(tableId, async () => {
      let newState = gameState;

      for (const expired of expiredPlayers) {
        const player = newState.players.find(p => p.playerId === expired.playerId);
        if (player && !player.isFolded && !player.isAllIn && newState.activeSeat === player.seatNumber) {
          newState = handleTimeout(newState);
          newState = processBotTurns(newState);
        }
      }

      setGameState(tableId, newState);
      await persistGameState(tableId);

      await broadcastToTable(tableId, [
        { event: 'game_state', payload: { state: sanitizeForSpectator(newState) } as Record<string, unknown> },
      ]);

      await serviceClient
        .from('poker_seats')
        .update({ is_sitting_out: true })
        .in('player_id', expiredPlayers.map(e => e.playerId));
    });
  }

  return NextResponse.json({ success: true, changes });
}
