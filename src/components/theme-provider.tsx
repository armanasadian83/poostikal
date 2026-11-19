'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { isTheme, paletteColorScheme, themeCss, type Palette, type ThemeSnapshot } from '@/lib/theme';

type ThemeContextValue = {
  saved: ThemeSnapshot; preview: (palette: Palette | null) => void;
  save: (palette: Palette, version: number) => Promise<ThemeSnapshot>;
  refresh: () => Promise<ThemeSnapshot>;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('ThemeProvider is missing'); return context; }

export function ThemeProvider({ initialTheme, children }: { initialTheme: ThemeSnapshot; children: ReactNode }) {
  const [saved, setSaved] = useState(initialTheme);
  const [draft, setDraft] = useState<Palette | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const preview = useCallback((palette: Palette | null) => setDraft(palette), []);
  const refresh = useCallback(async () => {
    const value = await api<ThemeSnapshot>('/theme');
    if (!isTheme(value)) throw new Error('تنظیمات رنگ معتبر نیست. دوباره تلاش کن.');
    setSaved(previous => value.version > previous.version ? value : previous);
    return value;
  }, []);
  const save = useCallback(async (palette: Palette, version: number) => {
    const value = await api<ThemeSnapshot>('/admin/theme', { method: 'PUT', body: JSON.stringify({ palette, version }) });
    if (!isTheme(value)) throw new Error('ذخیره رنگ‌ها تأیید نشد. دوباره تلاش کن.');
    setSaved(value); setDraft(null); channel.current?.postMessage({ version: value.version });
    return value;
  }, []);
  const palette = draft ?? saved.palette;
  const css = useMemo(() => themeCss(palette), [palette]);
  useEffect(() => {
    // The server style covers the first paint; the later body style handles live updates.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
    window.dispatchEvent(new Event('poostikal:theme'));
  }, [palette]);
  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh().catch(() => { /* Keep the last valid palette offline. */ }); };
    if ('BroadcastChannel' in window) { channel.current = new BroadcastChannel('poostikal-theme'); channel.current.onmessage = update; }
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    const interval = window.setInterval(update, 30000);
    update();
    return () => { clearInterval(interval); channel.current?.close(); channel.current = null; window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);
  const value = useMemo(() => ({ saved, preview, save, refresh }), [saved, preview, save, refresh]);
  return <ThemeContext.Provider value={value}><style id="poostikal-live-theme" data-color-scheme={paletteColorScheme(palette)}>{css}</style>
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="theme-brand-filter"><defs><filter id="poostikal-theme-brand" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  20 0 -20 0 0" result="lips"/>
      <feComposite in="SourceGraphic" in2="lips" operator="in" result="original-lips"/>
      <feComposite in="SourceAlpha" in2="lips" operator="out" result="letters"/>
      <feFlood floodColor="var(--theme-text)" result="ink"/><feComposite in="ink" in2="letters" operator="in" result="themed-letters"/>
      <feMerge><feMergeNode in="themed-letters"/><feMergeNode in="original-lips"/></feMerge>
    </filter><filter id="poostikal-theme-marks" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.33 -.34 -.33 0 1" result="dark-ink"/>
      <feComposite in="dark-ink" in2="SourceAlpha" operator="in" result="ink-mask"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  20 0 -20 0 -1.5" result="color-mask"/>
      <feComposite in="ink-mask" in2="color-mask" operator="out" result="neutral-mask"/>
      <feFlood floodColor="var(--theme-text)" result="light"/><feComposite in="light" in2="neutral-mask" operator="in" result="letters"/>
      <feComposite in="SourceGraphic" in2="color-mask" operator="in" result="original-color"/>
      <feMerge><feMergeNode in="letters"/><feMergeNode in="original-color"/></feMerge>
    </filter></defs></svg>{children}</ThemeContext.Provider>;
}
