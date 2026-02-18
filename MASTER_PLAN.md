# 🎰 WSOP Poker Web App - Master Plan

## Project Overview
WSOP-style Texas Hold'em poker clone - mobile-first web app with real-time multiplayer.

**Production URLs:**
- poker.nei.ma
- poker.nak.im

**Tech Stack:**
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Framer Motion (animations)
- Supabase (Auth, Database, Realtime)
- Port: 3018

---

## Phase 1: Core Foundation (MVP)

### 1.1 Project Setup
- [x] Create Next.js project with TypeScript
- [ ] Configure Tailwind + shadcn/ui
- [ ] Set up Supabase client
- [ ] Configure environment variables
- [ ] Basic layout/navigation

### 1.2 Database Schema

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  chips BIGINT DEFAULT 10000,
  total_hands_played INT DEFAULT 0,
  total_winnings BIGINT DEFAULT 0,
  is_admin BOOLEAN DEFAULT FALSE,
  last_daily_bonus TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tables (game rooms)
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  table_size INT NOT NULL CHECK (table_size IN (2, 6, 9)), -- heads-up, 6-max, 9-max
  small_blind BIGINT NOT NULL,
  big_blind BIGINT NOT NULL,
  min_buy_in BIGINT NOT NULL,
  max_buy_in BIGINT NOT NULL,
  password_hash TEXT, -- NULL = public table
  is_active BOOLEAN DEFAULT TRUE,
  current_players INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table seats
CREATE TABLE seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
  seat_number INT NOT NULL,
  player_id UUID REFERENCES profiles(id),
  stack BIGINT DEFAULT 0,
  is_sitting_out BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(table_id, seat_number)
);

-- Game hands (historical)
CREATE TABLE hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id),
  hand_number SERIAL,
  community_cards TEXT[], -- ['Ah', 'Kd', 'Qc', 'Js', 'Th']
  pot_size BIGINT,
  winners JSONB, -- [{player_id, amount, hand_rank}]
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Player actions in hands
CREATE TABLE hand_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id UUID REFERENCES hands(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  action_type TEXT NOT NULL, -- fold, check, call, bet, raise, all-in
  amount BIGINT,
  betting_round TEXT NOT NULL, -- preflop, flop, turn, river
  action_order INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily bonuses tracking
CREATE TABLE daily_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  bonus_amount BIGINT NOT NULL,
  claimed_at TIMESTAMP DEFAULT NOW()
);

-- Admin chip grants
CREATE TABLE chip_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id),
  player_id UUID REFERENCES profiles(id),
  amount BIGINT NOT NULL,
  reason TEXT,
  granted_at TIMESTAMP DEFAULT NOW()
);
```

### 1.3 Authentication System
- [ ] Email/password signup
- [ ] Username selection (unique)
- [ ] Guest play (temporary account)
- [ ] Login/logout
- [ ] Protected routes

### 1.4 Chip System
- [ ] Starting balance: 10,000 chips
- [ ] Daily bonus: 1,000 chips (24h cooldown)
- [ ] Admin panel to grant chips
- [ ] Chip balance display in header

---

## Phase 2: Game Engine

### 2.1 Card System
```typescript
type Suit = 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
type Card = `${Rank}${Suit}`; // e.g., 'Ah', 'Kd'

interface Deck {
  cards: Card[];
  shuffle(): void;
  draw(count: number): Card[];
}
```

### 2.2 Hand Evaluator
- [ ] Implement poker hand ranking (Royal Flush → High Card)
- [ ] Compare hands for winner determination
- [ ] Handle split pots
- [ ] Handle kickers

### 2.3 Game State Machine
```typescript
type GamePhase = 
  | 'waiting'      // Waiting for players
  | 'starting'     // Countdown to start
  | 'preflop'      // Hole cards dealt
  | 'flop'         // 3 community cards
  | 'turn'         // 4th community card
  | 'river'        // 5th community card
  | 'showdown'     // Reveal cards
  | 'pot_awarded'; // Winner announced

interface GameState {
  phase: GamePhase;
  pot: number;
  communityCards: Card[];
  currentBet: number;
  activePlayerIndex: number;
  dealerIndex: number;
  players: PlayerState[];
  sidePots: SidePot[];
}
```

### 2.4 Betting Logic
- [ ] Blinds posting (SB/BB)
- [ ] Check, Bet, Call, Raise, Fold, All-in
- [ ] Minimum raise rules
- [ ] Pot limit / No limit rules
- [ ] Side pot calculation

---

## Phase 3: Real-Time Multiplayer

### 3.1 Supabase Realtime Channels
```typescript
// Table channel for game state
const tableChannel = supabase.channel(`table:${tableId}`)
  .on('broadcast', { event: 'game_state' }, handleGameState)
  .on('broadcast', { event: 'player_action' }, handleAction)
  .on('presence', { event: 'sync' }, handlePresenceSync)
  .subscribe();

// Events:
// - game_state: Full game state update
// - player_action: Individual action (fold, bet, etc.)
// - player_joined: New player at table
// - player_left: Player left table
// - new_hand: Hand started
// - cards_dealt: Hole cards (private to player)
// - community_cards: Flop/turn/river reveal
// - winner: Hand winner announcement
```

### 3.2 Presence System
- [ ] Show who's at the table
- [ ] Show who's currently connected
- [ ] Handle disconnections gracefully
- [ ] Reconnection logic

### 3.3 Turn Timer
- [ ] 30-second action timer
- [ ] Visual countdown
- [ ] Auto-fold on timeout
- [ ] Time bank for important decisions

---

## Phase 4: Bot Players

### 4.1 Bot Difficulty Levels
```typescript
type BotDifficulty = 'fish' | 'regular' | 'shark' | 'pro';

