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
import { cn } from '@/lib/utils';
import { Zap, ArrowLeft, Coins, Bot, ChevronDown, DoorOpen, Timer, TrendingUp } from 'lucide-react';
import type { GameState, ActionType, BotDifficulty, SeatRow } from '@/types/poker';
import { playNewHand, playChipSplash, playFold, playCheck, playError, getPackedSound, playAllIn } from '@/lib/sounds';
import type { FastFoldSession } from '@/lib/poker/fast-fold';

const BOT_LABELS: Record<BotDifficulty, string> = {
  fish: '🐟 Fish (easy)',
  regular: '🎯 Regular',
  shark: '🦈 Shark (hard)',
  pro: '👑 Pro (expert)',
};

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

  const prevPhase = useRef<string | null>(null);

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
        setSessionStats(data.session);
        return;
      }

      if (data.session) setSession(data.session);

      if (data.instantNewHand) {
        // Flash effect for instant new hand
        setHandFlash(true);
        setTimeout(() => setHandFlash(false), 200);
        playNewHand();
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

  // Sound effects for phase changes
  useEffect(() => {
    const phase = gameState?.phase;
    if (!phase || phase === prevPhase.current) return;
    if (phase === 'pot_awarded') getPackedSound('win')();
    if (phase === 'flop' || phase === 'turn' || phase === 'river') playChipSplash();
    prevPhase.current = phase;
  }, [gameState?.phase]);

  const userId = session?.playerId;
  const isMyTurn = gameState && userId
    ? gameState.activeSeat === gameState.players.find(p => p.playerId === userId)?.seatNumber
    : false;

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

  // Pre-session lobby
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
            Fold and instantly get a new hand. No waiting. 200-300 hands per hour.
            The fastest way to play poker.
          </p>
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

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

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

  // Session ended — show stats
  if (!session && sessionStats) {
    const profit = sessionStats.profit ?? 0;
    const duration = Math.floor((sessionStats.duration ?? 0) / 60000);
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

        <div className="w-full rounded-xl border bg-card p-6 space-y-3">
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
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Peak Stack</span>
            <span className="font-bold text-gold">{(sessionStats.peakStack ?? 0).toLocaleString()}</span>
          </div>
          <div className="border-t border-border/50 pt-3 flex justify-between">
            <span className="font-medium">Profit/Loss</span>
            <span className={cn(
              "font-bold",
              profit > 0 ? "text-green-400" : profit < 0 ? "text-red-400" : "text-white/50"
            )}>
              {profit > 0 ? '+' : ''}{profit.toLocaleString()} chips
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/lobby')}>
            Back to Lobby
          </Button>
          <Button
            className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white gap-2"
            onClick={() => { setSessionStats(null); }}
          >
            <Zap className="h-4 w-4" />
            Play Again
          </Button>
        </div>
      </div>
    );
  }

  // In-session gameplay
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
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Coins className="h-3.5 w-3.5 text-gold" />
            <span className={cn(
              "font-bold tabular-nums",
              session && session.stack > session.startStack ? "text-green-400" :
              session && session.stack < session.startStack ? "text-red-400" :
              "text-gold"
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

      {/* Instant hand flash indicator */}
      <AnimatePresence>
        {handFlash && (
          <motion.div
            className="absolute inset-0 z-50 bg-cyan-400/10 pointer-events-none"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

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

      {/* Table */}
      <div className="relative flex-1 overflow-hidden">
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
          {gameState && isMyTurn && !gameState.players.find(p => p.playerId === userId)?.isFolded ? (
            <motion.div
              key="actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <ActionButtons
                gameState={gameState}
                playerId={userId!}
                onAction={handleAction}
                isSubmitting={isSubmitting}
              />
            </motion.div>
          ) : (
            <motion.p
              key="waiting"
              className="text-center text-sm text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {gameState?.phase === 'pot_awarded'
                ? 'New hand coming...'
                : 'Waiting for action...'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
