'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CommunityCards } from './CommunityCards';
import { PlayerSeat, EmptySeat } from './PlayerSeat';
import { WinnerCelebration } from './WinnerCelebration';
import { ChipAnimation, PotWinAnimation } from './ChipAnimation';
import type { GameState, SeatRow, ActionType } from '@/types/poker';

type Position = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type SeatPosition = { label: Position; className?: string };

// Seat positions around the table for 2/6/9 player tables
const SEAT_POSITIONS_2: SeatPosition[] = [
  { label: 'bottom' as const },
  { label: 'top' as const },
];

const SEAT_POSITIONS_6: SeatPosition[] = [
  { label: 'bottom' as const },
  { label: 'bottom-right' as const },
  { label: 'top-right' as const },
  { label: 'top' as const },
  { label: 'top-left' as const },
  { label: 'bottom-left' as const },
];

const SEAT_POSITIONS_9: SeatPosition[] = [
  { label: 'bottom' as const },
  { label: 'bottom-right' as const },
  { label: 'right' as const },
  { label: 'top-right' as const },
  { label: 'top' as const },
  { label: 'top-left' as const },
  { label: 'left' as const },
  { label: 'bottom-left' as const },
  { label: 'bottom' as const, className: 'left-[28%]' },
];

function positionClass(pos: Position): string {
  const map: Record<Position, string> = {
    top: 'top-2 left-1/2 -translate-x-1/2',
    bottom: 'bottom-2 left-1/2 -translate-x-1/2',
    left: 'left-2 top-1/2 -translate-y-1/2',
    right: 'right-2 top-1/2 -translate-y-1/2',
    'top-left': 'top-8 left-8',
    'top-right': 'top-8 right-8',
    'bottom-left': 'bottom-8 left-8',
    'bottom-right': 'bottom-8 right-8',
  };
  return map[pos];
}

interface PokerTableProps {
  tableId: string;
  tableSize: number;
  seats: SeatRow[];
  gameState: Omit<GameState, 'deck'> | null;
  playerId?: string;
  onSit: (seatNumber: number) => void;
  onAction?: (action: ActionType, amount?: number) => void;
  /** Emoji reactions keyed by seatNumber */
  seatReactions?: Map<number, { emoji: string; id: string }>;
}

