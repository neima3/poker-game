# PokerApp — Setup Guide

This document covers everything you need to run PokerApp locally or deploy it to production.

---

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- npm / pnpm / yarn

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd PokerApp
npm install
```

---

## 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project** and fill in the details.
3. Wait for the project to finish provisioning (~1–2 minutes).
4. Navigate to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret)

---

## 3. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

PORT=3018
NEXT_PUBLIC_APP_URL=http://localhost:3018
```

> **Note:** If these vars are missing the app will redirect all requests to `/setup-required` with instructions.

---

## 4. Run the Database Schema

Open the **SQL Editor** in your Supabase dashboard and run the files below **in order**.

### 4.1 Base schema

Run the full contents of `lib/supabase/schema.sql`. This creates:

| Table | Purpose |
|---|---|
| `poker_profiles` | One row per user (extends `auth.users`) |
| `poker_tables` | Game rooms / lobbies |
| `poker_seats` | Players currently sitting at a table |
| `poker_hands` | Completed hand records + replay data |
| `poker_player_hands` | Per-player hole cards and final stack per hand |
| `poker_hand_actions` | Betting action log (fold/check/call/bet/raise/all-in) |
| `poker_daily_bonuses` | Daily chip bonus claim records |
| `poker_chip_grants` | Admin chip grants |

### 4.2 Migrations

Run each file in `supabase/migrations/` in date order:

| File | What it adds |
|---|---|
| `20260319_achievements.sql` | `poker_achievements` definitions + `poker_player_achievements` unlock records + `poker_achievement_leaderboard` view |
| `20260320_straddle_ante.sql` | Adds `ante`, `ante_type`, `straddle_type` columns to `poker_tables` |

---

## 5. Configure Supabase Auth

1. In the Supabase dashboard go to **Authentication → Providers**.
2. **Email** provider is enabled by default — no changes needed for local dev.
3. Under **Authentication → URL Configuration** set:
   - **Site URL**: `http://localhost:3018` (dev) or your production URL
   - **Redirect URLs**: add `http://localhost:3018/**`

The app uses **anonymous / guest sign-in** for quick play. Enable it:

- **Authentication → Providers → Anonymous sign-ins** → Enable

---

## 6. Enable Realtime (optional but recommended)

In the Supabase SQL editor:

```sql
ALTER PUBLICATION supabase_realtime
  ADD TABLE poker_tables, poker_seats, poker_hands, poker_hand_actions;
```

This powers live lobby updates and in-game state sync.

---

## 7. Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3018](http://localhost:3018).

---

## Database Schema Reference

### `poker_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, references `auth.users(id)` |
| `username` | `text` | Unique |
| `display_name` | `text` | |
| `avatar_url` | `text` | |
| `chips` | `bigint` | Default 10,000 |
| `total_hands_played` | `int` | |
| `total_winnings` | `bigint` | |
| `is_admin` | `bool` | |
| `is_guest` | `bool` | |
| `last_daily_bonus` | `timestamptz` | |

Auto-populated on signup via `poker_handle_new_user()` trigger. Expects `raw_user_meta_data.app = 'poker'`.

### `poker_tables`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `text` | |
| `table_size` | `int` | 2, 6, or 9 |
| `small_blind` | `bigint` | |
| `big_blind` | `bigint` | |
| `min_buy_in` | `bigint` | |
| `max_buy_in` | `bigint` | |
| `password_hash` | `text` | nullable |
| `is_active` | `bool` | |
| `current_players` | `int` | synced by trigger |
| `ante` | `bigint` | Default 0 |
| `ante_type` | `text` | `none` \| `table` \| `big_blind` |
| `straddle_type` | `text` | `none` \| `utg` \| `button` |

### `poker_seats`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `table_id` | `uuid` | FK → `poker_tables` |
| `seat_number` | `int` | 1–9 |
| `player_id` | `uuid` | FK → `poker_profiles`, nullable |
| `stack` | `bigint` | |
| `is_sitting_out` | `bool` | |

### `poker_hands`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `table_id` | `uuid` | FK → `poker_tables` |
| `hand_number` | `int` | |
| `community_cards` | `text[]` | |
| `pot_size` | `bigint` | |
| `winners` | `jsonb` | |
| `stage` | `text` | `complete`, `showdown`, etc. |
| `player_ids` | `uuid[]` | GIN-indexed for fast per-player queries |
| `replay_data` | `jsonb` | Full `HandReplayData` blob |
| `share_id` | `text` | Unique slug for shareable links |

### `poker_achievements` (migration)

Seeded from `lib/achievements.ts`. 32 achievements across 5 categories:
`hands`, `winning`, `skill`, `milestone`, `social`.

### `poker_player_achievements` (migration)

Tracks which achievements each player has unlocked and their progress toward locked ones.

---

## RLS Policies Summary

All tables have Row Level Security enabled.

| Table | Policy summary |
|---|---|
| `poker_profiles` | Anyone can SELECT; owner can INSERT/UPDATE own row |
| `poker_tables` | Anyone can SELECT; authenticated users can INSERT; creator can UPDATE/DELETE |
| `poker_seats` | Anyone can SELECT; owner can INSERT/UPDATE/DELETE own seat |
| `poker_hands` | Anyone can SELECT |
| `poker_player_hands` | Player sees own row; everyone sees completed/showdown hands |
| `poker_hand_actions` | Anyone can SELECT |
| `poker_daily_bonuses` | Owner can SELECT/INSERT own records |
| `poker_chip_grants` | Admin only (SELECT/INSERT) |
| `poker_achievements` | Authenticated users can SELECT |
| `poker_player_achievements` | Owner can SELECT/INSERT own records |

---

## Stored Functions

| Function | Purpose |
|---|---|
| `poker_handle_new_user()` | Trigger: auto-creates `poker_profiles` row on auth signup |
| `poker_claim_daily_bonus(player_id)` | Atomic daily bonus claim with 24h cooldown |
| `poker_sit_player(table_id, seat_number, buy_in)` | Atomic sit-down: deducts chips from profile, assigns seat |
| `poker_stand_player(table_id)` | Atomic stand-up: returns stack chips to profile, clears seat |
| `poker_sync_table_player_count()` | Trigger: keeps `poker_tables.current_players` in sync |
| `poker_update_updated_at()` | Trigger: auto-updates `updated_at` on poker_profiles |

---

## Troubleshooting

**App shows "Setup Required" page**
→ Check that `.env.local` exists in the project root and contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Restart the dev server after making changes.

**Auth redirect loops**
→ Ensure your Supabase project's **Site URL** matches `NEXT_PUBLIC_APP_URL` exactly.

**"Profile not found" error after login**
→ The `poker_handle_new_user` trigger may not have run. Verify the trigger exists and that user signup metadata includes `app: 'poker'`. Check `lib/supabase/schema.sql` lines 253–289.

**Guest sign-in fails**
→ Enable **Anonymous sign-ins** in Supabase dashboard → Authentication → Providers.

**Realtime lobby not updating**
→ Run the `ALTER PUBLICATION` command in step 6 to add tables to the realtime publication.

**Missing columns (ante/straddle)**
→ Apply migration `supabase/migrations/20260320_straddle_ante.sql` in the SQL editor.

**Missing achievement tables**
→ Apply migration `supabase/migrations/20260319_achievements.sql` in the SQL editor.
