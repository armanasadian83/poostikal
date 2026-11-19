import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {CustomerAccount} from '@/components/customer-account';
export const metadata:Metadata={title:'حساب کاربری من',description:'مدیریت مشخصات، نشانی‌ها، سفارش‌ها و فیش‌های واریزی حساب شما.',robots:{index:false,follow:false}};
export default async function MyAccountPage({params}:{params:Promise<{section?:string[]}>}){
  const {section=[]}=await params;
  const tab=section[0]??'profile',number=section[1];
  if(!['profile','addresses','orders','receipts'].includes(tab)||(section.length&&tab==='profile')||section.length>2||(number&&(tab!=='orders'||!/^\d{6}$/.test(number))))notFound();
  return <CustomerAccount key={section.join('/')||'profile'} tab={tab as 'profile'|'addresses'|'orders'|'receipts'} number={number}/>;
}
