/**
 * Achievements & Missions System
 * - Permanent achievements unlocked by gameplay milestones
 * - Rotating daily/weekly missions with chip rewards
 * - Rarity system: Common / Rare / Epic / Legendary based on unlock %
 *
 * Primary state: localStorage (guest-friendly, immediate)
 * Secondary sync: Supabase via /api/achievements (persists across devices)
 */

// ─── Achievement Definitions ─────────────────────────────────────────────────

export type AchievementCategory = 'hands' | 'winning' | 'social' | 'skill' | 'milestone';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  requirement: number;
  chipReward: number;
  xpReward: number;
  points: number;
  /** Expected rarity (overridden by live unlock % from DB) */
  rarity: AchievementRarity;
  /** Stat key to check against player stats */
  statKey: string;
  secret?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── Hands Played ──────────────────────────────────────────────────────────
  {
    id: 'first_hand',
    name: 'Rookie',
    description: 'Play your first hand',
    icon: '🃏',
    category: 'hands',
    requirement: 1,
    chipReward: 100,
    xpReward: 20,
    points: 10,
    rarity: 'common',
    statKey: 'handsPlayed',
  },
  {
    id: 'hands_50',
    name: 'Regular',
    description: 'Play 50 hands',
    icon: '🎰',
    category: 'hands',
    requirement: 50,
    chipReward: 500,
    xpReward: 50,
    points: 10,
    rarity: 'common',
    statKey: 'handsPlayed',
  },
  {
    id: 'hands_200',
    name: 'Grinder',
    description: 'Play 200 hands',
    icon: '⚙️',
    category: 'hands',
    requirement: 200,
    chipReward: 2000,
    xpReward: 150,
    points: 25,
    rarity: 'rare',
    statKey: 'handsPlayed',
  },
  {
    id: 'hands_500',
    name: 'Iron Player',
    description: 'Play 500 hands',
    icon: '🏗️',
    category: 'hands',
    requirement: 500,
    chipReward: 5000,
    xpReward: 300,
    points: 50,
    rarity: 'epic',
    statKey: 'handsPlayed',
  },
  {
    id: 'hands_1000',
    name: 'Marathon Runner',
    description: 'Play 1,000 hands',
    icon: '🏃',
    category: 'hands',
    requirement: 1000,
    chipReward: 10000,
    xpReward: 500,
    points: 100,
    rarity: 'legendary',
    statKey: 'handsPlayed',
  },
  {
    id: 'hands_5000',
    name: 'Poker Machine',
    description: 'Play 5,000 hands',
    icon: '🤖',
    category: 'hands',
    requirement: 5000,
    chipReward: 50000,
    xpReward: 1000,
    points: 100,
    rarity: 'legendary',
    statKey: 'handsPlayed',
  },

  // ── Wins ──────────────────────────────────────────────────────────────────
  {
    id: 'first_win',
    name: 'Winner Winner',
    description: 'Win your first hand',
    icon: '🏆',
    category: 'winning',
    requirement: 1,
    chipReward: 200,
    xpReward: 30,
    points: 10,
    rarity: 'common',
    statKey: 'handsWon',
  },
  {
    id: 'wins_25',
    name: 'On a Roll',
    description: 'Win 25 hands',
    icon: '🎲',
    category: 'winning',
    requirement: 25,
    chipReward: 1000,
    xpReward: 100,
    points: 10,
    rarity: 'common',
    statKey: 'handsWon',
  },
  {
    id: 'wins_100',
    name: 'Centurion',
    description: 'Win 100 hands',
    icon: '💯',
    category: 'winning',
    requirement: 100,
    chipReward: 5000,
    xpReward: 250,
    points: 25,
    rarity: 'rare',
    statKey: 'handsWon',
  },
  {
    id: 'wins_500',
    name: 'Card Shark',
    description: 'Win 500 hands',
    icon: '🦈',
    category: 'winning',
    requirement: 500,
    chipReward: 15000,
    xpReward: 600,
    points: 50,
    rarity: 'epic',
    statKey: 'handsWon',
  },
  {
    id: 'wins_1000',
    name: 'Shark King',
    description: 'Win 1,000 hands',
    icon: '👑',
    category: 'winning',
    requirement: 1000,
    chipReward: 50000,
    xpReward: 1000,
    points: 100,
    rarity: 'legendary',
    statKey: 'handsWon',
  },

  // ── Streaks ───────────────────────────────────────────────────────────────
  {
    id: 'streak_3',
    name: 'Hot Hand',
    description: 'Get a 3-win streak',
    icon: '🔥',
    category: 'skill',
    requirement: 3,
    chipReward: 300,
    xpReward: 40,
    points: 10,
    rarity: 'common',
    statKey: 'bestStreak',
  },
  {
    id: 'streak_5',
    name: 'Heater',
    description: 'Get a 5-win streak',
    icon: '♨️',
    category: 'skill',
    requirement: 5,
    chipReward: 1000,
    xpReward: 100,
    points: 25,
    rarity: 'rare',
    statKey: 'bestStreak',
  },
  {
    id: 'streak_10',
    name: 'Unstoppable Force',
    description: 'Get a 10-win streak',
    icon: '⚡',
    category: 'skill',
    requirement: 10,
    chipReward: 5000,
    xpReward: 300,
    points: 50,
    rarity: 'epic',
    statKey: 'bestStreak',
  },
  {
    id: 'streak_20',
    name: 'Deity of the Felt',
    description: 'Get a 20-win streak',
    icon: '🌩️',
    category: 'skill',
    requirement: 20,
    chipReward: 25000,
    xpReward: 750,
    points: 100,
    rarity: 'legendary',
    statKey: 'bestStreak',
  },

  // ── Big Pots ──────────────────────────────────────────────────────────────
  {
    id: 'big_pot_1k',
    name: 'High Roller',
    description: 'Win a pot over 1,000 chips',
    icon: '💰',
    category: 'milestone',
    requirement: 1000,
    chipReward: 500,
    xpReward: 50,
    points: 10,
    rarity: 'common',
    statKey: 'biggestPotWon',
  },
  {
    id: 'big_pot_10k',
    name: 'Whale',
    description: 'Win a pot over 10,000 chips',
    icon: '🐋',
    category: 'milestone',
    requirement: 10000,
    chipReward: 2000,
    xpReward: 150,
    points: 25,
    rarity: 'rare',
    statKey: 'biggestPotWon',
  },
  {
    id: 'big_pot_50k',
    name: 'Legendary Pot',
    description: 'Win a pot over 50,000 chips',
    icon: '🌊',
    category: 'milestone',
    requirement: 50000,
    chipReward: 10000,
    xpReward: 500,
    points: 50,
    rarity: 'epic',
    statKey: 'biggestPotWon',
  },
  {
    id: 'big_pot_100k',
    name: 'The Kraken',
    description: 'Win a pot over 100,000 chips',
    icon: '🦑',
    category: 'milestone',
    requirement: 100000,
    chipReward: 25000,
    xpReward: 1000,
    points: 100,
    rarity: 'legendary',
    statKey: 'biggestPotWon',
  },

  // ── Showdown Wins ─────────────────────────────────────────────────────────
  {
    id: 'showdown_10',
    name: 'Showdown Master',
    description: 'Win 10 showdowns',
    icon: '🎯',
    category: 'skill',
    requirement: 10,
    chipReward: 1000,
    xpReward: 80,
    points: 10,
    rarity: 'common',
    statKey: 'showdownWins',
  },
  {
    id: 'showdown_50',
    name: 'Card Reader',
    description: 'Win 50 showdowns',
    icon: '🔮',
    category: 'skill',
    requirement: 50,
    chipReward: 5000,
    xpReward: 250,
    points: 25,
    rarity: 'rare',
    statKey: 'showdownWins',
  },
  {
    id: 'showdown_100',
    name: 'Oracle',
    description: 'Win 100 showdowns',
    icon: '🧿',
    category: 'skill',
    requirement: 100,
    chipReward: 15000,
    xpReward: 500,
    points: 50,
    rarity: 'epic',
    statKey: 'showdownWins',
  },

  // ── All-In Wins ───────────────────────────────────────────────────────────
  {
    id: 'allin_win_5',
    name: 'Gambler',
    description: 'Win 5 all-in hands',
    icon: '🎰',
    category: 'skill',
    requirement: 5,
    chipReward: 1000,
    xpReward: 80,
    points: 10,
    rarity: 'common',
    statKey: 'allInWins',
  },
  {
    id: 'allin_win_25',
    name: 'Fearless',
    description: 'Win 25 all-in hands',
    icon: '💪',
    category: 'skill',
    requirement: 25,
    chipReward: 5000,
    xpReward: 250,
    points: 25,
    rarity: 'rare',
    statKey: 'allInWins',
  },
  {
    id: 'allin_win_50',
    name: 'All-In Legend',
    description: 'Win 50 all-in hands',
    icon: '🎖️',
    category: 'skill',
    requirement: 50,
    chipReward: 15000,
    xpReward: 500,
    points: 50,
    rarity: 'epic',
    statKey: 'allInWins',
  },

  // ── Social ────────────────────────────────────────────────────────────────
  {
    id: 'daily_5',
    name: 'Dedicated',
    description: 'Claim daily bonus 5 times',
    icon: '📅',
    category: 'social',
    requirement: 5,
    chipReward: 1000,
    xpReward: 50,
    points: 10,
    rarity: 'common',
    statKey: 'dailyBonusClaims',
  },
  {
    id: 'daily_30',
    name: 'Loyal Player',
    description: 'Claim daily bonus 30 times',
    icon: '🌟',
    category: 'social',
    requirement: 30,
    chipReward: 5000,
    xpReward: 200,
    points: 25,
    rarity: 'rare',
    statKey: 'dailyBonusClaims',
  },
  {
    id: 'daily_100',
    name: 'True Devotee',
    description: 'Claim daily bonus 100 times',
    icon: '💎',
    category: 'social',
    requirement: 100,
    chipReward: 20000,
    xpReward: 500,
    points: 50,
    rarity: 'epic',
    statKey: 'dailyBonusClaims',
  },

  // ── Chip Milestones ───────────────────────────────────────────────────────
  {
    id: 'total_won_100k',
    name: 'Six Figures',
    description: 'Win 100,000 chips total across all hands',
    icon: '💵',
    category: 'milestone',
    requirement: 100000,
    chipReward: 5000,
    xpReward: 200,
    points: 25,
    rarity: 'rare',
    statKey: 'totalChipsWon',
  },
  {
    id: 'total_won_1m',
    name: 'Millionaire',
    description: 'Win 1,000,000 chips total across all hands',
    icon: '🏦',
    category: 'milestone',
    requirement: 1000000,
    chipReward: 50000,
    xpReward: 1000,
    points: 100,
    rarity: 'legendary',
    statKey: 'totalChipsWon',
  },

  // ── Secret Achievements ───────────────────────────────────────────────────
  {
    id: 'royal_flush',
    name: 'Royal Flush!',
    description: 'Win with a Royal Flush',
    icon: '👑',
    category: 'milestone',
    requirement: 1,
    chipReward: 25000,
    xpReward: 1000,
    points: 100,
    rarity: 'legendary',
    statKey: 'royalFlushes',
    secret: true,
  },
  {
    id: 'comeback',
    name: 'Comeback Kid',
    description: 'Win after being down to less than 1 big blind',
    icon: '🦅',
    category: 'milestone',
    requirement: 1,
    chipReward: 5000,
    xpReward: 200,
    points: 50,
    rarity: 'epic',
    statKey: 'comebacks',
    secret: true,
  },
  {
    id: 'bad_beat_survivor',
    name: 'Bad Beat Survivor',
    description: 'Win 10 hands you were behind on the flop',
    icon: '🪄',
    category: 'skill',
    requirement: 10,
    chipReward: 10000,
    xpReward: 400,
    points: 50,
    rarity: 'epic',
    statKey: 'badBeatWins',
    secret: true,
  },
];

