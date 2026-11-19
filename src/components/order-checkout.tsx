'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useStore,setCartOwner,isCurrentCartOwner} from '@/lib/store';
import { api, ApiError } from '@/lib/api';
import { formatNumber, formatPrice } from '@/lib/format';
import {findOrderAttempt, forgetOrderAttempt, readOrderAttempt, writeOrderAttempt} from '@/lib/order-attempt';
import { normalizeDigits, type CheckoutItem, type OrderReceipt, type OrderRecipient, type ShippingMethod } from '@/lib/orders';
import { Icon } from './icons';
import type {SavedAddress} from '@/lib/customer-address';

function Money({value}:{value:number}) {return <span className="basket-money"><bdi>{formatPrice(value)}</bdi><small>تومان</small></span>;}

type RecipientFieldName = keyof OrderRecipient;
type FieldErrors = Partial<Record<RecipientFieldName, string>>;
type PendingSubmission = { owner:string; requestId:string; body:string };
const recipientFields: RecipientFieldName[] = ['name','phone','province','city','address','postalCode','note'];

function fieldError(field:RecipientFieldName,raw:string):string {
  const value=raw.trim();
  switch(field) {
    case 'name': return !value?'نام و نام خانوادگی گیرنده رو بنویس.':value.length<2?'نام گیرنده باید حداقل ۲ حرف داشته باشه.':value.length>100?'نام گیرنده باید کمتر از ۱۰۰ حرف باشه.':'';
    case 'phone': return !value?'شماره موبایل گیرنده رو وارد کن.':!/^09\d{9}$/.test(normalizeDigits(value))?'شماره موبایل باید ۱۱ رقم باشه و با ۰۹ شروع بشه.':'';
    case 'province': return !value?'استان مقصد رو بنویس.':value.length<2?'نام استان رو کامل بنویس.':value.length>70?'نام استان بیش از حد طولانیه.':'';
    case 'city': return !value?'شهر مقصد رو بنویس.':value.length<2?'نام شهر رو کامل بنویس.':value.length>70?'نام شهر بیش از حد طولانیه.':'';
    case 'address': return !value?'آدرس کامل تحویل رو بنویس.':value.length<10?'آدرس رو کامل‌تر بنویس؛ خیابان، کوچه، پلاک و واحد.':value.length>1000?'آدرس باید حداکثر ۱۰۰۰ حرف داشته باشه.':'';
    case 'postalCode': return !value?'کد پستی آدرس تحویل رو وارد کن.':!/^\d{10}$/.test(normalizeDigits(value))?'کد پستی باید دقیقاً ۱۰ رقم باشه.':'';
    case 'note': return value.length>1000?'یادداشت باید حداکثر ۱۰۰۰ حرف داشته باشه.':'';
  }
}

function RecipientField({name,label,placeholder,autoComplete,maxLength,error,onValidate,multiline=false,numeric=false}:{name:RecipientFieldName;label:string;placeholder:string;autoComplete?:string;maxLength:number;error?:string;onValidate:(name:RecipientFieldName,value:string,blur:boolean)=>void;multiline?:boolean;numeric?:boolean}) {
  const id=`checkout-${name}`;
  const common={id,name,placeholder,autoComplete,maxLength,required:name!=='note','aria-invalid':Boolean(error),'aria-describedby':error?`${id}-error`:undefined,onBlur:(e:React.FocusEvent<HTMLInputElement|HTMLTextAreaElement>)=>onValidate(name,e.currentTarget.value,true),onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onValidate(name,e.currentTarget.value,false)};
  return <div className={`basket-field${multiline?' basket-field-wide':''}`}>
    <label htmlFor={id}>{label}{name==='note'?<small>اختیاری</small>:null}{multiline?<textarea {...common} rows={3}/>:<input {...common} type={name==='phone'?'tel':'text'} inputMode={numeric?'numeric':undefined} dir={numeric?'ltr':undefined}/>}</label>
    {error?<p className="basket-field-error" id={`${id}-error`}><span aria-hidden="true">!</span>{error}</p>:null}
  </div>;
}

