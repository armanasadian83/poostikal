'use client';

import Image from 'next/image';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {api, ApiError} from '@/lib/api';
import type {CustomerHistory} from '@/lib/customer-history';
import {orderStatusLabels, type AdminOrderStatus} from '@/lib/admin-preview';
import {formatNumber, formatPrice} from '@/lib/format';
import {AdminBadge, AdminEmpty, AdminModal, AdminPageHeading, AdminPagination, AdminPanel} from './admin-ui';
import {AdminIcon} from './admin-icon';
import {useAdmin} from './admin-provider';
import styles from './admin-customer-details.module.css';

const dateFormatter = new Intl.DateTimeFormat('fa-IR', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Tehran'});
function date(value:string|null) {return value && !Number.isNaN(Date.parse(value)) ? dateFormatter.format(new Date(value)) : 'ثبت نشده';}
const paymentLabels = {paid:'پرداخت شده', unpaid:'پرداخت نشده', rejected:'فیش رد شده'};

export function AdminCustomerDetails({id}:{id:string}) {
  const {updateUserStatus} = useAdmin();
  const [data,setData] = useState<CustomerHistory|null>(null);
  const [page,setPage] = useState(1);
  const [status,setStatus] = useState<AdminOrderStatus|'all'>('all');
  const [revision,setRevision] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notFound,setNotFound] = useState(false);
  const [confirming,setConfirming] = useState(false);
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<CustomerHistory>(`/admin/users/${encodeURIComponent(id)}/history?page=${page}&status=${status}`, {signal:controller.signal})
      .then(value => {if (!controller.signal.aborted) {setData(value); setError(''); setNotFound(false);}})
      .catch(err => {if (!controller.signal.aborted) {setError(err instanceof Error ? err.message : 'دریافت اطلاعات انجام نشد.'); setNotFound(err instanceof ApiError && err.status===404);}})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [id,page,status,revision]);
  function reload() {setLoading(true); setRevision(value=>value+1);}
  async function changeStatus() {
    if (!data || saving) return;
    setSaving(true); setSaveError('');
    const next = data.customer.status==='active' ? 'blocked' : 'active';
    const result = await updateUserStatus(id,next);
    setSaving(false);
    if (result.ok) {setData(current=>current ? {...current,customer:{...current.customer,status:next}} : current); setConfirming(false);}
    else setSaveError(result.error || 'تغییر وضعیت انجام نشد.');
  }
  const back = <Link href="/admin/users" className="admin-button"><AdminIcon name="arrow-right" size={18}/>همه مشتری‌ها</Link>;
  if (notFound) return <><AdminPageHeading title="مشتری پیدا نشد" action={back}/><AdminPanel><AdminEmpty title="این حساب در فهرست مشتری‌ها نیست" description="ممکنه حساب به سطل زباله منتقل شده باشه."/></AdminPanel></>;
  if (!data) return <><AdminPageHeading title="پرونده مشتری" action={back}/><AdminPanel>{error ? <div role="alert"><p>{error}</p><button className="admin-button" onClick={reload}>تلاش دوباره</button></div> : <p role="status">در حال دریافت پرونده مشتری…</p>}</AdminPanel></>;
  const {customer,stats,orders,topProducts,addresses} = data;
  const milestones = [
    {label:'عضویت در فروشگاه',at:customer.joinedAt},
    {label:'انتقال حساب از سایت قبلی',at:customer.importedAt},
    {label:'اولین سفارش',at:stats.firstOrderAt},
    {label:'آخرین سفارش',at:stats.lastOrderAt},
    {label:'آخرین ورود موفق',at:customer.lastLoginAt},
  ].filter(item=>item.at).sort((a,b)=>Date.parse(b.at!)-Date.parse(a.at!));
  return <div className={styles.page}>
    <AdminPageHeading title={customer.name} description="پرونده مشتری · اطلاعات حساب و سابقه خرید" action={back}/>
    <div className={styles.actions}>
      <a href="#customer-orders" className="admin-button admin-button-primary"><AdminIcon name="orders" size={18}/>مشاهده سفارش‌های مشتری</a>
      <a href="#customer-products" className="admin-button"><AdminIcon name="products" size={18}/>محصولات پرخرید</a>
      <button type="button" className="admin-icon-button" aria-label="تازه‌سازی پرونده" title="تازه‌سازی پرونده" disabled={loading} onClick={reload}><AdminIcon name="refresh" size={18}/></button>
    </div>
    {error && <p role="alert" className="admin-form-error">{error} <button className="admin-button" onClick={reload}>تلاش دوباره</button></p>}
    <div className="admin-stat-strip">
      <div className="admin-summary-item"><span>همه سفارش‌ها</span><strong>{formatNumber(stats.orderCount)}</strong></div>
      <div className="admin-summary-item"><span>سفارش‌های تکمیل‌شده</span><strong>{formatNumber(stats.completedCount)}</strong></div>
      <div className="admin-summary-item"><span>مجموع خرید تکمیل‌شده · تومان</span><strong>{formatPrice(stats.totalSpentToman)}</strong></div>
      <div className="admin-summary-item"><span>میانگین هر خرید · تومان</span><strong>{formatPrice(stats.averageOrderToman)}</strong></div>
    </div>
    <div className={styles.overview}>
      <AdminPanel title="اطلاعات مشتری" action={<AdminBadge status={customer.status}/> }>
        <div className={styles.identity}><span className="admin-user-avatar" aria-hidden="true">{customer.name.charAt(0)}</span><div><h2>{customer.name}</h2><a href={`tel:${customer.phone}`} dir="ltr">{customer.phone}</a></div>{customer.localTest && <span className="admin-badge">حساب آزمایشی</span>}</div>
        <dl className={styles.details}>
          <div><dt>ایمیل</dt><dd dir="auto">{customer.email || 'ثبت نشده'}</dd></div><div><dt>شهر</dt><dd>{customer.city || 'ثبت نشده'}</dd></div>
          <div><dt>تاریخ عضویت</dt><dd>{date(customer.joinedAt)}</dd></div><div><dt>آخرین ورود موفق</dt><dd>{date(customer.lastLoginAt)}</dd></div>
          <div><dt>اولین سفارش</dt><dd>{date(stats.firstOrderAt)}</dd></div><div><dt>آخرین سفارش</dt><dd>{date(stats.lastOrderAt)}</dd></div>
        </dl>
        {customer.importedAt && !customer.joinedAt && <p className="admin-small admin-muted">تاریخ عضویت اصلی این حساب از سایت قبلی در دسترس نیست.</p>}
        {!customer.lastLoginAt && <p className="admin-small admin-muted">هنوز ورود موفقی از زمان فعال شدن ثبت سابقه، برای این حساب ثبت نشده.</p>}
        <div className={styles.accountAction}><button className="admin-button" onClick={()=>{setSaveError('');setConfirming(true);}}>{customer.status==='active' ? 'غیرفعال کردن حساب' : 'فعال کردن حساب'}</button></div>
      </AdminPanel>
      <AdminPanel title="رویدادهای مهم" action={<AdminIcon name="calendar"/>}>
        {milestones.length ? <ol className={styles.timeline}>{milestones.map(item=><li key={item.label}><strong>{item.label}</strong><time dateTime={item.at!}>{date(item.at)}</time></li>)}</ol> : <AdminEmpty title="رویدادی ثبت نشده" description="عضویت، ورود و سفارش‌های مشتری اینجا نمایش داده می‌شن."/>}
        <div className={styles.orderCounts}><span>در حال بررسی <b>{formatNumber(stats.pendingCount)}</b></span><span>لغو شده <b>{formatNumber(stats.cancelledCount)}</b></span></div>
      </AdminPanel>
    </div>
    <section id="customer-orders" className={styles.section} aria-label="سفارش‌های مشتری">
      <AdminPanel title="سفارش‌های مشتری" action={<span className="admin-small admin-muted">{formatNumber(stats.orderCount)} سفارش</span>}>
        <div className="admin-toolbar"><label className="admin-filter-label">وضعیت سفارش<select className="admin-field" value={status} disabled={loading} onChange={event=>{setLoading(true);setStatus(event.target.value as typeof status);setPage(1);}}><option value="all">همه وضعیت‌ها</option>{Object.entries(orderStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><span className="admin-small admin-muted">سفارش‌های این حساب، حتی با شماره گیرنده متفاوت</span></div>
        {loading ? <p role="status" className={styles.loading}>در حال دریافت سفارش‌ها…</p> : error ? <p className="admin-muted">دریافت سفارش‌ها انجام نشد. دوباره تلاش کن.</p> : orders.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">سفارش / تاریخ</th><th scope="col">گیرنده</th><th scope="col">تعداد کالا</th><th scope="col">مبلغ · تومان</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>{orders.items.map(order=><tr key={order.id}>
          <td><strong dir="ltr">#{order.number}</strong><small className="admin-block admin-muted">{date(order.createdAt)}</small></td>
          <td>{order.recipientName}<small dir="ltr" className="admin-block admin-muted">{order.recipientPhone}</small></td><td>{formatNumber(order.itemCount)}</td><td>{formatPrice(order.totalToman)}</td>
          <td><AdminBadge status={order.status}/><small className="admin-block admin-muted">{paymentLabels[order.paymentStatus]}</small></td>
          <td><div className="admin-row-actions"><Link className="admin-table-action" href={`/admin/orders/${order.number}`}>مشاهده<AdminIcon name="arrow-left" size={16}/></Link><Link className="admin-icon-button" href={`/admin/orders/${order.number}/invoice`} prefetch={false} aria-label={`چاپ فاکتور سفارش ${order.number}`}><AdminIcon name="printer" size={18}/></Link></div></td>
        </tr>)}</tbody></table></div> : <AdminEmpty title={status==='all' ? 'هنوز سفارشی ثبت نشده' : 'سفارشی با این وضعیت وجود نداره'} description="سفارش‌های ثبت‌شده با این حساب، اینجا نمایش داده می‌شن."/>}
        <AdminPagination page={orders.page} pages={Math.max(1,Math.ceil(orders.total/orders.pageSize))} total={orders.total} onChange={next=>{setLoading(true);setPage(next);}}/>
      </AdminPanel>
    </section>
    <section id="customer-products" className={styles.section} aria-label="محصولات پرخرید">
      <AdminPanel title="محصولات پرخرید مشتری" action={<AdminIcon name="trend"/>}>
        <p className="admin-small admin-muted">تا ۶ محصول برتر بر اساس تعداد خرید در سفارش‌های تکمیل‌شده؛ سفارش‌های لغوشده و سطل زباله محاسبه نمی‌شن.</p>
        {topProducts.length ? <ol className={styles.products}>{topProducts.map((product,index)=><li key={product.productId}>
          <span className={styles.rank}>{formatNumber(index+1)}</span><div className={styles.productImage}>{product.image ? <Image src={product.image} alt={product.name} width={64} height={64} unoptimized/> : <AdminIcon name="products" size={28}/>}</div>
          <div className={styles.productBody}><strong>{product.name}</strong><p>{formatNumber(product.quantity)} عدد در {formatNumber(product.orderCount)} سفارش · {formatPrice(product.totalToman)} تومان</p><div className={styles.bar} aria-hidden="true"><span style={{width:`${product.quantity/topProducts[0].quantity*100}%`}}/></div></div>
        </li>)}</ol> : <AdminEmpty title="هنوز خرید تکمیل‌شده‌ای نداره" description="با تکمیل سفارش‌ها، محصولاتی که بیشتر خریده اینجا مشخص می‌شن."/>}
      </AdminPanel>
    </section>
    <AdminPanel title="نشانی‌های ذخیره‌شده" action={<span className="admin-small admin-muted">{formatNumber(addresses.length)} نشانی</span>}>
      {addresses.length ? <div className={styles.addresses}>{addresses.map(address=><article key={address.id}><h3>{address.label || 'نشانی'}</h3><p>{address.province}، {address.city}، {address.address}</p><p>{address.name} · <bdi>{address.phone}</bdi></p><small>کد پستی: <bdi>{address.postalCode}</bdi></small></article>)}</div> : <p className="admin-muted">مشتری هنوز نشانی‌ای در حسابش ذخیره نکرده.</p>}
    </AdminPanel>
    {confirming && <AdminModal title="تغییر وضعیت حساب" onClose={()=>{if(!saving)setConfirming(false);}}><p>حساب «{customer.name}» {customer.status==='active' ? 'غیرفعال' : 'فعال'} بشه؟</p>{saveError && <p role="alert" className="admin-form-error">{saveError}</p>}<div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={saving} onClick={()=>void changeStatus()}>{saving ? 'در حال ذخیره…' : 'تأیید تغییر'}</button><button className="admin-button" disabled={saving} onClick={()=>setConfirming(false)}>انصراف</button></div></AdminModal>}
  </div>;
}
