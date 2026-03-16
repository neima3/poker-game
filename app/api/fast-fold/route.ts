import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createFastFoldSession, dealFastFoldHand } from '@/lib/poker/fast-fold';
import { setGameState } from '@/lib/poker/game-store';
import { sanitizeForPlayer } from '@/lib/poker/engine';
import type { BotDifficulty } from '@/types/poker';

// POST /api/fast-fold — create a new fast fold session and deal first hand
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
  const buyIn = body.buyIn ?? 5000;
  const botDifficulty: BotDifficulty = ['fish', 'regular', 'shark', 'pro'].includes(body.botDifficulty)
    ? body.botDifficulty
    : 'regular';
  const smallBlind = body.smallBlind ?? 25;
  const bigBlind = body.bigBlind ?? 50;

  if (profile.chips < buyIn) {
    return NextResponse.json({ error: 'Not enough chips' }, { status: 400 });
  }

  // Deduct buy-in
  await supabase
    .from('poker_profiles')
    .update({ chips: profile.chips - buyIn })
    .eq('id', user.id);

  const session = createFastFoldSession(
    user.id,
    profile.username,
    buyIn,
    botDifficulty,
    smallBlind,
    bigBlind,
  );

  // Deal first hand
  const gameState = dealFastFoldHand(session);
  setGameState(`ff_table_${session.sessionId}`, gameState);

  return NextResponse.json({
    success: true,
    sessionId: session.sessionId,
    session,
    gameState: sanitizeForPlayer(gameState, user.id),
  });
}
