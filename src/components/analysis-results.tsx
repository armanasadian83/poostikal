'use client';
import { ProductCard } from './product-card';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { answerRows, packages, guides, topics, type AnalysisAnswers, type AnalysisSave } from '@/lib/analysis-guide';
import { loadSamples, type Sample } from '@/lib/analysis-samples';
import { ApiError } from '@/lib/api';
import { addAnalysisBundle, rememberAnalysisBundle } from '@/lib/store';
import { Icon } from './icons';

export function AnalysisResults({answers,save,retrySave,samples,onSamplesChange,onRestart}:{
  answers:AnalysisAnswers;save:AnalysisSave;retrySave:()=>void;samples:Sample[];onSamplesChange:(items:Sample[])=>void;onRestart:()=>void;
}) {
  const router=useRouter();
  const [working,setWorking]=useState(false),[notice,setNotice]=useState('');
  const locked=useRef(false),retry=useRef<AbortController|null>(null);
  const topic=topics.find(item=>item.id===answers.topic)?.label;
  const pack=packages.find(p=>p.id===answers.packageId)?.label;
  useEffect(()=>()=>retry.current?.abort(),[]);
  async function refresh(){
    if(locked.current)return;
    locked.current=true;setWorking(true);setNotice('');
    const controller=new AbortController();retry.current=controller;
    try {
      const items=await loadSamples(answers,AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]));
      if(!controller.signal.aborted)onSamplesChange(items);
    }
    catch {if(!controller.signal.aborted)setNotice('استعلام موجودی فعلاً در دسترس نیست.');}
    finally{locked.current=false;if(!controller.signal.aborted)setWorking(false);}
  }
  async function buy(){
    if(!samples?.length||locked.current)return;
    locked.current=true;setWorking(true);setNotice('');
    const lines=samples.map(({product,variant})=>({productId:product.id,variantId:variant.id}));
    try {
      await addAnalysisBundle(lines);router.push('/cart');return;
    } catch(error) {
      if(error instanceof ApiError && error.status===401){
        try{rememberAnalysisBundle(lines);router.push('/login?reason=analysis-cart');return;}
        catch{setNotice('برای نگه‌داشتن انتخاب‌ها تا زمان ورود، ذخیره‌سازی این مرورگر باید فعال باشد.');}
      }else setNotice(error instanceof Error?error.message:'افزودن محصولات انجام نشد.');
    }
    locked.current=false;setWorking(false);
  }
  return <div className="analysis-results">
    <p className="result-intro">پیشنهادهای نمونه برای مراقبت از {topic}، بر اساس پاسخ‌های تو. <span>انتخاب تو: {pack}</span></p>
      {samples.length ? <div className="product-grid catalog-grid">
        {samples.map(({product,variant,preview},index)=><ProductCard key={product.id} product={product} index={index} variantId={variant.id} preview={preview}/>)}
      </div> : <p role="status">فعلاً محصول موجودی برای این انتخاب‌ها پیدا نکردیم. <button className="analysis-back" disabled={working} onClick={()=>void refresh()}>تازه‌سازی محصولات</button></p>}
      {samples.length>0 && <section className="match-chart" aria-labelledby="match-chart-title">
        <h2 id="match-chart-title">چرا این محصول‌ها رو بهت پیشنهاد دادیم؟</h2>
        <p>برای هر محصول، اسم، توضیحات کامل، مشخصات و اطلاعات ثبت‌شده برای عکس‌هاش رو با جواب‌هات مقایسه کردیم. خونه‌های رنگی نشون می‌دن کجا به هم می‌خورن.</p>
        <table><thead><tr><th scope="col">محصول</th><th scope="col">موضوع</th><th scope="col">مشخصات {topic}</th><th scope="col">دغدغهٔ تو</th></tr></thead>
        <tbody>{samples.map(({product,family,profile,concerns})=><tr key={product.id}><th scope="row"><strong>{family}</strong><span>{product.name}</span></th>
          <td><span className="match-signal">{topic}</span></td>
          {[profile,concerns.join('، ')].map((value,i)=><td key={i}>{value?<span className="match-signal">{value}</span>:<span aria-label="تطبیق مستقیم ندارد" className="match-empty">—</span>}</td>)}
        </tr>)}</tbody></table>
        <p>{answers.packageId==='economy'?'در بستهٔ اقتصادی، بین گزینه‌های هم‌خوان، قیمت پایین‌تر اولویت دارد.':answers.packageId==='advanced'?'در بستهٔ پیشرفته، تا سه گروه محصول برای مقایسه نمایش داده می‌شود.':'چون هنوز بسته‌ای انتخاب نکردی، تا دو گروه محصول برای مقایسه نمایش داده می‌شود.'} خط تیره یعنی اطلاعات محصول برای این بخش از جوابت کافی نبود.</p>
      </section>}
    <details className="analysis-summary"><summary>پاسخ‌های من{save.state==='saved' && <> · کد پیگیری <bdi>{save.id.slice(0,8)}</bdi></>}</summary>
      <dl>{answerRows(answers,guides[answers.topic]).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>
    {save.state!=='saved' && <p className="analysis-private" role="status">
      {save.state==='saving'?'در حال ثبت درخواست برای پیگیری…':save.state==='preview'?'این پیش‌نمایش بدون ثبت شماره و عکس نمایش داده می‌شود.':'پیشنهادها آماده‌اند. ثبت درخواست برای پیگیری تأیید نشد.'}
      {save.state==='unconfirmed' && <> <button className="analysis-back" onClick={retrySave}>تلاش دوباره برای ثبت</button></>}
    </p>}
    {notice&&<div role="alert" className="analysis-error">{notice} <button className="analysis-back" disabled={working} onClick={()=>void refresh()}>تازه‌سازی محصولات</button></div>}
    <div className="analysis-actions result-actions">
      <button className="analysis-next" disabled={working||!samples?.length} onClick={()=>void buy()}><Icon name="bag" size={19}/>افزودن محصولات به سبد خرید</button>
      <button className="analysis-back" disabled={working} onClick={onRestart}><Icon name="refresh" size={17}/>شروع مجدد</button>
    </div>
  </div>;
}
