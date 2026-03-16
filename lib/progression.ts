/**
 * Player Progression System
 * - XP & Levels (Bronze → Diamond)
 * - Win Streaks with bonuses
 *
 * All state stored in localStorage for MVP.
 * Can be migrated to DB columns later.
 */

// ─── Level System ──────────────────────────────────────────────────────────────

export interface PlayerLevel {
  tier: string;
  level: number;
  icon: string;
  color: string;
  minXp: number;
  maxXp: number; // XP needed for next level
}

export const TIERS = [
  { name: 'Bronze', icon: '🥉', color: '#CD7F32', levels: 5, baseXp: 0, xpPerLevel: 200 },
  { name: 'Silver', icon: '🥈', color: '#C0C0C0', levels: 5, baseXp: 1000, xpPerLevel: 400 },
  { name: 'Gold', icon: '🥇', color: '#FFD700', levels: 5, baseXp: 3000, xpPerLevel: 600 },
  { name: 'Platinum', icon: '💎', color: '#E5E4E2', levels: 5, baseXp: 6000, xpPerLevel: 1000 },
  { name: 'Diamond', icon: '👑', color: '#B9F2FF', levels: 10, baseXp: 11000, xpPerLevel: 1500 },
] as const;

export function getXpForLevel(tierIdx: number, levelInTier: number): number {
  const tier = TIERS[tierIdx];
  let xp = tier.baseXp;
  for (let i = 0; i < levelInTier; i++) {
    xp += tier.xpPerLevel + i * 50;
  }
  return xp;
}

export function getLevelFromXp(totalXp: number): PlayerLevel {
  for (let t = TIERS.length - 1; t >= 0; t--) {
    const tier = TIERS[t];
    for (let l = tier.levels - 1; l >= 0; l--) {
      const required = getXpForLevel(t, l);
      if (totalXp >= required) {
        const nextLevelXp = l < tier.levels - 1
          ? getXpForLevel(t, l + 1)
          : t < TIERS.length - 1
            ? getXpForLevel(t + 1, 0)
            : required + tier.xpPerLevel + l * 50;

        return {
          tier: tier.name,
          level: l + 1,
          icon: tier.icon,
          color: tier.color,
          minXp: required,
          maxXp: nextLevelXp,
        };
      }
    }
  }
  // Default: Bronze 1
  return {
    tier: 'Bronze',
    level: 1,
    icon: '🥉',
    color: '#CD7F32',
    minXp: 0,
    maxXp: getXpForLevel(0, 1),
  };
}

// XP rewards for actions
export const XP_REWARDS = {
  handPlayed: 10,
  handWon: 25,
  showdownWin: 40,  // Win at showdown (not by all fold)
  bigPotWin: 50,    // Win pot > 10x big blind
  streak3: 30,      // 3 win streak bonus
  streak5: 75,      // 5 win streak bonus
  streak10: 200,    // 10 win streak bonus
  dailyBonus: 15,   // Claiming daily bonus
} as const;

// ─── Win Streaks ─────────────────────────────────────────────────────────────

export interface StreakInfo {
  current: number;
  best: number;
  lastWinTimestamp: number;
}

export function getStreakBadge(streak: number): { label: string; emoji: string; chipBonus: number } | null {
  if (streak >= 10) return { label: 'UNSTOPPABLE', emoji: '🔥', chipBonus: 500 };
  if (streak >= 7) return { label: 'ON FIRE', emoji: '🔥', chipBonus: 250 };
  if (streak >= 5) return { label: 'HOT STREAK', emoji: '♨️', chipBonus: 100 };
  if (streak >= 3) return { label: 'WINNING', emoji: '⚡', chipBonus: 50 };
  return null;
}

// ─── LocalStorage Persistence ─────────────────────────────────────────────────

const STORAGE_KEY_XP = 'poker_player_xp';
const STORAGE_KEY_STREAK = 'poker_win_streak';

export function getStoredXp(): number {
  if (typeof localStorage === 'undefined') return 0;
  return parseInt(localStorage.getItem(STORAGE_KEY_XP) ?? '0', 10);
}

export function addXp(amount: number): { newXp: number; leveledUp: boolean; oldLevel: PlayerLevel; newLevel: PlayerLevel } {
  const oldXp = getStoredXp();
  const newXp = oldXp + amount;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_XP, String(newXp));
  }
  const oldLevel = getLevelFromXp(oldXp);
  const newLevel = getLevelFromXp(newXp);
  const leveledUp = oldLevel.tier !== newLevel.tier || oldLevel.level !== newLevel.level;
  return { newXp, leveledUp, oldLevel, newLevel };
}

export function getStoredStreak(): StreakInfo {
  if (typeof localStorage === 'undefined') return { current: 0, best: 0, lastWinTimestamp: 0 };
  try {
    const stored = localStorage.getItem(STORAGE_KEY_STREAK);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { current: 0, best: 0, lastWinTimestamp: 0 };
}

export function recordWin(): { streak: StreakInfo; xpGained: number; levelResult: ReturnType<typeof addXp> } {
  const streak = getStoredStreak();

  // Reset streak if last win was > 2 hours ago (session-based streaks)
  const timeSinceLastWin = Date.now() - streak.lastWinTimestamp;
  if (timeSinceLastWin > 2 * 60 * 60 * 1000) {
    streak.current = 0;
  }

  streak.current += 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastWinTimestamp = Date.now();

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_STREAK, JSON.stringify(streak));
  }

  // Calculate XP
  let xpGained = XP_REWARDS.handWon;
  if (streak.current === 3) xpGained += XP_REWARDS.streak3;
  if (streak.current === 5) xpGained += XP_REWARDS.streak5;
  if (streak.current === 10) xpGained += XP_REWARDS.streak10;

  const levelResult = addXp(xpGained);

  return { streak, xpGained, levelResult };
}

export function recordLoss(): void {
  const streak = getStoredStreak();
  streak.current = 0;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_STREAK, JSON.stringify(streak));
  }
  // Still get XP for playing
  addXp(XP_REWARDS.handPlayed);
}
