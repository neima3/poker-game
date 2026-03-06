import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Trophy, TrendingUp, Coins, Flame } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch top players by chips, hands played, and win rate
  const [{ data: byChips }, { data: byHands }] = await Promise.all([
    supabase
      .from('poker_profiles')
      .select('id, username, chips, total_hands_played, hands_won, total_winnings')
      .eq('is_guest', false)
      .order('chips', { ascending: false })
      .limit(10),
    supabase
      .from('poker_profiles')
      .select('id, username, chips, total_hands_played, hands_won, total_winnings')
      .eq('is_guest', false)
      .gt('total_hands_played', 0)
      .order('total_winnings', { ascending: false })
      .limit(10),
  ]);

  const MEDAL = ['🥇', '🥈', '🥉'];

  function winRate(p: { total_hands_played: number; hands_won: number }): string {
    if (!p.total_hands_played) return '0%';
    return `${Math.round((p.hands_won / p.total_hands_played) * 100)}%`;
  }

  function formatChips(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
    return n.toLocaleString();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="h-6 w-6 text-gold" />
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top players across all tables
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* By Chips */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Coins className="h-4 w-4 text-gold" />
            Richest Players
          </h2>
          <div className="flex flex-col gap-1.5">
            {(byChips ?? []).map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                  p.id === user.id
                    ? 'border-blue-500/30 bg-blue-500/10'
                    : 'border-border/50 bg-card/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg w-8 text-center shrink-0">
                    {i < 3 ? MEDAL[i] : <span className="text-sm text-muted-foreground font-bold">#{i + 1}</span>}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium truncate block">
                      {p.username}
                      {p.id === user.id && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.total_hands_played} hands · {winRate(p)} win
                    </span>
                  </div>
                </div>
                <span className="text-gold font-bold tabular-nums shrink-0 ml-2">
                  {formatChips(p.chips)}
                </span>
              </div>
            ))}
            {(!byChips || byChips.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">No players yet</p>
            )}
          </div>
        </section>

        {/* By Winnings */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Flame className="h-4 w-4 text-orange-400" />
            Biggest Winners
          </h2>
          <div className="flex flex-col gap-1.5">
            {(byHands ?? []).map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                  p.id === user.id
                    ? 'border-blue-500/30 bg-blue-500/10'
                    : 'border-border/50 bg-card/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg w-8 text-center shrink-0">
                    {i < 3 ? MEDAL[i] : <span className="text-sm text-muted-foreground font-bold">#{i + 1}</span>}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium truncate block">
                      {p.username}
                      {p.id === user.id && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.total_hands_played} hands · {winRate(p)} win
                    </span>
                  </div>
                </div>
                <span className="text-emerald-400 font-bold tabular-nums shrink-0 ml-2">
                  +{formatChips(p.total_winnings ?? 0)}
                </span>
              </div>
            ))}
            {(!byHands || byHands.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">No players yet</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/lobby"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to Lobby
        </Link>
      </div>
    </div>
  );
}
