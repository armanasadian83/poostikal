'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTreatmentPhoto } from './use-treatment-photo';
import { useCatalog } from './catalog-provider';

import { formatNumber } from '@/lib/format';
import { useStore } from '@/lib/store';
import {SiteSettingLink} from './site-setting-link';
import { Brand } from './brand';
import { Icon, type IconName } from './icons';
import { useUI, type Panel } from './ui-context';
import { AskPoostikalLink } from './chat-transition';

const categoryIcons: Record<string, IconName> = { all: 'grid', 'home-care': 'leaf', salon: 'sparkles', cleanser: 'pump', moisturizer: 'cream', serum: 'pipette', sunscreen: 'sun', toner: 'bottle', mask: 'cream', equipment: 'device' };
const categoryHref = (id: string) => id === 'all' ? '/shop' : `/shop?category=${encodeURIComponent(id)}`;

function CategoryLinks({ onNavigate, mobile = false }: { onNavigate: () => void; mobile?: boolean }) {
  const { categoryOptions, categories } = useCatalog();
  return <div className={mobile ? 'mobile-category-grid' : 'mega-category-grid'}>{categoryOptions.slice(0,9).map(category => <Link key={category.id} href={categoryHref(categories.find(item => item.id === category.id)?.slug ?? category.id)} onClick={onNavigate} className="nav-category-link"><span className="nav-category-icon"><Icon name={categoryIcons[category.id] ?? "grid"} size={24}/></span><span>{category.label}</span><Icon name="arrow-left" className="category-link-arrow" size={16}/></Link>)}</div>;
}

export function SiteHeader() {
  const pathname = usePathname();
  return <HeaderNavigation key={pathname} pathname={pathname}/>;
}

function HeaderNavigation({ pathname }: { pathname: string }) {
  const {settings:{navbar:config}}=useSiteSettings();
  const { openPanel } = useUI();
  const { cart, saved } = useStore();
  const [isExpanded, setExpanded] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const closeCategories = () => setExpanded(false);
  function showPanel(panel: Panel) { closeCategories(); openPanel(panel); }

  useTreatmentPhoto(headerRef, pathname === '/');

  useEffect(() => {
    if (!isExpanded) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setExpanded(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); setExpanded(false); triggerRef.current?.focus(); } };
    const closeOnHistory = () => setExpanded(false);
    const media = window.matchMedia('(max-width: 960px)');
    const closeOnMobile = (event: MediaQueryListEvent) => { if (event.matches) setExpanded(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('popstate', closeOnHistory);
    media.addEventListener('change', closeOnMobile);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); window.removeEventListener('popstate', closeOnHistory); media.removeEventListener('change', closeOnMobile); };
  }, [isExpanded]);

  return <>
    {config.announcementVisible?<div className="announcement poostikal-announcement"><span className="announcement-dot" aria-hidden="true"/>{config.announcement}<span className="announcement-dot" aria-hidden="true"/></div>:null}
    <div className="navigation-wrap" style={!config.sticky?{position:"relative"}:undefined}>
      <header ref={headerRef} className={`site-header container poostikal-header${isExpanded ? ' categories-expanded' : ''}`} onBlurCapture={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeCategories(); }}>
        <div className="header-main-row">
          <div className="header-brand"><button className="icon-button mobile-menu" aria-label="باز کردن منو" aria-haspopup="dialog" onClick={() => showPanel('menu')}><Icon name="menu" size={24}/></button><Brand onClick={closeCategories}/></div>
          {config.showSearch?<button className="nav-search" aria-label="جستجوی محصولات" aria-haspopup="dialog" onClick={() => showPanel('search')}><Icon name="search" size={22}/><span>{config.searchPlaceholder}</span><span className="nav-search-hint">جستجو</span></button>:null}
          <div className="header-actions"><Link className="nav-account" href="/myaccount" prefetch={false} aria-label="حساب کاربری" onNavigate={event => { event.preventDefault(); showPanel('account'); }}><Icon name="user" size={21}/><span>{config.accountLabel}</span></Link>{config.showFavorites?<button className={`icon-button nav-saved${saved.length ? ' has-saved' : ''}`} aria-label={`علاقه‌مندی‌ها، ${formatNumber(saved.length)} محصول`} onClick={() => showPanel('saved')}><Icon name="lips" size={26}/>{saved.length ? <span className="saved-dot"/> : null}</button>:null}<Link className="icon-button cart-button" href="/cart" aria-label={`سبد خرید، ${formatNumber(count)} محصول`} aria-current={pathname === '/cart' ? 'page' : undefined} onClick={closeCategories}><Icon name="bag" size={23}/>{count > 0 ? <span className="cart-count">{formatNumber(count)}</span> : null}</Link></div>
        </div>
        <div className="header-navigation-row"><nav className="desktop-nav" aria-label="منوی اصلی">{config.showCategories?<button ref={triggerRef} className={`category-disclosure${isExpanded ? ' is-expanded' : ''}`} aria-expanded={isExpanded} aria-controls={isExpanded ? 'product-categories' : undefined} onClick={() => setExpanded(value => !value)}><Icon name="grid" size={19}/><span>{config.categoriesLabel}</span><Icon name="chevron-down" size={16}/></button>:null}{config.links.map((link,index)=><SiteSettingLink key={index} {...link} onNavigate={closeCategories}/> )}</nav>{config.showAsk?<AskPoostikalLink className="nav-routine" onClick={closeCategories}><Icon name="sparkles" size={18}/><span>{config.askLabel}</span><Icon name="arrow-left" size={17}/></AskPoostikalLink>:null}</div>
        {isExpanded ? <div className="category-mega-panel" id="product-categories"><CategoryLinks onNavigate={closeCategories}/><div className="mega-quiz"><span className="mega-quiz-icon"><Icon name="clipboard" size={35}/></span><div><h2>{config.quizTitle}</h2><p>{config.quizDescription}</p><button onClick={() => showPanel('quiz')}>{config.quizButton}<Icon name="arrow-left" size={17}/></button></div></div></div> : null}
      </header>
    </div>
  </>;
}

export function MobileNavigation({ close }: { close: () => void }) {
  const {settings:{navbar:config}}=useSiteSettings();
  const { openPanel } = useUI();
  const { saved } = useStore();
  return <div className="poostikal-mobile-menu"><Brand onClick={close}/><p className="mobile-menu-description">{config.mobileDescription}</p><h3>کشف محصولات</h3>{config.showCategories?<CategoryLinks mobile onNavigate={close}/>:null}<nav className="mobile-nav" aria-label="ناوبری موبایل">{config.links.map((link,index)=><SiteSettingLink key={index} {...link} onNavigate={close}/>)}{config.showFavorites?<button onClick={()=>openPanel("saved")}><span>علاقه‌مندی‌ها</span><span className="mobile-saved-count">{formatNumber(saved.length)}</span><Icon name="lips" size={20}/></button>:null}<Link href="/myaccount" prefetch={false} onNavigate={event => { event.preventDefault(); openPanel('account'); }}>{config.accountLabel}</Link></nav>{config.showAsk?<AskPoostikalLink className="mobile-routine" onClick={close}><span className="mobile-routine-icon"><Icon name="lips" size={27}/></span><span><strong>{config.askLabel}</strong><small>یه گپ خودمونی، برای انتخاب‌های تو.</small></span><Icon name="arrow-left" size={20}/></AskPoostikalLink>:null}</div>;
}
