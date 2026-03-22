import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Spade, Trophy, Zap, Crown } from 'lucide-react';
import { LobbyClient } from '@/components/lobby/LobbyClient';
import { CreateTableDialog } from '@/components/lobby/CreateTableDialog';
import { QuickPlay } from '@/components/lobby/QuickPlay';
import { HotTables } from '@/components/lobby/HotTables';
import { listActivePokerTables, supportsPokerTableBettingColumns } from '@/lib/supabase/poker-tables';
import type { TableRow } from '@/types/poker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LobbyPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch active tables + top players in parallel
  const [{ tables, error: tablesError }, { data: topPlayers }, supportsBettingColumns] = await Promise.all([
    listActivePokerTables(supabase),
    supabase
      .from('poker_profiles')
      .select('username, chips, total_hands_played')
      .eq('is_guest', false)
      .order('chips', { ascending: false })
      .limit(5),
    supportsPokerTableBettingColumns(supabase),
  ]);

  const activeTables: TableRow[] = tablesError ? [] : tables;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Spade className="h-6 w-6 text-gold" />
            Game Lobby
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join a table or create your own
          </p>
        </div>
        <CreateTableDialog supportsBettingColumns={supportsBettingColumns} />
      </div>

      {/* Game Mode Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link
          href="/fast-fold"
          className="group flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-600/5 p-4 transition-all hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shrink-0">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Fast Fold</p>
            <p className="text-[11px] text-muted-foreground">Instant new hands. 200+ hands/hr</p>
          </div>
        </Link>
        <Link
          href="/tournaments"
          className="group flex items-center gap-3 rounded-xl border border-gold/20 bg-gradient-to-br from-gold/5 to-amber-600/5 p-4 transition-all hover:border-gold/40 hover:shadow-lg hover:shadow-gold/5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-amber-600 shrink-0">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Sit & Go</p>
            <p className="text-[11px] text-muted-foreground">Tournaments with bounties</p>
          </div>
        </Link>
      </div>

      {/* Quick Play CTA */}
      <div className="mb-6">
        <QuickPlay />
      </div>

      {/* Hot Tables */}
      <HotTables tables={activeTables} />

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        {/* Table list */}
        <LobbyClient initialTables={activeTables} />

        {/* Leaderboard sidebar */}
        {topPlayers && topPlayers.length > 0 && (
          <aside className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              <Trophy className="h-3.5 w-3.5 text-gold" />
              Leaderboard
            </h2>
            <div className="flex flex-col gap-1.5">
              {topPlayers.map((p, i) => (
                <div
                  key={p.username}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold w-5 shrink-0 ${
                      i === 0 ? 'text-gold' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'
                    }`}>
                      #{i + 1}
                    </span>
                    <span className="truncate font-medium">{p.username}</span>
                  </div>
                  <span className="text-gold font-bold tabular-nums shrink-0 ml-2">
                    {p.chips >= 1000
                      ? `${(p.chips / 1000).toFixed(p.chips % 1000 === 0 ? 0 : 1)}k`
                      : p.chips.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
