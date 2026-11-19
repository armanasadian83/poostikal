'use client';
import Link from 'next/link';
import {useCatalog} from './catalog-provider';
import {catalogCategoryHref} from '@/lib/catalog';
import {useUI} from './ui-context';
import { SkinAnalysisLink } from './chat-transition';
export function SiteSettingLink({href,label,className,onNavigate}:{href:string;label:string;className?:string;onNavigate?:()=>void}){
 const {openPanel}=useUI();const {categoryOptions}=useCatalog();
 const panel=href.slice(1);
 if(href==='#brands')return <Link href="/brands" className={className} onClick={onNavigate}>{label}</Link>;
 // Old saved menus used a dialog anchor before the dedicated About page existed.
 if(href==='#about')return <Link href="/about-us" className={className} onClick={onNavigate}>{label}</Link>;
 if(href==='#quiz'||href==='/skin-analysis')return <SkinAnalysisLink className={className} onClick={onNavigate}>{label}</SkinAnalysisLink>;
 if(href.startsWith('#')&&['saved','search'].includes(panel))return <button className={className} onClick={()=>{onNavigate?.();openPanel(panel as 'saved'|'search');}}>{label}</button>;
 const category=href.match(/^\/shop\?category=(home-care|salon|equipment)$/)?.[1];
 const target=category?catalogCategoryHref(categoryOptions,category as 'home-care'|'salon'|'equipment'):href;
 return <Link href={target} className={className} onClick={onNavigate}>{label}</Link>;
}
