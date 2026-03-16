-- ============================================================
-- PokerApp Database Schema
-- Supabase / PostgreSQL
-- All tables prefixed with poker_ to avoid conflicts
-- ============================================================

-- ============================================================
-- POKER_PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE poker_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  chips BIGINT DEFAULT 10000 CHECK (chips >= 0),
  total_hands_played INT DEFAULT 0,
  total_winnings BIGINT DEFAULT 0,
  is_admin BOOLEAN DEFAULT FALSE,
  is_guest BOOLEAN DEFAULT FALSE,
  last_daily_bonus TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION poker_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poker_profiles_updated_at
  BEFORE UPDATE ON poker_profiles
  FOR EACH ROW EXECUTE FUNCTION poker_update_updated_at();

-- ============================================================
-- POKER_TABLES (game rooms)
-- ============================================================
CREATE TABLE poker_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  table_size INT NOT NULL CHECK (table_size IN (2, 6, 9)),
  small_blind BIGINT NOT NULL,
  big_blind BIGINT NOT NULL,
  min_buy_in BIGINT NOT NULL,
  max_buy_in BIGINT NOT NULL,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  current_players INT DEFAULT 0 CHECK (current_players >= 0),
  created_by UUID REFERENCES poker_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POKER_SEATS (players currently at a table)
-- ============================================================
CREATE TABLE poker_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  seat_number INT NOT NULL CHECK (seat_number BETWEEN 1 AND 9),
  player_id UUID REFERENCES poker_profiles(id) ON DELETE SET NULL,
  stack BIGINT DEFAULT 0 CHECK (stack >= 0),
  is_sitting_out BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_id, seat_number)
);

-- Keep current_players count in sync with seats
CREATE OR REPLACE FUNCTION poker_sync_table_player_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poker_tables
  SET current_players = (
    SELECT COUNT(*) FROM poker_seats
    WHERE table_id = COALESCE(NEW.table_id, OLD.table_id)
      AND player_id IS NOT NULL
  )
  WHERE id = COALESCE(NEW.table_id, OLD.table_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poker_seats_count_insert
  AFTER INSERT OR UPDATE ON poker_seats
  FOR EACH ROW EXECUTE FUNCTION poker_sync_table_player_count();

CREATE TRIGGER poker_seats_count_delete
  AFTER DELETE ON poker_seats
  FOR EACH ROW EXECUTE FUNCTION poker_sync_table_player_count();

-- ============================================================
-- POKER_HANDS (game history)
-- ============================================================
CREATE TABLE poker_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  hand_number INT NOT NULL,
  community_cards TEXT[] DEFAULT '{}',
  pot_size BIGINT DEFAULT 0,
  winners JSONB,
  stage TEXT NOT NULL DEFAULT 'preflop'
    CHECK (stage IN ('preflop','flop','turn','river','showdown','complete')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- POKER_PLAYER_HANDS (hole cards per player per hand)
-- ============================================================
CREATE TABLE poker_player_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id UUID NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES poker_profiles(id) ON DELETE CASCADE,
  hole_cards TEXT[] DEFAULT '{}',
  bet BIGINT DEFAULT 0,
  is_folded BOOLEAN DEFAULT FALSE,
  final_stack BIGINT,
  UNIQUE(hand_id, player_id)
);

-- ============================================================
-- POKER_HAND_ACTIONS (betting log)
-- ============================================================
CREATE TABLE poker_hand_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id UUID NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES poker_profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('fold','check','call','bet','raise','all_in')),
  amount BIGINT DEFAULT 0,
  betting_round TEXT NOT NULL
    CHECK (betting_round IN ('preflop','flop','turn','river')),
  action_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POKER_DAILY_BONUSES
-- ============================================================
CREATE TABLE poker_daily_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES poker_profiles(id) ON DELETE CASCADE,
  bonus_amount BIGINT NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POKER_CHIP_GRANTS (admin)
