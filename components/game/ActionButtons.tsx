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
      <div className="flex items-center justify-center py-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-white/20 animate-pulse">
          Waiting for your turn
        </p>
      </div>
    );
  }

  // All-In or Fold mode — simplified UI
  if (gameState.gameMode === 'allin_or_fold') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="aof-actions"
          className="flex flex-col gap-4 rounded-2xl glass-dark p-5 border border-white/10 shadow-2xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
        >
          <div className="text-center text-[10px] text-orange-400 font-black uppercase tracking-[0.4em]">
            All-In or Fold
          </div>
          <div className="flex gap-4">
            <ActionBtn
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => handleAction('fold')}
              className="h-14 text-lg font-black tracking-widest bg-red-950/40 border-red-500/30 hover:bg-red-900/60 shadow-[0_4px_20px_rgba(239,68,68,0.2)]"
            >
              {lastPressed === 'fold' && isSubmitting ? 'FOLDING...' : 'FOLD'}
            </ActionBtn>

            <ActionBtn
              className="h-14 bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-500 hover:to-red-500 font-black text-lg tracking-widest shadow-[0_4px_20px_rgba(249,115,22,0.4)] border-orange-400/30"
              disabled={isSubmitting}
              onClick={() => { playAllIn(); handleAction('all-in'); }}
            >
              {lastPressed === 'all-in' && isSubmitting ? 'ALL-IN...' : 'ALL-IN'}
            </ActionBtn>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  const potFractions = [
    { label: '½ Pot', value: 0.5 },
    { label: '¾ Pot', value: 0.75 },
    { label: 'Pot', value: 1 },
  ];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="actions"
        className="flex flex-col gap-3 rounded-2xl glass-dark p-4 sm:p-5 border border-white/10 shadow-2xl backdrop-blur-2xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Raise slider */}
        <AnimatePresence>
          {showRaiseSlider && (
            <motion.div
              className="flex flex-col gap-4 overflow-hidden mb-2"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              {/* Amount display */}
              <div className="flex items-end justify-between px-1">
                <span className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">
                  {canBet ? 'Bet amount' : 'Raise to'}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white tabular-nums">
                    {effectiveRaiseAmount.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-gold uppercase">chips</span>
                </div>
              </div>

              <div className="px-2">
                <Slider
                  min={minBetAmount}
                  max={maxRaise}
                  step={Math.max(1, Math.floor(gameState.minRaise / 10))}
                  value={[effectiveRaiseAmount]}
                  onValueChange={([v]) => setRaiseAmount(v)}
                  className="w-full"
                />
              </div>

              {/* Quick bet buttons */}
              <div className="flex gap-2">
                {potFractions.map(({ label, value }) => {
                  const bet = Math.min(maxRaise, Math.max(minBetAmount, callAmount + Math.floor(gameState.pot * value)));
                  return (
                    <motion.button
                      key={value}
                      className="flex-1 rounded-lg bg-white/5 px-2 py-2.5 text-[10px] font-black uppercase tracking-wider text-white/60 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all shadow-lg"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRaiseAmount(bet)}
                    >
                      {label}
                    </motion.button>
                  );
                })}
                <motion.button
                  className="flex-1 rounded-lg bg-orange-500/10 px-2 py-2.5 text-[10px] font-black uppercase tracking-wider text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all shadow-lg"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setRaiseAmount(maxRaise); playAllIn(); }}
                >
                  Max-In
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-3 h-14">
          <ActionBtn
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleAction('fold')}
            className="h-full bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70 font-black tracking-widest text-sm shadow-xl"
          >
            {lastPressed === 'fold' && isSubmitting ? '...' : 'FOLD'}
          </ActionBtn>

          {canCheck && (
            <ActionBtn
              variant="outline"
              className="h-full border-white/10 text-white/90 bg-white/5 hover:bg-white/10 font-black tracking-widest text-sm shadow-xl"
              disabled={isSubmitting}
              onClick={() => handleAction('check')}
            >
              {lastPressed === 'check' && isSubmitting ? '...' : 'CHECK'}
            </ActionBtn>
          )}

          {canCall && (
            <ActionBtn
              variant="outline"
              className="h-full border-blue-500/30 text-blue-400 bg-blue-500/5 hover:bg-blue-500/15 font-black tracking-widest text-sm shadow-xl flex flex-col items-center justify-center gap-0"
              disabled={isSubmitting}
              onClick={() => handleAction('call')}
            >
              {lastPressed === 'call' && isSubmitting
                ? '...'
                : <>
                    <span className="text-[10px] text-blue-400/60 font-black">CALL</span>
                    <span className="tabular-nums text-lg">{callAmount.toLocaleString()}</span>
                  </>
              }
            </ActionBtn>
          )}

          {(canBet || canRaise) && (
            <ActionBtn
              className="h-full bg-gradient-to-br from-gold to-gold-dark text-black hover:from-gold-light hover:to-gold font-black tracking-widest text-sm shadow-[0_8px_25px_rgba(212,168,67,0.3)] border-gold-light/20 flex flex-col items-center justify-center gap-0"
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
                 <>
                  <span className="text-[10px] text-black/60 font-black">{canBet ? 'BET' : 'RAISE'}</span>
                  <span className="tabular-nums text-lg">{effectiveRaiseAmount.toLocaleString()}</span>
                </>
              ) : <>{canBet ? 'BET' : 'RAISE'}</>}
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
              className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors mx-auto mt-1"
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

