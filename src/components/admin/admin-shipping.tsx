'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { normalizeDigits, type ShippingMethod } from '@/lib/orders';
import { AdminIcon } from './admin-icon';
import { AdminEmpty, AdminModal, AdminPageHeading, AdminPanel } from './admin-ui';
import { useAdmin } from './admin-provider';

function ShippingEditor({initial,onSaved,onClose}:{initial:ShippingMethod;onSaved:()=>Promise<void>;onClose:()=>void}) {
  const [method,setMethod]=useState(initial);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/admin/shipping-methods',{method:'POST',body:JSON.stringify({...method,feeToman:method.type==='collect'?0:method.feeToman})});await onSaved();onClose();}catch(err){setError(err instanceof Error?err.message:'ذخیره انجام نشد.');}finally{setBusy(false);}}
  return <AdminModal title={initial.name?'ویرایش روش ارسال':'افزودن روش ارسال'} onClose={onClose}><form onSubmit={save}><fieldset className="admin-shipping-fields" disabled={busy}>
    <label className="admin-form-field"><span>نام روش ارسال</span><input autoFocus required maxLength={100} value={method.name} onChange={e=>setMethod({...method,name:e.target.value})} placeholder="مثلاً ماهکس یا پیک"/></label>
    <label className="admin-form-field"><span>نحوه محاسبه هزینه</span><select value={method.type} onChange={e=>setMethod({...method,type:e.target.value as ShippingMethod['type']})}><option value="flat">هزینه ثابت</option><option value="collect">پس‌کرایه — پرداخت هزینه حمل هنگام تحویل</option></select></label>
    {method.type==='flat'?<label className="admin-form-field"><span>هزینه ارسال (تومان)</span><input required inputMode="numeric" dir="ltr" value={method.feeToman} onChange={e=>{const v=normalizeDigits(e.target.value);if(/^\d*$/.test(v))setMethod({...method,feeToman:Number(v)});}} type="text" maxLength={10}/><small>{formatPrice(method.feeToman)} تومان</small></label>:<p className="admin-shipping-hint">هزینه حمل در مبلغ سفارش حساب نمی‌شود؛ مشتری آن را هنگام تحویل پرداخت می‌کند.</p>}
    <label className="admin-form-field"><span>توضیح برای مشتری</span><textarea rows={3} maxLength={500} value={method.description} onChange={e=>setMethod({...method,description:e.target.value})} placeholder="محدوده ارسال یا توضیحات تحویل"/></label>
    <label className="admin-form-field"><span>ترتیب نمایش</span><input type="number" min={0} max={1000} value={method.sortOrder} onChange={e=>setMethod({...method,sortOrder:Number(e.target.value)})}/></label>
    <label className="admin-shipping-active"><input type="checkbox" checked={method.active} onChange={e=>setMethod({...method,active:e.target.checked})}/>فعال و قابل انتخاب در سبد خرید</label>
    {error?<p role="alert" className="admin-form-error">{error}</p>:null}
    <div className="admin-form-actions"><button className="admin-button admin-button-primary" type="submit">{busy?'در حال ذخیره…':'ذخیره روش ارسال'}</button><button type="button" className="admin-button" onClick={onClose}>انصراف</button></div>
  </fieldset></form></AdminModal>;
}

export function AdminShipping() {
  const [methods,setMethods]=useState<ShippingMethod[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [editing,setEditing]=useState<ShippingMethod|null>(null);const {notify}=useAdmin();
  const load=useCallback(async()=>{try{const values=await api<ShippingMethod[]>('/admin/shipping-methods');setMethods(values);setError('');}catch(err){setError(err instanceof Error?err.message:'دریافت روش‌ها انجام نشد.');}finally{setLoading(false);}},[]);
  useEffect(()=>{const start=setTimeout(()=>void load(),0);return()=>clearTimeout(start);},[load]);
  return <><AdminPageHeading title="حمل و نقل" description="روش‌ها و هزینه‌های ارسال را مدیریت کن؛ مشتری از همین گزینه‌ها در صفحه تکمیل سفارش انتخاب می‌کند." action={<button className="admin-button admin-button-primary" onClick={()=>setEditing({id:crypto.randomUUID(),name:'',description:'',type:'flat',feeToman:0,active:true,sortOrder:methods.length})}><AdminIcon name="plus" size={19}/>افزودن روش ارسال</button>}/>
    <AdminPanel title="روش‌های ارسال" action={<button className="admin-button" onClick={()=>void load()}><AdminIcon name="refresh" size={17}/>تازه‌سازی</button>}>
      {error?<p role="alert" className="admin-form-error">{error}</p>:loading?<p role="status">در حال دریافت روش‌های ارسال…</p>:methods.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>روش ارسال</th><th>نوع هزینه</th><th>مبلغ (تومان)</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{methods.map(method=><tr key={method.id}><td><strong>{method.name}</strong><p className="admin-small admin-muted">{method.description}</p></td><td>{method.type==='collect'?'پس‌کرایه':'ثابت'}</td><td><strong>{method.type==='collect'?'هنگام تحویل':formatPrice(method.feeToman)}</strong></td><td><span className={`admin-shipping-status${method.active?' is-active':''}`}>{method.active?'فعال':'غیرفعال'}</span></td><td><button className="admin-table-action" onClick={()=>setEditing(method)} aria-label={`ویرایش ${method.name}`}><AdminIcon name="edit" size={17}/>ویرایش</button></td></tr>)}</tbody></table></div>:<AdminEmpty/>}
      <p className="admin-shipping-hint">غیرفعال کردن یک روش، آن را از سفارش‌های جدید پنهان می‌کند. جزئیات ارسال سفارش‌های قبلی حفظ می‌شود.</p>
    </AdminPanel>
    {editing?<ShippingEditor key={editing.id} initial={editing} onClose={()=>setEditing(null)} onSaved={async()=>{await load();notify('روش ارسال ذخیره شد.');}}/>:null}
  </>;
}
