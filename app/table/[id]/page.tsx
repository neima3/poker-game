import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGameState } from '@/lib/poker/game-store';
import { sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { TableClient } from './TableClient';
import type { SeatRow } from '@/types/poker';

export const dynamic = 'force-dynamic';

export default async function TablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch table
  const { data: table } = await supabase
    .from('poker_tables')
    .select('*')
    .eq('id', id)
    .single();

  if (!table) notFound();

  // Fetch seats with player profiles
  const { data: rawSeats } = await supabase
    .from('poker_seats')
    .select(`
      id, table_id, seat_number, player_id, stack, is_sitting_out, joined_at,
      poker_profiles(username, avatar_url)
    `)
    .eq('table_id', id)
    .order('seat_number');

  const seats = (rawSeats ?? []) as unknown as SeatRow[];

  // Get game state (server-side in-memory store)
  const gameState = getGameState(id);

  let publicState = null;
  if (gameState) {
    if (user) {
      publicState = sanitizeForPlayer(gameState, user.id);
    } else {
      publicState = sanitizeForSpectator(gameState);
    }
  }

  // Get user's chip balance and username if logged in
  let userChips: number | undefined;
  let username: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('poker_profiles')
      .select('chips, username')
      .eq('id', user.id)
      .single();
    userChips = profile?.chips;
    username = profile?.username;
  }

  return (
    <TableClient
      table={table}
      seats={seats}
      initialGameState={publicState}
      userId={user?.id}
      username={username}
      userChips={userChips}
    />
  );
}
