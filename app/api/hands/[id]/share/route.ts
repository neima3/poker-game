import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Generate a URL-safe random slug (21 chars, nanoid-style) */
function generateShareId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// POST /api/hands/[id]/share — generate (or return existing) shareable slug
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch the hand to verify the user participated
  const { data: hand } = await supabase
    .from('poker_hands')
    .select('id, share_id, player_ids')
    .eq('id', id)
    .single();

  if (!hand) return NextResponse.json({ error: 'Hand not found' }, { status: 404 });

  const playerIds = (hand.player_ids ?? []) as string[];
  if (!playerIds.includes(user.id)) {
    return NextResponse.json({ error: 'Not a participant in this hand' }, { status: 403 });
  }

  // Return existing share_id if already generated
  if (hand.share_id) {
    return NextResponse.json({ shareId: hand.share_id });
  }

  // Generate a new unique slug (retry on collision — astronomically unlikely)
  let shareId = generateShareId();
  let attempts = 0;
  while (attempts < 5) {
    const { error } = await supabase
      .from('poker_hands')
      .update({ share_id: shareId })
      .eq('id', id)
      .is('share_id', null); // guard against race
    if (!error) break;
    shareId = generateShareId();
    attempts++;
  }

  return NextResponse.json({ shareId });
}
