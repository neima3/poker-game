import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getTournament,
  getCurrentBlinds,
  checkBlindIncrease,
  getActiveTournamentPlayers,
  getBlindTimeRemaining,
  calculatePrizes,
  eliminatePlayer,
} from '@/lib/poker/tournament';
import { initGame, dealHoleCards, sanitizeForPlayer } from '@/lib/poker/engine';
import { getGameState, setGameState } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import type { GameMode } from '@/types/poker';

// GET /api/tournaments/[id] — get tournament state + current hand
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const state = getTournament(id);
  if (!state) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  // Check blind level increase
  if (state.status === 'running') {
    checkBlindIncrease(state);
  }

  const blinds = getCurrentBlinds(state);
  const timeRemaining = getBlindTimeRemaining(state);
  const gameState = getGameState(`tourney_${id}`);

  const prizes = state.status === 'finished' ? calculatePrizes(state) : undefined;

  return NextResponse.json({
    tournament: state,
    blinds,
    timeRemaining,
    prizes,
    gameState: gameState && user ? sanitizeForPlayer(gameState, user.id) : null,
  });
}

// POST /api/tournaments/[id] — start next hand in tournament
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = getTournament(id);
  if (!state) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  if (state.status !== 'running') {
    return NextResponse.json({ error: 'Tournament not running' }, { status: 400 });
  }

  // Check for blind increase
  checkBlindIncrease(state);

  // Check for bust-outs from the previous hand
  const prevGame = getGameState(`tourney_${id}`);
  if (prevGame && prevGame.phase === 'pot_awarded') {
    for (const p of prevGame.players) {
      if (p.stack <= 0 && !p.isSittingOut) {
        const tourneyPlayer = state.players.find(tp => tp.playerId === p.playerId);
        if (tourneyPlayer && !tourneyPlayer.eliminatedAt) {
          // Find who eliminated them (winner of the hand)
          const eliminatorId = prevGame.winners?.[0]?.playerId;
          eliminatePlayer(id, p.playerId, eliminatorId);
        }
      }
    }

    // Update stacks in tournament state from game results
    for (const p of prevGame.players) {
      const tp = state.players.find(tp => tp.playerId === p.playerId);
      if (tp && !tp.eliminatedAt) {
        tp.stack = p.stack;
      }
    }
  }

  // Check if tournament is over
  const activePlayers = getActiveTournamentPlayers(state);
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      winner.finishPosition = 1;
      state.status = 'finished';
      state.finishedAt = Date.now();
    }
    const prizes = calculatePrizes(state);
    return NextResponse.json({ tournament: state, finished: true, prizes });
  }

  // Build player list for next hand
  const blinds = getCurrentBlinds(state);
  const gameMode: GameMode = state.gameMode === 'bounty' ? 'bounty' : 'classic';

  const players = activePlayers.map((p, idx) => ({
    playerId: p.playerId,
    username: p.username,
    avatarUrl: p.avatarUrl,
    seatNumber: idx + 1,
    stack: p.stack,
    isSittingOut: false,
    isConnected: true,
    isBot: p.isBot,
    botDifficulty: p.botDifficulty,
  }));

  const prevDealerSeat = prevGame?.dealerSeat;
  let gameState = dealHoleCards(
    initGame(`tourney_${id}`, players, blinds.smallBlind, blinds.bigBlind, prevDealerSeat, gameMode)
  );

  gameState = processBotTurns(gameState);
  setGameState(`tourney_${id}`, gameState);

  return NextResponse.json({
    success: true,
    tournament: state,
    blinds,
    gameState: sanitizeForPlayer(gameState, user.id),
  });
}
