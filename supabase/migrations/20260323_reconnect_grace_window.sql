-- Migration: Reconnect grace window with automatic seat reclaim
-- Date: 2026-03-23
--
-- Adds connection tracking to poker_seats to support a grace period for
-- brief disconnects. Players who disconnect keep their seat for a configurable
-- grace period before being auto-sat-out.

-- ============================================================
-- Add connection tracking columns to POKER_SEATS
-- ============================================================
ALTER TABLE poker_seats
  ADD COLUMN IF NOT EXISTS is_connected BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- Index for efficient grace period expiry queries
CREATE INDEX IF NOT EXISTS idx_poker_seats_disconnected_at
  ON poker_seats(disconnected_at)
  WHERE is_connected = FALSE AND player_id IS NOT NULL;

-- ============================================================
-- Add grace period config to POKER_TABLES
-- ============================================================
ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS reconnect_grace_seconds INTEGER NOT NULL DEFAULT 30;

-- ============================================================
-- Helper function to mark player disconnected
-- ============================================================
CREATE OR REPLACE FUNCTION poker_mark_player_disconnected(
  p_table_id UUID,
  p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE poker_seats
  SET is_connected = FALSE,
      disconnected_at = NOW()
  WHERE table_id = p_table_id
    AND player_id = p_player_id;
END;
$$;

-- ============================================================
-- Helper function to mark player reconnected
-- ============================================================
CREATE OR REPLACE FUNCTION poker_mark_player_connected(
  p_table_id UUID,
  p_player_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE poker_seats
  SET is_connected = TRUE,
      disconnected_at = NULL
  WHERE table_id = p_table_id
    AND player_id = p_player_id;
END;
$$;

-- ============================================================
-- Function to get players past grace period (for cleanup job)
-- ============================================================
CREATE OR REPLACE FUNCTION poker_get_expired_disconnected_players(
  p_table_id UUID
)
RETURNS TABLE (
  player_id UUID,
  seat_number INTEGER,
  disconnected_seconds INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_grace_seconds INTEGER;
BEGIN
  SELECT reconnect_grace_seconds INTO v_grace_seconds
  FROM poker_tables
  WHERE id = p_table_id;

  RETURN QUERY
  SELECT
    ps.player_id,
    ps.seat_number,
    EXTRACT(EPOCH FROM (NOW() - ps.disconnected_at))::INTEGER
  FROM poker_seats ps
  WHERE ps.table_id = p_table_id
    AND ps.is_connected = FALSE
    AND ps.disconnected_at IS NOT NULL
    AND ps.player_id IS NOT NULL
    AND EXTRACT(EPOCH FROM (NOW() - ps.disconnected_at))::INTEGER > v_grace_seconds;
END;
$$;

-- Grant service role access to new functions
GRANT EXECUTE ON FUNCTION poker_mark_player_disconnected(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION poker_mark_player_connected(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION poker_get_expired_disconnected_players(UUID) TO service_role;
