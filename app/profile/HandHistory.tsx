'use client';

import { motion } from 'framer-motion';
import { History, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Winner {
  playerId: string;
  username: string;
  amount: number;
  handName?: string;
}

interface HandRecord {
  id: string;
  community_cards: string[];
  pot_size: number;
  winners: Winner[];
  ended_at: string;
  table_id: string;
}

interface HandHistoryProps {
  hands: HandRecord[];
  playerId: string;
}

const SUIT_COLORS: Record<string, string> = {
  h: 'text-red-400',
  d: 'text-red-400',
  c: 'text-emerald-400',
  s: 'text-slate-300',
};

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

function MiniCard({ card }: { card: string }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const color = SUIT_COLORS[suit] ?? 'text-white';
  const symbol = SUIT_SYMBOLS[suit] ?? suit;
  return (
    <span
      className={`inline-flex items-center rounded bg-white/10 px-1 py-0.5 text-[11px] font-bold font-mono ${color}`}
    >
      {rank}{symbol}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

export function HandHistory({ hands, playerId }: HandHistoryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4, type: 'spring', stiffness: 250, damping: 25 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Wins
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hands.map((hand, idx) => {
            const myWin = hand.winners.find(w => w.playerId === playerId);
            if (!myWin) return null;
            return (
              <motion.div
                key={hand.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + idx * 0.05, duration: 0.3 }}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card/40 p-3"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  {/* Community cards */}
                  {hand.community_cards.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {hand.community_cards.map((c, i) => (
                        <MiniCard key={i} card={c} />
                      ))}
                    </div>
                  )}
                  {/* Hand name */}
                  {myWin.handName && (
                    <span className="text-xs text-muted-foreground">{myWin.handName}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground/60">
                    {timeAgo(hand.ended_at)}
                  </span>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm">
                    <Trophy className="h-3 w-3" />
                    +{myWin.amount.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Pot: {hand.pot_size.toLocaleString()}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
