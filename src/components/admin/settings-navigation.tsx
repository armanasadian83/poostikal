'use client';
import {AdminNavigationLink as Link} from './admin-navigation-link';
import {usePathname,useRouter} from 'next/navigation';
import {createContext,useCallback,useContext,useEffect,useId,useState,type ReactNode} from 'react';
import {AdminIcon,type AdminIconName} from './admin-icon';
import {AdminModal} from './admin-ui';
export const settingsTabs:{id:string;label:string;description:string;icon:AdminIconName}[]=[
  {id:'general',label:'عمومی',description:'مشخصات فروشگاه، رنگ‌ها و ترجیحات پنل',icon:'settings'},
  {id:'branding',label:'هویت و سئو',description:'لوگو، آیکون و معرفی در موتورهای جستجو',icon:'sparkles'},
  {id:'navbar',label:'نوبار',description:'منوها، جستجو و نوار اطلاع‌رسانی',icon:'menu'},
  {id:'footer',label:'فوتر',description:'متن‌ها و پیوندهای پایین سایت',icon:'grid'},
  {id:'home',label:'صفحه اصلی',description:'بنر، برندها و بخش‌های صفحه اصلی',icon:'dashboard'},
  {id:'orbit',label:'ویترین چرخان',description:'تصاویر نمایشی مستقل از محصولات فروشگاه',icon:'refresh'},
  {id:'story',label:'داستان برند',description:'تصویر ثابت و کارت‌های مسیر مراقبت',icon:'leaf'},
  {id:'login',label:'صفحه ورود',description:'متن‌ها و نمای ورود پیامکی',icon:'lock'},
  {id:'shop',label:'فروشگاه و محصول',description:'فهرست محصولات، صوت و پیشنهادها',icon:'products'},
  {id:'cart',label:'سبد خرید',description:'متن‌ها، خلاصه خرید و سبد خالی',icon:'orders'},
  {id:'checkout',label:'ثبت سفارش',description:'متن‌ها و راهنمای تکمیل سفارش',icon:'orders'},
  {id:'payment',label:'کارت بانکی',description:'شماره کارت مقصد و نام صاحب حساب برای واریز سفارش‌ها',icon:'clipboard'},
  {id:'contact',label:'درباره ما و ارتباط',description:'معرفی، تماس و شبکه‌های اجتماعی',icon:'message'},
  {id:'chat',label:'صفحه گفتگو',description:'خوشامدگویی و پیشنهادهای گفتگو',icon:'message'},
  {id:'effects',label:'جلوه‌های بصری',description:'موج‌ها، نشانگر و انتقال صفحه',icon:'sparkles'},
  {id:'sms',label:'تنظیمات SMS',description:'اتصال امن به سرویس پیامک ورود',icon:'send'},
  {id:'openrouter',label:'تنظیمات OpenRouter',description:'مدل هوش مصنوعی و کلید اتصال',icon:'sparkles'},
  {id:'raboteb',label:'همگامساز رابوطب',description:'ورود محصولات، قیمت و موجودی',icon:'refresh'},
];
const Context=createContext<{setDirty:(value:boolean)=>void;registerDirty:(id:string,value:boolean)=>void}>({setDirty:()=>{},registerDirty:()=>{}});
export const useSettingsNavigation=()=>useContext(Context);
export function useSettingsDirty(value:boolean){const id=useId();const {registerDirty}=useSettingsNavigation();useEffect(()=>{registerDirty(id,value);return()=>registerDirty(id,false);},[id,value,registerDirty]);}
export function SettingsWorkspace({children}:{children:ReactNode}){
  const pathname=usePathname(),router=useRouter();const [editorDirty,setDirty]=useState(false),[pending,setPending]=useState('');
  const [dirtyForms,setDirtyForms]=useState<Record<string,boolean>>({});
  const registerDirty=useCallback((id:string,value:boolean)=>setDirtyForms(previous=>{if(!!previous[id]===value)return previous;const next={...previous};if(value)next[id]=true;else delete next[id];return next;}),[]);
  const dirty=editorDirty||Object.values(dirtyForms).some(Boolean);
  const active=pathname.split('/')[3]||'general';
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>event.preventDefault();window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  return <Context.Provider value={{setDirty,registerDirty}}><header className="settings-heading"><span className="admin-eyebrow">کنترل تجربه فروشگاه</span><h1>تنظیمات</h1><p>از ظاهر و محتوای سایت تا اتصال سرویس‌ها؛ همه در یک جا.</p></header><div className="settings-workspace"><aside className="settings-sidebar admin-glass"><div className="settings-sidebar-heading"><AdminIcon name="settings" size={19}/><strong>تنظیمات فروشگاه</strong></div><nav aria-label="بخش‌های تنظیمات">{settingsTabs.map(tab=><Link key={tab.id} href={tab.id==='general'?'/admin/settings':`/admin/settings/${tab.id}`} className={active===tab.id?'is-active':''} aria-current={active===tab.id?'page':undefined} onClick={event=>{if(dirty&&active!==tab.id){event.preventDefault();setPending(event.currentTarget.getAttribute('href')!);}}}><AdminIcon name={tab.icon} size={19}/><span>{tab.label}</span>{active===tab.id?<i/>:null}</Link>)}</nav><small>تغییرات هر بخش را جداگانه ذخیره کن.</small></aside><div className="settings-content">{children}</div></div>{pending?<AdminModal title="تغییرات ذخیره نشده" onClose={()=>setPending('')}><p>قبل از رفتن به بخش بعد، تغییرات این بخش را ذخیره کن یا از آن‌ها صرف‌نظر کن.</p><div className="settings-actions"><button className="admin-button" onClick={()=>setPending('')}>ادامه ویرایش</button><button className="admin-button admin-button-primary" onClick={()=>{setDirty(false);router.push(pending);setPending('');}}>رفتن بدون ذخیره</button></div></AdminModal>:null}</Context.Provider>;
}

