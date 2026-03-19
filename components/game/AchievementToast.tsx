'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';
import type { Achievement, MissionTemplate } from '@/lib/achievements';
import { RARITY_CONFIG } from '@/lib/achievements';

interface AchievementToastProps {
  achievement: Achievement | null;
  show: boolean;
  onDone: () => void;
}

export function AchievementToast({ achievement, show, onDone }: AchievementToastProps) {
  if (!achievement) return null;

  const cfg = RARITY_CONFIG[achievement.rarity];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed top-20 left-1/2 z-[100] -translate-x-1/2"
          initial={{ opacity: 0, y: -40, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          onAnimationComplete={(def: { opacity?: number }) => {
            if (def.opacity === 1) {
              setTimeout(onDone, 3000);
            }
          }}
        >
          <div className={cn(
            'flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl backdrop-blur-md',
            cfg.border,
            'bg-gradient-to-r from-black/90 to-black/80',
          )}>
            {/* Rarity glow ring around icon */}
            <div className={cn(
              'flex h-12 w-12 items-center justify-center rounded-lg text-2xl ring-1',
              cfg.bg,
              {
                'ring-amber-400/50': achievement.rarity === 'legendary',
                'ring-purple-400/50': achievement.rarity === 'epic',
                'ring-blue-400/50': achievement.rarity === 'rare',
                'ring-gray-400/30': achievement.rarity === 'common',
              }
            )}>
              {achievement.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gold">
                  Achievement Unlocked!
                </p>
                <span className={cn('text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5', cfg.color, cfg.bg)}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm font-semibold text-white">{achievement.name}</p>
              <p className="text-xs text-white/50">{achievement.description}</p>
            </div>
            <div className="ml-2 flex flex-col items-end gap-0.5">
              <span className="text-xs font-bold text-gold">+{achievement.chipReward.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400">+{achievement.xpReward} XP</span>
              <span className={cn('text-[10px] font-semibold flex items-center gap-0.5', cfg.color)}>
                <Zap className="h-2.5 w-2.5" />
                {achievement.points} pts
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MissionCompleteToastProps {
  mission: MissionTemplate | null;
  show: boolean;
  onDone: () => void;
}

export function MissionCompleteToast({ mission, show, onDone }: MissionCompleteToastProps) {
  if (!mission) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed top-20 left-1/2 z-[100] -translate-x-1/2"
          initial={{ opacity: 0, y: -40, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          onAnimationComplete={(def: { opacity?: number }) => {
            if (def.opacity === 1) {
              setTimeout(onDone, 3000);
            }
          }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/95 to-green-950/95 px-5 py-3 shadow-2xl backdrop-blur-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20 text-2xl">
              {mission.icon}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Mission Complete!
              </p>
              <p className="text-sm font-semibold text-white">{mission.name}</p>
              <p className="text-xs text-white/50">{mission.description}</p>
            </div>
            <div className="ml-2 flex flex-col items-end gap-0.5">
              <span className="text-xs font-bold text-gold">+{mission.chipReward.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400">+{mission.xpReward} XP</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
