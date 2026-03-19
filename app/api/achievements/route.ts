import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ACHIEVEMENTS, rarityFromPercent, type AchievementRarity } from '@/lib/achievements';

/**
 * GET /api/achievements
 * Returns the player's unlocked achievements with live rarity data.
 * Rarity is computed from the global unlock % across all players.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get total non-guest player count
  const { count: totalPlayers } = await supabase
    .from('poker_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_guest', false);

  // Get unlock counts per achievement
  const { data: unlockCounts } = await supabase
    .from('poker_player_achievements')
    .select('achievement_id');

  // Tally per-achievement unlock counts
  const countMap = new Map<string, number>();
  for (const row of unlockCounts ?? []) {
    countMap.set(row.achievement_id, (countMap.get(row.achievement_id) ?? 0) + 1);
  }

  // Get this player's unlocked achievements
  const { data: playerAchievements } = await supabase
    .from('poker_player_achievements')
    .select('achievement_id, earned_at, progress')
    .eq('player_id', user.id);

  const playerMap = new Map(
    (playerAchievements ?? []).map(pa => [pa.achievement_id, pa])
  );

  const players = totalPlayers ?? 1;

  // Build response with live rarity
  const achievements = ACHIEVEMENTS.map(a => {
    const unlockCount = countMap.get(a.id) ?? 0;
    const unlockPct = players > 0 ? (unlockCount / players) * 100 : 0;
    const liveRarity: AchievementRarity = players >= 10
      ? rarityFromPercent(unlockPct)
      : a.rarity; // fallback to default rarity if not enough data
    const playerEntry = playerMap.get(a.id);

    return {
      id: a.id,
      rarity: liveRarity,
      unlockPct: Math.round(unlockPct * 10) / 10,
      unlockCount,
      isUnlocked: !!playerEntry,
      earnedAt: playerEntry?.earned_at ?? null,
    };
  });

  // Compute total points for this player
  const totalPoints = ACHIEVEMENTS
    .filter(a => playerMap.has(a.id))
    .reduce((sum, a) => sum + a.points, 0);

  return NextResponse.json({ achievements, totalPoints, totalPlayers: players });
}

/**
 * POST /api/achievements
 * Records one or more newly unlocked achievements for the authenticated player.
 * Body: { achievementIds: string[] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let achievementIds: string[];
  try {
    const body = await req.json();
    achievementIds = Array.isArray(body.achievementIds) ? body.achievementIds : [];
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (achievementIds.length === 0) {
    return NextResponse.json({ recorded: 0 });
  }

  // Validate that all IDs are known achievements
  const validIds = new Set(ACHIEVEMENTS.map(a => a.id));
  const toInsert = achievementIds
    .filter(id => validIds.has(id))
    .map(id => ({
      player_id: user.id,
      achievement_id: id,
      progress: ACHIEVEMENTS.find(a => a.id === id)?.requirement ?? 1,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({ recorded: 0 });
  }

  // Upsert (ignore duplicates — client may retry)
  const { error } = await supabase
    .from('poker_player_achievements')
    .upsert(toInsert, { onConflict: 'player_id,achievement_id', ignoreDuplicates: true });

  if (error) {
    // Table may not exist yet (pre-migration) — degrade gracefully
    console.error('Achievement upsert error:', error.message);
    return NextResponse.json({ recorded: 0, warning: 'DB not ready' });
  }

  return NextResponse.json({ recorded: toInsert.length });
}
