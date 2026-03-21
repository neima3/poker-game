'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, X, Zap } from 'lucide-react';
import type { GameState, RunItTwiceResult, Winner } from '@/types/poker';

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

function WinnerRow({ w, playerId }: { w: Winner; playerId?: string }) {
  const isMe = w.playerId === playerId;
  return (
    <div
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
}

function RITRunSection({
  label,
  board,
  sharedBoard,
  winners,
  playerId,
}: {
  label: string;
  board: string[];
  sharedBoard: string[];
  winners: Winner[];
  playerId?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-purple-400/80 uppercase tracking-wider font-semibold">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {board.map((card, i) => (
          <div key={i} className={i < sharedBoard.length ? 'opacity-50' : ''}>
            <MiniCard card={card} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {winners.map(w => (
          <WinnerRow key={w.playerId} w={w} playerId={playerId} />
        ))}
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
  const rit = gameState.ritResult;

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
                {rit && (
                  <span className="flex items-center gap-1 rounded-full bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                    <Zap className="h-2.5 w-2.5" />
                    Run It Twice
                  </span>
                )}
              </div>
              <button onClick={dismiss} className="text-white/40 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {rit ? (
              /* ── Run It Twice layout ── */
              <div className="px-4 pb-4 flex flex-col gap-4">
                <RITRunSection
                  label="Run 1"
                  board={rit.board1}
                  sharedBoard={rit.sharedBoard}
                  winners={rit.winners1}
                  playerId={playerId}
                />
                <div className="border-t border-white/10" />
                <RITRunSection
                  label="Run 2"
                  board={rit.board2}
                  sharedBoard={rit.sharedBoard}
                  winners={rit.winners2}
                  playerId={playerId}
                />
                {/* Overall totals when someone won both runs */}
                {winners.some(w => {
                  const r1 = rit.winners1.find(x => x.playerId === w.playerId);
                  const r2 = rit.winners2.find(x => x.playerId === w.playerId);
                  return r1 && r2;
                }) && (
                  <div className="border-t border-white/10 pt-2">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Total</p>
                    {winners.map(w => (
                      <div key={w.playerId} className="flex justify-between text-sm">
                        <span className="text-white/70">{w.playerId === playerId ? `${w.username} (You)` : w.username}</span>
                        <span className="text-emerald-400 font-bold">+{w.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── Normal layout ── */
              <>
                {/* Community cards */}
                {gameState.communityCards.length > 0 && (
                  <div className="px-4 py-2">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Board</p>
                    <div className="flex gap-1.5">
                      {gameState.communityCards.map((card, i) => (
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
                  {winners.map(w => (
                    <WinnerRow key={w.playerId} w={w} playerId={playerId} />
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
