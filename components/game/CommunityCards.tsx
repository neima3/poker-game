'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { playCardDeal, playChipSplash } from '@/lib/sounds';
import type { GamePhase, RunItTwiceResult } from '@/types/poker';

interface CommunityCardsProps {
  cards: string[];
  phase: GamePhase;
  pot: number;
  ritResult?: RunItTwiceResult;
}

const PHASE_LABELS: Partial<Record<GamePhase, string>> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export function CommunityCards({ cards, phase, pot, ritResult }: CommunityCardsProps) {
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

  // Render a row of 5 board cards, dimming shared (pre-runout) cards
  function BoardRow({ board, sharedCount, label }: { board: string[]; sharedCount: number; label: string }) {
    return (
      <div className="flex flex-col items-center gap-1">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-purple-400/80">{label}</p>
        <div className="flex gap-1.5">
          {board.map((card, i) => (
            <motion.div
              key={`${label}-${i}`}
              initial={i >= sharedCount ? { y: -20, opacity: 0, scale: 0.7 } : false}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{
                duration: 0.4,
                delay: i >= sharedCount ? (i - sharedCount) * 0.12 : 0,
                type: 'spring',
                stiffness: 220,
                damping: 22,
              }}
              className={i < sharedCount ? 'opacity-50' : ''}
            >
              <Card card={card} size="sm" animated={false} />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Pot display */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pot}
          className="glass-gold px-6 py-2 rounded-full border-gold/30 shadow-[0_0_30px_rgba(212,168,67,0.2)] flex items-center gap-3"
          initial={{ scale: 0.9, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="h-4 w-4 rounded-full bg-gold shadow-[0_0_8px_rgba(212,168,67,0.8)]" />
          <span className="text-sm font-black text-gold-light uppercase tracking-widest flex items-center gap-2">
            Pot <span className="text-lg tabular-nums text-white">{pot.toLocaleString()}</span>
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Board cards */}
      {ritResult ? (
        /* Run It Twice: board layout */
        <AnimatePresence>
          <motion.div
            key="rit-boards"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">Run It Twice</span>
            </div>
            <BoardRow board={ritResult.board1} sharedCount={ritResult.sharedBoard.length} label="Run 1" />
            <div className="w-full border-t border-white/5" />
            <BoardRow board={ritResult.board2} sharedCount={ritResult.sharedBoard.length} label="Run 2" />
          </motion.div>
        </AnimatePresence>
      ) : (
        /* Normal Board */
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const card = cards[i];
              const isNew = i >= prevCardsLen.current;
              return (
                <div key={i} className="relative">
                  <motion.div
                    initial={card && isNew ? { y: -60, opacity: 0, scale: 0.5, rotateY: 180, rotate: -5 } : false}
                    animate={card ? { y: 0, opacity: 1, scale: 1, rotateY: 0, rotate: 0 } : {}}
                    transition={{
                      duration: 0.6,
                      delay: isNew ? (i - Math.max(0, prevCardsLen.current)) * 0.12 : 0,
                      type: 'spring',
                      stiffness: 260,
                      damping: 24,
                    }}
                  >
                    {card ? (
                      <Card
                        card={card}
                        size="lg"
                        animated
                        delay={isNew ? (i - Math.max(0, prevCardsLen.current)) * 0.1 : 0}
                      />
                    ) : (
                      <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/10 bg-black/20 flex items-center justify-center">
                        <div className="w-1/2 h-1/2 rounded-full border border-white/5 opacity-20" />
                      </div>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>

          {/* Phase label */}
          <AnimatePresence mode="wait">
            {PHASE_LABELS[phase] && (
              <motion.div
                key={phase}
                className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 text-glow-green"
                initial={{ opacity: 0, letterSpacing: '0.1em' }}
                animate={{ opacity: 1, letterSpacing: '0.3em' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {PHASE_LABELS[phase]}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

