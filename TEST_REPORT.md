# PokerApp — Test Report

**Date:** 2026-02-17
**Server:** http://localhost:3018
**Branch:** main
**Method:** Full code review + API testing (browser automation unavailable due to Chrome single-instance conflict)

---

## Executive Summary

The PokerApp is a well-architected MVP with a clean separation between game engine, API layer, and UI. The core stack (Next.js 16 App Router, Supabase, Framer Motion, shadcn/ui) is solid. However, there are **2 critical gameplay bugs**, several **significant security/logic issues**, and multiple **UX problems** that must be addressed before the app is production-ready.

---

## 🔴 Critical Bugs

### BUG-01: Betting Round Completion Logic is Broken
**File:** `lib/poker/engine.ts:223–234`
**Severity:** Critical — game logic fundamentally broken for multi-player rounds

`isRoundComplete()` checks if all active players have `currentBet < state.currentBet`. At the start of a new betting street (flop, turn, river), `state.currentBet` resets to `0` and all players have `currentBet = 0`. This means `needsToAct` is always empty, so `isRoundComplete` returns `true` immediately after the **first player acts** on any street after preflop.

**Effect:** On the flop with 2 players, as soon as Player A checks, the game advances to the turn — Player B never gets to act. The flop, turn, and river each only get one action.

```ts
// BUG: isRoundComplete returns true too early on streets where currentBet = 0
const needsToAct = active.filter(
  p => !p.isAllIn && p.currentBet < state.currentBet  // 0 < 0 is always false!
);
return needsToAct.length === 0;  // Always true when currentBet = 0
```

**Fix needed:** Track a `hasActedThisRound` flag per player, reset at each new street. Use the "last aggressor" pattern — betting is complete when action returns to the last aggressor after everyone else has acted.

---

### BUG-02: Opponents' Cards Not Shown at Showdown
**File:** `components/game/PlayerSeat.tsx:54`, `lib/poker/engine.ts:432–443`
**Severity:** Critical — showdown is broken

`sanitizeForPlayer()` correctly reveals all players' cards at showdown. However, `PlayerSeat.tsx` still forces `faceDown={true}` for non-self players regardless of phase:

```tsx
// BUG: !isSelf forces face-down even at showdown
faceDown={card === '??' || !isSelf}
```

At showdown, `card` is a real card string (e.g., `'Ah'`), so `card === '??'` is `false`. But `!isSelf` is still `true` for opponents, making `faceDown = true` and hiding their revealed cards.

**Effect:** Players can never see opponents' winning hands at showdown. The win announcement appears but no cards are visible.

**Fix:** Change the condition to: `faceDown={card === '??' || (!isSelf && phase !== 'showdown' && phase !== 'pot_awarded')}`

---

## 🟠 High-Severity Issues

### BUG-03: Player Can Stand Up Mid-Hand
**File:** `app/api/tables/[id]/stand/route.ts`
**Severity:** High — game state corruption

The `/stand` endpoint has no guard against leaving during an active game. A player who stands mid-hand is removed from `poker_seats` and gets their chips back, but the in-memory `GameState` still includes them. The game engine will continue trying to advance their turn, and their `activeSeat` slot can deadlock the hand.

**Fix:** Check `hasActiveGame(tableId)` at the start of the stand route and return a `400` error if a hand is in progress.

---

### BUG-04: `minRaise` Not Reset Between Streets
**File:** `lib/poker/engine.ts:278–300`
**Severity:** High — incorrect betting amounts

When transitioning from preflop to flop (and subsequent streets), `minRaise` carries over its preflop value:

```ts
// BUG: minRaise not reset on flop
minRaise: state.minRaise,  // Should be reset to bigBlind
```

If someone raised to 500 preflop, `minRaise` stays at 500 on the flop. The minimum raise on the flop should reset to the big blind. This makes raises on later streets unnecessarily large.

**Fix:** Reset `minRaise` to `state.players...bigBlind` (or derive from table config) at the start of each new street.

---

### BUG-05: Small Blind Player Not Marked as All-In
**File:** `lib/poker/engine.ts:102–104`
**Severity:** High — incorrect game state

