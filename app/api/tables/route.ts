import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/tables — list all active tables
export async function GET() {
  const supabase = await createClient();

  const { data: tables, error } = await supabase
    .from('poker_tables')
    .select(`
      id, name, table_size, small_blind, big_blind,
      min_buy_in, max_buy_in, is_active, current_players, created_at,
      poker_seats(count)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

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
  const { name, table_size, small_blind, big_blind, min_buy_in, max_buy_in } = body;

  // Validation
  if (!name || !table_size || !small_blind || !big_blind || !min_buy_in || !max_buy_in) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (![2, 6, 9].includes(table_size)) {
    return NextResponse.json({ error: 'Invalid table size' }, { status: 400 });
  }

  const { data: table, error } = await supabase
    .from('poker_tables')
    .insert({
      name,
      table_size,
      small_blind,
      big_blind,
      min_buy_in,
      max_buy_in,
      is_active: true,
      current_players: 0,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create empty seats
  const seats = Array.from({ length: table_size }, (_, i) => ({
    table_id: table.id,
    seat_number: i + 1,
    player_id: null,
    stack: 0,
    is_sitting_out: false,
  }));

  await supabase.from('poker_seats').insert(seats);

  return NextResponse.json({ table }, { status: 201 });
}
