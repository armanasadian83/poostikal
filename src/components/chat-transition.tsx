'use client';
import {useSiteSettings} from './site-settings-provider';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal, preload } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const CHAT_PATH = '/ask-poostikal';
const ANALYSIS_PATH = '/skin-analysis';
type KissDestination = typeof CHAT_PATH | typeof ANALYSIS_PATH;
const LIPS_IMAGE = '/brand/poostikal-lips-transparent.png';
const COVER_AT_MS = 500;
const EARLIEST_REVEAL_MS = 820;
const REVEAL_DURATION_MS = 380;
const NAVIGATION_TIMEOUT_MS = 6500;

type NavigationOptions = {
  replace?: boolean;
  scroll?: boolean;
  transitionTypes?: string[];
};
type TransitionRun = {
  id: number;
  originPath: string;
  destination: KissDestination;
  startedAt: number;
  navigationRequested: boolean;
  arrived: boolean;
  revealing: boolean;
  trigger: HTMLElement | null;
  options: NavigationOptions;
};
type TransitionContext = { navigate: (destination: KissDestination, options: NavigationOptions) => boolean; isTransitioning: boolean };
const ChatTransitionContext = createContext<TransitionContext | null>(null);
export const useKissTransition = () => useContext(ChatTransitionContext);

/** A real link: browser new-tab/download behavior stays under Next Link's control. */
export type AskPoostikalLinkProps = Omit<
  ComponentProps<typeof Link>,
  'href' | 'as' | 'onNavigate' | 'legacyBehavior' | 'passHref' | 'locale' | 'shallow'
>;

export function AskPoostikalLink(props: AskPoostikalLinkProps) {
  return <KissLink destination={CHAT_PATH} {...props}/>;
}

export function SkinAnalysisLink(props: AskPoostikalLinkProps) {
  return <KissLink destination={ANALYSIS_PATH} {...props}/>;
}

function KissLink({
  destination,
  onPointerEnter,
  onPointerDown,
  onFocus,
  replace,
  scroll,
  transitionTypes,
  ...props
}: AskPoostikalLinkProps & { destination: KissDestination }) {
  const transition = useKissTransition();
  const router = useRouter();
  const prime = () => {
    try { router.prefetch(destination); } catch { /* The ordinary link still works if prefetch fails. */ }
    preload(LIPS_IMAGE, { as: 'image' });
  };

  return <Link
    {...props}
    href={destination}
    replace={replace}
    scroll={scroll}
    transitionTypes={transitionTypes}
    onPointerEnter={event => { onPointerEnter?.(event); if (!event.defaultPrevented) prime(); }}
    onPointerDown={event => { onPointerDown?.(event); if (!event.defaultPrevented) prime(); }}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) prime(); }}
    onNavigate={event => {
      prime();
      if (transition?.navigate(destination, { replace, scroll, transitionTypes })) event.preventDefault();
    }}
  />;
}

