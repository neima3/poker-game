'use client';

import { motion } from 'framer-motion';
import type { EquityResult, StreetEquity } from '@/lib/poker/equity';

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

// ─── Current-street overlay (legacy / single-street) ─────────────────────────

interface EquityOverlayProps {
  equities: EquityResult[];
  phase: string;
  /** Optional per-street breakdown to show alongside current equity */
  streetEquities?: StreetEquity[];
}

export function EquityOverlay({ equities, phase, streetEquities }: EquityOverlayProps) {
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

      {/* Stacked equity bar — current street */}
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

      {/* Street-by-street breakdown */}
      {streetEquities && streetEquities.length >= 2 && (
        <StreetEquityBreakdown
          streetEquities={streetEquities}
          currentPhase={phase}
          playerIds={equities.map(e => e.playerId)}
        />
      )}
    </div>
  );
}

// ─── Street-by-street equity breakdown ───────────────────────────────────────

interface StreetEquityBreakdownProps {
  streetEquities: StreetEquity[];
  currentPhase: string;
  /** Ordered list of playerIds so colors are stable across streets */
  playerIds: string[];
}

function StreetEquityBreakdown({ streetEquities, currentPhase, playerIds }: StreetEquityBreakdownProps) {
  return (
    <div className="mt-3 pt-2.5 border-t border-white/10">
      <div className="text-[9px] uppercase tracking-wider text-white/20 font-bold mb-2">
        Street-by-street
      </div>
      <div className="space-y-2">
        {streetEquities.map((se) => {
          const isCurrentStreet = se.street === currentPhase;
          return (
            <div key={se.street} className={`transition-opacity duration-200 ${isCurrentStreet ? 'opacity-100' : 'opacity-40'}`}>
              {/* Street label */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`text-[9px] uppercase tracking-wider font-bold ${
                    isCurrentStreet ? 'text-amber-400/80' : 'text-white/30'
                  }`}
                >
                  {PHASE_LABELS[se.street] ?? se.street}
                </span>
                {isCurrentStreet && (
                  <span className="inline-block w-1 h-1 rounded-full bg-amber-400/70" />
                )}
              </div>

              {/* Stacked bar for this street */}
              <div className="h-1.5 rounded-full overflow-hidden flex bg-white/5 mb-1">
                {se.equities.map((e) => {
                  const colorIdx = playerIds.indexOf(e.playerId);
                  const color = PLAYER_COLORS[(colorIdx >= 0 ? colorIdx : 0) % PLAYER_COLORS.length];
                  return (
                    <motion.div
                      key={e.playerId}
                      className="h-full"
                      style={{ backgroundColor: color }}
                      animate={{ width: `${e.totalEquity * 100}%` }}
                      initial={{ width: '0%' }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  );
                })}
              </div>

              {/* Percentage pills */}
              <div className="flex gap-1.5 flex-wrap">
                {se.equities.map((e) => {
                  const colorIdx = playerIds.indexOf(e.playerId);
                  const color = PLAYER_COLORS[(colorIdx >= 0 ? colorIdx : 0) % PLAYER_COLORS.length];
                  const pct = Math.round(e.totalEquity * 100);
                  return (
                    <div key={e.playerId} className="flex items-center gap-1">
                      <span
                        className="text-[9px] font-bold tabular-nums"
                        style={{ color }}
                      >
                        {e.username.slice(0, 8)}
                      </span>
                      <span
                        className="text-[9px] tabular-nums font-bold"
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
        })}
      </div>
    </div>
  );
}
