'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { playTimerTick } from '@/lib/sounds';
import { cn } from '@/lib/utils';

interface TimerProps {
  deadlineMs: number;
  totalSeconds?: number;
  className?: string;
}

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 113.1

export function Timer({ deadlineMs, totalSeconds = 30, className }: TimerProps) {
  const secondsLeft = useTimer(deadlineMs);
  const pct = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const strokeOffset = CIRCUMFERENCE * (1 - pct);

  const isUrgent = secondsLeft <= 5;
  const isWarning = secondsLeft <= 10 && secondsLeft > 5;
  const prevSeconds = useRef(secondsLeft);

  // Tick sound for last 10 seconds
  useEffect(() => {
    if (secondsLeft <= 10 && secondsLeft < prevSeconds.current && secondsLeft > 0) {
      playTimerTick();
    }
    prevSeconds.current = secondsLeft;
  }, [secondsLeft]);

  const strokeColor = isUrgent ? '#ef4444' : isWarning ? '#f97316' : '#d4a843';

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: 48, height: 48 }}
    >
      <svg width="48" height="48" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3.5"
        />
        {/* Progress ring */}
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeOffset}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease' }}
        />
      </svg>
      {/* Seconds label */}
      <span
        className="absolute text-[11px] font-black tabular-nums"
        style={{ color: strokeColor, transition: 'color 0.3s ease' }}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
