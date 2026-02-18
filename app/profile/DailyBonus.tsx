'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Gift, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

const DAILY_BONUS_AMOUNT = 1_000;

interface DailyBonusProps {
  bonusAvailable: boolean;
  nextBonusAt: string | null;
}

export function DailyBonus({ bonusAvailable: initialAvailable, nextBonusAt }: DailyBonusProps) {
  const router = useRouter();
  const [available, setAvailable] = useState(initialAvailable);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claimBonus() {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/daily-bonus', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to claim bonus');
        return;
      }
      setClaimed(true);
      setAvailable(false);
      // Refresh server data (chip balance in header etc.)
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setClaiming(false);
    }
  }

  // Parse countdown
  let countdown = '';
  if (!available && nextBonusAt) {
    const ms = new Date(nextBonusAt).getTime() - Date.now();
    if (ms > 0) {
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      countdown = `${h}h ${m}m`;
    }
  }

  return (
    <Card className="mt-6 border-gold/20 bg-gold/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift className="h-4 w-4 text-gold" />
          Daily Bonus
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {claimed ? (
            <motion.div
              key="claimed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 text-green-400"
            >
              <Coins className="h-5 w-5" />
              <span className="font-semibold">
                +{DAILY_BONUS_AMOUNT.toLocaleString()} chips claimed! Come back tomorrow.
              </span>
            </motion.div>
          ) : available ? (
            <motion.div
              key="available"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-gold" />
                <span className="font-semibold text-gold">
                  +{DAILY_BONUS_AMOUNT.toLocaleString()} chips available!
                </span>
              </div>
              <Button
                className="bg-gold text-black hover:bg-gold/90 gap-2"
                disabled={claiming}
                onClick={claimBonus}
              >
                <Gift className="h-4 w-4" />
                {claiming ? 'Claiming…' : 'Claim Bonus'}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="cooldown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Clock className="h-4 w-4" />
              <span className="text-sm">
                Next bonus in {countdown || '24h'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
