'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GameState } from '@/types/poker';

export type ChannelStatus = 'connecting' | 'connected' | 'disconnected';

interface UseTableChannelOptions {
  tableId: string;
  playerId?: string;
  onGameState: (state: Omit<GameState, 'deck'>) => void;
  onPrivateCards?: (cards: string[]) => void;
  onPlayerJoined?: () => void;
  onReconnect?: () => void;
}

export function useTableChannel({
  tableId,
  playerId,
  onGameState,
  onPrivateCards,
  onPlayerJoined,
  onReconnect,
}: UseTableChannelOptions): ChannelStatus {
  const [status, setStatus] = useState<ChannelStatus>('connecting');

  // Keep callback refs so we don't need to re-subscribe on every render
  const onGameStateRef = useRef(onGameState);
  const onPrivateCardsRef = useRef(onPrivateCards);
  const onPlayerJoinedRef = useRef(onPlayerJoined);
  const onReconnectRef = useRef(onReconnect);
  onGameStateRef.current = onGameState;
  onPrivateCardsRef.current = onPrivateCards;
  onPlayerJoinedRef.current = onPlayerJoined;
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let wasDisconnected = false;
    const MAX_RETRY_DELAY_MS = 30_000;

    function subscribe() {
      if (!isMounted) return;

      const channel = supabase
        .channel(`table:${tableId}`)
        .on('broadcast', { event: 'game_state' }, ({ payload }) => {
          if (payload?.state) onGameStateRef.current(payload.state);
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'poker_seats',
          filter: `table_id=eq.${tableId}`,
        }, () => {
          onPlayerJoinedRef.current?.();
        })
        // Detect mid-session drops via Realtime system events
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
            // Reconnected after a drop — trigger a full state refresh
            onReconnectRef.current?.();
          }
          setStatus('connected');
          retryCount = 0;
          wasDisconnected = false;
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setStatus('disconnected');
          wasDisconnected = true;
          // Exponential backoff with jitter, capped at 30s
          const delay = Math.min(1_000 * Math.pow(2, retryCount) + Math.random() * 500, MAX_RETRY_DELAY_MS);
          retryCount++;
          supabase.removeChannel(channel);
          retryTimeout = setTimeout(subscribe, delay);
        } else if (channelStatus === 'CLOSED') {
          if (isMounted) {
            setStatus('disconnected');
            wasDisconnected = true;
          }
        }
      });

      return channel;
    }

    const channel = subscribe();

    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tableId, playerId]);

  return status;
}
