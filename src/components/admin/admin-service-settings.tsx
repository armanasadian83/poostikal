'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {normalizeDigits} from '@/lib/orders';
import {useAdmin} from './admin-provider';
import {AdminPanel} from './admin-ui';
import {useSettingsDirty} from './settings-navigation';
type SMS={templateId:number|null;parameterName:string|null;keyConfigured:boolean;storageReady:boolean;otpReady:boolean};
export function AdminSMSSettings(){
 const {currentAdmin}=useAdmin();
 const owner=currentAdmin?.role==='owner';
 const [config,setConfig]=useState<SMS|null>(null);
 const [key,setKey]=useState('');
 const [templateId,setTemplateId]=useState('');
 const [parameterName,setParameterName]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [loadAttempt,setLoadAttempt]=useState(0);
 const savedTemplateId=config?.templateId==null?'':String(config.templateId);
 const dirty=!!key||(config!==null&&(templateId!==savedTemplateId||parameterName!==(config.parameterName??'')));
 useSettingsDirty(dirty);

 useEffect(()=>{
   if(!owner)return;
   const controller=new AbortController();
   api<SMS>('/admin/sms',{signal:controller.signal}).then(value=>{
     setConfig(value);
     setTemplateId(value.templateId==null?'':String(value.templateId));
     setParameterName(value.parameterName??'');
     setError('');
   }).catch(reason=>{
     if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'دریافت تنظیمات پیامک انجام نشد.');
   });
   return()=>controller.abort();
 },[owner,loadAttempt]);

 async function save(event:FormEvent){
   event.preventDefault();
   if(!owner||!config||busy)return;
   setError('');setNotice('');
   const normalizedId=normalizeDigits(templateId).trim();
   const numericId=Number(normalizedId);
   if(!/^\d{1,10}$/.test(normalizedId)||numericId<1||numericId>2_147_483_647){
     setError('شناسه عددی قالب تأییدشده SMS.ir را وارد کن.');return;
   }
   const trimmedParameterName=parameterName.trim();
   if(!trimmedParameterName){setError('نام متغیر کد ورود را مطابق قالب SMS.ir وارد کن.');return;}
   const apiKey=key.trim();
   if(!apiKey&&!config.keyConfigured){setError('کلید API حساب SMS.ir را وارد کن.');return;}
   if(!config.storageReady||!config.otpReady)return;
   setBusy(true);
   try{
     const value=await api<SMS>('/admin/sms',{method:'PUT',body:JSON.stringify({templateId:numericId,parameterName:trimmedParameterName,...(apiKey?{apiKey}:{})})});
     setConfig(value);
     setTemplateId(value.templateId==null?'':String(value.templateId));
     setParameterName(value.parameterName??'');
     setKey('');
     setNotice('تنظیمات SMS.ir ذخیره شد.');
   }catch(reason){setError(reason instanceof Error?reason.message:'ذخیره تنظیمات پیامک انجام نشد. دوباره تلاش کن.');}
   finally{setBusy(false);}
 }

 if(!owner)return <AdminPanel title="تنظیمات پیامک · SMS.ir"><p className="admin-small admin-muted">فقط سازنده سایت می‌تواند تنظیمات پیامک را مشاهده و ویرایش کند.</p></AdminPanel>;
 const configured=!!(config?.keyConfigured&&config.templateId&&config.parameterName);
 const ready=!!(configured&&config?.storageReady&&config.otpReady);
 return <AdminPanel title="تنظیمات پیامک · SMS.ir">
   <p className="admin-muted admin-small">کلید API، شناسه عددی قالب تأییدشده و نام متغیر کد ورود را از پنل SMS.ir وارد کن. با ذخیره این تنظیمات، ارسال کد ورود فعال می‌شود.</p>
   {config?<form onSubmit={save} noValidate className="settings-service-stack" aria-busy={busy}>
     <p role="status">{ready?'تنظیمات ورود پیامکی کامل است.':configured?'کلید، قالب و متغیر کد ثبت شده‌اند؛ آماده‌سازی سرور هنوز کامل نیست.':'برای فعال شدن ورود پیامکی، کلید API، شناسه قالب و نام متغیر کد را ثبت کن.'}</p>
     <label className="admin-form-field"><span>کلید API</span>
       <input type="password" autoComplete="new-password" dir="ltr" value={key} disabled={busy||!config.storageReady} required={!config.keyConfigured}
         onChange={event=>{setKey(event.target.value);setError('');setNotice('');}}
         placeholder={config.keyConfigured?'برای حفظ کلید فعلی، خالی بگذار':'کلید API حساب SMS.ir'}/>
       {config.keyConfigured?<small>کلید اتصال ثبت شده است و نمایش داده نمی‌شود.</small>:null}
     </label>
     <label className="admin-form-field"><span>شناسه عددی قالب تأیید</span>
       <input type="text" inputMode="numeric" autoComplete="off" dir="ltr" required value={templateId} disabled={busy} maxLength={10} placeholder="شناسه قالب SMS.ir"
         onChange={event=>{setTemplateId(normalizeDigits(event.target.value));setError('');setNotice('');}}/>
       <small>شناسه قالب تأییدشده را از پنل SMS.ir بردار.</small>
     </label>
     <label className="admin-form-field"><span>نام متغیر کد ورود</span>
       <input type="text" autoComplete="off" dir="ltr" required value={parameterName} disabled={busy} maxLength={130} placeholder="نام متغیر داخل قالب"
         onChange={event=>{setParameterName(event.target.value);setError('');setNotice('');}}/>
       <small>نام متغیر را دقیقاً از قالب کپی کن؛ مثلاً برای <bdi dir="ltr">#OTP#</bdi>، مقدار <bdi dir="ltr">OTP</bdi> را بنویس. حروف بزرگ و کوچک باید با قالب یکسان باشند.</small>
     </label>
     {!config.storageReady?<p className="admin-form-error" role="status">ذخیره تنظیمات تا آماده شدن رمزگذاری سرویس‌ها روی سرور غیرفعال است.</p>:null}
     {!config.otpReady?<p className="admin-form-error" role="status">کلید امنیت ورود (OTP_SECRET) باید روی سرور تنظیم شود.</p>:null}
     <button className="admin-button admin-button-primary" type="submit" disabled={busy||!config.storageReady||!config.otpReady}>{busy?'در حال ذخیره…':'ذخیره تنظیمات پیامک'}</button>
   </form>:!error?<p role="status">در حال دریافت تنظیمات پیامک…</p>:null}
   {error?<p role="alert" className="admin-form-error">{error}</p>:null}
   {!config&&error?<button className="admin-button" type="button" onClick={()=>{setError('');setLoadAttempt(attempt=>attempt+1);}}>تلاش دوباره</button>:null}
   {notice?<p role="status">{notice}</p>:null}
 </AdminPanel>;
}
export function AdminServiceKey(){
 const [config,setConfig]=useState<{keyConfigured:boolean;storageReady:boolean}|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useSettingsDirty(!!key);
 useEffect(()=>{const controller=new AbortController();api<{keyConfigured:boolean;storageReady:boolean}>('/admin/integrations/openrouter',{signal:controller.signal}).then(setConfig).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');setNotice('');try{setConfig(await api('/admin/integrations/openrouter',{method:'PUT',body:JSON.stringify({apiKey:key})}));setKey('');setNotice('کلید اتصال به‌صورت رمزگذاری‌شده ذخیره شد.');window.dispatchEvent(new Event('poostikal:ai-key'));}catch(e){setError(e instanceof Error?e.message:'ذخیره انجام نشد.');}finally{setBusy(false);}}
 return <AdminPanel title="کلید اتصال OpenRouter"><p className="admin-small admin-muted">کلید فقط روی سرور استفاده می‌شود و در پاسخ تنظیمات یا صفحات عمومی نمایش داده نمی‌شود.</p>{config?<form onSubmit={save} noValidate className="settings-service-stack"><p>{config.keyConfigured?'کلید اتصال ثبت شده است.':'کلید اتصال هنوز ثبت نشده است.'}</p><label className="admin-form-field">کلید جدید<input type="password" autoComplete="new-password" dir="ltr" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-or-…" disabled={!config.storageReady}/></label>{!config.storageReady?<p className="admin-form-error">ابتدا رمزگذاری سرویس‌ها را روی سرور تنظیم کن.</p>:null}<button className="admin-button admin-button-primary" disabled={busy||!key||!config.storageReady}>{busy?'در حال ذخیره…':'ذخیره کلید اتصال'}</button></form>:null}{error?<p role="alert" className="admin-form-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}</AdminPanel>;
}