In `dealHoleCards()`, the big blind player is correctly marked `isAllIn` if they can't cover the blind:
```ts
isAllIn: amount === p.stack && p.stack > 0  // BB only
```

But the same check is missing for the small blind. If an SB player has fewer chips than the small blind, they are not marked as `isAllIn` — the engine would still expect them to act again.

---

### BUG-06: Broadcast After Action Uses Spectator View (Players Lose Hole Cards)
**File:** `app/api/tables/[id]/action/route.ts:74–78`
**Severity:** High — privacy/UX regression

After each action, the broadcast sends `sanitizeForSpectator(newState)` which hides **all** hole cards. The acting player gets `sanitizeForPlayer` in the HTTP response, but other players receive the spectator view over Realtime — their cards appear hidden.

The client-side workaround (`stateWithMyCards` in `useGameState.ts:82–89`) re-merges cached hole cards, which works if the Realtime connection is stable and no page refresh occurs. If a player refreshes mid-hand, their cards disappear.

**Fix:** Either (a) broadcast `sanitizeForPlayer` for every connected player via separate messages, or (b) persist private cards in the DB so they survive refreshes.

---

### BUG-07: Non-Atomic Chip Deduction (Race Condition)
**File:** `app/api/tables/[id]/sit/route.ts:72–90`
**Severity:** High — financial integrity

The sit flow deducts chips from `poker_profiles`, then updates `poker_seats` in two separate DB calls. If the seat update fails, chips are refunded — but if the server crashes between the two calls, chips are permanently deducted without the player being seated.

**Fix:** Use a Supabase RPC (PostgreSQL function) to wrap both operations in a single transaction.

---

### BUG-08: 9-Player Table Has Duplicate Seat Position
**File:** `components/game/PokerTable.tsx:26–35`
**Severity:** High — seats 1 and 9 overlap visually

```ts
const SEAT_POSITIONS_9 = [
  { label: 'bottom' as const },   // seat 1
  { label: 'bottom-right' },
  { label: 'right' },
  { label: 'top-right' },
  { label: 'top' },
  { label: 'top-left' },
  { label: 'left' },
  { label: 'bottom-left' },
  { label: 'bottom' as const },   // seat 9 — DUPLICATE! Renders on top of seat 1
];
```

Two players at the same absolute CSS position. At a full 9-max table, players at seats 1 and 9 are invisible to each other and the UI is broken.

**Fix:** Use a more distinct position for seat 9 (e.g., `bottom-right-close` or a specific offset via `style` rather than fixed class names).

---

## 🟡 Medium-Severity Issues

### BUG-09: `NEXT_PUBLIC_SITE_URL` Environment Variable Missing
**File:** `app/(auth)/actions.ts:47`
**Severity:** Medium — email verification broken

The signup action uses `process.env.NEXT_PUBLIC_SITE_URL ?? ""` for the email redirect URL. This variable is not defined in `.env.local` (which defines `NEXT_PUBLIC_APP_URL` instead). Email verification links would redirect to `/api/auth/callback` with no domain prefix, which is an invalid URL.

**Fix:** Either rename `NEXT_PUBLIC_APP_URL` to `NEXT_PUBLIC_SITE_URL`, or update the actions.ts reference.

---

### BUG-10: No `/api/auth/callback` Route Handler
**File:** `app/(auth)/actions.ts:47`
**Severity:** Medium — email verification non-functional

The `emailRedirectTo` in signup points to `/api/auth/callback`, but no such route exists in the codebase. After email verification, users would land on a 404 page without a session being established.

**Fix:** Create `app/api/auth/callback/route.ts` per Supabase SSR documentation.

---

### BUG-11: Buy-in Quick Buttons Show "0k" for Low Blind Levels
**File:** `components/game/TableClient.tsx:251–259`
**Severity:** Medium — bad UX for low-stakes tables

The quick-select buy-in buttons use `(amt / 1000).toFixed(0)}k`. For the 10/20 blind level (min buy-in: 400, max: 2,000), all three buttons display "0k", "1k", "2k" — the first button shows "0k" which is meaningless.

**Fix:** Use a smarter formatter: if `amt < 1000`, show the raw number; otherwise show `k` notation.

