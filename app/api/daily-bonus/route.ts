import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COOLDOWN_HOURS = 24;

/**
 * Server-authoritative bonus amounts. The client NEVER sends an amount — the
 * server picks uniformly at random and commits via the atomic RPC so concurrent
 * requests cannot double-claim or inflate the payout.
 */
const VALID_AMOUNTS = [500, 750, 1000, 1500, 2000, 3000, 5000];

function pickBonusAmount(): number {
  return VALID_AMOUNTS[Math.floor(Math.random() * VALID_AMOUNTS.length)];
}

// POST /api/daily-bonus — claim daily chip bonus via spin wheel (24h cooldown)
export async function POST(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Server picks the bonus amount — client payload is ignored entirely.
  const bonusAmount = pickBonusAmount();

  // Atomic claim: the RPC locks the profile row (FOR UPDATE), checks the 24h
  // cooldown, adds chips, updates last_daily_bonus, and logs the grant — all in
  // one transaction. Concurrent requests queue behind the lock; the second one
  // will see the updated timestamp and raise an exception.
  const { data: grantedAmount, error: rpcError } = await supabase.rpc(
    'poker_claim_daily_bonus',
    { p_player_id: user.id, p_bonus_amount: bonusAmount }
  );

  if (rpcError) {
    const msg = rpcError.message ?? '';

    if (msg.includes('already claimed') || msg.includes('Try again')) {
      // Parse hours-remaining from the exception message if possible
      const hoursMatch = msg.match(/(\d+(?:\.\d+)?)\s*hours?/i);
      const hoursRemaining = hoursMatch ? Math.ceil(parseFloat(hoursMatch[1])) : COOLDOWN_HOURS;
      return NextResponse.json(
        { error: `Daily bonus available in ${hoursRemaining}h` },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: 'Failed to claim bonus' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    bonus: grantedAmount ?? bonusAmount,
  });
}

// GET /api/daily-bonus — check bonus status
export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('last_daily_bonus')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
  if (!profile.last_daily_bonus) {
    return NextResponse.json({ available: true });
  }

  const lastClaim = new Date(profile.last_daily_bonus).getTime();
  const elapsedMs = Date.now() - lastClaim;

  if (elapsedMs >= cooldownMs) {
    return NextResponse.json({ available: true });
  }

  const nextBonusAt = new Date(lastClaim + cooldownMs).toISOString();
  return NextResponse.json({ available: false, nextBonusAt });
}
