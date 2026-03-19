'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from './Card';
import { Timer } from './Timer';
import { HudBadge } from './HudBadge';
import { playCardDeal, playChip } from '@/lib/sounds';
import type { PlayerState, GameState } from '@/types/poker';
import type { PlayerHudStats } from '@/hooks/useHudStats';

interface PlayerSeatProps {
  player: PlayerState;
  isActive: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isSelf: boolean;
  gameState: Omit<GameState, 'deck'>;
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  hudStats?: PlayerHudStats;
  showHud?: boolean;
}

export function PlayerSeat({
  player,
  isActive,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isSelf,
  gameState,
  position,
  hudStats,
  showHud = true,
}: PlayerSeatProps) {
  const initials = player.username.slice(0, 2).toUpperCase();
  const prevCards = useRef<string[]>([]);
  const prevBet = useRef(0);
  const isBot = (player as any).isBot === true;

  const atShowdown = gameState.phase === 'showdown' || gameState.phase === 'pot_awarded';

  // Sound: card dealt to this player
  useEffect(() => {
    const cards = player.cards ?? [];
    if (cards.length > prevCards.current.length && cards.length > 0 && !cards.includes('??')) {
      playCardDeal();
    }
    prevCards.current = cards;
  }, [player.cards]);

  // Sound: player posts chips (blind or bet)
  useEffect(() => {
    if (player.currentBet > prevBet.current) {
      playChip();
    }
    prevBet.current = player.currentBet;
  }, [player.currentBet]);

  const lastAction = player.lastAction;
  const actionLabel: Record<string, string> = {
    fold: 'FOLD', check: 'CHECK', call: 'CALL',
    bet: 'BET', raise: 'RAISE', 'all-in': 'ALL IN',
  };

  return (
    <motion.div
      className={cn(
        'flex flex-col items-center gap-1',
        player.isFolded && 'opacity-40'
      )}
      animate={{ scale: isActive ? 1.06 : 1 }}
      transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
    >
      {/* Hole cards - fly in from table center */}
      {player.cards && player.cards.length > 0 && (
        <div className="flex gap-1">
          {player.cards.map((card, i) => {
            // Calculate fly-in direction based on seat position
            const flyFrom = {
              top: { x: 0, y: 60 },
              bottom: { x: 0, y: -60 },
              left: { x: 60, y: 0 },
              right: { x: -60, y: 0 },
              'top-left': { x: 40, y: 40 },
              'top-right': { x: -40, y: 40 },
              'bottom-left': { x: 40, y: -40 },
              'bottom-right': { x: -40, y: -40 },
            }[position] ?? { x: 0, y: -30 };

            return (
              <motion.div
                key={`${card}-${i}`}
                initial={{ opacity: 0, x: flyFrom.x, y: flyFrom.y, rotate: 0, scale: 0.5 }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: i === 0 ? -3 : 3, scale: 1 }}
                transition={{
                  delay: i * 0.12,
                  type: 'spring',
                  stiffness: 300,
                  damping: 22,
                  mass: 0.8,
                }}
              >
                <Card
                  card={card}
                  size="sm"
                  faceDown={card === '??' || (!isSelf && !atShowdown)}
                  animated={isSelf || atShowdown}
                  delay={i * 0.08}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Avatar + info box */}
      <div
        className={cn(
          'relative flex flex-col items-center rounded-xl p-2 transition-all duration-200',
          'bg-black/60 backdrop-blur-sm border',
          isActive
            ? 'border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.4)]'
            : isSelf
            ? 'border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
            : 'border-white/10',
        )}
      >
        {/* Active turn timer */}
        {isActive && gameState.actionDeadline && (
          <div className="absolute -top-9">
            <Timer deadlineMs={gameState.actionDeadline} />
          </div>
        )}

        {/* Avatar */}
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ring-2',
            isSelf
              ? 'bg-blue-600 text-white ring-blue-400/30'
              : isBot
              ? 'bg-purple-700 text-white ring-purple-400/30'
              : 'bg-gray-700 text-white ring-white/5',
            isActive && 'ring-yellow-400/50'
          )}
        >
          {isBot ? '🤖' : initials}
        </div>

        {/* Username */}
        <span className="mt-1 max-w-[72px] truncate text-center text-[10px] font-medium text-white">
          {player.username}
          {isSelf && ' (You)'}
        </span>

        {/* Stack */}
        <motion.span
          key={player.stack}
          className="text-[11px] font-bold text-gold tabular-nums"
          animate={{ scale: [1.2, 1] }}
          transition={{ duration: 0.25 }}
        >
          {player.stack.toLocaleString()}
        </motion.span>

        {/* Current bet - with chip icon animation */}
        <AnimatePresence>
          {player.currentBet > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex items-center gap-1"
            >
              <span className="text-[10px]">🪙</span>
              <span className="text-[10px] font-semibold text-gold">
                {player.currentBet.toLocaleString()}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status / last action badge */}
        <AnimatePresence mode="wait">
          {player.isFolded ? (
            <motion.span
              key="fold"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-0.5 rounded bg-red-900/60 px-1 text-[9px] text-red-300 font-medium"
            >
              FOLD
            </motion.span>
          ) : player.isAllIn ? (
            <motion.span
              key="allin"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-0.5 rounded bg-orange-900/60 px-1 text-[9px] text-orange-300 font-medium"
            >
              ALL-IN
            </motion.span>
          ) : lastAction ? (
            <motion.span
              key={lastAction}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-0.5 rounded bg-white/10 px-1 text-[9px] text-white/50 uppercase"
            >
              {actionLabel[lastAction] ?? lastAction}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Dealer / Blind tokens */}
      <div className="flex gap-1">
        <AnimatePresence>
          {isDealer && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-white text-black px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              D
            </motion.span>
          )}
          {isSmallBlind && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-blue-500 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              SB
            </motion.span>
          )}
          {isBigBlind && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              BB
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* HUD stats badge (opponents only, when enabled) */}
      <AnimatePresence>
        {showHud && !isSelf && hudStats && hudStats.handsPlayed > 0 && (
          <HudBadge stats={hudStats} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Empty seat placeholder
export function EmptySeat({
  seatNumber,
  onSit,
}: {
  seatNumber: number;
  onSit: (seat: number) => void;
}) {
  return (
    <motion.button
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-3',
        'hover:border-white/30 hover:bg-black/50 transition-all'
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onSit(seatNumber)}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/20 text-white/30 text-xl">
        +
      </div>
      <span className="text-[10px] text-white/30">Sit Here</span>
    </motion.button>
  );
}
