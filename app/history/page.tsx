import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { History, Trophy, ArrowLeft, Play } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const SUIT_SYMBOLS: Record<string, string> = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const SUIT_COLORS: Record<string, string> = { h: 'text-red-500', d: 'text-red-500', c: 'text-emerald-400', s: 'text-slate-200' };

function MiniCard({ card }: { card: string }) {
  if (!card || card === '??') return <span className="text-white/30">?</span>;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  const color = SUIT_COLORS[suit] ?? 'text-white';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold ${color}`}>
      {rank === 'T' ? '10' : rank}{symbol}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function HandHistoryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch last 20 hands the user participated in
  const { data: hands } = await supabase
    .from('poker_hands')
    .select('*')
    .contains('player_ids', [user.id])
    .order('ended_at', { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <History className="h-6 w-6 text-gold" />
            Hand History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your last 20 hands
          </p>
        </div>
        <Link
          href="/lobby"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Lobby
        </Link>
      </div>

      {(!hands || hands.length === 0) ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground">No hands played yet.</p>
          <Link href="/lobby" className="mt-2 inline-block text-sm text-gold hover:underline">
            Join a table to start playing
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hands.map((hand, idx) => {
            const winners = (hand.winners ?? []) as Array<{
              playerId: string;
              username: string;
              amount: number;
              handName?: string;
              cards?: string[];
            }>;
            const communityCards = (hand.community_cards ?? []) as string[];
            const isWinner = winners.some(w => w.playerId === user.id);
            const myWin = winners.find(w => w.playerId === user.id);

            return (
              <div
                key={hand.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isWinner
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border/50 bg-card/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Board */}
                    {communityCards.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {communityCards.map((card, i) => (
                          <MiniCard key={i} card={card} />
                        ))}
                      </div>
                    )}

                    {/* Winners */}
                    <div className="flex flex-col gap-1">
                      {winners.map(w => (
                        <div key={w.playerId} className="flex items-center gap-2 text-sm">
                          {isWinner && w.playerId === user.id && (
                            <Trophy className="h-3.5 w-3.5 text-gold shrink-0" />
                          )}
                          <span className={`font-medium ${w.playerId === user.id ? 'text-gold' : 'text-foreground'}`}>
                            {w.playerId === user.id ? 'You' : w.username}
                          </span>
                          {w.handName && (
                            <span className="text-xs text-muted-foreground">{w.handName}</span>
                          )}
                          <span className="text-emerald-400 font-bold tabular-nums">
                            +{w.amount.toLocaleString()}
                          </span>
                          {w.cards && w.cards.length > 0 && (
                            <div className="flex gap-0.5 ml-1">
                              {w.cards.slice(0, 2).map((c, i) => (
                                <MiniCard key={i} card={c} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className="text-lg font-bold tabular-nums text-white/80">
                      {(hand.pot_size ?? 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">pot</span>
                    <span className="text-[10px] text-muted-foreground">
                      {hand.ended_at ? timeAgo(hand.ended_at) : ''}
                    </span>
                    {hand.replay_data && (
                      <Link
                        href={`/history/${hand.id}`}
                        className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        <Play className="h-3 w-3" />
                        Replay
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
