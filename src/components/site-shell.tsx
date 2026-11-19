'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Product } from '@/lib/catalog';
import { useCatalog } from './catalog-provider';
import { useProductSearch } from './use-product-search';
import { formatNumber, formatPrice } from '@/lib/format';
import { useStore } from '@/lib/store';
import { BasketSync } from './basket-sync';
import { api, ApiError } from '@/lib/api';

import { Dialog } from './dialog';
import { Icon } from './icons';
import { BannerBackdrop } from './banner-backdrop';
import { useKissTransition } from './chat-transition';
import { SiteHeader, MobileNavigation } from './site-header';
import { SupportLauncher } from './support/support-launcher';
import { SiteFooter } from './site-footer';
import { UIContext, type Panel } from './ui-context';

export { useUI } from './ui-context';
type DialogPanel = Exclude<Panel, 'account' | 'cart' | 'checkout' | 'quiz'>;
const panelTitles: Record<Exclude<DialogPanel, null>, string> = { search: 'دنبال چی می‌گردی؟', saved: 'علاقه‌مندی‌های تو', brands: 'برندهای مراقبت از پوست', menu: 'کشف فروشگاه' };

function CompactProducts({ items, close }: { items: Product[]; close: () => void }) {
  return <div className="compact-products">{items.map(product => <Link key={product.id} className="compact-product" href={`/products/${product.slug}`} onClick={close}><div className="compact-image"><Image src={product.mediaType === 'animation' ? product.image : product.variants[0].image ?? product.image} alt={product.name} fill sizes="80px"/></div><div><span className="product-brand" dir="ltr">{product.brand}</span><h3>{product.name}</h3><p>{formatPrice(product.variants[0].priceToman)} <span>تومان</span></p></div><Icon name="arrow-left" size={19}/></Link>)}</div>;
}

