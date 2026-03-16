'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { getStreakBadge } from '@/lib/progression';

interface WinStreakBannerProps {
  streak: number;
  show: boolean;
}

export function WinStreakBanner({ streak, show }: WinStreakBannerProps) {
  const badge = getStreakBadge(streak);
  if (!badge) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="fixed top-20 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-full border border-gold/40 bg-gradient-to-r from-orange-900/90 to-red-900/90 px-5 py-2.5 shadow-lg shadow-orange-500/20 backdrop-blur-sm">
            <span className="text-xl">{badge.emoji}</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-widest text-gold uppercase">
                {badge.label}
              </span>
              <span className="text-xs text-orange-200">
                {streak} wins in a row! +{badge.chipBonus} bonus chips
              </span>
            </div>
            <span className="text-xl">{badge.emoji}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
