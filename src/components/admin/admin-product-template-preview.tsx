'use client';

import Image from 'next/image';
import { useEffect, useMemo, useId, useRef, useState } from 'react';
import type { AdminAnimationConfig } from '@/lib/admin-product-model';
import type { ProductUnboxingSceneHandle } from '@/lib/product-unboxing-scene';
import { sceneConfig } from '@/lib/animation-config';
import { formatNumber } from '@/lib/format';
import { AdminIcon } from './admin-icon';

type PreviewProps={animation:AdminAnimationConfig;onReady:()=>void};
export function AdminProductTemplatePreview(props:PreviewProps) {
  if(props.animation.assetUrl && props.animation.assetType==='video')return <UploadedVideoPreview {...props}/>;
  return <ScenePreview {...props}/>;
}
function UploadedVideoPreview({animation,onReady}:PreviewProps) {
  const [error,setError]=useState(false);
  return <div className="admin-uploaded-preview"><video src={animation.assetUrl} controls playsInline preload="metadata" onLoadedData={onReady} onError={()=>setError(true)}/>{error?<p role="alert" className="admin-form-error">فایل ویدیو پخش نشد؛ فایل را بررسی کن.</p>:<p className="admin-media-note">حرکت را تا پایان بررسی کن؛ در فروشگاه، موقعیت ویدیو با اسکرول تغییر می‌کند.</p>}</div>;
}
function ScenePreview({animation,onReady}:PreviewProps) {
  const config = useMemo(()=>sceneConfig(animation),[animation]);
  const onReadyRef = useRef(onReady);
  useEffect(()=>{onReadyRef.current=onReady;},[onReady]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ProductUnboxingSceneHandle | null>(null);
  const progressRef = useRef(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sliderId = useId();

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface || (!config && !animation.assetUrl)) return;
    let disposed = false;
    let contextUnavailable = false;
    let scene: ProductUnboxingSceneHandle | null = null;
    const unavailable = () => {
      contextUnavailable = true;
      sceneRef.current = null;
      scene?.dispose();
      scene = null;
      if (!disposed) { setStatus('unavailable'); setPlaying(false); }
    };
    const draw = () => {
      if (!scene || disposed) return;
      const bounds = surface.getBoundingClientRect();
      try {
        scene.resize(Math.max(1, bounds.width), Math.max(1, bounds.height), Math.min(2, window.devicePixelRatio || 1));
        scene.render(progressRef.current);
      } catch { unavailable(); }
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      unavailable();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    const observer = new ResizeObserver(draw);
    observer.observe(surface);
    const load = async () => {
      const cancelled=()=>disposed||contextUnavailable;
      if(config){const sceneModule=await import('@/lib/product-unboxing-scene');if(cancelled())return null;return sceneModule.createProductUnboxingScene(canvas,cancelled,config);}
      const sceneModule=await import('@/lib/uploaded-animation-scene');if(cancelled())return null;return sceneModule.createUploadedAnimationScene(canvas,animation.assetUrl!,cancelled);
    };
    void load().then(handle => {
      if (!handle) return;
      if (disposed || contextUnavailable) { handle.dispose(); return; }
      scene = handle;
      sceneRef.current = handle;
      draw();
      if (!contextUnavailable) { setStatus('ready'); onReadyRef.current(); }
    }).catch(() => { if (!disposed) unavailable(); });
    return () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [config,animation.assetUrl]);

  useEffect(() => {
    progressRef.current = progress;
    sceneRef.current?.render(progress);
  }, [progress]);

  useEffect(() => {
    if (!playing || status !== 'ready') return;
    let frame = 0;
    let previousTime: number | null = null;
    const animate = (time: number) => {
      const elapsed = previousTime === null ? 0 : Math.min(50, time - previousTime);
      previousTime = time;
      const next = Math.min(1, progressRef.current + elapsed / 10500);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) { setPlaying(false); return; }
      frame = window.requestAnimationFrame(animate);
    };
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    frame = window.requestAnimationFrame(animate);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', pauseWhenHidden); };
  }, [playing, status]);

  const pouch = animation.template === 'pouch-box';
  const phase = progress < (pouch ? .025 : .2) ? 'بسته‌بندی بسته' : progress < (pouch ? .35 : .43) ? 'باز شدن درِ جعبه' : progress < .78 ? 'بیرون آمدن محصول' : pouch ? 'قرار گرفتن پاکت کنار جعبه' : 'قرار گرفتن محصول پشت جعبه';
  return <div className="admin-template-preview">
    <p className="admin-template-preview-note"><AdminIcon name="sparkles" size={18}/>این پیش‌نمایش با تصاویر و ابعاد همین محصول آماده شده؛ در فروشگاه، همین حرکت با اسکرول کنترل می‌شود.</p>
    <div ref={surfaceRef} className={`admin-template-preview-surface${status === 'ready' ? ' is-ready' : ''}`} role="img" aria-label={`پیش‌نمایش سه‌بعدی محصول؛ ${phase}`}>
      <Image className="admin-template-preview-fallback" src={animation.references.find(ref=>ref.slot==='closed')?.image?.url || animation.build?.cartonUrl || "/brand/poostikal-wordmark-transparent.png"} alt="" width={550} height={500} unoptimized/>
      <canvas ref={canvasRef} aria-hidden="true"/>
    </div>
    {status === 'loading' ? <p className="admin-small admin-muted" role="status">در حال بارگذاری نمایش محصول…</p> : null}
    {status === 'unavailable' ? <p className="admin-small admin-muted" role="status">نمایش سه‌بعدی در این مرورگر در دسترس نیست؛ تصویر مرجع نمایش داده شد. تأیید نمایش سه‌بعدی به مرورگر سازگار نیاز دارد.</p> : null}
    <div className="admin-template-preview-controls">
      <button type="button" className="admin-button" disabled={status !== 'ready'} onClick={() => { if (progressRef.current >= 1) { progressRef.current = 0; setProgress(0); } setPlaying(value => !value); }}><AdminIcon name={playing ? 'pause' : 'play'} size={17}/>{playing ? 'توقف' : 'پخش انیمیشن'}</button>
      <button type="button" className="admin-icon-button" disabled={status !== 'ready'} aria-label="بازگشت پیش‌نمایش به ابتدا" onClick={() => { setPlaying(false); progressRef.current = 0; setProgress(0); }}><AdminIcon name="refresh" size={17}/></button>
      <label htmlFor={sliderId} className="admin-small">حرکت انیمیشن</label><input id={sliderId} type="range" min={0} max={1000} step={1} value={Math.round(progress * 1000)} disabled={status !== 'ready'} dir="ltr" aria-valuetext={`${formatNumber(Math.round(progress * 100))} درصد · ${phase}`} onChange={event => { setPlaying(false); const next = Number(event.target.value) / 1000; progressRef.current = next; setProgress(next); }}/><output htmlFor={sliderId}>{formatNumber(Math.round(progress * 100))}٪</output>
    </div>
    <p className="admin-small admin-muted">{phase} · در صفحهٔ محصول، همین نوع حرکت با اسکرول جلو و عقب کنترل می‌شود.</p>
    
  </div>;
}
