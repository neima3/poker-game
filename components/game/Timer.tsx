'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTimer } from '@/hooks/useTimer';
import { playTimerTick } from '@/lib/sounds';
import { cn } from '@/lib/utils';

interface TimerProps {
  deadlineMs: number;
  totalSeconds?: number;
  className?: string;
}

export function Timer({ deadlineMs, totalSeconds = 30, className }: TimerProps) {
  const secondsLeft = useTimer(deadlineMs);
  const pct = Math.max(0, (secondsLeft / totalSeconds) * 100);
  const isUrgent = secondsLeft <= 10;
  const prevSeconds = useRef(secondsLeft);

  // Tick sound for last 10 seconds
  useEffect(() => {
    if (isUrgent && secondsLeft < prevSeconds.current && secondsLeft > 0) {
      playTimerTick();
    }
    prevSeconds.current = secondsLeft;
  }, [secondsLeft, isUrgent]);

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <motion.div
        className={cn(
          'text-sm font-bold tabular-nums',
          isUrgent ? 'text-red-400' : 'text-yellow-400'
        )}
        animate={isUrgent ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4, repeat: Infinity }}
      >
        {secondsLeft}s
      </motion.div>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/20">
        <motion.div
          className={cn(
            'h-full rounded-full',
            isUrgent ? 'bg-red-400' : pct > 50 ? 'bg-yellow-400' : 'bg-orange-400'
          )}
          style={{ width: `${pct}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>
    </div>
  );
}
