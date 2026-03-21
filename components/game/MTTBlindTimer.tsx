'use client';

/**
 * MTTBlindTimer
 *
 * Dedicated MTT blind-level timer widget. Displays:
 *  - Current level number
 *  - Current SB/BB/ante
 *  - Countdown until next level (with a radial SVG progress ring)
 *  - Next level preview
 *  - Chip average + stack-vs-average indicator
 *  - Configurable level-duration presets (passed in from parent)
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Timer, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TournamentBlindLevel } from '@/types/poker';

// ─── Radial ring ─────────────────────────────────────────────────────────────

function ProgressRing({
  radius,
  stroke,
  progress, // 0–1, where 1 = full (time just started) and 0 = empty (time expired)
  urgent,
}: {
  radius: number;
  stroke: number;
  progress: number;
  urgent: boolean;
}) {
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} className="-rotate-90">
      {/* Track */}
      <circle
        stroke="rgba(255,255,255,0.06)"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      {/* Foreground */}
      <motion.circle
        stroke={urgent ? '#f87171' : '#a78bfa'}
        fill="transparent"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeLinecap="round"
        animate={{ strokeDashoffset }}
        transition={{ duration: 1, ease: 'linear' }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatBlinds(level: TournamentBlindLevel): string {
  const parts = [level.smallBlind.toLocaleString(), level.bigBlind.toLocaleString()];
  if (level.ante) parts.push(`${level.ante.toLocaleString()} ante`);
  return parts.slice(0, 2).join('/');
}

function stackVsAvgLabel(ratio: number): { label: string; cls: string; Icon: typeof TrendingUp } {
  if (ratio >= 1.2) return { label: `+${((ratio - 1) * 100).toFixed(0)}%`, cls: 'text-green-400', Icon: TrendingUp };
  if (ratio <= 0.8) return { label: `${((ratio - 1) * 100).toFixed(0)}%`, cls: 'text-red-400', Icon: TrendingDown };
  return { label: 'avg', cls: 'text-white/50', Icon: Minus };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MTTBlindTimerProps {
  /** 0-indexed current blind level */
  currentLevel: number;
  /** All blind levels for this tournament */
  blindLevels: TournamentBlindLevel[];
  /** Milliseconds remaining in current level */
  timeRemaining: number;
  /** Chip average across active players */
  chipAverage: number;
  /** Human player's current stack (optional) */
  myStack?: number;
  /** Extra className for the root element */
  className?: string;
}

export function MTTBlindTimer({
  currentLevel,
  blindLevels,
  timeRemaining,
  chipAverage,
  myStack,
  className,
}: MTTBlindTimerProps) {
  const level = blindLevels[currentLevel] ?? blindLevels[blindLevels.length - 1];
  const nextLevel = blindLevels[currentLevel + 1] ?? null;
  const isLastLevel = currentLevel >= blindLevels.length - 1;

  const levelDurationMs = level.durationMinutes * 60_000;
  const progress = levelDurationMs > 0 ? timeRemaining / levelDurationMs : 0;
  const urgent = timeRemaining > 0 && timeRemaining < 60_000; // last minute

  const stackRatioInfo = useMemo(() => {
    if (!myStack || chipAverage <= 0) return null;
    const ratio = myStack / chipAverage;
    return { ratio, ...stackVsAvgLabel(ratio) };
  }, [myStack, chipAverage]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 bg-black/50 border-b border-white/5',
        className,
      )}
    >
      {/* Radial ring + countdown */}
      <div className="relative shrink-0 flex items-center justify-center">
        <ProgressRing radius={26} stroke={3} progress={progress} urgent={urgent} />
        <span
          className={cn(
            'absolute font-mono text-[11px] tabular-nums font-semibold',
            urgent ? 'text-red-400' : 'text-white/80',
          )}
        >
          {formatCountdown(timeRemaining)}
        </span>
      </div>

      {/* Level + blinds */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Level</span>
          <span
            className={cn(
              'text-[11px] font-bold tabular-nums',
              urgent ? 'text-red-400' : 'text-yellow-400',
            )}
          >
            {currentLevel + 1}
          </span>
          {!isLastLevel && (
            <span className="text-[9px] text-white/20">/ {blindLevels.length}</span>
          )}
        </div>

        {/* Current blinds */}
        <div className="flex items-center gap-1 text-white text-sm font-semibold font-mono tabular-nums leading-none">
          {level.smallBlind.toLocaleString()}/{level.bigBlind.toLocaleString()}
          {level.ante ? (
            <span className="text-[10px] text-white/40 font-normal ml-0.5">
              +{level.ante.toLocaleString()}
            </span>
          ) : null}
        </div>

        {/* Next level preview */}
        {nextLevel && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <ChevronRight className="h-3 w-3 text-white/20" />
            <span className="text-[10px] text-white/30 font-mono">
              {formatBlinds(nextLevel)}
            </span>
          </div>
        )}
        {isLastLevel && (
          <span className="text-[10px] text-yellow-500/60 mt-0.5">Final level</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Chip average + stack vs avg */}
      {chipAverage > 0 && (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <div className="flex items-center gap-1 text-[10px] text-white/30">
            <Timer className="h-3 w-3" />
            <span>Avg</span>
          </div>
          <span className="font-mono text-[13px] text-white/60 tabular-nums">
            {chipAverage.toLocaleString()}
          </span>
          {stackRatioInfo && (
            <div className={cn('flex items-center gap-0.5 text-[10px] font-mono', stackRatioInfo.cls)}>
              <stackRatioInfo.Icon className="h-2.5 w-2.5" />
              <span>{stackRatioInfo.label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
