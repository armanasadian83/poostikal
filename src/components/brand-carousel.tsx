'use client';

import {useMemo,useState} from 'react';
import {useCatalog} from './catalog-provider';
import {useSiteSettings} from './site-settings-provider';
import {BrandOrbit} from './brand-orbit';
import {Icon} from './icons';
import {formatNumber} from '@/lib/format';
import {normalizeSearch} from '@/lib/search';

export function BrandCarousel({selected,onSelect}:{selected:string;onSelect:(brand:string)=>void}){
  const {brands,loading,error,refresh}=useCatalog();
  const {settings:{home}}=useSiteSettings();
  const [query,setQuery]=useState('');
  const items=useMemo(()=>{
    const artwork=home.brands.map(item=>{
      let name=item.name;
      try{name=new URL(item.href,'https://poostikal.invalid').searchParams.get('brand')||name;}catch{ /* Use the display name if the saved link is invalid. */ }
      return {...item,match:normalizeSearch(name)};
    });
    return brands.map(brand=>{
      const index=artwork.findIndex(item=>item.match===normalizeSearch(brand.name));
      return {...brand,label:brand.persianName||brand.name,image:brand.image||artwork[index]?.image||'',rank:index<0?artwork.length:index};
    }).sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name,'fa')).filter(brand=>normalizeSearch(`${brand.name} ${brand.label}`).includes(normalizeSearch(query)));
  },[brands,home.brands,query]);

  return <section className="brand-explorer" aria-labelledby="brand-explorer-title">
    <div className="brand-explorer-heading"><div><h2 id="brand-explorer-title">انتخابت از کدوم برنده؟</h2><p>{loading?'در حال دریافت برندها…':`${formatNumber(brands.length)} برند، برای سلیقهٔ تو`}</p></div>
      <label className="shop-search brand-explorer-search"><Icon name="search" size={19}/><input type="search" aria-label="پیدا کردن برند" placeholder="نام برندت رو پیدا کن…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <button type="button" className={`brand-explorer-all${!selected?' is-selected':''}`} aria-pressed={!selected} onClick={()=>onSelect('')}><Icon name="grid" size={17}/>همهٔ برندها</button>
    </div>
    {error?<div className="brand-explorer-error" role="alert"><p>برندها دریافت نشدند.</p><button className="shop-primary-button" onClick={refresh}>تلاش دوباره<Icon name="refresh" size={18}/></button></div>
      :loading&&!brands.length?<div className="brand-carousel brand-orbit-loading" aria-busy="true" aria-label="در حال دریافت برندها">{Array.from({length:3},(_,index)=><div className="brand-carousel-placeholder" key={index} aria-hidden="true"/>)}</div>
      :items.length?<BrandOrbit key={items.map(item=>item.id).join('|')} items={items} selected={selected} onSelect={onSelect}/>
      :<p className="brand-carousel-empty" role="status">{query?'برندی با این نام پیدا نشد.':'برندها به‌زودی اینجا قرار می‌گیرند.'}</p>}
    <div className="brand-explorer-caption"><span>{selected?<>انتخاب تو: <bdi>{selected}</bdi></>:'روی یک برند بزن تا محصولاتش رو ببینی.'}</span><span className="brand-explorer-line" aria-hidden="true"/><Icon name="sparkles" size={16}/></div>
  </section>;
}