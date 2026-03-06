'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const AVATARS = [
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎰',
  '🎲', '🏆', '👑', '🔥', '⚡', '🦈',
] as const;

interface AvatarPickerProps {
  currentAvatar?: string;
  userId: string;
}

export function AvatarPicker({ currentAvatar, userId }: AvatarPickerProps) {
  const [selected, setSelected] = useState(currentAvatar ?? '🃏');
  const [saving, setSaving] = useState(false);

  const handleSelect = useCallback(async (avatar: string) => {
    setSelected(avatar);
    setSaving(true);
    try {
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Avatar updated!');
    } catch {
      toast.error('Failed to save avatar');
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Current avatar display */}
      <div className="flex items-center gap-3">
        <motion.div
          key={selected}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-card border-2 border-gold/30 text-3xl"
        >
          {selected}
        </motion.div>
        <div>
          <p className="text-sm font-medium">Your Avatar</p>
          <p className="text-xs text-muted-foreground">Click to change</p>
        </div>
      </div>

      {/* Avatar grid */}
      <div className="grid grid-cols-6 gap-2">
        {AVATARS.map(avatar => (
          <motion.button
            key={avatar}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSelect(avatar)}
            disabled={saving}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all',
              selected === avatar
                ? 'bg-gold/20 border-2 border-gold ring-1 ring-gold/30'
                : 'bg-card border border-border/50 hover:bg-card/80 hover:border-border'
            )}
          >
            {avatar}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
