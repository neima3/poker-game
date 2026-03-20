'use client';

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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
import { TableChat, FloatingReaction } from '@/components/game/TableChat';
import { HandSummary } from '@/components/game/HandSummary';
import { useGameState } from '@/hooks/useGameState';
import { useTableChat } from '@/hooks/useTableChat';
import { useSound } from '@/hooks/useSound';
import { useTheme, TABLE_THEMES } from '@/hooks/useTheme';
import type { TableTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { playNewHand, playFold, playChipSplash, playCheck, playError, playStreakBonus, playLevelUp, playAchievement, playMissionComplete, getPackedSound, updateTension, stopTension, SOUND_PACKS } from '@/lib/sounds';
import type { SoundCategory, SoundPack } from '@/lib/sounds';
import { recordWin, recordLoss, getStoredStreak, addXp, XP_REWARDS } from '@/lib/progression';
import { updatePlayerStats, checkAchievements, updateMissionProgress, refreshMissions } from '@/lib/achievements';
import type { Achievement, MissionTemplate } from '@/lib/achievements';
import { WinStreakBanner } from '@/components/game/WinStreakBanner';
import { LevelBadge, LevelUpNotification } from '@/components/game/LevelBadge';
import { AchievementToast, MissionCompleteToast } from '@/components/game/AchievementToast';
import { MobileActionDrawer } from '@/components/game/MobileActionDrawer';
import type { TableRow, SeatRow, GameState, ActionType, BotDifficulty, GameMode } from '@/types/poker';
import { ArrowLeft, Play, DoorOpen, Wifi, WifiOff, Volume2, VolumeX, Bot, ChevronDown, Zap, Music, Crosshair, Eye, EyeOff } from 'lucide-react';
import { useHudStats } from '@/hooks/useHudStats';

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
  const [seatReactions, setSeatReactions] = useState<Map<number, { emoji: string; id: string }>>(new Map());
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('regular');
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [showStreak, setShowStreak] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState<{ tier: string; level: number; icon: string; color: string } | null>(null);
  const [showAchievement, setShowAchievement] = useState(false);
  const [achievementUnlocked, setAchievementUnlocked] = useState<Achievement | null>(null);
  const [showMissionComplete, setShowMissionComplete] = useState(false);
  const [missionCompleted, setMissionCompleted] = useState<MissionTemplate | null>(null);
  const achievementQueue = useRef<Achievement[]>([]);
  const missionQueue = useRef<MissionTemplate[]>([]);

  // HUD toggle — persisted in localStorage
  const [showHud, setShowHud] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('poker_show_hud');
    return stored === null ? true : stored === 'true';
  });

  const toggleHud = useCallback(() => {
    setShowHud(prev => {
      const next = !prev;
      localStorage.setItem('poker_show_hud', String(next));
      return next;
    });
  }, []);

  const prevPhase = useRef<string | null>(null);
  const handProcessed = useRef<string | null>(null);

  const { muted, toggleMute, categories, toggleCategory, soundPack, changeSoundPack } = useSound();
  const { theme, setTheme } = useTheme();

  // Detect mobile landscape orientation
  const isLandscape = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches,
    () => false,
  );

  // Detect portrait mobile (< 768px) — triggers bottom-sheet action drawer
  const isMobile = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(max-width: 767px)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    () => false,
  );

  const showMobileDrawer = isMobile && !isLandscape;

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

  // HUD stats: in-session per-opponent stats (must come after gameState is declared)
  const hudStatsMap = useHudStats(gameState, userId);

  // Initialize missions on mount
  useEffect(() => {
    refreshMissions();
  }, []);

  // Process achievement/mission toast queue
  useEffect(() => {
    if (!showAchievement && achievementQueue.current.length > 0) {
      const next = achievementQueue.current.shift()!;
      setAchievementUnlocked(next);
      setShowAchievement(true);
      playAchievement();
    }
  }, [showAchievement]);

  useEffect(() => {
    if (!showMissionComplete && missionQueue.current.length > 0) {
      const next = missionQueue.current.shift()!;
      setMissionCompleted(next);
      setShowMissionComplete(true);
      playMissionComplete();
    }
  }, [showMissionComplete]);

  // Tension sound based on pot size
  useEffect(() => {
    if (gameState && gameState.phase !== 'waiting' && gameState.phase !== 'pot_awarded') {
      const ratio = gameState.pot / (gameState.bigBlind || 1);
      updateTension(ratio);
    } else {
      stopTension();
    }
  }, [gameState?.pot, gameState?.phase, gameState?.bigBlind]);

  // Play error sound when action fails
  useEffect(() => {
    if (error) playError();
  }, [error]);

  // Sound effects for game phase transitions + win/loss tracking
  useEffect(() => {
    const phase = gameState?.phase;
    if (!phase || phase === prevPhase.current) return;

    if (phase === 'pot_awarded') {
      getPackedSound('win')();

      // Track win/loss for progression (only if user is seated and hand not already processed)
      if (userId && gameState.winners && handProcessed.current !== gameState.handId) {
        handProcessed.current = gameState.handId ?? `${Date.now()}`;
        const didWin = gameState.winners.some(w => w.playerId === userId);

        if (didWin) {
          const result = recordWin();
          setCurrentStreak(result.streak.current);

          // Update achievement stats
          const myWinner = gameState.winners.find(w => w.playerId === userId);
          const potAmount = myWinner?.amount ?? 0;
          const isShowdown = gameState.phase === 'pot_awarded' && gameState.communityCards.length === 5;
          const isAllIn = gameState.players.find(p => p.playerId === userId)?.isAllIn;
          const isRoyalFlush = myWinner?.handName === 'Royal Flush';

          const statUpdates = {
            handsPlayed: 1,
            handsWon: 1,
            showdownWins: isShowdown ? 1 : 0,
            allInWins: isAllIn ? 1 : 0,
            biggestPotWon: potAmount,
            bestStreak: result.streak.current,
            totalChipsWon: potAmount,
            royalFlushes: isRoyalFlush ? 1 : 0,
          };
          const stats = updatePlayerStats(statUpdates);

          // Check for new achievements
          const newAchievements = checkAchievements(stats);
          if (newAchievements.length > 0) {
            achievementQueue.current.push(...newAchievements);
            if (!showAchievement) {
              const first = achievementQueue.current.shift()!;
              setAchievementUnlocked(first);
              setShowAchievement(true);
              playAchievement();
            }
            // Sync unlocked achievements to Supabase (fire-and-forget)
            fetch('/api/achievements', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ achievementIds: newAchievements.map(a => a.id) }),
            }).catch(() => { /* offline/pre-migration — silently ignore */ });
          }

          // Check for mission completions
          const completedMissions = updateMissionProgress(statUpdates);
          if (completedMissions.length > 0) {
            missionQueue.current.push(...completedMissions);
            if (!showMissionComplete) {
              const first = missionQueue.current.shift()!;
              setMissionCompleted(first);
              setShowMissionComplete(true);
              playMissionComplete();
            }
          }

          // Show streak banner for 3+ streak
          if (result.streak.current >= 3) {
            playStreakBonus();
            setShowStreak(true);
            setTimeout(() => setShowStreak(false), 3500);
          }

          // Check for level up
          if (result.levelResult.leveledUp) {
            playLevelUp();
            setLevelUpInfo(result.levelResult.newLevel);
            setShowLevelUp(true);
          }
        } else {
          recordLoss();
          setCurrentStreak(0);

          // Still track stats for loss
          updatePlayerStats({ handsPlayed: 1 });
          const stats = updatePlayerStats({ handsPlayed: 0 }); // Get current stats
          checkAchievements(stats);
          updateMissionProgress({ handsPlayed: 1 });
        }

        // Dispatch XP update event for LevelBadge
        window.dispatchEvent(new Event('poker_xp_update'));
      }
    }
    if (phase === 'preflop' && prevPhase.current !== null && prevPhase.current !== 'preflop') playNewHand();
    if (phase === 'flop' || phase === 'turn' || phase === 'river') playChipSplash();

    prevPhase.current = phase;
  }, [gameState?.phase, gameState?.winners, gameState?.handId, userId]);

  // Floating emoji reactions from chat — also map to seat positions
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== 'reaction') return;
    setFloatingEmojis(prev => [...prev, { id: lastMsg.id, emoji: lastMsg.emoji!, username: lastMsg.username }]);

    // Map reaction to the sender's seat
    if (gameState) {
      const senderPlayer = gameState.players.find(p => p.playerId === lastMsg.playerId);
      if (senderPlayer) {
        const seatNum = senderPlayer.seatNumber;
        setSeatReactions(prev => {
          const next = new Map(prev);
          next.set(seatNum, { emoji: lastMsg.emoji!, id: lastMsg.id });
          return next;
        });
        // Clear after animation
        setTimeout(() => {
          setSeatReactions(prev => {
            const next = new Map(prev);
            if (next.get(seatNum)?.id === lastMsg.id) next.delete(seatNum);
            return next;
          });
        }, 1800);
      }
    }
  }, [messages, gameState]);

  const myActiveSeat = seats.find(s => s.player_id === userId);
  const isSeated = !!myActiveSeat;
  const isMyTurn = gameState && myActiveSeat
    ? gameState.activeSeat === myActiveSeat.seat_number
    : false;

  const canStartGame = isSeated && (!gameState || gameState.phase === 'waiting' || gameState.phase === 'pot_awarded');
  const isHandActive = !!gameState && gameState.phase !== 'waiting' && gameState.phase !== 'pot_awarded';
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
    else if (action === 'check' || action === 'call') playCheck();
    submitAction(action, amount);
  }, [submitAction]);

  const handleStartWithBots = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${table.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fill_bots: true, bot_difficulty: botDifficulty, game_mode: gameMode }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? 'Failed to start');
      else if (data.state) {
        const modeLabel = gameMode === 'allin_or_fold' ? 'AoF' : 'Classic';
        toast.success(`Starting ${modeLabel} vs ${botDifficulty} bots!`);
      }
    } catch {
      toast.error('Network error');
    }
  }, [table.id, botDifficulty, gameMode]);

  function formatChipAmount(amt: number): string {
    if (amt < 1000) return amt.toLocaleString();
    const k = amt / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }

  const BOT_LABELS: Record<BotDifficulty, string> = {
    fish: '🐟 Fish (easy)',
    regular: '🎯 Regular',
    shark: '🦈 Shark (hard)',
    pro: '👑 Pro (expert)',
  };

  return (
    <div data-theme={theme} className={cn("flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-950", isLandscape && "h-screen", isMobile && !isLandscape && "h-[calc(100dvh-3.5rem)]")}>
      {/* Win streak banner */}
      <WinStreakBanner streak={currentStreak} show={showStreak} />

      {/* Level up notification */}
      {levelUpInfo && (
        <LevelUpNotification
          show={showLevelUp}
          level={levelUpInfo}
          onDone={() => setShowLevelUp(false)}
        />
      )}

      {/* Achievement toast */}
      <AchievementToast
        achievement={achievementUnlocked}
        show={showAchievement}
        onDone={() => setShowAchievement(false)}
      />

      {/* Mission complete toast */}
      <MissionCompleteToast
        mission={missionCompleted}
        show={showMissionComplete}
        onDone={() => setShowMissionComplete(false)}
      />

      {/* Top bar */}
      <div className={cn("flex items-center justify-between border-b border-white/5 bg-black/40 px-4 py-2", isLandscape && "poker-landscape-topbar")}>
        <button
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          onClick={() => router.push('/lobby')}
        >
          <ArrowLeft className="h-4 w-4" /> Lobby
        </button>

        <div className="text-center flex flex-col items-center">
          <p className="text-sm font-semibold text-white">{table.name}</p>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span>Blinds: {table.small_blind}/{table.big_blind} · {seatedCount}/{table.table_size}</span>
            {isSeated && <LevelBadge compact />}
          </div>
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

          {/* Theme picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1 text-white/40 hover:text-white transition-colors"
                title="Table theme"
              >
                <span
                  className="h-4 w-4 rounded-full border border-white/30"
                  style={{ backgroundColor: TABLE_THEMES.find(t => t.id === theme)?.felt }}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Table Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TABLE_THEMES.map(t => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn('gap-2', theme === t.id && 'bg-accent')}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-white/20"
                    style={{ backgroundColor: t.felt }}
                  />
                  <span className="flex-1">{t.name}</span>
                  {t.unlockLevel && (
                    <span className="text-[10px] text-white/30">Lv.{t.unlockLevel}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sound settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-white/40 hover:text-white transition-colors"
                title="Sound settings"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sound Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleMute}>
                {muted ? <VolumeX className="mr-2 h-3.5 w-3.5" /> : <Volume2 className="mr-2 h-3.5 w-3.5" />}
                {muted ? 'Unmute All' : 'Mute All'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {([
                ['deal', 'Card Sounds'],
                ['action', 'Action Sounds'],
                ['win', 'Win Sounds'],
                ['timer', 'Timer Sounds'],
                ['ambient', 'Ambient Music'],
              ] as [SoundCategory, string][]).map(([cat, label]) => (
                <DropdownMenuItem key={cat} onClick={() => toggleCategory(cat)}>
                  <span className={cn('mr-2 h-3 w-3 rounded-sm border', categories[cat] ? 'bg-emerald-500 border-emerald-500' : 'border-white/30')} />
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
                <Music className="h-3 w-3" /> Sound Pack
              </DropdownMenuLabel>
              {SOUND_PACKS.map(pack => (
                <DropdownMenuItem
                  key={pack.id}
                  onClick={() => changeSoundPack(pack.id)}
                  className={soundPack === pack.id ? 'bg-accent' : ''}
                >
                  <span className="mr-2">{pack.id === 'classic' ? '🎵' : pack.id === 'arcade' ? '👾' : pack.id === 'minimal' ? '🔇' : '🎰'}</span>
                  {pack.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* HUD toggle */}
          <button
            onClick={toggleHud}
            className="text-white/40 hover:text-white transition-colors"
            title={showHud ? 'Hide HUD stats' : 'Show HUD stats'}
          >
            {showHud ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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
              className="text-white/50 hover:text-white gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={isHandActive}
              title={isHandActive ? 'Cannot stand up during an active hand' : undefined}
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
      <div className={cn("relative flex-1 overflow-hidden", isLandscape && "poker-landscape-table")}>
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
            seatReactions={seatReactions}
            hudStatsMap={hudStatsMap}
            showHud={showHud}
          />
        </ErrorBoundary>

        {/* Hand summary modal - shows after each hand */}
        <HandSummary gameState={gameState} playerId={userId} />

        {/* Reconnecting overlay — locks the table during a network drop */}
        <AnimatePresence>
          {channelStatus === 'disconnected' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-3">
                <WifiOff className="h-8 w-8 text-red-400 animate-pulse" />
                <p className="text-sm font-semibold text-white/90">Reconnecting…</p>
                <div className="relative h-1 w-32 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-red-400"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick emoji reactions bar */}
      {isSeated && gameState && gameState.phase !== 'waiting' && (
        <div className={cn("flex items-center justify-center gap-1 border-t border-white/5 bg-black/40 px-3 py-1.5", isLandscape && "poker-landscape-reactions")}>
          {['😂', '😤', '🤑', '👏', '🙄', '💀'].map(emoji => (
            <motion.button
              key={emoji}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => sendReaction(emoji)}
              className="rounded-lg px-2 py-1 text-lg hover:bg-white/10 transition-colors"
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className={cn("border-t border-white/5 bg-black/60 p-3 backdrop-blur-md", isLandscape && "poker-landscape-bottombar")}>
        <AnimatePresence mode="wait">
          {gameState && isMyTurn && !gameState.players.find(p => p.playerId === userId)?.isFolded ? (
            showMobileDrawer ? (
              /* Mobile: self-contained bottom-sheet drawer */
              <MobileActionDrawer
                gameState={gameState}
                playerId={userId!}
                onAction={handleAction}
                isSubmitting={isSubmitting || channelStatus === 'disconnected'}
              />
            ) : (
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
                isSubmitting={isSubmitting || channelStatus === 'disconnected'}
              />
            </motion.div>
            )
          ) : canStartGame ? (
            <motion.div
              key="start"
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Start with existing players (need ≥2) */}
              {seatedCount >= 2 && (
                <Button
                  onClick={() => startGame()}
                  disabled={isSubmitting}
                  className="bg-felt text-white hover:bg-felt-dark gap-2"
                >
                  <Play className="h-4 w-4" />
                  {isSubmitting ? 'Starting...' : 'Start Hand'}
                </Button>
              )}

              {/* Game mode toggle */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'gap-1.5 transition-all',
                      gameMode === 'allin_or_fold'
                        ? 'border-orange-500/60 text-orange-300 bg-orange-500/10'
                        : gameMode === 'bounty'
                        ? 'border-red-500/60 text-red-300 bg-red-500/10'
                        : 'border-border/40 text-muted-foreground'
                    )}
                  >
                    {gameMode === 'allin_or_fold' ? <Zap className="h-3.5 w-3.5" /> :
                     gameMode === 'bounty' ? <Crosshair className="h-3.5 w-3.5" /> :
                     <Zap className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">
                      {gameMode === 'allin_or_fold' ? 'AoF Mode' : gameMode === 'bounty' ? 'Bounty' : 'Classic'}
                    </span>
                    <span className="sm:hidden">
                      {gameMode === 'allin_or_fold' ? 'AoF' : gameMode === 'bounty' ? '💰' : 'NL'}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-36">
                  <DropdownMenuItem onClick={() => setGameMode('classic')} className={gameMode === 'classic' ? 'bg-accent' : ''}>
                    Classic NL
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGameMode('allin_or_fold')} className={gameMode === 'allin_or_fold' ? 'bg-accent' : ''}>
                    <Zap className="mr-1.5 h-3.5 w-3.5 text-orange-400" />
                    All-In or Fold
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGameMode('bounty' as GameMode)} className={gameMode === 'bounty' ? 'bg-accent' : ''}>
                    <Crosshair className="mr-1.5 h-3.5 w-3.5 text-red-400" />
                    Bounty
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Play vs Bots */}
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleStartWithBots}
                  disabled={isSubmitting}
                  variant="outline"
                  className="border-purple-500/40 text-purple-300 hover:bg-purple-500/20 gap-2"
                >
                  <Bot className="h-4 w-4" />
                  <span className="hidden sm:inline">Play vs Bots</span>
                  <span className="sm:hidden">Bots</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-purple-500/40 text-purple-300 hover:bg-purple-500/20 h-9 w-9"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Bot Difficulty</DropdownMenuLabel>
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
                ? `Waiting for more players — or start vs bots!`
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
              <Button variant="destructive" className="flex-1" disabled={isHandActive} onClick={executeStand}>
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
