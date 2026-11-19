'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/api';
import {normalizeDigits} from '@/lib/orders';
import type {SavedAddress} from '@/lib/customer-address';
import {Icon} from './icons';
import styles from './customer-account.module.css';

const fields=[['label','عنوان نشانی',60],['name','نام گیرنده',100],['phone','موبایل گیرنده',11],['province','استان',70],['city','شهر',70],['postalCode','کد پستی',10],['address','نشانی کامل',1000]] as const;
export function AddressBook({phone,onChange}:{phone:string;onChange:()=>void}){
  const [rows,setRows]=useState<SavedAddress[]|null>(null),[draft,setDraft]=useState<SavedAddress|null>(null),[remove,setRemove]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const c=new AbortController();api<SavedAddress[]>('/customer/addresses',{signal:c.signal}).then(setRows).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[attempt]);
  function edit(row:SavedAddress){setError('');setRemove('');setDraft(row);}
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy||!draft)return;
    const form=new FormData(e.currentTarget),doc=Object.fromEntries(fields.map(([k])=>[k,String(form.get(k)??'').trim()]));
    doc.phone=normalizeDigits(doc.phone);doc.postalCode=normalizeDigits(doc.postalCode);
    const bad=fields.find(([k])=>k==='phone'?!/^09\d{9}$/.test(doc.phone):k==='postalCode'?!/^\d{10}$/.test(doc.postalCode):doc[k].length<(k==='address'?10:k==='label'?1:2));
    if(bad){setError('لطفاً '+bad[1]+' را کامل و درست وارد کن.');(e.currentTarget.elements.namedItem(bad[0]) as HTMLElement)?.focus();return;}
    setBusy(true);setError('');try{const saved=await api<SavedAddress>('/customer/addresses'+(draft.id?'/'+draft.id:''),{method:draft.id?'PUT':'POST',body:JSON.stringify(doc)});setRows(prev=>[saved,...(prev??[]).filter(r=>r.id!==saved.id)]);setDraft(null);onChange();}catch(e){setError(e instanceof Error?e.message:'ذخیره نشد.');}finally{setBusy(false);}
  }
  async function erase(id:string){if(busy)return;setBusy(true);setError('');try{await api('/customer/addresses/'+id,{method:'DELETE'});setRows(prev=>prev?.filter(r=>r.id!==id)??[]);setRemove('');onChange();}catch(e){setError(e instanceof Error?e.message:'حذف نشد.');}finally{setBusy(false);}}
  return <><div className={styles.heading}><p>نشانی‌های تحویل را برای خرید بعدی اینجا نگه دار.</p>{!draft&&rows&&<button className={styles.primary} onClick={()=>edit({id:'',label:'',name:'',phone,province:'',city:'',address:'',postalCode:''})}><Icon name="plus" size={16}/>نشانی جدید</button>}</div>
    {draft?<form key={draft.id||'new'} className={styles.form} noValidate onSubmit={save}>{fields.map(([k,label,len])=><label key={k}>{label}{k==='address'?<textarea name={k} defaultValue={draft[k]} maxLength={len} rows={3}/>:<input name={k} defaultValue={draft[k]} maxLength={len} inputMode={k==='phone'||k==='postalCode'?'numeric':'text'} dir={k==='phone'||k==='postalCode'?'ltr':'rtl'}/>}</label>)}<div className={styles.actions}><button className={styles.primary} disabled={busy}>ذخیره نشانی</button><button type="button" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>انصراف</button></div></form>:rows===null?<p role="status">{error?<button className={styles.linkButton} onClick={()=>{setError('');setAttempt(n=>n+1);}}>تلاش دوباره</button>:'در حال دریافت نشانی‌ها…'}</p>:!rows.length?<div className={styles.empty}><Icon name="pin" size={30}/><h3>هنوز نشانی ثبت نکردی</h3><p>برای شروع، «نشانی جدید» را انتخاب کن.</p></div>:rows.map(row=><article className={styles.address} key={row.id}><h3><Icon name="pin" size={18}/>{row.label}</h3><p>{row.province}، {row.city}، {row.address}</p><small>{row.name} · <bdi>{row.phone}</bdi> · کد پستی <bdi>{row.postalCode}</bdi></small><div className={styles.actions}>{remove===row.id?<><strong>این نشانی حذف شود؟</strong><button disabled={busy} onClick={()=>void erase(row.id)}>بله، حذف شود</button><button disabled={busy} onClick={()=>setRemove('')}>انصراف</button></>:<><button onClick={()=>edit(row)}>ویرایش</button><button onClick={()=>{setError('');setRemove(row.id);}}>حذف</button></>}</div></article>)}
    {error&&<p role="alert" className={styles.error}>{error}</p>}</>;
}
