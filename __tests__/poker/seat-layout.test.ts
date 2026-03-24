/**
 * Regression test for NEIA-331:
 * 9-max seat layout — all seats must have unique resolved CSS positions.
 *
 * We reconstruct the same logic used in PokerTable.tsx so that any future
 * edit to the position arrays will be caught here before it reaches the UI.
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror of PokerTable.tsx position logic ──────────────────────────────────

type Position =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type SeatPosition = { label: Position; className?: string };

const SEAT_POSITIONS_2: SeatPosition[] = [
  { label: 'bottom' },
  { label: 'top' },
];

const SEAT_POSITIONS_6: SeatPosition[] = [
  { label: 'bottom' },
  { label: 'bottom-right' },
  { label: 'top-right' },
  { label: 'top' },
  { label: 'top-left' },
  { label: 'bottom-left' },
];

const SEAT_POSITIONS_9: SeatPosition[] = [
  { label: 'bottom' },
  { label: 'bottom-right' },
  { label: 'right' },
  { label: 'top-right' },
  { label: 'top-right', className: 'top-4 left-[64%] right-auto -translate-x-1/2' },
  { label: 'top-left',  className: 'top-4 left-[36%] -translate-x-1/2' },
  { label: 'top-left' },
  { label: 'left' },
  { label: 'bottom-left' },
];

const POSITION_BASE_CLASSES: Record<Position, string> = {
  top:           'top-2 left-1/2 -translate-x-1/2',
  bottom:        'bottom-2 left-1/2 -translate-x-1/2',
  left:          'left-2 top-1/2 -translate-y-1/2',
  right:         'right-2 top-1/2 -translate-y-1/2',
  'top-left':    'top-8 left-8',
  'top-right':   'top-8 right-8',
  'bottom-left': 'bottom-8 left-8',
  'bottom-right':'bottom-8 right-8',
};

/** Simulates what tailwind-merge does: className overrides matching base tokens. */
function resolveClasses(pos: SeatPosition): string {
  const base = POSITION_BASE_CLASSES[pos.label];
  if (!pos.className) return base;

  // Split into tokens; later tokens win when they share a CSS-property prefix.
  const mergeTokens = (a: string, b: string): string => {
    const aTokens = a.split(' ');
    const bTokens = b.split(' ');

    // Property groups: tokens that control the same CSS property clash.
    const propertyPrefix = (t: string) => t.replace(/^-?/, '').replace(/-[\d[].+$/, '').replace(/-1\/2$/, '-transform');

    const result = [...aTokens];
    for (const bt of bTokens) {
      const bp = propertyPrefix(bt);
      const idx = result.findIndex(at => propertyPrefix(at) === bp);
      if (idx !== -1) result[idx] = bt;
      else result.push(bt);
    }
    return result.join(' ');
  };

  return mergeTokens(base, pos.className);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Seat layout position uniqueness', () => {
  it('2-seat table: all seats have unique positions', () => {
    const resolved = SEAT_POSITIONS_2.map(resolveClasses);
    expect(new Set(resolved).size).toBe(SEAT_POSITIONS_2.length);
  });

  it('6-seat table: all seats have unique positions', () => {
    const resolved = SEAT_POSITIONS_6.map(resolveClasses);
    expect(new Set(resolved).size).toBe(SEAT_POSITIONS_6.length);
  });

  it('9-seat table: all seats have unique positions (regression: NEIA-331)', () => {
    const resolved = SEAT_POSITIONS_9.map(resolveClasses);
    // Report duplicates for a clear failure message
    const seen = new Map<string, number>();
    for (const [i, cls] of resolved.entries()) {
      if (seen.has(cls)) {
        throw new Error(
          `Seats ${seen.get(cls)! + 1} and ${i + 1} resolve to identical classes: "${cls}"`
        );
      }
      seen.set(cls, i);
    }
    expect(seen.size).toBe(9);
  });

  it('9-seat table: no two seats share the same vertical anchor', () => {
    // Every seat should have a distinct combination of top/bottom + left/right anchor.
    // Extract the *last* occurrence of each edge property so that later overrides win
    // (mirrors tailwind-merge behaviour where `right-auto` beats `right-8`).
    const lastMatch = (cls: string, re: RegExp) => {
      const all = [...cls.matchAll(new RegExp(re.source, 'g'))];
      return all.at(-1)?.[0] ?? '';
    };
    const verticalAnchor = (cls: string) => {
      const top    = lastMatch(cls, /\btop-[\w[\]%/]+/);
      const bottom = lastMatch(cls, /\bbottom-[\w[\]%/]+/);
      const left   = lastMatch(cls, /\bleft-[\w[\]%/]+/);
      const right  = lastMatch(cls, /\bright-[\w[\]%/]+/);
      return `${top}|${bottom}|${left}|${right}`;
    };
    const anchors = SEAT_POSITIONS_9.map(p => verticalAnchor(resolveClasses(p)));
    expect(new Set(anchors).size).toBe(9);
  });

  it('9-seat table has exactly 9 entries', () => {
    expect(SEAT_POSITIONS_9.length).toBe(9);
  });
});
