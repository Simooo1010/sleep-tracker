'use client';

import { useEffect } from 'react';

import { syncAppIcons } from '@/lib/app-icon';

/** Non disegna nulla: porta apple-touch-icon e favicon alla variante scura quando il sistema è scuro. */
export function AppIconSync() {
  useEffect(() => syncAppIcons(document, window), []);
  return null;
}
