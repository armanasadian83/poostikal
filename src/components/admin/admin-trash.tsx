'use client';
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/api';
import {normalizeSearch} from '@/lib/search';
import {formatNumber} from '@/lib/format';
import {useAdmin} from './admin-provider';
import {AdminIcon} from './admin-icon';
import {AdminEmpty,AdminModal,AdminPageHeading,AdminPanel} from './admin-ui';
type Entry={id:string;kind:'orders'|'products'|'categories'|'brands'|'analyses'|'customers';name:string;deletedAt:string};
const labels={orders:'سفارشات',products:'محصولات',categories:'دسته‌بندی‌ها',brands:'برندها',analyses:'درخواست‌های آنالیز',customers:'کاربران'};
export function AdminTrash(){
 const {load,notify}=useAdmin();
 const [entries,setEntries]=useState<Entry[]>([]),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[selected,setSelected]=useState<Entry|null>(null);
 const refresh=useCallback(async()=>{try{setEntries(await api<Entry[]>('/admin/trash'));setError('');}catch(e){setError(e instanceof Error?e.message:'دریافت اطلاعات انجام نشد.');}finally{setLoading(false);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh]);
 async function change(item:Entry,restore:boolean){if(busy)return;setBusy(item.kind+item.id);setError('');try{await api('/admin/trash/'+item.kind+'/'+encodeURIComponent(item.id)+(restore?'/restore':''),{method:restore?'POST':'DELETE'});setSelected(null);await Promise.all([refresh(),load()]);notify(restore?'بازیابی انجام شد.':'حذف دائمی انجام شد.');}catch(e){setError(e instanceof Error?e.message:'عملیات انجام نشد.');}finally{setBusy('');}}
 const filtered=entries.filter(e=>(filter==='all'||e.kind===filter)&&normalizeSearch(e.name).includes(normalizeSearch(query)));
 return <><AdminPageHeading title="سطل زباله" description="یک فرصت دیگر برای بازیابی. حذف دائمی قابل بازگشت نیست."/>
 <AdminPanel><div className="admin-trash-tabs" role="group" aria-label="نوع موارد حذف‌شده">{[['all','همه موارد'],...Object.entries(labels)].map(([key,label])=><button key={key} className={'admin-button '+(filter===key?'admin-button-primary':'')} onClick={()=>setFilter(key)} aria-pressed={filter===key}>{label}<span>{formatNumber(entries.filter(e=>key==='all'||e.kind===key).length)}</span></button>)}</div>
 <div className="admin-toolbar"><label className="admin-search-field"><AdminIcon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="جستجو در سطل زباله" placeholder="جستجوی نام..."/></label><button className="admin-button" onClick={()=>void refresh()}><AdminIcon name="refresh" size={18}/>تازه‌سازی</button></div>
 {error&&<p role="alert" className="admin-form-error">{error}</p>}
 {loading?<p>در حال دریافت…</p>:filtered.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>عنوان</th><th>نوع</th><th>زمان حذف</th><th>عملیات</th></tr></thead><tbody>{filtered.map(item=><tr key={item.kind+item.id}><td><strong>{item.name}</strong></td><td>{labels[item.kind]}</td><td>{new Date(item.deletedAt).toLocaleDateString('fa-IR')}</td><td><div className="admin-row-actions"><button disabled={!!busy} className="admin-button" onClick={()=>void change(item,true)}><AdminIcon name="refresh" size={16}/>بازیابی</button><button disabled={!!busy} className="admin-icon-button" aria-label={'حذف دائمی '+item.name} onClick={()=>setSelected(item)}><AdminIcon name="trash" size={18}/></button></div></td></tr>)}</tbody></table></div>:<AdminEmpty title="سطل زباله خالی است." description="مواردی که حذف می‌کنی، ابتدا اینجا قرار می‌گیرند."/>}</AdminPanel>
 {selected&&<AdminModal title="حذف دائمی" onClose={()=>{if(!busy)setSelected(null);}}><p>«{selected.name}» برای همیشه حذف شود؟ امکان بازیابی وجود ندارد.</p>{error&&<p role="alert" className="admin-form-error">{error}</p>}<div className="admin-form-actions"><button className="admin-button admin-button-primary" disabled={!!busy} onClick={()=>void change(selected,false)}>{busy?'در حال حذف…':'حذف برای همیشه'}</button><button className="admin-button" disabled={!!busy} onClick={()=>setSelected(null)}>انصراف</button></div></AdminModal>}</>;
}
