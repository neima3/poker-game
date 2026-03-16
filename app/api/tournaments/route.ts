import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAllTournaments,
  createTournament,
  fillWithBots,
  startTournament,
} from '@/lib/poker/tournament';
import type { BotDifficulty } from '@/types/poker';

// GET /api/tournaments — list active tournaments
export async function GET() {
  const tournaments = getAllTournaments().filter(
    t => t.status === 'registering' || t.status === 'running'
  );
  return NextResponse.json({ tournaments });
}

// POST /api/tournaments — create and start a tournament
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
  const configId = body.configId ?? 'sng-6';
  const gameMode = body.gameMode === 'bounty' ? 'bounty' : 'classic';
  const botDifficulty: BotDifficulty = ['fish', 'regular', 'shark', 'pro'].includes(body.botDifficulty)
    ? body.botDifficulty
    : 'regular';

  try {
    const state = createTournament(configId, user.id, profile.username, gameMode);

    // Deduct buy-in
    if (profile.chips < state.config.buyIn) {
      return NextResponse.json({ error: 'Not enough chips' }, { status: 400 });
    }
    await supabase
      .from('poker_profiles')
      .update({ chips: profile.chips - state.config.buyIn })
      .eq('id', user.id);

    // Fill with bots and start
    if (body.fillBots) {
      fillWithBots(state.config.id, botDifficulty);
    }

    startTournament(state.config.id);

    return NextResponse.json({
      success: true,
      tournamentId: state.config.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
