'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { getLevelFromXp, getStoredXp } from '@/lib/progression';
import { useEffect, useState } from 'react';

interface LevelBadgeProps {
  /** Compact mode for header/table display */
  compact?: boolean;
  /** Show XP progress bar */
  showProgress?: boolean;
}

export function LevelBadge({ compact = false, showProgress = false }: LevelBadgeProps) {
  const [xp, setXp] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setXp(getStoredXp());

    // Listen for XP changes
    const handler = () => setXp(getStoredXp());
    window.addEventListener('poker_xp_update', handler);
    return () => window.removeEventListener('poker_xp_update', handler);
  }, []);

  if (!mounted) return null;

  const level = getLevelFromXp(xp);
  const progress = level.maxXp > level.minXp
    ? ((xp - level.minXp) / (level.maxXp - level.minXp)) * 100
    : 100;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
        style={{ backgroundColor: level.color + '20', color: level.color }}
        title={`${level.tier} ${level.level} — ${xp} XP`}
      >
        {level.icon} {level.tier} {level.level}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">{level.icon}</span>
        <span className="font-bold" style={{ color: level.color }}>
          {level.tier} {level.level}
        </span>
        <span className="text-xs text-muted-foreground">
          {xp.toLocaleString()} XP
        </span>
      </div>
      {showProgress && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ backgroundColor: level.color }}
          />
        </div>
      )}
    </div>
  );
}

/** Animated level up notification */
export function LevelUpNotification({
  show,
  level,
  onDone,
}: {
  show: boolean;
  level: { tier: string; level: number; icon: string; color: string };
  onDone: () => void;
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onDone, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="fixed top-28 left-1/2 z-50 -translate-x-1/2"
        >
          <div
            className="flex flex-col items-center gap-1 rounded-xl border-2 px-8 py-4 shadow-2xl backdrop-blur-md"
            style={{
              borderColor: level.color,
              backgroundColor: 'rgba(0,0,0,0.85)',
              boxShadow: `0 0 40px ${level.color}40`,
            }}
          >
            <motion.span
              className="text-3xl"
              animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {level.icon}
            </motion.span>
            <span className="text-xs font-bold uppercase tracking-widest text-gold">
              Level Up!
            </span>
            <span className="font-bold text-lg" style={{ color: level.color }}>
              {level.tier} {level.level}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
