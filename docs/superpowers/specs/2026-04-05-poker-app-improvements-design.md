# Poker App — Bug Fixes + Visual Uplift Design Spec
**Date:** 2026-04-05  
**Approach:** Global design system pass → targeted table polish (bugs first)

---

## Overview

Two-phase improvement: fix four critical gameplay bugs, then apply a global design system upgrade that cascades to every screen, followed by a targeted deep polish of the poker table.

---

## Phase 1 — Critical Bug Fixes

All fixes are surgical. No architecture changes.

### BUG-01: Betting Round Ends Too Early
**File:** `lib/poker/engine.ts` — `isRoundComplete()`  
**Problem:** On flop/turn/river where `currentBet = 0`, the function returns `true` before all players have acted.  
**Fix:** Add `hasActedThisRound` boolean flag to each player's per-street state. `isRoundComplete()` requires every active player to have `hasActedThisRound = true` AND have matching bets (or be all-in/folded).  
**Reset:** Clear `hasActedThisRound` for all players at the start of every new street.

### BUG-02: Opponent Cards Hidden at Showdown
**File:** `components/game/PlayerSeat.tsx`  
**Problem:** `faceDown` prop hardcoded to `true` for all non-self players, even at showdown.  
**Fix:** Change condition to:
```
faceDown={card === '??' || (!isSelf && phase !== 'showdown' && phase !== 'pot_awarded')}
```

### BUG-04: minRaise Carries Over Between Streets
**File:** `lib/poker/engine.ts` — street transition logic  
**Problem:** `minRaise` from a preflop raise persists to flop/turn/river.  
**Fix:** Reset `minRaise` to the big blind value at the start of each new street (flop, turn, river).

### BUG-05: Small Blind Not Marked All-In
**File:** `lib/poker/engine.ts` — blind posting logic  
**Problem:** `isAllIn` check exists for BB post but not SB post.  
**Fix:** Add the same `isAllIn` guard to SB posting: if SB stack < smallBlind amount, mark player as all-in.

---

## Phase 2 — Global Design System

Five changes applied globally. Defined in `globals.css` and the shared component layer — all screens inherit automatically.

### 1. Card Rendering (`components/game/Card.tsx`)
- White background (`#f8f8f8`), bold rank/suit, deep drop shadow
- Red suits (♥♦): `#dc2626`. Black suits (♠♣): `#1a1a1a`
- Face-down card back: deep blue-indigo gradient (`#1e3a5f` → `#2d1b69`), subtle diamond pattern
- Border radius 5–6px, consistent padding

### 2. CSS Color Tokens (`app/globals.css`)
Define as CSS custom properties on `:root`:
```css
--color-bg-base:     #0d1117
--color-bg-surface:  #161b22
--color-felt:        #1e4d2b
--color-felt-light:  #2d6a3f
--color-rail:        #3b1f0a
--color-gold:        #d4a843
--color-gold-light:  #f0c060
--color-text:        #f0f0f0
--color-text-muted:  #6b7280
--color-danger:      #ef4444
```
Replace all inline hex values in the main components with these vars.

### 3. Typography Hierarchy
Three-level system applied to stack sizes, blind labels, player names:
- **Level 1 (numbers):** `text-xl font-extrabold tracking-tight` — stack sizes, pot amounts
- **Level 2 (labels):** `text-xs font-bold uppercase tracking-widest text-gold` — STACK, DEALER, BB, SB
- **Level 3 (secondary):** `text-xs text-muted` — blinds info, seat numbers

### 4. Glass Panels (`app/globals.css`)
Three utility classes:
```css
.glass-subtle  { background: rgba(255,255,255,0.04); backdrop-filter: blur(8px);  border: 1px solid rgba(255,255,255,0.08); }
.glass-medium  { background: rgba(255,255,255,0.06); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.10); }
.glass-strong  { background: rgba(255,255,255,0.10); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.15); }
```
All seat panels, lobby cards, and tournament cards use these — no ad-hoc rgba values.

