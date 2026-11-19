'use client';

import { useEffect, useRef } from 'react';
import type { SkinSceneHandle } from '@/lib/skin-model-scene';

/** The same tissue texture remains visible while the 3D scene loads. */
function SkinModelFallback() {
  return <div className="skin-model-fallback" aria-hidden="true">
    <div className="skin-tissue-preview">
      <span className="skin-tissue-preview-front"/>
      <span className="skin-tissue-preview-side"/>
      <span className="skin-tissue-preview-top"/>
    </div>
  </div>;
}

export function SkinModel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let disposed = false;
    let loading = false;
    let contextLost = false;
    let visible = false;
    let failed = false;
    let frame = 0;
    let visibilityFrame = 0;
    let lastTime = 0;
    let lastReport = 0;
    let angle = 0;
    let scene: SkinSceneHandle | null = null;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    }

    function draw() {
      if (!scene || disposed || contextLost) return false;
      try {
        scene.render(angle, Math.sin(angle * .65) * .055);
        return true;
      } catch {
        stop();
        failed = true;
        host!.dataset.renderer = 'fallback';
        host!.dataset.ready = 'false';
        return false;
      }
    }

    function tick(time: number) {
      frame = 0;
      if (disposed || !visible || document.hidden || preference.matches || !scene || contextLost || failed) return;
      if (lastTime) angle += Math.min((time - lastTime) / 1000, .08) * (Math.PI * 2 / 30);
      lastTime = time;
      if (!draw()) return;
      if (time - lastReport > 250) {
        host!.dataset.rotation = angle.toFixed(3);
        lastReport = time;
      }
      frame = requestAnimationFrame(tick);
    }

    function syncMotion() {
      stop();
      if (disposed || !scene || contextLost || failed) return;
      host!.dataset.motion = preference.matches ? 'reduced' : visible && !document.hidden ? 'rotating' : 'paused';
      draw();
      if (visible && !document.hidden && !preference.matches) frame = requestAnimationFrame(tick);
    }

    function checkVisibility() {
      const bounds = host!.getBoundingClientRect();
      const next = bounds.bottom > 0 && bounds.top < window.innerHeight
        && bounds.right > 0 && bounds.left < window.innerWidth;
      const changed = visible !== next;
      visible = next;
      if (changed) syncMotion();
    }

    function onScroll() {
      if (visibilityFrame) return;
      visibilityFrame = requestAnimationFrame(() => {
        visibilityFrame = 0;
        if (!disposed) checkVisibility();
      });
    }

    function resize() {
      if (!scene || disposed || contextLost) return;
      const bounds = host!.getBoundingClientRect();
      scene.resize(Math.max(1, bounds.width), Math.max(1, bounds.height), Math.min(1.75, window.devicePixelRatio || 1));
      checkVisibility();
      draw();
    }

    function load() {
      if (disposed || loading || scene || failed || contextLost) return;
      loading = true;
      void import('@/lib/skin-model-scene').then(async ({ createSkinModelScene }) => {
        if (disposed || contextLost) return;
        const loadedScene = await createSkinModelScene(canvas!);
        if (disposed || contextLost) { loadedScene.dispose(); return; }
        scene = loadedScene;
        resize();
        if (!draw()) return;
        host!.dataset.renderer = 'webgl';
        host!.dataset.ready = 'true';
        syncMotion();
      }).catch(() => {
        if (disposed) return;
        failed = true;
        host!.dataset.renderer = 'fallback';
        host!.dataset.ready = 'false';
      }).finally(() => { loading = false; });
    }

    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stop();
      host!.dataset.renderer = 'fallback';
      host!.dataset.ready = 'false';
    }

    function onContextRestored() {
      if (disposed) return;
      contextLost = false;
      failed = false;
      scene?.dispose();
      scene = null;
      load();
    }

    const near = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { load(); near.disconnect(); }
    }, { rootMargin: '180px' });
    const onscreen = new IntersectionObserver(checkVisibility);
    const observer = new ResizeObserver(resize);
    near.observe(host);
    onscreen.observe(host);
    observer.observe(host);
    document.addEventListener('visibilitychange', syncMotion);
    window.addEventListener('scroll', onScroll, { passive: true });
    preference.addEventListener('change', syncMotion);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      disposed = true;
      stop();
      if (visibilityFrame) cancelAnimationFrame(visibilityFrame);
      near.disconnect();
      onscreen.disconnect();
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncMotion);
      window.removeEventListener('scroll', onScroll);
      preference.removeEventListener('change', syncMotion);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      scene?.dispose();
    };
  }, []);

  return <div ref={hostRef} className="skin-model" data-renderer="loading" data-ready="false" aria-hidden="true">
    <SkinModelFallback/>
    <canvas ref={canvasRef} className="skin-model-canvas"/>
  </div>;
}
