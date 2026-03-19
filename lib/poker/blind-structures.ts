/**
 * Blind Structure Store
 * In-memory store for custom blind structures + built-in presets.
 */

import type { TournamentBlindLevel } from '@/types/poker';

export interface BlindStructure {
  id: string;
  name: string;
  description?: string;
  levels: TournamentBlindLevel[];
  isPreset: boolean;
  createdAt: number;
}

// ─── Built-in Presets ────────────────────────────────────────────────────────

export const BLIND_STRUCTURE_PRESETS: BlindStructure[] = [
  {
    id: 'wsop-main-event',
    name: 'WSOP Main Event',
    description: 'Approximate structure used in the WSOP Main Event (60 min levels)',
    isPreset: true,
    createdAt: 0,
    levels: [
      { smallBlind: 100, bigBlind: 200, ante: 300, durationMinutes: 60 },
      { smallBlind: 200, bigBlind: 300, ante: 300, durationMinutes: 60 },
      { smallBlind: 200, bigBlind: 400, ante: 400, durationMinutes: 60 },
      { smallBlind: 300, bigBlind: 500, ante: 500, durationMinutes: 60 },
      { smallBlind: 300, bigBlind: 600, ante: 600, durationMinutes: 60 },
      { smallBlind: 400, bigBlind: 800, ante: 800, durationMinutes: 60 },
      { smallBlind: 500, bigBlind: 1000, ante: 1000, durationMinutes: 60 },
      { smallBlind: 600, bigBlind: 1200, ante: 1200, durationMinutes: 60 },
      { smallBlind: 800, bigBlind: 1600, ante: 1600, durationMinutes: 60 },
      { smallBlind: 1000, bigBlind: 2000, ante: 2000, durationMinutes: 60 },
      { smallBlind: 1200, bigBlind: 2400, ante: 2400, durationMinutes: 60 },
      { smallBlind: 1500, bigBlind: 3000, ante: 3000, durationMinutes: 60 },
      { smallBlind: 2000, bigBlind: 4000, ante: 4000, durationMinutes: 60 },
      { smallBlind: 2500, bigBlind: 5000, ante: 5000, durationMinutes: 60 },
      { smallBlind: 3000, bigBlind: 6000, ante: 6000, durationMinutes: 60 },
      { smallBlind: 4000, bigBlind: 8000, ante: 8000, durationMinutes: 60 },
      { smallBlind: 5000, bigBlind: 10000, ante: 10000, durationMinutes: 60 },
      { smallBlind: 6000, bigBlind: 12000, ante: 12000, durationMinutes: 60 },
      { smallBlind: 8000, bigBlind: 16000, ante: 16000, durationMinutes: 60 },
      { smallBlind: 10000, bigBlind: 20000, ante: 20000, durationMinutes: 60 },
    ],
  },
  {
    id: 'pokerstars-standard',
    name: 'PokerStars Standard',
    description: 'PokerStars MTT standard structure (15 min levels)',
    isPreset: true,
    createdAt: 0,
    levels: [
      { smallBlind: 10, bigBlind: 20, durationMinutes: 15 },
      { smallBlind: 15, bigBlind: 30, durationMinutes: 15 },
      { smallBlind: 20, bigBlind: 40, durationMinutes: 15 },
      { smallBlind: 30, bigBlind: 60, durationMinutes: 15 },
      { smallBlind: 40, bigBlind: 80, durationMinutes: 15 },
      { smallBlind: 50, bigBlind: 100, durationMinutes: 15 },
      { smallBlind: 75, bigBlind: 150, durationMinutes: 15 },
      { smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 15 },
      { smallBlind: 150, bigBlind: 300, ante: 25, durationMinutes: 15 },
      { smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 15 },
      { smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 15 },
      { smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 15 },
      { smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 15 },
      { smallBlind: 600, bigBlind: 1200, ante: 200, durationMinutes: 15 },
      { smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 15 },
      { smallBlind: 1000, bigBlind: 2000, ante: 300, durationMinutes: 15 },
      { smallBlind: 1500, bigBlind: 3000, ante: 400, durationMinutes: 15 },
      { smallBlind: 2000, bigBlind: 4000, ante: 500, durationMinutes: 15 },
      { smallBlind: 2500, bigBlind: 5000, ante: 600, durationMinutes: 15 },
      { smallBlind: 3000, bigBlind: 6000, ante: 800, durationMinutes: 15 },
    ],
  },
  {
    id: 'home-game',
    name: 'Home Game',
    description: 'Fast home game structure — fits in 1–2 hours',
    isPreset: true,
    createdAt: 0,
    levels: [
      { smallBlind: 25, bigBlind: 50, durationMinutes: 15 },
      { smallBlind: 50, bigBlind: 100, durationMinutes: 15 },
      { smallBlind: 75, bigBlind: 150, durationMinutes: 15 },
      { smallBlind: 100, bigBlind: 200, durationMinutes: 15 },
      { smallBlind: 150, bigBlind: 300, durationMinutes: 15 },
      { smallBlind: 200, bigBlind: 400, durationMinutes: 15 },
      { smallBlind: 300, bigBlind: 600, durationMinutes: 10 },
      { smallBlind: 400, bigBlind: 800, durationMinutes: 10 },
      { smallBlind: 500, bigBlind: 1000, durationMinutes: 10 },
      { smallBlind: 750, bigBlind: 1500, durationMinutes: 10 },
    ],
  },
];

// ─── In-Memory Store ─────────────────────────────────────────────────────────

const structureStore = new Map<string, BlindStructure>();

// Pre-populate with presets
for (const preset of BLIND_STRUCTURE_PRESETS) {
  structureStore.set(preset.id, preset);
}

export function getBlindStructure(id: string): BlindStructure | undefined {
  return structureStore.get(id);
}

export function getAllBlindStructures(): BlindStructure[] {
  return Array.from(structureStore.values());
}

export function saveBlindStructure(structure: BlindStructure): void {
  structureStore.set(structure.id, structure);
}

export function deleteBlindStructure(id: string): boolean {
  return structureStore.delete(id);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Total estimated duration across all levels (in minutes) */
export function calcTotalDuration(levels: TournamentBlindLevel[]): number {
  return levels.reduce((sum, l) => sum + l.durationMinutes, 0);
}
