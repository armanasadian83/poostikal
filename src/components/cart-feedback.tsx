'use client';
import Link from 'next/link';
import {useSiteSettings} from './site-settings-provider';
import { Icon } from './icons';
import {dismissBasketNotice,useStore} from '@/lib/store';

export function CartLoading() {
  return <div className="basket-loading basket-glass" role="status" aria-live="polite"><span className="basket-loader" aria-hidden="true"/><p>داریم سبدت رو آماده می‌کنیم…</p></div>;
}

export function EmptyCart() {
  const {settings:{cart:config}}=useSiteSettings();
  return <section className="basket-empty basket-glass" aria-labelledby="empty-cart-title"><div className="basket-empty-art" aria-hidden="true"><Icon name="bag" size={58}/><span><Icon name="lips" size={27}/></span></div><h2 id="empty-cart-title">{config.emptyTitle}</h2><p style={{whiteSpace:"pre-line"}}>{config.emptyDescription}</p><Link href="/shop" className="basket-primary">{config.emptyLabel}<Icon name="arrow-left" size={20}/></Link></section>;
}

export function CartError({error,retry}:{error:string;retry:()=>void}) {
  return <div className="basket-feedback basket-glass" role="alert"><Icon name="refresh" size={32}/><h2>یه بار دیگه امتحان کنیم؟</h2><p>{error}</p><button className="basket-primary" onClick={retry}>تلاش دوباره<Icon name="refresh" size={18}/></button></div>;
}

export function BasketNotice() {
  const {cartNotice} = useStore();
  return cartNotice ? <p className="basket-attention" role="status">{cartNotice}{' '}
    <button type="button" aria-label="بستن پیام سبد خرید" onClick={dismissBasketNotice}><Icon name="close" size={16}/></button>
  </p> : null;
}
