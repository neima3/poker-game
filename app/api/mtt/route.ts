import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAllMTTs,
  createMTT,
  fillMTTWithBots,
  startMTT,
  MTT_PRESETS,
} from '@/lib/poker/mtt';
import type { BotDifficulty, BlindSpeed } from '@/types/poker';

// GET /api/mtt — list active MTTs
export async function GET() {
  const mtts = getAllMTTs().filter(
    t => t.status === 'registering' || t.status === 'running'
  );
  return NextResponse.json({ tournaments: mtts });
}

// POST /api/mtt — create and start an MTT
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('username, chips')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const configId = body.configId ?? 'mtt-18';
  const gameMode = body.gameMode === 'bounty' ? 'bounty' : 'classic';
  const botDifficulty: BotDifficulty = ['fish', 'regular', 'shark', 'pro'].includes(body.botDifficulty)
    ? body.botDifficulty
    : 'regular';
  const speed: BlindSpeed = ['turbo', 'standard', 'deep', 'super-deep'].includes(body.speed)
    ? body.speed
    : 'standard';

  const preset = MTT_PRESETS[configId];
  if (!preset) return NextResponse.json({ error: 'Unknown MTT config' }, { status: 400 });

  if (profile.chips < preset.buyIn) {
    return NextResponse.json({ error: 'Not enough chips' }, { status: 400 });
  }

  try {
    const state = createMTT(configId, user.id, profile.username, gameMode, speed);

    // Deduct buy-in
    await supabase
      .from('poker_profiles')
      .update({ chips: profile.chips - preset.buyIn })
      .eq('id', user.id);

    // Fill with bots and start
    if (body.fillBots !== false) {
      fillMTTWithBots(state.id, botDifficulty);
    }

    startMTT(state.id);

    return NextResponse.json({
      success: true,
      tournamentId: state.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
