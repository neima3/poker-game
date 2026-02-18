import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { initGame, dealHoleCards, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState, setGameState, hasActiveGame } from '@/lib/poker/game-store';

// POST /api/tables/[id]/start — start a new hand
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (hasActiveGame(tableId)) {
    return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
  }

  // Get table config
  const { data: table } = await supabase
    .from('poker_tables')
    .select('*')
    .eq('id', tableId)
    .single();

  if (!table) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

  // Get seated players
  const { data: seats } = await supabase
    .from('poker_seats')
    .select(`
      seat_number, player_id, stack,
      poker_profiles(username, avatar_url)
    `)
    .eq('table_id', tableId)
    .not('player_id', 'is', null)
    .eq('is_sitting_out', false)
    .order('seat_number');

  if (!seats || seats.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 });
  }

  // Build player states
  const players = seats.map(seat => ({
    playerId: seat.player_id!,
    username: (seat.poker_profiles as any)?.username ?? 'Player',
    avatarUrl: (seat.poker_profiles as any)?.avatar_url,
    seatNumber: seat.seat_number,
    stack: seat.stack,
    isSittingOut: false,
    isConnected: true,
  }));

  // Init game state
  const prevState = getGameState(tableId);
  const gameState = dealHoleCards(
    initGame(tableId, players, table.small_blind, table.big_blind, prevState?.dealerSeat)
  );

  setGameState(tableId, gameState);

  // Broadcast via Supabase Realtime
  const channel = supabase.channel(`table:${tableId}`);
  await channel.subscribe();

  // Broadcast spectator-safe state (no hole cards) to all subscribers.
  // Each player will receive their own cards via a separate private_cards event.
  await channel.send({
    type: 'broadcast',
    event: 'game_state',
    payload: { state: sanitizeForSpectator(gameState) },
  });

  // Send private cards to each player
  for (const player of gameState.players) {
    if (!player.cards || player.cards.length === 0) continue;
    await channel.send({
      type: 'broadcast',
      event: `private_cards:${player.playerId}`,
      payload: { cards: player.cards },
    });
  }

  await supabase.removeChannel(channel);

  return NextResponse.json({ success: true });
}
