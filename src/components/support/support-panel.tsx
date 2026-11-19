'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { useTreatmentPhoto } from '../use-treatment-photo';
import { api } from '@/lib/api';
import { normalizeIranianMobile } from '@/lib/phone';
import { Icon } from '../icons';
import { useSiteSettings } from '../site-settings-provider';
import { Conversation } from './conversation';
import styles from './support.module.css';

export default function SupportPanel({onClose}: {onClose: () => void}) {
  const { settings: { effects } } = useSiteSettings();
  const panel = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const photoMask = useRef<SVGFEFloodElement>(null);
  useTreatmentPhoto(panel, pathname === '/', photoMask);
  const [thread, setThread] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [needsPhone, setNeedsPhone] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const resolveSession = useCallback((mobile?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return api<{threadId: string | null}>('/support/open', {
      method:'POST', body:JSON.stringify(mobile ? {phone: mobile} : {}), signal:controller.signal,
    }).then(result => {
      if (!controller.signal.aborted) { setThread(result.threadId); setNeedsPhone(!result.threadId); }
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'ارتباط برقرار نشد.');
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
  }, []);
  useEffect(() => {
    void resolveSession();
    return () => request.current?.abort();
  }, [resolveSession, session]);
  useEffect(()=>{ closeButton.current?.focus({preventScroll:true}); },[]);
  const reset = useCallback(() => { setBusy(true); setError(''); setThread(null); setNeedsPhone(false); setSession(v=>v+1); },[]);
  function enter(e: FormEvent) {
    e.preventDefault();
    const mobile=normalizeIranianMobile(phone);
    if (!mobile) { setError('شماره موبایل رو کامل وارد کن.'); return; }
    setBusy(true); setError('');
    void resolveSession(mobile);
  }

  return <div className={styles.panelFrame}>
    <svg width="0" height="0" className={styles.paletteFilter} aria-hidden="true" focusable="false">
      <defs>
        <filter id="support-photo-palette" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
          <feFlood ref={photoMask} x="0" y="0" width="0" height="0" floodColor="white" result="overPhoto"/>
          {/* Reverse luminance while keeping a plum tint in the shadows and pale lavender highlights. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="
            .26 -.98 -.10 0 .96
            -.30 -.47 -.10 0 .96
            -.28 -.96  .45 0 .99
            0    0     0   1 0" result="night"/>
          <feComposite in="night" in2="overPhoto" operator="in" result="darkRegion"/>
          <feComposite in="SourceGraphic" in2="overPhoto" operator="out" result="lightRegion"/>
          <feMerge><feMergeNode in="lightRegion"/><feMergeNode in="darkRegion"/></feMerge>
        </filter>
      </defs>
    </svg>
    <section ref={panel} className={styles.panel} role="dialog" aria-labelledby="support-title" id="support-panel"
      onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
      <div className={styles.panelWaves} data-moving={effects.waves} aria-hidden="true">
        <div className="banner-wave banner-wave-far"/>
        <div className="banner-wave banner-wave-near"/>
      </div>
      <header className={styles.panelHead}>
        <span className={styles.agentMark}><Icon name="headset" size={26}/></span>
        <h2 id="support-title">پشتیبانی پوستیکال</h2>
        <button type="button" ref={closeButton} className={styles.close} aria-label="بستن گفت‌وگو" onClick={onClose}><Icon name="close" size={20}/></button>
      </header>
      {thread ? <Conversation key={thread} path={'/support/'+thread+'/messages'} viewer="customer" onLost={reset}/> :
        <div className={styles.welcome}>
          {needsPhone ? <form onSubmit={enter}>
            <h3>چطور می‌تونیم کمکت کنیم؟</h3>
            <p>شماره موبایلت رو وارد کن تا با تیم پوستیکال گفت‌وگو کنی.</p>
            <label htmlFor="support-phone">شماره موبایل</label>
            <input id="support-phone" value={phone} onChange={e=>setPhone(e.target.value)} type="tel" autoComplete="tel" dir="ltr" maxLength={30} placeholder="09xxxxxxxxx" required/>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <button className={styles.primary} type="submit" disabled={busy}>شروع گفت‌وگو <Icon name="arrow-left" size={18}/></button>
          </form> : busy ? <p role="status">در حال باز کردن گفت‌وگو…</p> : <><p className={styles.error} role="alert">{error}</p><button className={styles.primary} onClick={reset}>تلاش دوباره</button></>}
        </div>}
    </section>
  </div>;
}
