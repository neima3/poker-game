import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyAction, sanitizeForPlayer } from '@/lib/poker/engine';
import { getGameState, setGameState } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import { getTournament, eliminatePlayer, getActiveTournamentPlayers, calculatePrizes, getCurrentBlinds, getBlindTimeRemaining, checkBlindIncrease } from '@/lib/poker/tournament';
import type { ActionType } from '@/types/poker';

// POST /api/tournaments/[id]/action — player submits an action in a tournament hand
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, amount }: { action: ActionType; amount?: number } = body;
  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  if ((action === 'bet' || action === 'raise') && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'Bet/raise amount must be a positive number' }, { status: 400 });
  }

  const tableId = `tourney_${tournamentId}`;
  const gameState = getGameState(tableId);
  if (!gameState) return NextResponse.json({ error: 'No active hand' }, { status: 400 });

  const player = gameState.players.find(p => p.playerId === user.id);
  if (!player) return NextResponse.json({ error: 'Not in this tournament' }, { status: 400 });
  if (player.seatNumber !== gameState.activeSeat) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  let newState;
  try {
    newState = applyAction(gameState, user.id, { type: action, amount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  newState = processBotTurns(newState);
  setGameState(tableId, newState);

  // Handle bust-outs at end of hand
  let bustedPlayers: string[] = [];
  let tournamentFinished = false;
  let prizes;

  if (newState.phase === 'pot_awarded') {
    const state = getTournament(tournamentId);
    if (state) {
      // Check blind increase
      checkBlindIncrease(state);

      for (const p of newState.players) {
        if (p.stack <= 0 && !p.isSittingOut) {
          const tp = state.players.find(tp => tp.playerId === p.playerId);
          if (tp && !tp.eliminatedAt) {
            const eliminatorId = newState.winners?.[0]?.playerId;
            eliminatePlayer(tournamentId, p.playerId, eliminatorId);
            bustedPlayers.push(p.playerId);
          }
        }
      }

      // Update tournament stacks
      for (const p of newState.players) {
        const tp = state.players.find(tp => tp.playerId === p.playerId);
        if (tp && !tp.eliminatedAt) {
          tp.stack = p.stack;
        }
      }

      const remaining = getActiveTournamentPlayers(state);
      if (remaining.length <= 1) {
        if (remaining.length === 1) {
          remaining[0].finishPosition = 1;
        }
        state.status = 'finished';
        state.finishedAt = Date.now();
        tournamentFinished = true;
        prizes = calculatePrizes(state);

        // Award chips to human winners
        for (const prize of prizes) {
          if (prize.prize > 0 || prize.bountyPrize > 0) {
            const totalPrize = prize.prize + prize.bountyPrize;
            const tp = state.players.find(p => p.playerId === prize.playerId);
            if (tp && !tp.isBot && totalPrize > 0) {
              try {
                const { data: profile } = await supabase
                  .from('poker_profiles')
                  .select('chips')
                  .eq('id', prize.playerId)
                  .single();
                if (profile) {
                  await supabase
                    .from('poker_profiles')
                    .update({ chips: profile.chips + totalPrize })
                    .eq('id', prize.playerId);
                }
              } catch { /* best effort */ }
            }
          }
        }
      }
    }
  }

  const tournament = getTournament(tournamentId);

  return NextResponse.json({
    success: true,
    gameState: sanitizeForPlayer(newState, user.id),
    bustedPlayers,
    tournamentFinished,
    prizes,
    tournament,
    blinds: tournament ? getCurrentBlinds(tournament) : undefined,
    timeRemaining: tournament ? getBlindTimeRemaining(tournament) : undefined,
  });
}
