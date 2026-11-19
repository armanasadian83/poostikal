'use client';
import {useSiteSettings} from './site-settings-provider';
import Image from 'next/image';
import Link from 'next/link';
import { useId, type CSSProperties } from 'react';

export function Brand({ footer = false, onClick }: { footer?: boolean; onClick?: () => void }) {
  const {settings:{branding},store}=useSiteSettings();
  const contrastFilterId = `poostikal-contrast-${useId().replaceAll(':', '')}`;
  const filterStyle = { '--brand-contrast-filter': `url("#${contrastFilterId}")` } as CSSProperties;
  return <Link href="/" className={`poostikal-brand poostikal-brand-wordmark${footer ? ' poostikal-brand-footer' : ''}`} style={filterStyle} aria-label="پوستیکال — صفحه اصلی" onClick={onClick}>
    <svg className="poostikal-brand-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={contrastFilterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* Pink has more red than blue; navy has more blue than red.
              Keep the original lips and alpha, and whiten only lettering. */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  20 0 -20 0 0" result="lip-mask"/>
          <feComposite in="SourceGraphic" in2="lip-mask" operator="in" result="original-lips"/>
          <feComposite in="SourceAlpha" in2="lip-mask" operator="out" result="letter-mask"/>
          <feFlood floodColor="#ffffff" result="letter-color"/>
          <feComposite in="letter-color" in2="letter-mask" operator="in" result="light-letters"/>
          <feMerge><feMergeNode in="light-letters"/><feMergeNode in="original-lips"/></feMerge>
        </filter>
      </defs>
    </svg>
    <Image className="poostikal-logo" src={branding.logo} alt={branding.logoAlt} width={2039} height={367} style={{height:'auto'}} quality={95} sizes={footer ? '(max-width: 360px) 134px, (max-width: 650px) 160px, 180px' : '(max-width: 360px) 140px, (max-width: 650px) 150px, 160px'}/>
    <span className="brand-identity"><span className="brand-title">{store.name}</span><span className="brand-description">{footer ? branding.footerTagline : branding.tagline}</span></span>
  </Link>;
}
