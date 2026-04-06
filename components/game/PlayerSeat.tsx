'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from './Card';
import { Timer } from './Timer';
import { HudBadge } from './HudBadge';
import { playCardDeal, playChip } from '@/lib/sounds';
import type { PlayerState, GameState } from '@/types/poker';
import type { PlayerHudStats } from '@/hooks/useHudStats';
import { WifiOff } from 'lucide-react';

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
  disconnectedAt?: number;
  gracePeriodRemaining?: number;
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
  disconnectedAt,
  gracePeriodRemaining,
}: PlayerSeatProps) {
  const initials = player.username.slice(0, 2).toUpperCase();
  const prevCards = useRef<string[]>([]);
  const prevBet = useRef(0);
  const isBot = (player as any).isBot === true;
  const [countdown, setCountdown] = useState<number | null>(null);

  const atShowdown = gameState.phase === 'showdown' || gameState.phase === 'pot_awarded';
  const isDisconnected = disconnectedAt !== undefined || !player.isConnected;
  
  useEffect(() => {
    if (isDisconnected && gracePeriodRemaining !== undefined) {
      setCountdown(Math.ceil(gracePeriodRemaining / 1000));
      const interval = setInterval(() => {
        setCountdown(prev => prev !== null && prev > 0 ? prev - 1 : null);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [isDisconnected, gracePeriodRemaining]);

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
          'relative flex flex-col items-center min-w-[100px] rounded-2xl p-2.5 transition-all duration-300',
          'glass-dark border border-white/10 shadow-2xl backdrop-blur-xl',
          isActive
            ? 'ring-2 ring-yellow-400/90 shadow-[0_0_28px_rgba(250,204,21,0.5),0_0_8px_rgba(250,204,21,0.3)] translate-y-[-4px]'
            : isSelf
            ? 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
            : '',
        )}
      >
        {/* Active turn timer */}
        {isActive && gameState.actionDeadline && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2">
            <Timer deadlineMs={gameState.actionDeadline} />
          </div>
        )}

        {/* Avatar Section */}
        <div className="relative mb-2">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full text-base font-bold shadow-lg transition-transform duration-300',
              isSelf
                ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-400/40'
                : isBot
                ? 'bg-gradient-to-br from-purple-600 to-purple-800 text-white ring-2 ring-purple-400/40'
                : 'bg-gradient-to-br from-gray-600 to-gray-800 text-white ring-2 ring-white/10',
              isActive && 'scale-110 ring-yellow-400 ring-offset-2 ring-offset-black/20'
            )}
          >
            {isBot ? '🤖' : initials}
          </div>
          
          {/* Dealer Button Inline (Small) */}
          {isDealer && (
            <div className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-white text-black border-2 border-black flex items-center justify-center text-[10px] font-black shadow-md">
              D
            </div>
          )}
        </div>

        {/* User Details */}
        <div className="flex flex-col items-center gap-0.5 w-full">
          <span className={cn(
            "max-w-[88px] truncate text-center text-[11px] font-bold tracking-tight",
            isSelf ? "text-blue-400" : "text-white/90"
          )}>
            {player.username}
          </span>

          <motion.div
            key={player.stack}
            className="flex items-center gap-1"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-[12px] font-black text-gold-light tabular-nums tracking-wide">
              {player.stack.toLocaleString()}
            </span>
          </motion.div>
        </div>

        {/* Active Bet - Positioned relative to seat */}
        <AnimatePresence>
          {player.currentBet > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              className={cn(
                "absolute bg-black/80 border border-gold/40 rounded-full px-2 py-0.5 flex items-center gap-1.5 shadow-xl z-30",
                {
                  'top-[-28px]': position === 'bottom' || position === 'bottom-left' || position === 'bottom-right',
                  'bottom-[-28px]': position === 'top' || position === 'top-left' || position === 'top-right',
                  'left-[110%]': position === 'left',
                  'right-[110%]': position === 'right',
                }
              )}
            >
              <div className="h-3 w-3 rounded-full bg-gold shadow-[0_0_5px_rgba(212,168,67,1)]" />
              <span className="text-[11px] font-black text-gold tabular-nums">
                {player.currentBet.toLocaleString()}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Blind Badges */}
        <div className="absolute -top-2 -right-2 flex flex-col gap-1">
          {isSmallBlind && (
            <div className="rounded bg-blue-500/90 text-white px-1 py-0.5 text-[8px] font-black shadow-md border border-blue-400/50">
              SB
            </div>
          )}
          {isBigBlind && (
            <div className="rounded bg-red-500/90 text-white px-1 py-0.5 text-[8px] font-black shadow-md border border-red-400/50">
              BB
            </div>
          )}
        </div>

        {/* Action Status Overlay */}
        <AnimatePresence mode="wait">
          {isDisconnected && !isSelf && countdown !== null ? (
            <motion.div
              key="reconnecting"
              className="mt-1.5 w-full bg-yellow-900/40 rounded py-0.5 flex items-center justify-center gap-1"
            >
              <WifiOff className="h-2.5 w-2.5 text-yellow-400" />
              <span className="text-[9px] text-yellow-400 font-bold uppercase">{countdown}s</span>
            </motion.div>
          ) : player.isFolded ? (
            <motion.div
              key="fold"
              className="mt-1.5 w-full bg-red-900/40 rounded py-0.5 text-[9px] text-red-400 font-black text-center uppercase tracking-wider"
            >
              FOLDED
            </motion.div>
          ) : player.isAllIn ? (
            <motion.div
              key="allin"
              className="mt-1.5 w-full bg-orange-600/60 rounded py-0.5 text-[9px] text-white font-black text-center uppercase tracking-widest animate-pulse"
            >
              ALL-IN
            </motion.div>
          ) : lastAction ? (
            <motion.div
              key={lastAction}
              className="mt-1.5 w-full bg-white/5 rounded py-0.5 text-[9px] text-white/70 font-bold text-center uppercase"
            >
              {actionLabel[lastAction] ?? lastAction}
            </motion.div>
          ) : null}
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
