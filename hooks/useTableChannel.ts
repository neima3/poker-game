'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GameState, PlayerState } from '@/types/poker';
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
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    let wasDisconnected = false;
    const MAX_RETRY_DELAY_MS = 30_000;

    const sendHeartbeat = async () => {
    if (!playerId || !isMounted) return;
    try {
      const res = await fetch(`/api/tables/${tableId}/heartbeat`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.wasReconnected) {
          onReconnectRef.current?.();
        }
      }
    } catch {
      // Network error — will retry next interval
    }
  };

    function subscribe() {
      if (!isMounted) return;

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
          }
        });

      if (playerId) {
        channel.on('broadcast', { event: `private_cards:${playerId}` }, ({ payload }) => {
          if (payload?.cards) onPrivateCardsRef.current?.(payload.cards);
        });
      }

      channel.subscribe((channelStatus) => {
        if (!isMounted) return;

        if (channelStatus === 'SUBSCRIBED') {
          if (wasDisconnected) {
            onReconnectRef.current?.();
          }
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
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
          const delay = Math.min(1_000 * Math.pow(2, retryCount) + Math.random() * 500, MAX_RETRY_DELAY_MS);
          retryCount++;
          supabase.removeChannel(channel);
          // Reset retryTimeout to null before subscribe so a subsequent CLOSED
          // event from the removeChannel call above cannot queue a second retry.
          retryTimeout = setTimeout(() => {
            retryTimeout = null;
            subscribe();
          }, delay);
        } else if (channelStatus === 'CLOSED') {
          if (isMounted) {
            setStatus('disconnected');
            wasDisconnected = true;
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            // Retry on unexpected CLOSED (e.g. sleep/wake, network blip).
            // Guard against double-scheduling: CHANNEL_ERROR already sets retryTimeout
            // before removeChannel triggers a CLOSED event, so skip if one is pending.
            if (!retryTimeout) {
              const delay = Math.min(1_000 * Math.pow(2, retryCount) + Math.random() * 500, MAX_RETRY_DELAY_MS);
              retryCount++;
              retryTimeout = setTimeout(() => {
                retryTimeout = null;
                subscribe();
              }, delay);
            }
          }
        }
      });

      return channel;
    }

    const channel = subscribe();

    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tableId, playerId, handlePlayerDisconnected, handlePlayerReconnected]);

  return status;
}
