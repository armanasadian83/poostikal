'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Product } from '@/lib/catalog';
import { Icon } from './icons';

type LabelPhoto = NonNullable<Product['images']>[number] & {labelSide:'front'|'back'};

// These two gallery slots keep their role when their media file is replaced.
export function productLabelPhotos(images:Product['images']):LabelPhoto[] {
  return (images??[]).flatMap((photo):LabelPhoto[]=>{
    if(photo.id==='package-label-front')return [{...photo,labelSide:'front'}];
    if(photo.id==='package-label-back')return [{...photo,labelSide:'back'}];
    return [];
  });
}

export function ProductLabelReader({photos, initialSide, returnFocus, onDismiss}:{
  photos: LabelPhoto[]; initialSide:'front'|'back'; returnFocus:RefObject<HTMLButtonElement|null>; onDismiss:()=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const scrollArea=useRef<HTMLDivElement>(null);
  const [index,setIndex]=useState(()=>Math.max(0,photos.findIndex(p=>p.labelSide===initialSide)));
  const [tab,setTab]=useState<'text'|'photo'>(photos[index].description?'text':'photo');
  const [zoom,setZoom]=useState(false);
  const titleId=useId(),photo=photos[index];
  useEffect(()=>{
    const el=dialog.current!;
    const previous=document.body.style.overflow;
    el.showModal(); document.body.style.overflow='hidden';
    const opener=returnFocus.current;
    return ()=>{el.close();document.body.style.overflow=previous;opener?.focus({preventScroll:true});};
  },[returnFocus]);
  function select(i:number){setIndex(i);setZoom(false);if(!photos[i].description)setTab('photo');scrollArea.current?.scrollTo(0,0);}
  function switchTab(t:'text'|'photo'){setTab(t);setZoom(false);scrollArea.current?.scrollTo(0,0);}
  return <dialog ref={dialog} className="product-label-dialog" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onDismiss();}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onDismiss();}}}>
    <header className="product-label-head"><h2 id={titleId}>برچسب محصول</h2><button type="button" autoFocus onClick={onDismiss} aria-label="بستن"><Icon name="close"/></button></header>
    <div className="product-label-controls"><div role="group" aria-label="سمت بطری">{photos.map((item,i)=><button type="button" key={item.id} aria-pressed={i===index} onClick={()=>select(i)}>{item.labelSide==='back'?'پشت بطری':'روی بطری'}</button>)}</div>
      <div role="group" aria-label="نحوهٔ نمایش">{photo.description&&<button type="button" aria-pressed={tab==='text'} onClick={()=>switchTab('text')}>متن برچسب</button>}<button type="button" aria-pressed={tab==='photo'} onClick={()=>switchTab('photo')}>تصویر برچسب</button></div></div>
    <div className="product-label-body" ref={scrollArea} tabIndex={0} aria-label={tab==='text'?'متن روی بسته‌بندی':'نمای نزدیک برچسب'}>
      {tab==='text'?<article className="product-label-print" dir="auto" lang={/^[A-Za-z]/.test(photo.description)?'en':undefined}>{photo.description.split(/\n\s*\n/).filter(Boolean).map((block,i)=>{
        const [first,...rest]=block.split('\n');
        return rest.length?<section key={i}><h3>{first}</h3><p>{rest.join(' ')}</p></section>:<p key={i}>{first}</p>;
      })}</article>:<><button type="button" className="product-label-scale" aria-pressed={zoom} onClick={()=>setZoom(z=>!z)}><Icon name={zoom?'minus':'plus'} size={15}/>{zoom?'اندازهٔ معمولی':'بزرگ‌نمایی عکس'}</button>
        <div className="product-label-photo" data-zoom={zoom}><Image unoptimized src={photo.url} alt={photo.alt} width={640} height={1640}/></div></>}
    </div>
  </dialog>;
}
