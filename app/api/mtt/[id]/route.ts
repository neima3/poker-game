import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getMTT,
  getMTTCurrentBlinds,
  getMTTBlindTimeRemaining,
  checkMTTBlindIncrease,
  getActiveMTTPlayers,
  getTableForPlayer,
  calculateMTTPrizes,
  handleTableHandComplete,
  initTableGame,
  isRebuyPeriodOpen,
  getChipAverage,
} from '@/lib/poker/mtt';
import { getGameState, setGameState } from '@/lib/poker/game-store';
import { sanitizeForPlayer } from '@/lib/poker/engine';
import { processBotTurns } from '@/lib/bots/bot-runner';

// GET /api/mtt/[id] — get MTT state + current hand for requesting player
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const state = getMTT(id);
  if (!state) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });

  if (state.status === 'running') {
    checkMTTBlindIncrease(state);
  }

  const blinds = getMTTCurrentBlinds(state);
  const timeRemaining = getMTTBlindTimeRemaining(state);
  const activePlayers = getActiveMTTPlayers(state);
  const prizes = state.status === 'finished' ? calculateMTTPrizes(state) : undefined;
  const chipAverage = getChipAverage(state);
  const nextBlindIdx = state.currentBlindLevel + 1;
  const nextBlinds = nextBlindIdx < state.config.blindLevels.length
    ? state.config.blindLevels[nextBlindIdx]
    : null;
  const basePrizePool = state.gameMode === 'bounty'
    ? Math.floor(state.prizePool * 0.7)
    : state.prizePool;
  const prizeBreakdown = state.config.payoutStructure.map((pct, i) => ({
    position: i + 1,
    percentage: pct,
    chips: Math.floor(basePrizePool * pct / 100),
  }));

  // Get game state for the player's table
  let gameState = null;
  let playerTable = null;
  if (user) {
    const table = getTableForPlayer(state, user.id);
    if (table) {
      playerTable = table;
      const gs = getGameState(table.tableId);
      if (gs) {
        gameState = sanitizeForPlayer(gs, user.id);
      }
    }
  }

  // Summary of all tables
  const tableSummary = state.tables.map(t => ({
    tableId: t.tableId,
    tableNumber: t.tableNumber,
    playerCount: t.playerIds.filter(pid => {
      const p = state.players.find(pl => pl.playerId === pid);
      return p && !p.eliminatedAt && p.stack > 0;
    }).length,
    handInProgress: t.handInProgress,
  }));

  return NextResponse.json({
    tournament: {
      id: state.id,
      config: state.config,
      status: state.status,
      currentBlindLevel: state.currentBlindLevel,
      prizePool: state.prizePool,
      gameMode: state.gameMode,
      isFinalTable: state.isFinalTable,
      totalRebuys: state.totalRebuys,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      playersRemaining: activePlayers.length,
      totalPlayers: state.players.length,
      rebuyOpen: isRebuyPeriodOpen(state),
      chipAverage,
    },
    blinds,
    nextBlinds,
    timeRemaining,
    prizes,
    prizeBreakdown,
    gameState,
    playerTable: playerTable ? {
      tableId: playerTable.tableId,
      tableNumber: playerTable.tableNumber,
    } : null,
    tables: tableSummary,
  });
}

// POST /api/mtt/[id] — start next hand on a table
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = getMTT(id);
  if (!state) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });
  if (state.status !== 'running') {
    return NextResponse.json({ error: 'MTT not running' }, { status: 400 });
  }

  checkMTTBlindIncrease(state);

  // Find the player's table
  const table = getTableForPlayer(state, user.id);
  if (!table) return NextResponse.json({ error: 'Not seated at any table' }, { status: 400 });

  // Handle previous hand completion
  const prevGame = getGameState(table.tableId);
  if (prevGame && prevGame.phase === 'pot_awarded') {
    const result = handleTableHandComplete(state.id, table.tableId);

    if (result.state.status === 'finished') {
      const prizes = calculateMTTPrizes(result.state);

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

      return NextResponse.json({ tournament: result.state, finished: true, prizes });
    }
  }

  // Re-fetch state (may have changed from merge/balance)
  const currentState = getMTT(id);
  if (!currentState) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });

  // Find player's current table (may have changed after merge/balance)
  const currentTable = getTableForPlayer(currentState, user.id);
  if (!currentTable) return NextResponse.json({ error: 'Not seated at any table' }, { status: 400 });

  // Check if enough players at this table
  const tablePlayers = currentState.players.filter(
    p => p.tableId === currentTable.tableId && !p.eliminatedAt && p.stack > 0
  );
  if (tablePlayers.length < 2) {
    return NextResponse.json({ error: 'Waiting for table rebalance' }, { status: 400 });
  }

  // Init next hand
  initTableGame(currentState, currentTable.tableId);

  // Process bot turns
  let gameState = getGameState(currentTable.tableId);
  if (gameState) {
    gameState = processBotTurns(gameState);
    setGameState(currentTable.tableId, gameState);
  }

  const blinds = getMTTCurrentBlinds(currentState);
  const nextBlindIdxPost = currentState.currentBlindLevel + 1;
  const nextBlindsPost = nextBlindIdxPost < currentState.config.blindLevels.length
    ? currentState.config.blindLevels[nextBlindIdxPost]
    : null;

  return NextResponse.json({
    success: true,
    tournament: {
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
      chipAverage: getChipAverage(currentState),
    },
    blinds,
    nextBlinds: nextBlindsPost,
    gameState: gameState ? sanitizeForPlayer(gameState, user.id) : null,
    playerTable: {
      tableId: currentTable.tableId,
      tableNumber: currentTable.tableNumber,
    },
  });
}
