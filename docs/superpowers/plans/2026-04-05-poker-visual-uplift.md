# Poker App Visual Uplift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a global design system pass and deep poker table polish across the entire app.

**Architecture:** Bug fixes skipped — all 4 listed bugs (BUG-01/02/04/05) are already fixed in the codebase. This plan is 100% visual: global CSS utilities, circular timer, landing page hero, lobby seat-dot indicators, community card empty-slot polish, fold-button de-escalation, and player seat cleanup.

**Tech Stack:** Next.js 16, Tailwind CSS v4, Framer Motion 12, shadcn/ui, React 19

---

## File Map

| File | What Changes |
|------|-------------|
| `app/globals.css` | Add `glass-subtle`, `glass-medium`, `glass-strong` utilities; improve `poker-felt-texture` gradient |
| `components/game/Timer.tsx` | Replace linear bar with SVG circular countdown ring |
| `app/page.tsx` | Premium landing hero with animated card fan |
| `components/lobby/LobbyClient.tsx` | Seat-occupancy dot indicators on each table card |
| `components/game/CommunityCards.tsx` | Empty card slots styled as face-down card backs |
| `components/game/ActionButtons.tsx` | Fold button → neutral gray; better visual hierarchy |
| `components/game/PlayerSeat.tsx` | Remove redundant bottom D/SB/BB tokens; tighten layout |

---

## Task 1: Global CSS — Glass Utilities + Felt Gradient

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add glass utility classes and improve felt gradient**

Open `app/globals.css`. In the `@layer utilities` block, after `.glass-gold`, add:

```css
  .glass-subtle {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .glass-medium {
    background: rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .glass-strong {
    background: rgba(255, 255, 255, 0.11);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
```

- [ ] **Step 2: Improve the poker felt texture gradient**

Find `.poker-felt-texture` and replace its `background-image` with a more dramatic radial gradient (brighter center, darker edge shadows):

```css
  .poker-felt-texture {
    background-image: 
      radial-gradient(ellipse 80% 65% at 50% 50%, var(--color-felt) 0%, color-mix(in srgb, var(--color-felt) 70%, black) 65%, var(--color-felt-dark) 100%);
    background-blend-mode: normal;
  }
```

- [ ] **Step 3: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add app/globals.css
git commit -m "style: add glass utilities and improve felt gradient"
```

---

## Task 2: Circular Timer

**Files:**
- Modify: `components/game/Timer.tsx`

- [ ] **Step 1: Replace linear timer with SVG circular ring**

Rewrite `components/game/Timer.tsx` entirely:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { playTimerTick } from '@/lib/sounds';
import { cn } from '@/lib/utils';

interface TimerProps {
  deadlineMs: number;
  totalSeconds?: number;
  className?: string;
}

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ≈ 113.1

export function Timer({ deadlineMs, totalSeconds = 30, className }: TimerProps) {
  const secondsLeft = useTimer(deadlineMs);
  const pct = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const strokeOffset = CIRCUMFERENCE * (1 - pct);

  const isUrgent = secondsLeft <= 5;
  const isWarning = secondsLeft <= 10 && secondsLeft > 5;
  const prevSeconds = useRef(secondsLeft);

  useEffect(() => {
    if (secondsLeft <= 10 && secondsLeft < prevSeconds.current && secondsLeft > 0) {
      playTimerTick();
    }
    prevSeconds.current = secondsLeft;
  }, [secondsLeft]);

  const strokeColor = isUrgent ? '#ef4444' : isWarning ? '#f97316' : '#d4a843';

  return (
    <div className={cn('relative flex items-center justify-center', className)} style={{ width: 48, height: 48 }}>
      <svg width="48" height="48" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3.5"
        />
        {/* Progress ring */}
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeOffset}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease' }}
        />
      </svg>
      {/* Seconds label */}
      <span
        className="absolute text-[11px] font-black tabular-nums"
        style={{ color: strokeColor, transition: 'color 0.3s ease' }}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add components/game/Timer.tsx
git commit -m "style: replace linear action timer with SVG circular countdown ring"
```

---

## Task 3: Landing Page Hero Redesign

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite the landing page with premium card fan and better hero**

