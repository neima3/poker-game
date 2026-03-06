'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { playAllIn } from '@/lib/sounds';
import type { ActionType, GameState } from '@/types/poker';

interface ActionButtonsProps {
  gameState: Omit<GameState, 'deck'>;
  playerId: string;
  onAction: (action: ActionType, amount?: number) => void;
  isSubmitting?: boolean;
}

// Animated wrapper for action buttons
function ActionBtn({
  children,
  className,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
}) {
  return (
    <motion.div
      className="flex-1"
      whileHover={disabled ? {} : { scale: 1.03 }}
      whileTap={disabled ? {} : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <Button
        variant={variant}
        size="sm"
        className={cn('w-full', className)}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </motion.div>
  );
}

export function ActionButtons({ gameState, playerId, onAction, isSubmitting }: ActionButtonsProps) {
  const [raiseAmount, setRaiseAmount] = useState<number | null>(null);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);
  const [lastPressed, setLastPressed] = useState<string | null>(null);

  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return null;

  const isMyTurn = gameState.activeSeat === player.seatNumber;
  const callAmount = Math.max(0, gameState.currentBet - player.currentBet);
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && callAmount < player.stack;
  const canBet = gameState.currentBet === 0 && player.stack > 0;
  const canRaise = gameState.currentBet > 0 && player.stack > callAmount;

  const minBetAmount = canBet
    ? gameState.minRaise
    : callAmount + gameState.minRaise;
  const maxRaise = player.stack;

  const effectiveRaiseAmount = raiseAmount ?? Math.min(minBetAmount, maxRaise);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isMyTurn || isSubmitting) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          handleAction('fold');
          break;
        case 'c':
          e.preventDefault();
          if (canCheck) handleAction('check');
          else if (canCall) handleAction('call');
          break;
        case ' ':
          e.preventDefault();
          if (canBet || canRaise) {
            if (showRaiseSlider) {
              const actionType = canBet ? 'bet' : 'raise';
              handleAction(actionType, effectiveRaiseAmount);
              setShowRaiseSlider(false);
              setRaiseAmount(null);
            } else {
              setShowRaiseSlider(true);
            }
          }
          break;
        case 'b':
          e.preventDefault();
          if (player && player.stack > 0) {
            playAllIn();
            handleAction('all-in');
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isSubmitting, canCheck, canCall, canBet, canRaise, showRaiseSlider, effectiveRaiseAmount, player.stack]);

  function handleAction(action: ActionType, amount?: number) {
    setLastPressed(action);
    onAction(action, amount);
  }

  if (!isMyTurn) {
    return (
      <div className="flex items-center justify-center py-4">
        <p className="text-sm text-white/40">Waiting for your turn...</p>
      </div>
    );
  }

  // Pot-fraction quick bet buttons
  const potFractions = [
    { label: '½ Pot', value: 0.5 },
    { label: '¾ Pot', value: 0.75 },
    { label: 'Pot', value: 1 },
  ];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="actions"
        className="flex flex-col gap-2 sm:gap-3 rounded-xl bg-black/60 p-3 sm:p-4 backdrop-blur-md border border-white/5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Raise slider */}
        <AnimatePresence>
          {showRaiseSlider && (
            <motion.div
              className="flex flex-col gap-2 overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {/* Amount display */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">{canBet ? 'Bet amount' : 'Raise to'}</span>
                <motion.span
                  key={effectiveRaiseAmount}
                  className="font-bold text-gold text-sm tabular-nums"
                  initial={{ scale: 1.15, color: '#fff' }}
                  animate={{ scale: 1, color: 'rgb(234 179 8)' }}
                  transition={{ duration: 0.15 }}
                >
                  {effectiveRaiseAmount.toLocaleString()}
                </motion.span>
              </div>

              <Slider
                min={minBetAmount}
                max={maxRaise}
                step={Math.max(1, Math.floor(gameState.minRaise / 10))}
                value={[effectiveRaiseAmount]}
                onValueChange={([v]) => setRaiseAmount(v)}
                className="w-full"
              />

              {/* Quick bet buttons */}
              <div className="flex gap-1.5">
                {potFractions.map(({ label, value }) => {
                  const bet = Math.min(maxRaise, Math.max(minBetAmount, callAmount + Math.floor(gameState.pot * value)));
                  return (
                    <motion.button
                      key={value}
                      className="flex-1 rounded-md bg-white/8 px-2 py-1.5 text-xs text-white/60 hover:bg-white/15 hover:text-white transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRaiseAmount(bet)}
                    >
                      {label}
                    </motion.button>
                  );
                })}
                <motion.button
                  className="flex-1 rounded-md bg-orange-500/15 px-2 py-1.5 text-xs text-orange-300 hover:bg-orange-500/25 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setRaiseAmount(maxRaise); playAllIn(); }}
                >
                  All-In <kbd className="ml-0.5 text-[9px] opacity-50 hidden sm:inline">[B]</kbd>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-2">
          <ActionBtn
            variant="destructive"
            disabled={isSubmitting}
            onClick={() => handleAction('fold')}
            className={cn(
              'transition-all',
              lastPressed === 'fold' && isSubmitting && 'opacity-60'
            )}
          >
            {lastPressed === 'fold' && isSubmitting ? 'Folding…' : <>Fold <kbd className="ml-1 text-[9px] opacity-50 hidden sm:inline">[F]</kbd></>}
          </ActionBtn>

          {canCheck && (
            <ActionBtn
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
              disabled={isSubmitting}
              onClick={() => handleAction('check')}
            >
              {lastPressed === 'check' && isSubmitting ? 'Checking…' : <>Check <kbd className="ml-1 text-[9px] opacity-50 hidden sm:inline">[C]</kbd></>}
            </ActionBtn>
          )}

          {canCall && (
            <ActionBtn
              variant="outline"
              className="border-blue-500/40 text-blue-300 hover:bg-blue-500/20 hover:border-blue-400/60"
              disabled={isSubmitting}
              onClick={() => handleAction('call')}
            >
              {lastPressed === 'call' && isSubmitting
                ? 'Calling…'
                : <>Call <span className="ml-1 font-bold tabular-nums">{callAmount.toLocaleString()}</span> <kbd className="ml-1 text-[9px] opacity-50 hidden sm:inline">[C]</kbd></>
              }
            </ActionBtn>
          )}

          {(canBet || canRaise) && (
            <ActionBtn
              className="bg-gold text-black hover:bg-yellow-400 font-semibold"
              disabled={isSubmitting}
              onClick={() => {
                if (showRaiseSlider) {
                  const actionType = canBet ? 'bet' : 'raise';
                  handleAction(actionType, effectiveRaiseAmount);
                  setShowRaiseSlider(false);
                  setRaiseAmount(null);
                } else {
                  setShowRaiseSlider(true);
                }
              }}
            >
              {showRaiseSlider ? (
                <span className="tabular-nums">
                  {canBet ? 'Bet' : 'Raise'} {effectiveRaiseAmount.toLocaleString()} <kbd className="ml-1 text-[9px] opacity-50 hidden sm:inline">[Space]</kbd>
                </span>
              ) : <>{canBet ? 'Bet' : 'Raise'} <kbd className="ml-1 text-[9px] opacity-50 hidden sm:inline">[Space]</kbd></>}
            </ActionBtn>
          )}
        </div>

        {/* Cancel raise */}
        <AnimatePresence>
          {showRaiseSlider && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors mx-auto"
              onClick={() => { setShowRaiseSlider(false); setRaiseAmount(null); }}
            >
              Cancel
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
