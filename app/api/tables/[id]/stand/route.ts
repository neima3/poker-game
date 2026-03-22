import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasActiveGame, ensureGameStateLoaded } from '@/lib/poker/game-store';

// POST /api/tables/[id]/stand — leave a table and cash out
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tableId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureGameStateLoaded(tableId);
  if (hasActiveGame(tableId)) {
    return NextResponse.json({ error: 'Cannot stand up during an active hand' }, { status: 400 });
  }

  // Atomic chip return + seat clear via DB transaction function
  const { data: chipsReturned, error: standError } = await supabase.rpc('poker_stand_player', {
    p_table_id: tableId,
  });

  if (standError) {
    const message = standError.message ?? 'Failed to stand up';

    if (message.includes('Not seated')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, chips_returned: chipsReturned ?? 0 });
}