Replace the entire content of `app/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Spade } from "lucide-react";

// Preview cards for the hero fan
const HERO_CARDS = [
  { rank: 'A', suit: '♠', color: '#1a1a1a' },
  { rank: 'K', suit: '♥', color: '#dc2626' },
  { rank: 'Q', suit: '♦', color: '#dc2626' },
  { rank: 'J', suit: '♣', color: '#1a1a1a' },
  { rank: '10', suit: '♠', color: '#1a1a1a' },
];

const cardRotations = [-18, -9, 0, 9, 18];
const cardTranslateY = [8, 3, 0, 3, 8];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12 overflow-hidden">

      {/* Subtle ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-green-900/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full bg-yellow-900/10 blur-[100px]" />
      </div>

      <motion.div
        className="relative flex flex-col items-center gap-10 z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* Animated card fan */}
        <motion.div
          className="flex items-end justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          style={{ height: 100 }}
        >
          {HERO_CARDS.map((card, i) => (
            <motion.div
              key={i}
              className="relative"
              style={{
                marginLeft: i === 0 ? 0 : -22,
                rotate: cardRotations[i],
                translateY: cardTranslateY[i],
                zIndex: i === 2 ? 5 : i < 2 ? i : 4 - i,
              }}
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: cardTranslateY[i], rotate: cardRotations[i] }}
              transition={{
                delay: 0.1 + i * 0.07,
                type: 'spring',
                stiffness: 280,
                damping: 22,
              }}
              whileHover={{ y: cardTranslateY[i] - 12, zIndex: 10, transition: { duration: 0.15 } }}
            >
              <div
                className="relative flex flex-col items-start justify-between rounded-lg p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.5)] select-none"
                style={{
                  width: 54,
                  height: 76,
                  background: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                }}
              >
                <div style={{ color: card.color, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>
                  <div>{card.rank}</div>
                  <div style={{ fontSize: 10 }}>{card.suit}</div>
                </div>
                <div style={{ color: card.color, fontSize: 20, fontWeight: 900, position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.08 }}>
                  {card.suit}
                </div>
                <div style={{ color: card.color, fontSize: 13, fontWeight: 900, lineHeight: 1, transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>
                  <div>{card.rank}</div>
                  <div style={{ fontSize: 10 }}>{card.suit}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-felt text-white shadow-lg shadow-green-900/40">
              <Spade className="h-6 w-6" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter">
              Poker<span className="text-gold">App</span>
            </h1>
          </div>
          <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
            No-Limit Texas Hold&apos;em
          </p>
        </div>

        {/* Tagline */}
        <p className="max-w-sm text-center text-base text-muted-foreground leading-relaxed">
          Real-time multiplayer poker. Start with{' '}
          <span className="font-bold text-gold">10,000 chips</span> and climb the leaderboard.
        </p>

        {/* CTA */}
        <motion.div
          className="flex flex-col gap-3 sm:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Button
            asChild
            size="lg"
            className="min-w-[180px] h-12 text-base font-black tracking-widest bg-gradient-to-r from-felt to-felt-dark text-white hover:from-green-700 hover:to-felt-dark shadow-lg shadow-green-900/30 border border-green-700/30"
          >
            <Link href="/lobby">
              <Spade className="mr-2 h-4 w-4" />
              Play Now
            </Link>
          </Button>

          <Button asChild size="lg" variant="outline" className="min-w-[180px] h-12 text-base font-semibold border-white/15 hover:border-white/30 hover:bg-white/5">
            <Link href="/login">
              Sign In
            </Link>
          </Button>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="mt-2 grid grid-cols-3 gap-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {[
            { value: '2–9', label: 'Players' },
            { value: 'NL', label: "Hold'em" },
            { value: 'Free', label: 'To Play' },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="text-3xl font-black text-white tracking-tight">{value}</div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </motion.div>

      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add app/page.tsx
git commit -m "style: premium landing page hero with animated card fan"
```

---

## Task 4: Lobby — Seat Occupancy Dots

**Files:**
- Modify: `components/lobby/LobbyClient.tsx`

- [ ] **Step 1: Add a SeatDots sub-component and integrate into table cards**

In `LobbyClient.tsx`, add this helper function before the `LobbyClient` component definition (after the imports):

```tsx
function SeatDots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            i < filled
              ? 'h-2 w-2 rounded-full bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]'
              : 'h-2 w-2 rounded-full border border-white/20'
          }
        />
      ))}
    </div>
  );
}
```

Then in the table card markup, find this section:
```tsx
<span className="flex items-center gap-1">
  <Users className="h-3.5 w-3.5 shrink-0" />
  <span>
    <span className={table.current_players > 0 ? 'text-green-400 font-medium' : ''}>
      {table.current_players}
    </span>
    /{table.table_size}
  </span>
</span>
```

Replace it with:
```tsx
<div className="flex flex-col gap-0.5">
  <SeatDots filled={table.current_players} total={table.table_size} />
  <span className="text-[10px] text-muted-foreground">
    {table.current_players}/{table.table_size} seats
  </span>
</div>
```

