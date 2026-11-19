'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {formatPrice} from '@/lib/format';
import {normalizeDigits} from '@/lib/orders';
import {orderStatusLabels,type AdminOrder} from '@/lib/admin-preview';
import {receiptLabels,type ReceiptRow,type ReceiptStatus} from '@/lib/payment';
import {AdminBadge,AdminEmpty,AdminModal,AdminPageHeading,AdminPagination,AdminPanel} from './admin-ui';
import {AdminIcon} from './admin-icon';
import styles from '../payment.module.css';

const date=(s:string)=>new Date(s).toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'});
const badge=(s:ReceiptStatus)=>({pending:'pending',approved:'delivered',rejected:'cancelled',cancelled:'cancelled'}[s]);

function Review({row,onClose,onDecision}:{row:ReceiptRow;onClose:()=>void;onDecision:()=>void}){
  const [order,setOrder]=useState<AdminOrder|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[imageReady,setImageReady]=useState(false);
  const [rejecting,setRejecting]=useState(false),[reason,setReason]=useState('');
  const image='/api/admin/payment-receipts/'+row.id+'/image';
  useEffect(()=>{const c=new AbortController();api<AdminOrder>('/admin/orders/'+row.orderNumber,{signal:c.signal}).then(setOrder).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[row]);
  async function decide(decision:'approved'|'rejected'){
    if(busy)return;if(decision==='rejected'&&!reason.trim()){setError('دلیل رد فیش را بنویس تا خریدار بتواند آن را اصلاح کند.');return;}setBusy(true);setError('');
    try{await api('/admin/payment-receipts/'+row.id,{method:'PUT',body:JSON.stringify(decision==='rejected'?{decision,reason:reason.trim()}:{decision})});onDecision();}
    catch(e){setError(e instanceof Error?e.message:'ثبت نتیجه انجام نشد.');}finally{setBusy(false);}
  }
  return <AdminModal wide title={'فیش واریزی سفارش #'+row.orderNumber} onClose={()=>{if(!busy)onClose();}}>
    <div className={styles.adminCompare}><div>
      {/* The protected original must bypass the public Next image optimizer and its disk cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {row.hasImage ? <img className={styles.photo} src={image} alt={'تصویر فیش سفارش '+row.orderNumber} onLoad={()=>setImageReady(true)} onError={()=>{setImageReady(false);setError('تصویر فیش در دسترس نیست. فهرست را تازه کن.');}}/> : <p>مهلت نگهداری تصویر تمام شده است.</p>}
      {imageReady&&<a className="admin-table-action" href={image} target="_blank" rel="noopener noreferrer">مشاهده در اندازه اصلی <AdminIcon name="external" size={15}/></a>}</div>
      <div><AdminBadge status={badge(row.status)}>{receiptLabels[row.status]}</AdminBadge><dl><dt>شماره سفارش</dt><dd><Link className="admin-table-action" href={'/admin/orders/'+row.orderNumber}><bdi>#{row.orderNumber}</bdi><AdminIcon name="arrow-left" size={14}/></Link></dd>
        <dt>گیرنده</dt><dd>{order?.recipient?.name??row.customerName}</dd><dt>مبلغ سفارش هنگام ارسال فیش</dt><dd>{formatPrice(row.amountToman)} تومان</dd>
        <dt>مبلغ فعلی سفارش</dt><dd>{formatPrice(order?.totalToman??row.orderTotalToman)} تومان</dd><dt>زمان دریافت فیش</dt><dd>{date(row.uploadedAt)}</dd>
        <dt>حذف خودکار تصویر</dt><dd>{date(row.expiresAt)}</dd></dl>
        {row.status==='rejected'&&<p><strong>دلیل رد: </strong>{row.rejectionReason||'ثبت نشده'}</p>}
        {order&&<><strong>اقلام سفارش</strong><ul>{order.items.map(item=><li key={item.variantId}>{item.name} · {item.quantity.toLocaleString('fa-IR')} عدد</li>)}</ul><p className="admin-small">وضعیت سفارش: {orderStatusLabels[order.status]}</p></>}
      </div></div>
      {order&&row.status==='pending'&&(order.totalToman!==row.amountToman||order.status==='cancelled')&&<p className="admin-form-error">مبلغ سفارش تغییر کرده یا سفارش لغو شده است. این فیش قابل تأیید نیست.</p>}
      {rejecting&&<label className="admin-small">دلیل رد فیش برای خریدار<textarea className="admin-field" autoFocus rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="چه چیزی باید در فیش جدید اصلاح شود؟"/></label>}
      {error&&<p role="alert" className="admin-form-error">{error}</p>}
      {row.status==='pending'&&<div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={busy||!imageReady||!order||order.status==='cancelled'||order.totalToman!==row.amountToman} onClick={()=>void decide('approved')}><AdminIcon name="check" size={17}/>تایید فیش</button>
        <button className="admin-button" disabled={busy||!order} onClick={()=>rejecting?void decide('rejected'):setRejecting(true)}><AdminIcon name="close" size={17}/>{rejecting?'ثبت دلیل و رد فیش':'رد فیش'}</button></div>}
  </AdminModal>;
}

export function AdminPaymentReceipts({initialNumber}:{initialNumber:string}){
  const [number,setNumber]=useState(initialNumber),[filter,setFilter]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [result,setResult]=useState<{items:ReceiptRow[];total:number}|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<ReceiptRow|null>(null);
  useEffect(()=>{const c=new AbortController();const q=new URLSearchParams({page:String(page)});if(filter)q.set('status',filter);if(number)q.set('number',number);
    api<{items:ReceiptRow[];total:number}>('/admin/payment-receipts?'+q,{signal:c.signal}).then(data=>{setResult(data);setError('');}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[filter,number,page,revision]);
  return <><AdminPageHeading title="فیش های واریزی" description="تصویر واریز را در کنار مبلغ و اقلام همان سفارش بررسی کن." action={<button className="admin-button" onClick={()=>setRevision(v=>v+1)}><AdminIcon name="refresh" size={17}/>تازه‌سازی</button>}/>
    <AdminPanel title="فهرست فیش‌ها"><div className="admin-table-toolbar"><label className="admin-search-field"><AdminIcon name="search" size={17}/><input inputMode="numeric" value={number} aria-label="جستجوی شماره سفارش" placeholder="جستجوی شماره سفارش…" onChange={e=>{setNumber(normalizeDigits(e.target.value).replace(/\D/g,'').slice(0,6));setPage(1);}}/></label>
    <select className="admin-field" aria-label="وضعیت فیش" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="">همه وضعیت‌ها</option>{(Object.keys(receiptLabels) as ReceiptStatus[]).map(s=><option key={s} value={s}>{receiptLabels[s]}</option>)}</select></div>
    {error?<p role="alert" className="admin-form-error">{error}</p>:!result?<p role="status">در حال دریافت فیش‌ها…</p>:result.items.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>سفارش</th><th>گیرنده</th><th>مبلغ سفارش</th><th>زمان دریافت</th><th>وضعیت فیش</th><th>بررسی</th></tr></thead><tbody>{result.items.map(row=><tr key={row.id}><td><Link href={'/admin/orders/'+row.orderNumber}><bdi>#{row.orderNumber}</bdi></Link></td><td>{row.customerName}</td><td>{formatPrice(row.amountToman)} تومان</td><td>{date(row.uploadedAt)}</td><td><AdminBadge status={badge(row.status)}>{receiptLabels[row.status]}</AdminBadge></td><td><button className="admin-table-action" onClick={()=>setSelected(row)}><AdminIcon name="eye" size={17}/>مشاهده فیش</button></td></tr>)}</tbody></table></div>:<AdminEmpty title="فیشی پیدا نشد." description="فیش‌های ارسالی خریداران به مدت هفت روز در این بخش نمایش داده می‌شوند."/>}
    {result&&<AdminPagination page={page} pages={Math.ceil(result.total/20)} total={result.total} onChange={setPage}/>}</AdminPanel>
    {selected&&<Review row={selected} onClose={()=>setSelected(null)} onDecision={()=>{setSelected(null);setRevision(v=>v+1);}}/>}</>;
}
