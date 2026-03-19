'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PlayerHudStats } from '@/hooks/useHudStats';

interface HudBadgeProps {
  stats: PlayerHudStats;
  className?: string;
}

const MIN_SAMPLE = 10;

function StatCell({
  label,
  value,
  hasData,
  colorFn,
}: {
  label: string;
  value: number;
  hasData: boolean;
  colorFn: (v: number) => string;
}) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={cn('text-[8px] font-bold tabular-nums', hasData ? colorFn(value) : 'text-white/30')}>
        {hasData ? (label === 'AF' ? (value === 99 ? '∞' : value.toFixed(1)) : `${value}%`) : '?'}
      </span>
      <span className="text-[6px] text-white/30 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// Color scales for each stat
function vpipColor(v: number): string {
  if (v >= 40) return 'text-red-400';
  if (v >= 25) return 'text-yellow-400';
  return 'text-blue-400';
}
function pfrColor(v: number): string {
  if (v >= 25) return 'text-red-400';
  if (v >= 15) return 'text-yellow-400';
  return 'text-emerald-400';
}
function threeBetColor(v: number): string {
  if (v >= 10) return 'text-red-400';
  if (v >= 5) return 'text-yellow-400';
  return 'text-emerald-400';
}
function afColor(v: number): string {
  if (v >= 4) return 'text-red-400';
  if (v >= 2) return 'text-yellow-400';
  return 'text-blue-400';
}

export function HudBadge({ stats, className }: HudBadgeProps) {
  const hasData = stats.handsPlayed >= MIN_SAMPLE;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'grid grid-cols-2 gap-x-2 gap-y-0.5 rounded px-1.5 py-1',
        'bg-black/70 border border-white/10 backdrop-blur-sm',
        !hasData && 'opacity-60',
        className,
      )}
      title={
        hasData
          ? `${stats.handsPlayed} hands: VPIP ${stats.vpip}% / PFR ${stats.pfr}% / 3bet ${stats.threeBet}% / AF ${stats.af}`
          : `${stats.handsPlayed}/${MIN_SAMPLE} hands — stats need more data`
      }
    >
      <StatCell label="VPIP" value={stats.vpip} hasData={hasData} colorFn={vpipColor} />
      <StatCell label="PFR" value={stats.pfr} hasData={hasData} colorFn={pfrColor} />
      <StatCell label="3BET" value={stats.threeBet} hasData={hasData} colorFn={threeBetColor} />
      <StatCell label="AF" value={stats.af} hasData={hasData} colorFn={afColor} />
      {!hasData && (
        <span className="col-span-2 text-center text-[6px] text-white/25 leading-none">
          {stats.handsPlayed}/{MIN_SAMPLE}
        </span>
      )}
    </motion.div>
  );
}
