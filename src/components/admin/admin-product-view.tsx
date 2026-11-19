'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import type {Product} from '@/lib/catalog';
import {BannerBackdrop} from '@/components/banner-backdrop';
import {ProductDetail} from '@/components/product-detail';
import {useAdmin} from './admin-provider';
import {AdminIcon} from './admin-icon';
import {AdminPageHeading,AdminPanel} from './admin-ui';
export function AdminProductView({productId}:{productId:string}){
 const {categories}=useAdmin();
 const [product,setProduct]=useState<Product|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();api<Product>('/admin/products/'+encodeURIComponent(productId)+'/preview',{signal:c.signal}).then(setProduct).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[productId]);
 return <><AdminPageHeading title="نمایش محصول" description="همان نمایش فروشگاه، در پنل مدیریت. خرید و لینک‌های فروشگاه در این پیش‌نمایش غیرفعال‌اند." action={<div className="admin-row-actions"><Link href={'/admin/products/'+encodeURIComponent(productId)+'/edit'} className="admin-button admin-button-primary"><AdminIcon name="edit" size={18}/>ویرایش محصول</Link><Link href="/admin/products" className="admin-button">همه محصولات</Link></div>}/>
 {error?<AdminPanel><p role="alert" className="admin-form-error">{error}</p></AdminPanel>:product?<div className="admin-product-preview themed-product-shell" onClickCapture={e=>{if((e.target as HTMLElement).closest('a'))e.preventDefault();}}><BannerBackdrop/><ProductDetail product={product} preview categoryLabel={categories.find(c=>c.id===product.category)?.name}/></div>:<AdminPanel>در حال آماده‌سازی پیش‌نمایش…</AdminPanel>}</>;
}
