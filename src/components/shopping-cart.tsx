'use client';

import Image from 'next/image';
import {useRef, useState} from 'react';
import {useSiteSettings} from './site-settings-provider';
import Link from 'next/link';
import { formatNumber, formatPrice } from '@/lib/format';
import {ApiError} from '@/lib/api';
import {useRouter} from 'next/navigation';
import {setQuantity, useStore, type CartLine } from '@/lib/store';
import { summarizeCart, useCartHydrated, useCartProducts } from '@/lib/use-cart-products';
import { AskPoostikalLink } from './chat-transition';
import { BasketNotice, CartError, CartLoading, EmptyCart } from './cart-feedback';
import { Icon } from './icons';
import { useUI } from './ui-context';

function Money({ value }: { value: number }) {
  return <span className="basket-money"><bdi>{formatPrice(value)}</bdi><small>تومان</small></span>;
}

function FilledCart({ lines }: { lines: CartLine[] }) {
  const {settings:{cart:config}}=useSiteSettings();
  const { products, loading, revalidating, error, retry } = useCartProducts(lines);
  const { toast } = useUI(),router=useRouter();
  const {cartRevision} = useStore();
  const editing = useRef(false);
  const [busy, setBusy] = useState(false);
  async function changeQuantity(line: CartLine, quantity: number) {
    if (editing.current) return;
    editing.current = true;
    setBusy(true);
    try {
      await setQuantity(line.variantId, quantity, cartRevision);
      if (quantity === 0) toast('از سبد خریدت حذف شد');
    } catch(error){
      if(error instanceof ApiError && error.status===401)router.replace('/login?reason=shopping');
      else if (error instanceof ApiError && error.status === 409) toast('سبدت تغییر کرده. انتخاب‌هات رو دوباره بررسی کن.');
      else toast('وضعیت ویرایش مشخص نشد. سبدت رو بررسی کن.');
    } finally {
      editing.current = false;
      setBusy(false);
    }
  }
  if (loading) return <CartLoading/>;
  if (error) return <CartError error={error} retry={retry}/>;

  const {resolved, subtotal, total, discount, needsAttention, count} = summarizeCart(lines, products);
  return <div className="basket-layout">
      <section className="basket-items basket-glass" aria-labelledby="basket-items-title">
        <div className="basket-list-heading"><h2 id="basket-items-title">{config.itemsTitle}</h2><span>{formatNumber(count)} عدد در سبد</span></div>
        <ul className="basket-list">{resolved.map(({ line, product, variant, limit, available }, index) => <li className={`basket-item${!available ? ' is-unavailable' : ''}`} key={line.variantId}>
          {product ? <Link className="basket-product-image" href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true"><Image src={product.mediaType === 'animation' ? product.image : variant?.image ?? product.image} alt="" fill sizes="(max-width: 540px) 78px, 112px" quality={95} loading={index === 0 ? 'eager' : 'lazy'}/></Link> : <span className="basket-product-image basket-missing-image" aria-hidden="true"><Icon name="bag" size={32}/></span>}
          <div className="basket-product-copy">{product?.brand ? <span className="basket-brand" dir="auto">{product.brand}</span> : null}<h3>{product ? <Link href={`/products/${product.slug}`}>{product.name}</Link> : 'این محصول دیگر در دسترس نیست'}</h3>{variant ? <p className="basket-variant">{variant.label}</p> : null}
            {!available ? <p className="basket-stock-note">{!product || !variant ? 'این انتخاب را از سبد حذف کن.' : 'فعلاً امکان خرید این محصول وجود ندارد.'}</p> : line.quantity > limit ? <button className="basket-stock-fix" disabled={busy} onClick={() => void changeQuantity(line, limit)}>{limit === 20 ? 'سقف خرید هر محصول ۲۰ عدد است؛ اصلاح تعداد' : <>فقط {formatNumber(limit)} عدد موجوده؛ اصلاح تعداد</>}</button> : limit < 5 ? <p className="basket-stock-note">{formatNumber(limit)} عدد باقی‌مانده</p> : product?.stock == null && variant?.stock == null ? <p className="basket-stock-note">موجود</p> : null}
          </div>
          <div className="basket-quantity" role="group" aria-label={`تعداد ${product?.name ?? 'محصول'}`}><button type="button" aria-label={`افزایش تعداد ${product?.name ?? 'محصول'}`} disabled={busy || revalidating || !available || line.quantity >= limit} onClick={() => void changeQuantity(line, line.quantity + 1)}><Icon name="plus" size={16}/></button><span aria-live="polite">{formatNumber(line.quantity)}</span><button type="button" aria-label={`کاهش تعداد ${product?.name ?? 'محصول'}`} disabled={busy || line.quantity <= 1} onClick={() => void changeQuantity(line, line.quantity - 1)}><Icon name="minus" size={16}/></button></div>
          <div className="basket-item-price">{available && variant ? <>{(variant.originalPriceToman ?? 0) > variant.priceToman ? <del>{formatPrice(variant.originalPriceToman! * line.quantity)}</del> : null}<Money value={variant.priceToman * line.quantity}/>{line.quantity > 1 ? <span className="basket-unit-price">هر عدد {formatPrice(variant.priceToman)} تومان</span> : null}</> : <span className="basket-unavailable-label">ناموجود</span>}</div>
          <button className="basket-remove" type="button" disabled={busy} aria-label={`حذف ${product?.name ?? 'محصول ناموجود'} از سبد`} onClick={() => void changeQuantity(line, 0)}><Icon name="trash" size={18}/></button>
        </li>)}</ul>
        {discount > 0 ? <div className="basket-savings"><Icon name="sparkles" size={21}/><p>با این انتخاب‌ها، <strong>{formatPrice(discount)} تومان</strong> کمتر پرداخت می‌کنی.</p></div> : null}
        <div className="basket-list-bottom"><Icon name="bag" size={18}/><span>سبدت بعد از ۲۴ ساعت بدون تغییر خالی می‌شه.</span></div>
      </section>
      <aside className="basket-order basket-glass" aria-labelledby="basket-summary-title">
        <h2 id="basket-summary-title">{config.summaryTitle}</h2>
        <dl className="basket-totals"><div><dt>جمع محصولات <span>({formatNumber(count)} عدد)</span></dt><dd><Money value={subtotal}/></dd></div>{discount>0?<div className="basket-discount"><dt>تخفیف محصولات</dt><dd><Money value={discount}/></dd></div>:null}<div className="basket-shipping"><dt>هزینه ارسال</dt><dd>در مرحله بعد مشخص می‌شود</dd></div></dl>
        <div className="basket-grand-total" aria-live="polite"><span>جمع سبد خرید</span><Money value={total}/></div>
        {needsAttention?<p className="basket-attention" role="status">کالاهای ناموجود یا تعداد بیشتر از موجودی را اصلاح کن.</p>:null}
        {busy||revalidating||needsAttention||total<=0?<button className="basket-primary" disabled>{config.checkoutLabel}<Icon name="arrow-left" size={20}/></button>:<Link className="basket-primary" href="/checkout">{config.checkoutLabel}<Icon name="arrow-left" size={20}/></Link>}
        <p className="basket-payment-note">{config.paymentNote}</p>
      </aside>
  </div>;
}

export function ShoppingCart() {
  const {settings:{cart:config,navbar}}=useSiteSettings();
  const { cart } = useStore();
  const hydrated = useCartHydrated();
  return <>
    <nav className="basket-breadcrumb" aria-label="مسیر صفحه"><Link href="/">خانه</Link><Icon name="chevron" size={13}/><span aria-current="page">سبد خرید</span></nav>
    <header className="basket-heading"><div><h1>{config.title}</h1><p>{config.description}</p></div><Link href="/shop" className="basket-continue">{config.continueLabel}<Icon name="arrow-left" size={19}/></Link></header>
    <BasketNotice/>
    {!hydrated ? <CartLoading/> : cart.length ? <FilledCart lines={cart}/> : <EmptyCart/>}
    {config.showAssistance?<div className="basket-assistance"><span>{config.assistanceText}</span><AskPoostikalLink><Icon name="lips" size={23}/>{navbar.askLabel}<Icon name="arrow-left" size={16}/></AskPoostikalLink></div>:null}
  </>;
}