// ─── Rarity Helpers ───────────────────────────────────────────────────────────

export const RARITY_CONFIG: Record<AchievementRarity, { label: string; color: string; border: string; bg: string; glow: string; threshold: number }> = {
  common: {
    label: 'Common',
    color: 'text-gray-300',
    border: 'border-gray-600/40',
    bg: 'bg-gray-600/10',
    glow: '',
    threshold: 30, // >30% of players
  },
  rare: {
    label: 'Rare',
    color: 'text-blue-400',
    border: 'border-blue-500/40',
    bg: 'bg-blue-900/20',
    glow: 'shadow-blue-500/20',
    threshold: 10, // 10-30% of players
  },
  epic: {
    label: 'Epic',
    color: 'text-purple-400',
    border: 'border-purple-500/40',
    bg: 'bg-purple-900/20',
    glow: 'shadow-purple-500/20',
    threshold: 2, // 2-10% of players
  },
  legendary: {
    label: 'Legendary',
    color: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-900/20',
    glow: 'shadow-amber-500/20',
    threshold: 0, // <2% of players
  },
};

/** Compute rarity from unlock percentage */
export function rarityFromPercent(pct: number): AchievementRarity {
  if (pct > 30) return 'common';
  if (pct > 10) return 'rare';
  if (pct > 2) return 'epic';
  return 'legendary';
}

