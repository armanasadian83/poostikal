'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const phases=['مرتب‌کردن پاسخ‌های تو','پیدا کردن محصولات مرتبط','آماده‌کردن دلیل هر انتخاب'];
function Robot({inspector=false}:{inspector?:boolean}) {
  return <div className={'lab-bot'+(inspector?' lab-inspector':'')}>
    <div className="lab-antenna"/><div className="lab-head"><span className="lab-visor"><i/><i/></span></div>
    <div className="lab-torso"><Icon name="lips" size={19}/></div><div className="lab-arm"><Icon name={inspector?'search':'clipboard'} size={18}/></div>
    <i className="lab-foot"/>
  </div>;
}
export function AnalysisWorkshop() {
  const [phase,setPhase]=useState(0);
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    title.current?.focus({preventScroll:true});
    const timers=[window.setTimeout(()=>setPhase(1),2300),window.setTimeout(()=>setPhase(2),4800)];
    return()=>timers.forEach(t=>window.clearTimeout(t));
  },[]);
  return <div className="analysis-workshop">
    <div className="lab-scene" aria-hidden="true">
      <div className="lab-halo"/><div className="lab-line"><i/><i/><i/></div>
      <Robot inspector/><div className="lab-specimen"><Icon name={phase===0?'clipboard':phase===1?'pump':'bag'} size={31}/></div><Robot/>
    </div>
    <h1 id="analysis-question" ref={title} tabIndex={-1}>پوستیکال داره برات انتخاب می‌کنه</h1>
    <p>در این پیش‌نمایش هوش مصنوعی، ربات‌های پوستیکال پاسخ‌هایت را بررسی می‌کنند و محصولات مرتبط با نیازت را کنار هم می‌چینند.</p>
    <div className="lab-progress" aria-hidden="true">{phases.map((label,i)=><i key={label} className={i<=phase?'active':''}/>)}</div>
    <small role="status" aria-live="polite">{phases[phase]}</small>
  </div>;
}
