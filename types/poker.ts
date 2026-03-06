// ─── Card Types ─────────────────────────────────────────────────────────────
export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = string; // e.g. 'Ah', 'Kd', 'Tc'

// ─── Hand Rankings ───────────────────────────────────────────────────────────
export type HandRankName =
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

export interface HandResult {
  rank: number;          // 0-9
  name: HandRankName;
  cards: Card[];         // Best 5 cards
  score: number[];       // Numeric comparison array
}

// ─── Game Phase ───────────────────────────────────────────────────────────────
export type GamePhase =
  | 'waiting'
  | 'starting'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'pot_awarded';

// ─── Player Actions ───────────────────────────────────────────────────────────
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface PlayerAction {
  type: ActionType;
  amount?: number;
}

// ─── Bot ──────────────────────────────────────────────────────────────────────
export type BotDifficulty = 'fish' | 'regular' | 'shark' | 'pro';

// ─── Player State ─────────────────────────────────────────────────────────────
export interface PlayerState {
  playerId: string;
  username: string;
  avatarUrl?: string;
  seatNumber: number;
  stack: number;
  currentBet: number;    // Amount bet in current round
  totalInPot: number;    // Total chips in pot this hand
  cards?: Card[];        // Hole cards (only visible to owner / at showdown)
  isFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  isConnected: boolean;
  lastAction?: ActionType;
  hasActedThisStreet?: boolean;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

// ─── Side Pot ─────────────────────────────────────────────────────────────────
export interface SidePot {
  amount: number;
  eligiblePlayers: string[]; // playerIds
}

// ─── Game State ───────────────────────────────────────────────────────────────
export interface GameState {
  tableId: string;
  handId?: string;
  phase: GamePhase;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  currentBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  activeSeat: number;       // Current player's seat
  smallBlindSeat: number;
  bigBlindSeat: number;
  players: PlayerState[];
  deck: Card[];             // Remaining deck (server-side only)
  actionDeadline?: number;  // Unix timestamp
  winners?: Winner[];
  lastAction?: { playerId: string; action: ActionType; amount?: number };
}

export interface Winner {
  playerId: string;
  username: string;
  amount: number;
  handName?: string;
  cards?: Card[];
}

// ─── Table Info (from DB) ─────────────────────────────────────────────────────
export interface TableRow {
  id: string;
  name: string;
  table_size: number;
  small_blind: number;
  big_blind: number;
  min_buy_in: number;
  max_buy_in: number;
  is_active: boolean;
  current_players: number;
  created_by: string;
  created_at: string;
}

export interface SeatRow {
  id: string;
  table_id: string;
  seat_number: number;
  player_id: string | null;
  stack: number;
  is_sitting_out: boolean;
  joined_at: string;
  poker_profiles?: {
    username: string;
    avatar_url?: string;
  };
}

// ─── Broadcast Events ─────────────────────────────────────────────────────────
export interface GameStateBroadcast {
  type: 'game_state';
  state: Omit<GameState, 'deck'>; // Never send deck to clients
}

export interface PrivateCardsBroadcast {
  type: 'private_cards';
  playerId: string;
  cards: Card[];
}

export type BroadcastEvent = GameStateBroadcast | PrivateCardsBroadcast;