// ─── Mission Definitions ─────────────────────────────────────────────────────

export type MissionType = 'daily' | 'weekly';

export interface MissionTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: MissionType;
  requirement: number;
  chipReward: number;
  xpReward: number;
  statKey: string;
}

const DAILY_MISSIONS: MissionTemplate[] = [
  { id: 'daily_play_5', name: 'Table Time', description: 'Play 5 hands', icon: '🃏', type: 'daily', requirement: 5, chipReward: 200, xpReward: 20, statKey: 'handsPlayed' },
  { id: 'daily_play_15', name: 'Session Grind', description: 'Play 15 hands', icon: '🎰', type: 'daily', requirement: 15, chipReward: 500, xpReward: 40, statKey: 'handsPlayed' },
  { id: 'daily_win_3', name: 'Triple Threat', description: 'Win 3 hands', icon: '🏆', type: 'daily', requirement: 3, chipReward: 300, xpReward: 30, statKey: 'handsWon' },
  { id: 'daily_win_5', name: 'Five Star', description: 'Win 5 hands', icon: '⭐', type: 'daily', requirement: 5, chipReward: 500, xpReward: 50, statKey: 'handsWon' },
  { id: 'daily_showdown_2', name: 'Show Me', description: 'Win 2 showdowns', icon: '🎯', type: 'daily', requirement: 2, chipReward: 400, xpReward: 35, statKey: 'showdownWins' },
  { id: 'daily_allin_1', name: 'All or Nothing', description: 'Win an all-in hand', icon: '💥', type: 'daily', requirement: 1, chipReward: 300, xpReward: 25, statKey: 'allInWins' },
  { id: 'daily_streak_3', name: 'Streak Seeker', description: 'Reach a 3-win streak', icon: '🔥', type: 'daily', requirement: 3, chipReward: 400, xpReward: 40, statKey: 'bestStreak' },
];

