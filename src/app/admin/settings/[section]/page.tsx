import {BankSettings} from '@/components/admin/bank-settings';
import {notFound} from 'next/navigation';
import {SiteSettingsEditor} from '@/components/admin/site-settings-editor';
import {AdminAISettings} from '@/components/admin/admin-ai-settings';
import {AdminSMSSettings,AdminServiceKey} from '@/components/admin/admin-service-settings';
import {AdminRaboteb} from '@/components/admin/admin-raboteb';
import {defaultSiteSettings,type SiteSection} from '@/lib/site-settings';
export default async function Page({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(section==='raboteb')return <AdminRaboteb/>;
 if(section==='payment')return <BankSettings/>;
 if(section==='sms')return <AdminSMSSettings/>;
 if(section==='openrouter')return <div className="settings-service-stack"><AdminServiceKey/><AdminAISettings/></div>;
 if(!Object.hasOwn(defaultSiteSettings,section))notFound();
 return <SiteSettingsEditor key={section} section={section as SiteSection}/>;
}
