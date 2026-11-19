'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {ApiError} from '@/lib/api';
import {addToCart,requireCartSession,useStore} from '@/lib/store';
import type {Product} from '@/lib/catalog';
import {useUI} from './ui-context';
import {CartError,CartLoading} from './cart-feedback';

export function useAddToCart() {
  const router=useRouter(), {toast}=useUI();
  const lock=useRef(false), [pending,setPending]=useState(false);
  async function add(product:Product,variant:string,quantity=1) {
    if(lock.current)return;
    lock.current=true;setPending(true);
    try {
      const adjusted = await addToCart(product,variant,quantity);
      toast(adjusted ? 'سبدت با موجودی فعلی به‌روز شد.' : 'به سبد خریدت اضافه شد');
    } catch(error) {
      if(error instanceof ApiError && error.status===401) router.push('/login?reason=shopping');
      else toast(error instanceof Error && error.name === 'Error' ? error.message :
        error instanceof ApiError ? error.message : 'افزودن به سبد انجام نشد. دوباره تلاش کن.');
    } finally {lock.current=false;setPending(false);}
  }
  return {add,pending};
}

export function CartAccess({children}:{children:ReactNode}) {
  const router=useRouter(), {cartOwner}=useStore();
  const [account,setAccount]=useState(''), [error,setError]=useState(false), [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let request=new AbortController();
    async function check() {
      request.abort(); request=new AbortController();
      const {signal}=request;
      try {
        const id=await requireCartSession(signal);
        if(!signal.aborted){setAccount(id);setError(false);}
      } catch(e) {
        if(signal.aborted)return;
        setAccount('');
        if(e instanceof ApiError && e.status===401) router.replace('/login?reason=shopping');
        else setError(true);
      }
    }
    void check();
    return ()=>{request.abort();};
  },[router,attempt]);
  useEffect(()=>{
    if(account && !cartOwner) router.replace('/login?reason=shopping');
  },[account,cartOwner,router]);
  if(error)return <CartError error="بررسی وضعیت ورود انجام نشد." retry={()=>{setError(false);setAttempt(n=>n+1);}}/>;
  if(!account || !cartOwner)return <CartLoading/>;
  return <div key={cartOwner} style={{display:'contents'}}>{children}</div>;
}
