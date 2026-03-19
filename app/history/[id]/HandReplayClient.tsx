'use client';

import { useRouter } from 'next/navigation';
import HandReplayViewer from '@/components/game/HandReplayViewer';
import type { HandReplayData } from '@/types/poker';

export default function HandReplayClient({
  replayData,
  handId,
}: {
  replayData: HandReplayData;
  handId: string;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="h-[calc(100vh-3rem)] max-h-[700px]">
        <HandReplayViewer
          replayData={replayData}
          handId={handId}
          onClose={() => router.push('/history')}
        />
      </div>
    </div>
  );
}
