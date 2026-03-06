'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import type { GameState } from '@/types/poker';

interface HandSummaryProps {
  gameState: Omit<GameState, 'deck'> | null;
  playerId?: string;
}

const SUIT_SYMBOLS: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS: Record<string, string> = { h: '#ef4444', d: '#ef4444', c: '#22c55e', s: '#e2e8f0' };

function MiniCard({ card }: { card: string }) {
  if (!card || card === '??') {
    return (
      <div className="w-8 h-11 rounded bg-blue-900/80 border border-white/20 flex items-center justify-center text-xs text-white/40">
        ?
      </div>
    );
  }
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  const color = SUIT_COLORS[suit] ?? '#fff';
  return (
    <div
      className="w-8 h-11 rounded bg-white border border-gray-200 flex flex-col items-start justify-between p-0.5 select-none"
    >
      <div className="text-[9px] font-bold leading-none" style={{ color }}>
        {rank}<br />{symbol}
      </div>
      <div className="text-[9px] font-bold leading-none rotate-180 self-end" style={{ color }}>
        {rank}<br />{symbol}
      </div>
    </div>
  );
}

export function HandSummary({ gameState, playerId }: HandSummaryProps) {
  const [visible, setVisible] = useState(false);
  const [dismissedPhase, setDismissedPhase] = useState<string | null>(null);

  useEffect(() => {
    if (gameState?.phase === 'pot_awarded' && dismissedPhase !== 'pot_awarded') {
      const t = setTimeout(() => setVisible(true), 1800); // Show after win animation
      return () => clearTimeout(t);
    }
    if (gameState?.phase !== 'pot_awarded') {
      setVisible(false);
      setDismissedPhase(null);
    }
  }, [gameState?.phase, dismissedPhase]);

  function dismiss() {
    setVisible(false);
    setDismissedPhase('pot_awarded');
  }

  if (!gameState || gameState.phase !== 'pot_awarded') return null;

  const winners = gameState.winners ?? [];
  const communityCards = gameState.communityCards;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
        >
          <div className="rounded-2xl bg-black/90 border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold text-white">Hand Summary</span>
              </div>
              <button onClick={dismiss} className="text-white/40 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Community cards */}
            {communityCards.length > 0 && (
              <div className="px-4 py-2">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Board</p>
                <div className="flex gap-1.5">
                  {communityCards.map((card, i) => (
                    <MiniCard key={i} card={card} />
                  ))}
                </div>
              </div>
            )}

            {/* Winners */}
            <div className="px-4 pb-4 flex flex-col gap-2">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">
                {winners.length > 1 ? 'Winners' : 'Winner'}
              </p>
              {winners.map(w => {
                const isMe = w.playerId === playerId;
                return (
                  <div
                    key={w.playerId}
                    className={`rounded-xl p-3 flex items-start justify-between gap-3 ${
                      isMe ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-semibold text-sm text-white truncate">
                        {isMe ? `${w.username} (You)` : w.username}
                      </span>
                      {w.handName && (
                        <span className="text-xs text-white/50">{w.handName}</span>
                      )}
                      {/* Winner's hole cards */}
                      {w.cards && w.cards.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {w.cards.slice(0, 2).map((card, i) => (
                            <MiniCard key={i} card={card} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-emerald-400 font-bold text-sm">
                        +{w.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-white/30">chips</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
