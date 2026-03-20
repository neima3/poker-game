-- Add straddle and ante options to poker_tables
-- Supports: table ante, big-blind ante, UTG straddle, button straddle

ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS ante BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ante_type TEXT NOT NULL DEFAULT 'none'
    CHECK (ante_type IN ('none', 'table', 'big_blind')),
  ADD COLUMN IF NOT EXISTS straddle_type TEXT NOT NULL DEFAULT 'none'
    CHECK (straddle_type IN ('none', 'utg', 'button'));
