import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyAction, sanitizeForPlayer, InvalidRaiseError } from '@/lib/poker/engine';
import { getGameState, setGameState } from '@/lib/poker/game-store';
import { processBotTurns } from '@/lib/bots/bot-runner';
import {
  getMTT,
  handleTableHandComplete,
  getTableForPlayer,
  getActiveMTTPlayers,
  calculateMTTPrizes,
  getMTTCurrentBlinds,
  getMTTBlindTimeRemaining,
  checkMTTBlindIncrease,
  isRebuyPeriodOpen,
} from '@/lib/poker/mtt';
import type { ActionType } from '@/types/poker';

// POST /api/mtt/[id]/action — player submits action in MTT hand
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: mttId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, amount }: { action: ActionType; amount?: number } = body;
  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  if ((action === 'bet' || action === 'raise') && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: 'Bet/raise amount must be a positive number' }, { status: 400 });
  }

  const state = getMTT(mttId);
  if (!state) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });

  // Find the player's table
  const table = getTableForPlayer(state, user.id);
  if (!table) return NextResponse.json({ error: 'Not seated at any table' }, { status: 400 });

  const gameState = getGameState(table.tableId);
  if (!gameState) return NextResponse.json({ error: 'No active hand' }, { status: 400 });

  const player = gameState.players.find(p => p.playerId === user.id);
  if (!player) return NextResponse.json({ error: 'Not in this hand' }, { status: 400 });
  if (player.seatNumber !== gameState.activeSeat) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 });
  }

  let newState;
  try {
    newState = applyAction(gameState, user.id, { type: action, amount });
  } catch (err: any) {
    if (err instanceof InvalidRaiseError) {
      return NextResponse.json(
        { error: err.message, minimumRaiseAmount: err.minimumRaiseAmount },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  newState = processBotTurns(newState);
  setGameState(table.tableId, newState);

  // Handle hand completion
  let bustedPlayers: string[] = [];
  let tournamentFinished = false;
  let prizes;

  if (newState.phase === 'pot_awarded') {
    checkMTTBlindIncrease(state);
    const result = handleTableHandComplete(mttId, table.tableId);
    bustedPlayers = result.bustedPlayers;

    if (result.state.status === 'finished') {
      tournamentFinished = true;
      prizes = calculateMTTPrizes(result.state);

      // Award chips to human winners
      for (const prize of prizes) {
        const totalPrize = prize.prize + prize.bountyPrize;
        const tp = result.state.players.find(p => p.playerId === prize.playerId);
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

  const currentState = getMTT(mttId);
  const currentTable = currentState ? getTableForPlayer(currentState, user.id) : null;

  return NextResponse.json({
    success: true,
    gameState: sanitizeForPlayer(newState, user.id),
    bustedPlayers,
    tournamentFinished,
    prizes,
    tournament: currentState ? {
      id: currentState.id,
      config: currentState.config,
      status: currentState.status,
      currentBlindLevel: currentState.currentBlindLevel,
      prizePool: currentState.prizePool,
      gameMode: currentState.gameMode,
      isFinalTable: currentState.isFinalTable,
      playersRemaining: getActiveMTTPlayers(currentState).length,
      totalPlayers: currentState.players.length,
      rebuyOpen: isRebuyPeriodOpen(currentState),
    } : undefined,
    blinds: currentState ? getMTTCurrentBlinds(currentState) : undefined,
    timeRemaining: currentState ? getMTTBlindTimeRemaining(currentState) : undefined,
    playerTable: currentTable ? {
      tableId: currentTable.tableId,
      tableNumber: currentTable.tableNumber,
    } : null,
  });
}
