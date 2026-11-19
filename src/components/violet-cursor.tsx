'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useRef } from 'react';

type TrailPoint = { x: number; y: number; time: number };

const NATIVE_POINTER = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]),textarea,select,[contenteditable="true"],[data-native-cursor],iframe';
const INTERACTIVE = 'a,button,summary,label,[role="button"],input[type="checkbox"],input[type="radio"],input[type="range"]';

/** An ornamental pointer: no React renders on movement, no animation loop while idle. */
export function VioletCursor() {
  const {settings:{effects}}=useSiteSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current, dot = dotRef.current, canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!root || !dot || !canvas || !context) return;

    const mouse = matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = matchMedia('(forced-colors: active)');
    const supportsPopover = typeof root.showPopover === 'function';
    let active = false, frame = 0, width = 0, height = 0;
    let trailColor = '';
    const updateColor = () => { trailColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-secondary-rgb').trim(); };
    let points: TrailPoint[] = [];
    const allowed = () => effects.cursor && mouse.matches && !reduced.matches && !contrast.matches;

    function resize() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      points = [];
    }

    function hide() {
      active = false; points = [];
      cancelAnimationFrame(frame); frame = 0;
      context!.clearRect(0, 0, width, height);
      document.documentElement.classList.remove('violet-cursor-active');
      root!.removeAttribute('data-visible');
      root!.removeAttribute('data-pressed');
      if (supportsPopover && root!.matches(':popover-open')) root!.hidePopover();
    }

    function liftAboveDialogs() {
      if (!active) return;
      if (!supportsPopover) { if (document.querySelector('dialog[open]')) hide(); return; }
      // Native dialogs occupy the top layer; the decorative popover must follow them.
      if (root!.matches(':popover-open')) root!.hidePopover();
      root!.showPopover();
    }

    function draw(now: number) {
      frame = 0;
      context!.clearRect(0, 0, width, height);
      points = points.filter(point => now - point.time < 150);
      context!.lineCap = 'round'; context!.lineJoin = 'round';
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1], point = points[i];
        const life = Math.max(0, 1 - (now - point.time) / 150);
        context!.beginPath(); context!.moveTo(previous.x, previous.y);
        context!.lineTo(point.x, point.y);
        context!.strokeStyle = `rgba(${trailColor}, ${life * 0.12})`;
        context!.lineWidth = 0.25 + life * 0.65;
        context!.shadowColor = `rgba(${trailColor}, 0.18)`; context!.shadowBlur = 3;
        context!.stroke();
      }
      context!.shadowBlur = 0;
      if (active && points.length) frame = requestAnimationFrame(draw);
    }

    function move(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!allowed() || event.pointerType !== 'mouse' || target?.closest(NATIVE_POINTER)
        || (!supportsPopover && document.querySelector('dialog[open]'))
        || event.clientX >= document.documentElement.clientWidth || event.clientY >= document.documentElement.clientHeight) {
        hide(); return;
      }
      if (!active) {
        active = true;
        if (supportsPopover) root!.showPopover();
        root!.setAttribute('data-visible', '');
        document.documentElement.classList.add('violet-cursor-active');
      }
      dot!.style.transform = 'translate3d(' + event.clientX + 'px,' + event.clientY + 'px,0)';
      root!.toggleAttribute('data-interactive', !!target?.closest(INTERACTIVE));
      const now = performance.now(), previous = points.at(-1);
      const delta = previous ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y) : 0;
      if (!previous || delta > 1.5) {
        points.push({ x: event.clientX, y: event.clientY, time: now });
        if (points.length > 18) points.shift();
      }
      if (!frame) frame = requestAnimationFrame(draw);
    }
    const press = (event: PointerEvent) => { if (event.pointerType === 'mouse' && active) root.setAttribute('data-pressed', ''); else hide(); };
    const release = () => root.removeAttribute('data-pressed');
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) hide(); };
    const visibility = () => { if (document.hidden) hide(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Tab') hide(); };
    const preference = () => { if (!allowed()) hide(); };
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('dialog') || node.querySelector('dialog'))))) liftAboveDialogs();
    });
    resize();
    updateColor();
    window.addEventListener('poostikal:theme', updateColor);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', move, { passive: true });
    window.addEventListener('pointerdown', press, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('pointercancel', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    for (const query of [mouse, reduced, contrast]) query.addEventListener('change', preference);
    return () => {
      hide(); observer.disconnect();
      window.removeEventListener('poostikal:theme', updateColor);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerover', move);
      window.removeEventListener('pointerdown', press); window.removeEventListener('pointerup', release);
      window.removeEventListener('pointerout', leave); window.removeEventListener('pointercancel', hide);
      window.removeEventListener('blur', hide); window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keyboard); document.removeEventListener('visibilitychange', visibility);
      for (const query of [mouse, reduced, contrast]) query.removeEventListener('change', preference);
    };
  }, [effects.cursor]);

  return <div ref={rootRef} className="violet-cursor" popover="manual" aria-hidden="true">
    <canvas ref={canvasRef} />
    <span ref={dotRef} className="violet-cursor-position"><span className="violet-cursor-dot" /></span>
  </div>;
}