Also remove the `Users` import from lucide-react if it becomes unused (check the imports at the top — it's used in `LobbyClient`, so keep it only if still referenced elsewhere; otherwise remove it).

- [ ] **Step 2: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add components/lobby/LobbyClient.tsx
git commit -m "style: add seat occupancy dot indicators to lobby table cards"
```

---

## Task 5: CommunityCards — Empty Slots as Card Backs

**Files:**
- Modify: `components/game/CommunityCards.tsx`

- [ ] **Step 1: Replace plain empty card slot div with card-back style**

Find this block in `CommunityCards.tsx` (the empty card slot):

```tsx
) : (
  <div className="h-20 w-14 rounded-lg border-2 border-dashed border-white/10 bg-black/20 flex items-center justify-center">
    <div className="w-1/2 h-1/2 rounded-full border border-white/5 opacity-20" />
  </div>
)}
```

Replace with:

```tsx
) : (
  <div
    className="relative h-20 w-14 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
    style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1f3a 50%, #2d1b69 100%)' }}
  >
    {/* Crosshatch pattern */}
    <div
      className="absolute inset-0 opacity-[0.15]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l10 10M10 0L0 10' stroke='white' stroke-width='0.4' fill='none'/%3E%3C/svg%3E")`,
        backgroundSize: '6px 6px',
      }}
    />
    {/* Center emblem */}
    <div className="absolute inset-[6px] rounded border border-white/10 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border border-white/15 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-white/5" />
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add components/game/CommunityCards.tsx
git commit -m "style: community card empty slots styled as face-down card backs"
```

---

## Task 6: ActionButtons — Fold Button De-escalation

**Files:**
- Modify: `components/game/ActionButtons.tsx`

- [ ] **Step 1: Change fold button from red/destructive to neutral gray**

In `ActionButtons.tsx`, find the main action buttons section (inside the `return` for the normal mode, not AoF). Find the Fold button:

```tsx
<ActionBtn
  variant="destructive"
  disabled={isSubmitting}
  onClick={() => handleAction('fold')}
  className="h-full bg-red-950/30 border-red-500/20 text-red-400 hover:bg-red-900/40 font-black tracking-widest text-sm shadow-xl"
>
  {lastPressed === 'fold' && isSubmitting ? '...' : 'FOLD'}
</ActionBtn>
```

Replace with:

```tsx
<ActionBtn
  variant="outline"
  disabled={isSubmitting}
  onClick={() => handleAction('fold')}
  className="h-full bg-white/3 border-white/10 text-white/50 hover:bg-white/8 hover:text-white/70 font-black tracking-widest text-sm shadow-xl"
>
  {lastPressed === 'fold' && isSubmitting ? '...' : 'FOLD'}
</ActionBtn>
```

- [ ] **Step 2: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add components/game/ActionButtons.tsx
git commit -m "style: fold button changed from red to neutral gray — red reserved for danger states"
```

---

## Task 7: PlayerSeat — Remove Redundant Position Tokens

**Files:**
- Modify: `components/game/PlayerSeat.tsx`

- [ ] **Step 1: Remove the redundant bottom D/SB/BB token row**

In `PlayerSeat.tsx`, find and remove the entire `{/* Dealer / Blind tokens */}` block (lines ~278–308):

```tsx
      {/* Dealer / Blind tokens */}
      <div className="flex gap-1">
        <AnimatePresence>
          {isDealer && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-white text-black px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              D
            </motion.span>
          )}
          {isSmallBlind && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-blue-500 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              SB
            </motion.span>
          )}
          {isBigBlind && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-md"
            >
              BB
            </motion.span>
          )}
        </AnimatePresence>
      </div>
```

The inline D badge on the avatar (the small absolute-positioned `h-5 w-5` circle) and the top-right `SB`/`BB` badges already serve this purpose cleanly.

- [ ] **Step 2: Improve the active glow on the seat**

Find the `isActive` ring in the avatar info box className:
```tsx
isActive
  ? 'ring-2 ring-yellow-400/80 shadow-[0_0_20px_rgba(250,204,21,0.4)] translate-y-[-4px]'
```

Replace with a slightly more dramatic version:
```tsx
isActive
  ? 'ring-2 ring-yellow-400/90 shadow-[0_0_28px_rgba(250,204,21,0.5),0_0_8px_rgba(250,204,21,0.3)] translate-y-[-4px]'
```

- [ ] **Step 3: Commit**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git add components/game/PlayerSeat.tsx
git commit -m "style: remove redundant position tokens from PlayerSeat; strengthen active glow"
```

---

## Task 8: Browser Test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
npm run dev
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000` and check:
1. **Landing page**: Card fan animates in, green CTA button looks premium, stats row visible
2. **Lobby**: Navigate to `/lobby` — seat dots show for each table
3. **Table**: Navigate to `/table/[any-id]` and check:
   - Circular timer appears above active player (gold ring)
   - Empty community card slots look like card backs
   - Fold button is gray, Raise/Bet is gold
   - Felt texture has dramatic center-light gradient
4. No console errors

---

## Task 9: Push to GitHub

- [ ] **Step 1: Verify clean working tree**

```bash
cd /Users/neima/Desktop/Apps/PokerApp
git status
git log --oneline -8
```

- [ ] **Step 2: Push**

```bash
git push origin main
```
