'use client';
import {useSiteSettings} from './site-settings-provider';

import { useMemo, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import Image from 'next/image';
import { formatNumber } from '@/lib/format';

const TURN_DURATION_MS = 24000;
const ORBIT_RADIUS_PERCENT = 64;
const PRODUCT_HEIGHT_PERCENT = 44;
const FADE_DEPTH_START = .45;
const FADE_DEPTH_END = .9;
type LegacyClip = 'biohyalux' | 'genosys' | 'ribeskin';
type ArtBounds = readonly [number,number,number,number,number];
// Original silhouette bounds keep the local display art at consistent sizes.
const artBounds: Record<string, ArtBounds> = {
  'biohyalux-soothing': [246, 110, 750, 856, 1000],
  'genosys-snow-o2': [365, 96, 632, 888, 1000],
  'ribeskin-mini-carboxy': [93, 208, 929, 760, 1000],
  'oabes-carbon': [32, 58, 1173, 1196, 1254],
  'scalp-defence-shampoo': [361, 3, 893, 1249, 1254],
  'black-anti-dandruff': [449, 63, 806, 1195, 1254],
  'paul-rivera-perfect-all': [436, 43, 806, 1210, 1254],
  'genosys-powder-mask': [344, 156, 911, 1183, 1254],
  'lucamar-cc-cream': [443, 47, 816, 1203, 1254],
  'novoselix-scalp-scaler': [428, 42, 826, 1171, 1254],
  'ottienovex-r20': [482, 40, 780, 1219, 1254],
};
type OrbitItem = {
  id: string;
  image: string;
  shortName: string;
  name: string;
  kind: string;
  clip?: LegacyClip;
  transparent?: boolean;
};

// Curated banner artwork is independent of catalog records, stock and uploads.
const originalItems: OrbitItem[] = [
  { id: 'biohyalux-soothing', image: '/images/poostikal/banner-biohyalux-soothing.webp', name: 'ویال بایوهیالوکس', shortName: 'ویال بایوهیالوکس', kind: 'biohyalux', clip: 'biohyalux' },
  { id: 'genosys-snow-o2', image: '/images/poostikal/banner-snow-o2.webp', name: 'شوینده ژنوسیس', shortName: 'شوینده ژنوسیس', kind: 'genosys', clip: 'genosys' },
  { id: 'ribeskin-mini-carboxy', image: '/images/poostikal/banner-ribeskin-mini.webp', name: 'کربوکسی ریب اسکین', shortName: 'کربوکسی ریب اسکین', kind: 'ribeskin', clip: 'ribeskin' },
  ...[
    { id: 'oabes-carbon', name: 'دستگاه کربن OABES' },
    { id: 'scalp-defence-shampoo', name: 'شامپو اسکالپ دیفنس بی‌پیور' },
    { id: 'black-anti-dandruff', name: 'شامپو ضدشوره بلک' },
    { id: 'paul-rivera-perfect-all', name: 'پرفکت آل پل ریورا' },
    { id: 'genosys-powder-mask', name: 'ماسک پودری بایوفرمنت ژنوسیس' },
    { id: 'lucamar-cc-cream', name: 'سی‌سی کرم لوکامر' },
    { id: 'novoselix-scalp-scaler', name: 'لایه‌بردار پوست سر نووسلیکس' },
    { id: 'ottienovex-r20', name: 'ژل ماسک R20 اتینووکس' },
  ].map(item => ({ ...item, shortName: item.name, kind: item.id, image: `/images/poostikal/banner-products/${item.id}.png`, transparent: true })),
];
type OrbitApi = {
  step: (direction: number) => void;
  first: () => void;
  pointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  pointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  pointerEnd: (event: PointerEvent<HTMLDivElement>) => void;
  click: (event: MouseEvent<HTMLDivElement>) => void;
};

function createOrbit(items:OrbitItem[]) {
const bounds=(item:OrbitItem):ArtBounds=>originalItems.some(original=>original.id===item.id&&original.image===item.image)?(artBounds[item.id]??[0,0,1000,1000,1000]):[0,0,1000,1000,1000];
const artAspects = items.map(item => {
  const [left, top, right, bottom] = bounds(item);
  return (right - left) / (bottom - top);
});
// Wider packaging gets more room on the same continuous circle.
const gapWeights = artAspects.map((aspect, index) => .55 + (aspect + artAspects[(index + 1) % items.length]) / 2);
const totalGapWeight = gapWeights.reduce((sum, weight) => sum + weight, 0);
const angleGaps = gapWeights.map(weight => weight * 360 / totalGapWeight);
const itemAngles = [0];
for (let index = 1; index < items.length; index++) itemAngles.push(itemAngles[index - 1] + angleGaps[index - 1]);
const FRONT_CROSSING_EPSILON = .025 * Math.min(...angleGaps) / 120;

const normalize = (angle: number) => ((angle % 360) + 360) % 360;
function nearestItem(angle: number) {
  let nearest = 0;
  let nearestDepth = -Infinity;
  itemAngles.forEach((offset, index) => {
    const depth = Math.cos((angle + offset) * Math.PI / 180);
    if (depth > nearestDepth) { nearest = index; nearestDepth = depth; }
  });
  return nearest;
}
function centeredAngle(index: number, angle: number) {
  const offset = itemAngles[index];
  return Math.round((angle + offset) / 360) * 360 - offset;
}
function pose(index: number, angle: number) {
  const radians = (angle + itemAngles[index]) * Math.PI / 180;
  const depth = Math.cos(radians);
  const front = (depth + 1) / 2;
  const boundary = Math.max(0, Math.min(1, (depth - FADE_DEPTH_START) / (FADE_DEPTH_END - FADE_DEPTH_START)));
  // Zero slope and acceleration at both ends let each pack dissolve into the arc.
  const opacity = boundary ** 3 * (boundary * (boundary * 6 - 15) + 10);
  return {
    x: `${(Math.sin(radians) * ORBIT_RADIUS_PERCENT).toFixed(3)}%`,
    y: `${(depth * 24).toFixed(3)}%`,
    z: `${((depth - 1) * 120).toFixed(2)}px`,
    scale: (.72 + .28 * Math.max(0, depth)).toFixed(4),
    opacity: String(Math.round(opacity * 10000) / 10000),
    visibility: depth > FADE_DEPTH_START ? 'visible' as const : 'hidden' as const,
    order: Math.round(10 + front * 30),
    front,
  };
}
const initialStyles = items.map((item, index) => {
  const value = pose(index, 0);
  const [left, top, right, bottom, canvas] = bounds(item);
  return {
    '--orbit-x': value.x, '--orbit-y': value.y, '--orbit-z': value.z, '--orbit-scale': value.scale,
    '--orbit-art-width': `${PRODUCT_HEIGHT_PERCENT * canvas / (bottom - top)}%`,
    '--orbit-art-shift-x': `${(0.5 - (left + right) / (2 * canvas)) * 100}%`,
    '--orbit-art-shift-y': `${(1 - bottom / canvas) * 100}%`,
    opacity: value.opacity, visibility: value.visibility, zIndex: value.order,
  } as CSSProperties;
});

return {initialStyles,pose,nearestItem,centeredAngle,normalize,FRONT_CROSSING_EPSILON};
}
export function BannerProductOrbit(){
 const {settings:{orbit}}=useSiteSettings();
 const items=useMemo(()=>orbit.items.map(item=>{const original=originalItems.find(old=>old.id===item.id&&old.image===item.image);return {...item,shortName:item.name,kind:item.id,transparent:!original?.clip,clip:original?.clip};}),[orbit.items]);
 return items.length?<ProductOrbit key={JSON.stringify(items)} items={items}/>:null;
}
function ProductOrbit({items}:{items:OrbitItem[]}) {
 const geometry=useMemo(()=>createOrbit(items),[items]);
 const {initialStyles,pose,nearestItem,centeredAngle,normalize,FRONT_CROSSING_EPSILON}=geometry;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<(HTMLDivElement | null)[]>([]);
  const apiRef = useRef<OrbitApi | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const hintId = useId();
  const clipIds = { biohyalux: `${hintId}-biohyalux`, genosys: `${hintId}-genosys`, ribeskin: `${hintId}-ribeskin` };

  useEffect(() => {
    const root = rootRef.current;
    const stageNode = stageRef.current;
    if (!root || !stageNode) return;
    const stage: HTMLDivElement = stageNode;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const flags = { visible: true, hidden: document.hidden, reduced: preference.matches };
    let angle = 0;
    let frontIndex = 0;
    let frame: number | null = null;
    let lastTimestamp: number | null = null;
    let suppressClickUntil = 0;
    let tween: { from: number; to: number; elapsed: number; announce: boolean } | null = null;
    let pointer: { id: number; x: number; y: number; lastX: number; width: number; dragging: boolean } | null = null;

    function announce(index: number) {
      setAnnouncement(`${items[index].shortName}، محصول ${formatNumber(index + 1)} از ${formatNumber(items.length)}`);
    }

    function paint(forceFront = false) {
      const poses = items.map((_, index) => pose(index, angle));
      let nearest = frontIndex;
      poses.forEach((value, index) => { if (value.front > poses[nearest].front) nearest = index; });
      // A small crossing threshold prevents noisy active-link toggling at a tie.
      if (nearest !== frontIndex && (forceFront || poses[nearest].front - poses[frontIndex].front > FRONT_CROSSING_EPSILON)) {
        frontIndex = nearest;
        setActiveIndex(nearest);
      }
      poses.forEach((value, index) => {
        const node = positionsRef.current[index];
        if (!node) return;
        node.style.setProperty('--orbit-x', value.x);
        node.style.setProperty('--orbit-y', value.y);
        node.style.setProperty('--orbit-z', value.z);
        node.style.setProperty('--orbit-scale', value.scale);
        node.style.opacity = value.opacity;
        if (node.style.visibility !== value.visibility) node.style.visibility = value.visibility;
        if (node.style.zIndex !== String(value.order)) node.style.zIndex = String(value.order);
      });
    }

    const canAutoplay = () => !flags.reduced;
    const canAnimate = () => flags.visible && !flags.hidden && (tween !== null || canAutoplay());

    function stopFrame() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTimestamp = null;
    }

    function tick(timestamp: number) {
      frame = null;
      const delta = lastTimestamp === null ? 0 : Math.min(48, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      if (tween) {
        tween.elapsed += delta;
        const progress = Math.min(1, tween.elapsed / 420);
        const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        angle = tween.from + (tween.to - tween.from) * eased;
        paint(progress === 1);
        if (progress === 1) {
          const shouldAnnounce = tween.announce;
          angle = normalize(tween.to);
          tween = null;
          if (shouldAnnounce) announce(frontIndex);
        }
      } else if (canAutoplay()) {
        angle = normalize(angle + delta * 360 / TURN_DURATION_MS);
        paint();
      }
      if (canAnimate()) frame = requestAnimationFrame(tick);
      else lastTimestamp = null;
    }

    function sync() {
      if (canAnimate()) {
        if (frame === null) { lastTimestamp = null; frame = requestAnimationFrame(tick); }
      } else stopFrame();
    }

    function moveTo(target: number, shouldAnnounce: boolean) {
      if (flags.reduced) {
        tween = null;
        angle = normalize(target);
        paint(true);
        if (shouldAnnounce) announce(frontIndex);
      } else tween = { from: angle, to: target, elapsed: 0, announce: shouldAnnounce };
      sync();
    }

    function releasePointer(event: { pointerId: number; type: string }) {
      const current = pointer;
      if (!current || current.id !== event.pointerId) return;
      pointer = null;
      delete stage.dataset.dragging;
      if (stage.hasPointerCapture(current.id)) stage.releasePointerCapture(current.id);
      if (current.dragging && event.type === 'pointerup') {
        suppressClickUntil = performance.now() + 600;
        moveTo(centeredAngle(nearestItem(angle), angle), true);
      } else sync();
    }

    apiRef.current = {
      step(direction) {
        const currentAngle = tween?.to ?? angle;
        const nextIndex = (nearestItem(currentAngle) + direction + items.length) % items.length;
        moveTo(centeredAngle(nextIndex, currentAngle), true);
      },
      first() { moveTo(Math.round(angle / 360) * 360, true); },
      pointerDown(event) {
        if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        suppressClickUntil = 0;
        tween = null;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, width: Math.max(240, stage.clientWidth), dragging: false };
        sync();
      },
      pointerMove(event) {
        if (!pointer || pointer.id !== event.pointerId) return;
        const horizontal = event.clientX - pointer.x;
        const vertical = event.clientY - pointer.y;
        if (!pointer.dragging) {
          if (Math.abs(vertical) > 7 && Math.abs(vertical) > Math.abs(horizontal) * 1.15) {
            pointer = null;
            sync();
            return;
          }
          if (Math.abs(horizontal) < 7 || Math.abs(horizontal) < Math.abs(vertical) * 1.1) return;
          pointer.dragging = true;
          stage.dataset.dragging = 'true';
          stage.setPointerCapture(event.pointerId);
          // Pointer browsing must not leave focus on a pack that becomes rear.
          if (document.activeElement instanceof HTMLElement && stage.contains(document.activeElement)) document.activeElement.blur();
        }
        if (event.cancelable) event.preventDefault();
        angle = normalize(angle + (event.clientX - pointer.lastX) * 180 / pointer.width);
        pointer.lastX = event.clientX;
        paint();
      },
      pointerEnd: releasePointer,
      click(event) {
        if (performance.now() < suppressClickUntil && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntil = 0;
        }
      },
    };

    const observer = new IntersectionObserver(([entry]) => { flags.visible = entry.isIntersecting; sync(); });
    observer.observe(stage);
    const onVisibility = () => {
      flags.hidden = document.hidden;
      if (flags.hidden && pointer) releasePointer({ pointerId: pointer.id, type: 'pointercancel' });
      else sync();
    };
    const onPreference = () => {
      flags.reduced = preference.matches;
      if (flags.reduced && tween) {
        const target = tween.to;
        const shouldAnnounce = tween.announce;
        tween = null;
        angle = normalize(target);
        paint(true);
        if (shouldAnnounce) announce(frontIndex);
      }
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    preference.addEventListener('change', onPreference);
    const onWindowPointerEnd = (event: globalThis.PointerEvent) => releasePointer(event);
    const onWindowBlur = () => { if (pointer) releasePointer({ pointerId: pointer.id, type: 'pointercancel' }); };
    // A pending gesture has no capture yet and may end outside the display.
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    window.addEventListener('blur', onWindowBlur);
    paint();
    sync();
    return () => {
      stopFrame();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', onPreference);
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
      window.removeEventListener('blur', onWindowBlur);
      if (pointer && stage.hasPointerCapture(pointer.id)) stage.releasePointerCapture(pointer.id);
      apiRef.current = null;
    };
  }, [items,pose,nearestItem,centeredAngle,normalize,FRONT_CROSSING_EPSILON]);

  function step(direction: number) { apiRef.current?.step(direction); }

  return <div
    ref={rootRef}
    className="banner-products product-orbit"
    role="region"
    aria-roledescription="نمایش چرخان"
    aria-label="محصولات منتخب پوستیکال"
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? 1 : -1;
        stageRef.current?.focus();
        step(direction);
      } else if (event.key === 'Home') {
        event.preventDefault();
        stageRef.current?.focus();
        apiRef.current?.first();
      }
    }}
  >
    <svg width="0" height="0" className="orbit-image-clips" aria-hidden="true" focusable="false"><defs>
      {/* Crop only the white photo canvas; original packaging pixels stay intact. */}
      <clipPath id={clipIds.biohyalux} clipPathUnits="objectBoundingBox"><path d="M.253 .11H.738Q.745 .11 .744 .12L.75 .65 .74 .661 .747 .68V.848Q.747 .856 .737 .856H.258Q.247 .856 .247 .848V.683L.253 .661 .246 .653V.12Q.246 .11 .253 .11Z"/></clipPath>
      <clipPath id={clipIds.genosys} clipPathUnits="objectBoundingBox"><path d="M.365 .115Q.42 .096 .493 .105L.579 .117 .592 .127 .59 .14 .568 .137 .51 .132 .499 .146V.179L.553 .179 .56 .24Q.56 .28 .59 .322Q.63 .37 .632 .425L.631 .838Q.63 .885 .583 .888H.431Q.386 .887 .382 .849V.422Q.384 .363 .412 .315L.438 .25 .442 .179H.462V.143Q.419 .126 .375 .128Z"/></clipPath>
      <clipPath id={clipIds.ribeskin} clipPathUnits="objectBoundingBox">
        <path d="M.106 .362Q.1 .26 .196 .233Q.259 .208 .338 .227Q.408 .248 .425 .32L.42 .489 .386 .548 .145 .55Q.093 .483 .106 .362Z"/>
        <path d="M.135 .49 .395 .461 .49 .475 .58 .635 .462 .682 .147 .672Z"/>
        <path d="M.417 .41 .473 .356 .504 .386 .534 .346 .576 .37 .591 .41 .634 .35 .671 .37 .68 .402 .736 .36 .774 .37 .776 .406 .845 .38 .889 .414 .925 .435 .916 .489 .863 .592 .86 .625 .825 .663 .816 .683 .778 .704 .735 .697 .69 .685 .65 .684 .6 .68 .56 .673 .522 .65 .484 .622 .456 .551 .425 .48Z"/>
        <path d="M.633 .701 .682 .704 .717 .716 .905 .72Q.929 .728 .909 .743L.718 .741 .687 .76 .641 .752Z"/>
      </clipPath>
    </defs></svg>
    <div
      ref={stageRef}
      className="product-orbit-stage"
      tabIndex={0}
      role="group"
      aria-label="نمایش چرخان محصولات؛ با کشیدن یا کلیدهای پیکان بچرخان"
      aria-keyshortcuts="ArrowLeft ArrowRight Home"
      aria-describedby={hintId}
      onPointerDown={event => apiRef.current?.pointerDown(event)}
      onPointerMove={event => apiRef.current?.pointerMove(event)}
      onPointerUp={event => apiRef.current?.pointerEnd(event)}
      onPointerCancel={event => apiRef.current?.pointerEnd(event)}
      onLostPointerCapture={event => apiRef.current?.pointerEnd(event)}
      onClickCapture={event => apiRef.current?.click(event)}
      onDragStart={event => event.preventDefault()}
    >
      {items.map((item, index) => <div
        key={item.id}
        ref={node => { positionsRef.current[index] = node; }}
        className="orbit-product-position"
        data-front={index === activeIndex}
        data-product={item.kind}
        data-asset={item.transparent ? 'transparent' : 'photo'}
        style={initialStyles[index]}
        aria-hidden={index !== activeIndex || undefined}
        inert={index !== activeIndex ? true : undefined}
      ><figure className="orbit-product-link orbit-product-figure" aria-label={item.name}><Image src={item.image} alt={item.name} fill priority={initialStyles[index].visibility === 'visible'} loading={initialStyles[index].visibility === 'hidden' ? 'eager' : undefined} fetchPriority={initialStyles[index].visibility === 'hidden' ? 'low' : undefined} quality={95} draggable={false} style={item.clip ? { clipPath: `url(#${clipIds[item.clip]})` } : undefined} sizes="(max-width: 650px) 75vw, (max-width: 1100px) 50vw, 510px"/></figure></div>)}
    </div>
    <p id={hintId} className="orbit-announcement">برای چرخاندن، محصولات رو بکشید یا از کلیدهای پیکان استفاده کنید.</p>
    <p className="orbit-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </div>;
}
