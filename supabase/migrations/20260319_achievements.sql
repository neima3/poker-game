-- Achievement System Migration
-- Creates tables for server-side achievement tracking with rarity computation

-- Achievement definitions table (mirrors lib/achievements.ts ACHIEVEMENTS array)
CREATE TABLE IF NOT EXISTS poker_achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hands', 'winning', 'social', 'skill', 'milestone')),
  points INTEGER NOT NULL DEFAULT 10,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  secret BOOLEAN NOT NULL DEFAULT FALSE,
  stat_key TEXT NOT NULL,
  requirement INTEGER NOT NULL,
  chip_reward INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player achievement unlock records
CREATE TABLE IF NOT EXISTS poker_player_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES poker_achievements(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER NOT NULL DEFAULT 0,
  UNIQUE(player_id, achievement_id)
);

-- Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_player_achievements_player_id
  ON poker_player_achievements(player_id);

CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement_id
  ON poker_player_achievements(achievement_id);

-- View: player achievement points totals (used by leaderboard)
CREATE OR REPLACE VIEW poker_achievement_leaderboard AS
SELECT
  p.id AS player_id,
  p.username,
  COALESCE(SUM(a.points), 0)::INTEGER AS achievement_points,
  COUNT(pa.achievement_id)::INTEGER AS achievements_unlocked
FROM poker_profiles p
LEFT JOIN poker_player_achievements pa ON p.id = pa.player_id
LEFT JOIN poker_achievements a ON pa.achievement_id = a.id
WHERE p.is_guest = FALSE
GROUP BY p.id, p.username;

