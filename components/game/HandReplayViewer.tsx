'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card as PlayingCard } from './Card';
import type { HandReplayData, ActionLogEntry, GamePhase } from '@/types/poker';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';

const PHASE_LABELS: Record<string, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

const ACTION_COLORS: Record<string, string> = {
  fold: 'text-red-400',
  check: 'text-slate-300',
  call: 'text-emerald-400',
  bet: 'text-amber-400',
  raise: 'text-amber-300',
  'all-in': 'text-red-300 font-bold',
};

const ACTION_LABELS: Record<string, string> = {
  fold: 'Folds',
  check: 'Checks',
  call: 'Calls',
  bet: 'Bets',
  raise: 'Raises to',
  'all-in': 'ALL-IN',
};

interface HandReplayViewerProps {
  replayData: HandReplayData;
  onClose?: () => void;
}

export default function HandReplayViewer({ replayData, onClose }: HandReplayViewerProps) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = initial deal
  const [isPlaying, setIsPlaying] = useState(false);

  const actions = replayData.actionLog;
  const totalSteps = actions.length;

  // Group actions by street phase for the timeline
  const streetGroups = useMemo(() => {
    const groups: { phase: string; actions: (ActionLogEntry & { index: number })[] }[] = [];
    let currentPhase = '';
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.phase !== currentPhase) {
        currentPhase = a.phase;
        groups.push({ phase: currentPhase, actions: [] });
      }
      groups[groups.length - 1].actions.push({ ...a, index: i });
    }
    return groups;
  }, [actions]);

  // Determine visible community cards at current step
  const visibleCommunityCards = useMemo(() => {
    if (currentStep < 0) return [];
    const action = actions[currentStep];
    if (!action) return replayData.communityCards;
    return action.communityCards;
  }, [currentStep, actions, replayData.communityCards]);

  // Current pot at step
  const currentPot = useMemo(() => {
    if (currentStep < 0) {
      return replayData.smallBlind + replayData.bigBlind;
    }
    return actions[currentStep]?.pot ?? replayData.pot;
  }, [currentStep, actions, replayData]);

  // Current phase label
  const currentPhase = useMemo(() => {
    if (currentStep < 0) return 'preflop';
    return actions[currentStep]?.phase ?? 'showdown';
  }, [currentStep, actions]);

  // Player states at current step (track who folded, stack changes)
  const playerStates = useMemo(() => {
    const states = replayData.players.map(p => ({
      ...p,
      currentStack: p.startingStack,
      isFolded: false,
      lastAction: undefined as string | undefined,
      isActive: false,
    }));

    // Apply blind deductions
    // SB and BB were already accounted for in startingStack calc;
    // action log amounts track actual action amounts

    for (let i = 0; i <= currentStep && i < actions.length; i++) {
      const a = actions[i];
      const ps = states.find(p => p.playerId === a.playerId);
      if (!ps) continue;

      ps.currentStack = a.playerStack;
      ps.lastAction = i === currentStep ? a.action : undefined;

      if (a.action === 'fold') {
        ps.isFolded = true;
      }
    }

    // Mark active player for next step
    if (currentStep + 1 < actions.length) {
      const nextAction = actions[currentStep + 1];
      const active = states.find(p => p.playerId === nextAction.playerId);
      if (active) active.isActive = true;
    }

    return states;
  }, [currentStep, actions, replayData.players]);

  // Auto-play
  const goNext = useCallback(() => {
    setCurrentStep(prev => {
      if (prev >= totalSteps - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setCurrentStep(prev => Math.max(-1, prev - 1));
    setIsPlaying(false);
  }, []);

  const goToStart = useCallback(() => {
    setCurrentStep(-1);
    setIsPlaying(false);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentStep(totalSteps - 1);
    setIsPlaying(false);
  }, [totalSteps]);

  // Auto-play timer
  useState(() => {
    if (!isPlaying) return;
    const interval = setInterval(goNext, 1200);
    return () => clearInterval(interval);
  });

  // Use effect for auto-play
  // We handle this with a more explicit approach
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Auto-play effect via polling
  useMemo(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, totalSteps]);

  // Seat positions around the table (max 9 seats)
  const getSeatPosition = (seatIdx: number, total: number) => {
    const angle = (seatIdx / total) * 360 - 90; // Start from top
    const rx = 42; // % from center
    const ry = 38;
    const x = 50 + rx * Math.cos((angle * Math.PI) / 180);
    const y = 50 + ry * Math.sin((angle * Math.PI) / 180);
    return { left: `${x}%`, top: `${y}%` };
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-2xl overflow-hidden border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h3 className="text-sm font-bold text-white">Hand Replay</h3>
            <p className="text-xs text-white/40">
              {replayData.smallBlind}/{replayData.bigBlind} blinds
              {' · '}
              {replayData.players.length} players
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/30 tabular-nums">
            {currentStep + 2}/{totalSteps + 1}
          </span>
        </div>
      </div>

      {/* Table Visualization */}
      <div className="relative flex-1 min-h-[280px]">
        {/* Felt table */}
        <div className="absolute inset-6 rounded-[50%] bg-gradient-to-b from-emerald-800/80 to-emerald-900/80 border-4 border-amber-900/60 shadow-inner">
          {/* Pot display */}
          <div className="absolute top-[25%] left-1/2 -translate-x-1/2 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPot}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-xs text-amber-300/80 font-bold"
              >
                Pot: {currentPot.toLocaleString()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Community cards */}
          <div className="absolute top-[38%] left-1/2 -translate-x-1/2 flex gap-1">
            <AnimatePresence mode="popLayout">
              {visibleCommunityCards.map((card, i) => (
                <motion.div
                  key={`${card}-${i}`}
                  initial={{ scale: 0, rotateY: 180 }}
                  animate={{ scale: 1, rotateY: 0 }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <PlayingCard card={card} size="sm" />
                </motion.div>
              ))}
            </AnimatePresence>
            {visibleCommunityCards.length === 0 && (
              <div className="text-white/20 text-xs py-2">No cards dealt yet</div>
            )}
          </div>

          {/* Phase label */}
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2">
            <span className="text-[10px] uppercase tracking-widest text-white/25 font-bold">
              {PHASE_LABELS[currentPhase] ?? currentPhase}
            </span>
          </div>

          {/* Player seats */}
          {playerStates.map((player, idx) => {
            const pos = getSeatPosition(idx, playerStates.length);
            const isDealerSeat = player.seatNumber === replayData.dealerSeat;

            return (
              <div
                key={player.playerId}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={pos}
              >
                <motion.div
                  animate={{
                    opacity: player.isFolded ? 0.35 : 1,
                    scale: player.isActive ? 1.08 : 1,
                  }}
                  className={`flex flex-col items-center gap-0.5 ${player.isActive ? 'ring-2 ring-amber-400/50 rounded-lg p-1' : 'p-1'}`}
                >
                  {/* Hole cards */}
                  <div className="flex gap-0.5">
                    {player.holeCards && !player.isFolded ? (
                      player.holeCards.map((c, ci) => (
                        <PlayingCard key={ci} card={c} size="sm" />
                      ))
                    ) : (
                      <>
                        <PlayingCard card="??" size="sm" faceDown />
                        <PlayingCard card="??" size="sm" faceDown />
                      </>
                    )}
                  </div>

                  {/* Name and stack */}
                  <div className="text-center">
                    <div className="flex items-center gap-1">
                      {isDealerSeat && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 text-black text-[8px] font-bold">D</span>
                      )}
                      <span className="text-[10px] font-medium text-white/80 truncate max-w-[60px]">
                        {player.username}
                      </span>
                    </div>
                    <div className="text-[9px] text-white/40 tabular-nums">
                      {player.currentStack.toLocaleString()}
                    </div>
                  </div>

                  {/* Last action badge */}
                  <AnimatePresence>
                    {player.lastAction && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={`text-[9px] font-bold uppercase ${ACTION_COLORS[player.lastAction] ?? 'text-white/60'}`}
                      >
                        {player.lastAction}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Log Timeline */}
      <div className="border-t border-white/10 max-h-[160px] overflow-y-auto">
        <div className="px-3 py-2 space-y-1">
          {streetGroups.map((group, gi) => (
            <div key={gi}>
              <div className="text-[10px] uppercase tracking-wider text-white/25 font-bold mt-1 mb-0.5">
                {PHASE_LABELS[group.phase] ?? group.phase}
              </div>
              {group.actions.map((a) => (
                <button
                  key={a.index}
                  onClick={() => { setCurrentStep(a.index); setIsPlaying(false); }}
                  className={`w-full text-left px-2 py-0.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    a.index === currentStep
                      ? 'bg-white/10 text-white'
                      : a.index < currentStep
                        ? 'text-white/40 hover:bg-white/5'
                        : 'text-white/20 hover:bg-white/5'
                  }`}
                >
                  <span className="font-medium w-16 truncate">{a.username}</span>
                  <span className={ACTION_COLORS[a.action] ?? 'text-white/50'}>
                    {ACTION_LABELS[a.action] ?? a.action}
                  </span>
                  {a.amount !== undefined && a.action !== 'fold' && a.action !== 'check' && (
                    <span className="text-white/50 tabular-nums">{a.amount.toLocaleString()}</span>
                  )}
                  <span className="ml-auto text-white/20 tabular-nums text-[10px]">
                    pot {a.pot.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Winners */}
          {currentStep >= totalSteps - 1 && replayData.winners.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-amber-400/60 font-bold mb-1">Winners</div>
              {replayData.winners.map((w, i) => (
                <div key={i} className="text-xs flex items-center gap-2 px-2 py-0.5">
                  <span className="font-medium text-amber-300">{w.username}</span>
                  <span className="text-emerald-400 font-bold tabular-nums">+{w.amount.toLocaleString()}</span>
                  {w.handName && <span className="text-white/40">{w.handName}</span>}
                  {w.cards && (
                    <div className="flex gap-0.5 ml-1">
                      {w.cards.slice(0, 5).map((c, ci) => (
                        <PlayingCard key={ci} card={c} size="sm" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-white/10 bg-black/30">
        <button
          onClick={goToStart}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Go to start"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={goPrev}
          disabled={currentStep <= -1}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
          title="Previous action"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={goNext}
          disabled={currentStep >= totalSteps - 1}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
          title="Next action"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={goToEnd}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Go to end"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 ml-3">
          <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-amber-400/60 rounded-full"
              animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              transition={{ duration: 0.15 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
