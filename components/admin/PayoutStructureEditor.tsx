'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Trophy, Plus, Trash2, RotateCcw, Check, ChevronDown, ChevronUp, Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PayoutStructure {
  id: string;
  name: string;
  payout: number[];   // percentage per place, e.g. [50, 30, 20]
  isCustom: boolean;
}

// ─── Payout Bar (visual) ───────────────────────────────────────────────────────

function PayoutBar({ payout }: { payout: number[] }) {
  const colors = [
    'bg-yellow-400',
    'bg-slate-400',
    'bg-amber-700',
    'bg-blue-400',
    'bg-purple-400',
    'bg-green-400',
  ];
  return (
    <div className="flex h-2 w-full rounded overflow-hidden gap-px mt-2">
      {payout.map((pct, i) => (
        <div
          key={i}
          className={cn('rounded-sm', colors[i] ?? 'bg-white/30')}
          style={{ width: `${pct}%` }}
          title={`${i + 1}${ordinal(i + 1)}: ${pct}%`}
        />
      ))}
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

function sumPayout(payout: number[]): number {
  return Math.round(payout.reduce((a, b) => a + b, 0) * 10) / 10;
}

// ─── Inline Payout Editor ─────────────────────────────────────────────────────

function PayoutEditor({
  structure,
  onSave,
  onCancel,
}: {
  structure: PayoutStructure;
  onSave: (id: string, payout: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [payout, setPayout] = useState<number[]>([...structure.payout]);
  const [saving, setSaving] = useState(false);

  const total = sumPayout(payout);
  const isValid = Math.abs(total - 100) <= 0.1 && payout.every(p => p > 0);

  function updatePlace(i: number, val: string) {
    const n = parseFloat(val);
    setPayout(prev => prev.map((p, idx) => (idx === i ? (isNaN(n) ? 0 : n) : p)));
  }

  function addPlace() {
    setPayout(prev => [...prev, 0]);
  }

  function removePlace(i: number) {
    setPayout(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!isValid) {
      toast.error(`Payout must sum to 100% (currently ${total}%)`);
      return;
    }
    setSaving(true);
    try {
      await onSave(structure.id, payout);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/50">Payout percentages</span>
        <span className={cn(
          'text-xs font-mono font-semibold',
          Math.abs(total - 100) <= 0.1 ? 'text-green-400' : 'text-red-400'
        )}>
          {total}% / 100%
        </span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {payout.map((pct, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-white/40 font-mono w-12 shrink-0">
              {i + 1}{ordinal(i + 1)} place
            </span>
            <Input
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={pct}
              onChange={e => updatePlace(i, e.target.value)}
              className="h-7 text-xs tabular-nums flex-1"
            />
            <span className="text-xs text-white/40">%</span>
            <button
              onClick={() => removePlace(i)}
              disabled={payout.length <= 1}
              className="p-1 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-20"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addPlace}
        className="w-full border-dashed text-xs"
      >
        <Plus className="h-3 w-3 mr-1" /> Add paid place
      </Button>

      {payout.length > 0 && <PayoutBar payout={payout} />}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1 text-xs">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !isValid}
          className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ─── Structure Card ───────────────────────────────────────────────────────────

function StructureCard({
  structure,
  onSaved,
}: {
  structure: PayoutStructure;
  onSaved: (id: string, payout: number[]) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function handleSave(id: string, payout: number[]) {
    const res = await fetch('/api/admin/payout-structures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: id, payout }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to save payout');
      return;
    }
    onSaved(id, payout);
    setEditing(false);
    toast.success(`Payout updated for ${structure.name}`);
  }

  async function handleReset() {
    const res = await fetch(`/api/admin/payout-structures?configId=${structure.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Failed to reset');
      return;
    }
    // Reload page to show default
    window.location.reload();
  }

  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-white/90">{structure.name}</span>
              {structure.isCustom && (
                <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  Custom
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {structure.payout.map((pct, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono bg-white/10 rounded px-1.5 py-0.5 text-white/70"
                >
                  {i + 1}{ordinal(i + 1)}: {pct}%
                </span>
              ))}
            </div>
            <PayoutBar payout={structure.payout} />
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <button
              onClick={() => setEditing(v => !v)}
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title="Edit payout"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            {structure.isCustom && (
              <button
                onClick={handleReset}
                className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors"
                title="Reset to default"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <PayoutEditor
                structure={structure}
                onSave={handleSave}
                onCancel={() => setEditing(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PayoutStructureEditor() {
  const [structures, setStructures] = useState<PayoutStructure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/payout-structures')
      .then(r => r.json())
      .then(d => setStructures(d.structures ?? []))
      .catch(() => toast.error('Failed to load payout structures'))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(id: string, payout: number[]) {
    setStructures(prev =>
      prev.map(s => s.id === id ? { ...s, payout, isCustom: true } : s)
    );
  }

  const sng = structures.filter(s => s.id.startsWith('sng'));
  const mtt = structures.filter(s => s.id.startsWith('mtt'));

  return (
    <div className="space-y-6">
      <p className="text-sm text-white/50">
        Override payout percentages for any tournament format. Changes take effect for new
        tournaments. Percentages must sum to exactly 100%.
      </p>

      {loading ? (
        <div className="py-8 text-center text-sm text-white/40">Loading…</div>
      ) : (
        <>
          {sng.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
                <Trophy className="h-3 w-3" /> Sit & Go
              </h3>
              <div className="space-y-2">
                {sng.map(s => (
                  <StructureCard key={s.id} structure={s} onSaved={handleSaved} />
                ))}
              </div>
            </div>
          )}

          {mtt.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
                <Trophy className="h-3 w-3" /> Multi-Table
              </h3>
              <div className="space-y-2">
                {mtt.map(s => (
                  <StructureCard key={s.id} structure={s} onSaved={handleSaved} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
