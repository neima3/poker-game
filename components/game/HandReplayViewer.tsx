'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card as PlayingCard } from './Card';
import type { HandReplayData, ActionLogEntry, GamePhase } from '@/types/poker';
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronLeft, ChevronRight, Download, Copy, Check,
} from 'lucide-react';

const PHASE_LABELS: Record<string, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

const PHASE_ORDER: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown', 'pot_awarded'];

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

const SUIT_SYMBOLS: Record<string, string> = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const SPEED_INTERVALS: Record<number, number> = { 0.5: 2000, 1: 1200, 1.5: 800, 2: 500 };

interface HandReplayViewerProps {
  replayData: HandReplayData;
  onClose?: () => void;
}

/** Format card for text display */
function cardText(card: string): string {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  return `${rank === 'T' ? '10' : rank}${SUIT_SYMBOLS[suit] ?? suit}`;
}

/** Generate shareable text export of the hand */
function generateHandText(data: HandReplayData): string {
  const lines: string[] = [];
  lines.push(`--- Hand Replay ---`);
  lines.push(`Blinds: ${data.smallBlind}/${data.bigBlind}`);
  lines.push(`Players: ${data.players.length}`);
  lines.push('');

  // Seats
  lines.push('Seats:');
  for (const p of data.players) {
    const dealer = p.seatNumber === data.dealerSeat ? ' (D)' : '';
    lines.push(`  Seat ${p.seatNumber}: ${p.username} (${p.startingStack.toLocaleString()} chips)${dealer}`);
  }
  lines.push('');

  // Actions by street
  let currentPhase = '';
  for (const a of data.actionLog) {
    if (a.phase !== currentPhase) {
      currentPhase = a.phase;
      const cc = a.communityCards;
      const board = cc.length > 0 ? ` [${cc.map(cardText).join(' ')}]` : '';
      lines.push(`--- ${PHASE_LABELS[currentPhase] ?? currentPhase}${board} ---`);
    }
    const amountStr = a.amount != null && a.action !== 'fold' && a.action !== 'check'
      ? ` ${a.amount.toLocaleString()}`
      : '';
    lines.push(`  ${a.username} ${ACTION_LABELS[a.action] ?? a.action}${amountStr} (pot: ${a.pot.toLocaleString()})`);
  }

  // Result
  if (data.winners.length > 0) {
    lines.push('');
    lines.push('--- Result ---');
    const board = data.communityCards.length > 0
      ? `Board: [${data.communityCards.map(cardText).join(' ')}]`
      : 'No community cards';
    lines.push(board);
    for (const w of data.winners) {
      const hand = w.handName ? ` with ${w.handName}` : '';
      const cards = w.cards ? ` (${w.cards.slice(0, 2).map(cardText).join(' ')})` : '';
      lines.push(`  ${w.username} wins ${w.amount.toLocaleString()}${hand}${cards}`);
    }
  }

  // Hole cards
  const shown = data.players.filter(p => p.holeCards && p.holeCards.length > 0);
  if (shown.length > 0) {
    lines.push('');
    lines.push('Hole Cards:');
    for (const p of shown) {
      lines.push(`  ${p.username}: ${p.holeCards!.map(cardText).join(' ')}`);
    }
  }

  return lines.join('\n');
}

