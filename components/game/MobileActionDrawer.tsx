'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ActionButtons } from './ActionButtons';
import type { GameState, ActionType } from '@/types/poker';

interface MobileActionDrawerProps {
  gameState: Omit<GameState, 'deck'>;
  playerId: string;
  onAction: (action: ActionType, amount?: number) => void;
  isSubmitting?: boolean;
}

export function MobileActionDrawer({
  gameState,
  playerId,
  onAction,
  isSubmitting,
}: MobileActionDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const prevTurnRef = useRef(false);

  const player = gameState.players.find(p => p.playerId === playerId);
  const isMyTurn = player
    ? gameState.activeSeat === player.seatNumber && !player.isFolded
    : false;

  // Auto-open when turn starts, auto-close when turn ends
  useEffect(() => {
    if (isMyTurn && !prevTurnRef.current) setIsOpen(true);
    if (!isMyTurn) setIsOpen(false);
    prevTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  if (!isMyTurn) return null;

  return (
    <>
      {/* Collapsed strip — pulsing "YOUR TURN" banner when drawer is dismissed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 py-3 text-sm font-bold text-yellow-300"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(true)}
          >
            <span>YOUR TURN</span>
            <span className="font-normal text-yellow-400/80">— Tap to act</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom sheet drawer (fixed overlay) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-gray-950/98 backdrop-blur-xl border-t border-white/10 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 450, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) setIsOpen(false);
            }}
            style={{ touchAction: 'none' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-12 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-gold">
                Your Turn
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 -mr-1 text-white/30 hover:text-white/60 transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Action buttons */}
            <div
              className="px-4"
              style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 1rem), 1.5rem)' }}
            >
              <ActionButtons
                gameState={gameState}
                playerId={playerId}
                onAction={(action, amount) => {
                  onAction(action, amount);
                  setIsOpen(false);
                }}
                isSubmitting={isSubmitting}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