const WEEKLY_MISSIONS: MissionTemplate[] = [
  { id: 'weekly_play_50', name: 'Weekly Warrior', description: 'Play 50 hands this week', icon: '⚔️', type: 'weekly', requirement: 50, chipReward: 2000, xpReward: 150, statKey: 'handsPlayed' },
  { id: 'weekly_win_20', name: 'Consistent Winner', description: 'Win 20 hands this week', icon: '🏅', type: 'weekly', requirement: 20, chipReward: 3000, xpReward: 200, statKey: 'handsWon' },
  { id: 'weekly_showdown_10', name: 'Showdown King', description: 'Win 10 showdowns this week', icon: '👑', type: 'weekly', requirement: 10, chipReward: 2500, xpReward: 175, statKey: 'showdownWins' },
  { id: 'weekly_streak_5', name: 'Hot Week', description: 'Reach a 5-win streak this week', icon: '♨️', type: 'weekly', requirement: 5, chipReward: 2000, xpReward: 150, statKey: 'bestStreak' },
  { id: 'weekly_big_pot', name: 'Big Fish', description: 'Win a pot over 5,000 chips', icon: '🐠', type: 'weekly', requirement: 5000, chipReward: 3000, xpReward: 200, statKey: 'biggestPotWon' },
];

// ─── Player Stats ────────────────────────────────────────────────────────────