export function PokerTable({
  tableSize,
  seats,
  gameState,
  playerId,
  onSit,
  seatReactions,
}: PokerTableProps) {
  const positions = tableSize === 2
    ? SEAT_POSITIONS_2
    : tableSize === 6
    ? SEAT_POSITIONS_6
    : SEAT_POSITIONS_9;

  const seatMap = useMemo(() => {
    const map = new Map<number, SeatRow>();
    for (const seat of seats) map.set(seat.seat_number, seat);
    return map;
  }, [seats]);

  const phase = gameState?.phase ?? 'waiting';
  const communityCards = gameState?.communityCards ?? [];
  const pot = gameState?.pot ?? 0;

  // Track bet changes per seat to trigger chip-to-pot animations
  const prevBets = useRef<Map<number, number>>(new Map());
  const [chipAnims, setChipAnims] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!gameState) return;
    const newAnims = new Map<number, string>();
    for (const p of gameState.players) {
      const prev = prevBets.current.get(p.seatNumber) ?? 0;
      if (p.currentBet > prev) {
        newAnims.set(p.seatNumber, `${p.seatNumber}-${Date.now()}`);
      }
    }
    if (newAnims.size > 0) {
      setChipAnims(newAnims);
      setTimeout(() => setChipAnims(new Map()), 600);
    }
    const nextBets = new Map<number, number>();
    for (const p of gameState.players) nextBets.set(p.seatNumber, p.currentBet);
    prevBets.current = nextBets;
  }, [gameState?.players]);

  // Pot-to-winner animations
  const potWinners = useMemo(() => {
    if (phase !== 'pot_awarded' || !gameState?.winners) return [];
    return gameState.winners.map(w => {
      const p = gameState.players.find(pl => pl.playerId === w.playerId);
      const seatNum = p?.seatNumber ?? 1;
      const posIdx = seatNum - 1;
      const pos = positions[posIdx]?.label ?? 'bottom';
      return { position: pos, amount: w.amount, id: `win-${w.playerId}` };
    });
  }, [phase, gameState?.winners, gameState?.players, positions]);

  return (
    <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-8">
      {/* Felt table oval */}
      <div
        className={cn(
          'poker-felt relative rounded-[50%] border-[8px] sm:border-[12px]',
          'bg-gradient-to-b from-felt to-felt-dark shadow-2xl',
          'w-full max-w-2xl aspect-[16/9]',
          'overflow-visible'
        )}
        style={{
          borderColor: 'var(--color-rail)',
          boxShadow: 'inset 0 4px 40px rgba(0,0,0,0.4), 0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Inner rail */}
        <div className="absolute inset-2 rounded-[50%] border border-white/5" />

        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {phase === 'waiting' || phase === 'starting' ? (
            <div className="text-center">
              <p className="text-2xl font-bold text-white/20">
                {phase === 'waiting' ? 'Waiting for players...' : 'Starting soon...'}
              </p>
            </div>
          ) : (
            <CommunityCards cards={communityCards} phase={phase} pot={pot} />
          )}
        </div>

        {/* Pot-to-winner chip animations */}
        <PotWinAnimation winners={potWinners} show={phase === 'pot_awarded'} />

        {/* Winner celebration (confetti + announcement) */}
        <WinnerCelebration
          winners={gameState?.winners ?? []}
          show={phase === 'pot_awarded' && (gameState?.winners?.length ?? 0) > 0}
        />

        {/* Player seats */}
        {positions.map((pos, i) => {
          const seatNum = i + 1;
          const seatRow = seatMap.get(seatNum);
          const gamePlayer = gameState?.players.find(p => p.seatNumber === seatNum);

          if (gamePlayer && gameState) {
            const reaction = seatReactions?.get(seatNum);
            return (
              <div
                key={seatNum}
                className={cn('absolute', positionClass(pos.label), pos.className)}
                style={{ zIndex: 10 }}
              >
                {/* Floating emoji reaction above seat */}
                <AnimatePresence>
                  {reaction && (
                    <motion.div
                      key={reaction.id}
                      className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-none z-20"
                      initial={{ opacity: 1, y: 0, scale: 0.5 }}
                      animate={{ opacity: 0, y: -40, scale: 1.4 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                    >
                      <span className="text-3xl drop-shadow-lg">{reaction.emoji}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Chip-to-pot animation */}
                <ChipAnimation
                  triggerId={chipAnims.get(seatNum) ?? null}
                  direction="to-pot"
                  position={pos.label}
                  amount={gamePlayer.currentBet}
                />
                <PlayerSeat
                  player={gamePlayer}
                  isActive={gameState.activeSeat === seatNum}
                  isDealer={gameState.dealerSeat === seatNum}
                  isSmallBlind={gameState.smallBlindSeat === seatNum}
                  isBigBlind={gameState.bigBlindSeat === seatNum}
                  isSelf={gamePlayer.playerId === playerId}
                  gameState={gameState}
                  position={pos.label}
                />
              </div>
            );
          }

          // Show seated player without game state
          if (seatRow?.player_id) {
            return (
              <div
                key={seatNum}
                className={cn('absolute', positionClass(pos.label), pos.className)}
                style={{ zIndex: 10 }}
              >
                <div className="flex flex-col items-center gap-1 rounded-xl bg-black/60 p-2 border border-white/10">
                  <div className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
                    {(seatRow.poker_profiles as any)?.username?.slice(0, 2).toUpperCase() ?? '??'}
                  </div>
                  <span className="text-[10px] text-white max-w-[72px] truncate text-center">
                    {(seatRow.poker_profiles as any)?.username ?? 'Player'}
                  </span>
                  <span className="text-[11px] font-bold text-gold">
                    {seatRow.stack.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          }

          // Empty seat
          const isSeated = seats.some(s => s.player_id === playerId);
          return (
            <div
              key={seatNum}
              className={cn('absolute', positionClass(pos.label), pos.className)}
              style={{ zIndex: 10 }}
            >
              {!isSeated && <EmptySeat seatNumber={seatNum} onSit={onSit} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
