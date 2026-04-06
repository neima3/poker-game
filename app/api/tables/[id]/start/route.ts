import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { broadcastToTable } from '@/lib/supabase/broadcast';
import { initGame, dealHoleCards, sanitizeForPlayer, sanitizeForSpectator } from '@/lib/poker/engine';
import { getGameState, setGameState, hasActiveGame, withTableLock, ensureGameStateLoaded, persistGameState } from '@/lib/poker/game-store';
import { getBotName, getBotId } from '@/lib/bots/strategies';
import { processBotTurns } from '@/lib/bots/bot-runner';
import { getPokerTableById } from '@/lib/supabase/poker-tables';
import type { BotDifficulty, GameMode, AnteType, StraddleType } from '@/types/poker';

type SeatProfile = {
  username: string;
  avatar_url?: string | null;
} | null;

type GameStarterPlayer = Parameters<typeof initGame>[1][number];

function getSeatProfile(
  profile: SeatProfile | SeatProfile[]
): SeatProfile {
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

// POST /api/tables/[id]/start — start a new hand
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Warm the in-memory cache from DB in case this is a cold-start instance
  await ensureGameStateLoaded(tableId);

  // Quick pre-check before acquiring the lock (avoids unnecessary queuing)
  if (hasActiveGame(tableId)) {
    return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
  }

  // Parse optional body for bot settings and game mode
  let fillBots = false;
  let botDifficulty: BotDifficulty = 'regular';
  let gameMode: GameMode = 'classic';
  let runItTwice = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.fill_bots) fillBots = true;
    if (body.bot_difficulty && ['fish', 'regular', 'shark', 'pro'].includes(body.bot_difficulty)) {
      botDifficulty = body.bot_difficulty as BotDifficulty;
    }
    if (body.game_mode === 'allin_or_fold') gameMode = 'allin_or_fold';
    if (body.game_mode === 'bounty') gameMode = 'bounty' as GameMode;
    if (body.run_it_twice === true) runItTwice = true;
  } catch { /* no body */ }

  // Get table config
  const { table } = await getPokerTableById(supabase, tableId, {
    includeBettingColumns: true,
  });

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

  const humanPlayers: GameStarterPlayer[] = (seats ?? []).map(seat => {
    const profile = getSeatProfile(seat.poker_profiles as SeatProfile | SeatProfile[]);

    return {
      playerId: seat.player_id!,
      username: profile?.username ?? 'Player',
      avatarUrl: profile?.avatar_url ?? undefined,
      seatNumber: seat.seat_number,
      stack: seat.stack,
      isSittingOut: false,
      isConnected: true,
      isBot: false as const,
      botDifficulty: undefined,
    };
  });

  if (humanPlayers.length < 1) {
    return NextResponse.json({ error: 'Need at least 1 player to start' }, { status: 400 });
  }

  if (!fillBots && humanPlayers.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start (or enable bots)' }, { status: 400 });
  }

  // Build player list — fill empty seats with bots if requested
  const players: GameStarterPlayer[] = [...humanPlayers];

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

  return withTableLock(tableId, async () => {
    // Re-check inside the lock: another concurrent start may have beaten us
    if (hasActiveGame(tableId)) {
      return NextResponse.json({ error: 'Game already in progress' }, { status: 400 });
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
        runItTwice || (prevState?.runItTwice ?? false),
      )
    );

    // Process any leading bot turns (e.g. if dealer/SB/BB positions are bots)
    gameState = processBotTurns(gameState);

    setGameState(tableId, gameState);
    await persistGameState(tableId);

    // Broadcast via REST API (no WebSocket connection needed)
    const privateMsgs = gameState.players
      .filter(p => p.cards && p.cards.length > 0 && !p.isBot)
      .map(p => ({ event: `private_cards:${p.playerId}`, payload: { cards: p.cards } as Record<string, unknown> }));
    await broadcastToTable(tableId, [
      { event: 'game_state', payload: { state: sanitizeForSpectator(gameState) } as Record<string, unknown> },
      ...privateMsgs,
    ]);

    return NextResponse.json({
      success: true,
      state: sanitizeForPlayer(gameState, user.id),
    });
  });
}