export interface PlayerStats {
  handsPlayed: number;
  handsWon: number;
  showdownWins: number;
  allInWins: number;
  biggestPotWon: number;
  bestStreak: number;
  dailyBonusClaims: number;
  royalFlushes: number;
  comebacks: number;
  badBeatWins: number;
  totalChipsWon: number;
}

const DEFAULT_STATS: PlayerStats = {
  handsPlayed: 0,
  handsWon: 0,
  showdownWins: 0,
  allInWins: 0,
  biggestPotWon: 0,
  bestStreak: 0,
  dailyBonusClaims: 0,
  royalFlushes: 0,
  comebacks: 0,
  badBeatWins: 0,
  totalChipsWon: 0,
};

const STORAGE_KEY_STATS = 'poker_player_stats';
const STORAGE_KEY_ACHIEVEMENTS = 'poker_achievements_unlocked';
const STORAGE_KEY_MISSIONS = 'poker_active_missions';
const STORAGE_KEY_MISSION_PROGRESS = 'poker_mission_progress';

// ─── Stats Persistence ───────────────────────────────────────────────────────

export function getPlayerStats(): PlayerStats {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_STATS };
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STATS);
    if (stored) return { ...DEFAULT_STATS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...DEFAULT_STATS };
}

export function updatePlayerStats(updates: Partial<PlayerStats>): PlayerStats {
  const current = getPlayerStats();
  const updated = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    const k = key as keyof PlayerStats;
    if (k === 'biggestPotWon' || k === 'bestStreak') {
      // These are max-value stats
      updated[k] = Math.max(current[k], value as number);
    } else {
      // These are cumulative stats
      updated[k] = current[k] + (value as number);
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(updated));
  }

  return updated;
}

// ─── Achievement Tracking ────────────────────────────────────────────────────

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  claimed: boolean;
}

export function getUnlockedAchievements(): UnlockedAchievement[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ACHIEVEMENTS);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveUnlockedAchievements(unlocked: UnlockedAchievement[]): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(unlocked));
  }
}

/** Check stats against achievement requirements. Returns newly unlocked achievements. */
export function checkAchievements(stats: PlayerStats): Achievement[] {
  const unlocked = getUnlockedAchievements();
  const unlockedIds = new Set(unlocked.map(a => a.id));
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.has(achievement.id)) continue;

    const statValue = stats[achievement.statKey as keyof PlayerStats] ?? 0;
    if (statValue >= achievement.requirement) {
      newlyUnlocked.push(achievement);
      unlocked.push({
        id: achievement.id,
        unlockedAt: Date.now(),
        claimed: false,
      });
    }
  }

  if (newlyUnlocked.length > 0) {
    saveUnlockedAchievements(unlocked);
  }

  return newlyUnlocked;
}

