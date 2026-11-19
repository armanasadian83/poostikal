'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {api,ApiError} from '@/lib/api';
import {formatPrice} from '@/lib/format';
import {prepareReceipt,receiptLabels,type PaymentConfirmation as Confirmation,type BankCard,type PaymentReceipt} from '@/lib/payment';
import {OrderConfirmation} from './order-checkout';
import {Icon} from './icons';
import styles from './payment.module.css';

export function TransferCard({bank}:{bank:BankCard|null}){
  const [copied,setCopied]=useState('');
  return <div className={styles.card}>
    <div className={styles.cardHead}><span>کارت مقصد</span><Icon name="lips" size={32}/></div>
    <span className={styles.chip} aria-hidden="true"/>
    <bdi className={styles.digits} dir="ltr">{bank?bank.cardNumber.match(/.{4}/g)?.join('  '):'••••  ••••  ••••  ••••'}</bdi>
    <div className={styles.cardFoot}><div><small>صاحب حساب</small><strong>{bank?.holderName||'کارت هنوز تنظیم نشده است'}</strong></div>
      {bank&&<button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(bank.cardNumber);setCopied('کپی شد');}catch{setCopied('شماره را انتخاب و کپی کن');}}}><Icon name="clipboard" size={16}/><span aria-live="polite">{copied||'کپی شماره'}</span></button>}
    </div>
  </div>;
}

function Upload({number,amount,enabled,onSuccess,onConflict}:{number:string;amount:number;enabled:boolean;onSuccess:(r:PaymentReceipt)=>void;onConflict:()=>void}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const picker=useRef<HTMLInputElement>(null);
  async function submit(e:FormEvent){e.preventDefault();if(!file||busy||!enabled)return;
    setError('');setBusy(true);
    try{
      const blob=await prepareReceipt(file),form=new FormData();form.append('file',blob,'receipt');
      const row=await api<PaymentReceipt>('/order-payment/'+number+'/receipt',{method:'POST',headers:{'X-Order-Total':String(amount)},body:form});
      onSuccess(row);
    }catch(e){setError(e instanceof ApiError&&e.status===413?'حجم فیش نباید بیشتر از ۱۰ مگابایت باشد.':e instanceof Error?e.message:'ارسال فیش انجام نشد. دوباره تلاش کن.');if(e instanceof ApiError&&e.status===409)onConflict();}finally{setBusy(false);}
  }
  return <form className={styles.upload} onSubmit={submit}>
    <label className={styles.picker}><Icon name="clipboard" size={26}/><strong>{file?file.name:'انتخاب تصویر فیش'}</strong><small>JPG، PNG یا WebP · حداکثر ۱۰ مگابایت</small>
      <input ref={picker} aria-label="انتخاب تصویر فیش" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!enabled} onChange={e=>{const f=e.target.files?.[0];setError('');setFile(null);if(!f)return;if(f.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)){setError('یک تصویر JPG، PNG یا WebP با حجم حداکثر ۱۰ مگابایت انتخاب کن.');e.target.value='';}else setFile(f);}}/>
    </label>
    {error&&<small role="alert" className={styles.error}>{error}</small>}
    <button className={styles.action} disabled={!file||busy||!enabled}>{busy?'در حال آماده‌سازی و ارسال…':'ارسال فیش برای بررسی'}<Icon name="arrow-left" size={16}/></button>
  </form>;
}

export function PaymentConfirmation({number}:{number:string}){
  const router=useRouter();
  const [data,setData]=useState<Confirmation|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{const c=new AbortController();async function load(){try{const result=await api<Confirmation>('/order-payment/'+number,{signal:c.signal});if(!c.signal.aborted){setData(result);setError('');}}catch(e){if(c.signal.aborted)return;setData(null);if(e instanceof ApiError&&e.status===401){router.replace('/login');return;}setError(e instanceof Error?e.message:'دریافت سفارش انجام نشد.');}}
    void load();const refresh=()=>{if(!document.hidden)void load();};window.addEventListener('focus',refresh);return()=>{c.abort();window.removeEventListener('focus',refresh);};},[number,revision,router]);
  if(error||!data)return <section className="basket-confirmation basket-glass"><h1>{error?'دریافت سفارش ممکن نشد':'در حال دریافت سفارش…'}</h1>{error&&<><p role="alert">{error}</p><button type="button" className="basket-primary" onClick={()=>setRevision(v=>v+1)}>تلاش دوباره</button><Link href="/shop">بازگشت به فروشگاه</Link></>}</section>;
  return <OrderConfirmation order={data.order}><ReceiptPanel data={data} refresh={()=>setRevision(v=>v+1)} onUploaded={row=>setData(prev=>prev&&({...prev,receipt:row}))}/></OrderConfirmation>;
}

export function ReceiptPanel({data,refresh,onUploaded}:{data:Confirmation;refresh:()=>void;onUploaded:(row:PaymentReceipt)=>void}){
  const {order,bank,receipt,paymentStatus}=data,number=order.number;
  const cancelled=order.status==='cancelled',paid=paymentStatus==='paid'||receipt?.status==='approved',closed=order.status!=='pending',pending=receipt?.status==='pending',rejected=receipt?.status==='rejected'||(!receipt&&paymentStatus==='rejected');
  return <section className={styles.payment} aria-labelledby="transfer-heading">
    <div className={styles.intro}><span className={styles.kicker}>پرداخت سفارش</span><h3 id="transfer-heading">واریز کارت‌به‌کارت</h3>
    <p>{cancelled?'سفارش لغو شده و امکان ارسال فیش وجود ندارد.':paid?'پرداخت این سفارش توسط فروشگاه تأیید شده است.':closed?'این سفارش پذیرای فیش جدید نیست.':pending?'فیش به دست ما رسید. نتیجه بررسی در همین صفحه نمایش داده می‌شود.':bank?'مبلغ سفارش را به کارت زیر واریز کن، سپس تصویر خوانای فیش را بفرست.':'اطلاعات کارت مقصد هنوز ثبت نشده است. لطفاً پیش از واریز با فروشگاه تماس بگیر.'}</p></div>
    <div className={closed||paid?undefined:styles.columns}>{!closed&&!paid&&<TransferCard bank={bank}/>}<div className={styles.receiptBox}><h4>فیش پرداخت سفارش <bdi>#{number}</bdi></h4>
      <p>مبلغ سفارش: <strong>{formatPrice(order.totalToman)} تومان</strong></p>
      {(receipt||paid||rejected)&&<p className={styles.status} role="status">{receiptLabels[cancelled?'cancelled':receipt?.status??(paid?'approved':'rejected')]}</p>}
      {!receipt&&!paid&&!rejected&&<p className={styles.status}>هنوز فیشی ارسال نشده است.</p>}
      {!cancelled&&rejected&&<p><strong>دلیل رد فیش: </strong>{receipt?.rejectionReason||'برای این فیش قدیمی دلیلی ثبت نشده است.'}</p>}
      {!paid&&!closed&&!pending&&<Upload number={number} amount={order.totalToman} enabled={!!bank} onConflict={refresh} onSuccess={onUploaded}/>}
      {pending&&<button type="button" className={styles.textButton} onClick={refresh}>تازه‌سازی وضعیت</button>}
      <small className={styles.retention}>تصویر فیش فقط برای بررسی پرداخت نگهداری می‌شود و پس از ۷ روز حذف خواهد شد.</small>
    </div></div></section>;
}
