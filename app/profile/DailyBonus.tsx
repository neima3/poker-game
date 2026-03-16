'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LuckySpinWheel } from '@/components/game/LuckySpinWheel';
import { useRouter } from 'next/navigation';

interface DailyBonusProps {
  bonusAvailable: boolean;
  nextBonusAt: string | null;
}

export function DailyBonus({ bonusAvailable: initialAvailable, nextBonusAt }: DailyBonusProps) {
  const router = useRouter();
  const [available, setAvailable] = useState(initialAvailable);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = useCallback(async (amount: number) => {
    setError(null);
    try {
      const res = await fetch('/api/daily-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to claim bonus');
        return;
      }
      setClaimed(true);
      setAvailable(false);
      router.refresh();
    } catch {
      setError('Network error — please try again');
    }
  }, [router]);

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
          <Sparkles className="h-4 w-4 text-gold" />
          Lucky Spin - Daily Bonus
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {claimed ? (
            <motion.div
              key="claimed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-3 py-4 text-green-400"
            >
              <Sparkles className="h-5 w-5" />
              <span className="font-semibold">
                Bonus claimed! Come back tomorrow for another spin.
              </span>
            </motion.div>
          ) : available ? (
            <motion.div
              key="available"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <p className="text-sm text-muted-foreground text-center">
                Spin the wheel for your daily bonus! Win between 500 and 5,000 chips.
              </p>
              <LuckySpinWheel onClaim={handleClaim} />
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
                Next spin in {countdown || '24h'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <p className="mt-2 text-sm text-destructive text-center">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