-- ============================================================
CREATE TABLE poker_chip_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES poker_profiles(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES poker_profiles(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  reason TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE poker_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_tables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_seats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_hands         ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_player_hands  ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_hand_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_daily_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_chip_grants   ENABLE ROW LEVEL SECURITY;

-- ---- poker_profiles ----
CREATE POLICY "poker_profiles_select_all" ON poker_profiles
  FOR SELECT USING (true);

CREATE POLICY "poker_profiles_update_own" ON poker_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "poker_profiles_insert_own" ON poker_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ---- poker_tables ----
CREATE POLICY "poker_tables_select_all" ON poker_tables
  FOR SELECT USING (true);

CREATE POLICY "poker_tables_insert_auth" ON poker_tables
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "poker_tables_update_creator" ON poker_tables
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "poker_tables_delete_creator" ON poker_tables
  FOR DELETE USING (auth.uid() = created_by);

-- ---- poker_seats ----
CREATE POLICY "poker_seats_select_all" ON poker_seats
  FOR SELECT USING (true);

CREATE POLICY "poker_seats_insert_own" ON poker_seats
  FOR INSERT WITH CHECK (auth.uid() = player_id);

CREATE POLICY "poker_seats_update_own" ON poker_seats
  FOR UPDATE USING (auth.uid() = player_id);

CREATE POLICY "poker_seats_delete_own" ON poker_seats
  FOR DELETE USING (auth.uid() = player_id);

-- ---- poker_hands ----
CREATE POLICY "poker_hands_select_all" ON poker_hands
  FOR SELECT USING (true);

-- ---- poker_player_hands ----
CREATE POLICY "poker_player_hands_select" ON poker_player_hands
  FOR SELECT USING (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM poker_hands h
      WHERE h.id = poker_player_hands.hand_id
        AND h.stage IN ('showdown', 'complete')
    )
  );

-- ---- poker_hand_actions ----
CREATE POLICY "poker_hand_actions_select_all" ON poker_hand_actions
  FOR SELECT USING (true);

-- ---- poker_daily_bonuses ----
CREATE POLICY "poker_daily_bonuses_select_own" ON poker_daily_bonuses
  FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "poker_daily_bonuses_insert_own" ON poker_daily_bonuses
  FOR INSERT WITH CHECK (auth.uid() = player_id);

-- ---- poker_chip_grants ----
CREATE POLICY "poker_chip_grants_select_admin" ON poker_chip_grants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM poker_profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

CREATE POLICY "poker_chip_grants_insert_admin" ON poker_chip_grants
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM poker_profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION poker_handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  guest_username TEXT;
BEGIN
  -- Check if this signup is for poker app (via metadata flag)
  IF NEW.raw_user_meta_data->>'app' = 'poker' THEN
    IF NEW.raw_user_meta_data->>'is_guest' = 'true' THEN
      guest_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        'Guest_' || SUBSTRING(NEW.id::TEXT, 1, 6)
      );
      INSERT INTO poker_profiles (id, username, display_name, is_guest, chips)
      VALUES (
        NEW.id,
        guest_username,
        guest_username,
        TRUE,
        10000
      );
    ELSE
      INSERT INTO poker_profiles (id, username, display_name, chips)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || SUBSTRING(NEW.id::TEXT, 1, 6)),
        COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
        10000
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER poker_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION poker_handle_new_user();

-- ============================================================
-- DAILY BONUS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION poker_claim_daily_bonus(p_player_id UUID)
RETURNS BIGINT AS $$
DECLARE
  last_bonus TIMESTAMPTZ;
  bonus_amount BIGINT := 1000;
