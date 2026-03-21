'use client';

import { motion } from 'framer-motion';
import type { EquityResult } from '@/lib/poker/equity';

/** One color per player seat (cycles if >6 players) */
const PLAYER_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#f97316', // orange
];

const PHASE_LABELS: Record<string, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

interface EquityOverlayProps {
  equities: EquityResult[];
  phase: string;
}

export function EquityOverlay({ equities, phase }: EquityOverlayProps) {
  if (equities.length < 2) return null;

  return (
    <div className="border-t border-white/10 bg-black/25 px-3 pt-2 pb-2.5 shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/25 font-bold">
          Equity
        </span>
        <span className="text-[10px] text-white/20">·</span>
        <span className="text-[10px] text-white/25">
          {PHASE_LABELS[phase] ?? phase}
        </span>
      </div>

      {/* Stacked equity bar */}
      <div className="h-2 rounded-full overflow-hidden flex mb-2.5 bg-white/5">
        {equities.map((e, i) => (
          <motion.div
            key={e.playerId}
            className="h-full"
            style={{ backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
            animate={{ width: `${e.totalEquity * 100}%` }}
            initial={{ width: '0%' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* Per-player rows */}
      <div className="space-y-1.5">
        {equities.map((e, i) => {
          const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
          const pct = Math.round(e.totalEquity * 100);

          return (
            <div key={e.playerId} className="flex items-center gap-2">
              {/* Color dot */}
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Username */}
              <span className="text-[10px] text-white/50 truncate w-16 shrink-0">
                {e.username}
              </span>

              {/* Equity bar */}
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: color + '99' }}
                  animate={{ width: `${e.totalEquity * 100}%` }}
                  initial={{ width: '0%' }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                />
              </div>

              {/* Percentage */}
              <span
                className="text-[11px] font-bold tabular-nums w-8 text-right shrink-0"
                style={{ color }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
