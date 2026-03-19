'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Trophy, Target, Clock, Gift, ArrowLeft, Lock, Check, Star, Zap } from 'lucide-react';
import {
  getAchievementDisplayData,
  getMissionDisplayData,
  claimAchievementReward,
  claimMissionReward,
  refreshMissions,
  getTotalAchievementPoints,
  RARITY_CONFIG,
  ACHIEVEMENTS,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/achievements';
import { addXp } from '@/lib/progression';
import { playSpinResult, playLevelUp } from '@/lib/sounds';

const CATEGORY_LABELS: Record<AchievementCategory, { label: string; icon: string }> = {
  hands: { label: 'Hands Played', icon: '🃏' },
  winning: { label: 'Winning', icon: '🏆' },
  skill: { label: 'Skill', icon: '🎯' },
  milestone: { label: 'Milestones', icon: '💎' },
  social: { label: 'Social', icon: '🤝' },
};

interface LiveRarityData {
  id: string;
  rarity: AchievementRarity;
  unlockPct: number;
  unlockCount: number;
  isUnlocked: boolean;
  earnedAt: string | null;
}

export default function AchievementsPage() {
  const [tab, setTab] = useState<'achievements' | 'missions'>('achievements');
  const [categoryFilter, setCategoryFilter] = useState<AchievementCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'rarity' | 'unlocked'>('default');
  const [achievements, setAchievements] = useState<ReturnType<typeof getAchievementDisplayData>>([]);
  const [missions, setMissions] = useState<ReturnType<typeof getMissionDisplayData>>([]);
  const [liveData, setLiveData] = useState<Map<string, LiveRarityData>>(new Map());
  const [totalPoints, setTotalPoints] = useState(0);
  const [loadingLive, setLoadingLive] = useState(true);

  // Load localStorage data immediately
  useEffect(() => {
    refreshMissions();
    setAchievements(getAchievementDisplayData());
    setMissions(getMissionDisplayData());
    setTotalPoints(getTotalAchievementPoints());
  }, []);

  // Fetch live rarity data from Supabase
  useEffect(() => {
    fetch('/api/achievements')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.achievements) return;
        const map = new Map<string, LiveRarityData>(
          data.achievements.map((a: LiveRarityData) => [a.id, a])
        );
        setLiveData(map);
        // Re-compute achievements with live rarity overrides
        const rarityOverrides = new Map<string, AchievementRarity>(
          data.achievements.map((a: LiveRarityData) => [a.id, a.rarity])
        );
        setAchievements(getAchievementDisplayData(rarityOverrides));
        if (data.totalPoints != null) setTotalPoints(data.totalPoints);
      })
      .catch(() => { /* offline, use defaults */ })
      .finally(() => setLoadingLive(false));
  }, []);

  const handleClaimAchievement = useCallback((id: string) => {
    const reward = claimAchievementReward(id);
    if (reward) {
      addXp(reward.xpReward);
      playSpinResult();
      setAchievements(getAchievementDisplayData());
      setTotalPoints(getTotalAchievementPoints());
      window.dispatchEvent(new Event('poker_xp_update'));
    }
  }, []);

  const handleClaimMission = useCallback((id: string) => {
    const reward = claimMissionReward(id);
    if (reward) {
      addXp(reward.xpReward);
      playLevelUp();
      setMissions(getMissionDisplayData());
      window.dispatchEvent(new Event('poker_xp_update'));
    }
  }, []);

  const filteredAchievements = (categoryFilter === 'all'
    ? achievements
    : achievements.filter(a => a.achievement.category === categoryFilter)
  ).sort((a, b) => {
    if (sortBy === 'rarity') {
      const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return order[a.rarity] - order[b.rarity];
    }
    if (sortBy === 'unlocked') {
      return Number(b.isUnlocked) - Number(a.isUnlocked);
    }
    return 0;
  });

  const unlockedCount = achievements.filter(a => a.isUnlocked).length;
  const totalCount = achievements.length;

  const formatTimeLeft = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (ts: number | string) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Points breakdown by rarity
  const rarityBreakdown = (['legendary', 'epic', 'rare', 'common'] as AchievementRarity[]).map(r => ({
    rarity: r,
    earned: achievements.filter(a => a.isUnlocked && a.rarity === r).length,
    total: achievements.filter(a => a.rarity === r).length,
  }));

  const maxPoints = ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-gold" />
            Achievements
          </h1>
          <p className="mt-0.5 text-xs text-white/40">
            Earn points by unlocking achievements across all categories
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/lobby" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </Link>
        </Button>
      </div>

      {/* Points & Progress Banner */}
      <div className="mb-6 rounded-xl border border-gold/20 bg-gradient-to-r from-amber-950/40 to-yellow-950/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-gold tabular-nums">{totalPoints.toLocaleString()}</span>
              <span className="text-sm text-white/40">/ {maxPoints.toLocaleString()} pts</span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">Achievement Score</p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-white/80">{unlockedCount}/{totalCount}</span>
            <p className="text-xs text-white/40">Unlocked</p>
          </div>
        </div>
        {/* Overall progress bar */}
        <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-gold to-amber-400"
            initial={{ width: 0 }}
            animate={{ width: `${(unlockedCount / totalCount) * 100}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        {/* Rarity breakdown */}
        <div className="flex gap-3 flex-wrap">
          {rarityBreakdown.map(({ rarity, earned, total }) => {
            const cfg = RARITY_CONFIG[rarity];
            return (
              <div key={rarity} className="flex items-center gap-1.5">
                <div className={cn('h-2 w-2 rounded-full', {
                  'bg-amber-400': rarity === 'legendary',
                  'bg-purple-400': rarity === 'epic',
                  'bg-blue-400': rarity === 'rare',
                  'bg-gray-400': rarity === 'common',
                })} />
                <span className={cn('text-[11px] font-medium', cfg.color)}>
                  {cfg.label}
                </span>
                <span className="text-[11px] text-white/30">{earned}/{total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('achievements')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            tab === 'achievements'
              ? 'bg-gold/20 text-gold border border-gold/30'
              : 'text-white/50 hover:text-white hover:bg-white/5'
          )}
        >
          <Trophy className="h-4 w-4" />
          Achievements
        </button>
        <button
          onClick={() => setTab('missions')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            tab === 'missions'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-white/50 hover:text-white hover:bg-white/5'
          )}
        >
          <Target className="h-4 w-4" />
          Missions
          {missions.some(m => m.isComplete && !m.isClaimed) && (
            <span className="ml-1 flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* Achievements Tab */}
      {tab === 'achievements' && (
        <>
          {/* Filters & Sort */}
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                  categoryFilter === 'all' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
                )}
              >
                All
              </button>
              {(Object.entries(CATEGORY_LABELS) as [AchievementCategory, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-all',
                    categoryFilter === key ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
                  )}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30 mr-1">Sort:</span>
              {([['default', 'Default'], ['rarity', 'Rarity'], ['unlocked', 'Unlocked']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSortBy(val)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-medium transition-all',
                    sortBy === val ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Achievement Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {filteredAchievements.map(({ achievement, isUnlocked, isClaimed, progress, unlockedAt, rarity }) => {
                const cfg = RARITY_CONFIG[rarity];
                const live = liveData.get(achievement.id);
                const pct = Math.min((progress / achievement.requirement) * 100, 100);

                return (
                  <motion.div
                    key={achievement.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      'relative rounded-xl border p-4 transition-all',
                      isUnlocked
                        ? cn(cfg.border, cfg.bg, cfg.glow && `shadow-lg ${cfg.glow}`)
                        : achievement.secret && !isUnlocked
                        ? 'border-white/5 bg-white/[0.02] opacity-50'
                        : 'border-white/10 bg-white/[0.03]'
                    )}
                  >
                    {/* Rarity badge */}
                    <div className={cn(
                      'absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                      isUnlocked || !achievement.secret ? cfg.color : 'text-white/20',
                      'opacity-80'
                    )}>
                      {cfg.label}
                    </div>

                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl',
                        isUnlocked ? cfg.bg : 'bg-white/5',
                        isUnlocked && rarity === 'legendary' && 'ring-1 ring-amber-400/40',
                        isUnlocked && rarity === 'epic' && 'ring-1 ring-purple-400/40',
                        isUnlocked && rarity === 'rare' && 'ring-1 ring-blue-400/40',
                      )}>
                        {achievement.secret && !isUnlocked ? <Lock className="h-5 w-5 text-white/20" /> : achievement.icon}
                        {isUnlocked && (
                          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pr-8">
                        <div className="flex items-center gap-1.5">
                          <p className={cn('text-sm font-semibold truncate', isUnlocked ? cfg.color : 'text-white/70')}>
                            {achievement.secret && !isUnlocked ? '???' : achievement.name}
                          </p>
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {achievement.secret && !isUnlocked ? 'Secret achievement' : achievement.description}
                        </p>

                        {/* Points */}
                        <div className="flex items-center gap-1 mt-1">
                          <Zap className="h-3 w-3 text-gold/60" />
                          <span className="text-[10px] text-gold/60 font-medium">{achievement.points} pts</span>
                          {live && !loadingLive && (
                            <span className="text-[10px] text-white/20 ml-1">
                              · {live.unlockCount > 0 ? `${live.unlockPct}% unlocked` : 'First to unlock!'}
                            </span>
                          )}
                        </div>

                        {/* Progress bar for locked achievements */}
                        {!isUnlocked && !achievement.secret && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-white/30 mb-0.5">
                              <span>{progress.toLocaleString()}/{achievement.requirement.toLocaleString()}</span>
                              <span>{Math.round(pct)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <motion.div
                                className={cn('h-full rounded-full transition-all', {
                                  'bg-amber-400': rarity === 'legendary',
                                  'bg-purple-400': rarity === 'epic',
                                  'bg-blue-400': rarity === 'rare',
                                  'bg-gray-400': rarity === 'common',
                                })}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Earn date for unlocked */}
                        {isUnlocked && unlockedAt && (
                          <p className="mt-1 text-[10px] text-white/25">
                            Earned {formatDate(unlockedAt)}
                          </p>
                        )}

                        {/* Claim button */}
                        {isUnlocked && !isClaimed && (
                          <button
                            onClick={() => handleClaimAchievement(achievement.id)}
                            className="mt-2 flex items-center gap-1.5 rounded-md bg-gold/20 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/30 transition-colors animate-pulse"
                          >
                            <Gift className="h-3 w-3" />
                            Claim {achievement.chipReward.toLocaleString()} + {achievement.xpReward} XP
                          </button>
                        )}
                        {isUnlocked && isClaimed && (
                          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400/60">
                            <Check className="h-3 w-3" /> Reward claimed
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Missions Tab */}
      {tab === 'missions' && (
        <div className="space-y-3">
          {missions.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <Target className="mx-auto h-8 w-8 text-white/20 mb-2" />
              <p className="text-sm text-white/40">No active missions. Play a hand to generate missions!</p>
            </div>
          ) : (
            <>
              {/* Daily Missions */}
              {missions.filter(m => m.template.type === 'daily').length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white/60">
                    <Star className="h-4 w-4 text-gold" />
                    Daily Missions
                    <span className="text-[10px] text-white/30 ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeLeft(missions.find(m => m.template.type === 'daily')?.expiresAt ?? 0)}
                    </span>
                  </h3>
                  {missions.filter(m => m.template.type === 'daily').map(({ template, progress, isComplete, isClaimed }) => (
                    <MissionCard
                      key={template.id}
                      template={template}
                      progress={progress}
                      isComplete={isComplete}
                      isClaimed={isClaimed}
                      onClaim={() => handleClaimMission(template.id)}
                    />
                  ))}
                </div>
              )}

              {/* Weekly Missions */}
              {missions.filter(m => m.template.type === 'weekly').length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white/60">
                    <Star className="h-4 w-4 text-purple-400" />
                    Weekly Missions
                    <span className="text-[10px] text-white/30 ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeLeft(missions.find(m => m.template.type === 'weekly')?.expiresAt ?? 0)}
                    </span>
                  </h3>
                  {missions.filter(m => m.template.type === 'weekly').map(({ template, progress, isComplete, isClaimed }) => (
                    <MissionCard
                      key={template.id}
                      template={template}
                      progress={progress}
                      isComplete={isComplete}
                      isClaimed={isClaimed}
                      onClaim={() => handleClaimMission(template.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MissionCard({
  template,
  progress,
  isComplete,
  isClaimed,
  onClaim,
}: {
  template: { id: string; name: string; description: string; icon: string; requirement: number; chipReward: number; xpReward: number; type: string };
  progress: number;
  isComplete: boolean;
  isClaimed: boolean;
  onClaim: () => void;
}) {
  const pct = Math.min((progress / template.requirement) * 100, 100);
  const borderColor = template.type === 'weekly' ? 'border-purple-500/30' : 'border-emerald-500/30';
  const progressColor = template.type === 'weekly' ? 'bg-purple-500' : 'bg-emerald-500';

  return (
    <div className={cn(
      'rounded-xl border p-4 mb-2 transition-all',
      isComplete && !isClaimed
        ? `${borderColor} bg-emerald-950/20`
        : 'border-white/10 bg-white/[0.03]'
    )}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">
          {template.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white/80">{template.name}</p>
            {isClaimed && <Check className="h-3.5 w-3.5 text-emerald-400" />}
          </div>
          <p className="text-xs text-white/40">{template.description}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', progressColor)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[10px] text-white/30 whitespace-nowrap">
              {progress}/{template.requirement}
            </span>
          </div>
        </div>
        {isComplete && !isClaimed && (
          <button
            onClick={onClaim}
            className="shrink-0 flex items-center gap-1 rounded-md bg-gold/20 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/30 transition-colors"
          >
            <Gift className="h-3 w-3" />
            Claim
          </button>
        )}
      </div>
    </div>
  );
}
