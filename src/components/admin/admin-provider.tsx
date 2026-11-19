'use client';
import {useSiteSettings} from '../site-settings-provider';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { createAdminPreview, deriveAdminUserMetrics, type AdminProduct, type AdminOrderStatus, type AdminUserStatus, type AdminPreviewData } from '@/lib/admin-preview';
import { normalizeAdminProduct, type AdminAnimationConfig, type AdminCategory, type AdminBrand, type AdminMutationResult } from '@/lib/admin-product-model';
import { api, ApiError } from '@/lib/api';
import Image from 'next/image';
import Link from 'next/link';
export type AdminSettings = { storeName: string; storeDescription: string; email: string; orderNotifications: boolean; lowStockAlerts: boolean; stockThreshold: number; compactTables: boolean };
const initialSettings: AdminSettings = { storeName: 'پوستیکال', storeDescription: 'مراقبت تخصصی پوست، مو و زیبایی', email: '', orderNotifications: true, lowStockAlerts: true, stockThreshold: 5, compactTables: false };
function useAdminState() {
  const [data,setData]=useState(createAdminPreview);const [settings,setSettings]=useState(initialSettings);const [message,setMessage]=useState('');const [auth,setAuth]=useState<'loading'|'ready'|'login'|'error'>('loading');const [error,setError]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const files=useRef(new Map<string,File>());const uploaded=useRef(new Map<string,string>());
  const notify=useCallback((text:string)=>{setMessage(text);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),5000);},[]);
  const load=useCallback(async()=>{
    try {
      const state = await api<AdminPreviewData & {settings: AdminSettings}>('/admin/state');
      if (!state?.currentAdmin || !state.settings ||
          ![state.products, state.orders, state.users, state.categories, state.brands].every(Array.isArray)) {
        throw new Error('اطلاعات پنل کامل دریافت نشد. نسخهٔ سرویس فروشگاه را بررسی کن و دوباره تلاش کن.');
      }
      setData(state);
      setSettings({...initialSettings, ...state.settings});
      setAuth('ready');
      setError('');
    }
    catch(err){setAuth(err instanceof ApiError&&err.status===401?'login':'error');setError(err instanceof Error?err.message:'ارتباط برقرار نشد.');}
  },[]);
  useEffect(()=>{const start=setTimeout(()=>void load(),0);const registry=files.current;return()=>{clearTimeout(start);registry.forEach((_,url)=>URL.revokeObjectURL(url));if(timer.current)clearTimeout(timer.current);};},[load]);
  const refreshOrders=useCallback(async()=>{const orders=await api<AdminPreviewData['orders']>('/admin/orders');setData(current=>({...current,orders}));},[]);
  const createAssetUrl=useCallback((file:File)=>{const url=URL.createObjectURL(file);files.current.set(url,file);return url;},[]);
  async function persistAssets(value:unknown,purpose?:string):Promise<unknown>{
    if(typeof value==='string'&&value.startsWith('blob:')){if(uploaded.current.has((purpose??'')+value))return uploaded.current.get((purpose??'')+value);const file=files.current.get(value);if(!file)throw new Error('فایل را دوباره انتخاب کن.');const form=new FormData();form.set('file',file);if(purpose)form.set('purpose',purpose);const result=await api<{url:string}>('/admin/media',{method:'POST',body:form});uploaded.current.set((purpose??'')+value,result.url);return result.url;}
    if(Array.isArray(value)){const result=[];for(const item of value)result.push(await persistAssets(item,purpose));return result;}
    if(value&&typeof value==='object'){const result:Record<string,unknown>={};for(const [key,item] of Object.entries(value))result[key]=await persistAssets(item,key==='thumbnail'?'thumbnail':key==='animation'?'animation-reference':purpose);return result;}return value;
  }
  async function mutate(path:string,method:string,value?:unknown):Promise<AdminMutationResult>{try{await api(path,{method,body:value===undefined?undefined:JSON.stringify(await persistAssets(value))});await load();notify('تغییرات ذخیره شد.');return {ok:true};}catch(err){const error=err instanceof Error?err.message:'ذخیره انجام نشد.';notify(error);if(err instanceof ApiError&&err.status===401)setAuth('login');return {ok:false,error};}}
  async function prepareAnimation(config:AdminAnimationConfig) {
    return api<AdminAnimationConfig>('/admin/animations/prepare',{method:'POST',body:JSON.stringify(await persistAssets(config,'animation-reference'))});
  }
  const saveProduct=(product:AdminProduct)=>mutate('/admin/products','POST',normalizeAdminProduct(product));
  const removeOrder=(id:string)=>mutate(`/admin/orders/${encodeURIComponent(id)}`,'DELETE');
  const removeProduct=(id:string)=>mutate(`/admin/products/${encodeURIComponent(id)}`,'DELETE');
  const saveCategory=(value:AdminCategory)=>mutate('/admin/categories','POST',value);
  const removeCategory=(id:string)=>mutate(`/admin/categories/${encodeURIComponent(id)}`,'DELETE');
  const saveBrand=(value:AdminBrand)=>mutate('/admin/brands','POST',value);
  const removeBrand=(id:string)=>mutate(`/admin/brands/${encodeURIComponent(id)}`,'DELETE');
  async function saveSettings(value: AdminSettings): Promise<AdminMutationResult> {
    try {
      const stored = await api<AdminSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(value) });
      setSettings({ ...initialSettings, ...stored });
      return { ok: true };
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setAuth('login');
      return { ok: false, error: reason instanceof Error ? reason.message : 'تنظیمات ذخیره نشد.' };
    }
  }
  const updateOrderStatus=(id:string,status:AdminOrderStatus)=>mutate(`/admin/orders/${id}/status`,'PUT',{status});
  const removeUser=(id:string)=>mutate(`/admin/users/${encodeURIComponent(id)}`,'DELETE');
  const updateUserStatus=(id:string,status:AdminUserStatus)=>mutate(`/admin/users/${id}/status`,'PUT',{status});
  const logout=async()=>{await api('/auth/logout',{method:'POST'});setData(createAdminPreview());setAuth('login');};
  return {...data,users:deriveAdminUserMetrics(data.users,data.orders),settings,message,notify,refreshOrders,prepareAnimation,saveProduct,removeProduct,removeOrder,saveCategory,removeCategory,saveBrand,removeBrand,createAssetUrl,updateOrderStatus,updateUserStatus,removeUser,saveSettings,auth,error,load,logout};
}
type AdminContextValue=ReturnType<typeof useAdminState>;const AdminContext=createContext<AdminContextValue|null>(null);
function AdminLogin({onLogin}:{onLogin:()=>Promise<void>}){
  const {settings:{branding}}=useSiteSettings();
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setPassword('');await onLogin();}catch(err){setError(err instanceof Error?err.message:'ورود انجام نشد.');}finally{setBusy(false);}}
  return <main id="main-content" className="admin-login"><form className="admin-glass admin-login-card" onSubmit={submit}><Image src={branding.logo} width={230} height={42} alt={branding.logoAlt}/><span className="admin-eyebrow">مدیریت فروشگاه</span><h1>خوش برگشتی</h1><p>برای مدیریت محصولات و سفارش‌ها وارد شو.</p><label className="admin-form-field">ایمیل مدیر<input type="email" dir="ltr" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="admin-form-field">رمز ورود<input type="password" dir="ltr" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error?<p role="alert" className="admin-form-error">{error}</p>:null}<button className="admin-button admin-button-primary" disabled={busy}>{busy?'در حال ورود…':'ورود به پنل'}</button><Link href="/">بازگشت به فروشگاه</Link></form></main>;
}
export function AdminProvider({children}:{children:ReactNode}){const value=useAdminState();return <AdminContext.Provider value={value}>{value.auth==='ready'?children:value.auth==='login'?<AdminLogin onLogin={value.load}/>:<main id="main-content" className="admin-login"><div className="admin-glass admin-login-card"><h1>{value.auth==='loading'?'در حال دریافت اطلاعات…':'ارتباط برقرار نشد'}</h1>{value.auth==='error'?<><p>{value.error}</p><button className="admin-button" onClick={value.load}>تلاش دوباره</button></>:null}</div></main>}<div className={`admin-toast${value.message?' is-visible':''}`} role="status">{value.message}</div></AdminContext.Provider>;}
export function useAdmin(){const context=useContext(AdminContext);if(!context)throw new Error('AdminProvider is required');return context;}
