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

const BLIND_LEVELS = [
  { small: 10, big: 20, min: 400, max: 2000 },
  { small: 25, big: 50, min: 1000, max: 5000 },
  { small: 50, big: 100, min: 2000, max: 10000 },
  { small: 100, big: 200, min: 4000, max: 20000 },
  { small: 250, big: 500, min: 10000, max: 50000 },
  { small: 500, big: 1000, min: 20000, max: 100000 },
];

export function CreateTableDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [tableSize, setTableSize] = useState(6);
  const [blindLevel, setBlindLevel] = useState(0);

  const level = BLIND_LEVELS[blindLevel];

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

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Blinds</span>
              <span className="font-medium text-foreground">
                {level.small.toLocaleString()} / {level.big.toLocaleString()}
              </span>
            </div>
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
