'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { playCardDeal, playChipSplash } from '@/lib/sounds';
import type { GamePhase } from '@/types/poker';

interface CommunityCardsProps {
  cards: string[];
  phase: GamePhase;
  pot: number;
}

const PHASE_LABELS: Partial<Record<GamePhase, string>> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export function CommunityCards({ cards, phase, pot }: CommunityCardsProps) {
  const prevCardsLen = useRef(0);
  const prevPot = useRef(0);

  // Play deal sounds when new community cards appear
  useEffect(() => {
    if (cards.length > prevCardsLen.current) {
      const newCards = cards.length - prevCardsLen.current;
      for (let i = 0; i < newCards; i++) {
        setTimeout(() => playCardDeal(), i * 120);
      }
    }
    prevCardsLen.current = cards.length;
  }, [cards.length]);

  // Play chip sound when pot increases
  useEffect(() => {
    if (pot > prevPot.current && prevPot.current > 0) {
      playChipSplash();
    }
    prevPot.current = pot;
  }, [pot]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pot display */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pot}
          className="rounded-full bg-black/50 px-4 py-1.5 text-sm font-semibold text-gold backdrop-blur-sm border border-gold/20"
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          Pot: {pot.toLocaleString()}
        </motion.div>
      </AnimatePresence>

      {/* Community cards */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => {
          const card = cards[i];
          return (
            <motion.div
              key={i}
              initial={card ? { y: -20, opacity: 0 } : false}
              animate={card ? { y: 0, opacity: 1 } : {}}
              transition={{ duration: 0.25, delay: (i < prevCardsLen.current ? 0 : (i - Math.max(0, prevCardsLen.current - 1))) * 0.1 }}
            >
              {card ? (
                <Card
                  card={card}
                  size="lg"
                  animated
                  delay={i < 3 ? i * 0.08 : 0}
                />
              ) : (
                <div className="h-20 w-14 rounded-md border border-white/5 bg-white/[0.03]" />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Phase label */}
      <AnimatePresence mode="wait">
        {PHASE_LABELS[phase] && (
          <motion.div
            key={phase}
            className="text-xs font-medium uppercase tracking-wider text-white/50"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {PHASE_LABELS[phase]}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
