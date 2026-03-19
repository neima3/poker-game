import { NextResponse } from 'next/server';
import { getMTT, getMTTCurrentBlinds } from '@/lib/poker/mtt';
import {
  calculateICMEquity,
  calcMRatio,
  getMPressure,
  getPushFoldSuggestion,
  type ICMPlayerResult,
} from '@/lib/poker/icm';

// GET /api/mtt/[id]/icm — returns ICM equity for all active players
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mtt = getMTT(id);
  if (!mtt) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });
  if (mtt.status !== 'running') return NextResponse.json({ icm: [], prizePool: mtt.prizePool });

  const activePlayers = mtt.players.filter(p => p.stack > 0 && !p.eliminatedAt);
  if (activePlayers.length === 0) return NextResponse.json({ icm: [], prizePool: mtt.prizePool });

  const stacks = activePlayers.map(p => p.stack);
  const numPaidPlaces = mtt.config.payoutStructure.length;

  // Convert payout percentages → fractions, capped at # active players
  const payoutFractions = mtt.config.payoutStructure
    .slice(0, Math.min(numPaidPlaces, activePlayers.length))
    .map(pct => pct / 100);

  const equities = calculateICMEquity(stacks, payoutFractions);
  const blinds = getMTTCurrentBlinds(mtt);
  const numPlayers = activePlayers.length;

  const results: ICMPlayerResult[] = activePlayers.map((p, i) => {
    const equity = equities[i];
    const bbCount = blinds && blinds.bigBlind > 0 ? p.stack / blinds.bigBlind : 0;
    const mRatio = blinds
      ? calcMRatio(p.stack, blinds.smallBlind, blinds.bigBlind, blinds.ante ?? 0, numPlayers)
      : 999;

    return {
      playerId: p.playerId,
      username: p.username,
      stack: p.stack,
      equity,
      equityPct: Math.round(equity * 10000) / 100,
      equityAmount: Math.round(equity * mtt.prizePool),
      bbCount: Math.round(bbCount * 10) / 10,
      mRatio: Math.round(mRatio * 10) / 10,
      pressure: getMPressure(mRatio),
      suggestion: getPushFoldSuggestion(bbCount),
    };
  });

  // Sort by stack descending (chip leader first)
  results.sort((a, b) => b.stack - a.stack);

  return NextResponse.json({ icm: results, prizePool: mtt.prizePool });
}
