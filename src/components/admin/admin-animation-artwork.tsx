'use client';

import Image from 'next/image';
import { useRef, type PointerEvent } from 'react';
import type { AdminAnimationConfig } from '@/lib/admin-product-model';
import { appearanceForTemplate, defaultArtwork, type ArtworkPoint, type ArtworkSelection } from '@/lib/animation-config';

const slotNames = {closed:'بسته‌بندی بسته',open:'بسته‌بندی باز',product:'محصول بیرون از جعبه',angle:'زاویهٔ دیگر'};
const cornerNames = ['بالا چپ','بالا راست','پایین راست','پایین چپ'];
const clamp = (n:number) => Math.max(0,Math.min(1,n));

function ArtworkCrop({ title, selection, animation, onChange }: { title:string; selection:ArtworkSelection; animation:AdminAnimationConfig; onChange:(value:ArtworkSelection)=>void }) {
  const frame = useRef<HTMLDivElement>(null);
  const image = animation.references.find(ref=>ref.slot===selection.slot)?.image;
  const points = selection.corners;
  function move(index:number,point:ArtworkPoint) {
    onChange({...selection,corners:points.map((old,i)=>i===index?point:old) as ArtworkSelection['corners']});
  }
  function drag(event:PointerEvent<HTMLButtonElement>,index:number) {
    if(!event.currentTarget.hasPointerCapture(event.pointerId)||!frame.current)return;
    const box=frame.current.getBoundingClientRect();
    move(index,[clamp((event.clientX-box.left)/box.width),clamp((event.clientY-box.top)/box.height)]);
  }
  const path=points.map(([x,y],i)=>`${i?'L':'M'}${x*1000} ${y*1000}`).join(' ')+'Z';
  const valid=points.every((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>.0005;});
  return <section className="admin-artwork-card">
    <div className="admin-artwork-heading"><h4>{title}</h4><label className="admin-form-field"><span>عکس مرجع</span><select className="admin-field" value={selection.slot} onChange={e=>onChange({...selection,slot:e.target.value as ArtworkSelection['slot']})}>{Object.entries(slotNames).map(([slot,name])=><option key={slot} value={slot}>{name}</option>)}</select></label></div>
    {image?<div ref={frame} className="admin-artwork-crop" dir="ltr">
      <Image src={image.url} alt={image.alt||title} width={640} height={850} unoptimized draggable={false}/>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path d={`M0 0H1000V1000H0Z ${path}`} fill="var(--tone-1241)" fillRule="evenodd"/><path d={path} fill="none" stroke="var(--tone-1242)" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
      {points.map(([x,y],index)=><button type="button" className="admin-crop-handle" key={index} style={{left:`${x*100}%`,top:`${y*100}%`}} aria-label={`${title} · گوشهٔ ${cornerNames[index]}`} title={cornerNames[index]}
        onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>drag(e,index)} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onKeyDown={e=>{const step=e.shiftKey ? .01 : .002;const delta:Record<string,ArtworkPoint>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};if(delta[e.key]){e.preventDefault();move(index,[clamp(x+delta[e.key][0]),clamp(y+delta[e.key][1])]);}}}>{index+1}</button>)}
    </div>:null}
    <p className="admin-small admin-muted">چهار گوشهٔ نوشته و طرح چاپی را مشخص کن؛ دست، لبهٔ جعبه و پس‌زمینه بیرون محدوده بمانند. با کلیدهای جهت هم می‌توانی گوشه‌ها را تنظیم کنی.</p>
    {!valid?<p className="admin-form-error" role="alert">گوشه‌ها نباید از هم عبور کنند. ترتیب: بالا چپ، بالا راست، پایین راست، پایین چپ.</p>:null}
  </section>;
}

export function AdminAnimationArtwork({animation,onChange}:{animation:AdminAnimationConfig;onChange:(value:AdminAnimationConfig)=>void}) {
  const artwork=animation.artwork??defaultArtwork();
  const appearance=animation.appearance??appearanceForTemplate(animation.template);
  const pouch=animation.template==='pouch-box';
  return <div className="admin-artwork-editor">
    <div className="admin-media-heading"><div><h4>طرح واقعی محصول، روی مدل سه‌بعدی</h4><p className="admin-small admin-muted">{pouch?'سطح جلوی جعبه و تمام نمای روبه‌روی پاکت را انتخاب کن. برای پاکت شفاف، عکس جداگانه با پس‌زمینهٔ سفید یا طرح چاپی تمیز بهترین نتیجه را می‌دهد؛ پس‌زمینهٔ عکس خودکار حذف نمی‌شود.':'روی عکس جعبه، فقط سطح روبه‌رو و روی عکس بطری، فقط برچسب را انتخاب کن. دو نمای دیگر برای بررسی فرم و رنگ در دسترس‌اند.'}</p></div></div>
    <div className="admin-artwork-grid">{(['carton','label'] as const).map(surface=><ArtworkCrop key={surface} title={surface==='carton'?'طرح جلوی جعبه':pouch?'طرح روی پاکت':'برچسب محصول'} selection={artwork[surface]} animation={animation} onChange={value=>onChange({...animation,artwork:{...artwork,[surface]:value}})}/>)}</div>
    <h4>رنگ و جنس</h4><p className="admin-small admin-muted">رنگ قسمت‌های بدون چاپ و جنس ظرف را با محصول واقعی هماهنگ کن.</p>
    <div className="admin-animation-colors">{(pouch ? [{key:'carton',label:'جعبه'},{key:'base',label:'داخل جعبه'},{key:'bottle',label:'لبهٔ پاکت'}] as const : [{key:'carton',label:'جعبه'},{key:'base',label:'پایهٔ جعبه'},{key:'bottle',label:'ظرف'},{key:'cap',label:'درپوش'}] as const).map(({key,label})=><label key={key}><input type="color" value={appearance[key]} onChange={e=>onChange({...animation,appearance:{...appearance,[key]:e.target.value}})}/><span>{label}</span></label>)}</div>
    <div className="admin-animation-material"><label className="admin-form-field"><span>{pouch?'روکش پاکت':'جنس ظرف'}</span><select className="admin-field" value={appearance.material} onChange={e=>onChange({...animation,appearance:{...appearance,material:e.target.value as 'glass'|'opaque'}})}><option value="glass">{pouch?'براق با روکش شفاف':'شیشه‌ای'}</option><option value="opaque">{pouch?'مات / چاپی':'مات / پلاستیکی'}</option></select></label>{!pouch ? <label className="admin-review-confirm"><input type="checkbox" checked={appearance.seal} onChange={e=>onChange({...animation,appearance:{...appearance,seal:e.target.checked}})}/><span>جعبه نوار پلمپ دارد</span></label> : null}</div>
  </div>;
}
