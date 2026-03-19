'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, Trash2, Download, Upload, ChevronDown, ChevronUp,
  Clock, Layers, Lock, Edit3, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TournamentBlindLevel } from '@/types/poker';

interface BlindStructure {
  id: string;
  name: string;
  description?: string;
  levels: TournamentBlindLevel[];
  isPreset: boolean;
  createdAt: number;
}

function totalDuration(levels: TournamentBlindLevel[]): number {
  return levels.reduce((s, l) => s + l.durationMinutes, 0);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Level Row ────────────────────────────────────────────────────────────────

function LevelRow({
  index,
  level,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  readOnly,
}: {
  index: number;
  level: TournamentBlindLevel;
  onChange: (l: TournamentBlindLevel) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  readOnly: boolean;
}) {
  const num = (val: string) => {
    const n = parseInt(val.replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : n;
  };

  return (
    <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_auto] gap-1.5 items-center text-sm">
      <span className="text-center text-xs text-muted-foreground font-mono">{index + 1}</span>

      <Input
        value={level.smallBlind}
        disabled={readOnly}
        onChange={e => onChange({ ...level, smallBlind: num(e.target.value) })}
        className="h-7 text-xs tabular-nums"
        placeholder="SB"
      />
      <Input
        value={level.bigBlind}
        disabled={readOnly}
        onChange={e => onChange({ ...level, bigBlind: num(e.target.value) })}
        className="h-7 text-xs tabular-nums"
        placeholder="BB"
      />
      <Input
        value={level.ante ?? ''}
        disabled={readOnly}
        onChange={e => onChange({ ...level, ante: e.target.value === '' ? undefined : num(e.target.value) })}
        className="h-7 text-xs tabular-nums"
        placeholder="Ante"
      />
      <Input
        value={level.durationMinutes}
        disabled={readOnly}
        onChange={e => onChange({ ...level, durationMinutes: Math.max(1, num(e.target.value)) })}
        className="h-7 text-xs tabular-nums"
        placeholder="Min"
      />

      {!readOnly && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 rounded hover:bg-accent disabled:opacity-20"
            title="Move up"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 rounded hover:bg-accent disabled:opacity-20"
            title="Move down"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300"
            title="Delete level"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
      {readOnly && <div />}
    </div>
  );
}

// ─── Structure Card ───────────────────────────────────────────────────────────

function StructureCard({
  structure,
  onEdit,
  onDelete,
}: {
  structure: BlindStructure;
  onEdit: (s: BlindStructure) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function exportJSON() {
    const blob = new Blob([JSON.stringify(structure, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blind-structure-${structure.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{structure.name}</span>
              {structure.isPreset && (
                <Badge className="text-[9px] bg-purple-500/15 text-purple-400 border-purple-500/30">
                  <Lock className="h-2.5 w-2.5 mr-0.5" />Preset
                </Badge>
              )}
            </div>
            {structure.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{structure.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />{structure.levels.length} levels
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{formatDuration(totalDuration(structure.levels))}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={exportJSON}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Export JSON"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {!structure.isPreset && (
              <>
                <button
                  onClick={() => onEdit(structure)}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(structure.id)}
                  className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_auto] gap-1.5 text-[10px] text-muted-foreground px-0.5">
                  <span className="text-center">#</span>
                  <span>SB</span>
                  <span>BB</span>
                  <span>Ante</span>
                  <span>Min</span>
                  <span />
                </div>
                {structure.levels.map((level, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_auto] gap-1.5 items-center text-xs py-0.5 rounded px-0.5 hover:bg-accent/30"
                  >
                    <span className="text-center text-muted-foreground font-mono">{i + 1}</span>
                    <span className="tabular-nums">{level.smallBlind.toLocaleString()}</span>
                    <span className="tabular-nums">{level.bigBlind.toLocaleString()}</span>
                    <span className="tabular-nums text-muted-foreground">{level.ante?.toLocaleString() ?? '—'}</span>
                    <span className="tabular-nums">{level.durationMinutes}m</span>
                    <span />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Structure Form ───────────────────────────────────────────────────────────

const BLANK_LEVEL: TournamentBlindLevel = { smallBlind: 0, bigBlind: 0, durationMinutes: 15 };

function StructureForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<BlindStructure> | null;
  onSave: (name: string, description: string, levels: TournamentBlindLevel[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [levels, setLevels] = useState<TournamentBlindLevel[]>(
    initial?.levels ?? [{ smallBlind: 25, bigBlind: 50, durationMinutes: 15 }]
  );
  const [saving, setSaving] = useState(false);

  function addLevel() {
    const last = levels[levels.length - 1];
    const newLevel: TournamentBlindLevel = last
      ? { smallBlind: last.bigBlind, bigBlind: last.bigBlind * 2, durationMinutes: last.durationMinutes }
      : { ...BLANK_LEVEL };
    setLevels(prev => [...prev, newLevel]);
  }

  function updateLevel(i: number, l: TournamentBlindLevel) {
    setLevels(prev => prev.map((existing, idx) => (idx === i ? l : existing)));
  }

  function deleteLevel(i: number) {
    setLevels(prev => prev.filter((_, idx) => idx !== i));
  }

  function moveLevel(i: number, dir: -1 | 1) {
    setLevels(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (levels.length === 0) { toast.error('Add at least one level'); return; }
    setSaving(true);
    try {
      await onSave(name.trim(), description.trim(), levels);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-felt/30 bg-felt/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {initial?.id ? 'Edit Structure' : 'New Blind Structure'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Tournament" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note…" />
          </div>
        </div>

        {/* Level header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Blind Levels ({levels.length}) · Est. {formatDuration(totalDuration(levels))}
            </span>
          </div>
          <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_auto] gap-1.5 text-[10px] text-muted-foreground mb-1 px-0.5">
            <span className="text-center">#</span>
            <span>SB</span>
            <span>BB</span>
            <span>Ante</span>
            <span>Min</span>
            <span />
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {levels.map((level, i) => (
              <LevelRow
                key={i}
                index={i}
                level={level}
                onChange={l => updateLevel(i, l)}
                onDelete={() => deleteLevel(i)}
                onMoveUp={() => moveLevel(i, -1)}
                onMoveDown={() => moveLevel(i, 1)}
                isFirst={i === 0}
                isLast={i === levels.length - 1}
                readOnly={false}
              />
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={addLevel}
          className="w-full border-dashed text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Level
        </Button>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            <X className="h-3.5 w-3.5 mr-1.5" />Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-felt text-white hover:bg-felt/90"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Structure'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlindStructureEditor() {
  const [structures, setStructures] = useState<BlindStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlindStructure | null | 'new'>(null);

  useEffect(() => {
    fetch('/api/blind-structures')
      .then(r => r.json())
      .then(d => setStructures(d.structures ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(name: string, description: string, levels: TournamentBlindLevel[]) {
    const isNew = editing === 'new';
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/blind-structures' : `/api/blind-structures/${(editing as BlindStructure).id}`;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, levels }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return; }

    setStructures(prev =>
      isNew
        ? [...prev, data.structure]
        : prev.map(s => s.id === data.structure.id ? data.structure : s)
    );
    toast.success(isNew ? 'Structure created' : 'Structure updated');
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this structure?')) return;
    const res = await fetch(`/api/blind-structures/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? 'Failed to delete'); return; }
    setStructures(prev => prev.filter(s => s.id !== id));
    toast.success('Structure deleted');
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as BlindStructure;
        if (!parsed.name || !Array.isArray(parsed.levels)) {
          toast.error('Invalid structure file');
          return;
        }
        setEditing({ ...parsed, id: '', isPreset: false, createdAt: Date.now() } as any);
        // Trigger 'new' form pre-filled
        setEditing('new');
        // Set form fields via a workaround — we'll use a temp state approach
        // Actually just set editing to a fake "new" with the imported data
        setEditing({ ...parsed, id: '', isPreset: false, createdAt: Date.now() });
      } catch {
        toast.error('Could not parse JSON file');
      }
    };
    input.click();
  }

  const presets = structures.filter(s => s.isPreset);
  const customs = structures.filter(s => !s.isPreset);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Create and manage blind structures for MTT tournaments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Import JSON
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing('new')}
            className="bg-felt text-white hover:bg-felt/90"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />New Structure
          </Button>
        </div>
      </div>

      {/* Form (inline) */}
      <AnimatePresence>
        {editing !== null && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <StructureForm
              initial={editing === 'new' ? null : editing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading structures…</div>
      ) : (
        <div className="space-y-6">
          {/* Custom structures */}
          {customs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Custom ({customs.length})
              </h3>
              <div className="space-y-2">
                {customs.map(s => (
                  <StructureCard
                    key={s.id}
                    structure={s}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Built-in presets */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Built-in Presets
            </h3>
            <div className="space-y-2">
              {presets.map(s => (
                <StructureCard
                  key={s.id}
                  structure={s}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
