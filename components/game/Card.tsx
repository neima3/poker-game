'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getRank, getSuit, suitSymbol, suitColor, rankDisplay } from '@/lib/poker/deck';

interface CardProps {
  card: string;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  className?: string;
  /** Animate flip from face-down to face-up */
  animated?: boolean;
  /** Delay before flip begins (seconds) */
  delay?: number;
}

const sizes = {
  sm: 'w-8 h-11 text-xs',
  md: 'w-11 h-16 text-sm',
  lg: 'w-14 h-20 text-base',
};

const centerSizes = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
};

function CardBack({ size, className }: { size: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-md border border-white/20',
        'bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 shadow-md',
        sizes[size],
        className
      )}
    >
      {/* Card back pattern */}
      <div className="absolute inset-[3px] rounded border border-white/10">
        <div className="absolute inset-[3px] rounded border border-white/10" />
      </div>
      <div className="relative grid grid-cols-3 gap-px opacity-20">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-white" />
        ))}
      </div>
    </div>
  );
}

function CardFace({ card, size, className }: { card: string; size: 'sm' | 'md' | 'lg'; className?: string }) {
  const rank = getRank(card);
  const suit = getSuit(card);
  const symbol = suitSymbol(suit);
  const color = suitColor(suit);
  const display = rankDisplay(rank);

  return (
    <div
      className={cn(
        'relative flex flex-col items-start justify-between rounded-md border border-gray-200/80',
        'bg-white shadow-md select-none p-0.5',
        sizes[size],
        className
      )}
    >
      <div className={cn('font-bold leading-none', color, size === 'sm' ? 'text-xs' : 'text-sm')}>
        <div>{display}</div>
        <div className={size === 'sm' ? 'text-[10px]' : 'text-xs'}>{symbol}</div>
      </div>
      <div className={cn('self-end font-bold leading-none rotate-180', color, size === 'sm' ? 'text-xs' : 'text-sm')}>
        <div>{display}</div>
        <div className={size === 'sm' ? 'text-[10px]' : 'text-xs'}>{symbol}</div>
      </div>
      {/* Center suit */}
      <div className={cn('absolute inset-0 flex items-center justify-center font-bold', color, centerSizes[size])}>
        {symbol}
      </div>
    </div>
  );
}

export function Card({ card, size = 'md', faceDown = false, className, animated = false, delay = 0 }: CardProps) {
  const [flipped, setFlipped] = useState(false);

  // Trigger flip animation when transitioning from face-down to face-up
  useEffect(() => {
    if (!faceDown && animated) {
      const t = setTimeout(() => setFlipped(true), delay * 1000);
      return () => clearTimeout(t);
    } else {
      setFlipped(false);
    }
  }, [faceDown, animated, delay]);

  const showFaceDown = faceDown || card === '??' || !card;

  if (!animated) {
    return showFaceDown
      ? <CardBack size={size} className={className} />
      : <CardFace card={card} size={size} className={className} />;
  }

  // 3D flip animation using CSS perspective
  return (
    <div className={cn('relative', sizes[size])} style={{ perspective: '600px' }}>
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: flipped ? 0 : 180 }}
        initial={{ rotateY: 180 }}
        transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          {!showFaceDown && <CardFace card={card} size={size} className={className} />}
        </div>
        {/* Back */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <CardBack size={size} className={className} />
        </div>
      </motion.div>
    </div>
  );
}