---

### BUG-12: `seatedCount` Not Updated in Real-Time
**File:** `app/table/[id]/TableClient.tsx:56`
**Severity:** Medium — incorrect player count display

`seatedCount = seats.filter(s => s.player_id).length` is derived from `seats` state, which only updates locally when the **current user** sits down. When other players join, `seatedCount` doesn't update until a page refresh. This means the "Start New Hand" button might not appear (requires `seatedCount >= 2`), or the player count in the top bar is wrong.

**The `onPlayerJoined` callback in `useTableChannel` exists** but `TableClient` passes `undefined` for it — it's never connected to refresh the seats list.

**Fix:** Pass a `onPlayerJoined` callback that fetches fresh seat data from `/api/tables/[id]`.

---

### BUG-13: In-Memory Game Store Lost on Server Restart
**File:** `lib/poker/game-store.ts`
**Severity:** Medium (documented, but critical for dev ergonomics)

The in-memory `Map` is wiped on every server restart (including hot-reload during development). Active games are permanently lost. During development, any code change causes game state loss.

**Fix (production):** Replace with Redis or persist game state to Supabase. **Fix (dev):** Even a JSON file-based store would survive hot-reloads.

---

### BUG-14: No Reconnection Handling for Realtime Channel
**File:** `hooks/useTableChannel.ts`
**Severity:** Medium — poor network resilience

If the Supabase Realtime WebSocket connection drops (network blip, sleep/wake), the client doesn't attempt to resubscribe. The game silently stops receiving updates. No error state is shown to the user.

**Fix:** Listen to the channel status event and re-subscribe on disconnect. Add a visible reconnecting indicator.

---

### BUG-15: No Debounce on Action Button
**File:** `hooks/useGameState.ts:39–65`
**Severity:** Medium — double-action possible

`submitAction` has no debounce or guard against concurrent requests. A fast double-click could submit two actions. The `isSubmitting` state guards the UI, but there's a race window before `setIsSubmitting(true)` renders.

**Fix:** Check `isSubmitting` inside `submitAction` before proceeding, or use a `ref` to guard.

---

## 🟢 Low-Severity Issues / UX Feedback

