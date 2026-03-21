/**
 * Multi-Table Tournament (MTT) Engine
 * Manages multiple tables, player balancing, table merging, rebuys, and bracket progression.
 */

import type {
  MTTConfig,
  MTTState,
  MTTTable,
  MTTPlayerInfo,
  TournamentBlindLevel,
  BotDifficulty,
  TournamentFormat,
  BlindSpeed,
} from '@/types/poker';
import { getBotName, getBotId } from '@/lib/bots/strategies';
import { getGameState, setGameState, deleteGameState } from './game-store';
import { initGame, dealHoleCards } from './engine';

// ─── MTT Store (in-memory) ──────────────────────────────────────────────────

const mttStore = new Map<string, MTTState>();

export function getMTT(id: string): MTTState | undefined {
  return mttStore.get(id);
}

export function setMTT(id: string, state: MTTState): void {
  mttStore.set(id, state);
}

export function deleteMTT(id: string): void {
  mttStore.delete(id);
}

export function getAllMTTs(): MTTState[] {
  return Array.from(mttStore.values());
}

// ─── Blind Speed ────────────────────────────────────────────────────────────

const BLIND_SPEED_DURATION: Record<BlindSpeed, number> = {
  'turbo': 3,
  'standard': 5,
  'deep': 8,
  'super-deep': 12,
};

function applyBlindSpeed(levels: TournamentBlindLevel[], speed: BlindSpeed): TournamentBlindLevel[] {
  const duration = BLIND_SPEED_DURATION[speed];
  return levels.map(level => ({ ...level, durationMinutes: duration }));
}

// ─── Chip Average ────────────────────────────────────────────────────────────

export function getChipAverage(state: MTTState): number {
  const active = getActiveMTTPlayers(state);
  if (active.length === 0) return 0;
  const total = active.reduce((sum, p) => sum + p.stack, 0);
  return Math.floor(total / active.length);
}

// ─── MTT Blind Levels ───────────────────────────────────────────────────────

const MTT_BLIND_LEVELS: TournamentBlindLevel[] = [
  { smallBlind: 10, bigBlind: 20, durationMinutes: 5 },
  { smallBlind: 15, bigBlind: 30, durationMinutes: 5 },
  { smallBlind: 25, bigBlind: 50, durationMinutes: 5 },
  { smallBlind: 50, bigBlind: 100, durationMinutes: 5 },
  { smallBlind: 75, bigBlind: 150, durationMinutes: 5 },
  { smallBlind: 100, bigBlind: 200, durationMinutes: 5 },
  { smallBlind: 150, bigBlind: 300, durationMinutes: 5 },
  { smallBlind: 200, bigBlind: 400, durationMinutes: 5 },
  { smallBlind: 300, bigBlind: 600, durationMinutes: 5 },
  { smallBlind: 500, bigBlind: 1000, durationMinutes: 5 },
  { smallBlind: 750, bigBlind: 1500, durationMinutes: 5 },
  { smallBlind: 1000, bigBlind: 2000, durationMinutes: 5 },
];

// ─── MTT Presets ────────────────────────────────────────────────────────────

