'use client';
import {useSiteSettings} from '../site-settings-provider';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {AdminNavigationLink as Link} from './admin-navigation-link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { normalizeSearch } from '@/lib/search';
import { formatNumber } from '@/lib/format';
import { AdminIcon, type AdminIconName } from './admin-icon';
import { AdminModal } from './admin-ui';
import { useAdmin } from './admin-provider';

const sections: { href: string; label: string; icon: AdminIconName; description: string }[] = [
  { href:'/admin',label:'داشبورد',icon:'dashboard',description:'مرور فروش و فعالیت‌های فروشگاه' },
  { href:'/admin/products',label:'محصولات',icon:'products',description:'محصولات، قیمت‌ها و موجودی' },
  { href:'/admin/categories',label:'دسته‌بندی‌ها',icon:'grid',description:'دسته‌بندی محصولات و زیرمجموعه‌ها' },
  { href:'/admin/brands',label:'برندها',icon:'sparkles',description:'برندهای فروشگاه و نشان‌های تجاری' },
  { href:'/admin/orders',label:'سفارشات',icon:'orders',description:'پیگیری و مرور سفارش‌ها' },
  { href:'/admin/analyses',label:'درخواست‌های آنالیز',icon:'clipboard',description:'پاسخ‌ها و عکس‌های خصوصی مراجعان' },
  { href:'/admin/support',label:'پشتیبانی',icon:'headset',description:'گفت‌وگو و پاسخ به مشتریان فروشگاه' },
  { href:'/admin/users',label:'کاربران',icon:'users',description:'مشتریان و حساب‌ها' },
  { href:'/admin/trash',label:'سطل زباله',icon:'trash',description:'بازیابی یا حذف دائمی موارد حذف‌شده' },
  { href:'/admin/admins',label:'ادمین‌ها',icon:'users',description:'حساب‌های مدیریت و سازنده سایت' },
  { href:'/admin/settings',label:'تنظیمات',icon:'settings',description:'مشخصات فروشگاه و ترجیحات پنل' },
];
const shippingSection={href:'/admin/orders/shipping',label:'حمل و نقل',icon:'send' as AdminIconName,description:'روش‌های ارسال و هزینه حمل'};
const receiptsSection={href:'/admin/orders/receipts',label:'فیش های واریزی',icon:'clipboard' as AdminIconName,description:'مشاهده و بررسی فیش پرداخت سفارش‌ها'};
const orderSections=[shippingSection,receiptsSection];
const commands = [...sections, ...orderSections, { href:'/admin/products/new',label:'افزودن محصول',icon:'plus' as AdminIconName,description:'ساخت محصول با عکس معمولی یا انیمیشن' }];
function isSectionActive(pathname: string, href: string) { return pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)); }
function AdminAccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { currentAdmin, logout, notify } = useAdmin();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try { await logout(); }
    catch { notify('خروج انجام نشد؛ دوباره امتحان کن.'); }
    finally { setBusy(false); }
  }

  return <div className="admin-account" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="admin-manager" aria-label="حساب مدیر" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className="admin-avatar">پ</span><span><strong>{currentAdmin?.role==='owner'?'سازنده سایت':currentAdmin?.name}</strong><small>{currentAdmin?.role==='owner'?'مالک فروشگاه':'ادمین فروشگاه'}</small></span><AdminIcon name="chevron-down" size={16}/>
    </button>
    <div id={id} className="admin-account-actions" role="group" aria-label="گزینه‌های حساب مدیر" hidden={!open}>
      <Link href="/admin/admins" onClick={() => { setOpen(false); onNavigate?.(); }}><AdminIcon name="settings" size={18}/><span>تنظیمات حساب</span></Link>
      <button type="button" className="admin-account-logout" onClick={signOut} disabled={busy}><AdminIcon name="logout" size={18}/><span>{busy ? 'در حال خروج…' : 'خروج از حساب'}</span></button>
    </div>
  </div>;
}
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const {settings:{branding}}=useSiteSettings();
  const pathname=usePathname();
  const { orders }=useAdmin();
  const [ordersOpen,setOrdersOpen]=useState(pathname.startsWith('/admin/orders'));
  const submenuId=useId();
  return <><Link className="admin-brand" href="/admin" onClick={onNavigate}><Image src={branding.logo} alt={branding.logoAlt} width={2039} height={367} sizes="190px"/><span>پنل مدیریت فروشگاه</span></Link><nav className="admin-nav" aria-label="منوی مدیریت">{sections.map(section=>section.href==='/admin/orders'?<div className="admin-order-nav" key={section.href}><div className="admin-order-nav-row"><Link href={section.href} onClick={onNavigate} className={pathname.startsWith('/admin/orders')?'is-active':''} aria-current={pathname==='/admin/orders'?'page':undefined}><AdminIcon name="orders" size={23}/><span>سفارشات</span><small>{formatNumber(orders.filter(order=>order.status==='pending').length)}</small></Link><button type="button" aria-label="زیرمنوی سفارشات" aria-expanded={ordersOpen} aria-controls={submenuId} onClick={()=>setOrdersOpen(v=>!v)}><AdminIcon name="chevron-down" size={18}/></button></div><div className="admin-order-subnav" id={submenuId} hidden={!ordersOpen}>{orderSections.map(sub=><Link key={sub.href} href={sub.href} onClick={onNavigate} className={pathname===sub.href?'is-active':''} aria-current={pathname===sub.href?'page':undefined}><AdminIcon name={sub.icon} size={18}/><span>{sub.label}</span></Link>)}</div></div>:<Link key={section.href} href={section.href} onClick={onNavigate} className={isSectionActive(pathname,section.href)?'is-active':''} aria-current={isSectionActive(pathname,section.href)?'page':undefined}><AdminIcon name={section.icon} size={23}/><span>{section.label}</span></Link>)}</nav><div className="admin-sidebar-bottom"><Link className="admin-store-link" href="/"><AdminIcon name="external" size={18}/><span>بازگشت به فروشگاه</span></Link><AdminAccountMenu onNavigate={onNavigate}/></div></>;
}
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname=usePathname();
  const current=orderSections.find(item=>item.href===pathname)??sections.find(item=>isSectionActive(pathname,item.href)) ?? sections[0];
  const nestedProductLabel=pathname==='/admin/products/new'?'افزودن محصول':pathname.startsWith('/admin/products/')&&(pathname.endsWith('/edit')||pathname.endsWith('/view'))?(pathname.endsWith('/view')?'نمایش محصول':'ویرایش محصول'):'';
  const [menuOpen,setMenuOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [query,setQuery]=useState('');
  const { products,orders,settings }=useAdmin();
  const lowStock=settings.lowStockAlerts ? products.filter(product=>product.stock!==null&&product.stock<=settings.stockThreshold) : [];
  const pending=settings.orderNotifications ? orders.filter(order=>order.status==='pending').length : 0;
  const matchingCommands=commands.filter(command=>normalizeSearch(`${command.label} ${command.description}`).includes(normalizeSearch(query)));
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.isComposing)return;const dialog=document.querySelector('dialog[open]');if(dialog&&!dialog.querySelector('.admin-command-results'))return;if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();setMenuOpen(false);setNotificationsOpen(false);setSearchOpen(value=>!value);}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[]);
  return <div className="admin-root" data-compact={settings.compactTables} dir="rtl"><aside className="admin-glass admin-sidebar"><SidebarContent/></aside><div className="admin-workspace"><header className="admin-topbar"><div className="admin-breadcrumb"><button className="admin-icon-button admin-mobile-menu" aria-label="باز کردن منوی مدیریت" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={()=>{setSearchOpen(false);setNotificationsOpen(false);setMenuOpen(true);}}><AdminIcon name="menu"/></button><span>پنل مدیریت</span><span>/</span>{nestedProductLabel?<><Link href="/admin/products">{current.label}</Link><span>/</span><strong>{nestedProductLabel}</strong></>:<strong>{current.label}</strong>}</div><div className="admin-topbar-actions"><button className="admin-top-search" onClick={()=>{setMenuOpen(false);setNotificationsOpen(false);setSearchOpen(true);}} aria-label="جستجو در پنل" aria-haspopup="dialog"><span>جستجو در پنل...</span><AdminIcon name="search" size={18}/></button><button className="admin-icon-button admin-notifications" aria-label="یادآورها" aria-haspopup="dialog" onClick={()=>{setMenuOpen(false);setSearchOpen(false);setNotificationsOpen(true);}}><AdminIcon name="bell"/>{pending||lowStock.length?<i/>:null}</button><Link href="/admin/admins" className="admin-avatar" aria-label="تنظیمات مدیر">پ</Link></div></header><main id="main-content" className="admin-main">{children}</main><p className="admin-session-note">پوستیکال · مدیریت فروشگاه</p></div>
  {menuOpen ? <AdminModal title="منوی مدیریت" onClose={()=>setMenuOpen(false)}><div className="admin-drawer-navigation"><SidebarContent onNavigate={()=>setMenuOpen(false)}/></div></AdminModal>:null}
  {searchOpen ? <AdminModal title="جستجو در پنل" onClose={()=>setSearchOpen(false)}><label className="admin-search-field"><AdminIcon name="search" size={19}/><input autoFocus data-admin-autofocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="نام بخش رو بنویس..." aria-label="نام بخش"/></label><div className="admin-command-results">{matchingCommands.map(section=><Link key={section.href} href={section.href} onClick={()=>{setSearchOpen(false);setQuery('');}}><AdminIcon name={section.icon}/><div><strong>{section.label}</strong><small>{section.description}</small></div><AdminIcon name="arrow-left" size={17}/></Link>)}{!matchingCommands.length?<p className="admin-muted">بخشی پیدا نشد. نامی مثل «محصولات» رو امتحان کن.</p>:null}</div></AdminModal>:null}
  {notificationsOpen ? <AdminModal title="یادآورهای فروشگاه" onClose={()=>setNotificationsOpen(false)}><div className="admin-reminders"><Link href="/admin/orders" onClick={()=>setNotificationsOpen(false)}><AdminIcon name="orders"/><div><strong>{formatNumber(pending)} سفارش در انتظار بررسی</strong><p>سفارش‌ها رو مرور کن.</p></div><AdminIcon name="arrow-left"/></Link><Link href="/admin/products" onClick={()=>setNotificationsOpen(false)}><AdminIcon name="products"/><div><strong>{formatNumber(lowStock.length)} محصول با موجودی کم</strong><p>موجودی کمتر یا مساوی {formatNumber(settings.stockThreshold)} عدد</p></div><AdminIcon name="arrow-left"/></Link></div></AdminModal>:null}
  </div>;
}



