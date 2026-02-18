import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DAILY_BONUS_AMOUNT = 1_000;
const COOLDOWN_HOURS = 24;

// POST /api/daily-bonus — claim daily chip bonus (24h cooldown)
export async function POST() {
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

  // Grant chips
  const newChips = profile.chips + DAILY_BONUS_AMOUNT;
  const { error } = await supabase
    .from('poker_profiles')
    .update({ chips: newChips, last_daily_bonus: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to claim bonus' }, { status: 500 });

  return NextResponse.json({
    success: true,
    bonus: DAILY_BONUS_AMOUNT,
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
    return NextResponse.json({ available: true, bonus: DAILY_BONUS_AMOUNT });
  }

  const lastClaim = new Date(profile.last_daily_bonus).getTime();
  const elapsedMs = Date.now() - lastClaim;

  if (elapsedMs >= cooldownMs) {
    return NextResponse.json({ available: true, bonus: DAILY_BONUS_AMOUNT });
  }

  const nextBonusAt = new Date(lastClaim + cooldownMs).toISOString();
  return NextResponse.json({ available: false, bonus: DAILY_BONUS_AMOUNT, nextBonusAt });
}
