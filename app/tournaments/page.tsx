'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { Trophy, Users, Coins, Zap, Timer, Crown, Crosshair, ChevronDown, Play, Bot } from 'lucide-react';
import type { BotDifficulty, TournamentState } from '@/types/poker';

interface TournamentPresetDisplay {
  id: string;
  name: string;
  buyIn: number;
  maxPlayers: number;
  startingStack: number;
  blindLevels: number;
}

const PRESETS: TournamentPresetDisplay[] = [
  { id: 'sng-3', name: 'Turbo 3-Max', buyIn: 500, maxPlayers: 3, startingStack: 1500, blindLevels: 10 },
  { id: 'sng-6', name: 'Standard 6-Max', buyIn: 1000, maxPlayers: 6, startingStack: 3000, blindLevels: 10 },
  { id: 'sng-9', name: 'Full Ring 9-Max', buyIn: 2000, maxPlayers: 9, startingStack: 5000, blindLevels: 10 },
];

const BOT_LABELS: Record<BotDifficulty, string> = {
  fish: '🐟 Fish (easy)',
  regular: '🎯 Regular',
  shark: '🦈 Shark (hard)',
  pro: '👑 Pro (expert)',
};

export default function TournamentsPage() {
  const router = useRouter();
  const [activeTournaments, setActiveTournaments] = useState<TournamentState[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('sng-6');
  const [gameMode, setGameMode] = useState<'classic' | 'bounty'>('classic');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('regular');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tournaments');
      if (res.ok) {
        const data = await res.json();
        setActiveTournaments(data.tournaments ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: selectedPreset,
          gameMode,
          fillBots: true,
          botDifficulty,
        }),
      });
      const data = await res.json();
      if (res.ok && data.tournamentId) {
        router.push(`/tournaments/${data.tournamentId}`);
      }
    } finally {
      setLoading(false);
      setCreateOpen(false);
    }
  };

  const preset = PRESETS.find(p => p.id === selectedPreset)!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Trophy className="h-6 w-6 text-gold" />
            Sit & Go Tournaments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick tournaments with escalating blinds and prize pools
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-felt text-white hover:bg-felt-dark gap-2"
        >
          <Play className="h-4 w-4" />
          New Tournament
        </Button>
      </div>

      {/* Tournament Presets */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {PRESETS.map((p) => (
          <motion.div
            key={p.id}
            className={cn(
              "rounded-xl border p-4 cursor-pointer transition-all",
              "hover:border-felt/60 hover:shadow-lg hover:shadow-felt/5",
              "bg-card"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setSelectedPreset(p.id); setCreateOpen(true); }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10">
                <Trophy className="h-4 w-4 text-gold" />
              </div>
              <span className="font-semibold">{p.name}</span>
            </div>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                <span>{p.maxPlayers} players</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-gold" />
                <span>{p.buyIn.toLocaleString()} buy-in</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                <span>{p.startingStack.toLocaleString()} chips</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Active Tournaments */}
      <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
        <Timer className="h-5 w-5 text-muted-foreground" />
        Active Tournaments
      </h2>

      <AnimatePresence mode="popLayout">
        {activeTournaments.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/10 py-12 text-center"
          >
            <Trophy className="h-10 w-10 text-white/10" />
            <div>
              <p className="font-medium text-white/50">No active tournaments</p>
              <p className="mt-1 text-sm text-muted-foreground">Create one to start competing!</p>
            </div>
          </motion.div>
        ) : (
          activeTournaments.map((t, i) => {
            const activePlayers = t.players.filter(p => !p.eliminatedAt);
            return (
              <motion.div
                key={t.config.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 mb-3 hover:border-felt/60 transition-all"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.config.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t.gameMode === 'bounty' ? '💰 Bounty' : 'Classic'}
                    </Badge>
                    <Badge className={cn(
                      "text-[10px]",
                      t.status === 'running' ? 'bg-green-500/15 text-green-400 border-green-500/25' :
                      t.status === 'registering' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' :
                      'bg-gray-500/15 text-gray-400 border-gray-500/25'
                    )}>
                      {t.status === 'running' ? 'Live' : t.status === 'registering' ? 'Open' : 'Finished'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {activePlayers.length}/{t.config.maxPlayers}
                    </span>
                    <span className="flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-gold" />
                      {t.prizePool.toLocaleString()} prize pool
                    </span>
                    {t.status === 'running' && (
                      <span className="flex items-center gap-1">
                        <Timer className="h-3.5 w-3.5" />
                        Level {t.currentBlindLevel + 1}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-felt text-white hover:bg-felt-dark"
                  onClick={() => router.push(`/tournaments/${t.config.id}`)}
                >
                  {t.status === 'registering' ? 'Join' : 'Watch'}
                </Button>
              </motion.div>
            );
          })
        )}
      </AnimatePresence>

      {/* Create Tournament Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-gold" />
              Create Tournament
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Format selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPreset(p.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all text-sm",
                      selectedPreset === p.id
                        ? "border-felt bg-felt/10 text-white"
                        : "border-border/50 text-muted-foreground hover:border-felt/40"
                    )}
                  >
                    <div className="font-medium text-[13px]">{p.maxPlayers}-Max</div>
                    <div className="text-[11px] mt-0.5 opacity-70">{p.buyIn.toLocaleString()} buy-in</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Game mode */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGameMode('classic')}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all text-sm",
                    gameMode === 'classic'
                      ? "border-felt bg-felt/10"
                      : "border-border/50 text-muted-foreground hover:border-felt/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <Crown className="h-3.5 w-3.5" />
                    Classic
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-60">Standard prize pool</div>
                </button>
                <button
                  onClick={() => setGameMode('bounty')}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all text-sm",
                    gameMode === 'bounty'
                      ? "border-orange-500/60 bg-orange-500/10"
                      : "border-border/50 text-muted-foreground hover:border-orange-500/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <Crosshair className="h-3.5 w-3.5 text-orange-400" />
                    Bounty
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-60">Knock-out bounties</div>
                </button>
              </div>
            </div>

            {/* Bot difficulty */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">Bot Difficulty</label>
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

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buy-in</span>
                <span className="font-medium">{preset.buyIn.toLocaleString()} chips</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Starting stack</span>
                <span className="font-medium">{preset.startingStack.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Players</span>
                <span className="font-medium">{preset.maxPlayers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prize pool</span>
                <span className="font-medium text-gold">{(preset.buyIn * preset.maxPlayers).toLocaleString()}</span>
              </div>
              {gameMode === 'bounty' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bounty per player</span>
                  <span className="font-medium text-orange-400">{Math.floor(preset.buyIn * 0.3).toLocaleString()}</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleCreate}
              disabled={loading}
              className="bg-felt text-white hover:bg-felt-dark"
            >
              {loading ? 'Creating...' : 'Create & Start'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
