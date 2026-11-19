'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { audiences, topics, guides, packages, skinAreas, hairAreas, hairChoices, scalpChoices, scalpGroups, type Choice, type Topic, type AnalysisAnswers, type AnalysisOutcome, type AnalysisSave } from '@/lib/analysis-guide';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { normalizeIranianMobile } from '@/lib/phone';
import { loadSamples, previewSamples, type Sample } from '@/lib/analysis-samples';

import { AnalysisWorkshop } from './analysis-workshop';
import { AnalysisHairMap } from './analysis-hair-map';
import { AnalysisBodyMap } from './analysis-body-map';
import { AnalysisResults } from './analysis-results';
import { AnalysisArtwork, ChoiceCard } from './analysis-choice';
import { AnalysisStepMotion, type AnalysisMotion } from './analysis-step-motion';
import { Icon } from './icons';
import { useSiteSettings } from './site-settings-provider';

type Step = {
  id: 'audience'|'topic'|'profile'|'scalp'|'goals'|'package'|'areas'|'contact'|'result';
  label: string; title: string; intro?: string; choices?: Choice[]; value?: string; art?: string; ready?: boolean;
};
const initial: AnalysisAnswers={audience:'',topic:'skin',profile:'',profileNote:'',goals:[],note:'',packageId:'',areas:[],areaNote:''};
const toggled=(ids:string[],v:string)=>ids.includes(v)?ids.filter(id=>id!==v):[...ids,v];

