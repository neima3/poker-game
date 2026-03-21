'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PokerTable } from '@/components/game/PokerTable';
import { ActionButtons } from '@/components/game/ActionButtons';
import { ErrorBoundary } from '@/components/game/ErrorBoundary';
import { MTTBlindTimer } from '@/components/game/MTTBlindTimer';
import { cn } from '@/lib/utils';
import {
  Trophy, Timer, Users, Coins, ArrowLeft, Crosshair, Skull,
  LayoutGrid, RefreshCw, BarChart3, ChevronDown, ChevronUp,
  TrendingUp, AlertTriangle, CheckCircle, Zap, List,
} from 'lucide-react';
import type { GameState, ActionType, TournamentBlindLevel, SeatRow } from '@/types/poker';
import { playNewHand, playChipSplash, playFold, playCheck, playError, getPackedSound } from '@/lib/sounds';
import type { ICMPlayerResult } from '@/lib/poker/icm';

interface MTTTournamentInfo {
  id: string;
  config: any;
  status: string;
  currentBlindLevel: number;
  prizePool: number;
  gameMode: string;
  isFinalTable: boolean;
  playersRemaining: number;
  totalPlayers: number;
  rebuyOpen: boolean;
  chipAverage: number;
  startedAt?: number;
  finishedAt?: number;
}

interface PrizeBreakdownEntry {
  position: number;
  percentage: number;
  chips: number;
}

interface TableSummary {
  tableId: string;
  tableNumber: number;
  playerCount: number;
  handInProgress: boolean;
}

// ─── ICM Pressure Panel ───────────────────────────────────────────────────────

function PressureIcon({ pressure }: { pressure: ICMPlayerResult['pressure'] }) {
  if (pressure === 'red') return <AlertTriangle className="h-3 w-3 text-red-400" />;
  if (pressure === 'yellow') return <TrendingUp className="h-3 w-3 text-yellow-400" />;
  return <CheckCircle className="h-3 w-3 text-green-400" />;
}

function pressureBg(pressure: ICMPlayerResult['pressure']) {
  if (pressure === 'red') return 'bg-red-500/10 border-red-500/20';
  if (pressure === 'yellow') return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-green-500/10 border-green-500/20';
}

function pressureText(pressure: ICMPlayerResult['pressure']) {
  if (pressure === 'red') return 'text-red-300';
  if (pressure === 'yellow') return 'text-yellow-300';
  return 'text-green-300';
}

