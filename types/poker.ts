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

// ─── Game Mode ────────────────────────────────────────────────────────────────
export type GameMode = 'classic' | 'allin_or_fold' | 'fast_fold' | 'bounty';

// ─── Ante & Straddle ──────────────────────────────────────────────────────────
/** How antes are collected each hand. 'table' = every player posts; 'big_blind' = BB posts for the table */
export type AnteType = 'none' | 'table' | 'big_blind';
/** Straddle variant. 'utg' = player after BB acts last preflop; 'button' = dealer posts, acts last */
export type StraddleType = 'none' | 'utg' | 'button';

// ─── Tournament Types ────────────────────────────────────────────────────────
export type TournamentStatus = 'registering' | 'running' | 'finished' | 'cancelled';
export type BlindSpeed = 'turbo' | 'standard' | 'deep' | 'super-deep';

export interface TournamentBlindLevel {
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
}

export interface TournamentConfig {
  id: string;
  name: string;
  buyIn: number;
  startingStack: number;
  maxPlayers: number;
  blindLevels: TournamentBlindLevel[];
  payoutStructure: number[]; // percentages, e.g. [50, 30, 20]
  lateRegistrationLevels: number; // how many blind levels allow late reg
}

export interface TournamentPlayer {
  playerId: string;
  username: string;
  avatarUrl?: string;
  stack: number;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  finishPosition?: number;
  eliminatedAt?: number;
  bounty?: number; // for bounty mode
  bountiesCollected?: number;
}

export interface TournamentState {
  config: TournamentConfig;
  status: TournamentStatus;
  players: TournamentPlayer[];
  currentBlindLevel: number;
  blindLevelStartedAt: number;
  prizePool: number;
  startedAt?: number;
  finishedAt?: number;
  gameMode: 'classic' | 'bounty';
}

// ─── Multi-Table Tournament (MTT) Types ─────────────────────────────────────
export type TournamentFormat = 'freezeout' | 'rebuy';

export interface MTTConfig extends TournamentConfig {
  tableSize: number;         // max players per table (typically 9)
  format: TournamentFormat;
  rebuyLevels: number;       // blind levels during which rebuys are allowed (0 for freezeout)
  rebuyMaxCount: number;     // max rebuys per player (0 for freezeout)
  rebuyCost: number;         // cost of a rebuy (usually same as buyIn)
  rebuyStack: number;        // chips received on rebuy (usually same as startingStack)
}

export interface MTTTable {
  tableId: string;
  tableNumber: number;       // 1-indexed display number
  playerIds: string[];       // player IDs seated at this table
  dealerSeat: number;        // tracks dealer rotation per table
  handInProgress: boolean;
}

export interface MTTPlayerInfo extends TournamentPlayer {
  tableId: string;           // current table assignment
  seatNumber: number;        // seat at current table
  rebuysUsed: number;
}

export interface MTTState {
  id: string;
  config: MTTConfig;
  status: TournamentStatus;
  players: MTTPlayerInfo[];
  tables: MTTTable[];
  currentBlindLevel: number;
  blindLevelStartedAt: number;
  prizePool: number;
  startedAt?: number;
  finishedAt?: number;
  gameMode: 'classic' | 'bounty';
  isFinalTable: boolean;
  totalRebuys: number;
  rebuyDeadlineLevel: number; // blind level after which rebuys close
}

// ─── Bounty Mode ─────────────────────────────────────────────────────────────
export interface BountyInfo {
  playerId: string;
  bountyAmount: number;
  bountiesCollected: number;
  totalBountyWon: number;
}

// ─── Run It Twice ─────────────────────────────────────────────────────────────
export interface RunItTwiceResult {
  sharedBoard: Card[];  // community cards that existed before the all-in runout
  board1: Card[];       // full 5-card board for run 1
  board2: Card[];       // full 5-card board for run 2
  winners1: Winner[];   // winners from run 1 (half pot)
  winners2: Winner[];   // winners from run 2 (half pot)
}

// ─── Action Log (for hand replay) ────────────────────────────────────────────
export interface ActionLogEntry {
  playerId: string;
  username: string;
  seatNumber: number;
  action: ActionType;
  amount?: number;
  phase: GamePhase;
  pot: number;
  communityCards: Card[];
  playerStack: number;     // Stack AFTER the action
}

// ─── Hand Replay Data ────────────────────────────────────────────────────────
export interface HandReplayData {
  players: {
    playerId: string;
    username: string;
    seatNumber: number;
    startingStack: number;
    holeCards?: Card[];
    isBot?: boolean;
  }[];
  actionLog: ActionLogEntry[];
  communityCards: Card[];
  pot: number;
  winners: Winner[];
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  ritResult?: RunItTwiceResult;
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
  gameMode?: GameMode;
  phase: GamePhase;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  currentBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;            // Ante amount per player (if any)
  anteType?: AnteType;      // How antes are collected
  straddleType?: StraddleType; // Which straddle variant is active
  straddleSeat?: number;    // Seat number of the straddler (computed)
  dealerSeat: number;
  activeSeat: number;       // Current player's seat
  smallBlindSeat: number;
  bigBlindSeat: number;
  players: PlayerState[];
  deck: Card[];             // Remaining deck (server-side only)
  actionDeadline?: number;  // Unix timestamp
  winners?: Winner[];
  lastAction?: { playerId: string; action: ActionType; amount?: number };
  actionLog?: ActionLogEntry[]; // Full action history for replay
  runItTwice?: boolean;     // Whether to deal remaining cards twice when all-in
  ritResult?: RunItTwiceResult; // Set after a run-it-twice resolution
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
  ante: number;
  ante_type: AnteType;
  straddle_type: StraddleType;
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