export function claimAchievementReward(achievementId: string): { chipReward: number; xpReward: number } | null {
  const unlocked = getUnlockedAchievements();
  const entry = unlocked.find(a => a.id === achievementId);
  if (!entry || entry.claimed) return null;

  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!achievement) return null;

  entry.claimed = true;
  saveUnlockedAchievements(unlocked);

  return { chipReward: achievement.chipReward, xpReward: achievement.xpReward };
}

// ─── Mission System ──────────────────────────────────────────────────────────

export interface ActiveMission {
  templateId: string;
  type: MissionType;
  startedAt: number;
  expiresAt: number;
  claimed: boolean;
}

export interface MissionProgress {
  [templateId: string]: number;
}

function getDailyResetTime(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setHours(0, 0, 0, 0);
  reset.setDate(reset.getDate() + 1);
  return reset.getTime();
}

function getWeeklyResetTime(): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const reset = new Date(now);
  reset.setHours(0, 0, 0, 0);
  reset.setDate(reset.getDate() + daysUntilMonday);
  return reset.getTime();
}

/** Deterministic seed from date to pick consistent daily/weekly missions */
function dateSeed(date: Date, type: MissionType): number {
  const d = type === 'daily'
    ? date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
    : date.getFullYear() * 100 + Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  // Simple hash
  let h = d;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return Math.abs(h);
}

function pickMissions(pool: MissionTemplate[], count: number, seed: number): MissionTemplate[] {
  const shuffled = [...pool];
  // Fisher-Yates with seed
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function getActiveMissions(): ActiveMission[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MISSIONS);
    if (stored) {
      const missions: ActiveMission[] = JSON.parse(stored);
      // Filter out expired missions
      const now = Date.now();
      return missions.filter(m => m.expiresAt > now);
    }
  } catch { /* ignore */ }
  return [];
}

function saveActiveMissions(missions: ActiveMission[]): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_MISSIONS, JSON.stringify(missions));
  }
}

export function getMissionProgress(): MissionProgress {
  if (typeof localStorage === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MISSION_PROGRESS);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function saveMissionProgress(progress: MissionProgress): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_MISSION_PROGRESS, JSON.stringify(progress));
  }
}

/** Refresh missions if needed. Returns current active missions. */
export function refreshMissions(): ActiveMission[] {
  const now = new Date();
  let missions = getActiveMissions();
  const currentIds = new Set(missions.map(m => m.templateId));

  // Check if we need new daily missions (pick 3 per day)
  const hasDailyActive = missions.some(m => m.type === 'daily');
  if (!hasDailyActive) {
    const seed = dateSeed(now, 'daily');
    const dailyPicks = pickMissions(DAILY_MISSIONS, 3, seed);
    for (const pick of dailyPicks) {
      if (!currentIds.has(pick.id)) {
        missions.push({
          templateId: pick.id,
          type: 'daily',
          startedAt: Date.now(),
          expiresAt: getDailyResetTime(),
          claimed: false,
        });
      }
    }
    // Reset daily progress
    const progress = getMissionProgress();
    for (const key of Object.keys(progress)) {
      if (key.startsWith('daily_')) {
        progress[key] = 0;
      }
    }
    saveMissionProgress(progress);
  }

  // Check if we need weekly missions (pick 2 per week)
  const hasWeeklyActive = missions.some(m => m.type === 'weekly');
  if (!hasWeeklyActive) {
    const seed = dateSeed(now, 'weekly');
    const weeklyPicks = pickMissions(WEEKLY_MISSIONS, 2, seed);
    for (const pick of weeklyPicks) {
      if (!currentIds.has(pick.id)) {
        missions.push({
          templateId: pick.id,
          type: 'weekly',
          startedAt: Date.now(),
          expiresAt: getWeeklyResetTime(),
          claimed: false,
        });
      }
    }
    // Reset weekly progress
    const progress = getMissionProgress();
    for (const key of Object.keys(progress)) {
      if (key.startsWith('weekly_')) {
        progress[key] = 0;
      }
    }
    saveMissionProgress(progress);
  }

  saveActiveMissions(missions);
  return missions;
}

