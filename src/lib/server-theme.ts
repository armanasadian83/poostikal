import 'server-only';
import { cache } from 'react';
import { defaultTheme, isTheme, type ThemeSnapshot } from './theme';

let lastKnownTheme = defaultTheme;
export const getServerTheme = cache(async (): Promise<ThemeSnapshot> => {
  try {
    const origin = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
    const response = await fetch(`${origin}/api/theme`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return lastKnownTheme;
    const value: unknown = await response.json();
    if (isTheme(value)) lastKnownTheme = value;
    return lastKnownTheme;
  } catch { return lastKnownTheme; }
});
