import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { broadcastToTable } from '@/lib/supabase/broadcast';
import { RECONNECT_GRACE_PERIOD_MS } from '@/types/poker';

export const HEARTBEAT_INTERVAL_MS = 5_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();
  const serviceClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceClient()
    : supabase;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: seat } = await supabase
    .from('poker_seats')
    .select('player_id, is_connected, disconnected_at')
    .eq('table_id', tableId)
    .eq('player_id', user.id)
    .single();

  if (!seat) {
    return NextResponse.json({ error: 'Not seated at this table' }, { status: 400 });
  }

  const wasDisconnected = !seat.is_connected;
  const now = Date.now();

  await serviceClient
    .from('poker_seats')
    .update({ 
      is_connected: true, 
      disconnected_at: null,
      last_heartbeat_at: new Date(now).toISOString()
    })
    .eq('table_id', tableId)
    .eq('player_id', user.id);

  if (wasDisconnected) {
    await broadcastToTable(tableId, [
      { event: 'player_reconnected', payload: { playerId: user.id } },
    ]);
  }

  return NextResponse.json({ 
    success: true, 
    wasReconnected: wasDisconnected,
    gracePeriodMs: RECONNECT_GRACE_PERIOD_MS 
  });
}