BEGIN
  SELECT last_daily_bonus INTO last_bonus FROM poker_profiles WHERE id = p_player_id;

  IF last_bonus IS NOT NULL AND last_bonus > NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'Daily bonus already claimed. Try again in % hours.',
      EXTRACT(EPOCH FROM (last_bonus + INTERVAL '24 hours' - NOW())) / 3600;
  END IF;

  UPDATE poker_profiles
  SET chips = chips + bonus_amount,
      last_daily_bonus = NOW()
  WHERE id = p_player_id;

  INSERT INTO poker_daily_bonuses (player_id, bonus_amount)
  VALUES (p_player_id, bonus_amount);

  RETURN bonus_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ATOMIC SIT-DOWN FUNCTION (transactional chip deduction + seat assignment)
-- ============================================================
CREATE OR REPLACE FUNCTION poker_sit_player(
  p_table_id UUID,
  p_seat_number INT,
  p_buy_in BIGINT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_chips BIGINT;
  v_existing_seat UUID;
  v_seat_player UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT chips
  INTO v_chips
  FROM poker_profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_chips IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_chips < p_buy_in THEN
    RAISE EXCEPTION 'Insufficient chips';
  END IF;

  SELECT id
  INTO v_existing_seat
  FROM poker_seats
  WHERE table_id = p_table_id
    AND player_id = v_user_id
  LIMIT 1;

  IF v_existing_seat IS NOT NULL THEN
    RAISE EXCEPTION 'Already seated at this table';
  END IF;

  SELECT player_id
  INTO v_seat_player
  FROM poker_seats
  WHERE table_id = p_table_id
    AND seat_number = p_seat_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seat not found';
  END IF;

  IF v_seat_player IS NOT NULL THEN
    RAISE EXCEPTION 'Seat is taken';
  END IF;

  UPDATE poker_profiles
  SET chips = chips - p_buy_in
  WHERE id = v_user_id;

  UPDATE poker_seats
  SET player_id = v_user_id,
      stack = p_buy_in,
      is_sitting_out = FALSE
  WHERE table_id = p_table_id
    AND seat_number = p_seat_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION poker_sit_player(UUID, INT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poker_sit_player(UUID, INT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION poker_sit_player(UUID, INT, BIGINT) TO service_role;

-- ============================================================
-- ATOMIC STAND-UP FUNCTION (transactional chip return + seat clear)
-- ============================================================
CREATE OR REPLACE FUNCTION poker_stand_player(
  p_table_id UUID
)
RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_seat_id UUID;
  v_stack BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock and fetch the player's seat
  SELECT id, stack
  INTO v_seat_id, v_stack
  FROM poker_seats
  WHERE table_id = p_table_id
    AND player_id = v_user_id
  FOR UPDATE;

  IF v_seat_id IS NULL THEN
    RAISE EXCEPTION 'Not seated at this table';
  END IF;

  -- Return chips to profile atomically
  UPDATE poker_profiles
  SET chips = chips + v_stack
  WHERE id = v_user_id;

  -- Clear the seat
  UPDATE poker_seats
  SET player_id = NULL,
      stack = 0,
      is_sitting_out = FALSE
  WHERE id = v_seat_id;

  RETURN v_stack;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION poker_stand_player(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION poker_stand_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION poker_stand_player(UUID) TO service_role;

-- ============================================================
-- USEFUL INDEXES
-- ============================================================
CREATE INDEX idx_poker_seats_table_id ON poker_seats(table_id);
CREATE INDEX idx_poker_seats_player_id ON poker_seats(player_id);
CREATE INDEX idx_poker_hands_table_id ON poker_hands(table_id);
CREATE INDEX idx_poker_player_hands_hand_id ON poker_player_hands(hand_id);
CREATE INDEX idx_poker_player_hands_player_id ON poker_player_hands(player_id);
CREATE INDEX idx_poker_hand_actions_hand_id ON poker_hand_actions(hand_id);
CREATE INDEX idx_poker_hand_actions_player_id ON poker_hand_actions(player_id);

-- ============================================================
-- ENABLE REALTIME on key tables (run separately if needed)
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE poker_tables, poker_seats, poker_hands, poker_hand_actions;
