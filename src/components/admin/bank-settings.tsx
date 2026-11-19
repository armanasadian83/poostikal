'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {normalizeDigits} from '@/lib/orders';
import type {BankCard} from '@/lib/payment';
import {useAdmin} from './admin-provider';
import {AdminPanel} from './admin-ui';
import {useSettingsDirty} from './settings-navigation';

export function BankSettings(){
  const {currentAdmin}=useAdmin(),owner=currentAdmin?.role==='owner';
  const [saved,setSaved]=useState<BankCard|null>(null),[number,setNumber]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();api<{bank:BankCard|null}>('/admin/payment-bank',{signal:c.signal}).then(({bank})=>{setSaved(bank);setNumber(bank?.cardNumber??'');setName(bank?.holderName??'');}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();},[]);
  const dirty=number!==(saved?.cardNumber??'')||name!==(saved?.holderName??'');useSettingsDirty(dirty);
  async function save(e:FormEvent){e.preventDefault();if(!owner||busy)return;setError('');setMessage('');
    if(!/^\d{16}$/.test(number)||name.trim().length<3){setError('شماره کارت ۱۶ رقمی و نام و نام خانوادگی صاحب حساب را وارد کن.');return;}
    setBusy(true);try{const bank=await api<BankCard>('/admin/payment-bank',{method:'PUT',body:JSON.stringify({cardNumber:number,holderName:name.trim()})});setSaved(bank);setName(bank.holderName);setMessage('اطلاعات کارت مقصد ذخیره شد.');}catch(e){setError(e instanceof Error?e.message:'ذخیره نشد.');}finally{setBusy(false);}
  }
  return <AdminPanel title="کارت مقصد واریز سفارش‌ها"><p className="admin-muted">این کارت پس از ثبت سفارش به خریدار نمایش داده می‌شود. فقط مالک فروشگاه می‌تواند آن را تغییر دهد.</p>
    <form onSubmit={save} noValidate><fieldset className="admin-edit-fieldset" disabled={busy||!owner}><div className="admin-form-grid">
      <label className="admin-form-field"><span>شماره کارت مقصد</span><input dir="ltr" inputMode="numeric" autoComplete="off" placeholder="••••  ••••  ••••  ••••" value={number.replace(/(.{4})(?=.)/g,'$1 ')} onChange={e=>{setNumber(normalizeDigits(e.target.value).replace(/[^0-9]/g,'').slice(0,16));setMessage('');}}/></label>
      <label className="admin-form-field"><span>نام و نام خانوادگی صاحب حساب</span><input maxLength={100} value={name} onChange={e=>{setName(e.target.value);setMessage('');}}/></label></div></fieldset>
      {error&&<p role="alert" className="admin-form-error">{error}</p>}{message&&<p role="status">{message}</p>}{owner&&<div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={busy||!dirty}>ذخیره کارت مقصد</button></div>}
    </form></AdminPanel>;
}
