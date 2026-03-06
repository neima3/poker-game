import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/admin/grant-chips — admin only: grant chips to a player
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify admin status
  const { data: adminProfile } = await supabase
    .from('poker_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { player_id, amount, reason } = body;

  if (!player_id || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Get target player's current chips
  const { data: target } = await supabase
    .from('poker_profiles')
    .select('chips, username')
    .eq('id', player_id)
    .single();

  if (!target) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const newChips = target.chips + amount;

  // Update chips
  const { error: updateErr } = await supabase
    .from('poker_profiles')
    .update({ chips: newChips, updated_at: new Date().toISOString() })
    .eq('id', player_id);

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update chips' }, { status: 500 });
  }

  // Record grant in chip_grants table (best-effort, fire and forget)
  void supabase.from('chip_grants').insert({
    admin_id: user.id,
    player_id,
    amount,
    reason: reason ?? 'Admin grant',
  });

  return NextResponse.json({
    success: true,
    username: target.username,
    new_chips: newChips,
  });
}