interface BotStrategy {
  preflop: (hand: Card[], position: number, potOdds: number) => Action;
  postflop: (hand: Card[], community: Card[], potOdds: number) => Action;
  bluffFrequency: number;
  foldToPressure: number;
  aggression: number;
}
```

### 4.2 Bot Behaviors
- **Fish** 🐟: Plays too many hands, calls too much, rarely bluffs
- **Regular** 🎯: Solid TAG (tight-aggressive) style
- **Shark** 🦈: Exploitative play, adjusts to opponents
- **Pro** 👑: GTO-inspired, balanced ranges, calculated bluffs

### 4.3 Bot Features
- [ ] Random delay (feels human)
- [ ] Varied bet sizing
- [ ] Occasional "mistakes"
- [ ] Chat messages (optional)

---

## Phase 5: UI/UX

### 5.1 Table View (Main Game Screen)
- Oval table with player positions
- Card animations (dealing, flipping)
- Chip stack visualizations
- Pot display in center
- Action buttons (Fold, Check, Call, Raise slider)
- Community cards area
- Player info boxes (avatar, name, stack, timer)

### 5.2 Lobby
- [ ] Table list with filters
- [ ] Create table button
- [ ] Quick join buttons
- [ ] Active tables indicator
- [ ] Player count per table

### 5.3 Responsive Design
- [ ] Mobile-first layout
- [ ] Touch-friendly controls
- [ ] Landscape mode for table view
- [ ] Compact player info on mobile

### 5.4 Animations
- [ ] Card dealing animation
- [ ] Chip movement to pot
- [ ] Winner celebration
- [ ] Card reveal flip
- [ ] Timer countdown pulse

---

## Phase 6: Polish & Features

### 6.1 Sound Effects
- [ ] Card deal sounds
- [ ] Chip sounds
- [ ] Timer warning
- [ ] Win celebration
- [ ] Toggle sound on/off

### 6.2 Player Stats
- [ ] Hands played
- [ ] Win rate
- [ ] Biggest pot won
- [ ] Achievement badges

### 6.3 Table Chat
- [ ] Real-time chat
- [ ] Emoji reactions
- [ ] Mute option
- [ ] Quick phrases

### 6.4 Private Tables
- [ ] Password protection
- [ ] Invite links
- [ ] Friends list

---

## File Structure

```
/app
  /api
    /auth/[...supabase]/route.ts
    /tables/route.ts
    /game/[tableId]/route.ts
  /(auth)
    /login/page.tsx
    /signup/page.tsx
  /(main)
    /lobby/page.tsx
    /table/[id]/page.tsx
    /profile/page.tsx
    /admin/page.tsx (chip grants)
  /layout.tsx
  /page.tsx (landing)

/components
  /ui (shadcn)
  /game
    /Table.tsx
    /PlayerSeat.tsx
    /Card.tsx
    /ChipStack.tsx
    /ActionButtons.tsx
    /PotDisplay.tsx
    /CommunityCards.tsx
    /Timer.tsx
  /lobby
    /TableList.tsx
    /CreateTableModal.tsx
    /QuickJoin.tsx
  /layout
    /Header.tsx
    /Navigation.tsx
    /ChipBalance.tsx

/lib
  /supabase
    /client.ts
    /server.ts
    /middleware.ts
  /game
    /deck.ts
    /evaluator.ts
    /state-machine.ts
    /betting.ts
    /side-pots.ts
  /bots
    /strategies.ts
    /fish.ts
    /regular.ts
    /shark.ts
    /pro.ts
  /utils
    /cards.ts
    /chips.ts

/hooks
  /useGameState.ts
  /useTableChannel.ts
  /usePlayerActions.ts
  /useTimer.ts

/types
  /game.ts
  /player.ts
  /table.ts
```

---

## Blind Levels

| Level | Small Blind | Big Blind | Min Buy-in | Max Buy-in |
|-------|-------------|-----------|------------|------------|
| 1     | 10          | 20        | 400        | 2,000      |
| 2     | 25          | 50        | 1,000      | 5,000      |
| 3     | 50          | 100       | 2,000      | 10,000     |
| 4     | 100         | 200       | 4,000      | 20,000     |
| 5     | 250         | 500       | 10,000     | 50,000     |
| 6     | 500         | 1,000     | 20,000     | 100,000    |
| 7     | 1,000       | 2,000     | 40,000     | 200,000    |
| 8     | 2,500       | 5,000     | 100,000    | 500,000    |
| 9     | 5,000       | 10,000    | 200,000    | 1,000,000  |
| 10    | 10,000      | 20,000    | 400,000    | 2,000,000  |

---

## Implementation Order

1. **Setup** - Next.js project, Tailwind, Supabase connection
2. **Auth** - Login, signup, guest mode
3. **Database** - Create tables, RLS policies
4. **Lobby UI** - Table list, create table
5. **Table UI** - Static table layout, player positions
6. **Game Engine** - Deck, evaluator, state machine
7. **Real-time** - Supabase channels, game sync
8. **Betting** - Action buttons, pot calculation
9. **Bots** - Fish bot first, then others
10. **Polish** - Animations, sounds, mobile optimization
11. **Deploy** - Vercel deployment, custom domains

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | 🚧 In Progress | Setup & Foundation |
| Phase 2 | ⏳ Pending | Game Engine |
| Phase 3 | ⏳ Pending | Real-time |
| Phase 4 | ⏳ Pending | Bots |
| Phase 5 | ⏳ Pending | UI/UX |
| Phase 6 | ⏳ Pending | Polish |

---

*Last Updated: 2026-02-16*
