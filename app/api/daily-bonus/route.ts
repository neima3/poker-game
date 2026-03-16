import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COOLDOWN_HOURS = 24;
const VALID_AMOUNTS = [500, 750, 1000, 1500, 2000, 3000, 5000];

// POST /api/daily-bonus — claim daily chip bonus via spin wheel (24h cooldown)
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('chips, last_daily_bonus')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Check cooldown
  if (profile.last_daily_bonus) {
    const lastClaim = new Date(profile.last_daily_bonus).getTime();
    const elapsedMs = Date.now() - lastClaim;
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      const msRemaining = cooldownMs - elapsedMs;
      const hoursRemaining = Math.ceil(msRemaining / (60 * 60 * 1000));
      return NextResponse.json(
        { error: `Daily bonus available in ${hoursRemaining}h`, nextBonusAt: new Date(lastClaim + cooldownMs).toISOString() },
        { status: 429 }
      );
    }
  }

  // Parse amount from request body (spin wheel result)
  let bonusAmount = 1000; // default fallback
  try {
    const body = await req.json();
    if (body.amount && VALID_AMOUNTS.includes(body.amount)) {
      bonusAmount = body.amount;
    }
  } catch {
    // Use default amount if no body
  }

  // Grant chips
  const newChips = profile.chips + bonusAmount;
  const { error } = await supabase
    .from('poker_profiles')
    .update({ chips: newChips, last_daily_bonus: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to claim bonus' }, { status: 500 });

  // Log the bonus
  await supabase.from('poker_daily_bonuses').insert({
    player_id: user.id,
    bonus_amount: bonusAmount,
  });

  return NextResponse.json({
    success: true,
    bonus: bonusAmount,
    newBalance: newChips,
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
