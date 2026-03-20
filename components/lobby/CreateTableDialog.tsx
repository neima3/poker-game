'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AnteType, StraddleType } from '@/types/poker';

const BLIND_LEVELS = [
  { small: 10, big: 20, min: 400, max: 2000 },
  { small: 25, big: 50, min: 1000, max: 5000 },
  { small: 50, big: 100, min: 2000, max: 10000 },
  { small: 100, big: 200, min: 4000, max: 20000 },
  { small: 250, big: 500, min: 10000, max: 50000 },
  { small: 500, big: 1000, min: 20000, max: 100000 },
];

const ANTE_OPTIONS: { value: AnteType; label: string; desc: string }[] = [
  { value: 'none', label: 'No Ante', desc: 'Standard' },
  { value: 'big_blind', label: 'BB Ante', desc: 'BB posts for table' },
  { value: 'table', label: 'Table Ante', desc: 'Everyone posts' },
];

const STRADDLE_OPTIONS: { value: StraddleType; label: string; desc: string }[] = [
  { value: 'none', label: 'No Straddle', desc: 'Standard' },
  { value: 'utg', label: 'UTG Straddle', desc: 'Acts last pre-flop' },
  { value: 'button', label: 'Button Straddle', desc: 'Dealer posts 2x BB' },
];

export function CreateTableDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [tableSize, setTableSize] = useState(6);
  const [blindLevel, setBlindLevel] = useState(0);
  const [anteType, setAnteType] = useState<AnteType>('none');
  const [straddleType, setStraddleType] = useState<StraddleType>('none');

  const level = BLIND_LEVELS[blindLevel];
  // Ante = 1x BB when ante is enabled
  const anteAmount = anteType !== 'none' ? level.big : 0;

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Enter a table name');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          table_size: tableSize,
          small_blind: level.small,
          big_blind: level.big,
          min_buy_in: level.min,
          max_buy_in: level.max,
          ante: anteAmount,
          ante_type: anteType,
          straddle_type: straddleType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Table created!');
      setOpen(false);
      router.push(`/table/${data.table.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create table');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button className="bg-felt text-white hover:bg-felt-dark gap-2">
            <Plus className="h-4 w-4" />
            Create Table
          </Button>
        </motion.div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Table</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Table name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Table Name</label>
            <Input
              placeholder="My Poker Table"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Table size */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Table Size</label>
            <div className="flex gap-2">
              {[2, 6, 9].map(size => (
                <motion.button
                  key={size}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    tableSize === size
                      ? 'border-felt bg-felt/20 text-white'
                      : 'border-border text-muted-foreground hover:border-felt/50'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setTableSize(size)}
                >
                  {size === 2 ? 'Heads-Up' : size === 6 ? '6-Max' : '9-Max'}
                  <br />
                  <span className="text-xs opacity-60">{size} players</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Blind level */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Blind Level</label>
            <div className="grid grid-cols-3 gap-2">
              {BLIND_LEVELS.map((l, i) => (
                <motion.button
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                    blindLevel === i
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-border text-muted-foreground hover:border-gold/40'
                  }`}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setBlindLevel(i)}
                >
                  <div className="font-semibold">{l.small}/{l.big}</div>
                  <div className="opacity-60">
                    {(l.min / 1000).toFixed(0)}k–{(l.max / 1000).toFixed(0)}k
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Ante type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Ante</label>
            <div className="flex gap-2">
              {ANTE_OPTIONS.map(opt => (
                <motion.button
                  key={opt.value}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                    anteType === opt.value
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-border text-muted-foreground hover:border-amber-500/40'
                  }`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setAnteType(opt.value)}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="opacity-60">{opt.desc}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Straddle type — only for multi-player tables */}
          {tableSize > 2 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Straddle</label>
              <div className="flex gap-2">
                {STRADDLE_OPTIONS.map(opt => (
                  <motion.button
                    key={opt.value}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                      straddleType === opt.value
                        ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                        : 'border-border text-muted-foreground hover:border-purple-500/40'
                    }`}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setStraddleType(opt.value)}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="opacity-60">{opt.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Blinds</span>
              <span className="font-medium text-foreground">
                {level.small.toLocaleString()} / {level.big.toLocaleString()}
              </span>
            </div>
            {anteType !== 'none' && (
              <div className="flex justify-between text-muted-foreground">
                <span>Ante ({anteType === 'big_blind' ? 'BB posts' : 'everyone posts'})</span>
                <span className="font-medium text-amber-400">{anteAmount.toLocaleString()}</span>
              </div>
            )}
            {straddleType !== 'none' && tableSize > 2 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Straddle ({straddleType === 'utg' ? 'UTG' : 'Button'})</span>
                <span className="font-medium text-purple-400">{(level.big * 2).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Buy-in range</span>
              <span className="font-medium text-foreground">
                {level.min.toLocaleString()} – {level.max.toLocaleString()}
              </span>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={loading}
            className="bg-felt text-white hover:bg-felt-dark"
          >
            {loading ? 'Creating...' : 'Create Table'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
