'use client';
import {useSiteSettings} from './site-settings-provider';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { formatNumber, formatPrice } from '@/lib/format';
import type { OrderReceipt } from '@/lib/orders';
import { refreshBasket, refreshBasketAfterOrder, useStore, type CartLine } from '@/lib/store';
import { findOrderAttempt, forgetOrderAttempt, readOrderAttempt } from '@/lib/order-attempt';
import { summarizeCart, useCartHydrated, useCartProducts } from '@/lib/use-cart-products';
import { BasketNotice, CartError, CartLoading, EmptyCart } from './cart-feedback';
import { Icon } from './icons';
import { OrderCheckout } from './order-checkout';

function CheckoutDetails({lines,revision,onSubmitted,onHoldBasket}:{lines:CartLine[];revision:string;
  onSubmitted:(order:OrderReceipt)=>void;onHoldBasket:(hold:boolean)=>void}) {
  const {products,loading,hasRemainingProducts,revalidating,error,retry}=useCartProducts(lines);
  function refresh() {
    retry();
    void refreshBasket(undefined, true).catch(() => {});
  }
  if(loading)return <CartLoading/>;
  if(error && !hasRemainingProducts)return <CartError error={error} retry={refresh}/>;
  const {resolved,subtotal,total,discount,count,needsAttention}=summarizeCart(lines,products);
  return <OrderCheckout items={resolved.flatMap(({line,variant,available})=>available&&variant?[{...line,expectedUnitPriceToman:variant.priceToman}]:[])}
    basketRevision={revision} subtotal={subtotal} discount={discount} total={total} count={count} needsAttention={needsAttention}
    stockLoading={revalidating || Boolean(error)} onSubmitted={onSubmitted} onRefresh={refresh} onHoldBasket={onHoldBasket}>
    {error && <p className="basket-attention" role="alert">{error}<button type="button" onClick={refresh}>تلاش دوباره</button></p>}
    <section className="checkout-review basket-glass" aria-labelledby="checkout-review-title">
      <div className="checkout-review-heading"><h2 id="checkout-review-title">مرور انتخاب‌های تو <span>({formatNumber(count)} عدد)</span></h2><Link href="/cart">ویرایش سبد<Icon name="arrow-left" size={16}/></Link></div>
      <ul>{resolved.map(({line,product,variant,available,limit})=><li key={line.variantId}>
        <span className="checkout-review-image">{product?<Image src={product.mediaType==='animation'?product.image:variant?.image??product.image} alt="" fill sizes="64px"/>:<Icon name="bag" size={24}/>}</span>
        <div><h3>{product?.name??'محصول در دسترس نیست'}</h3><p>{variant?.label??'تنوع ناموجود'} · {formatNumber(line.quantity)} عدد</p>{!available||line.quantity>limit?<p className="basket-stock-note">برای اصلاح این انتخاب به سبد خرید برگرد.</p>:null}</div>
        <span className="basket-money">{available&&variant?<><bdi>{formatPrice(variant.priceToman*line.quantity)}</bdi><small>تومان</small></>:'ناموجود'}</span>
      </li>)}</ul>
    </section>
  </OrderCheckout>;
}

export function CheckoutPage() {
  const {settings:{checkout:config}}=useSiteSettings();
  const {cart,cartOwner,cartRevision}=useStore();
  const hydrated=useCartHydrated();
  const router=useRouter();
  const [heldBasket,setHeldBasket] = useState<{lines:CartLine[];revision:string}|null>(null);
  const [checkedOwner,setCheckedOwner] = useState('');
  const [lookupRetry,setLookupRetry] = useState(0);
  const [lookupFailed,setLookupFailed] = useState(false);
  const [earlierAttempt,setEarlierAttempt] = useState(false);
  const submitted = useCallback((value:OrderReceipt) => {
    if (cartOwner) refreshBasketAfterOrder(cartOwner);
    router.replace('/checkout/'+value.number);
    window.scrollTo({top:0,behavior:'auto'});
  }, [cartOwner,router]);
  useEffect(() => {
    if (!cartOwner) return;
    const controller = new AbortController();
    const attempt = readOrderAttempt(cartOwner);
    const lookup = attempt ? findOrderAttempt(attempt.id, controller.signal) : Promise.resolve(null);
    lookup.then(order => {
      if (controller.signal.aborted) return;
      if (order && attempt) {
        forgetOrderAttempt(cartOwner, attempt.id);
        submitted(order);
        return;
      }
      setEarlierAttempt(Boolean(attempt));
      setLookupFailed(false);
      setCheckedOwner(cartOwner);
    }, () => {
      if (!controller.signal.aborted) {
        setLookupFailed(true);
        setCheckedOwner(cartOwner);
      }
    });
    return () => controller.abort();
  }, [cartOwner,lookupRetry,submitted]);
  function holdBasket(hold:boolean) {
    if (hold && cartRevision) setHeldBasket({lines:cart,revision:cartRevision});
    if (!hold) setHeldBasket(null);
  }
  function retryLookup() {
    setCheckedOwner('');
    setLookupRetry(previous => previous + 1);
  }
  const lines = heldBasket?.lines ?? cart;
  const revision = heldBasket?.revision ?? cartRevision;
  return <>
    <nav className="basket-breadcrumb" aria-label="مسیر صفحه"><Link href="/">خانه</Link><Icon name="chevron" size={13}/><Link href="/cart">سبد خرید</Link><Icon name="chevron" size={13}/><span aria-current="page">تکمیل سفارش</span></nav>
    <header className="basket-heading"><div><h1>{config.title}</h1><p>{config.description}</p></div><Link href="/cart" className="basket-continue">بازگشت به سبد خرید<Icon name="arrow-left" size={19}/></Link></header>
    <BasketNotice/>
    {!hydrated || checkedOwner !== cartOwner ? <CartLoading/> :
      lookupFailed ? <CartError error="وضعیت ثبت سفارش قبلی مشخص نشد. دوباره بررسی کن." retry={retryLookup}/> :
      lines.length && revision ? <CheckoutDetails lines={lines} revision={revision} onHoldBasket={holdBasket} onSubmitted={submitted}/> :
      <>{earlierAttempt && <p className="basket-attention" role="status">می‌تونی وضعیت ثبت رو دوباره بررسی کنی یا <Link href="/myaccount/orders">سفارش‌هات رو ببینی</Link>. <button type="button" onClick={retryLookup}>بررسی دوباره</button></p>}<EmptyCart/></>}
  </>;
}
