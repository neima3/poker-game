'use client';

import { useEffect, useState, useCallback } from 'react';
import { initSoundSettings, isMuted, setMuted, isCategoryEnabled, setCategoryEnabled, type SoundCategory } from '@/lib/sounds';

export function useSound() {
  const [muted, setMutedState] = useState(true); // default true until hydrated
  const [categories, setCategories] = useState<Record<SoundCategory, boolean>>({
    deal: true, action: true, win: true, timer: true,
  });

  useEffect(() => {
    initSoundSettings();
    setMutedState(isMuted());
    setCategories({
      deal: isCategoryEnabled('deal'),
      action: isCategoryEnabled('action'),
      win: isCategoryEnabled('win'),
      timer: isCategoryEnabled('timer'),
    });
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);

  const toggleCategory = useCallback((cat: SoundCategory) => {
    const next = !isCategoryEnabled(cat);
    setCategoryEnabled(cat, next);
    setCategories(prev => ({ ...prev, [cat]: next }));
  }, []);

  return { muted, toggleMute, categories, toggleCategory };
}