export const MTT_PRESETS: Record<string, MTTConfig> = {
  'mtt-18': {
    id: 'mtt-18',
    name: '18-Player Freezeout',
    buyIn: 2000,
    startingStack: 5000,
    maxPlayers: 18,
    blindLevels: MTT_BLIND_LEVELS,
    payoutStructure: [40, 25, 18, 12, 5],
    lateRegistrationLevels: 2,
    tableSize: 9,
    format: 'freezeout',
    rebuyLevels: 0,
    rebuyMaxCount: 0,
    rebuyCost: 0,
    rebuyStack: 0,
  },
  'mtt-18-rebuy': {
    id: 'mtt-18-rebuy',
    name: '18-Player Rebuy',
    buyIn: 1000,
    startingStack: 3000,
    maxPlayers: 18,
    blindLevels: MTT_BLIND_LEVELS,
    payoutStructure: [40, 25, 18, 12, 5],
    lateRegistrationLevels: 2,
    tableSize: 9,
    format: 'rebuy',
    rebuyLevels: 4,
    rebuyMaxCount: 3,
    rebuyCost: 1000,
    rebuyStack: 3000,
  },
  'mtt-27': {
    id: 'mtt-27',
    name: '27-Player Freezeout',
    buyIn: 1000,
    startingStack: 5000,
    maxPlayers: 27,
    blindLevels: MTT_BLIND_LEVELS,
    payoutStructure: [35, 22, 15, 10, 8, 5, 3, 2],
    lateRegistrationLevels: 3,
    tableSize: 9,
    format: 'freezeout',
    rebuyLevels: 0,
    rebuyMaxCount: 0,
    rebuyCost: 0,
    rebuyStack: 0,
  },
  'mtt-45': {
    id: 'mtt-45',
    name: '45-Player Freezeout',
    buyIn: 500,
    startingStack: 3000,
    maxPlayers: 45,
    blindLevels: MTT_BLIND_LEVELS,
    payoutStructure: [30, 20, 14, 10, 7, 5, 4, 3, 3, 2, 2],
    lateRegistrationLevels: 3,
    tableSize: 9,
    format: 'freezeout',
    rebuyLevels: 0,
    rebuyMaxCount: 0,
    rebuyCost: 0,
    rebuyStack: 0,
  },
};

// ─── MTT Lifecycle ──────────────────────────────────────────────────────────