### UX-01: Login/Signup Forms Have No Loading State
**Files:** `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
The forms use server actions (`action={login}`) with no client-side `isPending` indicator. After clicking "Sign In", the button remains active and the user gets no feedback for 1-3 seconds.

**Fix:** Convert to client-side forms with `useFormStatus`, or use React 19's `useActionState`.

---

### UX-02: "Raise to" Label Semantics Are Ambiguous
**File:** `components/game/ActionButtons.tsx:63, 153`
The raise slider label says "Raise to {amount}" but the `amount` sent to the server is the **additional** chips, not the total bet. In standard poker UI, "Raise to X" means the total bet becomes X. The slider `min={minRaise}` uses the raise size (additional), not a total bet amount.

This is confusing and likely results in players raising less than they intend.

**Fix:** Either (a) send `effectiveRaiseAmount + player.currentBet` as the total and adjust the engine, or (b) change the label to "Raise by {amount}".

---

### UX-03: Middleware Deprecation Warning
**File:** `middleware.ts`, Next.js logs
Next.js 16 warns: `"The 'middleware' file convention is deprecated. Please use 'proxy' instead."`. This should be addressed before upgrading Next.js.

---

### UX-04: No Confirmation Before Standing Up
**File:** `components/game/TableClient.tsx:101–113`
Clicking "Stand" immediately cashes out. There's no "Are you sure?" confirmation dialog. Easy to accidentally trigger.

---

### UX-05: Guest Accounts Generate Every Login
**File:** `app/(auth)/actions.ts:61–83`
Every time "Play as Guest" is clicked, a new Supabase user is created. This means a user who plays as guest 10 times creates 10 separate accounts in the database. Guest sessions are not persisted across browser refreshes.

**Fix:** Check for an existing session before creating a new guest. Use anonymous sessions if Supabase supports them.

---

### UX-06: Lobby Table Button Shows "Full" Based on `current_players >= table_size`
**File:** `components/lobby/LobbyClient.tsx:124`
`current_players` is updated via `poker_seats` count in the sit/stand routes. The realtime lobby subscription correctly refreshes on table changes. This works correctly.

---

### UX-07: No Error Boundary in TableClient
**File:** `app/table/[id]/TableClient.tsx`
Any runtime error in the game components would crash the entire table view. There's no error boundary — the user would see a blank screen with no recovery option.

---

### UX-08: Profile Stats Always Show Zero
**File:** `app/profile/page.tsx:68–81`
`total_hands_played` and `total_winnings` always show `0` because the action route never updates these fields in `poker_profiles`. The hand recording inserts into `poker_hands` table, but profile stats are never incremented.

---

## Security Review

### SEC-01: No Server-Side Validation of Raise Amount Range
**File:** `app/api/tables/[id]/action/route.ts`
The API accepts any `amount` value without range-clamping. The engine validates minimum raise, but a client could send a negative amount. The engine's `Math.min(player.stack, amount)` prevents overpaying, and `actualPaid = Math.min(player.stack, amount)` with negative amount would produce 0, which the minRaise check would catch. Low risk but add explicit validation.

### SEC-02: No Rate Limiting on Auth Endpoints
The login, signup, and guest-play endpoints have no rate limiting. Supabase provides some server-side rate limiting on auth, but the guest account creation route could be abused to create thousands of accounts.

### SEC-03: Table Creator Not Validated as Still Active
A user could create a table, leave, and the table stays active forever (no cleanup mechanism). The `is_active` flag is never set to `false` by any route.

---

## What Works Well ✅

1. **Authentication flow** — Login, signup, and guest play all correctly redirect after success. Middleware properly protects routes and redirects unauthenticated users.
2. **Clean architecture** — Pure game engine functions, proper server/client component separation, good use of App Router conventions.
3. **Hand evaluator** — The 7-card hand evaluator (combinations approach) is correct and handles all poker hand rankings including the wheel straight (A-2-3-4-5).
4. **Deck shuffling** — Fisher-Yates shuffle is correctly implemented.
5. **Card sanitization** — `sanitizeForPlayer` and `sanitizeForSpectator` correctly hide hole cards from wrong recipients (except at showdown — see BUG-02).
6. **Realtime lobby updates** — Supabase Realtime correctly refreshes the lobby when tables change.
7. **Buy-in dialog** — Validates buy-in range on both client and server. Deducts chips correctly. Prevents double-sitting.
8. **Blind posting** — Correctly posts SB and BB and handles partial blinds when stack < blind amount.
9. **TypeScript coverage** — No type errors. Types are well-defined across the entire app.
10. **UI polish** — Animations, dark theme, poker table visuals, card design are all high quality.
11. **Winner announcement** — Shows winner name, hand name, and chip amount.
12. **Timer component** — Action countdown with color-coded urgency works correctly.

---

## Priority Fix Order

| Priority | Bug | Impact |
|----------|-----|--------|
| 🔴 P0 | BUG-01: Round completion logic broken | Game unplayable after preflop |
| 🔴 P0 | BUG-02: Showdown cards hidden | Showdown broken |
| 🟠 P1 | BUG-03: Stand mid-hand | Game state corruption |
| 🟠 P1 | BUG-08: 9-max seat overlap | 9-player tables broken |
| 🟠 P1 | BUG-06: Broadcast uses spectator view | Card privacy issue |
| 🟠 P1 | BUG-04: minRaise not reset | Wrong bet amounts |
| 🟡 P2 | BUG-05: SB not marked all-in | Edge case bug |
| 🟡 P2 | BUG-07: Non-atomic chip deduction | Financial integrity |
| 🟡 P2 | BUG-09/10: Auth callback missing | Email verification broken |
| 🟡 P2 | BUG-12: seatedCount stale | Start button may not appear |
| 🟢 P3 | UX-01–08 | UX improvements |

---

## Server/Build Status

- **Dev server:** Running on port 3018 ✅
- **TypeScript errors:** None ✅
- **Next.js warning:** Middleware file convention deprecated (`middleware.ts` → `proxy.ts`)
- **Workspace root warning:** Multiple `package-lock.json` files detected — set `turbopack.root` in `next.config.ts`
