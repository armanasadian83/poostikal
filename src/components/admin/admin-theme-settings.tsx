'use client';
import { useEffect, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useTheme } from '@/components/theme-provider';
import { contrastRatio, defaultPalette, paletteFields, themePresets, type Palette, type PaletteKey } from '@/lib/theme';
import { AdminPanel } from './admin-ui';
import { AdminIcon } from './admin-icon';
import type { AdminMutationResult } from '@/lib/admin-product-model';

function ColorField({ field, value, onChange, disabled }: { field: typeof paletteFields[number]; value: string; onChange: (color: string) => void; disabled: boolean }) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const invalid = editing !== null && !/^#[0-9a-f]{6}$/i.test(editing);
  return <div className="theme-color-field">
    <div className="theme-color-top"><label htmlFor={id}>{field.label}</label><span className="theme-color-swatch" style={{ backgroundColor: value }}>
      <input id={id} type="color" value={value} disabled={disabled} aria-label={`انتخاب ${field.label}`} onChange={event => { setEditing(null); onChange(event.target.value); }}/>
    </span></div>
    <span className="theme-color-hint">{field.hint}</span>
    <div className="theme-hex-wrap"><span aria-hidden="true">HEX</span><input type="text" value={editing ?? value} disabled={disabled} dir="ltr" spellCheck={false} maxLength={7} aria-label={`کد ${field.label}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
      onChange={event => { const text = event.target.value; if (/^#[0-9a-f]{6}$/i.test(text)) { onChange(text.toLowerCase()); setEditing(null); } else setEditing(text); }}
      onBlur={() => { if (editing !== null && /^#?[0-9a-f]{3}$/i.test(editing)) { onChange('#' + editing.replace('#', '').split('').map(character => character + character).join('').toLowerCase()); } setEditing(null); }}/></div>
    {invalid && <span className="theme-field-error" id={`${id}-error`}>کد ۶ رقمی رنگ با # شروع می‌شود.</span>}
  </div>;
}

export function useAdminThemeEditor() {
  const { saved, preview, save, refresh } = useTheme();
  const [draft, setDraft] = useState<Palette | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const palette = draft ?? saved.palette;
  const dirty = paletteFields.some(({ key }) => palette[key] !== saved.palette[key]);
  const remoteChanged = draft !== null && baseVersion !== saved.version;
  useEffect(() => { preview(live ? draft : null); }, [draft, live, preview]);
  useEffect(() => () => preview(null), [preview]);

  function edit(next: Palette) { setBaseVersion(version => version ?? saved.version); setDraft(next); setMessage(''); setError(''); }
  function editColor(key: PaletteKey, color: string) { edit({ ...palette, [key]: color }); }
  function discard() { setDraft(null); setBaseVersion(null); setError(''); setMessage('پیش‌نمایش کنار گذاشته شد؛ رنگ‌های ذخیره‌شده نمایش داده می‌شوند.'); }
  async function saveDraft(): Promise<AdminMutationResult> {
    if (!dirty) return { ok: true };
    setBusy(true); setError(''); setMessage('');
    try {
      await save(palette, baseVersion ?? saved.version);
      setDraft(null); setBaseVersion(null);
      setMessage('پالت جدید ذخیره شد و در فروشگاه و پنل مدیریت فعال است.');
      return { ok: true };
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : 'ذخیره نشد. دوباره تلاش کن.';
      setError(error);
      return { ok: false, error };
    } finally { setBusy(false); }
  }
  async function reload() { setBusy(true); try { await refresh(); discard(); } catch { setError('دریافت رنگ‌های ذخیره‌شده ممکن نشد. دوباره تلاش کن.'); } finally { setBusy(false); } }
  return { palette, draft, dirty, busy, live, setLive, message, error, remoteChanged, fieldVersion: baseVersion ?? saved.version, edit, editColor, discard, saveDraft, reload };
}

export function AdminThemeSettings({ editor, saving }: { editor: ReturnType<typeof useAdminThemeEditor>; saving: boolean }) {
  const { palette, draft, dirty, live, setLive, message, error, remoteChanged, fieldVersion, edit, editColor, discard, saveDraft, reload } = editor;
  const busy = editor.busy || saving;
  const lowContrast = contrastRatio(palette.text, palette.surface) < 4.5 || contrastRatio(palette.text, palette.background) < 4.5;
  const faintText = contrastRatio(palette.muted, palette.surface) < 3;
  function submit(event: FormEvent) { event.preventDefault(); if (!busy) void saveDraft(); }
  return <AdminPanel className="admin-theme-panel">
    <form onSubmit={submit} noValidate>
      <div className="theme-section-heading"><div><span className="theme-eyebrow"><AdminIcon name="sparkles" size={17}/>هویت بصری پوستیکال</span><h2>فروشگاهت، به رنگ خودت</h2><p>یک پالت هماهنگ برای تمام صفحات فروشگاه و پنل مدیریت.</p></div><span className={`theme-save-state${dirty ? ' is-unsaved' : ''}`}><i/>{dirty ? 'تغییرات ذخیره نشده' : 'پالت فعال فروشگاه'}</span></div>
      <div className="theme-editor-layout">
        <div className="theme-editor-controls">
          <fieldset disabled={busy} className="theme-presets"><legend>از یک ترکیب آماده شروع کن</legend><div>{themePresets.map(preset => <button type="button" key={preset.name} className="theme-preset" aria-pressed={Object.keys(palette).every(key => palette[key as PaletteKey] === preset.palette[key as PaletteKey])} onClick={() => edit({ ...preset.palette })}><span className="theme-preset-dots" aria-hidden="true">{['primary', 'secondary', 'accent', 'background'].map(key => <i key={key} style={{ background: preset.palette[key as PaletteKey] }}/>)}</span><span>{preset.name}</span></button>)}</div></fieldset>
          <div className="theme-color-grid">{paletteFields.map(field => <ColorField key={`${field.key}-${fieldVersion}`} field={field} value={palette[field.key]} disabled={busy} onChange={color => editColor(field.key, color)}/>)}</div>
        </div>
        <aside className="theme-preview-column">
          <div className="theme-miniature" style={Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--preview-${key}`, value])) as CSSProperties} aria-label="نمونه رنگ‌های انتخاب‌شده">
            <div className="theme-mini-nav"><strong>پوستیکال</strong><span/><i/></div>
            <div className="theme-mini-hero"><span>زیبایی، به انتخاب تو</span><h3>رنگ تازه،<br/>همان حس خوب.</h3><div className="theme-mini-button">کشف محصولات<AdminIcon name="arrow-left" size={16}/></div><div className="theme-mini-orb"/></div>
            <div className="theme-mini-cards"><div><i/><strong>انتخاب تو</strong><span>جزئیات هماهنگ</span></div><div><i/><strong>حس خوب</strong><span>شیشه‌ای و لطیف</span></div></div>
            <div className="theme-mini-status"><span style={{ color: palette.success }}>تأیید شده</span><span style={{ color: palette.warning }}>در انتظار</span><span style={{ color: palette.danger }}>نیاز به بررسی</span></div>
          </div>
          <label className="theme-live-toggle"><span><strong>پیش‌نمایش زنده</strong><small>تغییر رنگ‌ها در همین صفحه، پیش از ذخیره</small></span><input type="checkbox" role="switch" disabled={busy} checked={live} onChange={event => setLive(event.target.checked)}/></label>
          <p className="theme-scope-note">پس‌زمینه و موج‌ها، منوها، کارت‌ها، جدول‌ها، فرم‌ها، نمودارها، نشانگر و نوار پیمایش همگی از این پالت پیروی می‌کنند.</p>
          <p className="theme-scope-note">عکس محصولات، رنگ طبیعی پوست و لب‌های قرمز لوگو تغییر نمی‌کنند.</p>
          {(lowContrast || faintText) && <div className="theme-contrast-note" role="status"><strong>خوانایی متن را بررسی کن</strong><p>{lowContrast ? 'متن اصلی به پس‌زمینه نزدیک است. رنگ تیره‌تر یا روشن‌تری انتخاب کن.' : 'متن فرعی ممکن است کم‌رنگ دیده شود؛ کمی تضاد بیشتری به آن بده.'}</p></div>}
        </aside>
      </div>
      {remoteChanged && <div className="theme-feedback is-error" role="alert">پالت ذخیره‌شده در پنجره دیگری تغییر کرده است. پیش‌نمایش تو حفظ شده؛ برای دریافت آخرین نسخه، «دریافت پالت ذخیره‌شده» را بزن.</div>}
      {error && <div className="theme-feedback is-error" role="alert">{error}</div>}
      {message && <div className="theme-feedback" role="status"><AdminIcon name="check" size={17}/>{message}</div>}
      <div className="theme-settings-actions"><div><button className="admin-button admin-button-primary" type="submit" disabled={busy || !dirty}><AdminIcon name="check" size={18}/>{busy ? 'در حال ذخیره…' : 'ذخیره و اعمال پالت'}</button><button className="admin-button" type="button" disabled={busy || !draft} onClick={discard}>لغو پیش‌نمایش</button></div><div><button className="theme-reset-button" type="button" disabled={busy} onClick={() => edit({ ...defaultPalette })}>بازگشت به رنگ‌های پوستیکال</button>{(remoteChanged || error) && <button className="theme-reset-button" type="button" disabled={busy} onClick={reload}>دریافت پالت ذخیره‌شده</button>}</div></div>
    </form>
  </AdminPanel>;
}
