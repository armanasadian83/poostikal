'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { AdminProduct } from '@/lib/admin-product-model';
import { audioTime } from '@/lib/product-audio';
import { ProductAudioPlayer } from '@/components/product-audio';
import { AdminIcon } from './admin-icon';

type Recording = NonNullable<AdminProduct['audio']>;

export function AdminProductAudio({ value, productName, disabled, onChange, onBusyChange }: {
  value?: Recording | null; productName: string; disabled?: boolean;
  onChange: (audio: Recording | null) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hintId = useId();
  useEffect(() => () => controller.current?.abort(), []);

  async function upload(file?: File) {
    if (!file || disabled || controller.current) return;
    setError('');
    if (!/\.(mp3|wav|m4a)$/i.test(file.name)) { setError('فایل صوتی MP3، WAV یا M4A انتخاب کن.'); return; }
    if (!file.size || file.size > 10 * 1024 * 1024) { setError('فایل باید خالی نباشد و حجم آن حداکثر ۱۰ مگابایت باشد.'); return; }
    const request = new AbortController(); controller.current = request;
    setBusy(true); onBusyChange(true);
    try {
      const body = new FormData(); body.set('file', file); body.set('purpose', 'product-audio');
      const result = await api<{ url: string; durationSeconds: number }>('/admin/media', { method: 'POST', body, signal: request.signal });
      if (!request.signal.aborted) onChange({ ...result, fileName: file.name, transcript: value?.transcript ?? '' });
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'بارگذاری صدا انجام نشد. دوباره امتحان کن.');
    } finally {
      controller.current = null;
      if (!request.signal.aborted) { setBusy(false); onBusyChange(false); }
    }
  }

  return <div className="admin-product-audio">
    <p className="admin-editor-section-note">یک معرفی کوتاه ضبط کن تا مشتری با شنیدن صدات، محصول رو بهتر بشناسه. برای تصاویر معمولی و انیمیشن قابل استفاده است.</p>
    <div className="admin-audio-upload" aria-busy={busy}>
      <span className="admin-audio-symbol" aria-hidden="true"><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></svg></span>
      <div className="admin-audio-file"><strong>{value ? 'فایل معرفی صوتی' : 'یک دقیقه، به صدای تو'}</strong>{value ? <span dir="ltr">{value.fileName || 'product-audio'} · {audioTime(value.durationSeconds)}</span> : null}<small id={hintId}>MP3، M4A یا WAV · حداکثر ۱۰ مگابایت و ۹۰ ثانیه<br/>زمان پیشنهادی: حدود یک دقیقه</small></div>
      <input hidden ref={input} type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav" aria-label="فایل معرفی صوتی محصول" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }}/>
      <button type="button" className="admin-button admin-button-primary" disabled={disabled || busy} aria-describedby={hintId} onClick={() => input.current?.click()}><AdminIcon name="upload" size={18}/>{busy ? 'در حال بارگذاری…' : value ? 'جایگزینی فایل صوتی' : 'انتخاب فایل صوتی'}</button>
      {value ? <button type="button" className="admin-icon-button" disabled={disabled || busy} aria-label="حذف معرفی صوتی" onClick={() => { setError(''); onChange(null); }}><AdminIcon name="trash" size={18}/></button> : null}
    </div>
    <div role="status" aria-live="polite" className="admin-audio-status">{busy ? 'در حال بررسی و بارگذاری فایل صوتی…' : value ? 'فایل آماده است؛ برای نمایش در فروشگاه، محصول را ذخیره کن.' : ''}</div>
    {error ? <p className="admin-audio-error" role="alert">{error}</p> : null}
    {value ? <><div className="admin-audio-preview"><span className="admin-audio-preview-label">پیش‌نمایش پخش</span><ProductAudioPlayer audio={value} productName={productName || 'محصول'}/></div><label className="admin-form-field"><span>متن معرفی صوتی (اختیاری)</span><textarea disabled={disabled || busy} rows={4} maxLength={10000} value={value.transcript} placeholder="متن ضبط‌شده را اینجا بنویس…" onChange={event => onChange({ ...value, transcript: event.target.value })}/><small>برای کسانی که ترجیح می‌دهند معرفی را بخوانند؛ زیر پخش‌کننده قابل باز شدن است.</small></label></> : null}
  </div>;
}
