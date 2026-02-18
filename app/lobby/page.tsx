import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Spade, Trophy } from 'lucide-react';
import { LobbyClient } from '@/components/lobby/LobbyClient';
import { CreateTableDialog } from '@/components/lobby/CreateTableDialog';
import type { TableRow } from '@/types/poker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LobbyPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch active tables + top players in parallel
  const [{ data: tables }, { data: topPlayers }] = await Promise.all([
    supabase
      .from('poker_tables')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('poker_profiles')
      .select('username, chips, total_hands_played')
      .eq('is_guest', false)
      .order('chips', { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Spade className="h-6 w-6 text-gold" />
            Game Lobby
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join a table or create your own
          </p>
        </div>
        <CreateTableDialog />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        {/* Table list */}
        <LobbyClient initialTables={(tables ?? []) as TableRow[]} />

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
                    {p.username === (user as any)?.email && (
                      <span className="text-[10px] text-blue-400">(You)</span>
                    )}
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
