'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import type { Product, CatalogBrand } from '@/lib/catalog';
import { useStore } from '@/lib/store';
type Category = { id: string; name: string; slug: string };
const Context = createContext({ products: [] as Product[], brands: [] as CatalogBrand[], categories: [] as Category[], categoryOptions: [{ id: 'all', label: 'همهٔ محصولات' }], loading: true, error: '', refresh: () => {} });
type Taxonomy = { categories: Category[]; brands: CatalogBrand[] };
export function CatalogProvider({ children, initial }: { children: ReactNode; initial?: Taxonomy }) {
  const [data,setData]=useState({products:[] as Product[],brands:initial?.brands ?? [],categories:initial?.categories ?? []});
  const [loading,setLoading]=useState(!initial);const [error,setError]=useState('');const pathname=usePathname();
  const {cart,saved}=useStore(); const ids=[...new Set([...cart.map(line=>line.productId),...saved])].slice(0,100).join(',');
  const refresh=useCallback(()=>{ const controller=new AbortController();
    Promise.all([api<{items:Product[]}>('/products?limit=24',{signal:controller.signal}),api<{brands:CatalogBrand[],categories:Category[]}>('/catalog',{signal:controller.signal}),ids?api<{items:Product[]}>(`/products?limit=100&ids=${encodeURIComponent(ids)}`,{signal:controller.signal}):Promise.resolve({items:[] as Product[]})]).then(([products,taxonomy,selected])=>{setData({products:[...new Map([...products.items,...selected.items].map(p=>[p.id,p])).values()],...taxonomy});setError('');}).catch(err=>{if(err.name!=='AbortError')setError('دریافت محصولات انجام نشد. دوباره امتحان کن.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[ids]);
  useEffect(()=>{if(pathname.startsWith('/admin'))return;return refresh();},[pathname,refresh]);
  return <Context.Provider value={{...data,categoryOptions:[{id:'all',label:'همهٔ محصولات'},...data.categories.map(c=>({id:c.id,label:c.name}))],loading,error,refresh}}>{children}</Context.Provider>;
}
export const useCatalog=()=>useContext(Context);
