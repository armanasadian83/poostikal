'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import type { UnboxingSceneConfig } from '@/lib/animation-config';
import type { ProductUnboxingSceneHandle } from '@/lib/product-unboxing-scene';
import type { Product } from '@/lib/catalog';
import { Icon } from './icons';
import { ProductLabelReader, productLabelPhotos } from './product-label-reader';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function ProductUnboxing({ children, config, modelUrl, images, name = "محصول", poster = "/images/unboxing/caffeina-closed-cutout.png" }: { children: ReactNode; config?:UnboxingSceneConfig; modelUrl?:string; images?:Product['images']; name?:string; poster?:string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const activeScene=useRef<ProductUnboxingSceneHandle|null>(null);
  const zoomRef=useRef(false);
  const [magnified,setMagnified]=useState(false);
  const [readerSide,setReaderSide]=useState<'front'|'back'|null>(null);
  const readerButton=useRef<HTMLButtonElement>(null);
  const labels=productLabelPhotos(images);
  function toggleMagnification(){
    zoomRef.current=!zoomRef.current;
    setMagnified(zoomRef.current);
    activeScene.current?.setMagnified?.(zoomRef.current);
  }

  useEffect(() => {
    const section = sectionRef.current;
    const column = columnRef.current;
    const visual = visualRef.current;
    const canvas = canvasRef.current;
    if (!section || !column || !visual || !canvas) return;

    const navigation = document.querySelector<HTMLElement>('.navigation-wrap');
    const mobileQuery = window.matchMedia('(max-width: 760px)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pendingFrame = 0;
    let topOffset = -1;
    let lastProgress = -1;
    let scene: ProductUnboxingSceneHandle | null = null;
    let disposed = false;
    let contextLost = false;
    let loading = false;
    let generation = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    visual.dataset.renderer = 'loading';
    visual.setAttribute('aria-busy', 'true');

    const showFallback = () => {
      if (disposed) return;
      visual.dataset.renderer = 'fallback';
      visual.setAttribute('aria-busy', 'false');
      setFailed(true);
    };

    const draw = () => {
      if (!scene || disposed || contextLost) return;
      try {
        const bounds = canvas.getBoundingClientRect();
        if (bounds.width !== lastWidth || bounds.height !== lastHeight) {
          lastWidth = bounds.width;
          lastHeight = bounds.height;
          scene.resize(Math.max(1, lastWidth), Math.max(1, lastHeight), Math.min(2, window.devicePixelRatio || 1));
        }
        scene.render(Math.max(0, lastProgress));
        visual.dataset.renderer = 'webgl';
        visual.setAttribute('aria-busy', 'false');
      } catch {
        showFallback();
      }
    };

    const renderProgress = (progress: number) => {
      if (progress === lastProgress) return;
      lastProgress = progress;
      section.dataset.progress = progress.toFixed(4);
      section.dataset.step = String(progress < .2 ? 1 : progress < .43 ? 2 : progress < .78 ? 3 : 4);
      draw();
    };

    const update = () => {
      pendingFrame = 0;
      const desiredOffset = (navigation?.getBoundingClientRect().height ?? 0) + 14;
      const nextOffset = Math.round(desiredOffset);
      if (nextOffset !== topOffset) {
        topOffset = nextOffset;
        section.style.setProperty('--unboxing-top', `${topOffset}px`);
      }

      const reducedMotion = reducedMotionQuery.matches;
      section.dataset.reducedMotion = String(reducedMotion);
      if (reducedMotion) {
        renderProgress(1);
        return;
      }

      const track = mobileQuery.matches ? column : section;
      const trackRect = track.getBoundingClientRect();
      const range = Math.max(1, trackRect.height - visual.getBoundingClientRect().height);
      renderProgress(clamp((topOffset - trackRect.top) / range));
    };

    const scheduleUpdate = () => {
      if (!pendingFrame) pendingFrame = window.requestAnimationFrame(update);
    };
    const load = () => {
      if (disposed || loading || scene || contextLost) return;
      loading = true;
      const currentGeneration = ++generation;
      const cancelled = () => disposed || currentGeneration !== generation || contextLost;
      const create = async () => {
        if(modelUrl){const sceneModule=await import('@/lib/uploaded-animation-scene');if(cancelled())return null;return sceneModule.createUploadedAnimationScene(canvas,modelUrl,cancelled);}
        const sceneModule=await import('@/lib/product-unboxing-scene');if(cancelled())return null;return sceneModule.createProductUnboxingScene(canvas,cancelled,config);
      };
      void create().then(handle => {
        if (!handle) return;
        if (disposed || currentGeneration !== generation || contextLost) { handle.dispose(); return; }
        scene = handle;
        activeScene.current=handle;
        if(zoomRef.current)handle.setMagnified?.(true);
        lastWidth = 0;
        lastHeight = 0;
        update();
        draw();
        if (visual.dataset.renderer === 'webgl') setFailed(false);
      }).catch(() => {
        if (!disposed && currentGeneration === generation) showFallback();
      }).finally(() => {
        if (currentGeneration === generation) loading = false;
      });
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      activeScene.current=null;
      ++generation;
      loading = false;
      showFallback();
    };
    const onContextRestored = () => {
      if (disposed) return;
      contextLost = false;
      visual.dataset.renderer = 'loading';
      visual.setAttribute('aria-busy', 'true');
      scene?.dispose();
      scene = null;
      load();
    };
    const resizeObserver = new ResizeObserver(() => { scheduleUpdate(); draw(); });
    resizeObserver.observe(section);
    resizeObserver.observe(column);
    resizeObserver.observe(visual);
    if (navigation) resizeObserver.observe(navigation);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    mobileQuery.addEventListener('change', scheduleUpdate);
    reducedMotionQuery.addEventListener('change', scheduleUpdate);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    const near = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { load(); near.disconnect(); }
    }, { rootMargin: '400px' });
    near.observe(visual);
    update();

    return () => {
      disposed = true;
      activeScene.current=null;
      ++generation;
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
      resizeObserver.disconnect();
      near.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      mobileQuery.removeEventListener('change', scheduleUpdate);
      reducedMotionQuery.removeEventListener('change', scheduleUpdate);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      scene?.dispose();
    };
  }, [config,modelUrl]);

  return <section className="product-unboxing generated-unboxing" ref={sectionRef} data-progress="0" data-step="1">
    <div className="unboxing-visual-column" ref={columnRef}>
      <figure className="unboxing-visual" ref={visualRef} data-model={modelUrl?'uploaded':undefined} data-renderer="loading" aria-busy="true" aria-label={modelUrl ? `نمایش سه‌بعدی ${name} با حرکت صفحه` : `نمایش سه‌بعدی باز شدن جعبهٔ ${name} با حرکت صفحه`}>
        <div className="unboxing-render-surface">
          <div className="unboxing-loading" role="status"><span className="unboxing-loading-orbit" aria-hidden="true"/><span>در حال آماده‌سازی نمایش محصول…</span></div>
          {failed ? <div className="unboxing-error"><Image className="unboxing-fallback" src={poster} alt={name} fill sizes="(max-width: 760px) 90vw, 45vw" unoptimized draggable={false}/><p role="status">نمایش سه‌بعدی در دسترس نیست.</p></div> : null}
          <noscript><Image className="unboxing-fallback" src={poster} alt={name} fill sizes="(max-width: 760px) 90vw, 45vw" /></noscript>
          <canvas ref={canvasRef} className="unboxing-canvas" aria-hidden="true"/>
        </div>
        {modelUrl&&<div className="model-view-tools"><button type="button" className="model-zoom" aria-pressed={magnified} onClick={toggleMagnification}><Icon name={magnified?'minus':'plus'} size={16}/>{magnified?'نمای کامل':'نمای نزدیک'}</button>
          {labels.length>0&&<button ref={readerButton} type="button" aria-haspopup="dialog" onClick={()=>setReaderSide(Number(canvasRef.current?.dataset.pose)>.5?'back':'front')}><Icon name="clipboard" size={16}/>خواندن برچسب</button>}</div>}
      </figure>
    </div>
    <div className="unboxing-details">{children}</div>
    {readerSide&&labels.length>0&&<ProductLabelReader photos={labels} initialSide={readerSide} returnFocus={readerButton} onDismiss={()=>setReaderSide(null)}/>}
  </section>;
}
