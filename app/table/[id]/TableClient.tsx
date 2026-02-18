'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PokerTable } from '@/components/game/PokerTable';
import { ActionButtons } from '@/components/game/ActionButtons';
import { ErrorBoundary } from '@/components/game/ErrorBoundary';
import { TableChat, FloatingReaction } from '@/components/game/TableChat';
import { useGameState } from '@/hooks/useGameState';
import { useTableChat } from '@/hooks/useTableChat';
import { useSound } from '@/hooks/useSound';
import { playWin, playNewHand, playFold, playChipSplash } from '@/lib/sounds';
import type { TableRow, SeatRow, GameState, ActionType } from '@/types/poker';
import { ArrowLeft, Play, DoorOpen, Wifi, WifiOff, Volume2, VolumeX } from 'lucide-react';

interface FloatingEmoji {
  id: string;
  emoji: string;
  username: string;
}

interface TableClientProps {
  table: TableRow;
  seats: SeatRow[];
  initialGameState: Omit<GameState, 'deck'> | null;
  userId?: string;
  username?: string;
  userChips?: number;
}

export function TableClient({
  table,
  seats: initialSeats,
  initialGameState,
  userId,
  username,
  userChips,
}: TableClientProps) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatRow[]>(initialSeats);
  const [sitDialogOpen, setSitDialogOpen] = useState(false);
  const [standConfirmOpen, setStandConfirmOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [buyIn, setBuyIn] = useState(table.min_buy_in.toString());
  const [sittingLoading, setSittingLoading] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  const prevPhase = useRef<string | null>(null);

  const { muted, toggleMute } = useSound();

  const handleSeatsChanged = useCallback((newSeats: SeatRow[]) => {
    setSeats(newSeats);
  }, []);

  const { gameState, isSubmitting, error, channelStatus, submitAction, startGame } = useGameState({
    tableId: table.id,
    playerId: userId,
    initialState: initialGameState,
    onSeatsChanged: handleSeatsChanged,
  });

  const { messages, sendMessage, sendReaction } = useTableChat(table.id, userId, username);

  // Sound effects for game phase transitions
  useEffect(() => {
    const phase = gameState?.phase;
    if (!phase || phase === prevPhase.current) return;

    if (phase === 'pot_awarded') playWin();
    if (phase === 'preflop' && prevPhase.current === 'waiting') playNewHand();
    if (phase === 'flop' || phase === 'turn' || phase === 'river') playChipSplash();

    prevPhase.current = phase;
  }, [gameState?.phase]);

  // Floating emoji reactions from chat
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== 'reaction') return;
    setFloatingEmojis(prev => [...prev, { id: lastMsg.id, emoji: lastMsg.emoji!, username: lastMsg.username }]);
  }, [messages]);

  const myActiveSeat = seats.find(s => s.player_id === userId);
  const isSeated = !!myActiveSeat;
  const isMyTurn = gameState && myActiveSeat
    ? gameState.activeSeat === myActiveSeat.seat_number
    : false;

  const canStartGame = isSeated && (!gameState || gameState.phase === 'waiting' || gameState.phase === 'pot_awarded');
  const seatedCount = seats.filter(s => s.player_id).length;

  const handleSitRequest = useCallback((seatNumber: number) => {
    if (!userId) {
      router.push('/login');
      return;
    }
    setSelectedSeat(seatNumber);
    setBuyIn(table.min_buy_in.toString());
    setSitDialogOpen(true);
  }, [userId, table.min_buy_in, router]);

  const handleSit = useCallback(async () => {
    if (!selectedSeat) return;
    const amount = parseInt(buyIn);
    if (isNaN(amount) || amount < table.min_buy_in || amount > table.max_buy_in) {
      toast.error(`Buy-in must be ${table.min_buy_in.toLocaleString()}–${table.max_buy_in.toLocaleString()}`);
      return;
    }
    setSittingLoading(true);
    try {
      const res = await fetch(`/api/tables/${table.id}/sit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_number: selectedSeat, buy_in: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSeats(prev => prev.map(s =>
        s.seat_number === selectedSeat
          ? { ...s, player_id: userId ?? null, stack: amount }
          : s
      ));

      setSitDialogOpen(false);
      toast.success(`Sat down with ${amount.toLocaleString()} chips`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSittingLoading(false);
    }
  }, [selectedSeat, buyIn, table, userId]);

  const executeStand = useCallback(async () => {
    setStandConfirmOpen(false);
    try {
      const res = await fetch(`/api/tables/${table.id}/stand`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSeats(prev => prev.map(s =>
        s.player_id === userId ? { ...s, player_id: null, stack: 0 } : s
      ));
      toast.success(`Cashed out ${data.chips_returned?.toLocaleString() ?? ''} chips`);
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [table.id, userId]);

  const handleAction = useCallback((action: ActionType, amount?: number) => {
    if (action === 'fold') playFold();
    else if (action === 'bet' || action === 'raise') playChipSplash();
    submitAction(action, amount);
  }, [submitAction]);

  function formatChipAmount(amt: number): string {
    if (amt < 1000) return amt.toLocaleString();
    const k = amt / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }

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

        <div className="text-center">
          <p className="text-sm font-semibold text-white">{table.name}</p>
          <p className="text-[11px] text-white/40">
            Blinds: {table.small_blind}/{table.big_blind} · {seatedCount}/{table.table_size} players
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <span title={channelStatus === 'connected' ? 'Connected' : channelStatus === 'connecting' ? 'Connecting…' : 'Reconnecting'}>
            {channelStatus === 'connected' ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : channelStatus === 'disconnected' ? (
              <WifiOff className="h-3.5 w-3.5 text-red-400 animate-pulse" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />
            )}
          </span>

          {/* Sound toggle */}
          <button
            onClick={toggleMute}
            className="text-white/40 hover:text-white transition-colors"
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted
              ? <VolumeX className="h-4 w-4" />
              : <Volume2 className="h-4 w-4" />
            }
          </button>

          {/* Chat */}
          <TableChat
            messages={messages}
            onSendMessage={sendMessage}
            onSendReaction={sendReaction}
            playerId={userId}
          />

          {isSeated && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/50 hover:text-white gap-1"
              onClick={() => setStandConfirmOpen(true)}
            >
              <DoorOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Stand</span>
            </Button>
          )}
        </div>
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

      {/* Table (with floating emoji reactions overlay) */}
      <div className="relative flex-1 overflow-hidden">
        {/* Floating emoji reactions */}
        {floatingEmojis.map(fe => (
          <FloatingReaction
            key={fe.id}
            id={fe.id}
            emoji={fe.emoji}
            username={fe.username}
            onDone={id => setFloatingEmojis(prev => prev.filter(e => e.id !== id))}
          />
        ))}

        <ErrorBoundary>
          <PokerTable
            tableId={table.id}
            tableSize={table.table_size}
            seats={seats}
            gameState={gameState}
            playerId={userId}
            onSit={handleSitRequest}
            onAction={handleAction}
          />
        </ErrorBoundary>
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
          ) : canStartGame && seatedCount >= 2 ? (
            <motion.div
              key="start"
              className="flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Button
                onClick={startGame}
                disabled={isSubmitting}
                className="bg-felt text-white hover:bg-felt-dark gap-2"
              >
                <Play className="h-4 w-4" />
                {isSubmitting ? 'Starting...' : 'Start New Hand'}
              </Button>
            </motion.div>
          ) : (
            <motion.p
              key="waiting"
              className="text-center text-sm text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {!isSeated
                ? 'Click an empty seat to join'
                : seatedCount < 2
                ? `Waiting for more players (${seatedCount}/2 minimum)`
                : gameState?.phase && !['waiting', 'pot_awarded'].includes(gameState.phase)
                ? `Waiting for ${gameState.players.find(p => p.seatNumber === gameState.activeSeat)?.username ?? 'player'}...`
                : 'Waiting for next hand...'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Stand Confirmation Dialog */}
      <Dialog open={standConfirmOpen} onOpenChange={setStandConfirmOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Leave Table?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              You will cash out your current stack and return to the lobby.
              {myActiveSeat?.stack ? (
                <span className="block mt-1 font-medium text-foreground">
                  You&apos;ll receive {myActiveSeat.stack.toLocaleString()} chips back.
                </span>
              ) : null}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStandConfirmOpen(false)}>
                Stay
              </Button>
              <Button variant="destructive" className="flex-1" onClick={executeStand}>
                Stand Up
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Buy-in Dialog */}
      <Dialog open={sitDialogOpen} onOpenChange={setSitDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Buy Into Table</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Seat</span>
                <span className="font-medium text-foreground">#{selectedSeat}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Blinds</span>
                <span className="font-medium text-foreground">
                  {table.small_blind}/{table.big_blind}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Your chips</span>
                <span className="font-medium text-foreground">
                  {userChips?.toLocaleString() ?? '?'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Buy-in ({table.min_buy_in.toLocaleString()} – {table.max_buy_in.toLocaleString()})
              </label>
              <Input
                type="number"
                value={buyIn}
                onChange={e => setBuyIn(e.target.value)}
                min={table.min_buy_in}
                max={Math.min(table.max_buy_in, userChips ?? table.max_buy_in)}
              />
              <div className="flex gap-2 text-xs">
                {[table.min_buy_in, Math.floor((table.min_buy_in + table.max_buy_in) / 2), table.max_buy_in].map(amt => (
                  <button
                    key={amt}
                    className="flex-1 rounded bg-muted px-2 py-1 hover:bg-muted/80 transition-colors"
                    onClick={() => setBuyIn(amt.toString())}
                  >
                    {formatChipAmount(amt)}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSit}
              disabled={sittingLoading}
              className="bg-felt text-white hover:bg-felt-dark"
            >
              {sittingLoading ? 'Sitting down...' : 'Sit Down'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