export function Quiz() {
  const {settings:{branding}}=useSiteSettings();
  const [stepIndex,setStep]=useState(0);
  const [a,setAnswers]=useState(initial);
  const [pickedTopic,setPickedTopic]=useState(false);

  const [samples,setSamples]=useState<Sample[]>([]);
  const request=useRef<AbortController|null>(null),timer=useRef<number|undefined>(undefined);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [name,setName]=useState(''),[phone,setPhone]=useState('');
  const [fault,setFault]=useState(''),[busy,setBusy]=useState(false);
  const [save,setSave]=useState<AnalysisSave>({state:'preview'});
  const [motion,setMotion]=useState<AnalysisMotion|null>(null);
  const panel=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null),fileInput=useRef<HTMLInputElement>(null);
  const submissionId=useRef(''),saving=useRef(false);
  const guide=guides[a.topic], goals=guide.groups.flatMap(group=>group.goals);
  const hair = a.topic === 'hair';
  const scalp = a.scalpConditions ?? [];
  const lastArea = a.areas.at(-1);
  const steps: Step[] = [
    {id:'audience', label:'محل استفاده', title:'برای خونه محصول می‌خوای یا برای کار حرفه‌ایت؟',
      intro:'جایی رو انتخاب کن که می‌خوای از محصول استفاده کنی.', choices:audiences, value:a.audience, art:'chair', ready:!!a.audience},
    {id:'topic', label:'انتخاب موضوع', title:'از پوستت شروع کنیم یا موهات؟', intro:'یکی رو انتخاب کن تا بریم سراغ سؤال‌هاش.',
      choices:topics.map(t=>({...t,art:t.id})), value:pickedTopic?a.topic:'', ready:pickedTopic},
    {id:'profile', label:'مشخصات', title:guide.profileQuestion, intro:'نزدیک‌ترین گزینه رو انتخاب کن. اگه لازمه، پایینش بیشتر توضیح بده.',
      choices:guide.profiles, value:a.profile, ready:!!a.profile && (a.profile!=='other'||!!a.profileNote.trim())},
    ...(hair ? [{id:'scalp' as const, label:'وضعیت پوست سر', title:'پوست سرت معمولاً چه حالیه؟',
      intro:'هر گزینه‌ای که به پوست سرت می‌خوره انتخاب کن. اگه نمی‌دونی، «مطمئن نیستم» رو بزن.',
      choices:scalpChoices, value:scalp.at(-1), art:'follicle', ready:scalp.length>0 || !!a.scalpNote?.trim()}] : []),
    {id:'goals', label:'دغدغه‌ها', title:guide.goalQuestion, intro:'می‌تونی چند گزینه رو انتخاب کنی یا با کلمات خودت بنویسی چی اذیتت می‌کنه.',
      choices:goals, value:a.goals.at(-1), ready:!!(a.goals.length||a.note.trim())},
    {id:'package', label:'بستهٔ پیشنهادی', title:'کدوم بسته رو ترجیح می‌دی؟', intro:'توی بسته‌ی اقتصادی، محصول‌های به‌صرفه‌تر رو می‌بینی. بسته‌ی پیشرفته تنوع بیشتری داره.',
      choices:packages, value:a.packageId, art:'coins', ready:!!a.packageId},
    {id:'areas', label:'ناحیه', title:hair?'کدوم قسمت از موهات یا پوست سرت درگیره؟':'کجای بدنت درگیره؟',
      intro:hair?'روی مدل یا اسم هر قسمت بزن. می‌تونی چند جا رو با هم انتخاب کنی.':'هر جایی رو که درگیره انتخاب کن.',
      choices:hair?hairChoices:skinAreas, value:lastArea, art:hair?(hairAreas.scalp.some(area=>area.id===lastArea)?'hair':'follicle'):'front', ready:!!a.areas.length},
    {id:'contact', label:'عکس و ثبت', title:'می‌خوای بعداً این پیشنهادها رو پیگیری کنی؟',
      intro:'اگه می‌خوای درخواستت ذخیره بشه، شماره موبایلت رو وارد کن. برای دیدن پیشنهادهای نمونه می‌تونی مستقیم بری مرحله‌ی بعد.', ready:true},
    {id:'result', label:'نتیجه', title:'این محصول‌ها رو برات انتخاب کردیم'},
  ];
  const step = steps[stepIndex];
  const {id:stage, title, intro:desc, art=a.topic, ready} = step;
  const selected = step.choices?.find(item => item.id === step.value);

  function update<K extends keyof AnalysisAnswers>(key:K,value:AnalysisAnswers[K]) {
    submissionId.current=''; setFault('');setAnswers(current=>({...current,[key]:value}));
  }
  function pick(id:string) {
    if(stage==='audience') update('audience',id);
    if(stage==='topic') {
      if(!pickedTopic || id!==a.topic) {
        setAnswers(current=>({...current,topic:id as Topic,profile:'',profileNote:'',scalpConditions:undefined,scalpNote:undefined,goals:[],note:'',areas:[],areaNote:''}));
        setFile(null);setPreview(''); submissionId.current='';
      }
      setPickedTopic(true);
    }
    if(stage==='profile') update('profile',id);
    if(stage==='scalp') {
      const previous = id==='unsure' ? scalp.filter(v=>v==='unsure') : scalp.filter(v=>v!=='unsure');
      const nextScalp = toggled(previous,id);
      update('scalpConditions',nextScalp.length ? nextScalp : undefined);
    }
    if(stage==='goals') update('goals',toggled(a.goals,id));
    if(stage==='package') update('packageId',id);
    if(stage==='areas') update('areas',toggled(a.areas,id));
  }
  function next() {
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setStep(s=>s+1);return;}
    const box=panel.current?.getBoundingClientRect();
    if(!box){setStep(s=>s+1);return;}
    const origin=panel.current?.querySelector(selected?`input[value="${selected.id}"]:checked + span`:'.analysis-write-in, .analysis-upload')?.getBoundingClientRect();
    const top=Math.max(0,box.top),bottom=Math.min(window.innerHeight,box.bottom);
    const item=selected ?? {id:'written',label:'توضیح تو'};
    setMotion({topic:a.topic,answer:item.id,item:{...item,art:item.art??art},offsetX:origin?origin.left+origin.width/2-box.left-box.width/2:0,
      offsetY:origin?Math.max(top,Math.min(bottom,origin.top+origin.height/2))-(top+bottom)/2:0,insetTop:top-box.top,insetBottom:box.bottom-bottom});
  }
  useEffect(()=>{
    if(!motion)return;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;setMotion(null);setStep(s=>s+1);};
    const timer=window.setTimeout(finish,780);
    const skip=()=>{if(media.matches){window.clearTimeout(timer);finish();}};
    media.addEventListener('change',skip);return()=>{window.clearTimeout(timer);media.removeEventListener('change',skip);};
  },[motion]);
  useEffect(()=>{if(stepIndex){heading.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}},[stepIndex]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  useEffect(()=>()=>{window.clearTimeout(timer.current);request.current?.abort();},[]);
  function selectPhoto(f?:File) {
    if(!f)return;
    if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024||f.size===0){setFault('یک عکس JPG، PNG یا WebP تا ۱۰ مگابایت انتخاب کن.');return;}
    setFile(f);setPreview(URL.createObjectURL(f));setFault('');submissionId.current='';
  }
  async function saveSubmission(signal:AbortSignal) {
    const mobile=normalizeIranianMobile(phone);
    if(!mobile){setSave({state:'preview'});return;}
    setSave({state:'saving'});
    try{
      if(!submissionId.current)submissionId.current=crypto.randomUUID();
      const form=new FormData();
      form.set('submission',JSON.stringify({id:submissionId.current,answers:a,name:name.trim(),phone:mobile}));
      if(file)form.set('photo',file);
      const outcome=await api<AnalysisOutcome>('/analyses',{method:'POST',body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
      if(!signal.aborted)setSave(outcome.id===submissionId.current ? {state:'saved',id:outcome.id} : {state:'unconfirmed'});
    }catch{if(!signal.aborted)setSave({state:'unconfirmed'});}
  }
  function advance() {
    if(!ready||motion||saving.current)return;
    if(stage!=='contact'){next();return;}
    saving.current=true;setFault('');setBusy(true);
    window.scrollTo({top:0,behavior:'instant'});
    const controller=new AbortController();
    request.current=controller;
    setSamples(previewSamples(a));
    timer.current=window.setTimeout(()=>{
      saving.current=false;setBusy(false);setStep(s=>s+1);
    },7000);
    void saveSubmission(controller.signal);
    void loadSamples(a,AbortSignal.any([controller.signal,AbortSignal.timeout(6500)])).then(items=>{
      if(!controller.signal.aborted)setSamples(items);
    }).catch(()=>{/* Keep the bundled examples when the catalog is unavailable. */});
  }
  function restart(){
    request.current?.abort();request.current=null;window.clearTimeout(timer.current);
    saving.current=false;setBusy(false);setAnswers(initial);setPickedTopic(false);setSave({state:'preview'});setSamples([]);
    setFile(null);setPreview('');setName('');setPhone('');submissionId.current='';setFault('');setStep(0);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function card(item:Choice,large=false) {
    const multiple = stage==='scalp' ? scalp : stage==='goals' ? a.goals : undefined;
    const checked = multiple ? multiple.includes(item.id) : step.value===item.id;
    return <ChoiceCard key={item.id} item={item} selected={checked} onChange={()=>pick(item.id)} multiple={!!multiple} group={'step-'+stage} large={large} art={art}/>;
  }
  return <div className="analysis-shell"><div className="analysis-top">
    <Link href="/" className="analysis-wordmark"><Image src={branding.logo} alt={branding.logoAlt} width={166} height={30}/></Link>
    <Link href="/" className="analysis-exit">بازگشت به خانه <Icon name="close" size={17}/></Link>
  </div><section ref={panel} className="analysis-panel" aria-labelledby="analysis-question" aria-busy={!!motion}>
    {busy?<AnalysisWorkshop/>:<>
    {motion && <AnalysisStepMotion motion={motion}/>}
    <div className="analysis-progress"><span role="status">مرحلهٔ {formatNumber(stepIndex+1)} از {formatNumber(steps.length)} <span className="analysis-step-name">· {step.label}</span></span>
      <div className="analysis-segments" aria-hidden="true">{steps.map((s,i)=><i key={s.id} className={i<=stepIndex?'filled':''}/>)}</div></div>
    <div key={stage} className="analysis-question-body" inert={!!motion||busy} data-arrived={stepIndex>0||undefined}>
      <h1 id="analysis-question" ref={heading} tabIndex={-1}>{title}</h1>{desc && <p className="analysis-intro">{desc}</p>}
      {stage==='areas' ? (hair ? <AnalysisHairMap selected={a.areas} onToggle={pick}/> : <AnalysisBodyMap selected={a.areas} onToggle={pick}/>) :
       stage==='scalp'||stage==='goals' ? <div className="analysis-hair-problems">{(stage==='scalp'?scalpGroups:guide.groups).map(group=>
         <fieldset key={group.label} className="analysis-concern-group"><legend>{group.label}</legend><div>{('choices' in group?group.choices:group.goals).map(item=>card(item))}</div></fieldset>)}</div> :
       step.choices && <fieldset className={stage==='audience'||stage==='topic'?'analysis-topics analysis-pair':stage==='package'?'analysis-options analysis-packages':'analysis-options'}>
          <legend className="analysis-sr">{title}</legend>{step.choices.map(item=>card(item,stage==='audience'||stage==='topic'))}
        </fieldset>}
      {stage==='profile' && <label className="analysis-write-in">توضیح بیشتر دربارهٔ {topics.find(t=>t.id===a.topic)?.label} {a.profile!=='other'&&<small>(اختیاری)</small>}
        <textarea value={a.profileNote} onChange={e=>update('profileNote',e.target.value)} dir="auto" maxLength={800} rows={2}/></label>}
      {stage==='scalp' && <label className="analysis-write-in">چیز دیگه‌ای دربارهٔ پوست سرت هست؟ <small>(اختیاری)</small>
        <textarea value={a.scalpNote??''} onChange={e=>update('scalpNote',e.target.value)} dir="auto" maxLength={800} rows={2}/></label>}
      {stage==='goals' && <label className="analysis-write-in">توضیح بیشتر دربارهٔ مشکل <small>(اختیاری)</small>
        <textarea value={a.note} onChange={e=>update('note',e.target.value)} dir="auto" maxLength={800} rows={3} placeholder="از کی شروع شد؟ چیز دیگه‌ای هم هست که بخوای بگی؟"/></label>}
      {stage==='contact' && <>
        <div className="analysis-upload"><AnalysisArtwork item={{id:'photo',label:'',art:'camera'}} fallback="camera"/>
          <div><strong>{file?'عکس انتخاب‌شده':'عکس ناحیهٔ موردنظر'}</strong><p>JPG، PNG یا WebP · حداکثر ۱۰ مگابایت</p>
          <button type="button" className="analysis-file-button" onClick={()=>fileInput.current?.click()}>{file?'انتخاب عکس دیگر':'انتخاب عکس'}</button>
          {file && <button type="button" className="analysis-back" onClick={()=>{setFile(null);setPreview('');setFault('');submissionId.current='';}}>حذف عکس</button>}
          <input type="file" ref={fileInput} hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{selectPhoto(e.target.files?.[0]);e.target.value='';}}/></div>
          {file && preview && <Image className="analysis-photo-preview" src={preview} unoptimized width={120} height={120} alt="پیش‌نمایش عکس انتخاب‌شده"/>}
        </div>
        <p className="analysis-private">اگر شمارهٔ موبایل وارد کنی، پاسخ‌ها و عکس اختیاری‌ات برای بررسی خصوصی تیم پوستیکال ارسال می‌شوند.</p>
        <div className="analysis-contact"><label className="analysis-write-in">نام <small>(اختیاری)</small><input dir="auto" autoComplete="name" maxLength={80} value={name} onChange={e=>{setName(e.target.value);submissionId.current='';}}/></label>
        <label className="analysis-write-in">شمارهٔ موبایل <small>(برای ذخیره و پیگیری)</small>
          <input type="tel" dir="ltr" autoComplete="tel" inputMode="tel" maxLength={24} value={phone}
            onChange={e=>{setPhone(e.target.value);setFault('');submissionId.current='';}}/>
        </label></div>
      </>}
      {stage==='result' && <AnalysisResults answers={a} save={save} retrySave={()=>{if(request.current)void saveSubmission(request.current.signal);}} samples={samples} onSamplesChange={setSamples} onRestart={restart}/>}
    </div>{fault && <p role="alert" className="analysis-error">{fault}</p>}
    {stage!=='result' && <div className="analysis-actions">{stepIndex>0 && <button className="analysis-back" disabled={!!motion||busy} onClick={()=>{setFault('');setStep(s=>s-1);}}><Icon name="arrow-right" size={16}/>مرحلهٔ قبل</button>}
      <button className="analysis-next" disabled={!ready||!!motion||busy} onClick={()=>void advance()}>{stage==='contact'?'دریافت پیشنهادها':'مرحلهٔ بعد'} <Icon name="arrow-left" size={18}/></button></div>}</>}
  </section></div>;
}
