import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/stats — player analytics data for charts
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all hands the player participated in, joined with hand details
  const { data: playerHands, error: phError } = await supabase
    .from('poker_player_hands')
    .select(`
      hand_id,
      hole_cards,
      bet,
      is_folded,
      final_stack,
      poker_hands (
        id,
        table_id,
        hand_number,
        community_cards,
        pot_size,
        winners,
        stage,
        started_at,
        ended_at
      )
    `)
    .eq('player_id', user.id)
    .order('hand_id', { ascending: true });

  if (phError) {
    return NextResponse.json({ error: phError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getHand(ph: any): Record<string, unknown> | null {
    const h = ph.poker_hands;
    if (!h) return null;
    return Array.isArray(h) ? h[0] ?? null : h;
  }

  // Fetch table info for stakes mapping
  const tableIds = [
    ...new Set(
      (playerHands ?? [])
        .map((ph) => {
          const hand = getHand(ph);
          return hand?.table_id as string | undefined;
        })
        .filter(Boolean)
    ),
  ];

  let tablesMap: Record<string, { small_blind: number; big_blind: number; name: string }> = {};
  if (tableIds.length > 0) {
    const { data: tables } = await supabase
      .from('poker_tables')
      .select('id, small_blind, big_blind, name')
      .in('id', tableIds);

    if (tables) {
      for (const t of tables) {
        tablesMap[t.id] = {
          small_blind: Number(t.small_blind),
          big_blind: Number(t.big_blind),
          name: t.name,
        };
      }
    }
  }

  // Fetch player actions for position and showdown data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handIds = (playerHands ?? []).map((ph: any) => ph.hand_id as string);

  let actionsMap: Record<string, Array<{ player_id: string; action_type: string; betting_round: string }>> = {};
  if (handIds.length > 0) {
    const { data: actions } = await supabase
      .from('poker_hand_actions')
      .select('hand_id, player_id, action_type, betting_round')
      .in('hand_id', handIds);

    if (actions) {
      for (const a of actions) {
        if (!actionsMap[a.hand_id]) actionsMap[a.hand_id] = [];
        actionsMap[a.hand_id].push(a);
      }
    }
  }

  // Process data
  type WinnerEntry = { playerId: string; amount: number };

  // Win rate over time (rolling window of 10 hands)
  const winRateOverTime: Array<{ hand: number; winRate: number; date: string }> = [];
  let totalWins = 0;

  for (let i = 0; i < (playerHands ?? []).length; i++) {
    const ph = playerHands![i];
    const hand = getHand(ph);
    const winners = ((hand?.winners ?? []) as unknown as WinnerEntry[]);
    const isWin = winners.some((w) => w.playerId === user.id);
    if (isWin) totalWins++;

    const winRate = Math.round((totalWins / (i + 1)) * 100);
    winRateOverTime.push({
      hand: i + 1,
      winRate,
      date: (hand?.ended_at as string) ?? (hand?.started_at as string) ?? '',
    });
  }

  // Position profitability (derive position from action order)
  const positionStats: Record<string, { label: string; profit: number; hands: number }> = {
    early: { label: 'Early (UTG)', profit: 0, hands: 0 },
    middle: { label: 'Middle', profit: 0, hands: 0 },
    late: { label: 'Late (CO/BTN)', profit: 0, hands: 0 },
    blinds: { label: 'Blinds (SB/BB)', profit: 0, hands: 0 },
  };

  for (const ph of playerHands ?? []) {
    const hand = getHand(ph);
    if (!hand) continue;

    const handId = ph.hand_id as string;
    const tableId = hand.table_id as string;
    const table = tablesMap[tableId];
    const winners = ((hand.winners ?? []) as unknown as WinnerEntry[]);
    const winAmount = winners
      .filter((w) => w.playerId === user.id)
      .reduce((sum, w) => sum + (w.amount ?? 0), 0);
    const betAmount = Number(ph.bet) || 0;
    const profit = winAmount - betAmount;

    // Estimate position from preflop action ordering
    const handActions = actionsMap[handId] ?? [];
    const preflopActions = handActions.filter((a) => a.betting_round === 'preflop');
    const playerOrder = preflopActions.findIndex((a) => a.player_id === user.id);
    const totalPlayers = new Set(preflopActions.map((a) => a.player_id)).size;

    let position: string;
    if (totalPlayers <= 2) {
      position = 'blinds';
    } else if (playerOrder <= 0) {
      position = 'blinds';
    } else if (playerOrder <= Math.floor(totalPlayers * 0.33)) {
      position = 'early';
    } else if (playerOrder <= Math.floor(totalPlayers * 0.66)) {
      position = 'middle';
    } else {
      position = 'late';
    }

    positionStats[position].profit += profit;
    positionStats[position].hands++;
  }

  // Showdown frequency
  let showdownCount = 0;
  let foldCount = 0;
  let noShowdownWins = 0;
  const totalHands = (playerHands ?? []).length;

  for (const ph of playerHands ?? []) {
    const hand = getHand(ph);
    const stage = hand?.stage as string;
    const isFolded = ph.is_folded;
    const winners = ((hand?.winners ?? []) as unknown as WinnerEntry[]);
    const isWin = winners.some((w) => w.playerId === user.id);

    if (isFolded) {
      foldCount++;
    } else if (stage === 'showdown' || stage === 'complete') {
      showdownCount++;
    }

    if (isWin && isFolded === false && stage !== 'showdown') {
      noShowdownWins++;
    }
  }

  const showdownData = [
    { name: 'Went to Showdown', value: showdownCount, fill: 'var(--chart-1)' },
    { name: 'Folded', value: foldCount, fill: 'var(--chart-3)' },
    { name: 'Won Without Showdown', value: noShowdownWins, fill: 'var(--chart-2)' },
  ];

  // Biggest pots (top 10)
  const biggestPots = (playerHands ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((ph: any) => {
      const hand = getHand(ph);
      const winners = ((hand?.winners ?? []) as unknown as WinnerEntry[]);
      const isWin = winners.some((w) => w.playerId === user.id);
      const tableId = hand?.table_id as string;
      const table = tablesMap[tableId];

      return {
        potSize: Number(hand?.pot_size ?? 0),
        date: (hand?.ended_at as string) ?? '',
        isWin,
        stakes: table ? `${table.small_blind}/${table.big_blind}` : 'Unknown',
      };
    })
    .sort((a: { potSize: number }, b: { potSize: number }) => b.potSize - a.potSize)
    .slice(0, 10);

  // Stakes breakdown for filtering
  const stakesOptions = [...new Set(
    Object.values(tablesMap).map((t) => `${t.small_blind}/${t.big_blind}`)
  )].sort();

  return NextResponse.json({
    winRateOverTime,
    positionProfitability: Object.values(positionStats),
    showdownData,
    biggestPots,
    stakesOptions,
    totalHands,
  });
}
