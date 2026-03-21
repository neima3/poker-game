'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PokerTable } from '@/components/game/PokerTable';
import { ActionButtons } from '@/components/game/ActionButtons';
import { ErrorBoundary } from '@/components/game/ErrorBoundary';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  Zap, ArrowLeft, Coins, Bot, ChevronDown, DoorOpen,
  TrendingUp, Activity, RefreshCw, AlertTriangle,
} from 'lucide-react';
import type { GameState, ActionType, BotDifficulty, SeatRow } from '@/types/poker';
import {
  playNewHand, playChipSplash, playFold, playCheck, playError,
  getPackedSound, playAllIn,
} from '@/lib/sounds';
import type { FastFoldSession } from '@/lib/poker/fast-fold';

const BOT_LABELS: Record<BotDifficulty, string> = {
  fish: '🐟 Fish (easy)',
  regular: '🎯 Regular',
  shark: '🦈 Shark (hard)',
  pro: '👑 Pro (expert)',
};

const TIME_BANK_SECONDS = 20;

// ─── Circular time bank arc ────────────────────────────────────────────────────

function TimeBankArc({ timeLeft, total = TIME_BANK_SECONDS }: { timeLeft: number; total?: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = timeLeft / total;
  const dashOffset = circumference * (1 - progress);
  const color = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#22d3ee';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 52, height: 52 }}>
      <svg width="52" height="52" className="absolute inset-0 -rotate-90">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="26" cy="26" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
        />
      </svg>
      <motion.span
        key={timeLeft}
        className="relative font-bold tabular-nums text-sm"
        style={{ color }}
        animate={timeLeft <= 5 ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4 }}
      >
        {timeLeft}
      </motion.span>
    </div>
  );
}

// ─── Pre-action panel ─────────────────────────────────────────────────────────

type PreAction = 'fold' | 'check-fold' | 'call-any' | null;