function SearchPanel({ close }: { close: () => void }) {
  const [query, setQuery] = useState('');
  const { products: matches } = useProductSearch({ q: query });
  return <><label className="search-field"><Icon name="search"/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="نام محصول یا برند رو بنویس..." aria-label="جستجو در محصولات" autoFocus/></label><p className="subtle small">{query ? `${formatNumber(matches.length)} محصول پیدا شد` : 'چند انتخاب برای شروع'}</p>{matches.length ? <CompactProducts items={matches} close={close}/> : <div className="empty-state"><Icon name="search" size={36}/><h3>محصولی پیدا نشد.</h3><p>یک نام کوتاه‌تر یا برند دیگه رو امتحان کن.</p><button className="button secondary" onClick={() => setQuery('')}>پاک کردن جستجو</button></div>}</>;
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { products, brands } = useCatalog();
  const pathname = usePathname();
  const [overlayPathname, setOverlayPathname] = useState(pathname);
  const [panel, setPanel] = useState<DialogPanel>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountRequest = useRef<AbortController | null>(null);
  const { saved } = useStore();
  const router = useRouter();
  const kiss = useKissTransition();
  const isHome = pathname === '/';
  const isShop = pathname === '/shop' || pathname === '/brands' || pathname === '/about-us' || pathname === '/myaccount' || pathname.startsWith('/myaccount/');
  const isCart = pathname === '/cart' || pathname === '/checkout' || pathname.startsWith('/checkout/');
  const isProductPage = pathname.startsWith('/products/');
  const isStandardProduct = isProductPage;
  const isStandalone = pathname === '/skin-analysis' || pathname === '/ask-poostikal' || pathname === '/login' || pathname === '/admin' || pathname.startsWith('/admin/');
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const banner = stage?.querySelector('.home-banner-region');
    if (!isHome || !stage || !banner) return;
    const measure = () => stage.style.setProperty('--home-banner-height', `${banner.getBoundingClientRect().bottom - stage.getBoundingClientRect().top}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    const navigation = stage.querySelector('.navigation-wrap');
    if (navigation) observer.observe(navigation);
    return () => { observer.disconnect(); stage.style.removeProperty('--home-banner-height'); };
  }, [isHome]);
  const toast = useCallback((value: string) => { setMessage(value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(''), 3000); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, [pathname]);
  useEffect(() => () => { accountRequest.current?.abort(); }, [pathname]);
  const openPanel = useCallback((nextPanel: Panel) => {
    if (nextPanel === 'quiz') {
      setPanel(null);
      if (!kiss?.navigate('/skin-analysis', {})) router.push('/skin-analysis');
      return;
    }
    if(nextPanel==='brands'){setPanel(null);router.push('/brands');return;}
    if (nextPanel === 'cart' || nextPanel === 'checkout') {
      setPanel(null);
      router.push(nextPanel === 'checkout' ? '/checkout' : '/cart');
      return;
    }
    if (nextPanel === 'account') {
      setPanel(null);
      accountRequest.current?.abort();
      const request = new AbortController();
      accountRequest.current = request;
      void api('/customer/me', { signal: request.signal }).then(() => {
        if (!request.signal.aborted) router.push('/myaccount');
      }, error => {
        if (request.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) router.push('/login');
        else toast('بررسی وضعیت ورود انجام نشد. دوباره تلاش کن.');
      });
      return;
    }
    setPanel(nextPanel);
  }, [router, toast, kiss]);
  const ui = useMemo(() => ({ openPanel, toast }), [openPanel, toast]);
  const close = () => setPanel(null);
  // Reset transient overlays before committing content for a different route.
  if (overlayPathname !== pathname) {
    setOverlayPathname(pathname);
    setPanel(null);
    setMessage('');
  }
  return <UIContext.Provider value={ui}><BasketSync enabled={!isStandalone} basketPage={pathname === '/cart' || pathname === '/checkout'}/><div ref={stageRef} className={`storefront-stage${isHome || isShop || isCart ? ' home-shell' : ''}${isShop ? ' shop-shell' : ''}${isCart ? ' cart-shell' : ''}${isProductPage ? ' themed-product-shell' : ''}${isStandardProduct ? ' standard-product-shell' : ''}`}>{isHome || isShop || isCart || isProductPage ? <BannerBackdrop/> : null}{!isStandalone ? <SiteHeader/> : null}{children}</div>{!isStandalone ? <SiteFooter/> : null}
    {!isStandalone && !panel ? <SupportLauncher key={pathname}/> : null}
    {!isStandalone && panel ? <Dialog key={panel} title={panelTitles[panel]} drawer={panel === 'menu'} drawerSide={panel === 'menu' ? 'right' : 'left'} onClose={close}>
      {panel === 'search' ? <SearchPanel close={close}/> : null}
      {panel === 'saved' ? saved.length ? <CompactProducts items={products.filter(product => saved.includes(product.id))} close={close}/> : <div className="empty-state"><Icon name="heart" size={42}/><h3>انتخاب‌های دوست‌داشتنی‌ات رو نگه دار.</h3><p>روی قلب کنار هر محصول بزن تا اینجا پیداش کنی.</p><Link className="button primary" href="/shop" onClick={close}>دیدن محصولات</Link></div> : null}
      {panel === 'brands' ? <><p className="dialog-intro">انتخاب‌هات رو از برند مورد علاقه‌ات شروع کن.</p><div className="brand-list">{brands.map(brand => brand.name).map(name => { const brand = brands.find(item => item.name === name); return <Link href={`/shop?brand=${encodeURIComponent(name)}`} onClick={close} key={name}>{brand?.image ? <span className="brand-picker-mark" data-brand={brand.id}><Image src={brand.image} alt={name} fill sizes="140px"/></span> : <span dir="ltr">{name}</span>}<span className="brand-picker-label">{brand?.persianName ?? name}</span><Icon name="arrow-left" size={20}/></Link>; })}</div></> : null}
      {panel === 'menu' ? <MobileNavigation close={close}/> : null}
    </Dialog> : null}
    {!isStandalone ? <div className={`toast ${message ? 'toast-visible' : ''}`} role="status" aria-live="polite">{message ? <><Icon name="check" size={18}/>{message}<button aria-label="بستن پیام" onClick={() => setMessage('')}><Icon name="close" size={16}/></button></> : null}</div> : null}
  </UIContext.Provider>;
}
