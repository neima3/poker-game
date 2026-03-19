import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Trophy, TrendingUp, Coins, Flame, Star } from 'lucide-react';
import Link from 'next/link';
import { RARITY_CONFIG, type AchievementRarity } from '@/lib/achievements';

export const dynamic = 'force-dynamic';

interface AchievementLeaderEntry {
  player_id: string;
  username: string;
  achievement_points: number;
  achievements_unlocked: number;
  top_rarity: AchievementRarity | null;
}

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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

  // Attempt to fetch achievement leaderboard (may not exist pre-migration)
  let achievementLeaders: AchievementLeaderEntry[] = [];
  try {
    const { data: achData } = await supabase
      .from('poker_achievement_leaderboard')
      .select('player_id, username, achievement_points, achievements_unlocked')
      .gt('achievement_points', 0)
      .order('achievement_points', { ascending: false })
      .limit(10);

    if (achData && achData.length > 0) {
      // Fetch top rarity for each player
      const playerIds = achData.map(p => p.player_id);
      const { data: rarityData } = await supabase
        .from('poker_player_achievements')
        .select('player_id, poker_achievements(rarity)')
        .in('player_id', playerIds);

      // Determine top rarity per player
      const rarityOrder: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };
      const topRarityMap = new Map<string, AchievementRarity>();
      for (const row of rarityData ?? []) {
        const r = (row.poker_achievements as { rarity?: string } | null)?.rarity as AchievementRarity | undefined;
        if (!r) continue;
        const current = topRarityMap.get(row.player_id);
        if (!current || rarityOrder[r] > rarityOrder[current]) {
          topRarityMap.set(row.player_id, r);
        }
      }

      achievementLeaders = achData.map(p => ({
        ...p,
        top_rarity: topRarityMap.get(p.player_id) ?? null,
      }));
    }
  } catch {
    // Achievement tables not migrated yet — skip section
  }

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

      {/* Achievement Leaders — full width on top if data exists */}
      {achievementLeaders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Star className="h-4 w-4 text-gold" />
            Achievement Leaders
          </h2>
          <div className="flex flex-col gap-1.5">
            {achievementLeaders.map((p, i) => {
              const cfg = p.top_rarity ? RARITY_CONFIG[p.top_rarity] : null;
              return (
                <div
                  key={p.player_id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                    p.player_id === user.id
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
                        {p.player_id === user.id && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.achievements_unlocked} achievements
                        {cfg && (
                          <span className={`ml-1.5 ${cfg.color}`}>
                            · {cfg.label} tier
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-gold font-bold tabular-nums">
                      {p.achievement_points.toLocaleString()}
                    </span>
                    <span className="text-xs text-white/30">pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
