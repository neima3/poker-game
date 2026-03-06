'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChipAnimationProps {
  /** Trigger ID — changes each time a new animation should play */
  triggerId: string | null;
  /** Direction: 'to-pot' = chips fly toward center, 'from-pot' = chips fly from center */
  direction: 'to-pot' | 'from-pot';
  /** Seat position label to calculate animation vector */
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Amount to display on the chip stack */
  amount?: number;
}

const VECTORS: Record<string, { x: number; y: number }> = {
  top: { x: 0, y: 50 },
  bottom: { x: 0, y: -50 },
  left: { x: 50, y: 0 },
  right: { x: -50, y: 0 },
  'top-left': { x: 35, y: 35 },
  'top-right': { x: -35, y: 35 },
  'bottom-left': { x: 35, y: -35 },
  'bottom-right': { x: -35, y: -35 },
};

export function ChipAnimation({ triggerId, direction, position, amount }: ChipAnimationProps) {
  const vec = VECTORS[position] ?? { x: 0, y: -40 };

  // For 'to-pot': start at seat (0,0), fly to pot center (vec)
  // For 'from-pot': start at pot center (vec), fly to seat (0,0)
  const initial = direction === 'to-pot'
    ? { x: 0, y: 0, opacity: 1, scale: 1 }
    : { x: vec.x, y: vec.y, opacity: 1, scale: 0.6 };

  const animate = direction === 'to-pot'
    ? { x: vec.x, y: vec.y, opacity: 0, scale: 0.6 }
    : { x: 0, y: 0, opacity: 1, scale: 1 };

  return (
    <AnimatePresence>
      {triggerId && (
        <motion.div
          key={triggerId}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
          initial={initial}
          animate={animate}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div className="flex items-center gap-0.5">
            {/* Chip stack visual */}
            <div className="relative">
              <div className="h-4 w-4 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border border-yellow-300/50 shadow-md" />
              <div className="absolute -top-0.5 left-0.5 h-4 w-4 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 border border-yellow-400/30 -z-10" />
            </div>
            {amount && amount > 0 && (
              <span className="text-[9px] font-bold text-gold drop-shadow-md whitespace-nowrap">
                {amount.toLocaleString()}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PotWinAnimationProps {
  /** Winner seat positions to animate to */
  winners: { position: string; amount: number; id: string }[];
  show: boolean;
}

export function PotWinAnimation({ winners, show }: PotWinAnimationProps) {
  return (
    <AnimatePresence>
      {show && winners.map((winner, i) => {
        const vec = VECTORS[winner.position] ?? { x: 0, y: -40 };
        return (
          <motion.div
            key={winner.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: vec.x * 2,
              y: vec.y * 2,
              opacity: 0,
              scale: 1.2,
            }}
            transition={{
              duration: 0.7,
              delay: 0.3 + i * 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            <div className="flex items-center gap-1">
              <div className="relative">
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border border-yellow-300/50 shadow-lg" />
                <div className="absolute -top-0.5 left-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 border border-yellow-400/30 -z-10" />
                <div className="absolute -top-1 left-1 h-5 w-5 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-800 border border-yellow-400/20 -z-20" />
              </div>
              <span className="text-xs font-bold text-gold drop-shadow-lg whitespace-nowrap">
                +{winner.amount.toLocaleString()}
              </span>
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
