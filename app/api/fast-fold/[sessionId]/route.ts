import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFastFoldSession, deleteFastFoldSession } from '@/lib/poker/fast-fold';
import { deleteGameState } from '@/lib/poker/game-store';

// GET /api/fast-fold/[sessionId] — get session info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = getFastFoldSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json({ session });
}

// DELETE /api/fast-fold/[sessionId] — cash out and end session
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = getFastFoldSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.playerId !== user.id) return NextResponse.json({ error: 'Not your session' }, { status: 403 });

  // Return chips to player
  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('chips')
    .eq('id', user.id)
    .single();

  if (profile) {
    await supabase
      .from('poker_profiles')
      .update({ chips: profile.chips + session.stack })
      .eq('id', user.id);
  }

  const stats = {
    handsPlayed: session.handsPlayed,
    handsWon: session.handsWon,
    profit: session.stack - session.startStack,
    peakStack: session.peakStack,
    duration: Date.now() - session.startedAt,
  };

  // Clean up
  deleteGameState(`ff_table_${sessionId}`);
  deleteFastFoldSession(sessionId);

  return NextResponse.json({
    success: true,
    chipsReturned: session.stack,
    stats,
  });
}
