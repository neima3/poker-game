import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { initGame, dealHoleCards, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState, setGameState, hasActiveGame } from '@/lib/poker/game-store';
import { getBotName, getBotId } from '@/lib/bots/strategies';
import { processBotTurns } from '@/lib/bots/bot-runner';
import type { BotDifficulty, GameMode, AnteType, StraddleType } from '@/types/poker';

// POST /api/tables/[id]/start — start a new hand
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (hasActiveGame(tableId)) {
    return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
  }

  // Parse optional body for bot settings and game mode
  let fillBots = false;
  let botDifficulty: BotDifficulty = 'regular';
  let gameMode: GameMode = 'classic';
  try {
    const body = await req.json().catch(() => ({}));
    if (body.fill_bots) fillBots = true;
    if (body.bot_difficulty && ['fish', 'regular', 'shark', 'pro'].includes(body.bot_difficulty)) {
      botDifficulty = body.bot_difficulty as BotDifficulty;
    }
    if (body.game_mode === 'allin_or_fold') gameMode = 'allin_or_fold';
    if (body.game_mode === 'bounty') gameMode = 'bounty' as GameMode;
  } catch { /* no body */ }

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

  const humanPlayers = (seats ?? []).map(seat => ({
    playerId: seat.player_id!,
    username: (seat.poker_profiles as any)?.username ?? 'Player',
    avatarUrl: (seat.poker_profiles as any)?.avatar_url,
    seatNumber: seat.seat_number,
    stack: seat.stack,
    isSittingOut: false,
    isConnected: true,
    isBot: false as const,
    botDifficulty: undefined,
  }));

  if (humanPlayers.length < 1) {
    return NextResponse.json({ error: 'Need at least 1 player to start' }, { status: 400 });
  }

  if (!fillBots && humanPlayers.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start (or enable bots)' }, { status: 400 });
  }

  // Build player list — fill empty seats with bots if requested
  const players = [...humanPlayers] as any[];

  if (fillBots) {
    const occupiedSeats = new Set(humanPlayers.map(p => p.seatNumber));
    const allSeats = Array.from({ length: table.table_size }, (_, i) => i + 1);
    const emptySeats = allSeats.filter(s => !occupiedSeats.has(s));

    // At minimum, fill enough seats to have 2 total. Cap bots at 3.
    const botsNeeded = Math.max(0, 2 - humanPlayers.length);
    const seatsToFill = emptySeats.slice(0, Math.max(botsNeeded, Math.min(emptySeats.length, 3)));

    seatsToFill.forEach((seatNum, idx) => {
      players.push({
        playerId: getBotId(tableId, seatNum),
        username: getBotName(botDifficulty, idx),
        seatNumber: seatNum,
        stack: table.max_buy_in,
        isSittingOut: false,
        isConnected: true,
        isBot: true,
        botDifficulty,
        avatarUrl: undefined,
      });
    });
  }

  // Sort by seat number
  players.sort((a, b) => a.seatNumber - b.seatNumber);

  if (players.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 });
  }

  // Init game state and deal cards
  const prevState = getGameState(tableId);
  const resolvedMode = prevState?.gameMode ?? gameMode;
  const tableAnteType = (table.ante_type ?? 'none') as AnteType;
  const tableStraddleType = (table.straddle_type ?? 'none') as StraddleType;
  let gameState = dealHoleCards(
    initGame(
      tableId, players, table.small_blind, table.big_blind,
      prevState?.dealerSeat, resolvedMode,
      table.ante > 0 ? table.ante : undefined,
      tableAnteType,
      tableStraddleType,
    )
  );

  // Process any leading bot turns (e.g. if dealer/SB/BB positions are bots)
  gameState = processBotTurns(gameState);

  setGameState(tableId, gameState);

  // Broadcast via Supabase Realtime
  const channel = supabase.channel(`table:${tableId}`);
  await channel.subscribe();

  await channel.send({
    type: 'broadcast',
    event: 'game_state',
    payload: { state: sanitizeForSpectator(gameState) },
  });

  // Send private cards to each human player only
  for (const player of gameState.players) {
    if (!player.cards || player.cards.length === 0 || player.isBot) continue;
    await channel.send({
      type: 'broadcast',
      event: `private_cards:${player.playerId}`,
      payload: { cards: player.cards },
    });
  }

  await supabase.removeChannel(channel);

  return NextResponse.json({
    success: true,
    state: sanitizeForPlayer(gameState, user.id),
  });
}
