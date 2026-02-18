import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/tables/[id]/seats — fetch current seated players
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: seats, error } = await supabase
    .from('poker_seats')
    .select(`
      id, table_id, seat_number, player_id, stack, is_sitting_out, joined_at,
      poker_profiles(username, avatar_url)
    `)
    .eq('table_id', tableId)
    .order('seat_number');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seats: seats ?? [] });
}
