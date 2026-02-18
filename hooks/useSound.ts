'use client';

import { useEffect, useState, useCallback } from 'react';
import { initSoundMute, isMuted, setMuted } from '@/lib/sounds';

export function useSound() {
  const [muted, setMutedState] = useState(true); // default true until hydrated

  useEffect(() => {
    initSoundMute();
    setMutedState(isMuted());
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);

  return { muted, toggleMute };
}