/** Update mission progress after a game event. Returns completed missions. */
export function updateMissionProgress(statUpdates: Partial<PlayerStats>): MissionTemplate[] {
  const missions = getActiveMissions();
  if (missions.length === 0) return [];

  const progress = getMissionProgress();
  const completed: MissionTemplate[] = [];

  for (const mission of missions) {
    if (mission.claimed) continue;

    const template = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS].find(m => m.id === mission.templateId);
    if (!template) continue;

    const statUpdate = statUpdates[template.statKey as keyof PlayerStats];
    if (statUpdate === undefined) continue;

    // For max-value stats (bestStreak, biggestPotWon), use absolute value
    if (template.statKey === 'bestStreak' || template.statKey === 'biggestPotWon') {
      progress[template.id] = Math.max(progress[template.id] ?? 0, statUpdate as number);
    } else {
      progress[template.id] = (progress[template.id] ?? 0) + (statUpdate as number);
    }

    if (progress[template.id] >= template.requirement && !mission.claimed) {
      completed.push(template);
    }
  }

  saveMissionProgress(progress);
  return completed;
}

export function claimMissionReward(templateId: string): { chipReward: number; xpReward: number } | null {
  const missions = getActiveMissions();
  const mission = missions.find(m => m.templateId === templateId);
  if (!mission || mission.claimed) return null;

  const template = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS].find(m => m.id === templateId);
  if (!template) return null;

  const progress = getMissionProgress();
  if ((progress[templateId] ?? 0) < template.requirement) return null;

  mission.claimed = true;
  saveActiveMissions(missions);

  return { chipReward: template.chipReward, xpReward: template.xpReward };
}

/** Get full mission info with progress for display. */
export function getMissionDisplayData(): Array<{
  template: MissionTemplate;
  progress: number;
  isComplete: boolean;
  isClaimed: boolean;
  expiresAt: number;
}> {
  const missions = refreshMissions();
  const progress = getMissionProgress();
  const allTemplates = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];

  return missions.map(m => {
    const template = allTemplates.find(t => t.id === m.templateId);
    if (!template) return null;
    const prog = progress[template.id] ?? 0;
    return {
      template,
      progress: prog,
      isComplete: prog >= template.requirement,
      isClaimed: m.claimed,
      expiresAt: m.expiresAt,
    };
  }).filter(Boolean) as Array<{
    template: MissionTemplate;
    progress: number;
    isComplete: boolean;
    isClaimed: boolean;
    expiresAt: number;
  }>;
}

/** Get achievement display data. */
export function getAchievementDisplayData(rarityOverrides?: Map<string, AchievementRarity>): Array<{
  achievement: Achievement;
  isUnlocked: boolean;
  isClaimed: boolean;
  progress: number;
  unlockedAt?: number;
  rarity: AchievementRarity;
}> {
  const stats = getPlayerStats();
  const unlocked = getUnlockedAchievements();
  const unlockedMap = new Map(unlocked.map(a => [a.id, a]));

  return ACHIEVEMENTS.map(achievement => {
    const entry = unlockedMap.get(achievement.id);
    const statValue = stats[achievement.statKey as keyof PlayerStats] ?? 0;
    const rarity = rarityOverrides?.get(achievement.id) ?? achievement.rarity;
    return {
      achievement,
      isUnlocked: !!entry,
      isClaimed: entry?.claimed ?? false,
      progress: Math.min(statValue, achievement.requirement),
      unlockedAt: entry?.unlockedAt,
      rarity,
    };
  });
}

/** Compute total achievement points from unlocked achievements. */
export function getTotalAchievementPoints(): number {
  const unlocked = getUnlockedAchievements();
  const unlockedIds = new Set(unlocked.map(a => a.id));
  return ACHIEVEMENTS
    .filter(a => unlockedIds.has(a.id))
    .reduce((sum, a) => sum + a.points, 0);
}
