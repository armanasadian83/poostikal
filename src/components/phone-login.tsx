'use client';
import {setCartOwner,finishAnalysisPurchase,forgetAnalysisBundle} from '@/lib/store';
import {useSiteSettings} from './site-settings-provider';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { normalizeIranianMobile } from '@/lib/phone';
import { BannerBackdrop } from './banner-backdrop';
import { LoginCodeInput, type LoginCodeInputHandle } from './login-code-input';
import { LoginLipSculpture, type LoginLipSculptureHandle } from './login-lip-sculpture';

type Phase = 'phone' | 'closing' | 'opening' | 'code';
const MOTION_MS = 1900;
const smooth = (start: number, end: number, value: number) => {
  const p = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return p * p * (3 - 2 * p);
};

export function PhoneLogin({shopping=false,analysisPurchase=false}:{shopping?:boolean;analysisPurchase?:boolean}) {
  const {settings:{login:config,branding}}=useSiteSettings();
  const router = useRouter();
  const [purchaseRetry,setPurchaseRetry]=useState(false);
  const [requestBusy,setRequestBusy] = useState(false);
  const id = useId();
  const sceneRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const mouthRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<LoginCodeInputHandle>(null);
  const lipsRef = useRef<LoginLipSculptureHandle>(null);
  const phaseRef = useRef<Phase>('phone');
  const transitionLock = useRef(false);
  const frameRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const travelRef = useRef({ header: 190, content: 0 });
  const focusNext = useRef<'phone' | 'code' | null>(null);
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const busy = requestBusy || phase === 'closing' || phase === 'opening';
  const showCode = phase === 'opening' || phase === 'code';
  const inputId = id + '-phone';
  const feedbackId = id + '-feedback';

  const paintOpen = useCallback((value: number) => {
    const p = Math.max(0, Math.min(1, value));
    const closed = 1 - p;
    lipsRef.current?.setOpen(p);
    const scene = sceneRef.current;
    if (!scene) return;
    scene.style.setProperty('--mouth-open', p.toFixed(5));
    scene.style.setProperty('--content-opacity', smooth(.07, .70, p).toFixed(5));
    scene.style.setProperty('--content-x', (.74 + .26 * p).toFixed(5));
    scene.style.setProperty('--content-y', (.07 + .93 * p).toFixed(5));
    scene.style.setProperty('--content-shift', (closed * travelRef.current.content).toFixed(3) + 'px');
    scene.style.setProperty('--content-clip', (closed * 43).toFixed(3) + '%');
    scene.style.setProperty('--header-opacity', smooth(.12, .78, p).toFixed(5));
    scene.style.setProperty('--header-shift', (closed * travelRef.current.header).toFixed(3) + 'px');
    scene.style.setProperty('--header-x', (.55 + .45 * p).toFixed(5));
    scene.style.setProperty('--header-y', (.08 + .92 * p).toFixed(5));
    scene.style.setProperty('--well-open', (.05 + .95 * p).toFixed(5));
    for (let index = 0; index < 6; index++) {
      scene.style.setProperty('--digit-' + index, smooth(.14 + index * .045, .50 + index * .05, p).toFixed(5));
    }
  }, []);

  const cancelMotion = useCallback(() => {
    runRef.current++;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const finish = useCallback(() => {
    cancelMotion();
    paintOpen(1);
    phaseRef.current = 'code';
    transitionLock.current = false;
    focusNext.current = 'code';
    setPhase('code');
    setAnnouncement('کد شش‌رقمی ورود را وارد کن.');
  }, [cancelMotion, paintOpen]);

  const startMotion = useCallback(() => {
    cancelMotion();
    const run = runRef.current;
    const started = performance.now();
    let swapped = false;
    const mouth = mouthRef.current?.getBoundingClientRect();
    const header = headerRef.current?.getBoundingClientRect();
    const content = contentRef.current?.getBoundingClientRect();
    if (mouth && header && content) {
      const seam = mouth.top + mouth.height * .52;
      travelRef.current = { header: seam - header.bottom, content: seam - (content.top + content.height / 2) };
    }
    function tick(timestamp: number) {
      if (run !== runRef.current) return;
      const progress = Math.max(0, Math.min(1, (timestamp - started) / MOTION_MS));
      // One curve controls the material, cavity and swallowed content; no pose swap.
      paintOpen((1 + Math.cos(2 * Math.PI * progress)) / 2);
      if (!swapped && progress >= .5) {
        swapped = true;
        phaseRef.current = 'opening';
        setPhase('opening');
      }
      if (progress >= 1) finish();
      else frameRef.current = requestAnimationFrame(tick);
    }
    paintOpen(1);
    frameRef.current = requestAnimationFrame(tick);
  }, [cancelMotion, finish, paintOpen]);

  useEffect(() => cancelMotion, [cancelMotion]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => {
      if (preference.matches && (phaseRef.current === 'closing' || phaseRef.current === 'opening')) finish();
    };
    preference.addEventListener('change', reduce);
    return () => preference.removeEventListener('change', reduce);
  }, [finish]);

  useEffect(() => {
    if (busy || !focusNext.current) return;
    const next = focusNext.current;
    focusNext.current = null;
    if (next === 'code') codeRef.current?.focus();
    else inputRef.current?.focus();
  }, [phase, busy]);

  async function receiveCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transitionLock.current || requestBusy) return;
    const normalized = normalizeIranianMobile(phone);
    if (!normalized) {
      const message = 'یک شمارهٔ موبایل معتبر وارد کن عزیزم.';
      setFeedback(message);
      setHasError(true);
      setAnnouncement(message);
      inputRef.current?.focus();
      return;
    }
    setRequestBusy(true);
    try {
      await api('/customer/otp',{method:'POST',body:JSON.stringify({phone:normalized})});
    } catch(error) {
      const message=error instanceof Error?error.message:'ارسال کد انجام نشد.';
      setFeedback(message);
      setAnnouncement(message);
      setHasError(true);
      setRequestBusy(false);
      return;
    }
    setRequestBusy(false);
    sceneRef.current?.focus({ preventScroll: true });
    transitionLock.current = true;
    setPhone(normalized);
    setCode('');
    setFeedback(null);
    setHasError(false);
    setAnnouncement('در حال آماده کردن ورودی کد.');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      phaseRef.current = 'closing';
      setPhase('closing');
      startMotion();
    }
  }

  async function completePurchase(){
    setRequestBusy(true);
    try {await finishAnalysisPurchase();router.replace('/');}
    catch(error){setPurchaseRetry(true);setFeedback(error instanceof Error?error.message:'افزودن محصولات انجام نشد.');setHasError(true);setRequestBusy(false);}
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(transitionLock.current||requestBusy)return;
    if(!/^[0-9]{6}$/.test(code)){setFeedback("کد ۶ رقمی را کامل وارد کن.");setHasError(true);codeRef.current?.focus();return;}
    setRequestBusy(true);
    try {
      const {customerId}=await api<{customerId:string}>('/customer/verify',{method:'POST',body:JSON.stringify({phone,code})});
      setCartOwner(customerId);
      if(analysisPurchase)await completePurchase();
      else router.replace('/');
    } catch(error) {
      setFeedback(error instanceof Error ? error.message : 'ورود انجام نشد.');
      setHasError(true);
      setRequestBusy(false);
    }
  }

  function editPhone() {
    if (transitionLock.current) return;
    cancelMotion();
    paintOpen(1);
    phaseRef.current = 'phone';
    focusNext.current = 'phone';
    setPhase('phone');
    setCode('');
    setFeedback(null);
    setHasError(false);
    setAnnouncement('شماره موبایلت رو ویرایش کن.');
  }

  return <main className="phone-login login-sculpture-page" id="main-content">
    <h1 className="login-screen-reader">ورود به پوستیکال</h1>
    <BannerBackdrop/>
    <div ref={sceneRef} tabIndex={-1} className={'login-scene is-' + phase} data-phase={phase} aria-busy={busy || undefined}>
      <div ref={headerRef} className="login-brand-header" inert={busy || undefined} aria-hidden={busy || undefined}>
        <Link href="/" className="login-brand-link" aria-label="پوستیکال، بازگشت به فروشگاه">
          <Image src={branding.logo} alt={branding.logoAlt} width={2039} height={367} priority sizes="260px"/>
        </Link>
        <p>{showCode ? config.codeIntro : (shopping?'برای خرید، اول با شماره موبایلت وارد حساب شو.':config.intro)}</p>
      </div>
      <div ref={mouthRef} className="login-mouth">
        <div className="login-mouth-glow" aria-hidden="true"/>
        <div className="login-mouth-well" aria-hidden="true"/>
        <div ref={contentRef} className="login-mouth-content" inert={busy || undefined} aria-hidden={busy || undefined}>
          {purchaseRetry ? <div className="login-form">
            <p role="alert">{feedback}</p>
            <button className="login-submit" disabled={requestBusy} onClick={()=>void completePurchase()}>تلاش دوباره برای افزودن محصولات</button>
            <button disabled={requestBusy} onClick={()=>{forgetAnalysisBundle();router.replace('/');}}>رفتن به خانه</button>
          </div> : showCode ? <form className="login-form login-code-form" onSubmit={verifyCode} noValidate>
            <div className="login-code-heading"><h2>{config.codeLabel}</h2><button type="button" onClick={editPhone} disabled={busy}>{config.editLabel}</button></div>
            <LoginCodeInput ref={codeRef} value={code} onChange={value => { setCode(value); setFeedback(null); setHasError(false); }} disabled={busy} error={hasError} describedBy={feedbackId}/>
            <button type="submit" className="login-submit" disabled={busy}>{config.verifyLabel}</button>
            <p id={feedbackId} className={'login-form-feedback' + (hasError ? ' is-error' : '')}>{feedback ?? config.help}</p>
          </form> : <form className="login-form login-phone-form" onSubmit={receiveCode} noValidate>
            <label htmlFor={inputId}>{config.phoneLabel}</label>
            <div className={'login-phone-field' + (hasError ? ' has-error' : '')}>
              <input ref={inputRef} id={inputId} type="tel" required inputMode="tel" autoComplete="tel" dir="ltr" maxLength={24} placeholder={config.phonePlaceholder} value={phone} onChange={event => { setPhone(event.target.value); setFeedback(null); setHasError(false); }} aria-invalid={hasError || undefined} aria-describedby={feedbackId} enterKeyHint="go" spellCheck={false} disabled={busy}/>
            </div>
            <button type="submit" className="login-submit" disabled={busy}>{config.sendLabel}</button>
            <p id={feedbackId} className={'login-form-feedback' + (hasError ? ' is-error' : '')}>{feedback ?? config.help}</p>
          </form>}
        </div>
        <div style={!config.showLips?{visibility:"hidden"}:undefined} className="login-lip-visual" aria-hidden="true"><LoginLipSculpture ref={lipsRef}/></div>
      </div>
    </div>
    <p className="login-screen-reader" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </main>;
}

