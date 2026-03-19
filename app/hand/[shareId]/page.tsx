import { createClient } from '@/lib/supabase/server';
import HandReplayClient from '@/app/history/[id]/HandReplayClient';
import type { HandReplayData } from '@/types/poker';
import { History } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SharedHandPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const supabase = await createClient();

  // No auth check — shareable links are public
  const { data: hand } = await supabase
    .from('poker_hands')
    .select('id, replay_data')
    .eq('share_id', shareId)
    .single();

  if (!hand) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Hand not found or link has expired.</p>
        <Link href="/lobby" className="mt-2 inline-block text-sm text-gold hover:underline">
          Play poker
        </Link>
      </div>
    );
  }

  const replayData = hand.replay_data as HandReplayData | null;

  if (!replayData || !replayData.actionLog?.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Replay data not available for this hand.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Public banner */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          <span>Shared hand replay</span>
        </div>
        <Link
          href="/lobby"
          className="text-sm font-medium text-gold hover:underline"
        >
          Play on Poker App
        </Link>
      </div>

      <div className="h-[calc(100vh-7rem)] max-h-[700px]">
        <HandReplayClient replayData={replayData} handId={hand.id} />
      </div>
    </div>
  );
}
