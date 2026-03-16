'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PokerTable } from '@/components/game/PokerTable';
import { ActionButtons } from '@/components/game/ActionButtons';
import { ErrorBoundary } from '@/components/game/ErrorBoundary';
import { cn } from '@/lib/utils';
import { Trophy, Timer, Users, Coins, ArrowLeft, Crosshair, Skull, LayoutGrid, RefreshCw } from 'lucide-react';
import type { GameState, ActionType, TournamentBlindLevel, SeatRow } from '@/types/poker';
import { playNewHand, playChipSplash, playFold, playCheck, playError, getPackedSound } from '@/lib/sounds';

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
  startedAt?: number;
  finishedAt?: number;
}

interface TableSummary {
  tableId: string;
  tableNumber: number;
  playerCount: number;
  handInProgress: boolean;
}

export default function MTTGamePage() {
  const params = useParams();
  const router = useRouter();
  const mttId = params.id as string;

  const [tournament, setTournament] = useState<MTTTournamentInfo | null>(null);
  const [gameState, setGameState] = useState<Omit<GameState, 'deck'> | null>(null);
  const [blinds, setBlinds] = useState<TournamentBlindLevel | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<any[] | null>(null);
  const [showBustout, setShowBustout] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [playerTable, setPlayerTable] = useState<{ tableId: string; tableNumber: number } | null>(null);
  const [showTableList, setShowTableList] = useState(false);
  const [isRebuying, setIsRebuying] = useState(false);

  const prevPhase = useRef<string | null>(null);
  const handStartedRef = useRef(false);

  // Fetch initial MTT state
  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/mtt/${mttId}`);
      const data = await res.json();
      if (data.tournament) {
        setTournament(data.tournament);
        if (data.blinds) setBlinds(data.blinds);
        if (data.timeRemaining !== undefined) setTimeRemaining(data.timeRemaining);
        if (data.gameState) setGameState(data.gameState);
        if (data.prizes) setPrizes(data.prizes);
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
      if (data.playerTable) setPlayerTable(data.playerTable);
      playNewHand();
    } catch {
      setError('Failed to start hand');
    } finally {
      handStartedRef.current = false;
    }
  }, [mttId, tournament]);

  // Auto-start next hand after pot_awarded
  useEffect(() => {
    const phase = gameState?.phase;
    if (phase === 'pot_awarded' && prevPhase.current !== 'pot_awarded') {
      getPackedSound('win')();
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
            {blinds && (
              <span className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                {blinds.smallBlind}/{blinds.bigBlind}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatTime(timeRemaining)}
            </span>
            <span>Level {tournament.currentBlindLevel + 1}</span>
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
      <div className="h-1 bg-black/40">
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
