'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {orderStatusLabels,type AdminOrder,type AdminOrderStatus} from '@/lib/admin-preview';
import {formatNumber,formatPrice} from '@/lib/format';
import {normalizeSearch} from '@/lib/search';
import {useAdmin} from './admin-provider';
import {AdminIcon} from './admin-icon';
import {AdminBadge,AdminEmpty,AdminModal,AdminPageHeading,AdminPagination,AdminPanel,downloadAdminCsv} from './admin-ui';
const searchText=(v:string)=>normalizeSearch(v).replace(/[۰-۹٠-٩]/g,d=>String(d.charCodeAt(0)&15));
export function AdminOrders(){
 const {orders,refreshOrders,removeOrder}=useAdmin();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<AdminOrderStatus|'all'>('all'),[page,setPage]=useState(1),[error,setError]=useState(''),[deleting,setDeleting]=useState<AdminOrder|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')void refreshOrders().catch(()=>setError('دریافت سفارش‌ها انجام نشد.'));};refresh();window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[refreshOrders]);
 const filtered=orders.filter(o=>(filter==='all'||o.status===filter)&&searchText([o.number,o.userName,o.recipient?.phone].join(' ')).includes(searchText(query)));
 const pages=Math.max(1,Math.ceil(filtered.length/8)),current=Math.min(page,pages);
 async function trash(){if(!deleting||busy)return;setBusy(true);const r=await removeOrder(deleting.id);setBusy(false);if(r.ok)setDeleting(null);else setError(r.error??'انتقال انجام نشد.');}
 return <>
 <AdminPageHeading title="سفارشات" description="سفارش‌ها، جزئیات مشتری و وضعیت ارسال، در یک نگاه." action={<button className="admin-button" onClick={()=>downloadAdminCsv('orders.csv',[['سفارش','مشتری','وضعیت','مبلغ'],...filtered.map(o=>[o.number??o.id,o.userName,orderStatusLabels[o.status],o.totalToman])])}><AdminIcon name="download" size={18}/>خروجی سفارش‌ها</button>}/>
 <div className="admin-order-tools"><Link href="/admin/orders/shipping" className="admin-button"><AdminIcon name="send" size={18}/>حمل و نقل</Link><button className="admin-button" onClick={()=>void refreshOrders().then(()=>setError('')).catch(()=>setError('دریافت سفارش‌ها انجام نشد.'))}><AdminIcon name="refresh" size={18}/>تازه‌سازی</button></div>
 {error&&<p role="alert" className="admin-form-error">{error}</p>}
 <div className="admin-stat-strip"><div className="admin-summary-item"><span>همه سفارشات</span><strong>{formatNumber(orders.length)}</strong></div>{Object.entries(orderStatusLabels).map(([s,label])=><div className="admin-summary-item" key={s}><span>{label}</span><strong>{formatNumber(orders.filter(o=>o.status===s).length)}</strong></div>)}</div>
 <AdminPanel title="فهرست سفارشات">
 <div className="admin-toolbar"><label className="admin-search-field"><AdminIcon name="search" size={18}/><input type="search" aria-label="جستجوی سفارشات" placeholder="شماره سفارش، نام یا موبایل..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><select className="admin-field" aria-label="وضعیت سفارش" value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}><option value="all">همه وضعیت‌ها</option>{Object.entries(orderStatusLabels).map(([s,l])=><option value={s} key={s}>{l}</option>)}</select></div>
{filtered.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>شماره سفارش</th><th>مشتری</th><th>تاریخ ثبت</th><th>مبلغ سفارش</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{filtered.slice((current-1)*8,current*8).map(o=><tr key={o.id}><td><Link href={'/admin/orders/'+o.number}><strong dir="ltr">#{o.number}</strong></Link></td><td>{o.userName}<small className="admin-muted admin-block">{formatNumber(o.items.reduce((s,i)=>s+i.quantity,0))} محصول</small></td><td>{o.dateLabel}</td><td>{formatPrice(o.totalToman)} <small>تومان</small></td><td><AdminBadge status={o.status}/></td><td><div className="admin-row-actions"><Link className="admin-table-action" href={'/admin/orders/'+o.number}>مشاهده<AdminIcon name="arrow-left" size={16}/></Link>
  <Link className="admin-icon-button" href={`/admin/orders/${encodeURIComponent(o.number ?? o.id)}/invoice`} prefetch={false} aria-label={`چاپ فاکتور سفارش ${o.number ?? o.id}`} title="چاپ فاکتور فروش"><AdminIcon name="printer" size={18}/></Link>
  <button className="admin-icon-button" aria-label={'انتقال سفارش '+o.number+' به سطل زباله'} onClick={()=>setDeleting(o)}><AdminIcon name="trash" size={18}/></button></div></td></tr>)}</tbody></table></div>:<AdminEmpty/>}
 <AdminPagination page={current} pages={pages} onChange={setPage} total={filtered.length}/></AdminPanel>
 {deleting&&<AdminModal title={'انتقال سفارش #'+deleting.number+' به سطل زباله'} onClose={()=>{if(!busy)setDeleting(null);}}><p>با انتقال سفارش به سطل زباله، موجودی رزروشدهٔ آن آزاد می‌شود. برای بازیابی سفارش، موجودی دوباره بررسی می‌شود.</p><div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={busy} onClick={()=>void trash()}>{busy?'در حال انتقال…':'انتقال به سطل زباله'}</button><button className="admin-button" disabled={busy} onClick={()=>setDeleting(null)}>انصراف</button></div></AdminModal>}
 </>;
}
