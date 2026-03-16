/**
 * Sit & Go Tournament Engine
 * Manages tournament state, blind escalation, bust-outs, and prizes.
 */

import type {
  TournamentConfig,
  TournamentState,
  TournamentPlayer,
  TournamentBlindLevel,
  BotDifficulty,
} from '@/types/poker';
import { getBotName, getBotId } from '@/lib/bots/strategies';

// ─── Preset Tournament Configs ──────────────────────────────────────────────

const BLIND_LEVELS: TournamentBlindLevel[] = [
  { smallBlind: 10, bigBlind: 20, durationMinutes: 3 },
  { smallBlind: 15, bigBlind: 30, durationMinutes: 3 },
  { smallBlind: 25, bigBlind: 50, durationMinutes: 3 },
  { smallBlind: 50, bigBlind: 100, durationMinutes: 3 },
  { smallBlind: 75, bigBlind: 150, durationMinutes: 3 },
  { smallBlind: 100, bigBlind: 200, durationMinutes: 3 },
  { smallBlind: 150, bigBlind: 300, durationMinutes: 3 },
  { smallBlind: 200, bigBlind: 400, durationMinutes: 3 },
  { smallBlind: 300, bigBlind: 600, durationMinutes: 3 },
  { smallBlind: 500, bigBlind: 1000, durationMinutes: 3 },
];

export const TOURNAMENT_PRESETS: Record<string, TournamentConfig> = {
  'sng-3': {
    id: 'sng-3',
    name: 'Turbo 3-Max',
    buyIn: 500,
    startingStack: 1500,
    maxPlayers: 3,
    blindLevels: BLIND_LEVELS,
    payoutStructure: [65, 35],
    lateRegistrationLevels: 0,
  },
  'sng-6': {
    id: 'sng-6',
    name: 'Standard 6-Max',
    buyIn: 1000,
    startingStack: 3000,
    maxPlayers: 6,
    blindLevels: BLIND_LEVELS,
    payoutStructure: [50, 30, 20],
    lateRegistrationLevels: 1,
  },
  'sng-9': {
    id: 'sng-9',
    name: 'Full Ring 9-Max',
    buyIn: 2000,
    startingStack: 5000,
    maxPlayers: 9,
    blindLevels: BLIND_LEVELS,
    payoutStructure: [50, 30, 20],
    lateRegistrationLevels: 2,
  },
};

// ─── Tournament Store (in-memory) ───────────────────────────────────────────

const tournaments = new Map<string, TournamentState>();

export function getTournament(id: string): TournamentState | undefined {
  return tournaments.get(id);
}

export function setTournament(id: string, state: TournamentState): void {
  tournaments.set(id, state);
}

export function deleteTournament(id: string): void {
  tournaments.delete(id);
}

export function getAllTournaments(): TournamentState[] {
  return Array.from(tournaments.values());
}

// ─── Tournament Lifecycle ───────────────────────────────────────────────────

