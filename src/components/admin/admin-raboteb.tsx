'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { AdminPageHeading, AdminPanel } from './admin-ui';
import { useAdmin } from './admin-provider';

type Job = {id:string;kind:'csv'|'sync';discover_products:boolean;status:string;total:number;processed:number;imported:number;errors:{sourceId?:number;name?:string;message:string;code?:string;attempts?:number}[];created_at:string;finished_at:string|null;updated_at:string;progress:{stage?:string;message?:string;page?:number;received?:number;expected?:number;retry?:{attempt:number;maxAttempts:number;message:string;code:string;nextAttemptAt:string}|null}};
type Status = {configured:boolean;enabled:boolean;credentialStorageReady:boolean;configurationError:string;currency:'IRT'|'IRR'|null;verifiedAt:string|null;intervalMinutes:number;discoveryIntervalHours:number;nextDiscoveryCheck:string|null;linkedProducts:number;lastProductCheck:string|null;lastSuccessfulSync:string|null;nextAutomaticCheck:string|null;connectionMode:'proxy'|'direct';jobs:Job[]};
const labels:Record<string,string>={queued:'در صف',running:'در حال انجام',complete:'کامل شد',partial:'نیاز به بررسی',failed:'انجام نشد'};
const date=(value:string|null)=>value?new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'هنوز بررسی نشده';

