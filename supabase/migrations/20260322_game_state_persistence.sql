-- Migration: Persist in-progress game state to DB for deploy/restart resilience
-- Date: 2026-03-22
--
-- Stores the live GameState JSON for each active table so that server restarts,
-- Vercel cold starts on new instances, and deploys do not wipe mid-hand progress.

-- ============================================================
-- POKER_GAME_STATES (live game state cache)
-- ============================================================
CREATE TABLE poker_game_states (
  table_id       UUID PRIMARY KEY REFERENCES poker_tables(id) ON DELETE CASCADE,
  state          JSONB NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every write
CREATE TRIGGER poker_game_states_updated_at
  BEFORE UPDATE ON poker_game_states
  FOR EACH ROW EXECUTE FUNCTION poker_update_updated_at();

-- Only accessible via service role key; no direct client reads/writes
ALTER TABLE poker_game_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poker_game_states_no_public_access" ON poker_game_states
  USING (false);

-- Index for TTL expiry queries (cleanup of games idle > 24 h)
CREATE INDEX idx_poker_game_states_last_active ON poker_game_states(last_active_at);
