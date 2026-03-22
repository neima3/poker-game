import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createPokerTable, listActivePokerTables } from '@/lib/supabase/poker-tables';

// GET /api/tables — list all active tables
export async function GET() {
  const supabase = await createClient();
  const { tables, error } = await listActivePokerTables(supabase);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tables });
}

// POST /api/tables — create a new table
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, table_size, small_blind, big_blind, min_buy_in, max_buy_in, ante, ante_type, straddle_type } = body;

  // Validation
  if (!name || !table_size || !small_blind || !big_blind || !min_buy_in || !max_buy_in) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (![2, 6, 9].includes(table_size)) {
    return NextResponse.json({ error: 'Invalid table size' }, { status: 400 });
  }
  const resolvedAnteType = ['none', 'table', 'big_blind'].includes(ante_type) ? ante_type : 'none';
  const resolvedStraddleType = ['none', 'utg', 'button'].includes(straddle_type) ? straddle_type : 'none';
  const { table, error } = await createPokerTable(supabase, {
    name,
    table_size,
    small_blind,
    big_blind,
    min_buy_in,
    max_buy_in,
    created_by: user.id,
    ante,
    ante_type: resolvedAnteType,
    straddle_type: resolvedStraddleType,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!table) {
    return NextResponse.json({ error: 'Failed to create table' }, { status: 500 });
  }

  // Create empty seats
  const seats = Array.from({ length: table_size }, (_, i) => ({
    table_id: table.id,
    seat_number: i + 1,
    player_id: null,
    stack: 0,
    is_sitting_out: false,
  }));

  const seatsClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceClient()
    : supabase;
  const { error: seatsError } = await seatsClient
    .from('poker_seats')
    .insert(seats);

  if (seatsError) {
    await supabase.from('poker_tables').delete().eq('id', table.id);
    return NextResponse.json({ error: `Failed to initialize table seats: ${seatsError.message}` }, { status: 500 });
  }

  return NextResponse.json({ table }, { status: 201 });
}