export function AdminRaboteb(){
  const [status,setStatus]=useState<Status|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [connectionError,setConnectionError]=useState('');
  const [notice,setNotice]=useState('');
  const {load}=useAdmin();
  const lastFinished=useRef('');
  const refresh=useCallback(async()=>{
    try{
      const next=await api<Status>('/admin/raboteb');setStatus(next);setConnectionError('');
      const finished=next.jobs.find(job=>job.finished_at)?.id??'';
      if(finished&&finished!==lastFinished.current)void load();
      lastFinished.current=finished;
    }catch(e){setConnectionError(e instanceof Error?e.message:'دریافت وضعیت انجام نشد.');}
  },[load]);
  useEffect(()=>{const start=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),4000);return()=>{clearTimeout(start);clearInterval(timer);};},[refresh]);
  const active=status?.jobs.find(job=>['queued','running'].includes(job.status));
  async function connect(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||active)return;
    const form=event.currentTarget,values=new FormData(form);
    const consumerKey=String(values.get('consumerKey')??'').trim(),consumerSecret=String(values.get('consumerSecret')??'').trim();
    setError('');setNotice('');
    if(!/^ck_[a-f0-9]{40}$/.test(consumerKey)||!/^cs_[a-f0-9]{40}$/.test(consumerSecret)){setError('کلید مصرف‌کننده و رمز مصرف‌کننده را کامل و بدون فاصله وارد کن.');return;}
    setBusy(true);
    try{await api('/admin/raboteb/connection',{method:'PUT',body:JSON.stringify({consumerKey,consumerSecret})});form.reset();setNotice('اتصال آزمایش و ذخیره شد. همگام‌سازی روی سرور انجام می‌شود؛ نیازی به باز ماندن مرورگر نیست.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'ثبت اتصال انجام نشد.');}finally{setBusy(false);}
  }
  async function toggleSync(){
    if(!status||busy)return;setBusy(true);setError('');setNotice('');
    try{await api('/admin/raboteb/enabled',{method:'PUT',body:JSON.stringify({enabled:!status.enabled})});setNotice(status.enabled?'بررسی‌های بعدی متوقف شدند؛ عملیات در حال اجرا تا پایان ادامه دارد.':'بررسی خودکار دوباره فعال شد.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'تغییر وضعیت انجام نشد.');}finally{setBusy(false);}
  }
  async function run(kind:'import'|'sync',event?:FormEvent){
    event?.preventDefault();if(busy||active||(kind==='import'&&!file))return;
    setBusy(true);setError('');
    try{const form=new FormData();if(file)form.set('file',file);await api(`/admin/raboteb/${kind}`,{method:'POST',...(kind==='import'?{body:form}:{})});await refresh();}
    catch(e){setError(e instanceof Error?e.message:'عملیات انجام نشد.');}finally{setBusy(false);}
  }
  return <>
    <AdminPageHeading title="همگام‌سازی رابوطب" description="محصولات موجود را وارد کن؛ قیمت و موجودی را از مبدأ به‌روز نگه دار." action={<Link href="/admin/products" className="admin-button" onClick={()=>void load()}>مشاهده محصولات</Link>}/>
    {error||connectionError||status?.configurationError?<p role="alert" className="admin-product-errors">{error||connectionError||status?.configurationError}</p>:null}
    {notice?<p role="status" className="admin-sync-notice">{notice}</p>:null}
    <div className="admin-stat-strip">
      <div><span>محصولات متصل</span><strong>{formatNumber(status?.linkedProducts??0)}</strong></div>
      <div><span>اتصال خودکار</span><strong className="admin-sync-status">{status?(status.configured?(status.enabled?'فعال':'متوقف شده'):'نیاز به اتصال'):'در حال بررسی…'}</strong></div>
      <div><span>آخرین همگام‌سازی کامل و موفق</span><strong className="admin-sync-status">{date(status?.lastSuccessfulSync??null)}</strong></div>
    </div>
    <AdminPanel title="اتصال امن و دائمی">
      <p>این اتصال روی سرور اجرا می‌شود و با خروج از حساب رابوطب یا بستن مرورگر قطع نمی‌شود. فقط یک بار کلید دسترسی را ثبت کن.</p>
      <details className="admin-sync-connection" open={status&&!status.configured?true:undefined}>
        <summary>{status?.configured?'جایگزینی کلید اتصال':'راهنمای اتصال و ثبت کلید'}</summary>
        <ol>
          <li><a href="https://raboteb.com/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys" target="_blank" rel="noreferrer">تنظیمات REST API رابوطب</a> را باز کن و «افزودن کلید» را بزن.</li>
          <li>توضیح را «Poostikal catalog sync» و مجوز را «خواندن / Read» انتخاب کن؛ سپس کلید را بساز.</li>
          <li>دو مقدار Consumer Key و Consumer Secret را در کادرهای زیر وارد کن.</li>
        </ol>
        <form className="admin-form-grid" noValidate onSubmit={event=>void connect(event)}>
          <label className="admin-form-field"><span>کلید مصرف‌کننده · Consumer Key</span><input name="consumerKey" type="password" dir="ltr" autoComplete="off" spellCheck={false} placeholder="ck_…" maxLength={100} disabled={busy||!!active} required/></label>
          <label className="admin-form-field"><span>رمز مصرف‌کننده · Consumer Secret</span><input name="consumerSecret" type="password" dir="ltr" autoComplete="new-password" spellCheck={false} placeholder="cs_…" maxLength={100} disabled={busy||!!active} required/></label>
          <div className="admin-form-field-wide admin-sync-connect-actions"><button className="admin-button admin-button-primary" disabled={busy||!!active||!status?.credentialStorageReady}>{busy?'در حال بررسی…':'آزمایش و اتصال'}</button><span className="admin-small admin-muted">کلیدها رمزگذاری می‌شوند و دوباره در مرورگر نمایش داده نمی‌شوند.</span></div>
        </form>
        {status&&!status.credentialStorageReady?<p role="alert" className="admin-product-errors">کلید رمزگذاری سرور هنوز تنظیم نشده؛ از مدیر سرور بخواه تنظیمات اتصال را کامل کند.</p>:null}
      </details>
      {status?.verifiedAt?<p className="admin-small admin-muted">آخرین آزمایش موفق: {date(status.verifiedAt)} · واحد مبدأ: {status.currency==='IRR'?'ریال؛ تبدیل خودکار به تومان':'تومان'}</p>:null}
      {status?.connectionMode==='proxy'?<p className="admin-small admin-muted">مسیر اتصال: پراکسی سرور. برنامهٔ پراکسی باید روی دستگاهی که سرویس پوستیکال را اجرا می‌کند روشن و در دسترس باشد.</p>:null}
    </AdminPanel>
    <div className="admin-sync-grid">
      <AdminPanel title="ورود اولیه محصولات">
        <p>فایل خروجی محصولات ووکامرس را انتخاب کن. فقط محصولات منتشرشده و موجود وارد می‌شوند؛ تصاویر به WebP تبدیل و در پوستیکال ذخیره می‌شوند.</p>
        <form onSubmit={e=>void run('import',e)} className="admin-sync-form">
          <label className="admin-form-field"><span>فایل محصولات (CSV)</span><input type="file" accept=".csv,text/csv" disabled={busy||!!active} onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
          <button className="admin-button admin-button-primary" disabled={!file||busy||!!active}>ورود محصولات موجود</button>
        </form>
        <p className="admin-small admin-muted">ورود دوباره، همان محصولات را به‌روز می‌کند و محصول تکراری نمی‌سازد. فایل شامل اطلاعات و تصاویر محصول باشد.</p>
      </AdminPanel>
      <AdminPanel title="ورود محصولات جدید و به‌روزرسانی موجودی">
        <p>{status?.configured?`هر ${formatNumber(status.discoveryIntervalHours)} ساعت، محصولات جدیدِ منتشرشده و موجود در رابوطب با تصاویر و مشخصاتشان به پوستیکال اضافه می‌شوند. قیمت و موجودی محصولات متصل هر ${formatNumber(status.intervalMinutes)} دقیقه بررسی می‌شود.`:'برای ورود خودکار محصولات جدید و به‌روزرسانی قیمت و موجودی، اتصال ووکامرس را فعال کن.'}</p>
        <p className="admin-small admin-muted">محصول ناموجود یا حذف‌شده در مبدأ، در پوستیکال ناموجود می‌شود. برای محصولات بدون شمارش موجودی، فقط «موجود» یا «ناموجود» نمایش داده می‌شود؛ محصول بدون قیمت قابل خرید نیست. توضیحات، تصاویر، صدا و انیمیشن ویرایش‌شدهٔ پوستیکال حفظ می‌شوند.</p>
        <p className="admin-small admin-muted">موجودی قابل فروش از موجودی مبدأ پس از کسر سفارش‌های لغونشدهٔ پوستیکال محاسبه می‌شود. این اتصال یک‌طرفه است و سفارش را به رابوطب ارسال نمی‌کند.</p>
        <div className="admin-sync-connect-actions"><button className="admin-button" disabled={!status?.configured||!status.enabled||busy||!!active} onClick={()=>void run('sync')}>همگام‌سازی همین حالا</button>{status?.configured?<button className="admin-button" disabled={busy} onClick={()=>void toggleSync()}>{status.enabled?'توقف بررسی خودکار':'فعال‌سازی بررسی خودکار'}</button>:null}</div>
        {status?.nextAutomaticCheck?<p className="admin-small admin-muted">بررسی خودکار بعدی: {date(status.nextAutomaticCheck)} · هنگام روشن بودن سرویس</p>:null}
        {status?.nextDiscoveryCheck?<p className="admin-small admin-muted">بررسی بعدی محصولات جدید: {date(status.nextDiscoveryCheck)}</p>:null}
      </AdminPanel>
    </div>
    {active?<AdminPanel title="همگام‌سازی در جریان است">
      <div className="admin-sync-progress" role="status"><span>{active.progress?.message||'آماده‌سازی ارتباط با مبدأ…'}</span><strong>{active.total?`${formatNumber(active.processed)} / ${formatNumber(active.total)}`:active.progress?.expected?`${formatNumber(active.progress.received??0)} / ${formatNumber(active.progress.expected)} بررسی شده`:active.progress?.received?`${formatNumber(active.progress.received)} محصول دریافت شده`:'در حال دریافت'}</strong></div>
      <div className={`admin-sync-meter${active.total?'':' is-indeterminate'}`} role="progressbar" aria-label="پیشرفت همگام‌سازی" aria-valuemin={0} aria-valuemax={active.total||undefined} aria-valuenow={active.total?active.processed:undefined} aria-valuetext={active.progress?.message||'در حال دریافت اطلاعات'}><span style={active.total?{width:`${Math.min(100,active.processed/active.total*100)}%`}:undefined}/></div>
      {active.progress?.retry?<div className="admin-sync-retry" role="status"><strong>تلاش مجدد · {formatNumber(active.progress.retry.attempt)} از {formatNumber(active.progress.retry.maxAttempts)}</strong><p>{active.progress.retry.message}</p><small>شروع تلاش بعدی: {date(active.progress.retry.nextAttemptAt)} · اطلاعات قبلی تا دریافت موفق حفظ می‌شوند.</small></div>:null}
      <p className="admin-small admin-muted">{active.total?`${formatNumber(active.imported)} ثبت موفق · `:''}می‌توانی این صفحه را ببندی؛ عملیات روی سرور ادامه دارد.</p>
    </AdminPanel>:null}
    <AdminPanel title="تاریخچه عملیات">
      {!status?.jobs.length?<p className="admin-muted">هنوز عملیاتی انجام نشده.</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>عملیات</th><th>زمان</th><th>وضعیت</th><th>ثبت موفق</th><th>نیاز به بررسی</th></tr></thead><tbody>{status.jobs.map(job=><tr key={job.id}>
        <td>{job.kind==='csv'?'ورود از فایل':job.discover_products?'بررسی محصولات جدید و موجودی':'به‌روزرسانی موجودی و قیمت'}</td><td>{date(job.created_at)}</td>
        <td><span className={`admin-sync-job-status is-${job.status}`}>{labels[job.status]??job.status}</span>{job.kind==='sync'&&job.status==='failed'&&status.jobs.some(later=>later.kind==='sync'&&later.status==='complete'&&(!job.discover_products||later.discover_products)&&later.finished_at&&job.finished_at&&new Date(later.finished_at)>new Date(job.finished_at))?<small className="admin-sync-recovered">پس از این خطا، همگام‌سازی موفق انجام شده.</small>:null}</td>
        <td>{job.total?`${formatNumber(job.imported)} / ${formatNumber(job.total)}`:job.status==='failed'?'پیش از دریافت محصولات':job.status==='complete'?'محصولی برای ثبت نبود':'در انتظار دریافت'}</td>
        <td>{job.errors.length?<details><summary>{formatNumber(job.errors.length)} مورد</summary><ul className="admin-sync-errors">{job.errors.map((item,i)=><li key={i}>
          <strong>{item.name??'ارتباط با مبدأ'}{item.sourceId?` · ${formatNumber(item.sourceId)}`:''}</strong>
          <p>{item.message==='fetch failed'?'ارتباط با مبدأ هنگام دریافت اطلاعات قطع شد. جزئیات علت در این اجرای قدیمی ثبت نشده.':item.message}</p>
          {item.code?<code dir="ltr">{item.code}</code>:null}{item.attempts?<p className="admin-small">پس از {formatNumber(item.attempts)} تلاش</p>:null}
          {!job.processed?<p className="admin-small admin-muted">در این اجرا قیمت و موجودی محصولات تغییر نکرد.</p>:null}
        </li>)}</ul></details>:'—'}</td>
      </tr>)}</tbody></table></div>}
    </AdminPanel>
  </>;
}