export default function HandReplayViewer({ replayData, onClose }: HandReplayViewerProps) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = initial deal
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // index into SPEEDS
  const [copied, setCopied] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const actions = replayData.actionLog;
  const totalSteps = actions.length;
  const speed = SPEEDS[speedIdx];

  // Group actions by street
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

  // Visible community cards at current step
  const visibleCommunityCards = useMemo(() => {
    if (currentStep < 0) return [];
    const action = actions[currentStep];
    if (!action) return replayData.communityCards;
    return action.communityCards;
  }, [currentStep, actions, replayData.communityCards]);

  // Current pot
  const currentPot = useMemo(() => {
    if (currentStep < 0) return replayData.smallBlind + replayData.bigBlind;
    return actions[currentStep]?.pot ?? replayData.pot;
  }, [currentStep, actions, replayData]);

  // Current phase label
  const currentPhase = useMemo(() => {
    if (currentStep < 0) return 'preflop';
    if (currentStep >= totalSteps - 1) return 'showdown';
    return actions[currentStep]?.phase ?? 'showdown';
  }, [currentStep, actions, totalSteps]);

  // Player states at current step
  const playerStates = useMemo(() => {
    const states = replayData.players.map(p => ({
      ...p,
      currentStack: p.startingStack,
      isFolded: false,
      lastAction: undefined as string | undefined,
      isActive: false,
      isAllIn: false,
    }));

    for (let i = 0; i <= currentStep && i < actions.length; i++) {
      const a = actions[i];
      const ps = states.find(p => p.playerId === a.playerId);
      if (!ps) continue;

      ps.currentStack = a.playerStack;
      ps.lastAction = i === currentStep ? a.action : undefined;

      if (a.action === 'fold') ps.isFolded = true;
      if (a.action === 'all-in') ps.isAllIn = true;
    }

    // Highlight next-to-act
    if (currentStep + 1 < actions.length) {
      const nextAction = actions[currentStep + 1];
      const active = states.find(p => p.playerId === nextAction.playerId);
      if (active) active.isActive = true;
    }

    return states;
  }, [currentStep, actions, replayData.players]);

  // Navigation
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

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeedIdx(prev => (prev + 1) % SPEEDS.length);
  }, []);

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, SPEED_INTERVALS[speed]);
    return () => clearInterval(interval);
  }, [isPlaying, speed, totalSteps]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, togglePlay, goToStart, goToEnd]);

  // Auto-scroll timeline to active action
  useEffect(() => {
    if (!timelineRef.current) return;
    const active = timelineRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentStep]);

  // Copy handler
  const handleCopy = useCallback(async () => {
    const text = generateHandText(replayData);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [replayData]);

  // Download handler
  const handleDownload = useCallback(() => {
    const text = generateHandText(replayData);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hand-replay.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [replayData]);

  // Seat positions around the table (circular layout)
  const getSeatPosition = (seatIdx: number, total: number) => {
    // Start from bottom center, go clockwise
    const angle = (seatIdx / total) * 360 + 90;
    const rx = 42;
    const ry = 36;
    const x = 50 + rx * Math.cos((angle * Math.PI) / 180);
    const y = 50 + ry * Math.sin((angle * Math.PI) / 180);
    return { left: `${x}%`, top: `${y}%` };
  };

  const isAtEnd = currentStep >= totalSteps - 1;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-2xl overflow-hidden border border-white/10"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close replay"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h3 className="text-sm font-bold text-white">Hand Replay</h3>
            <p className="text-xs text-white/40">
              {replayData.smallBlind}/{replayData.bigBlind} blinds
              {' \u00b7 '}
              {replayData.players.length} players
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Copy hand to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Download hand history"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-white/30 tabular-nums ml-1">
            {currentStep + 2}/{totalSteps + 1}
          </span>
        </div>
      </div>

      {/* Table Visualization */}
      <div className="relative flex-1 min-h-[280px]">
        {/* Felt table */}
        <div
          className="absolute inset-6 rounded-[50%] border-[6px] shadow-inner"
          style={{
            background: 'linear-gradient(180deg, var(--color-felt, #166534) 0%, var(--color-felt-dark, #14532d) 100%)',
            borderColor: 'var(--color-rail, #92400e)',
            boxShadow: 'inset 0 4px 30px rgba(0,0,0,0.5)',
          }}
        >
          {/* Inner rail line */}
          <div className="absolute inset-2 rounded-[50%] border border-white/5" />

          {/* Pot display */}
          <div className="absolute top-[22%] left-1/2 -translate-x-1/2 text-center z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPot}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-amber-300 backdrop-blur-sm border border-amber-400/20"
              >
                Pot: {currentPot.toLocaleString()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Community cards */}
          <div className="absolute top-[36%] left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {Array.from({ length: 5 }).map((_, i) => {
              const card = visibleCommunityCards[i];
              return (
                <AnimatePresence key={i} mode="wait">
                  {card ? (
                    <motion.div
                      key={card}
                      initial={{ scale: 0, rotateY: 180, opacity: 0 }}
                      animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                      transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <PlayingCard card={card} size="sm" />
                    </motion.div>
                  ) : (
                    <div key="empty" className="h-11 w-8 rounded border border-white/5 bg-white/[0.02]" />
                  )}
                </AnimatePresence>
              );
            })}
          </div>

          {/* Phase label */}
          <div className="absolute top-[54%] left-1/2 -translate-x-1/2 z-10">
            <AnimatePresence mode="wait">
              <motion.span
                key={currentPhase}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] uppercase tracking-widest text-white/30 font-bold"
              >
                {PHASE_LABELS[currentPhase] ?? currentPhase}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Player seats */}
          {playerStates.map((player, idx) => {
            const pos = getSeatPosition(idx, playerStates.length);
            const isDealerSeat = player.seatNumber === replayData.dealerSeat;

            return (
              <div
                key={player.playerId}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                style={pos}
              >
                <motion.div
                  animate={{
                    opacity: player.isFolded ? 0.3 : 1,
                    scale: player.isActive ? 1.1 : 1,
                  }}
                  transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                  className="flex flex-col items-center gap-0.5"
                >
                  {/* Hole cards */}
                  <div className="flex gap-0.5">
                    {player.holeCards && player.holeCards.length > 0 && !player.isFolded ? (
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

                  {/* Info box */}
                  <div
                    className={`text-center rounded-lg px-2 py-1 border transition-all duration-200 ${
                      player.isActive
                        ? 'bg-black/70 border-amber-400/50 shadow-[0_0_12px_rgba(250,204,21,0.25)]'
                        : 'bg-black/60 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isDealerSeat && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white text-black text-[7px] font-bold shrink-0">
                          D
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-white/80 truncate max-w-[60px]">
                        {player.isBot ? '\ud83e\udd16' : ''}{player.username}
                      </span>
                    </div>
                    <div className="text-[9px] text-amber-300/70 tabular-nums font-bold">
                      {player.currentStack.toLocaleString()}
                    </div>
                  </div>

                  {/* Action badge */}
                  <AnimatePresence>
                    {player.lastAction && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0, y: -4 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          player.lastAction === 'fold'
                            ? 'bg-red-900/40 text-red-400'
                            : player.lastAction === 'all-in'
                            ? 'bg-orange-900/40 text-orange-300'
                            : player.lastAction === 'call'
                            ? 'bg-emerald-900/40 text-emerald-400'
                            : player.lastAction === 'check'
                            ? 'bg-slate-800/40 text-slate-300'
                            : 'bg-amber-900/40 text-amber-300'
                        }`}
                      >
                        {player.lastAction === 'all-in' ? 'ALL IN' : player.lastAction.toUpperCase()}
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
      <div
        ref={timelineRef}
        className="border-t border-white/10 max-h-[150px] overflow-y-auto shrink-0 scrollbar-thin"
      >
        <div className="px-3 py-2 space-y-0.5">
          {/* Initial state */}
          <button
            onClick={() => { setCurrentStep(-1); setIsPlaying(false); }}
            data-active={currentStep === -1}
            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors ${
              currentStep === -1
                ? 'bg-white/10 text-white'
                : 'text-white/30 hover:bg-white/5'
            }`}
          >
            <span className="text-amber-400/60 font-bold text-[10px] uppercase tracking-wider">Deal</span>
            <span className="text-white/40">Cards dealt, blinds posted</span>
          </button>

          {streetGroups.map((group, gi) => (
            <div key={gi}>
              <div className="text-[10px] uppercase tracking-wider text-white/20 font-bold mt-2 mb-0.5 px-2">
                {PHASE_LABELS[group.phase] ?? group.phase}
                {group.actions[0]?.communityCards.length > 0 && (
                  <span className="ml-2 text-white/15 normal-case tracking-normal">
                    [{group.actions[0].communityCards.map(cardText).join(' ')}]
                  </span>
                )}
              </div>
              {group.actions.map((a) => (
                <button
                  key={a.index}
                  onClick={() => { setCurrentStep(a.index); setIsPlaying(false); }}
                  data-active={a.index === currentStep}
                  className={`w-full text-left px-2 py-0.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    a.index === currentStep
                      ? 'bg-white/10 text-white'
                      : a.index < currentStep
                        ? 'text-white/40 hover:bg-white/5'
                        : 'text-white/20 hover:bg-white/5'
                  }`}
                >
                  <span className="font-medium w-16 truncate shrink-0">{a.username}</span>
                  <span className={ACTION_COLORS[a.action] ?? 'text-white/50'}>
                    {ACTION_LABELS[a.action] ?? a.action}
                  </span>
                  {a.amount != null && a.action !== 'fold' && a.action !== 'check' && (
                    <span className="text-white/50 tabular-nums">{a.amount.toLocaleString()}</span>
                  )}
                  <span className="ml-auto text-white/15 tabular-nums text-[10px] shrink-0">
                    {a.pot.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Winners (shown when at end) */}
          <AnimatePresence>
            {isAtEnd && replayData.winners.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 pt-2 border-t border-white/10"
              >
                <div className="text-[10px] uppercase tracking-wider text-amber-400/60 font-bold mb-1 px-2">
                  Result
                </div>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/10 bg-black/30 shrink-0">
        <button
          onClick={goToStart}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Go to start (Home)"
          aria-label="Go to start"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={goPrev}
          disabled={currentStep <= -1}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Previous action (\u2190)"
          aria-label="Previous action"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={togglePlay}
          className="p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={goNext}
          disabled={isAtEnd}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Next action (\u2192)"
          aria-label="Next action"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={goToEnd}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Go to end (End)"
          aria-label="Go to end"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Speed control */}
        <button
          onClick={cycleSpeed}
          className="ml-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-colors tabular-nums"
          title="Playback speed"
        >
          {speed}x
        </button>

        {/* Progress bar */}
        <div className="flex-1 ml-2">
          <div
            className="relative h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const step = Math.round(ratio * totalSteps) - 1;
              setCurrentStep(Math.max(-1, Math.min(totalSteps - 1, step)));
              setIsPlaying(false);
            }}
          >
            <motion.div
              className="absolute inset-y-0 left-0 bg-amber-400/60 rounded-full"
              animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              transition={{ duration: 0.15 }}
            />
            {/* Phase markers */}
            {streetGroups.slice(1).map((group) => {
              const firstIdx = group.actions[0]?.index ?? 0;
              const pct = (firstIdx / totalSteps) * 100;
              return (
                <div
                  key={group.phase}
                  className="absolute top-0 bottom-0 w-px bg-white/20"
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
