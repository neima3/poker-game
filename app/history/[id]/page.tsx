import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HandReplayClient from './HandReplayClient';

export const dynamic = 'force-dynamic';

export default async function HandReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: hand } = await supabase
    .from('poker_hands')
    .select('*')
    .eq('id', id)
    .single();

  if (!hand) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Hand not found.</p>
      </div>
    );
  }

  // Check the user was a participant
  const playerIds = (hand.player_ids ?? []) as string[];
  if (!playerIds.includes(user.id)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">You were not a participant in this hand.</p>
      </div>
    );
  }

  const replayData = hand.replay_data;

  if (!replayData || !replayData.actionLog || replayData.actionLog.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">
          Replay data not available for this hand.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Only hands played after the replay feature was added have full replay data.
        </p>
      </div>
    );
  }

  return <HandReplayClient replayData={replayData} handId={id} />;
}
