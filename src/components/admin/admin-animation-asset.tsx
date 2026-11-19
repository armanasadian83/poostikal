'use client';
import {useState} from 'react';
import {api} from '@/lib/api';
import type {AdminAnimationConfig} from '@/lib/admin-product-model';

export function AdminAnimationAsset({value,onChange,onBusyChange,disabled=false}:{disabled?:boolean;onBusyChange:(busy:boolean)=>void;value:AdminAnimationConfig;onChange:(value:AdminAnimationConfig)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <details className="admin-animation-advanced" open={value.template==='custom'||!!value.assetUrl}>
    <summary>مدل یا ویدیوی اختصاصی آماده</summary>
    <p className="admin-small admin-muted">برای بسته‌بندی متفاوت یا مدل طراحی‌شدهٔ اختصاصی، فایل GLB دارای حرکت یا MP4 اضافه کن. این فایل جایگزین انیمیشن ساخته‌شده با عکس‌ها می‌شود.</p>
    <label className="admin-form-field">فایل نهایی · MP4 یا GLB · حداکثر ۵۰ مگابایت<input type="file" accept="video/mp4,.glb" disabled={busy||disabled} onChange={async e=>{
      const input=e.currentTarget,file=input.files?.[0];if(!file)return;
      if(file.size>50*1024*1024){setError('حداکثر حجم فایل ۵۰ مگابایت است.');input.value='';return;}
      setBusy(true);onBusyChange(true);setError('');
      try{const body=new FormData();body.set('file',file);const result=await api<{url:string}>('/admin/media',{method:'POST',body});onChange({...value,build:undefined,reviewConfirmed:false,assetUrl:result.url,assetType:file.name.toLowerCase().endsWith('.glb')?'model':'video'});}
      catch(error){setError(error instanceof Error?error.message:'بارگذاری انجام نشد.');}
      finally{setBusy(false);onBusyChange(false);input.value='';}
    }}/></label>
    {busy?<p role="status">در حال بارگذاری…</p>:null}{error?<p role="alert" className="admin-form-error">{error}</p>:null}
    {value.assetUrl?<p className="admin-small">فایل اختصاصی آماده است؛ در مرحلهٔ «ساخت و تأیید» آن را بررسی کن. <button type="button" className="admin-button" disabled={busy||disabled} onClick={()=>onChange({...value,assetUrl:undefined,assetType:undefined,reviewConfirmed:false})}>حذف فایل از محصول</button></p>:null}
  </details>;
}
