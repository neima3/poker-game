'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCardSkeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { Coins, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import type { TableRow } from '@/types/poker';

function SeatDots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            i < filled
              ? 'h-2 w-2 rounded-full bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]'
              : 'h-2 w-2 rounded-full border border-white/20'
          }
        />
      ))}
    </div>
  );
}

interface LobbyClientProps {
  initialTables: TableRow[];
}

export function LobbyClient({ initialTables }: LobbyClientProps) {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>(initialTables);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables');
      const data = await res.json();
      if (data.tables) setTables(data.tables);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  // Realtime updates for poker_tables
  useEffect(() => {
    setInitialLoad(false);
    const supabase = createClient();
    const channel = supabase
      .channel('lobby')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'poker_tables',
      }, () => {
        refresh();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  function fmtChips(n: number): string {
    if (n < 1000) return n.toLocaleString();
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }

  function blindLabel(small: number, big: number) {
    const fmt = (n: number) => n >= 1000 ? `${n / 1000}k` : n.toString();
    return `${fmt(small)}/${fmt(big)}`;
  }

  const isFull = (t: TableRow) => t.current_players >= t.table_size;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Refreshing…' : `${tables.length} active table${tables.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Table list */}
      <AnimatePresence mode="popLayout">
        {initialLoad ? (
          // Loading skeletons
          Array.from({ length: 3 }).map((_, i) => (
            <TableCardSkeleton key={i} />
          ))
        ) : tables.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/10 py-16 text-center"
          >
            <div className="text-5xl">🃏</div>
            <div>
              <p className="font-medium text-white/70">No tables yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create the first one to get started!</p>
            </div>
          </motion.div>
        ) : (
          tables.map((table, i) => (
            <motion.div
              key={table.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              className="group relative flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-felt/60 hover:bg-card/80 hover:shadow-lg hover:shadow-felt/5"
            >
              {/* Active indicator pulse */}
              {table.current_players > 0 && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] h-6 w-1.5 rounded-full bg-green-500/70 blur-[2px]" />
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{table.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {table.table_size === 2 ? 'Heads-Up' : table.table_size === 6 ? '6-Max' : '9-Max'}
                  </Badge>
                  {table.current_players > 0 && (
                    <Badge className="bg-green-500/15 text-green-400 border-green-500/25 text-[10px] shrink-0 gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                      Live
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-gold shrink-0" />
                    <span className="font-medium text-gold/80">{blindLabel(table.small_blind, table.big_blind)}</span>
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <SeatDots filled={table.current_players} total={table.table_size} />
                    <span className="text-[10px] text-muted-foreground">
                      {table.current_players}/{table.table_size} seats
                    </span>
                  </div>
                  <span className="text-xs">
                    {fmtChips(table.min_buy_in)}–{fmtChips(table.max_buy_in)}
                  </span>
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5 bg-felt text-white hover:bg-felt-dark shadow-md"
                  onClick={() => router.push(`/table/${table.id}`)}
                  disabled={isFull(table)}
                >
                  {isFull(table) ? (
                    'Full'
                  ) : table.current_players === 0 ? (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      Start Game
                    </>
                  ) : (
                    <>
                      Join
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}
