import 'server-only';
import {cache} from 'react';
import {defaultSiteSnapshot,completeSiteSnapshot,type SiteSnapshot} from './site-settings';
export const getServerSiteSettings=cache(async():Promise<SiteSnapshot>=>{
  try {
    const response=await fetch(`${process.env.API_INTERNAL_URL||'http://127.0.0.1:4000'}/api/site-settings`,{cache:'no-store',signal:AbortSignal.timeout(2500)});
    if(response.ok)return completeSiteSnapshot(await response.json());
  } catch { /* The default content still renders when the API is unavailable. */ }
  return { ...defaultSiteSnapshot, settings: { ...defaultSiteSnapshot.settings,
    branding: { ...defaultSiteSnapshot.settings.branding, searchIndexing: false } } };
});