export function OrderConfirmation({order,children}:{order:OrderReceipt;children:ReactNode}) {
  const {settings:{checkout:config}}=useSiteSettings();
  return <section className="basket-confirmation basket-glass" aria-labelledby="order-confirmed-title">
    <span className="basket-confirmation-mark"><Icon name="check" size={35}/></span><span className="basket-step-label">انتخاب‌هات ثبت شد</span>
    <h1 id="order-confirmed-title">{config.successTitle}</h1><p>{config.successDescription}</p>
    <div className="basket-confirmation-number"><span>شماره پیگیری سفارش</span><strong dir="ltr">{order.number}</strong></div>
    <ul>{order.items.map(item=><li key={item.variantId}><span>{item.name}<small>{item.variantLabel} · {formatNumber(item.quantity)} عدد</small></span><Money value={item.unitPriceToman*item.quantity}/></li>)}</ul>
    <div className="basket-confirmation-shipping"><span>ارسال با {order.shipping.name}</span><strong>{order.shipping.type==='collect'?'هزینه ارسال: پس‌کرایه':`${formatPrice(order.shippingToman)} تومان`}</strong></div>
    <div className="basket-grand-total"><span>مبلغ سفارش</span><Money value={order.totalToman}/></div>
    {order.shipping.type==='collect'?<p>هزینه ارسال {order.shipping.name} در مبلغ بالا نیست و هنگام تحویل جداگانه پرداخت می‌شود.</p>:null}
    {children}
    <Link href="/shop" className="basket-primary">بازگشت به فروشگاه<Icon name="arrow-left" size={20}/></Link>
  </section>;
}

