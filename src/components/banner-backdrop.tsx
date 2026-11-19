'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useRef } from 'react';
import Image from 'next/image';

export function BannerBackdrop() {
  const {settings:{effects}}=useSiteSettings();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    let inView = true;
    const syncPlayback = () => {
      backdrop.dataset.suspended = String(!effects.waves || !inView || document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(backdrop);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, [effects.waves]);

  return <div ref={backdropRef} className="home-banner-backdrop" aria-hidden="true">
      <div className="banner-scenery">
        <Image src="/images/poostikal/banner-background.png" alt="" fill priority sizes="110vw" className="banner-backdrop-image"/>
      </div>
      <div className="banner-wave banner-wave-near"/>
      <div className="banner-wave banner-wave-far"/>
  </div>;
}
