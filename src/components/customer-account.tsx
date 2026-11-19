'use client';
import {setCartOwner} from '@/lib/store';
import Link from 'next/link';
import {useCallback,useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {api,ApiError} from '@/lib/api';
import {formatNumber,formatPrice} from '@/lib/format';
import type {PaymentConfirmation,PaymentReceipt,ReceiptStatus} from '@/lib/payment';
import {receiptLabels} from '@/lib/payment';
import {Icon,type IconName} from './icons';
import {ReceiptPanel} from './payment-confirmation';
import {AddressBook} from './customer-address-book';
import styles from './customer-account.module.css';

type Tab='profile'|'addresses'|'orders'|'receipts';
type Account={customer:{name:string;phone:string;joinedAt?:string};counts:{orders:number;addresses:number;receipts:number}};
type Entry={number:string;createdAt:string;status:string;totalToman:number;firstItem:string;itemCount:number;receiptStatus:ReceiptStatus|null};
type History=PaymentReceipt&{orderNumber:string};
const nav:{tab:Tab;title:string;icon:IconName}[]=[{tab:'profile',title:'حساب کاربری',icon:'user'},{tab:'addresses',title:'آدرس‌ها',icon:'pin'},{tab:'orders',title:'سفارش‌ها',icon:'bag'},{tab:'receipts',title:'فیش‌های واریزی',icon:'clipboard'}];
const route=(tab:Tab)=>'/myaccount'+(tab==='profile'?'':'/'+tab);
const orderTitle=(s:string)=>s==='cancelled'?'لغو شده':s==='delivered'?'تکمیل شده':'در حال بررسی';
const date=(s:string)=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium'}).format(new Date(s));
function usePrivateData<T>(path:string){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
  const router=useRouter(),refresh=useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{const controller=new AbortController();let seq=0;
    async function fetchData(){const request=++seq;try{const value=await api<T>(path,{signal:controller.signal});if(!controller.signal.aborted&&request===seq){setData(value);setError('');}}
      catch(e){if(controller.signal.aborted||request!==seq)return;
        if(e instanceof ApiError&&e.status===401){setData(null);router.replace('/login');}
        else setError(e instanceof Error?e.message:'دریافت اطلاعات انجام نشد.');}}
    void fetchData();const focus=()=>{if(!document.hidden)void fetchData();};window.addEventListener('focus',focus);
    const timer=path.startsWith('/customer/orders/')?window.setInterval(focus,30000):undefined;
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[path,router,version]);return {data,error,refresh,setData};
}
function Wait({error,retry}:{error:string;retry:()=>void}){return <div className={styles.empty} role={error?'alert':'status'}><p>{error||'در حال دریافت اطلاعات…'}</p>{error&&<button className={styles.linkButton} onClick={retry}>تلاش دوباره</button>}</div>;}
function Badge({label,state}:{label:string;state:string}){return <span className={styles.badge} data-state={state}>{label}</span>;}
function Empty({icon,title,children}:{icon:IconName;title:string;children:ReactNode}){return <div className={styles.empty}><Icon name={icon} size={29}/><h3>{title}</h3><p>{children}</p></div>;}
function Profile({account,refresh}:{account:Account;refresh:()=>void}){
  const [editing,setEditing]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')??'').trim();
    if(name.length<2){setMessage('نامت را با حداقل دو حرف بنویس.');return;}setBusy(true);try{await api('/customer/profile',{method:'PUT',body:JSON.stringify({name})});setMessage('نامت ذخیره شد.');setEditing(false);refresh();}catch(e){setMessage(e instanceof Error?e.message:'ذخیره انجام نشد.');}finally{setBusy(false);}}
  return <><div className={styles.welcome}><div><span className={styles.eyebrow}>فضای شخصی تو</span><h2>{account.customer.name!==account.customer.phone?'سلام، '+account.customer.name:'به پوستیکال خوش اومدی'}</h2><p>از اینجا می‌تونی خریدها، فیش‌های پرداخت و نشانی‌هات رو پیگیری کنی.</p></div><span className={styles.seal} aria-hidden="true"><Icon name="lips" size={54}/></span></div>
    <div className={styles.stats}>{nav.slice(1).map(n=><Link href={route(n.tab)} key={n.tab}><Icon name={n.icon}/><strong>{formatNumber(account.counts[n.tab as keyof Account['counts']])}</strong><span>{n.title}</span></Link>)}</div>
    <div className={styles.heading}><h3>مشخصات من</h3><button className={styles.linkButton} onClick={()=>{setEditing(!editing);setMessage('');}}>{editing?'انصراف':'ویرایش نام'}</button></div>
    {editing?<form onSubmit={save} noValidate className={styles.form}><label>نام و نام خانوادگی<input name="name" autoFocus maxLength={100} defaultValue={account.customer.name===account.customer.phone?'':account.customer.name}/></label><button disabled={busy} className={styles.primary}>ذخیره نام</button></form>:<dl className={styles.facts}><div><dt>نام و نام خانوادگی</dt><dd>{account.customer.name===account.customer.phone?'ثبت نشده':account.customer.name}</dd></div><div><dt>شماره موبایل</dt><dd><bdi>{account.customer.phone}</bdi></dd></div>{account.customer.joinedAt&&<div><dt>تاریخ عضویت</dt><dd>{date(account.customer.joinedAt)}</dd></div>}</dl>}
    {message&&<p role="status">{message}</p>}</>;
}
function Records({kind,page,setPage}:{kind:'orders'|'receipts';page:number;setPage:(n:number)=>void}){
  const {data,error,refresh}=usePrivateData<{items:(Entry|History)[];hasNext:boolean}>('/customer/'+kind+'?page='+page);
  if(!data||error)return <Wait error={error} retry={refresh}/>;
  return <>{!data.items.length?<Empty icon={kind==='orders'?'bag':'clipboard'} title={kind==='orders'?'هنوز سفارشی ثبت نکردی':'هنوز فیشی ارسال نکردی'}>{kind==='orders'?<Link href="/shop">رفتن به فروشگاه</Link>:<Link href="/myaccount/orders">دیدن سفارش‌های من</Link>}</Empty>:<ul className={styles.list}>{data.items.map(item=>{
    const order='number' in item,number=order?item.number:item.orderNumber;return <li key={order?number:item.id}><Link className={styles.row} href={'/myaccount/orders/'+number}><span className={styles.icon}><Icon name={order?'bag':'clipboard'}/></span><div className={styles.rowText}><strong>{order?'سفارش':'فیش سفارش'} <bdi>#{number}</bdi></strong><small>{date(order?item.createdAt:item.uploadedAt)}{order?' · '+(item.firstItem??'')+(item.itemCount>1?' و '+formatNumber(item.itemCount-1)+' محصول دیگر':''):''}</small>{!order&&item.status==='rejected'&&item.rejectionReason&&<small>دلیل رد: {item.rejectionReason}</small>}</div><div className={styles.rowEnd}><strong>{formatPrice(order?item.totalToman:item.amountToman)} تومان</strong><Badge state={item.status} label={order?orderTitle(item.status):receiptLabels[item.status as ReceiptStatus]}/></div><Icon name="arrow-left" size={17}/></Link></li>;
  })}</ul>}
  {(page>1||data.hasNext)&&<div className={styles.actions}><button disabled={page===1} onClick={()=>setPage(page-1)}>صفحه قبل</button><span>صفحه {formatNumber(page)}</span><button disabled={!data.hasNext} onClick={()=>setPage(page+1)}>صفحه بعد</button></div>}</>;
}
function OrderDetail({number,onUpload}:{number:string;onUpload:()=>void}){
  const {data,error,refresh,setData}=usePrivateData<PaymentConfirmation>('/customer/orders/'+number);
  if(!data||error)return <Wait error={error} retry={refresh}/>;
  const {order,recipient}=data;
  return <><div className={styles.heading}><small>{date(order.createdAt)}</small><Badge label={orderTitle(order.status)} state={order.status}/></div>
    <h3>اقلام سفارش</h3><ul className={styles.lines}>{order.items.map(item=><li key={item.variantId}><div><strong>{item.name}</strong><small>{item.variantLabel} · {formatNumber(item.quantity)} عدد × {formatPrice(item.unitPriceToman)} تومان</small></div><b>{formatPrice(item.quantity*item.unitPriceToman)} تومان</b></li>)}</ul>
    <dl className={styles.facts}><div><dt>روش ارسال</dt><dd>{order.shipping.name}</dd></div><div><dt>هزینه ارسال</dt><dd>{order.shipping.type==='collect'?'پس‌کرایه':formatPrice(order.shippingToman)+' تومان'}</dd></div>{order.discountToman>0&&<div><dt>تخفیف</dt><dd>{formatPrice(order.discountToman)} تومان</dd></div>}<div><dt>مبلغ کل سفارش</dt><dd>{formatPrice(order.totalToman)} تومان</dd></div></dl>
    {recipient&&<div className={styles.delivery}><Icon name="pin"/><div><strong>گیرنده: {recipient.name}</strong><p>{recipient.province}، {recipient.city}، {recipient.address}</p><small>کد پستی: <bdi>{recipient.postalCode}</bdi> · موبایل: <bdi>{recipient.phone}</bdi></small>{recipient.note&&<p>یادداشت: {recipient.note}</p>}</div></div>}
    <ReceiptPanel data={data} refresh={refresh} onUploaded={row=>{setData({...data,receipt:row});onUpload();}}/></>;
}
export function CustomerAccount({tab,number}:{tab:Tab;number?:string}){
  const {data,error,refresh}=usePrivateData<Account>('/customer/me');const router=useRouter(),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function logout(){setBusy(true);try{await api('/customer/logout',{method:'POST'});setCartOwner(null);router.replace('/');router.refresh();}catch{setNotice('خروج انجام نشد. دوباره تلاش کن.');setBusy(false);}}
  return <main id="main-content" className={'container '+styles.page}><div className={styles.crumb}><Link href="/">خانه</Link><span>/</span><Link href="/myaccount">حساب من</Link>{tab!=='profile'&&<><span>/</span>{nav.find(n=>n.tab===tab)?.title}</>}</div>
    {!data||error?<section className={styles.panel}><Wait error={error} retry={refresh}/></section>:<div className={styles.layout}><aside className={styles.side}><div className={styles.identity}><span className={styles.avatar}><Icon name="user" size={26}/></span><div><strong>{data.customer.name!==data.customer.phone?data.customer.name:'حساب من'}</strong><small><bdi>{data.customer.phone}</bdi></small></div></div>
    <nav aria-label="منوی حساب کاربری" className={styles.nav}>{nav.map(n=><Link href={route(n.tab)} key={n.tab} aria-current={tab===n.tab?'page':undefined}><Icon name={n.icon} size={19}/>{n.title}</Link>)}</nav><button className={styles.logout} disabled={busy} onClick={logout}><Icon name="logout" size={18}/>خروج از حساب</button>{notice&&<small role="alert">{notice}</small>}</aside>
    <section className={styles.panel}><div className={styles.heading}><h1>{number?<>سفارش <bdi>#{number}</bdi></>:nav.find(n=>n.tab===tab)?.title}</h1>{number&&<Link className={styles.linkButton} href="/myaccount/orders">همه سفارش‌ها <Icon name="arrow-left" size={16}/></Link>}</div>
      {tab==='profile'?<Profile account={data} refresh={refresh}/>:tab==='addresses'?<AddressBook phone={data.customer.phone} onChange={refresh}/>:number?<OrderDetail number={number} onUpload={refresh}/>:<Records key={page} kind={tab} page={page} setPage={setPage}/>}
    </section></div>}</main>;
}