-- Seed achievement definitions (matches lib/achievements.ts)
INSERT INTO poker_achievements (id, name, description, icon, category, points, rarity, secret, stat_key, requirement, chip_reward, xp_reward) VALUES
  -- Hands played
  ('first_hand', 'Rookie', 'Play your first hand', '🃏', 'hands', 10, 'common', FALSE, 'handsPlayed', 1, 100, 20),
  ('hands_50', 'Regular', 'Play 50 hands', '🎰', 'hands', 10, 'common', FALSE, 'handsPlayed', 50, 500, 50),
  ('hands_200', 'Grinder', 'Play 200 hands', '⚙️', 'hands', 25, 'rare', FALSE, 'handsPlayed', 200, 2000, 150),
  ('hands_500', 'Iron Player', 'Play 500 hands', '🏗️', 'hands', 50, 'epic', FALSE, 'handsPlayed', 500, 5000, 300),
  ('hands_1000', 'Marathon Runner', 'Play 1,000 hands', '🏃', 'hands', 100, 'legendary', FALSE, 'handsPlayed', 1000, 10000, 500),
  ('hands_5000', 'Poker Machine', 'Play 5,000 hands', '🤖', 'hands', 100, 'legendary', FALSE, 'handsPlayed', 5000, 50000, 1000),
  -- Wins
  ('first_win', 'Winner Winner', 'Win your first hand', '🏆', 'winning', 10, 'common', FALSE, 'handsWon', 1, 200, 30),
  ('wins_25', 'On a Roll', 'Win 25 hands', '🎲', 'winning', 10, 'common', FALSE, 'handsWon', 25, 1000, 100),
  ('wins_100', 'Centurion', 'Win 100 hands', '💯', 'winning', 25, 'rare', FALSE, 'handsWon', 100, 5000, 250),
  ('wins_500', 'Card Shark', 'Win 500 hands', '🦈', 'winning', 50, 'epic', FALSE, 'handsWon', 500, 15000, 600),
  ('wins_1000', 'Shark King', 'Win 1,000 hands', '👑', 'winning', 100, 'legendary', FALSE, 'handsWon', 1000, 50000, 1000),
  -- Streaks
  ('streak_3', 'Hot Hand', 'Get a 3-win streak', '🔥', 'skill', 10, 'common', FALSE, 'bestStreak', 3, 300, 40),
  ('streak_5', 'Heater', 'Get a 5-win streak', '♨️', 'skill', 25, 'rare', FALSE, 'bestStreak', 5, 1000, 100),
  ('streak_10', 'Unstoppable Force', 'Get a 10-win streak', '⚡', 'skill', 50, 'epic', FALSE, 'bestStreak', 10, 5000, 300),
  ('streak_20', 'Deity of the Felt', 'Get a 20-win streak', '🌩️', 'skill', 100, 'legendary', FALSE, 'bestStreak', 20, 25000, 750),
  -- Big pots
  ('big_pot_1k', 'High Roller', 'Win a pot over 1,000 chips', '💰', 'milestone', 10, 'common', FALSE, 'biggestPotWon', 1000, 500, 50),
  ('big_pot_10k', 'Whale', 'Win a pot over 10,000 chips', '🐋', 'milestone', 25, 'rare', FALSE, 'biggestPotWon', 10000, 2000, 150),
  ('big_pot_50k', 'Legendary Pot', 'Win a pot over 50,000 chips', '🌊', 'milestone', 50, 'epic', FALSE, 'biggestPotWon', 50000, 10000, 500),
  ('big_pot_100k', 'The Kraken', 'Win a pot over 100,000 chips', '🦑', 'milestone', 100, 'legendary', FALSE, 'biggestPotWon', 100000, 25000, 1000),
  -- Showdowns
  ('showdown_10', 'Showdown Master', 'Win 10 showdowns', '🎯', 'skill', 10, 'common', FALSE, 'showdownWins', 10, 1000, 80),
  ('showdown_50', 'Card Reader', 'Win 50 showdowns', '🔮', 'skill', 25, 'rare', FALSE, 'showdownWins', 50, 5000, 250),
  ('showdown_100', 'Oracle', 'Win 100 showdowns', '🧿', 'skill', 50, 'epic', FALSE, 'showdownWins', 100, 15000, 500),
  -- All-ins
  ('allin_win_5', 'Gambler', 'Win 5 all-in hands', '🎰', 'skill', 10, 'common', FALSE, 'allInWins', 5, 1000, 80),
  ('allin_win_25', 'Fearless', 'Win 25 all-in hands', '💪', 'skill', 25, 'rare', FALSE, 'allInWins', 25, 5000, 250),
  ('allin_win_50', 'All-In Legend', 'Win 50 all-in hands', '🎖️', 'skill', 50, 'epic', FALSE, 'allInWins', 50, 15000, 500),
  -- Social
  ('daily_5', 'Dedicated', 'Claim daily bonus 5 times', '📅', 'social', 10, 'common', FALSE, 'dailyBonusClaims', 5, 1000, 50),
  ('daily_30', 'Loyal Player', 'Claim daily bonus 30 times', '🌟', 'social', 25, 'rare', FALSE, 'dailyBonusClaims', 30, 5000, 200),
  ('daily_100', 'True Devotee', 'Claim daily bonus 100 times', '💎', 'social', 50, 'epic', FALSE, 'dailyBonusClaims', 100, 20000, 500),
  -- Chip milestones
  ('total_won_100k', 'Six Figures', 'Win 100,000 chips total', '💵', 'milestone', 25, 'rare', FALSE, 'totalChipsWon', 100000, 5000, 200),
  ('total_won_1m', 'Millionaire', 'Win 1,000,000 chips total', '🏦', 'milestone', 100, 'legendary', FALSE, 'totalChipsWon', 1000000, 50000, 1000),
  -- Secret
  ('royal_flush', 'Royal Flush!', 'Win with a Royal Flush', '👑', 'milestone', 100, 'legendary', TRUE, 'royalFlushes', 1, 25000, 1000),
  ('comeback', 'Comeback Kid', 'Win after being down to less than 1 big blind', '🦅', 'milestone', 50, 'epic', TRUE, 'comebacks', 1, 5000, 200),
  ('bad_beat_survivor', 'Bad Beat Survivor', 'Win 10 hands you were behind on the flop', '🪄', 'skill', 50, 'epic', TRUE, 'badBeatWins', 10, 10000, 400)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  rarity = EXCLUDED.rarity,
  chip_reward = EXCLUDED.chip_reward,
  xp_reward = EXCLUDED.xp_reward;

-- Enable Row Level Security
ALTER TABLE poker_player_achievements ENABLE ROW LEVEL SECURITY;

-- Players can only see their own achievement records
CREATE POLICY "Players see own achievements"
  ON poker_player_achievements FOR SELECT
  USING (auth.uid() = player_id);

-- Players can insert their own achievements (server-side API validates)
CREATE POLICY "Players insert own achievements"
  ON poker_player_achievements FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- Achievement definitions are public read
ALTER TABLE poker_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements are public"
  ON poker_achievements FOR SELECT
  TO authenticated
  USING (TRUE);
