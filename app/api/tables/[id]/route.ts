import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState as getStoreState, ensureGameStateLoaded } from '@/lib/poker/game-store';
import { getPokerTableById } from '@/lib/supabase/poker-tables';

// GET /api/tables/[id] — get table details + current game state
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { table, error } = await getPokerTableById(supabase, id);

  if (error || !table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const { data: seats } = await supabase
    .from('poker_seats')
    .select(`
      id, seat_number, player_id, stack, is_sitting_out,
      poker_profiles(username, avatar_url)
    `)
    .eq('table_id', id)
    .order('seat_number');

  await ensureGameStateLoaded(id);
  const gameState = getStoreState(id);

  let publicState = null;
  if (gameState) {
    if (user) {
      publicState = sanitizeForPlayer(gameState, user.id);
    } else {
      publicState = sanitizeForSpectator(gameState);
    }
  }

  return NextResponse.json({ table, seats, gameState: publicState });
}
