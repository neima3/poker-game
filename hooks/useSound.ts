'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  initSoundSettings,
  isMuted,
  setMuted,
  isCategoryEnabled,
  setCategoryEnabled,
  getSoundPack,
  setSoundPack,
  getAmbientVolume,
  setAmbientVolume,
  startAmbient,
  stopAmbient,
  type SoundCategory,
  type SoundPack,
} from '@/lib/sounds';

export function useSound() {
  const [muted, setMutedState] = useState(true); // default true until hydrated
  const [categories, setCategories] = useState<Record<SoundCategory, boolean>>({
    deal: true, action: true, win: true, timer: true, ambient: false,
  });
  const [soundPack, setSoundPackState] = useState<SoundPack>('classic');
  const [ambientVol, setAmbientVol] = useState(0.3);

  useEffect(() => {
    initSoundSettings();
    setMutedState(isMuted());
    setCategories({
      deal: isCategoryEnabled('deal'),
      action: isCategoryEnabled('action'),
      win: isCategoryEnabled('win'),
      timer: isCategoryEnabled('timer'),
      ambient: isCategoryEnabled('ambient'),
    });
    setSoundPackState(getSoundPack());
    setAmbientVol(getAmbientVolume());
  }, []);

  // Start/stop ambient when category toggles
  useEffect(() => {
    if (categories.ambient && !muted) {
      startAmbient();
    } else {
      stopAmbient();
    }
    return () => { stopAmbient(); };
  }, [categories.ambient, muted]);

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

  const changeSoundPack = useCallback((pack: SoundPack) => {
    setSoundPack(pack);
    setSoundPackState(pack);
  }, []);

  const changeAmbientVolume = useCallback((vol: number) => {
    setAmbientVolume(vol);
    setAmbientVol(vol);
  }, []);

  return {
    muted,
    toggleMute,
    categories,
    toggleCategory,
    soundPack,
    changeSoundPack,
    ambientVolume: ambientVol,
    changeAmbientVolume,
  };
}
