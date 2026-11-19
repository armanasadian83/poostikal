'use client';
import {createContext,useContext,useState,useCallback,useEffect,useMemo,type ReactNode} from 'react';
import {api} from '@/lib/api';
import {completeSiteSnapshot,type SiteSnapshot,type SiteSection,type SiteSettings} from '@/lib/site-settings';
type Value=SiteSnapshot & {refresh:()=>Promise<SiteSnapshot>;save:(section:SiteSection,value:SiteSettings[SiteSection],version:number)=>Promise<SiteSnapshot>};
const Context=createContext<Value|null>(null);
export const useSiteSettings=()=>{const value=useContext(Context);if(!value)throw new Error('Site settings are unavailable');return value;};
export function SiteSettingsProvider({initial,children}:{initial:SiteSnapshot;children:ReactNode}) {
  const [snapshot,setSnapshot]=useState(initial);
  const refresh=useCallback(async()=>{const value=completeSiteSnapshot(await api<SiteSnapshot>('/site-settings'));setSnapshot(previous=>value.version>previous.version||(value.version===previous.version&&JSON.stringify(value.store)!==JSON.stringify(previous.store))?value:previous);return value;},[]);
  const save=useCallback(async(section:SiteSection,value:SiteSettings[SiteSection],version:number)=>{
    const next=await api<SiteSnapshot>(`/admin/site-settings/${section}`,{method:'PUT',body:JSON.stringify({value,version})});
    setSnapshot(next);
    if('BroadcastChannel' in window){const channel=new BroadcastChannel('poostikal-settings');channel.postMessage(next.version);channel.close();}
    return next;
  },[]);
  useEffect(()=>{
    const update=()=>{if(!document.hidden)void refresh().catch(()=>{});};
    const channel='BroadcastChannel' in window?new BroadcastChannel('poostikal-settings'):null;
    if(channel)channel.onmessage=update;
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    const timer=setInterval(update,30000);
    return()=>{clearInterval(timer);channel?.close();window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[refresh]);
  const value=useMemo(()=>({...snapshot,save,refresh}),[snapshot,save,refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
