import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getMTT,
  processRebuy,
  canRebuy,
  isRebuyPeriodOpen,
} from '@/lib/poker/mtt';

// POST /api/mtt/[id]/rebuy — player rebuys into the MTT
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: mttId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const state = getMTT(mttId);
  if (!state) return NextResponse.json({ error: 'MTT not found' }, { status: 404 });

  if (!isRebuyPeriodOpen(state)) {
    return NextResponse.json({ error: 'Rebuy period has ended' }, { status: 400 });
  }

  if (!canRebuy(state, user.id)) {
    return NextResponse.json({ error: 'Rebuy not available' }, { status: 400 });
  }

  // Check chips
  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('chips')
    .eq('id', user.id)
    .single();

  if (!profile || profile.chips < state.config.rebuyCost) {
    return NextResponse.json({ error: 'Not enough chips for rebuy' }, { status: 400 });
  }

  // Deduct rebuy cost
  await supabase
    .from('poker_profiles')
    .update({ chips: profile.chips - state.config.rebuyCost })
    .eq('id', user.id);

  try {
    const updatedState = processRebuy(mttId, user.id);
    const player = updatedState.players.find(p => p.playerId === user.id);

    return NextResponse.json({
      success: true,
      stack: player?.stack ?? 0,
      rebuysUsed: player?.rebuysUsed ?? 0,
      rebuysRemaining: state.config.rebuyMaxCount - (player?.rebuysUsed ?? 0),
      prizePool: updatedState.prizePool,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