export function OrderCheckout({children,items,basketRevision,subtotal,discount,total,count,needsAttention,stockLoading,onSubmitted,onRefresh,onHoldBasket}:{
  children:ReactNode;items:CheckoutItem[];basketRevision:string;subtotal:number;discount:number;total:number;count:number;
  needsAttention:boolean;stockLoading:boolean;onSubmitted:(order:OrderReceipt)=>void;onRefresh:()=>void;onHoldBasket:(hold:boolean)=>void;
}) {
  const {settings:{checkout:config}}=useSiteSettings();
  const router=useRouter(), {cartOwner}=useStore();
  const [shipping,setShipping]=useState<ShippingMethod[]>([]);
  const [selection,setSelection]=useState('');
  const [savedAddresses,setSavedAddresses]=useState<SavedAddress[]>([]);
  useEffect(()=>{const controller=new AbortController();
    api<SavedAddress[]>('/customer/addresses',{signal:controller.signal}).then(setSavedAddresses).catch(()=>{});
    return()=>controller.abort();},[]);
  const [loading,setLoading]=useState(true);
  const [shippingError,setShippingError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState('');
  const [fieldErrors,setFieldErrors]=useState<FieldErrors>({});
  const touched=useRef<Partial<Record<RecipientFieldName,boolean>>>({});
  const errorCount=Object.values(fieldErrors).filter(Boolean).length;
  const submitting=useRef(false);
  const pending=useRef<PendingSubmission|null>(null);
  const method=shipping.find(item=>item.id===selection)??shipping[0];
  const fee=method?.feeToman??0;
  useEffect(()=>{
    const controller=new AbortController();
    api<ShippingMethod[]>('/shipping-methods',{signal:controller.signal}).then(value=>{setShipping(value);setShippingError('');setLoading(false);}).catch(()=>{if(!controller.signal.aborted){setShippingError('روش‌های ارسال دریافت نشد. دوباره امتحان کن.');setLoading(false);}});
    return()=>controller.abort();
  },[attempt]);

  function validateField(name:RecipientFieldName,value:string,blur:boolean) {
    if(blur)touched.current[name]=true;
    if(touched.current[name])setFieldErrors(previous=>({...previous,[name]:fieldError(name,value)}));
  }

  function complete(order:OrderReceipt, saved:PendingSubmission) {
    forgetOrderAttempt(saved.owner, saved.requestId);
    pending.current = null;
    if (isCurrentCartOwner(saved.owner)) onSubmitted(order);
  }

  async function send(saved:PendingSubmission) {
    try {
      const order = await api<OrderReceipt>('/orders', {
        method: 'POST', headers: {'X-Checkout-Account':saved.owner},
        body: saved.body, signal: AbortSignal.timeout(30_000),
      });
      complete(order, saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCartOwner(null);
        router.replace('/login?reason=shopping');
        return;
      }
      // A timeout or gateway failure can hide a committed order. Look up the
      // authenticated attempt and retain the same submission until resolved.
      if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) {
        const order = await findOrderAttempt(saved.requestId).catch(() => null);
        if (order) { complete(order, saved); return; }
        setUncertain(true);
        setError('وضعیت ثبت سفارش مشخص نشد. برای پیگیری همین سفارش دوباره تلاش کن.');
        return;
      }
      pending.current = null;
      forgetOrderAttempt(saved.owner, saved.requestId);
      setUncertain(false);
      setError(error.message);
      onHoldBasket(false);
      if (error.status === 409) {
        setAttempt(value => value + 1);
        onRefresh();
      }
    }
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !cartOwner) return;
    if (pending.current) {
      submitting.current = true;
      setBusy(true);
      try { await send(pending.current); }
      finally { submitting.current = false; setBusy(false); }
      return;
    }
    if (!method || needsAttention || stockLoading || !items.length || !basketRevision) return;
    const fields=new FormData(event.currentTarget);
    const recipient={name:String(fields.get('name')??'').trim(),phone:normalizeDigits(String(fields.get('phone')??'').trim()),province:String(fields.get('province')??'').trim(),city:String(fields.get('city')??'').trim(),address:String(fields.get('address')??'').trim(),postalCode:normalizeDigits(String(fields.get('postalCode')??'').trim()),note:String(fields.get('note')??'').trim()};
    const errors:FieldErrors={};
    for(const name of recipientFields){touched.current[name]=true;const message=fieldError(name,recipient[name]);if(message)errors[name]=message;}
    setFieldErrors(errors);setError('');
    const firstInvalid=recipientFields.find(name=>errors[name]);
    if(firstInvalid){
      const input=event.currentTarget.elements.namedItem(firstInvalid);
      if(input instanceof HTMLElement){input.focus({preventScroll:true});input.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
      return;
    }
    const body={items,recipient,shippingMethodId:method.id,expectedShippingFeeToman:method.feeToman,expectedShippingType:method.type,basketRevision};
    submitting.current=true;setBusy(true);setError('');
    onHoldBasket(true);
    try {
      // Keep only a fingerprint and retry key, never the recipient's details.
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
      const payload=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const cached = readOrderAttempt(cartOwner);
      const requestId = cached?.payload === payload ? cached.id : crypto.randomUUID();
      writeOrderAttempt(cartOwner,{payload,id:requestId});
      const saved = {owner:cartOwner,requestId,body:JSON.stringify({...body,requestId})};
      pending.current = saved;
      await send(saved);
    } catch {
      setError('آماده‌سازی سفارش انجام نشد. دوباره تلاش کن.');
      if (!pending.current) onHoldBasket(false);
    } finally {submitting.current=false;setBusy(false);}
  }
  return <div className="basket-layout basket-checkout-layout">
    <div className="basket-main-column">
      <form id="checkout-form" className="basket-checkout-form basket-glass" onSubmit={submit} aria-busy={busy} noValidate>
        <fieldset disabled={busy||uncertain}><legend><span>۱</span>{config.recipientTitle}</legend><p className="basket-form-intro">{config.recipientDescription} شماره گیرنده می‌تواند متفاوت باشد؛ سفارش فقط در حسابی دیده می‌شود که با آن خرید می‌کنی.</p>
          {errorCount>0?<div className="basket-validation-notice" role="alert"><span className="basket-validation-icon" aria-hidden="true"><Icon name="clipboard" size={23}/></span><div><strong>فقط چندتا جزئیات مونده!</strong><p>{formatNumber(errorCount)} مورد مشخص‌شده رو کامل کن تا سفارشت ثبت بشه.</p></div></div>:null}
          {savedAddresses.length>0&&<label className="basket-field">استفاده از نشانی ذخیره‌شده
            <select defaultValue="" onChange={e=>{const select=e.currentTarget,row=savedAddresses.find(r=>r.id===select.value);if(!row||!select.form)return;
              for(const key of recipientFields){if(key==='note')continue;const el=select.form.elements.namedItem(key);if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)el.value=row[key];}
              setFieldErrors({});select.value='';
            }}><option value="">انتخاب از دفترچه آدرس</option>{savedAddresses.map(r=><option key={r.id} value={r.id}>{r.label} · {r.city}</option>)}</select></label>}
          <div className="basket-fields">
            <RecipientField name="name" label="نام و نام خانوادگی گیرنده" autoComplete="shipping name" maxLength={100} placeholder="نام کامل گیرنده" error={fieldErrors.name} onValidate={validateField}/>
            <RecipientField name="phone" label="شماره موبایل گیرنده" autoComplete="shipping tel" maxLength={11} placeholder="09123456789" numeric error={fieldErrors.phone} onValidate={validateField}/>
            <RecipientField name="province" label="استان" autoComplete="shipping address-level1" maxLength={70} placeholder="استان مقصد" error={fieldErrors.province} onValidate={validateField}/>
            <RecipientField name="city" label="شهر" autoComplete="shipping address-level2" maxLength={70} placeholder="شهر مقصد" error={fieldErrors.city} onValidate={validateField}/>
            <RecipientField name="address" label="آدرس کامل" autoComplete="shipping street-address" maxLength={1000} placeholder="خیابان، کوچه، پلاک و واحد" multiline error={fieldErrors.address} onValidate={validateField}/>
            <RecipientField name="postalCode" label="کد پستی" autoComplete="shipping postal-code" maxLength={10} placeholder="کد پستی ۱۰ رقمی" numeric error={fieldErrors.postalCode} onValidate={validateField}/>
            <RecipientField name="note" label="یادداشت سفارش" maxLength={1000} placeholder="نکته‌ای برای تحویل سفارش داری؟" error={fieldErrors.note} onValidate={validateField}/>
          </div>
        </fieldset>
        <fieldset className="basket-shipping-methods" disabled={busy||uncertain||loading}><legend><span>۲</span>روش ارسال رو انتخاب کن</legend>
          {loading?<p role="status">در حال دریافت روش‌های ارسال…</p>:shippingError?<p className="basket-attention" role="alert">{shippingError}<button type="button" onClick={()=>{setLoading(true);setAttempt(v=>v+1);}}>تلاش دوباره</button></p>:!shipping.length?<p className="basket-attention">هنوز روش ارسالی فعال نشده است. لطفاً کمی بعد دوباره امتحان کن.</p>:shipping.map(item=><label className={`basket-shipping-option${method?.id===item.id?' is-selected':''}`} key={item.id}><input type="radio" name="shipping" value={item.id} checked={method?.id===item.id} onChange={()=>setSelection(item.id)}/><span><strong>{item.name}</strong><small>{item.description|| (item.type==='collect'?'هزینه حمل هنگام تحویل پرداخت می‌شود.':'ارسال با هزینه ثابت')}</small></span><b>{item.type==='collect'?'پس‌کرایه':`${formatPrice(item.feeToman)} تومان`}</b></label>)}
        </fieldset>
        {error?<p className="basket-checkout-error" role="alert">{error}</p>:null}
      </form>
      <div className={busy||uncertain?'basket-items-locked':''} inert={busy||uncertain}>{children}</div>
    </div>
    <aside className="basket-order basket-glass" aria-labelledby="basket-summary-title"><h2 id="basket-summary-title">خلاصه سفارش</h2><dl className="basket-totals"><div><dt>جمع محصولات <span>({formatNumber(count)} عدد)</span></dt><dd><Money value={subtotal}/></dd></div>{discount>0?<div className="basket-discount"><dt>تخفیف محصولات</dt><dd><Money value={discount}/></dd></div>:null}<div className="basket-shipping"><dt>هزینه ارسال</dt><dd>{loading?'در حال دریافت…':method?.type==='collect'?'پس‌کرایه':method?<Money value={fee}/>:'انتخاب روش ارسال'}</dd></div></dl><div className="basket-grand-total" aria-live="polite"><span>مبلغ سفارش</span><Money value={total+fee}/></div>
      {method?.type==='collect'?<p className="basket-collect-note">هزینه حمل جداگانه هنگام تحویل پرداخت می‌شود و در جمع بالا نیست.</p>:null}
      {needsAttention?<p className="basket-attention" role="status">بعضی انتخاب‌ها نیاز به اصلاح دارند. <Link href="/cart">بازگشت به سبد خرید</Link></p>:null}
      <button className="basket-primary" type="submit" form="checkout-form" disabled={busy||(!uncertain&&(loading||stockLoading||!!shippingError||!method||needsAttention||total<=0))}>{busy?'در حال ثبت سفارش…':uncertain?'پیگیری ثبت سفارش':config.submitLabel}<Icon name="check" size={20}/></button>
      {config.note?<p className="basket-payment-note">{config.note}</p>:null}<p className="basket-payment-note">پس از ثبت سفارش می‌توانی اطلاعات واریز و وضعیت فیش را در صفحه پیگیری ببینی.</p>
      {error?<p className="basket-attention" role="alert">{error}</p>:null}
    </aside>
  </div>;
}
