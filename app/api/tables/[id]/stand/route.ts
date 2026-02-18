import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasActiveGame } from '@/lib/poker/game-store';

// POST /api/tables/[id]/stand — leave a table and cash out
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (hasActiveGame(tableId)) {
    return NextResponse.json({ error: 'Cannot stand up during an active hand' }, { status: 400 });
  }

  const { data: seat } = await supabase
    .from('poker_seats')
    .select('*')
    .eq('table_id', tableId)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!seat) return NextResponse.json({ error: 'Not seated at this table' }, { status: 400 });

  // Return chips to player's balance
  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('chips')
    .eq('id', user.id)
    .single();

  if (profile) {
    await supabase
      .from('poker_profiles')
      .update({ chips: profile.chips + seat.stack })
      .eq('id', user.id);
  }

  // Clear the seat
  await supabase
    .from('poker_seats')
    .update({ player_id: null, stack: 0 })
    .eq('id', seat.id);

  // Update player count
  const { count } = await supabase
    .from('poker_seats')
    .select('*', { count: 'exact', head: true })
    .eq('table_id', tableId)
    .not('player_id', 'is', null);

  await supabase
    .from('poker_tables')
    .update({ current_players: count ?? 0 })
    .eq('id', tableId);

  return NextResponse.json({ success: true, chips_returned: seat.stack });
}