export function createTournament(
  configId: string,
  creatorId: string,
  creatorName: string,
  gameMode: 'classic' | 'bounty' = 'classic',
): TournamentState {
  const config = TOURNAMENT_PRESETS[configId];
  if (!config) throw new Error(`Unknown tournament config: ${configId}`);

  const id = `tourney_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullConfig = { ...config, id };

  const bountyAmount = gameMode === 'bounty' ? Math.floor(config.buyIn * 0.3) : 0;

  const state: TournamentState = {
    config: fullConfig,
    status: 'registering',
    players: [{
      playerId: creatorId,
      username: creatorName,
      stack: config.startingStack,
      isBot: false,
      bounty: bountyAmount,
      bountiesCollected: 0,
    }],
    currentBlindLevel: 0,
    blindLevelStartedAt: 0,
    prizePool: config.buyIn,
    gameMode,
  };

  tournaments.set(id, state);
  return state;
}

export function registerPlayer(
  tournamentId: string,
  playerId: string,
  username: string,
  avatarUrl?: string,
): TournamentState {
  const state = tournaments.get(tournamentId);
  if (!state) throw new Error('Tournament not found');
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
  });
  state.prizePool += state.config.buyIn;

  tournaments.set(tournamentId, state);
  return state;
}

export function fillWithBots(
  tournamentId: string,
  difficulty: BotDifficulty = 'regular',
): TournamentState {
  const state = tournaments.get(tournamentId);
  if (!state) throw new Error('Tournament not found');

  const spotsToFill = state.config.maxPlayers - state.players.length;
  const bountyAmount = state.gameMode === 'bounty' ? Math.floor(state.config.buyIn * 0.3) : 0;

  for (let i = 0; i < spotsToFill; i++) {
    const botId = getBotId(tournamentId, i + 100);
    state.players.push({
      playerId: botId,
      username: getBotName(difficulty, i),
      stack: state.config.startingStack,
      isBot: true,
      botDifficulty: difficulty,
      bounty: bountyAmount,
      bountiesCollected: 0,
    });
    state.prizePool += state.config.buyIn;
  }

  tournaments.set(tournamentId, state);
  return state;
}

export function startTournament(tournamentId: string): TournamentState {
  const state = tournaments.get(tournamentId);
  if (!state) throw new Error('Tournament not found');
  if (state.players.length < 2) throw new Error('Need at least 2 players');

  state.status = 'running';
  state.startedAt = Date.now();
  state.blindLevelStartedAt = Date.now();

  tournaments.set(tournamentId, state);
  return state;
}

// ─── Blind Level Management ─────────────────────────────────────────────────

export function getCurrentBlinds(state: TournamentState): TournamentBlindLevel {
  const levels = state.config.blindLevels;
  const idx = Math.min(state.currentBlindLevel, levels.length - 1);
  return levels[idx];
}

export function checkBlindIncrease(state: TournamentState): boolean {
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
    tournaments.set(state.config.id, state);
    return true;
  }
  return false;
}

// ─── Bust-out & Placement ───────────────────────────────────────────────────

export function eliminatePlayer(
  tournamentId: string,
  playerId: string,
  eliminatorId?: string,
): { state: TournamentState; bountyCollected: number } {
  const state = tournaments.get(tournamentId);
  if (!state) throw new Error('Tournament not found');

  const player = state.players.find(p => p.playerId === playerId);
  if (!player) throw new Error('Player not found');

  const activePlayers = state.players.filter(p => !p.eliminatedAt);
  player.finishPosition = activePlayers.length;
  player.eliminatedAt = Date.now();

  // Bounty transfer
  let bountyCollected = 0;
  if (state.gameMode === 'bounty' && eliminatorId && player.bounty) {
    const eliminator = state.players.find(p => p.playerId === eliminatorId);
    if (eliminator) {
      bountyCollected = player.bounty;
      eliminator.bountiesCollected = (eliminator.bountiesCollected ?? 0) + 1;
      // Half goes to eliminator's bounty, half to their stack prize
      eliminator.bounty = (eliminator.bounty ?? 0) + Math.floor(bountyCollected / 2);
    }
    player.bounty = 0;
  }

  // Check if tournament is over
  const remaining = state.players.filter(p => !p.eliminatedAt);
  if (remaining.length === 1) {
    remaining[0].finishPosition = 1;
    state.status = 'finished';
    state.finishedAt = Date.now();
  }

  tournaments.set(tournamentId, state);
  return { state, bountyCollected };
}

// ─── Prize Calculation ──────────────────────────────────────────────────────

export function calculatePrizes(state: TournamentState): { playerId: string; username: string; position: number; prize: number; bountyPrize: number }[] {
  const basePrizePool = state.gameMode === 'bounty'
    ? Math.floor(state.prizePool * 0.7) // 70% to placement, 30% was bounties
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

// ─── Get active players for next hand ───────────────────────────────────────

export function getActiveTournamentPlayers(state: TournamentState): TournamentPlayer[] {
  return state.players.filter(p => !p.eliminatedAt && p.stack > 0);
}

// ─── Time remaining in current blind level ──────────────────────────────────

export function getBlindTimeRemaining(state: TournamentState): number {
  if (state.status !== 'running') return 0;
  const level = state.config.blindLevels[state.currentBlindLevel];
  if (!level) return 0;
  const elapsed = Date.now() - state.blindLevelStartedAt;
  return Math.max(0, level.durationMinutes * 60000 - elapsed);
}
