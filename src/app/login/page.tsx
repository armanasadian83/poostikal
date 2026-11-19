import type { Metadata } from 'next';
import { PhoneLogin } from '@/components/phone-login';

export const metadata: Metadata = {
  title: 'ورود', robots: { index: false, follow: false },
  description: 'ورود به پوستیکال با شماره موبایل.',
};

export default async function LoginPage({searchParams}:{searchParams:Promise<{reason?:string|string[]}>}) {
  const {reason}=await searchParams;
  return <PhoneLogin shopping={reason==='shopping'||reason==='analysis-cart'} analysisPurchase={reason==='analysis-cart'}/>;
}
