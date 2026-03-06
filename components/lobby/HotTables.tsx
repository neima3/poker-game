'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, Users, Coins, ChevronRight } from 'lucide-react';
import type { TableRow } from '@/types/poker';

interface HotTablesProps {
  tables: TableRow[];
}

export function HotTables({ tables }: HotTablesProps) {
  const router = useRouter();

  // Hot tables = tables with most active players, minimum 2 players
  const hotTables = tables
    .filter(t => t.current_players >= 2)
    .sort((a, b) => b.current_players - a.current_players)
    .slice(0, 3);

  if (hotTables.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Flame className="h-4 w-4 text-orange-400" />
        Hot Tables
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hotTables.map((table, i) => (
          <motion.div
            key={table.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="group relative overflow-hidden rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-card to-card p-4 transition-all hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 cursor-pointer"
            onClick={() => router.push(`/table/${table.id}`)}
          >
            {/* Glow effect */}
            <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-orange-500/10 blur-2xl" />

            <div className="relative flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{table.name}</span>
                  <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/25 text-[9px] px-1.5 gap-1">
                    <Flame className="h-2.5 w-2.5" />
                    HOT
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span className="text-orange-400 font-medium">{table.current_players}</span>
                    /{table.table_size}
                  </span>
                  <span className="flex items-center gap-1">
                    <Coins className="h-3 w-3 text-gold" />
                    {table.small_blind}/{table.big_blind}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Activity bar */}
            <div className="mt-3 h-1 w-full rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-500"
                initial={{ width: 0 }}
                animate={{ width: `${(table.current_players / table.table_size) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.2 + i * 0.06, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
