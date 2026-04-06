'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useTableChat';

const QUICK_PHRASES = [
  'Nice hand!',
  'Good game!',
  'Wow!',
  'Let\'s go!',
  'All in!',
  'Tough beat',
];

const QUICK_EMOJIS = ['👏', '😂', '😮', '🤔', '💀', '🔥', '🎉', '❤️'];

interface TableChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  playerId?: string;
}

export function TableChat({ messages, onSendMessage, onSendReaction, playerId }: TableChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCountRef = useRef(0);

  // Track unread when panel is closed
  useEffect(() => {
    if (!open && messages.length > prevCountRef.current) {
      setUnread(v => v + (messages.length - prevCountRef.current));
    }
    prevCountRef.current = messages.length;
  }, [messages.length, open]);

  // Clear unread + scroll to bottom when opening
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        inputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Auto-scroll to new messages when panel open
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  }, [input, onSendMessage]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all',
          'border border-white/10 bg-black/40 text-white/60 hover:bg-black/60 hover:text-white'
        )}
      >
        <MessageCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Chat</span>
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute bottom-10 right-0 z-50 flex flex-col',
              'w-72 sm:w-80 rounded-xl border border-white/10',
              'bg-gray-950/95 backdrop-blur-xl shadow-2xl'
            )}
            style={{ maxHeight: '380px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-sm font-semibold text-white">Table Chat</span>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" style={{ minHeight: '160px', maxHeight: '220px' }}>
              {messages.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/30">
                  No messages yet. Say hi!
                </p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id}>
                    {msg.type === 'system' ? (
                      <p className="text-center text-[10px] text-white/30 py-0.5">{msg.text}</p>
                    ) : msg.type === 'reaction' ? (
                      <div className={cn(
                        'flex items-center gap-1.5',
                        msg.playerId === playerId ? 'flex-row-reverse' : 'flex-row'
                      )}>
                        <span className="text-xl">{msg.emoji}</span>
                        <span className="text-[10px] text-white/30">{msg.username}</span>
                      </div>
                    ) : (
                      <div className={cn(
                        'flex flex-col gap-0.5',
                        msg.playerId === playerId ? 'items-end' : 'items-start'
                      )}>
                        <div className={cn(
                          'flex items-baseline gap-1.5',
                          msg.playerId === playerId ? 'flex-row-reverse' : 'flex-row'
                        )}>
                          <span className={cn(
                            'text-[10px] font-medium',
                            msg.playerId === playerId ? 'text-blue-400' : 'text-white/50'
                          )}>
                            {msg.playerId === playerId ? 'You' : msg.username}
                          </span>
                          <span className="text-[9px] text-white/20">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className={cn(
                          'max-w-[200px] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed',
                          msg.playerId === playerId
                            ? 'rounded-tr-sm bg-blue-600 text-white'
                            : 'rounded-tl-sm bg-white/10 text-white/90'
                        )}>
                          {msg.text}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick emojis */}
            <div className="flex gap-1 border-t border-white/5 px-3 py-2 overflow-x-auto">
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => onSendReaction(e)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-base hover:bg-white/10 transition-colors"
                  title={`React with ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Quick phrases */}
            <div className="flex flex-wrap gap-1 border-t border-white/5 px-3 py-1.5">
              {QUICK_PHRASES.map(p => (
                <button
                  key={p}
                  onClick={() => onSendMessage(p)}
                  className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white/80 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, 200))}
                onKeyDown={handleKey}
                placeholder="Say something..."
                className={cn(
                  'flex-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30',
                  'border border-white/10 outline-none focus:border-white/30 transition-colors'
                )}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  'rounded-lg p-1.5 transition-all',
                  input.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-white/5 text-white/20'
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Desktop sidebar panel (always-open) ───────────────────────────────────

interface TableChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  playerId?: string;
}

export function TableChatPanel({ messages, onSendMessage, onSendReaction, playerId }: TableChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  }, [input, onSendMessage]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/30">No messages yet. Say hi!</p>
        ) : (
          messages.map(msg => (
            <div key={msg.id}>
              {msg.type === 'system' ? (
                <p className="text-center text-[10px] text-white/30 py-0.5">{msg.text}</p>
              ) : msg.type === 'reaction' ? (
                <div className={cn('flex items-center gap-1.5', msg.playerId === playerId ? 'flex-row-reverse' : 'flex-row')}>
                  <span className="text-xl">{msg.emoji}</span>
                  <span className="text-[10px] text-white/30">{msg.username}</span>
                </div>
              ) : (
                <div className={cn('flex flex-col gap-0.5', msg.playerId === playerId ? 'items-end' : 'items-start')}>
                  <div className={cn('flex items-baseline gap-1.5', msg.playerId === playerId ? 'flex-row-reverse' : 'flex-row')}>
                    <span className={cn('text-[10px] font-medium', msg.playerId === playerId ? 'text-blue-400' : 'text-white/50')}>
                      {msg.playerId === playerId ? 'You' : msg.username}
                    </span>
                    <span className="text-[9px] text-white/20">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className={cn(
                    'max-w-[180px] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed',
                    msg.playerId === playerId
                      ? 'rounded-tr-sm bg-blue-600 text-white'
                      : 'rounded-tl-sm bg-white/10 text-white/90'
                  )}>
                    {msg.text}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick emojis */}
      <div className="flex gap-1 border-t border-white/5 px-2 py-1.5 overflow-x-auto flex-shrink-0">
        {QUICK_EMOJIS.map(e => (
          <button
            key={e}
            onClick={() => onSendReaction(e)}
            className="shrink-0 rounded-md px-1 py-1 text-sm hover:bg-white/10 transition-colors"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 flex-shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 200))}
          onKeyDown={handleKey}
          placeholder="Say something..."
          className={cn(
            'flex-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder-white/30',
            'border border-white/10 outline-none focus:border-white/30 transition-colors'
          )}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className={cn(
            'rounded-lg p-1.5 transition-all',
            input.trim() ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-white/5 text-white/20'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Floating emoji reaction overlay — shows big emoji bursts on the table
interface FloatingReactionProps {
  emoji: string;
  username: string;
  id: string;
  onDone: (id: string) => void;
}

export function FloatingReaction({ emoji, username, id, onDone }: FloatingReactionProps) {
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-1/2 z-50 flex flex-col items-center"
      initial={{ opacity: 1, y: 0, scale: 0.5, x: '-50%' }}
      animate={{ opacity: 0, y: -100, scale: 1.5 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      onAnimationComplete={() => onDone(id)}
    >
      <span className="text-5xl drop-shadow-lg">{emoji}</span>
      <span className="mt-1 text-xs font-medium text-white/70">{username}</span>
    </motion.div>
  );
}
