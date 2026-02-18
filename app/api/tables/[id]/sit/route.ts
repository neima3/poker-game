import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/tables/[id]/sit — sit at a table
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { seat_number, buy_in } = body;

  if (!seat_number || !buy_in) {
    return NextResponse.json({ error: 'Missing seat_number or buy_in' }, { status: 400 });
  }

  // Get table info
  const { data: table } = await supabase
    .from('poker_tables')
    .select('*')
    .eq('id', tableId)
    .single();

  if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

  if (buy_in < table.min_buy_in || buy_in > table.max_buy_in) {
    return NextResponse.json(
      { error: `Buy-in must be between ${table.min_buy_in} and ${table.max_buy_in}` },
      { status: 400 }
    );
  }

  // Atomic chip deduction + seat assignment via DB transaction function.
  const { error: sitTxnError } = await supabase.rpc('poker_sit_player', {
    p_table_id: tableId,
    p_seat_number: seat_number,
    p_buy_in: buy_in,
  });

  if (sitTxnError) {
    const message = sitTxnError.message ?? 'Failed to sit at table';

    if (message.includes('Seat not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (
      message.includes('Insufficient chips') ||
      message.includes('Already seated') ||
      message.includes('Seat is taken')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

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

  return NextResponse.json({ success: true, seat_number, stack: buy_in });
}
