'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GameState } from '@/types/poker';
import { RECONNECT_GRACE_PERIOD_MS } from '@/types/poker';

export type ChannelStatus = 'connecting' | 'connected' | 'disconnected';

interface UseTableChannelOptions {
  tableId: string;
  playerId?: string;
  onGameState: (state: Omit<GameState, 'deck'>) => void;
  onPrivateCards?: (cards: string[]) => void;
  onPlayerJoined?: () => void;
  onReconnect?: () => void;
  onConnectionStatusChange?: (updates: ConnectionStatusUpdate[]) => void;
}

export interface ConnectionStatusUpdate {
  playerId: string;
  isConnected: boolean;
  disconnectedAt?: number;
  gracePeriodRemaining?: number;
}

const HEARTBEAT_INTERVAL_MS = 5_000;
// Watchdog: if system:closed fires but the subscribe callback never comes back
// (Supabase internally stuck in its own reconnect loop), force a fresh channel
// after this many ms. Must be long enough to let a normal reconnect succeed.
const WATCHDOG_MS = 12_000;
// Cap the per-retry delay lower than Supabase's own internal retry — 30 s is
// too long to leave a poker player staring at "Reconnecting…".
const MAX_RETRY_DELAY_MS = 10_000;

export function useTableChannel({
  tableId,
  playerId,
  onGameState,
  onPrivateCards,
  onPlayerJoined,
  onReconnect,
  onConnectionStatusChange,
}: UseTableChannelOptions): ChannelStatus {
  const [status, setStatus] = useState<ChannelStatus>('connecting');

  const onGameStateRef = useRef(onGameState);
  const onPrivateCardsRef = useRef(onPrivateCards);
  const onPlayerJoinedRef = useRef(onPlayerJoined);
  const onReconnectRef = useRef(onReconnect);
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange);
  onGameStateRef.current = onGameState;
  onPrivateCardsRef.current = onPrivateCards;
  onPlayerJoinedRef.current = onPlayerJoined;
  onReconnectRef.current = onReconnect;
  onConnectionStatusChangeRef.current = onConnectionStatusChange;

  // Tracks the current active channel so retried channels are also cleaned up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeChannelRef = useRef<any>(null);

  const handlePlayerDisconnected = useCallback((payload: { playerId: string; disconnectedAt?: number }) => {
    if (!onConnectionStatusChangeRef.current) return;
    const disconnectedAt = payload.disconnectedAt ?? Date.now();
    const gracePeriodRemaining = Math.max(0, RECONNECT_GRACE_PERIOD_MS - (Date.now() - disconnectedAt));
    onConnectionStatusChangeRef.current([{
      playerId: payload.playerId,
      isConnected: false,
      disconnectedAt,
      gracePeriodRemaining,
    }]);
  }, []);

  const handlePlayerReconnected = useCallback((payload: { playerId: string }) => {
    if (!onConnectionStatusChangeRef.current) return;
    onConnectionStatusChangeRef.current([{
      playerId: payload.playerId,
      isConnected: true,
    }]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimeout: ReturnType<typeof setTimeout> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    let wasDisconnected = false;

    const sendHeartbeat = async () => {
      if (!playerId || !isMounted) return;
      try {
        const res = await fetch(`/api/tables/${tableId}/heartbeat`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.wasReconnected) onReconnectRef.current?.();
        }
      } catch {
        // Network error — will retry next interval
      }
    };

    function clearWatchdog() {
      if (watchdogTimeout) {
        clearTimeout(watchdogTimeout);
        watchdogTimeout = null;
      }
    }

    // Start the watchdog. If the subscribe callback doesn't arrive within
    // WATCHDOG_MS, Supabase's own reconnect loop is stuck — force a new channel.
    function armWatchdog() {
      clearWatchdog();
      watchdogTimeout = setTimeout(() => {
        if (!isMounted || retryTimeout) return;
        const delay = Math.min(1_000 * Math.pow(2, retryCount) + Math.random() * 500, MAX_RETRY_DELAY_MS);
        retryCount++;
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          subscribe();
        }, delay);
      }, WATCHDOG_MS);
    }

    function scheduleRetry() {
      if (retryTimeout) return; // already pending
      const delay = Math.min(1_000 * Math.pow(2, retryCount) + Math.random() * 500, MAX_RETRY_DELAY_MS);
      retryCount++;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        subscribe();
      }, delay);
    }

    function teardownHeartbeat() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    }

    function subscribe() {
      if (!isMounted) return;

      // Always remove the previous channel before creating a new one so we
      // don't accumulate stale subscriptions on the Supabase server.
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }

      const channel = supabase
        .channel(`table:${tableId}`)
        .on('broadcast', { event: 'game_state' }, ({ payload }) => {
          if (payload?.state) onGameStateRef.current(payload.state);
        })
        .on('broadcast', { event: 'player_disconnected' }, ({ payload }) => {
          handlePlayerDisconnected(payload);
        })
        .on('broadcast', { event: 'player_reconnected' }, ({ payload }) => {
          handlePlayerReconnected(payload);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'poker_seats',
          filter: `table_id=eq.${tableId}`,
        }, () => {
          onPlayerJoinedRef.current?.();
        })
        .on('system', {}, (payload: { status?: string }) => {
          if (!isMounted) return;
          if (payload?.status === 'closed') {
            setStatus('disconnected');
            wasDisconnected = true;
            // The subscribe callback should fire shortly (with CLOSED or SUBSCRIBED
            // on auto-reconnect). Arm the watchdog: if it doesn't arrive within
            // WATCHDOG_MS, force a fresh channel ourselves.
            armWatchdog();
          }
        });

      if (playerId) {
        channel.on('broadcast', { event: `private_cards:${playerId}` }, ({ payload }) => {
          if (payload?.cards) onPrivateCardsRef.current?.(payload.cards);
        });
      }

      channel.subscribe((channelStatus) => {
        if (!isMounted) return;
        // Any subscribe callback means the connection did something — disarm
        // the watchdog so it doesn't fire on top of the normal retry path.
        clearWatchdog();

        if (channelStatus === 'SUBSCRIBED') {
          if (wasDisconnected) onReconnectRef.current?.();
          setStatus('connected');
          retryCount = 0;
          wasDisconnected = false;
          if (playerId && !heartbeatInterval) {
            sendHeartbeat();
            heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
          }
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setStatus('disconnected');
          wasDisconnected = true;
          teardownHeartbeat();
          // Remove and schedule retry. The removeChannel call will trigger a
          // CLOSED callback — the guard inside that branch prevents double-scheduling.
          supabase.removeChannel(channel);
          activeChannelRef.current = null;
          scheduleRetry();
        } else if (channelStatus === 'CLOSED') {
          // Fires either from an explicit removeChannel (CHANNEL_ERROR path already
          // scheduled a retry) or from an unexpected socket drop. Only schedule
          // a retry if one isn't already pending.
          if (isMounted) {
            setStatus('disconnected');
            wasDisconnected = true;
            teardownHeartbeat();
            scheduleRetry(); // no-op if retryTimeout is already set
          }
        }
      });

      // Track this channel so cleanup and retries always remove the right one.
      activeChannelRef.current = channel;
    }

    subscribe();

    return () => {
      isMounted = false;
      clearWatchdog();
      if (retryTimeout) clearTimeout(retryTimeout);
      teardownHeartbeat();
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }
    };
  }, [tableId, playerId, handlePlayerDisconnected, handlePlayerReconnected]);

  return status;
}
