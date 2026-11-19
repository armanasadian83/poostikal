import tones from './theme-tones.json';

export const defaultPalette = {
  primary: '#290c68', secondary: '#8840c8', accent: '#ed4c97',
  background: '#fbf8ff', surface: '#ffffff', text: '#290c68', muted: '#806a97',
  success: '#288163', warning: '#b87814', danger: '#bd355b',
};
export type Palette = typeof defaultPalette;
export type PaletteKey = keyof Palette;
export type ThemeSnapshot = { palette: Palette; version: number };
export const defaultTheme: ThemeSnapshot = { palette: defaultPalette, version: 0 };
export const paletteFields: { key: PaletteKey; label: string; hint: string }[] = [
  { key: 'primary', label: 'رنگ اصلی', hint: 'دکمه‌ها و انتخاب‌های فعال' },
  { key: 'secondary', label: 'رنگ مکمل', hint: 'موج‌ها، نمودارها و درخشش نشانگر' },
  { key: 'accent', label: 'رنگ تأکیدی', hint: 'جزئیات، نشان‌ها و نقاط توجه' },
  { key: 'background', label: 'پس‌زمینه', hint: 'رنگ پایه تمام صفحات' },
  { key: 'surface', label: 'سطح شیشه‌ای', hint: 'کارت‌ها، جدول‌ها و پنجره‌ها' },
  { key: 'text', label: 'متن اصلی', hint: 'عنوان‌ها و محتوای اصلی' },
  { key: 'muted', label: 'متن فرعی', hint: 'توضیحات و راهنمای فیلدها' },
  { key: 'success', label: 'موفقیت', hint: 'تأیید و وضعیت تکمیل‌شده' },
  { key: 'warning', label: 'هشدار', hint: 'در انتظار و نیازمند بررسی' },
  { key: 'danger', label: 'خطا', hint: 'خطاها، حذف و لغو' },
];
export const themePresets: { name: string; palette: Palette }[] = [
  { name: 'پوستیکال', palette: defaultPalette },
  { name: 'باغ زمرد', palette: { primary: '#13574f', secondary: '#288b79', accent: '#d69643', background: '#f4faf6', surface: '#ffffff', text: '#163e36', muted: '#627a72', success: '#247c50', warning: '#ab6c16', danger: '#ba4244' } },
  { name: 'آبی آرام', palette: { primary: '#183e84', secondary: '#447dd9', accent: '#26a5bc', background: '#f4f8ff', surface: '#ffffff', text: '#173153', muted: '#657a94', success: '#227a65', warning: '#ad721b', danger: '#bc3d53' } },
  { name: 'گرمای مسی', palette: { primary: '#733e2e', secondary: '#bd7653', accent: '#be973e', background: '#fcf8f2', surface: '#fffdf8', text: '#4e3028', muted: '#8c7165', success: '#567c47', warning: '#ad6b1c', danger: '#b74239' } },
  { name: 'شب اقیانوس', palette: { primary: '#55c4ba', secondary: '#54a8c7', accent: '#e3ad65', background: '#101c28', surface: '#203142', text: '#edf6fa', muted: '#acbecb', success: '#69c79b', warning: '#e7b459', danger: '#f0878b' } },
  {
    name: 'تم بلک فرایدی',
    palette: {
      primary: '#fff3f7', secondary: '#d2b6c8', accent: '#743064',
      background: '#382035', surface: '#542d4e', text: '#fff3f7', muted: '#dfc5d3',
      success: '#69c79b', warning: '#e7b459', danger: '#f0878b',
    },
  },
];
export function isPalette(value: unknown): value is Palette {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value).length === paletteFields.length && paletteFields.every(({ key }) => /^#[0-9a-f]{6}$/i.test((value as Palette)[key] || ''));
}
export function isTheme(value: unknown): value is ThemeSnapshot {
  const theme = value as ThemeSnapshot | undefined;
  return !!theme && isPalette(theme.palette) && Number.isSafeInteger(theme.version) && theme.version >= 0;
}
type RGB = [number, number, number];
function rgb(hex: string): RGB { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB; }
function hsl(color: RGB): RGB {
  const [r, g, b] = color.map(value => value / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, light = (max + min) / 2;
  const hue = !delta ? 0 : (max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
  return [hue, delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1)), light];
}
function fromHsl([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }) as RGB;
}
function mix(first: RGB, second: RGB, amount: number): RGB { return first.map((value, i) => Math.round(value * (1 - amount) + second[i] * amount)) as RGB; }
function luminance(hex: string) { const [r, g, b] = rgb(hex).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; }
export function contrastRatio(first: string, second: string) { const a = luminance(first), b = luminance(second); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
function onColor(hex: string) { return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#101010') ? '#ffffff' : '#101010'; }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Preserve the existing glass opacities and tonal hierarchy, while deriving every hue from the saved palette. */
function resolveTone(tone: { role: string; color: string; alpha: number }, palette: Palette): string {
  const role = tone.role as PaletteKey, original = rgb(tone.color), [oldH, oldS, oldL] = hsl(original);
  const anchor = rgb(palette[role]), [h, s, l] = hsl(anchor), [, , referenceL] = hsl(rgb(defaultPalette[role]));
  const legacyGreen = oldH > 65 && oldH < 190 && !['success', 'warning', 'danger'].includes(role);
  let result: RGB;
  if (palette[role] === defaultPalette[role] && palette.surface === defaultPalette.surface && palette.background === defaultPalette.background && !legacyGreen) result = original;
  else if (role === 'surface') result = mix(rgb(palette.surface), rgb(palette.primary), clamp((1 - oldL) * .7, 0, .22));
  else if (oldL > .72 && role !== 'text' && role !== 'muted') {
    result = mix(rgb(palette.surface), anchor, clamp((1 - oldL) / Math.max(.1, 1 - referenceL), .01, .65));
  } else if (role === 'text' || role === 'muted') {
    result = mix(anchor, rgb(palette.background), role === 'muted' ? clamp((oldL - referenceL) * .45, 0, .2) : 0);
  } else {
    const light = oldL < referenceL ? l * oldL / referenceL : l + (1 - l) * (oldL - referenceL) / (1 - referenceL);
    result = fromHsl([h, s * (oldS < .1 ? .28 : 1), clamp(light, .025, .98)]);
  }
  return tone.alpha === 1 ? `rgb(${result.join(' ')})` : `rgb(${result.join(' ')} / ${tone.alpha})`;
}
export function paletteColorScheme(palette: Palette): 'dark' | 'light' {
  return luminance(palette.background) < .18 ? 'dark' : 'light';
}
export function themeCss(palette: Palette): string {
  const scheme = paletteColorScheme(palette);
  const dark = scheme === 'dark';
  const declarations = Object.entries(palette).map(([key, value]) => `--theme-${key}:${value}`);
  for (const role of ['primary', 'secondary', 'accent'] as const) declarations.push(`--theme-on-${role}:${onColor(palette[role])}`);
  declarations.push(`--theme-secondary-rgb:${rgb(palette.secondary).join(',')}`);
  declarations.push(`--theme-wave-art-opacity:${dark ? '.08' : '.32'}`);
  declarations.push(`--theme-brand-mark-filter:${dark ? 'url(#poostikal-theme-marks)' : 'none'}`);
  declarations.push(`--theme-brand-mark-blend:${dark ? 'normal' : 'multiply'}`);
  const [accentH, accentS] = hsl(rgb(palette.accent));
  // Only decorative lips are tinted; the red lips in the brand wordmark stay original.
  declarations.push(`--theme-lip-filter:hue-rotate(${Math.round(accentH - 334)}deg) saturate(${Math.max(.05, accentS / .75).toFixed(2)})`);
  declarations.push(`color-scheme:${scheme}`);
  declarations.push(`--theme-product-blend:${dark ? 'normal' : 'multiply'}`);
  if (dark && Math.min(contrastRatio(palette.accent, palette.background), contrastRatio(palette.accent, palette.surface)) < 4.5) {
    declarations.push(`--theme-accent-ink:${palette.text}`);
  }
  for (const [name, tone] of Object.entries(tones)) declarations.push(`${name}:${resolveTone(tone, palette)}`);
  return `:root{${declarations.join(';')}}`;
}
