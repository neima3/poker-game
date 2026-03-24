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
        'relative flex items-center justify-center rounded-lg border border-white/20',
        'bg-gradient-to-br from-indigo-900 via-blue-950 to-black shadow-2xl overflow-hidden',
        sizes[size],
        className
      )}
    >
      {/* Intricate Geometric Pattern */}
      <div className="absolute inset-0 opacity-20" 
        style={{ 
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l20 20M20 0L0 20' stroke='white' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
          backgroundSize: '10px 10px'
        }} 
      />
      <div className="absolute inset-[4px] rounded-md border border-white/10 flex items-center justify-center">
        <div className="w-1/2 h-1/2 rounded-full border-2 border-gold/30 flex items-center justify-center">
          <div className="w-2/3 h-2/3 rounded-full bg-gold/10" />
        </div>
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
        'relative flex flex-col items-start justify-between rounded-lg border border-gray-300',
        'bg-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] select-none p-1 overflow-hidden',
        sizes[size],
        className
      )}
    >
      {/* Paper Texture Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      <div className={cn('font-black leading-none flex flex-col items-center', color, size === 'sm' ? 'text-[11px]' : 'text-sm')}>
        <span>{display}</span>
        <span className={size === 'sm' ? 'text-[9px]' : 'text-xs'}>{symbol}</span>
      </div>

      <div className={cn('absolute inset-0 flex items-center justify-center opacity-[0.08] pointer-events-none', color)}>
         <span className={cn('font-black', size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-3xl' : 'text-xl')}>
           {symbol}
         </span>
      </div>

      <div className={cn('self-end font-black leading-none rotate-180 flex flex-col items-center', color, size === 'sm' ? 'text-[11px]' : 'text-sm')}>
        <span>{display}</span>
        <span className={size === 'sm' ? 'text-[9px]' : 'text-xs'}>{symbol}</span>
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