/** Keep this provider in the root layout so its cover survives the route change. */
export function ChatTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { settings: { effects: { lipTransition } } } = useSiteSettings();
  const [phase, setPhase] = useState<'idle' | 'entering' | 'leaving'>('idle');
  const runRef = useRef<TransitionRun | null>(null);
  const sequenceRef = useRef(0);
  const pathnameRef = useRef(pathname);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const focusAfterRevealRef = useRef<HTMLElement | 'arrival' | null>(null);
  const isTransitioning = phase !== 'idle';

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
  }, []);

  const finish = useCallback((id: number, focus: HTMLElement | 'arrival' | null = null) => {
    if (runRef.current?.id !== id) return;
    clearTimers();
    runRef.current = null;
    focusAfterRevealRef.current = focus;
    setPhase('idle');
  }, [clearTimers]);

  const documentFallback = useCallback((id: number) => {
    const run = runRef.current;
    if (!run || run.id !== id) return;
    const replace = run.options.replace;
    // Release the cover first: a failed/slow router must never strand the page.
    finish(id, run.trigger);
    try {
      if (replace) window.location.replace(run.destination);
      else window.location.assign(run.destination);
    } catch { /* The unlocked source page and original link remain usable. */ }
  }, [finish]);

  const requestRoute = useCallback((id: number) => {
    const run = runRef.current;
    if (!run || run.id !== id || run.navigationRequested) return;
    run.navigationRequested = true;
    if (pathnameRef.current === run.destination) return;
    try {
      const options = { scroll: run.options.scroll ?? true, transitionTypes: run.options.transitionTypes };
      if (run.options.replace) router.replace(run.destination, options);
      else router.push(run.destination, options);
    } catch { documentFallback(id); }
  }, [router, documentFallback]);

  const navigate = useCallback((destination: KissDestination, options: NavigationOptions): boolean => {
    if (runRef.current) return true;
    if (!lipTransition || pathname === destination || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    const id = ++sequenceRef.current;
    runRef.current = {
      id,
      originPath: pathname,
      destination,
      startedAt: performance.now(),
      navigationRequested: false,
      arrived: false,
      revealing: false,
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      options,
    };
    setPhase('entering');
    schedule(() => requestRoute(id), COVER_AT_MS);
    schedule(() => {
      if (runRef.current?.id === id && !runRef.current.arrived) documentFallback(id);
    }, NAVIGATION_TIMEOUT_MS);
    return true;
  }, [pathname, lipTransition, schedule, requestRoute, documentFallback]);

  // A pathname change is the App Router's committed-arrival signal. Never uncover
  // merely because the entrance animation has reached its last frame.
  useEffect(() => {
    pathnameRef.current = pathname;
    const run = runRef.current;
    if (!run) return;
    if (pathname === run.destination && !run.arrived) {
      run.arrived = true;
      clearTimers();
      const delay = Math.max(0, EARLIEST_REVEAL_MS - (performance.now() - run.startedAt));
      schedule(() => {
        const current = runRef.current;
        if (!current || current.id !== run.id || current.revealing) return;
        current.revealing = true;
        setPhase('leaving');
        schedule(() => finish(run.id, 'arrival'), REVEAL_DURATION_MS);
      }, delay);
    } else if (pathname !== run.originPath && pathname !== run.destination) {
      clearTimers();
      schedule(() => finish(run.id), 0);
    }
  }, [pathname, clearTimers, schedule, finish]);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => {
      const run = runRef.current;
      if (!reducedMotion.matches || !run) return;
      requestRoute(run.id);
      finish(run.id, pathnameRef.current === run.destination ? 'arrival' : run.trigger);
    };
    const onHistoryNavigation = () => {
      const run = runRef.current;
      if (run) finish(run.id);
    };
    reducedMotion.addEventListener('change', onPreferenceChange);
    window.addEventListener('popstate', onHistoryNavigation);
    return () => {
      reducedMotion.removeEventListener('change', onPreferenceChange);
      window.removeEventListener('popstate', onHistoryNavigation);
    };
  }, [finish, requestRoute]);

  useEffect(() => () => {
    clearTimers();
    runRef.current = null;
  }, [clearTimers]);

  useEffect(() => {
    if (!isTransitioning) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isTransitioning]);

  useEffect(() => {
    if (phase !== 'idle' || !focusAfterRevealRef.current) return;
    const destination = focusAfterRevealRef.current;
    focusAfterRevealRef.current = null;
    const frame = requestAnimationFrame(() => {
      const target = destination === 'arrival'
        ? document.querySelector<HTMLElement>('[data-chat-arrival-focus]')
          ?? document.querySelector<HTMLElement>('#main-content h1')
          ?? document.querySelector<HTMLElement>('#main-content')
        : destination;
      if (!target?.isConnected) return;
      if (!target.hasAttribute('tabindex') && !target.matches('a, button, input, select, textarea')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const context = useMemo(() => ({ navigate, isTransitioning }), [navigate, isTransitioning]);
  return <ChatTransitionContext.Provider value={context}>
    <div className="chat-transition-content" inert={isTransitioning ? true : undefined} aria-busy={isTransitioning || undefined}>{children}</div>
    <div className="chat-transition-status" role="status" aria-live="polite" aria-atomic="true">{isTransitioning ? 'در حال باز کردن صفحه…' : ''}</div>
    {isTransitioning ? createPortal(<KissOverlay phase={phase}/>, document.body) : null}
  </ChatTransitionContext.Provider>;
}

function KissOverlay({ phase, onFinish }: { phase: 'entering' | 'leaving' | 'arrival'; onFinish?: () => void }) {
  return <div className="chat-transition-overlay" data-phase={phase} aria-hidden="true" onAnimationEnd={event => {
    if (event.target === event.currentTarget) onFinish?.();
  }}>
      <div className="chat-transition-veil"/>
      <div className="chat-transition-splash chat-transition-splash-near"/>
      <div className="chat-transition-splash chat-transition-splash-far"/>
      <div className="chat-transition-kiss"><Image src={LIPS_IMAGE} alt="" fill unoptimized priority sizes="320px"/></div>
      <p className="chat-transition-wait">یک لحظه...</p>
    </div>;
}

// A direct visit has no outgoing link to play the cover. Sample once on mount
// so completing a covered navigation never starts a second kiss.
export function AnalysisArrivalKiss() {
  const transition = useKissTransition();
  const { settings: { effects } } = useSiteSettings();
  const [play, setPlay] = useState(() => effects.lipTransition && !transition?.isTransitioning);
  useEffect(() => {
    if (!play) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dismiss = () => setPlay(false);
    // The CSS animation can finish before hydration attaches its end listener.
    const timer = window.setTimeout(dismiss, preference.matches ? 0 : EARLIEST_REVEAL_MS + REVEAL_DURATION_MS);
    preference.addEventListener('change', dismiss);
    return () => {
      window.clearTimeout(timer);
      preference.removeEventListener('change', dismiss);
    };
  }, [play]);
  return play && effects.lipTransition ? <KissOverlay phase="arrival" onFinish={() => setPlay(false)}/> : null;
}