### 5. Lobby Table Cards (`components/lobby/`)
Each table card gains:
- Live player dot indicators (green filled = occupied, gray = empty)
- Avg pot display pulled from game state
- Cleaner info hierarchy: blinds large, game type secondary, player count inline
- `glass-subtle` base with `glass-medium` on hover

Landing page hero: animated card fan (3 cards, staggered Framer Motion entrance) with premium "Play Now" CTA.

---

## Phase 3 — Poker Table Deep Polish

Targeted improvements to the primary game screen (`app/table/[id]/`, `components/game/`).

### A. Felt Texture + Table Shape (`components/game/PokerTable.tsx`)
- Felt area: `radial-gradient(ellipse 90% 70% at 50% 50%, #2d6a3f 0%, #1e4d2b 60%, #152c1a 100%)`
- Rail border: `#3b1f0a` solid, 8–10px, with an inner highlight ring
- Table outer glow: `box-shadow: 0 0 60px rgba(0,0,0,0.8)`

### B. Pot Display + Community Cards (`components/game/CommunityCards.tsx`)
- Pot: pill badge with gold border and `rgba(212,168,67,0.15)` background, always centered above community cards
- Community card slots always rendered (5 slots); unrevealed slots show face-down card back, not blank space
- Cards sized at approximately 52px height on desktop, proportional on mobile

### C. Player Seat Redesign (`components/game/PlayerSeat.tsx`)
- Avatar: circle with player's initial, gold gradient for hero, muted gray for opponents
- Role badge: `DEALER` / `BTN` / `BB` / `SB` in small gold uppercase pill directly below avatar
- Hole cards: inline below avatar (not separate absolute-positioned element)
- Stack: large bold white number, "chips" label below in muted
- Active turn: `border-color: var(--color-gold)` + subtle gold glow (`box-shadow: 0 0 12px rgba(212,168,67,0.3)`)
- Folded state: `opacity-40 grayscale`

### D. Action Buttons (`components/game/ActionButtons.tsx`)
- Primary action (Raise/Call/All-in): gold gradient button, larger than secondary actions
- Fold: muted gray (`bg-gray-700`), not red — red is for danger states, not routine folds
- Check: green-tinted dark button
- Bet slider: labels for min/max below the track; track fill color matches gold
- Button layout: Fold left, Check/Call right, Raise/Bet full-width below on mobile; row on desktop

### E. Action Timer (`components/game/` — new `ActionTimer.tsx` component)
- SVG circular ring countdown, drains clockwise over the action time limit
- Color progression: gold (full) → orange (≤5s) → red (≤2s), animated with CSS transition
- Number in center shows seconds remaining
- Replaces current linear progress bar

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `lib/poker/engine.ts` | BUG-01, BUG-04, BUG-05 |
| `components/game/PlayerSeat.tsx` | BUG-02, seat redesign (Phase 3C) |
| `app/globals.css` | Color tokens, glass utilities (Phase 2.2, 2.4) |
| `components/game/Card.tsx` | Card rendering (Phase 2.1) |
| `components/game/PokerTable.tsx` | Felt texture (Phase 3A) |
| `components/game/CommunityCards.tsx` | Pot display, card slots (Phase 3B) |
| `components/game/ActionButtons.tsx` | Button hierarchy, slider (Phase 3D) |
| `components/game/ActionTimer.tsx` | New circular timer component (Phase 3E) |
| `components/lobby/` | Table cards, player dots (Phase 2.5) |
| `app/page.tsx` | Landing hero animation (Phase 2.5) |

---

## Out of Scope
- New features (new game modes, new screens)
- BUG-03 (stand mid-hand), BUG-06 (broadcast view), BUG-07 (chip atomicity), BUG-09/10/12/13 — deferred
- Database schema changes
- Authentication changes
