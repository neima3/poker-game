'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  text: string;
  timestamp: number;
  type: 'message' | 'reaction' | 'system';
  emoji?: string;
}

const MAX_MESSAGES = 80;
const MAX_TEXT_LENGTH = 200;

export function useTableChat(tableId: string, playerId?: string, username?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`chat:${tableId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        const msg = payload as ChatMessage;
        if (!msg?.id) return;
        setMessages(prev => {
          const next = [...prev, msg];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!playerId || !username || !channelRef.current) return;
    const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!trimmed) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId,
      username,
      text: trimmed,
      timestamp: Date.now(),
      type: 'message',
    };

    await channelRef.current.send({
      type: 'broadcast',
      event: 'chat_message',
      payload: msg,
    });
  }, [playerId, username]);

  const sendReaction = useCallback(async (emoji: string) => {
    if (!playerId || !username || !channelRef.current) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId,
      username,
      text: emoji,
      emoji,
      timestamp: Date.now(),
      type: 'reaction',
    };

    await channelRef.current.send({
      type: 'broadcast',
      event: 'chat_message',
      payload: msg,
    });
  }, [playerId, username]);

  const sendSystemMessage = useCallback(async (text: string) => {
    if (!channelRef.current) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      playerId: 'system',
      username: 'System',
      text,
      timestamp: Date.now(),
      type: 'system',
    };
    await channelRef.current.send({
      type: 'broadcast',
      event: 'chat_message',
      payload: msg,
    });
  }, []);

  return { messages, sendMessage, sendReaction, sendSystemMessage };
}
