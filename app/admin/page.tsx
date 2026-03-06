import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';
import { AdminPanel } from './AdminPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('is_admin, username')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    redirect('/lobby');
  }

  // Fetch all non-guest players
  const { data: players } = await supabase
    .from('poker_profiles')
    .select('id, username, chips, total_hands_played, is_guest, is_admin')
    .order('username')
    .limit(100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <Shield className="h-6 w-6 text-gold" />
        Admin Panel
      </h1>
      <AdminPanel players={players ?? []} />
    </div>
  );
}
