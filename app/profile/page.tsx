import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DailyBonus } from './DailyBonus';
import { ProfileStats } from './ProfileStats';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  // Check daily bonus availability
  const cooldownMs = 24 * 60 * 60 * 1000;
  const lastBonus = profile.last_daily_bonus ? new Date(profile.last_daily_bonus).getTime() : 0;
  const bonusAvailable = Date.now() - lastBonus >= cooldownMs;
  const nextBonusAt = bonusAvailable ? null : new Date(lastBonus + cooldownMs).toISOString();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <User className="h-6 w-6 text-gold" />
        Profile
      </h1>

      <ProfileStats
        username={profile.username}
        chips={profile.chips}
        handsPlayed={profile.total_hands_played ?? 0}
        totalWinnings={profile.total_winnings ?? 0}
        isGuest={profile.is_guest}
      />

      {/* Daily Bonus */}
      <DailyBonus bonusAvailable={bonusAvailable} nextBonusAt={nextBonusAt} />

      {profile.is_guest && (
        <Card className="mt-6 border-gold/30 bg-gold/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              You&apos;re playing as a guest. Create an account to save your progress and chips.
            </p>
            <Button asChild className="mt-3 bg-gold text-black hover:bg-gold/90">
              <Link href="/signup">Create Account</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <Button asChild variant="outline">
          <Link href="/lobby">← Back to Lobby</Link>
        </Button>
      </div>
    </div>
  );
}