export function createMTT(
  configId: string,
  creatorId: string,
  creatorName: string,
  gameMode: 'classic' | 'bounty' = 'classic',
  speed: BlindSpeed = 'standard',
): MTTState {
  const config = MTT_PRESETS[configId];
  if (!config) throw new Error(`Unknown MTT config: ${configId}`);

  const id = `mtt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const adjustedBlinds = applyBlindSpeed(config.blindLevels, speed);
  const fullConfig = { ...config, id, blindLevels: adjustedBlinds };

  const bountyAmount = gameMode === 'bounty' ? Math.floor(config.buyIn * 0.3) : 0;

  const state: MTTState = {
    id,
    config: fullConfig,
    status: 'registering',
    players: [{
      playerId: creatorId,
      username: creatorName,
      stack: config.startingStack,
      isBot: false,
      bounty: bountyAmount,
      bountiesCollected: 0,
      tableId: '',
      seatNumber: 0,
      rebuysUsed: 0,
    }],
    tables: [],
    currentBlindLevel: 0,
    blindLevelStartedAt: 0,
    prizePool: config.buyIn,
    gameMode,
    isFinalTable: false,
    totalRebuys: 0,
    rebuyDeadlineLevel: config.rebuyLevels,
  };

  mttStore.set(id, state);
  return state;
}

export function registerMTTPlayer(
  mttId: string,
  playerId: string,
  username: string,
  avatarUrl?: string,
): MTTState {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');
  if (state.status !== 'registering') throw new Error('Registration closed');
  if (state.players.length >= state.config.maxPlayers) throw new Error('Tournament full');
  if (state.players.some(p => p.playerId === playerId)) throw new Error('Already registered');

  const bountyAmount = state.gameMode === 'bounty' ? Math.floor(state.config.buyIn * 0.3) : 0;

  state.players.push({
    playerId,
    username,
    avatarUrl,
    stack: state.config.startingStack,
    isBot: false,
    bounty: bountyAmount,
    bountiesCollected: 0,
    tableId: '',
    seatNumber: 0,
    rebuysUsed: 0,
  });
  state.prizePool += state.config.buyIn;

  mttStore.set(mttId, state);
  return state;
}

export function fillMTTWithBots(
  mttId: string,
  difficulty: BotDifficulty = 'regular',
): MTTState {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');

  const spotsToFill = state.config.maxPlayers - state.players.length;
  const bountyAmount = state.gameMode === 'bounty' ? Math.floor(state.config.buyIn * 0.3) : 0;

  for (let i = 0; i < spotsToFill; i++) {
    const botId = getBotId(mttId, i + 200);
    state.players.push({
      playerId: botId,
      username: getBotName(difficulty, i),
      stack: state.config.startingStack,
      isBot: true,
      botDifficulty: difficulty,
      bounty: bountyAmount,
      bountiesCollected: 0,
      tableId: '',
      seatNumber: 0,
      rebuysUsed: 0,
    });
    state.prizePool += state.config.buyIn;
  }

  mttStore.set(mttId, state);
  return state;
}

// ─── Table Distribution ─────────────────────────────────────────────────────

function generateTableId(mttId: string, tableNum: number): string {
  return `${mttId}_table_${tableNum}`;
}

export function seatPlayers(state: MTTState): MTTState {
  const { tableSize } = state.config;
  const playerCount = state.players.length;
  const tableCount = Math.ceil(playerCount / tableSize);

  // Shuffle players for random seating
  const shuffled = [...state.players].sort(() => Math.random() - 0.5);

  // Create tables
  const tables: MTTTable[] = [];
  for (let t = 0; t < tableCount; t++) {
    tables.push({
      tableId: generateTableId(state.id, t + 1),
      tableNumber: t + 1,
      playerIds: [],
      dealerSeat: 0,
      handInProgress: false,
    });
  }

  // Distribute players evenly across tables (round-robin)
  shuffled.forEach((player, idx) => {
    const tableIdx = idx % tableCount;
    const table = tables[tableIdx];
    const seatNumber = table.playerIds.length;
    player.tableId = table.tableId;
    player.seatNumber = seatNumber;
    table.playerIds.push(player.playerId);
  });

  state.tables = tables;
  mttStore.set(state.id, state);
  return state;
}

// ─── Start MTT ──────────────────────────────────────────────────────────────

export function startMTT(mttId: string): MTTState {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');
  if (state.players.length < 4) throw new Error('Need at least 4 players for MTT');

  // Seat players across tables
  seatPlayers(state);

  state.status = 'running';
  state.startedAt = Date.now();
  state.blindLevelStartedAt = Date.now();

  // Initialize game state for each table
  for (const table of state.tables) {
    initTableGame(state, table.tableId);
  }

  mttStore.set(mttId, state);
  return state;
}

// ─── Init Game for a Single Table ───────────────────────────────────────────

export function initTableGame(state: MTTState, tableId: string): void {
  const table = state.tables.find(t => t.tableId === tableId);
  if (!table) throw new Error(`Table ${tableId} not found`);

  const tablePlayers = state.players.filter(
    p => p.tableId === tableId && !p.eliminatedAt && p.stack > 0
  );

  if (tablePlayers.length < 2) return;

  const blinds = getMTTCurrentBlinds(state);
  const playerStates = tablePlayers.map(p => ({
    playerId: p.playerId,
    username: p.username,
    avatarUrl: p.avatarUrl,
    seatNumber: p.seatNumber,
    stack: p.stack,
    isSittingOut: false,
    isConnected: true,
    isBot: p.isBot,
    botDifficulty: p.botDifficulty,
  }));

  const gameState = initGame(
    tableId,
    playerStates,
    blinds.smallBlind,
    blinds.bigBlind,
    table.dealerSeat,
    state.gameMode === 'bounty' ? 'bounty' : 'classic',
  );

  const dealt = dealHoleCards(gameState);
  setGameState(tableId, dealt);
  table.handInProgress = true;
  table.dealerSeat = gameState.dealerSeat;
}

// ─── Blind Management ───────────────────────────────────────────────────────

export function getMTTCurrentBlinds(state: MTTState): TournamentBlindLevel {
  const levels = state.config.blindLevels;
  const idx = Math.min(state.currentBlindLevel, levels.length - 1);
  return levels[idx];
}

export function checkMTTBlindIncrease(state: MTTState): boolean {
  if (state.status !== 'running') return false;

  const currentLevel = state.config.blindLevels[state.currentBlindLevel];
  if (!currentLevel) return false;

  const elapsed = (Date.now() - state.blindLevelStartedAt) / 60000;
  if (elapsed >= currentLevel.durationMinutes) {
    state.currentBlindLevel = Math.min(
      state.currentBlindLevel + 1,
      state.config.blindLevels.length - 1,
    );
    state.blindLevelStartedAt = Date.now();
    mttStore.set(state.id, state);
    return true;
  }
  return false;
}

export function getMTTBlindTimeRemaining(state: MTTState): number {
  if (state.status !== 'running') return 0;
  const level = state.config.blindLevels[state.currentBlindLevel];
  if (!level) return 0;
  const elapsed = Date.now() - state.blindLevelStartedAt;
  return Math.max(0, level.durationMinutes * 60000 - elapsed);
}

// ─── Elimination ────────────────────────────────────────────────────────────

export function eliminateMTTPlayer(
  mttId: string,
  playerId: string,
  eliminatorId?: string,
): { state: MTTState; bountyCollected: number } {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error('Player not found');

  const activePlayers = getActiveMTTPlayers(state);
  player.finishPosition = activePlayers.length;
  player.eliminatedAt = Date.now();

  // Remove from table
  const table = state.tables.find(t => t.tableId === player.tableId);
  if (table) {
    table.playerIds = table.playerIds.filter(id => id !== playerId);
  }

  // Bounty transfer
  let bountyCollected = 0;
  if (state.gameMode === 'bounty' && eliminatorId && player.bounty) {
    const eliminator = state.players.find(p => p.playerId === eliminatorId);
    if (eliminator) {
      bountyCollected = player.bounty;
      eliminator.bountiesCollected = (eliminator.bountiesCollected ?? 0) + 1;
      eliminator.bounty = (eliminator.bounty ?? 0) + Math.floor(bountyCollected / 2);
    }
    player.bounty = 0;
  }

  // Check if tournament is over
  const remaining = getActiveMTTPlayers(state);
  if (remaining.length === 1) {
    remaining[0].finishPosition = 1;
    state.status = 'finished';
    state.finishedAt = Date.now();
  }

  mttStore.set(mttId, state);
  return { state, bountyCollected };
}

// ─── Table Balancing ────────────────────────────────────────────────────────

export function getActiveTablesWithCounts(state: MTTState): { table: MTTTable; count: number }[] {
  return state.tables
    .map(t => ({
      table: t,
      count: t.playerIds.filter(id => {
        const p = state.players.find(pl => pl.playerId === id);
        return p && !p.eliminatedAt && p.stack > 0;
      }).length,
    }))
    .filter(t => t.count > 0);
}

export function shouldBalanceTables(state: MTTState): boolean {
  const active = getActiveTablesWithCounts(state);
  if (active.length < 2) return false;

  const counts = active.map(a => a.count);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  return max - min >= 2;
}

export function balanceTables(state: MTTState): MTTState {
  const active = getActiveTablesWithCounts(state);
  if (active.length < 2) return state;

  // Sort: largest tables first
  active.sort((a, b) => b.count - a.count);

  let balanced = false;
  let iterations = 0;

  while (!balanced && iterations < 20) {
    iterations++;
    const counts = active.map(a => a.count);
    const maxIdx = counts.indexOf(Math.max(...counts));
    const minIdx = counts.indexOf(Math.min(...counts));

    if (counts[maxIdx] - counts[minIdx] < 2) {
      balanced = true;
      break;
    }

    // Move a player from largest to smallest table
    const fromTable = active[maxIdx].table;
    const toTable = active[minIdx].table;

    // Pick a random player from the source table (prefer bots for less disruption)
    const fromPlayers = state.players.filter(
      p => p.tableId === fromTable.tableId && !p.eliminatedAt && p.stack > 0
    );
    const botToMove = fromPlayers.find(p => p.isBot);
    const playerToMove = botToMove || fromPlayers[fromPlayers.length - 1];

    if (!playerToMove) break;

    // Move player
    fromTable.playerIds = fromTable.playerIds.filter(id => id !== playerToMove.playerId);
    const newSeat = toTable.playerIds.length;
    playerToMove.tableId = toTable.tableId;
    playerToMove.seatNumber = newSeat;
    toTable.playerIds.push(playerToMove.playerId);

    active[maxIdx].count--;
    active[minIdx].count++;
  }

  mttStore.set(state.id, state);
  return state;
}

// ─── Table Merging ──────────────────────────────────────────────────────────

export function shouldMergeTables(state: MTTState): boolean {
  const activeTables = getActiveTablesWithCounts(state);
  if (activeTables.length < 2) return false;

  const totalPlayers = activeTables.reduce((sum, t) => sum + t.count, 0);
  const neededTables = Math.ceil(totalPlayers / state.config.tableSize);

  return neededTables < activeTables.length;
}

export function mergeTables(state: MTTState): MTTState {
  const activeTables = getActiveTablesWithCounts(state);
  if (activeTables.length < 2) return state;

  const totalPlayers = activeTables.reduce((sum, t) => sum + t.count, 0);
  const neededTables = Math.ceil(totalPlayers / state.config.tableSize);

  if (neededTables >= activeTables.length) return state;

  // Sort tables by player count (smallest first — they get dissolved)
  activeTables.sort((a, b) => a.count - b.count);

  const tablesToRemove = activeTables.length - neededTables;
  const dissolvedTables = activeTables.slice(0, tablesToRemove);
  const remainingTables = activeTables.slice(tablesToRemove);

  // Move players from dissolved tables to remaining tables
  for (const dissolved of dissolvedTables) {
    const playersToMove = state.players.filter(
      p => p.tableId === dissolved.table.tableId && !p.eliminatedAt && p.stack > 0
    );

    for (const player of playersToMove) {
      // Find table with fewest players
      remainingTables.sort((a, b) => a.count - b.count);
      const target = remainingTables[0];

      player.tableId = target.table.tableId;
      player.seatNumber = target.table.playerIds.length;
      target.table.playerIds.push(player.playerId);
      target.count++;
    }

    // Clean up dissolved table game state
    deleteGameState(dissolved.table.tableId);
    dissolved.table.playerIds = [];
    dissolved.table.handInProgress = false;
  }

  // Remove empty tables
  state.tables = state.tables.filter(t => {
    const active = t.playerIds.filter(id => {
      const p = state.players.find(pl => pl.playerId === id);
      return p && !p.eliminatedAt && p.stack > 0;
    });
    return active.length > 0;
  });

  // Check for final table
  if (state.tables.length === 1) {
    state.isFinalTable = true;
  }

  mttStore.set(state.id, state);
  return state;
}

// ─── Rebuy ──────────────────────────────────────────────────────────────────

export function canRebuy(state: MTTState, playerId: string): boolean {
  if (state.config.format !== 'rebuy') return false;
  if (state.currentBlindLevel >= state.rebuyDeadlineLevel) return false;

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) return false;
  if (!player.eliminatedAt && player.stack > 0) return false; // must be busted
  if (player.rebuysUsed >= state.config.rebuyMaxCount) return false;

  return true;
}

export function processRebuy(
  mttId: string,
  playerId: string,
): MTTState {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');

  if (!canRebuy(state, playerId)) {
    throw new Error('Rebuy not available');
  }

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error('Player not found');

  // Reset elimination
  player.eliminatedAt = undefined;
  player.finishPosition = undefined;
  player.stack = state.config.rebuyStack;
  player.rebuysUsed++;
  state.totalRebuys++;
  state.prizePool += state.config.rebuyCost;

  // Find a table with room
  const activeTables = getActiveTablesWithCounts(state);
  activeTables.sort((a, b) => a.count - b.count); // fewest players first

  if (activeTables.length > 0) {
    const target = activeTables[0];
    player.tableId = target.table.tableId;
    player.seatNumber = target.table.playerIds.length;
    target.table.playerIds.push(player.playerId);
  }

  mttStore.set(mttId, state);
  return state;
}

// ─── Update Stacks from Game State ──────────────────────────────────────────

export function syncTableStacks(state: MTTState, tableId: string): string[] {
  const gameState = getGameState(tableId);
  if (!gameState) return [];

  const bustedPlayerIds: string[] = [];

  for (const gs of gameState.players) {
    const mttPlayer = state.players.find(p => p.playerId === gs.playerId);
    if (mttPlayer) {
      mttPlayer.stack = gs.stack;
      if (gs.stack <= 0 && !mttPlayer.eliminatedAt) {
        bustedPlayerIds.push(gs.playerId);
      }
    }
  }

  mttStore.set(state.id, state);
  return bustedPlayerIds;
}

// ─── After Hand Completes on a Table ────────────────────────────────────────

export function handleTableHandComplete(mttId: string, tableId: string): {
  state: MTTState;
  bustedPlayers: string[];
  merged: boolean;
  balanced: boolean;
} {
  const state = mttStore.get(mttId);
  if (!state) throw new Error('MTT not found');

  const table = state.tables.find(t => t.tableId === tableId);
  if (table) {
    table.handInProgress = false;
  }

  // Sync stacks from game state
  const bustedPlayerIds = syncTableStacks(state, tableId);

  // Eliminate busted players
  let totalBounty = 0;
  for (const pid of bustedPlayerIds) {
    // Find who had the winning hand (simplistic: give credit to last winner)
    const gameState = getGameState(tableId);
    const eliminatorId = gameState?.winners?.[0]?.playerId;
    const { bountyCollected } = eliminateMTTPlayer(mttId, pid, eliminatorId);
    totalBounty += bountyCollected;
  }

  // Check blind increase
  checkMTTBlindIncrease(state);

  // Check if we need to merge tables
  let merged = false;
  if (shouldMergeTables(state)) {
    mergeTables(state);
    merged = true;
  }

  // Check if we need to balance tables
  let balanced = false;
  if (!merged && shouldBalanceTables(state)) {
    balanceTables(state);
    balanced = true;
  }

  mttStore.set(mttId, state);
  return { state, bustedPlayers: bustedPlayerIds, merged, balanced };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getActiveMTTPlayers(state: MTTState): MTTPlayerInfo[] {
  return state.players.filter(p => !p.eliminatedAt && p.stack > 0);
}

export function getTableForPlayer(state: MTTState, playerId: string): MTTTable | undefined {
  const player = state.players.find(p => p.playerId === playerId);
  if (!player) return undefined;
  return state.tables.find(t => t.tableId === player.tableId);
}

export function getMTTTablePlayerCount(state: MTTState, tableId: string): number {
  return state.players.filter(
    p => p.tableId === tableId && !p.eliminatedAt && p.stack > 0
  ).length;
}

export function calculateMTTPrizes(state: MTTState): {
  playerId: string;
  username: string;
  position: number;
  prize: number;
  bountyPrize: number;
}[] {
  const basePrizePool = state.gameMode === 'bounty'
    ? Math.floor(state.prizePool * 0.7)
    : state.prizePool;

  const sorted = [...state.players]
    .filter(p => p.finishPosition !== undefined)
    .sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99));

  return sorted.map((p, i) => {
    const payoutPct = state.config.payoutStructure[i] ?? 0;
    const prize = Math.floor(basePrizePool * payoutPct / 100);
    const bountyPrize = state.gameMode === 'bounty'
      ? (p.bountiesCollected ?? 0) * Math.floor(state.config.buyIn * 0.3)
      : 0;

    return {
      playerId: p.playerId,
      username: p.username,
      position: p.finishPosition ?? i + 1,
      prize,
      bountyPrize,
    };
  });
}

export function isRebuyPeriodOpen(state: MTTState): boolean {
  return state.config.format === 'rebuy' && state.currentBlindLevel < state.rebuyDeadlineLevel;
}
