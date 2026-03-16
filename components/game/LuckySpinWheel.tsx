'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { playSpinTick, playSpinResult } from '@/lib/sounds';

// Wheel segments with amounts and colors
const SEGMENTS = [
  { amount: 500, color: '#374151', label: '500' },
  { amount: 1000, color: '#ca8a04', label: '1K' },
  { amount: 750, color: '#1e3a5f', label: '750' },
  { amount: 2000, color: '#b91c1c', label: '2K' },
  { amount: 500, color: '#374151', label: '500' },
  { amount: 1500, color: '#065f46', label: '1.5K' },
  { amount: 750, color: '#1e3a5f', label: '750' },
  { amount: 5000, color: '#7c3aed', label: '5K' },
  { amount: 500, color: '#374151', label: '500' },
  { amount: 1000, color: '#ca8a04', label: '1K' },
  { amount: 750, color: '#1e3a5f', label: '750' },
  { amount: 3000, color: '#dc2626', label: '3K' },
];

const SEGMENT_ANGLE = 360 / SEGMENTS.length;

interface LuckySpinWheelProps {
  onClaim: (amount: number) => Promise<void>;
  disabled?: boolean;
}

export function LuckySpinWheel({ onClaim, disabled }: LuckySpinWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonAmount, setWonAmount] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const lastTickRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const targetRotationRef = useRef(0);

  // Pick a weighted random segment (higher amounts are rarer)
  const pickSegment = useCallback(() => {
    // Weighted: lower amounts more likely
    const weights = SEGMENTS.map(s => {
      if (s.amount <= 500) return 30;
      if (s.amount <= 750) return 25;
      if (s.amount <= 1000) return 20;
      if (s.amount <= 1500) return 12;
      if (s.amount <= 2000) return 8;
      if (s.amount <= 3000) return 4;
      return 1; // 5000
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }, []);

  const spin = useCallback(async () => {
    if (spinning || disabled) return;
    setSpinning(true);
    setWonAmount(null);
    setShowResult(false);

    const targetIdx = pickSegment();
    const targetAmount = SEGMENTS[targetIdx].amount;

    // Calculate rotation: multiple full spins + land on target segment
    // Wheel is read clockwise from top. Segment 0 is at 12 o'clock.
    // To land on segment targetIdx, we rotate so that segment is under the pointer (top).
    const segmentCenter = targetIdx * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full rotations
    const targetRotation = fullSpins * 360 + (360 - segmentCenter);

    const duration = 4000 + Math.random() * 1000; // 4-5 seconds
    const startTime = performance.now();
    const startRotation = rotation % 360;

    startTimeRef.current = startTime;
    targetRotationRef.current = targetRotation;
    lastTickRef.current = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for natural deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + targetRotation * eased;

      setRotation(currentRotation);

      // Play tick sounds at segment boundaries
      const currentSegment = Math.floor((currentRotation % 360) / SEGMENT_ANGLE);
      if (currentSegment !== lastTickRef.current && progress < 0.95) {
        playSpinTick();
        lastTickRef.current = currentSegment;
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Done spinning
        setWonAmount(targetAmount);
        setShowResult(true);
        playSpinResult();

        // Call the claim API
        onClaim(targetAmount).finally(() => {
          setSpinning(false);
        });
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  }, [spinning, disabled, rotation, pickSegment, onClaim]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const wheelSize = 280;
  const center = wheelSize / 2;
  const radius = wheelSize / 2 - 4;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: wheelSize, height: wheelSize }}>
        {/* Pointer triangle at top */}
        <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2">
          <div className="h-0 w-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-gold drop-shadow-lg" />
        </div>

        {/* Outer ring glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: spinning
              ? '0 0 30px rgba(234, 179, 8, 0.4), inset 0 0 20px rgba(234, 179, 8, 0.1)'
              : '0 0 15px rgba(234, 179, 8, 0.2)',
            transition: 'box-shadow 0.3s',
          }}
        />

        {/* The wheel */}
        <svg
          width={wheelSize}
          height={wheelSize}
          className="drop-shadow-xl"
          style={{
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {/* Outer ring */}
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#ca8a04" strokeWidth="3" />

          {SEGMENTS.map((seg, i) => {
            const startAngle = (i * SEGMENT_ANGLE - 90) * (Math.PI / 180);
            const endAngle = ((i + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
            const x1 = center + radius * Math.cos(startAngle);
            const y1 = center + radius * Math.sin(startAngle);
            const x2 = center + radius * Math.cos(endAngle);
            const y2 = center + radius * Math.sin(endAngle);

            const largeArc = SEGMENT_ANGLE > 180 ? 1 : 0;

            const path = `M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;

            // Label position
            const midAngle = ((i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2) - 90) * (Math.PI / 180);
            const labelR = radius * 0.65;
            const lx = center + labelR * Math.cos(midAngle);
            const ly = center + labelR * Math.sin(midAngle);
            const textRotation = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;

            return (
              <g key={i}>
                <path d={path} fill={seg.color} stroke="#1a1a2e" strokeWidth="1.5" />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="13"
                  fontWeight="bold"
                  transform={`rotate(${textRotation}, ${lx}, ${ly})`}
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                >
                  {seg.label}
                </text>
              </g>
            );
          })}

          {/* Center circle */}
          <circle cx={center} cy={center} r={28} fill="#1a1a2e" stroke="#ca8a04" strokeWidth="2" />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ca8a04"
            fontSize="10"
            fontWeight="bold"
          >
            SPIN
          </text>
        </svg>
      </div>

      {/* Result overlay */}
      <AnimatePresence>
        {showResult && wonAmount !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 rounded-xl bg-gold/20 border border-gold/40 px-5 py-3"
          >
            <Sparkles className="h-5 w-5 text-gold" />
            <span className="text-lg font-bold text-gold">
              +{wonAmount.toLocaleString()} chips!
            </span>
            <Coins className="h-5 w-5 text-gold" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spin button */}
      {!showResult && (
        <Button
          onClick={spin}
          disabled={spinning || disabled}
          className="bg-gold text-black hover:bg-gold/90 gap-2 px-8 py-5 text-base font-bold"
        >
          <Sparkles className="h-5 w-5" />
          {spinning ? 'Spinning...' : 'Spin the Wheel!'}
        </Button>
      )}
    </div>
  );
}
