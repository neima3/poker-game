'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Coins, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlayerRecord {
  id: string;
  username: string;
  chips: number;
  total_hands_played: number;
  is_guest: boolean;
  is_admin: boolean;
}

interface AdminPanelProps {
  players: PlayerRecord[];
}

const PRESET_AMOUNTS = [1_000, 5_000, 10_000, 50_000, 100_000];

export function AdminPanel({ players }: AdminPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [amount, setAmount] = useState('10000');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [localChips, setLocalChips] = useState<Record<string, number>>({});

  const filtered = players.filter(p =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  async function grantChips() {
    if (!selectedPlayer) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid chip amount');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/grant-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: selectedPlayer.id,
          amount: amt,
          reason: reason || 'Admin grant',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setLocalChips(prev => ({
        ...prev,
        [selectedPlayer.id]: (prev[selectedPlayer.id] ?? selectedPlayer.chips) + amt,
      }));
      toast.success(`Granted ${amt.toLocaleString()} chips to ${selectedPlayer.username}`);
      setSelectedPlayer(null);
      setReason('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to grant chips');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Player search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Grant Chips</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {filtered.map(player => (
              <motion.button
                key={player.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedPlayer?.id === player.id
                    ? 'border-felt/60 bg-felt/10'
                    : 'border-border/50 hover:border-border hover:bg-accent/50'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">
                    {player.username}
                    {player.is_guest && <span className="ml-1.5 text-[10px] text-muted-foreground">(guest)</span>}
                    {player.is_admin && <span className="ml-1.5 text-[10px] text-gold">(admin)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {player.total_hands_played} hands played
                  </span>
                </div>
                <div className="flex items-center gap-1 text-gold font-bold text-sm tabular-nums">
                  <Coins className="h-3.5 w-3.5" />
                  {(localChips[player.id] ?? player.chips).toLocaleString()}
                </div>
              </motion.button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No players found</p>
            )}
          </div>

          {/* Grant form */}
          <AnimatePresence>
            {selectedPlayer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-3 overflow-hidden border-t border-border/50 pt-4"
              >
                <p className="text-sm font-medium">
                  Granting chips to <span className="text-gold">{selectedPlayer.username}</span>
                </p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    min={1}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESET_AMOUNTS.map(amt => (
                      <button
                        key={amt}
                        className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/80 transition-colors"
                        onClick={() => setAmount(amt.toString())}
                      >
                        {amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <Input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Bug compensation, Welcome bonus"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlayer(null)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={grantChips}
                    disabled={loading}
                    className="flex-1 bg-gold text-black hover:bg-gold/90"
                  >
                    <Coins className="mr-1.5 h-3.5 w-3.5" />
                    {loading ? 'Granting…' : 'Grant Chips'}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-muted-foreground text-sm font-medium">
            Player Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{players.length}</div>
              <div className="text-xs text-muted-foreground">Total Players</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gold">
                {players.reduce((s, p) => s + p.chips, 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Total Chips</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {players.reduce((s, p) => s + p.total_hands_played, 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Hands Played</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
