import { NextResponse } from 'next/server';
import { getActiveSessionCount } from '@/lib/poker/fast-fold';

// GET /api/fast-fold/pool — returns active fast fold pool stats
// Used by the lobby to display live player count.
export async function GET() {
  const activeSessions = getActiveSessionCount();

  // Add a realistic-looking base to simulate a shared pool environment
  // (bots + other virtual sessions to make the pool feel alive)
  const virtualPlayers = 12 + Math.floor(Math.random() * 8); // 12-19 virtual pool members
  const displayCount = activeSessions * 6 + virtualPlayers; // 6-max tables

  return NextResponse.json({
    activeSessions,
    playersInPool: displayCount,
    tablesRunning: Math.max(2, Math.ceil(displayCount / 6)),
  });
}