function PreActionPanel({
  preAction,
  onChange,
}: {
  preAction: PreAction;
  onChange: (a: PreAction) => void;
}) {
  const options: { key: NonNullable<PreAction>; label: string; desc: string }[] = [
    { key: 'fold', label: 'Fold', desc: 'Fold when my turn' },
    { key: 'check-fold', label: 'Check / Fold', desc: 'Check if possible, else fold' },
    { key: 'call-any', label: 'Call Any', desc: 'Call any bet' },
  ];

  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
    >
      <p className="text-center text-[10px] text-white/30 uppercase tracking-wider">Pre-action</p>
      <div className="flex gap-2">
        {options.map(({ key, label, desc }) => (
          <motion.button
            key={key}
            className={cn(
              'flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all',
              preAction === key
                ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
            )}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(preAction === key ? null : key)}
            title={desc}
          >
            {label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Fast-fold swoosh overlay ─────────────────────────────────────────────────
// Shown for ~400ms when an instant new hand is dealt after folding.

function FastFoldSwoosh({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Cyan flash */}
          <motion.div
            className="absolute inset-0 bg-cyan-400/12"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          {/* Speed lines radiating outward */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 h-px origin-left bg-gradient-to-r from-cyan-400/70 to-transparent"
              style={{
                width: '50vw',
                rotate: `${i * 45}deg`,
                translateX: '-100%',
                translateY: '-50%',
              }}
              initial={{ scaleX: 0, opacity: 0.8 }}
              animate={{ scaleX: 1.5, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut', delay: i * 0.015 }}
            />
          ))}
          {/* "ZOOM" label */}
          <motion.div
            className="relative flex items-center gap-2 rounded-xl bg-cyan-500/20 px-5 py-2.5 backdrop-blur-sm border border-cyan-500/30"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Zap className="h-4 w-4 text-cyan-300" />
            <span className="text-sm font-bold text-cyan-200 tracking-widest">NEW HAND</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Hands per hour badge ─────────────────────────────────────────────────────

function HandsPerHourBadge({ handsPerHour }: { handsPerHour: number }) {
  const [prev, setPrev] = useState(handsPerHour);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (handsPerHour !== prev) {
      setBump(true);
      setPrev(handsPerHour);
      const t = setTimeout(() => setBump(false), 500);
      return () => clearTimeout(t);
    }
  }, [handsPerHour, prev]);

  return (
    <motion.span
      className="hidden sm:flex items-center gap-1 text-[11px] text-cyan-400/80"
      animate={bump ? { scale: [1, 1.25, 1], color: ['#67e8f9', '#a5f3fc', '#67e8f9'] } : {}}
      transition={{ duration: 0.4 }}
    >
      <Activity className="h-3 w-3" />
      {handsPerHour > 0 ? <span className="tabular-nums font-semibold">{handsPerHour}/hr</span> : null}
    </motion.span>
  );
}

// ─── Low-stack rebuy banner ───────────────────────────────────────────────────

function LowStackBanner({
  visible,
  onRebuy,
  rebuying,
}: {
  visible: boolean;
  onRebuy: () => void;
  rebuying: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Stack running low — add chips to keep playing</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-3 shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
            onClick={onRebuy}
            disabled={rebuying}
          >
            {rebuying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Top Up'}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function FastFoldPage() {
  const router = useRouter();
  const [session, setSession] = useState<FastFoldSession | null>(null);
  const [gameState, setGameState] = useState<Omit<GameState, 'deck'> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('regular');
  const [starting, setStarting] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [sessionStats, setSessionStats] = useState<any>(null);
  const [handFlash, setHandFlash] = useState(false);
  const [preAction, setPreAction] = useState<PreAction>(null);
  const [timeBank, setTimeBank] = useState<number>(TIME_BANK_SECONDS);
  const [handsPerHour, setHandsPerHour] = useState<number>(0);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [positionName, setPositionName] = useState<string | null>(null);
  const [rebuying, setRebuying] = useState(false);
  // Tracks how many seconds since session start for live HPH ticker
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);

  const prevPhase = useRef<string | null>(null);
  const timeBankRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasMyTurn = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof createClient>['channel'] | null>(null);
  const elapsedTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = session?.playerId;
  const player = gameState?.players.find(p => p.playerId === userId);
  const isMyTurn = gameState && userId
    ? gameState.activeSeat === player?.seatNumber
    : false;

  // Low stack threshold: warn when stack < 10x big blind
  const isLowStack = session
    ? session.stack < session.bigBlind * 10 && session.stack > 0
    : false;

  // Fetch pool player count for lobby display
  useEffect(() => {
    fetch('/api/fast-fold/pool')
      .then(r => r.json())
      .then(d => setPoolCount(d.playersInPool))
      .catch(() => {});
  }, []);

  // Live elapsed-time ticker — updates every second while in session
  useEffect(() => {
    if (!session) {
      if (elapsedTickRef.current) {
        clearInterval(elapsedTickRef.current);
        elapsedTickRef.current = null;
      }
      return;
    }
    // Compute immediately on session change
    setSessionElapsedSec(Math.floor((Date.now() - session.startedAt) / 1000));
    elapsedTickRef.current = setInterval(() => {
      setSessionElapsedSec(Math.floor((Date.now() - session.startedAt) / 1000));
    }, 1000);
    return () => {
      if (elapsedTickRef.current) clearInterval(elapsedTickRef.current);
    };
  }, [session?.sessionId, session?.startedAt]);

  // Compute hands/hour from live elapsed time
  useEffect(() => {
    if (!session || sessionElapsedSec <= 0) return;
    const elapsedHours = sessionElapsedSec / 3600;
    setHandsPerHour(Math.round(session.handsPlayed / elapsedHours));
  }, [session?.handsPlayed, sessionElapsedSec]);

  // Subscribe to Supabase Realtime channel for instant new-hand push updates
  useEffect(() => {
    if (!session) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`fast_fold:${session.sessionId}`)
      .on('broadcast', { event: 'new_hand' }, ({ payload }) => {
        if (payload.gameState) {
          setHandFlash(true);
          setTimeout(() => setHandFlash(false), 420);
          setGameState(payload.gameState);
          playNewHand();
          setPreAction(null);
        }
        if (payload.session) setSession(payload.session);
        if (payload.positionName) setPositionName(payload.positionName);
      })
      .subscribe();

    // @ts-ignore — store ref for cleanup
    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.sessionId]);

  // Time bank countdown when it's my turn
  useEffect(() => {
    if (isMyTurn && !wasMyTurn.current) {
      setTimeBank(TIME_BANK_SECONDS);
      wasMyTurn.current = true;
      timeBankRef.current = setInterval(() => {
        setTimeBank(prev => {
          if (prev <= 1) {
            clearInterval(timeBankRef.current!);
            timeBankRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!isMyTurn) {
      wasMyTurn.current = false;
      if (timeBankRef.current) {
        clearInterval(timeBankRef.current);
        timeBankRef.current = null;
      }
    }
    return () => {
      if (timeBankRef.current) clearInterval(timeBankRef.current);
    };
  }, [isMyTurn]);

  // Auto-fold when time bank hits 0
  useEffect(() => {
    if (timeBank === 0 && isMyTurn && !isSubmitting) {
      playFold();
      submitAction('fold');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeBank]);

  // Execute pre-action when it becomes my turn
  useEffect(() => {
    if (!isMyTurn || !preAction || isSubmitting || !gameState || !player) return;

    const callAmount = Math.max(0, gameState.currentBet - player.currentBet);
    const action = preAction;
    setPreAction(null);

    if (action === 'fold') {
      playFold();
      submitAction('fold');
    } else if (action === 'check-fold') {
      if (callAmount > 0) {
        playFold();
        submitAction('fold');
      } else {
        playCheck();
        submitAction('check');
      }
    } else if (action === 'call-any') {
      if (callAmount > 0 && callAmount < player.stack) {
        playChipSplash();
        submitAction('call');
      } else if (callAmount === 0) {
        playCheck();
        submitAction('check');
      } else {
        playAllIn();
        submitAction('all-in');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn]);

  // Start a fast fold session
  const startSession = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/fast-fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyIn: 5000, botDifficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setSession(data.session);
      setGameState(data.gameState);
      setSessionElapsedSec(0);
      playNewHand();
    } catch {
      setError('Network error');
    } finally {
      setStarting(false);
    }
  }, [botDifficulty]);

  // Submit action
  const submitAction = useCallback(async (action: ActionType, amount?: number) => {
    if (!session) return;
    setIsSubmitting(true);
    setError(null);

    if (timeBankRef.current) {
      clearInterval(timeBankRef.current);
      timeBankRef.current = null;
    }

    try {
      const res = await fetch(`/api/fast-fold/${session.sessionId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        playError();
        return;
      }

      if (data.sessionEnded) {
        setSession(null);
        setGameState(null);
        // Prefer stats from the action response; fall back to session-derived data
        setSessionStats(data.sessionStats ?? {
          handsPlayed: session.handsPlayed,
          handsWon: session.handsWon,
          profit: session.stack - session.startStack,
          peakStack: session.peakStack,
          duration: Date.now() - session.startedAt,
        });
        return;
      }

      if (data.session) setSession(data.session);

      if (data.instantNewHand) {
        // Show the fast-fold swoosh animation
        setHandFlash(true);
        setTimeout(() => setHandFlash(false), 420);
        playNewHand();
        setPreAction(null);
      }

      if (data.gameState) setGameState(data.gameState);
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }, [session]);

  const handleAction = useCallback((action: ActionType, amount?: number) => {
    if (action === 'fold') playFold();
    else if (action === 'bet' || action === 'raise') playChipSplash();
    else if (action === 'check' || action === 'call') playCheck();
    submitAction(action, amount);
  }, [submitAction]);

  // Cash out
  const cashOut = useCallback(async () => {
    if (!session) return;
    setCashingOut(true);
    try {
      const res = await fetch(`/api/fast-fold/${session.sessionId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setSession(null);
      setGameState(null);
      setSessionStats(data.stats);
    } catch {
      setError('Failed to cash out');
    } finally {
      setCashingOut(false);
    }
  }, [session]);

  // Rebuy — buy into a new session with the same settings
  const rebuy = useCallback(async () => {
    setRebuying(true);
    setError(null);
    try {
      const res = await fetch('/api/fast-fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyIn: 5000, botDifficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setSessionStats(null);
      setSession(data.session);
      setGameState(data.gameState);
      setPositionName(null);
      setSessionElapsedSec(0);
      playNewHand();
    } catch {
      setError('Network error');
    } finally {
      setRebuying(false);
    }
  }, [botDifficulty]);

  // Top-up: add chips to the current session mid-game
  const topUp = useCallback(async () => {
    setRebuying(true);
    setError(null);
    try {
      // We end the current session (cash out remaining) and start a fresh one,
      // preserving stats context. This is the cleanest way to implement a mid-
      // session top-up without a dedicated API endpoint.
      if (session) {
        await fetch(`/api/fast-fold/${session.sessionId}`, { method: 'DELETE' });
      }
      const res = await fetch('/api/fast-fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyIn: 5000, botDifficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setSession(data.session);
      setGameState(data.gameState);
      setPositionName(null);
      setSessionElapsedSec(0);
      playNewHand();
    } catch {
      setError('Network error');
    } finally {
      setRebuying(false);
    }
  }, [session, botDifficulty]);

  // Sound effects for phase changes
  useEffect(() => {
    const phase = gameState?.phase;
    if (!phase || phase === prevPhase.current) return;
    if (phase === 'pot_awarded') getPackedSound('win')();
    if (phase === 'flop' || phase === 'turn' || phase === 'river') playChipSplash();
    prevPhase.current = phase;
  }, [gameState?.phase]);

  // Build mock seats
  const mockSeats: SeatRow[] = gameState
    ? gameState.players.map(p => ({
        id: p.playerId,
        table_id: 'fast-fold',
        seat_number: p.seatNumber,
        player_id: p.playerId,
        stack: p.stack,
        is_sitting_out: p.isSittingOut,
        joined_at: '',
        poker_profiles: { username: p.username, avatar_url: p.avatarUrl },
      }))
    : [];

  // ─── Pre-session lobby ─────────────────────────────────────────────────────

  if (!session && !sessionStats) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 flex flex-col items-center gap-8">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold">Fast Fold</h1>
          </div>
          <p className="text-muted-foreground max-w-md">
            Fold instantly and jump to a new hand — no waiting. 200–300 hands
            per hour. The fastest way to play poker.
          </p>
        </motion.div>

        {/* Live pool stats */}
        <motion.div
          className="flex gap-6 rounded-xl border border-white/5 bg-white/3 px-6 py-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
        >
          <div className="text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Hands/hr</p>
            <p className="text-lg font-bold text-cyan-400">250+</p>
          </div>
          <div className="w-px bg-white/8" />
          <div className="text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">In pool</p>
            <div className="flex items-center justify-center gap-1.5">
              <motion.div
                className="h-1.5 w-1.5 rounded-full bg-green-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <p className="text-lg font-bold text-green-400">
                {poolCount !== null ? poolCount : '—'}
              </p>
            </div>
          </div>
          <div className="w-px bg-white/8" />
          <div className="text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Time bank</p>
            <p className="text-lg font-bold text-white">20s</p>
          </div>
        </motion.div>

        <motion.div
          className="w-full rounded-xl border bg-card p-6 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Buy-in</span>
            <span className="text-gold font-bold">5,000 chips</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Blinds</span>
            <span className="text-muted-foreground">25/50</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Table</span>
            <span className="text-muted-foreground">6-Max</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Bot Difficulty</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Bot className="h-3.5 w-3.5" />
                  {BOT_LABELS[botDifficulty]}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Opponent difficulty</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(['fish', 'regular', 'shark', 'pro'] as BotDifficulty[]).map(d => (
                  <DropdownMenuItem
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={botDifficulty === d ? 'bg-accent' : ''}
                  >
                    {BOT_LABELS[d]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            onClick={startSession}
            disabled={starting}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white gap-2"
          >
            <Zap className="h-4 w-4" />
            {starting ? 'Starting...' : 'Start Rush Session'}
          </Button>
        </motion.div>
      </div>
    );
  }

  // ─── Session ended — show stats ────────────────────────────────────────────

  if (!session && sessionStats) {
    const profit = sessionStats.profit ?? 0;
    const duration = Math.floor((sessionStats.duration ?? 0) / 60000);
    const sessionHandsPerHour = sessionStats.handsPlayed > 0 && sessionStats.duration > 0
      ? Math.round((sessionStats.handsPlayed / sessionStats.duration) * 3_600_000)
      : 0;

    return (
      <div className="mx-auto max-w-lg px-4 py-16 flex flex-col items-center gap-6">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h1 className="text-2xl font-bold mb-2">Session Complete</h1>
          <p className="text-muted-foreground">Here's how you did</p>
        </motion.div>

        <motion.div
          className="w-full rounded-xl border bg-card p-6 space-y-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Hands Played</span>
            <span className="font-bold">{sessionStats.handsPlayed}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Hands Won</span>
            <span className="font-bold">{sessionStats.handsWon}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-bold">{duration}m</span>
          </div>
          {sessionHandsPerHour > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hands / Hour</span>
              <motion.span
                className="font-bold text-cyan-400"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
              >
                {sessionHandsPerHour}
              </motion.span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Peak Stack</span>
            <span className="font-bold text-gold">{(sessionStats.peakStack ?? 0).toLocaleString()}</span>
          </div>
          <div className="border-t border-border/50 pt-3 flex justify-between">
            <span className="font-medium">Profit / Loss</span>
            <span className={cn(
              'font-bold',
              profit > 0 ? 'text-green-400' : profit < 0 ? 'text-red-400' : 'text-white/50'
            )}>
              {profit > 0 ? '+' : ''}{profit.toLocaleString()} chips
            </span>
          </div>
        </motion.div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/lobby')}>
            Back to Lobby
          </Button>
          <Button
            className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white gap-2"
            onClick={rebuy}
            disabled={rebuying}
          >
            {rebuying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {rebuying ? 'Buying in...' : 'Rebuy & Play Again'}
          </Button>
        </div>
      </div>
    );
  }

  // ─── In-session gameplay ───────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-2">
        <button
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          onClick={() => router.push('/lobby')}
        >
          <ArrowLeft className="h-4 w-4" /> Lobby
        </button>

        <div className="text-center flex items-center gap-3">
          <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/25 gap-1">
            <Zap className="h-3 w-3" />
            Fast Fold
          </Badge>
          <span className="text-[11px] text-white/40">
            25/50 · Hand #{session?.handsPlayed ?? 0}
          </span>
          {positionName && (
            <Badge className="hidden sm:flex bg-white/5 text-white/60 border-white/10 text-[10px] px-1.5 py-0.5">
              {positionName}
            </Badge>
          )}
          {/* Live hands-per-hour counter */}
          <HandsPerHourBadge handsPerHour={handsPerHour} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Coins className="h-3.5 w-3.5 text-gold" />
            <span className={cn(
              'font-bold tabular-nums',
              session && session.stack > session.startStack ? 'text-green-400' :
              session && session.stack < session.startStack ? 'text-red-400' :
              'text-gold'
            )}>
              {session?.stack.toLocaleString() ?? '0'}
            </span>
          </div>
          {session && (
            <div className="flex items-center gap-1 text-[11px] text-white/30">
              <TrendingUp className="h-3 w-3" />
              {session.stack - session.startStack >= 0 ? '+' : ''}
              {(session.stack - session.startStack).toLocaleString()}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white gap-1"
            onClick={cashOut}
            disabled={cashingOut}
          >
            <DoorOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Cash Out</span>
          </Button>
        </div>
      </div>

      {/* Low-stack top-up banner */}
      <LowStackBanner visible={isLowStack} onRebuy={topUp} rebuying={rebuying} />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-2 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table + fast-fold swoosh overlay */}
      <div className="relative flex-1 overflow-hidden">
        {/* Instant-fold swoosh animation */}
        <FastFoldSwoosh show={handFlash} />

        {gameState && (
          <ErrorBoundary>
            <PokerTable
              tableId="fast-fold"
              tableSize={6}
              seats={mockSeats}
              gameState={gameState}
              playerId={userId}
              onSit={() => {}}
              onAction={handleAction}
              seatReactions={new Map()}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5 bg-black/60 p-3 backdrop-blur-md">
        <AnimatePresence mode="wait">
          {gameState && isMyTurn && !player?.isFolded ? (
            <motion.div
              key="actions"
              className="flex flex-col gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <div className="flex items-center gap-3">
                <TimeBankArc timeLeft={timeBank} />
                <div className="flex-1">
                  <ActionButtons
                    gameState={gameState}
                    playerId={userId!}
                    onAction={handleAction}
                    isSubmitting={isSubmitting}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              className="flex flex-col gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-center text-sm text-white/40">
                {gameState?.phase === 'pot_awarded'
                  ? 'New hand coming...'
                  : 'Waiting for action...'}
              </p>
              {gameState && gameState.phase !== 'pot_awarded' && (
                <PreActionPanel preAction={preAction} onChange={setPreAction} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
