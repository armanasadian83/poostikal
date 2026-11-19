'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { normalizeDigits } from '@/lib/orders';
import { answerRows, reviewLabels, topics, guides, type RecordedAnswers, type AnalysisOutcome } from '@/lib/analysis-guide';
import { AdminEmpty, AdminModal, AdminPageHeading, AdminPagination, AdminPanel } from './admin-ui';
import { AdminIcon } from './admin-icon';
import { useAdmin } from './admin-provider';
import styles from '../payment.module.css';

import legacyDeviceGuide from './legacy-device-analysis.json';

const recordedGuides = { ...guides, device: legacyDeviceGuide };
const recordedTopics = [...topics, {id:'device',label:'دستگاه'}];

type Row = AnalysisOutcome & {clientRef:string;name:string;phone:string;answers:RecordedAnswers<keyof typeof recordedGuides>;createdAt:string;reviewNote:string;hasPhoto:boolean};
function Review({row,onClose,onSaved}:{row:Row;onClose:()=>void;onSaved:()=>void}) {
  const [note,setNote]=useState(row.reviewNote),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const image='/api/admin/analyses/'+row.id+'/photo';
  const definition=recordedGuides[row.answers.topic];
  const guide=definition.groups.flatMap(g=>g.goals).find(goal=>goal.id===row.guidance);
  async function save(){
    if(!note.trim()||busy)return;
    setBusy(true);setError('');
    try{await api('/admin/analyses/'+row.id+'/review',{method:'PUT',body:JSON.stringify({note:note.trim()})});onSaved();}
    catch(e){setError(e instanceof Error?e.message:'ثبت بررسی انجام نشد.');}
    finally{setBusy(false);}
  }
  return <AdminModal wide title={'درخواست '+row.id.slice(0,8)} onClose={()=>{if(!busy)onClose();}}>
    <div className={styles.adminCompare}>
      <div>{row.hasPhoto?<>
        {/* The private original must bypass public image optimization and caching. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} className={styles.photo} alt="عکس پیوست‌شدهٔ ناحیه" onError={()=>setError('دریافت تصویر انجام نشد.')}/>
      </>:<p>عکسی پیوست نشده است.</p>}</div>
      <div><strong>{row.name||'مراجع مهمان'}</strong> <bdi>{row.phone}</bdi><p>{reviewLabels[row.status]}</p>
        <dl>{answerRows(row.answers,definition,recordedTopics.find(t=>t.id===row.answers.topic)?.label).map(([key,val])=><div key={key}><dt>{key}</dt><dd>{val}</dd></div>)}</dl>
        {guide && <p>راهنمای ارائه‌شده · {guide.tip}</p>}
      </div>
    </div><label className="admin-small">یادداشت بررسی انسانی<textarea className="admin-field" value={note} maxLength={2000} rows={3} onChange={e=>setNote(e.target.value)}/></label>
    {error&&<p role="alert" className="admin-form-error">{error}</p>}
    <button className="admin-button admin-button-primary" disabled={busy||!note.trim()} onClick={()=>void save()}>ثبت بررسی</button>
  </AdminModal>;
}

export function AdminAnalyses() {
  const {notify}=useAdmin();
  const [q,setQ]=useState(''),[client,setClient]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
  const [withPhoto,setWithPhoto]=useState(false);
  const [rows,setRows]=useState<{items:Row[];total:number}|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<Row|null>(null),[version,setVersion]=useState(0);
  const [deleting,setDeleting]=useState<Row|null>(null),[busy,setBusy]=useState(false),[deleteError,setDeleteError]=useState('');
  async function moveToTrash(){
    if(!deleting||busy)return;
    setBusy(true);setDeleteError('');
    try {
      await api('/admin/analyses/'+deleting.id,{method:'DELETE'});
      setRows(current=>current?.items.some(item=>item.id===deleting.id)
        ? {items:current.items.filter(item=>item.id!==deleting.id),total:current.total-1} : current);
      setDeleting(null);setVersion(v=>v+1);notify('درخواست به سطل زباله منتقل شد.');
    } catch(e) {
      setDeleteError(e instanceof Error?e.message:'انتقال به سطل زباله انجام نشد.');
    } finally {setBusy(false);}
  }
  useEffect(()=>{
    const abort=new AbortController();
    const params=new URLSearchParams({page:String(page)});
    if(withPhoto)params.set('photo','1');
    if(q.trim())params.set('q',normalizeDigits(q.trim()));if(client)params.set('client',client);if(status)params.set('status',status);
    const timer=setTimeout(()=>{api<{items:Row[];total:number}>('/admin/analyses?'+params,{signal:abort.signal}).then(data=>{
      if(abort.signal.aborted)return;
      const lastPage=Math.max(1,Math.ceil(data.total/20));
      if(page>lastPage){setPage(lastPage);return;}
      setRows(data);setError('');
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);});},150);
    return()=>{clearTimeout(timer);abort.abort();};
  },[q,client,status,withPhoto,page,version]);
  return <><AdminPageHeading title="درخواست‌های آنالیز" description="پاسخ‌ها، عکس ناحیه و نتیجهٔ بررسی هر مراجع."/>
    <AdminPanel title="درخواست‌ها" action={<button className="admin-button" onClick={()=>setVersion(v=>v+1)}>تازه‌سازی</button>}>
      <div className="admin-table-toolbar"><label className="admin-search-field"><AdminIcon name="search"/><input aria-label="جستجوی مراجع" placeholder="نام، موبایل یا کد پیگیری" maxLength={100} value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label>
      <select className="admin-field" aria-label="وضعیت بررسی" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(reviewLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>
      <label className="admin-small"><input type="checkbox" checked={withPhoto} onChange={e=>{setWithPhoto(e.target.checked);setPage(1);}}/> فقط دارای عکس</label>
      {client&&<button className="admin-button" onClick={()=>{setClient('');setPage(1);}}>حذف فیلتر مراجع · <bdi>{client}</bdi></button>}</div>
      {error?<p role="alert">{error}</p>:!rows?<p role="status">در حال دریافت…</p>:rows.items.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr>{['کد پیگیری','مراجع','موضوع','ثبت','عکس','وضعیت','عملیات'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
      {rows.items.map(row=><tr key={row.id}><td><bdi>{row.id.slice(0,8)}</bdi></td><td>{row.name||'مهمان'} <bdi>{row.phone}</bdi><br/><button className="admin-table-action" onClick={()=>{setClient(row.clientRef);setQ('');setPage(1);}}>درخواست‌های این مراجع</button></td><td>{recordedTopics.find(t=>t.id===row.answers.topic)?.label}</td><td>{new Date(row.createdAt).toLocaleDateString('fa-IR')}</td><td>{row.hasPhoto?'پیوست دارد':'—'}</td><td>{reviewLabels[row.status]}</td><td><div className="admin-row-actions">
        <button className="admin-table-action" onClick={()=>setSelected(row)}><AdminIcon name="eye"/>مشاهده</button>
        <button className="admin-icon-button" title="انتقال به سطل زباله" aria-label={'حذف درخواست '+row.id.slice(0,8)} onClick={()=>{setDeleteError('');setDeleting(row);}}><AdminIcon name="trash" size={18}/></button>
      </div></td></tr>)}</tbody></table></div>:<AdminEmpty title="درخواستی پیدا نشد." description="با تغییر فیلتر، درخواست‌های دیگر را ببین."/>}
      {rows&&<AdminPagination page={page} pages={Math.ceil(rows.total/20)} total={rows.total} onChange={setPage}/>}
    </AdminPanel>{selected&&<Review row={selected} onClose={()=>setSelected(null)} onSaved={()=>{setSelected(null);setVersion(v=>v+1);}}/>}
    {deleting&&<AdminModal title="حذف درخواست آنالیز" onClose={()=>{if(!busy)setDeleting(null);}}>
      <p>درخواست <bdi>{deleting.id.slice(0,8)}</bdi> به سطل زباله منتقل بشه؟ از اونجا می‌تونی درخواست رو بازیابی کنی.</p>
      {deleteError&&<p role="alert" className="admin-form-error">{deleteError}</p>}
      <div className="admin-form-actions">
        <button className="admin-button admin-button-primary" disabled={busy} onClick={()=>void moveToTrash()}>{busy?'در حال انتقال…':'انتقال به سطل زباله'}</button>
        <button className="admin-button" disabled={busy} onClick={()=>setDeleting(null)}>انصراف</button>
      </div>
    </AdminModal>}
  </>;
}