function ICMPanel({
  mttId,
  userId,
  prizePool,
}: {
  mttId: string;
  userId?: string;
  prizePool: number;
}) {
  const [icmData, setIcmData] = useState<ICMPlayerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [myRow, setMyRow] = useState<ICMPlayerResult | null>(null);

  const fetchICM = useCallback(async () => {
    try {
      const res = await fetch(`/api/mtt/${mttId}/icm`);
      const data = await res.json();
      if (data.icm) {
        setIcmData(data.icm);
        if (userId) {
          const me = data.icm.find((r: ICMPlayerResult) => r.playerId === userId);
          setMyRow(me ?? null);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [mttId, userId]);

  // Fetch on mount + after each hand completes
  useEffect(() => { fetchICM(); }, [fetchICM]);

  if (loading || icmData.length === 0) return null;

  return (
    <div className="border-t border-white/5 bg-black/40">
      {/* Collapsed: show my row summary or toggle button */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs">
          <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-white/60 font-medium">ICM Pressure</span>
          {myRow && (
            <>
              <span className="text-white/40">·</span>
              <PressureIcon pressure={myRow.pressure} />
              <span className={cn('font-mono', pressureText(myRow.pressure))}>
                M={myRow.mRatio}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">{myRow.equityPct.toFixed(1)}% equity</span>
              <span className="text-white/30">·</span>
              <span className="text-white/40 text-[10px] italic">{myRow.suggestion}</span>
            </>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/40" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-white/40" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5 max-h-52 overflow-y-auto">
              {/* Header */}
              <div className="grid grid-cols-[1.5rem_1fr_4rem_3.5rem_3.5rem_auto] gap-1.5 text-[9px] text-white/30 uppercase tracking-wider pb-1 border-b border-white/5">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Stack</span>
                <span className="text-right">Equity</span>
                <span className="text-right">M</span>
                <span className="text-center">Zone</span>
              </div>

              {icmData.map((row, i) => {
                const isMe = row.playerId === userId;
                return (
                  <div
                    key={row.playerId}
                    className={cn(
                      'grid grid-cols-[1.5rem_1fr_4rem_3.5rem_3.5rem_auto] gap-1.5 items-center rounded-md px-1 py-1 text-xs transition-colors',
                      isMe ? 'bg-purple-500/15 border border-purple-500/20' : 'hover:bg-white/5',
                    )}
                  >
                    <span className="text-white/30 font-mono text-[10px] text-center">{i + 1}</span>
                    <span className={cn('truncate', isMe ? 'text-white font-semibold' : 'text-white/70')}>
                      {row.username}
                      {isMe && <span className="ml-1 text-[9px] text-purple-400">(you)</span>}
                    </span>
                    <span className="text-right text-white/60 font-mono tabular-nums text-[11px]">
                      {row.stack.toLocaleString()}
                    </span>
                    <div className="text-right">
                      <span className="text-white/70 font-mono text-[11px]">
                        {row.equityPct.toFixed(1)}%
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-right font-mono tabular-nums text-[11px]',
                        pressureText(row.pressure),
                      )}
                    >
                      {row.mRatio}
                    </span>
                    <div className="flex justify-center">
                      <PressureIcon pressure={row.pressure} />
                    </div>
                  </div>
                );
              })}

              {/* Legend */}
              <div className="flex items-center gap-3 pt-2 text-[9px] text-white/30 border-t border-white/5">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5 text-red-400" />Red M &lt; 5
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-2.5 w-2.5 text-yellow-400" />Yellow 5–15
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-2.5 w-2.5 text-green-400" />Green &gt; 15
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Blind Structure Panel ────────────────────────────────────────────────────

function BlindStructurePanel({
  tournament,
  blinds,
  nextBlinds,
  timeRemaining,
  myStack,
}: {
  tournament: MTTTournamentInfo;
  blinds: TournamentBlindLevel | null;
  nextBlinds: TournamentBlindLevel | null;
  timeRemaining: number;
  myStack?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const allLevels: TournamentBlindLevel[] = tournament.config.blindLevels ?? [];
  const currentLevel = tournament.currentBlindLevel;
  const chipAverage = tournament.chipAverage;

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const stackVsAvg = myStack && chipAverage > 0
    ? myStack / chipAverage
    : null;

  return (
    <div className="border-b border-white/5 bg-black/30">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span className="flex items-center gap-1 font-semibold text-white/80">
            <Zap className="h-3 w-3 text-yellow-400" />
            Level {currentLevel + 1}
          </span>
          {blinds && (
            <span className="font-mono text-white/70">{blinds.smallBlind}/{blinds.bigBlind}</span>
          )}
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            <span className={cn('font-mono', timeRemaining < 60000 ? 'text-red-400' : 'text-white/60')}>
              {formatTime(timeRemaining)}
            </span>
          </span>
          {nextBlinds && (
            <span className="text-white/30 hidden sm:flex items-center gap-1">
              → {nextBlinds.smallBlind}/{nextBlinds.bigBlind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {chipAverage > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-white/30">Avg</span>
              <span className="font-mono text-white/60">{chipAverage.toLocaleString()}</span>
              {stackVsAvg !== null && (
                <span className={cn(
                  'font-mono text-[10px] px-1 rounded',
                  stackVsAvg >= 1.2 ? 'text-green-400 bg-green-500/10' :
                  stackVsAvg >= 0.7 ? 'text-yellow-400 bg-yellow-500/10' :
                  'text-red-400 bg-red-500/10',
                )}>
                  {stackVsAvg >= 1 ? '+' : ''}{((stackVsAvg - 1) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-white/30" />
            : <ChevronUp className="h-3.5 w-3.5 text-white/30" />
          }
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-[2.5rem_4rem_4rem_3.5rem_auto] gap-1.5 text-[9px] text-white/30 uppercase tracking-wider pb-1 border-b border-white/5">
                <span>Lvl</span>
                <span className="text-right">SB/BB</span>
                <span className="text-right">Duration</span>
                <span className="text-right">BB/100</span>
                <span />
              </div>
              {allLevels.map((level, i) => {
                const isCurrent = i === currentLevel;
                const isPast = i < currentLevel;
                return (
                  <div
                    key={i}
                    className={cn(
                      'grid grid-cols-[2.5rem_4rem_3.5rem_3.5rem_auto] gap-1.5 items-center rounded-md px-1 py-1 text-xs',
                      isCurrent ? 'bg-yellow-500/10 border border-yellow-500/20' :
                      isPast ? 'opacity-30' : 'hover:bg-white/5',
                    )}
                  >
                    <span className={cn('font-mono text-[10px] text-center', isCurrent ? 'text-yellow-400 font-bold' : 'text-white/40')}>
                      {i + 1}
                    </span>
                    <span className={cn('text-right font-mono tabular-nums text-[11px]', isCurrent ? 'text-white font-semibold' : 'text-white/60')}>
                      {level.smallBlind}/{level.bigBlind}
                    </span>
                    <span className="text-right text-white/40 text-[11px]">
                      {level.durationMinutes}m
                    </span>
                    <span className="text-right text-white/30 font-mono text-[10px]">
                      {(tournament.config.startingStack / level.bigBlind).toFixed(0)}
                    </span>
                    <div className="flex justify-end">
                      {isCurrent && (
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Prize Breakdown Panel ────────────────────────────────────────────────────

function PrizeBreakdownPanel({
  prizeBreakdown,
  gameMode,
  buyIn,
}: {
  prizeBreakdown: PrizeBreakdownEntry[];
  gameMode: string;
  buyIn: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!prizeBreakdown || prizeBreakdown.length === 0) return null;

  const totalPaid = prizeBreakdown.reduce((sum, p) => sum + p.percentage, 0);

  return (
    <div className="border-t border-white/5 bg-black/40">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs">
          <List className="h-3.5 w-3.5 text-gold" />
          <span className="text-white/60 font-medium">Prize Breakdown</span>
          <span className="text-white/30">·</span>
          <span className="text-white/40">{prizeBreakdown.length} places paid</span>
          {gameMode === 'bounty' && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-orange-400 text-[10px]">+bounties</span>
            </>
          )}
        </div>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-white/40" />
          : <ChevronUp className="h-3.5 w-3.5 text-white/40" />
        }
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-[2rem_1fr_3.5rem_4.5rem] gap-2 text-[9px] text-white/30 uppercase tracking-wider pb-1 border-b border-white/5">
                <span>#</span>
                <span>Place</span>
                <span className="text-right">%</span>
                <span className="text-right">Prize</span>
              </div>
              {prizeBreakdown.map((entry, i) => (
                <div
                  key={entry.position}
                  className={cn(
                    'grid grid-cols-[2rem_1fr_3.5rem_4.5rem] gap-2 items-center rounded-md px-1 py-1 text-xs',
                    i === 0 ? 'bg-gold/10 border border-gold/20' :
                    i === 1 ? 'bg-slate-400/10 border border-slate-400/20' :
                    i === 2 ? 'bg-amber-600/10 border border-amber-600/20' :
                    'hover:bg-white/5',
                  )}
                >
                  <span className={cn(
                    'font-mono text-center text-[11px]',
                    i === 0 ? 'text-gold' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-500' : 'text-white/40',
                  )}>
                    {entry.position}
                  </span>
                  <span className="text-white/60">
                    {entry.position === 1 ? '1st Place' : entry.position === 2 ? '2nd Place' : entry.position === 3 ? '3rd Place' : `${entry.position}th Place`}
                  </span>
                  <span className="text-right text-white/40 font-mono text-[11px]">
                    {entry.percentage}%
                  </span>
                  <span className={cn(
                    'text-right font-mono tabular-nums text-[11px] font-semibold',
                    i === 0 ? 'text-gold' : i < 3 ? 'text-white/80' : 'text-white/60',
                  )}>
                    {entry.chips.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1 text-[10px] text-white/20 border-t border-white/5">
                <span>Total distributed</span>
                <span>{totalPaid}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MTTGamePage() {
  const params = useParams();
  const router = useRouter();
  const mttId = params.id as string;

  const [tournament, setTournament] = useState<MTTTournamentInfo | null>(null);
  const [gameState, setGameState] = useState<Omit<GameState, 'deck'> | null>(null);
  const [blinds, setBlinds] = useState<TournamentBlindLevel | null>(null);
  const [nextBlinds, setNextBlinds] = useState<TournamentBlindLevel | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<any[] | null>(null);
  const [prizeBreakdown, setPrizeBreakdown] = useState<PrizeBreakdownEntry[]>([]);
  const [showBustout, setShowBustout] = useState<string | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [playerTable, setPlayerTable] = useState<{ tableId: string; tableNumber: number } | null>(null);
  const [showTableList, setShowTableList] = useState(false);
  const [isRebuying, setIsRebuying] = useState(false);
  const [icmKey, setIcmKey] = useState(0); // bump to re-fetch ICM after each hand

  const prevPhase = useRef<string | null>(null);
  const handStartedRef = useRef(false);
  const prevBlindLevelRef = useRef<number>(-1);

  // Fetch initial MTT state
  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/mtt/${mttId}`);
      const data = await res.json();
      if (data.tournament) {
        setTournament(data.tournament);
        if (data.blinds) setBlinds(data.blinds);
        if (data.nextBlinds !== undefined) setNextBlinds(data.nextBlinds);
        if (data.timeRemaining !== undefined) setTimeRemaining(data.timeRemaining);
        if (data.gameState) setGameState(data.gameState);
        if (data.prizes) setPrizes(data.prizes);
        if (data.prizeBreakdown) setPrizeBreakdown(data.prizeBreakdown);
        if (data.tables) setTables(data.tables);
        if (data.playerTable) setPlayerTable(data.playerTable);

        // Detect user from game state
        if (data.gameState) {
          const human = data.gameState.players?.find((p: any) => !p.isBot);
          if (human) setUserId(human.playerId);
        }
      }
    } catch { /* ignore */ }
  }, [mttId]);

  useEffect(() => { fetchTournament(); }, [fetchTournament]);

  // Start next hand
  const startNextHand = useCallback(async () => {
    if (handStartedRef.current) return;
    handStartedRef.current = true;
    setAutoStartTimer(null);

    try {
      const res = await fetch(`/api/mtt/${mttId}`, { method: 'POST' });
      const data = await res.json();

      if (data.finished) {
        setTournament(data.tournament ?? tournament);
        setPrizes(data.prizes);
        return;
      }

      if (data.gameState) setGameState(data.gameState);
      if (data.tournament) setTournament(data.tournament);
      if (data.blinds) setBlinds(data.blinds);
      if (data.nextBlinds !== undefined) setNextBlinds(data.nextBlinds);
      if (data.playerTable) setPlayerTable(data.playerTable);
      playNewHand();
    } catch {
      setError('Failed to start hand');
    } finally {
      handStartedRef.current = false;
    }
  }, [mttId, tournament]);

  // Auto-start next hand after pot_awarded + refresh ICM
  useEffect(() => {
    const phase = gameState?.phase;
    if (phase === 'pot_awarded' && prevPhase.current !== 'pot_awarded') {
      getPackedSound('win')();
      setIcmKey(k => k + 1); // refresh ICM after hand ends
      setAutoStartTimer(3);
      const interval = setInterval(() => {
        setAutoStartTimer(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            startNextHand();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
    prevPhase.current = phase ?? null;
  }, [gameState?.phase, startNextHand]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeRemaining]);

  // Detect blind level increase and show "Level Up" alert
  useEffect(() => {
    if (!tournament) return;
    const level = tournament.currentBlindLevel;
    if (prevBlindLevelRef.current >= 0 && level > prevBlindLevelRef.current) {
      setShowLevelUp(true);
      const t = setTimeout(() => setShowLevelUp(false), 3500);
      return () => clearTimeout(t);
    }
    prevBlindLevelRef.current = level;
  }, [tournament?.currentBlindLevel]);

  // Submit action
  const submitAction = useCallback(async (action: ActionType, amount?: number) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/mtt/${mttId}/action`, {
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
      if (data.gameState) setGameState(data.gameState);
      if (data.tournament) setTournament(data.tournament);
      if (data.blinds) setBlinds(data.blinds);
      if (data.nextBlinds !== undefined) setNextBlinds(data.nextBlinds);
      if (data.timeRemaining !== undefined) setTimeRemaining(data.timeRemaining);
      if (data.playerTable) setPlayerTable(data.playerTable);
      if (data.tournamentFinished) setPrizes(data.prizes);
      if (data.bustedPlayers?.length) {
        setShowBustout(data.bustedPlayers[0]);
        setTimeout(() => setShowBustout(null), 2500);
      }
    } catch {
      setError('Network error');
    } finally {
      setIsSubmitting(false);
    }
  }, [mttId]);

  const handleAction = useCallback((action: ActionType, amount?: number) => {
    if (action === 'fold') playFold();
    else if (action === 'bet' || action === 'raise') playChipSplash();
    else if (action === 'check' || action === 'call') playCheck();
    submitAction(action, amount);
  }, [submitAction]);

  // Rebuy
  const handleRebuy = useCallback(async () => {
    setIsRebuying(true);
    try {
      const res = await fetch(`/api/mtt/${mttId}/rebuy`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        fetchTournament();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Rebuy failed');
    } finally {
      setIsRebuying(false);
    }
  }, [mttId, fetchTournament]);

  if (!tournament) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="text-center text-muted-foreground">Loading tournament...</div>
      </div>
    );
  }

  const isEliminated = userId && gameState
    ? !gameState.players.some(p => p.playerId === userId)
    : false;
  const isMyTurn = gameState && userId
    ? gameState.activeSeat === gameState.players.find(p => p.playerId === userId)?.seatNumber
    : false;

  const mockSeats: SeatRow[] = gameState
    ? gameState.players.map(p => ({
        id: p.playerId,
        table_id: playerTable?.tableId ?? '',
        seat_number: p.seatNumber,
        player_id: p.playerId,
        stack: p.stack,
        is_sitting_out: p.isSittingOut,
        joined_at: '',
        poker_profiles: { username: p.username, avatar_url: p.avatarUrl },
      }))
    : [];

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-950">
      {/* Bust-out notification */}
      <AnimatePresence>
        {showBustout && (
          <motion.div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-2"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Skull className="h-5 w-5 text-red-400" />
            <span className="text-red-300 font-medium">Player eliminated!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Up notification */}
      <AnimatePresence>
        {showLevelUp && blinds && (
          <motion.div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-yellow-500/20 border border-yellow-500/40 px-5 py-2.5 shadow-lg shadow-yellow-500/10"
            initial={{ opacity: 0, y: -20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Zap className="h-4 w-4 text-yellow-400" />
            <div className="text-center">
              <div className="text-yellow-300 font-bold text-sm">Blinds Increase!</div>
              <div className="text-yellow-400/70 text-xs font-mono">
                Level {tournament.currentBlindLevel + 1} — {blinds.smallBlind}/{blinds.bigBlind}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table list overlay */}
      <AnimatePresence>
        {showTableList && (
          <motion.div
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTableList(false)}
          >
            <motion.div
              className="bg-card border border-border/60 rounded-2xl p-6 max-w-sm w-full mx-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-purple-400" />
                Tables ({tables.length})
              </h3>
              <div className="space-y-2">
                {tables.map(t => (
                  <div
                    key={t.tableId}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3",
                      t.tableId === playerTable?.tableId
                        ? "border-purple-500/40 bg-purple-500/10"
                        : "border-border/40"
                    )}
                  >
                    <div>
                      <span className="font-medium">Table {t.tableNumber}</span>
                      {t.tableId === playerTable?.tableId && (
                        <Badge className="ml-2 text-[9px] bg-purple-500/20 text-purple-300">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {t.playerCount}
                      {t.handInProgress && (
                        <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MTT Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-2">
        <button
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          onClick={() => router.push('/tournaments')}
        >
          <ArrowLeft className="h-4 w-4" /> Tournaments
        </button>

        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <Trophy className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">{tournament.config.name}</span>
            <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">MTT</Badge>
            {tournament.isFinalTable && (
              <Badge className="text-[9px] bg-gold/20 text-gold border-gold/30">Final Table</Badge>
            )}
            {tournament.gameMode === 'bounty' && (
              <Badge className="text-[9px] bg-orange-500/20 text-orange-400 border-orange-500/30">
                <Crosshair className="h-2.5 w-2.5 mr-0.5" /> Bounty
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/40 justify-center mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {tournament.playersRemaining}/{tournament.totalPlayers}
            </span>
            {playerTable && (
              <button
                onClick={() => setShowTableList(true)}
                className="flex items-center gap-1 hover:text-white/60 transition-colors"
              >
                <LayoutGrid className="h-3 w-3" />
                Table {playerTable.tableNumber}/{tables.length}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gold font-medium">
            <Coins className="h-3 w-3 inline mr-0.5" />
            {tournament.prizePool.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Blind level progress bar */}
      <div className="h-0.5 bg-black/40">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-600 to-purple-400"
          animate={{
            width: blinds
              ? `${Math.max(0, 100 - (timeRemaining / (blinds.durationMinutes * 60000)) * 100)}%`
              : '0%'
          }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>

      {/* MTT Blind Timer (prominent ring + chip average) */}
      {tournament.status === 'running' && (
        <MTTBlindTimer
          currentLevel={tournament.currentBlindLevel}
          blindLevels={tournament.config.blindLevels ?? []}
          timeRemaining={timeRemaining}
          chipAverage={tournament.chipAverage}
          myStack={userId && gameState
            ? gameState.players.find(p => p.playerId === userId)?.stack
            : undefined}
        />
      )}

      {/* Blind Structure Panel (expandable full schedule) */}
      {tournament.status === 'running' && (
        <BlindStructurePanel
          tournament={tournament}
          blinds={blinds}
          nextBlinds={nextBlinds}
          timeRemaining={timeRemaining}
          myStack={userId && gameState
            ? gameState.players.find(p => p.playerId === userId)?.stack
            : undefined}
        />
      )}

      {/* Error display */}
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

      {/* Main table area */}
      <div className="relative flex-1 overflow-hidden">
        {gameState ? (
          <ErrorBoundary>
            <PokerTable
              tableId={playerTable?.tableId ?? ''}
              tableSize={9}
              seats={mockSeats}
              gameState={gameState}
              playerId={userId}
              onSit={() => {}}
              onAction={handleAction}
              seatReactions={new Map()}
            />
          </ErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              {tournament.status === 'running' && !isEliminated && (
                <Button
                  onClick={startNextHand}
                  className="bg-purple-600 text-white hover:bg-purple-700 gap-2"
                >
                  <Trophy className="h-4 w-4" />
                  Deal First Hand
                </Button>
              )}
              {isEliminated && tournament.rebuyOpen && (
                <div className="flex flex-col items-center gap-3">
                  <div className="text-white/40">
                    <Skull className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Eliminated</p>
                  </div>
                  <Button
                    onClick={handleRebuy}
                    disabled={isRebuying}
                    className="bg-green-600 text-white hover:bg-green-700 gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRebuying && "animate-spin")} />
                    {isRebuying ? 'Rebuying...' : `Rebuy (${tournament.config.rebuyCost?.toLocaleString()} chips)`}
                  </Button>
                </div>
              )}
              {isEliminated && !tournament.rebuyOpen && (
                <div className="text-white/40">
                  <Skull className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Eliminated</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ICM Pressure Panel */}
      {tournament.status === 'running' && !prizes && (
        <ICMPanel
          key={icmKey}
          mttId={mttId}
          userId={userId}
          prizePool={tournament.prizePool}
        />
      )}

      {/* Prize Breakdown Panel */}
      {prizeBreakdown.length > 0 && !prizes && (
        <PrizeBreakdownPanel
          prizeBreakdown={prizeBreakdown}
          gameMode={tournament.gameMode}
          buyIn={tournament.config.buyIn ?? 0}
        />
      )}

      {/* Bottom bar */}
      <div className="border-t border-white/5 bg-black/60 p-3 backdrop-blur-md">
        <AnimatePresence mode="wait">
          {prizes ? (
            <motion.div
              key="prizes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-gold" />
                <span className="font-bold text-white">Tournament Complete!</span>
              </div>
              <div className="flex gap-3">
                {prizes.slice(0, 3).map((p: any, i: number) => (
                  <div key={p.playerId} className={cn(
                    "rounded-lg border px-4 py-2 text-center text-sm",
                    i === 0 ? "border-gold/40 bg-gold/10" :
                    i === 1 ? "border-slate-400/40 bg-slate-400/10" :
                    "border-amber-600/40 bg-amber-600/10"
                  )}>
                    <div className="text-lg">{i === 0 ? '1st' : i === 1 ? '2nd' : '3rd'}</div>
                    <div className="font-medium truncate max-w-[80px]">{p.username}</div>
                    <div className="text-gold font-bold">
                      {(p.prize + p.bountyPrize).toLocaleString()}
                      {p.bountyPrize > 0 && (
                        <span className="text-[10px] text-orange-400 block">
                          +{p.bountyPrize} bounties
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/tournaments')}
              >
                Back to Tournaments
              </Button>
            </motion.div>
          ) : gameState && isMyTurn && !isEliminated && !gameState.players.find(p => p.playerId === userId)?.isFolded ? (
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
          ) : gameState?.phase === 'pot_awarded' && !prizes ? (
            <motion.div
              key="nexthand"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <p className="text-sm text-white/40">
                Next hand in {autoStartTimer ?? 0}s...
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="waiting"
              className="text-center text-sm text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {isEliminated
                ? tournament.rebuyOpen ? 'Eliminated - rebuy available' : 'Eliminated'
                : 'Waiting...'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
