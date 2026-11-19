import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {PaymentConfirmation} from '@/components/payment-confirmation';
export const metadata:Metadata={title:'پرداخت و پیگیری سفارش',description:'پیگیری سفارش و وضعیت رسید پرداخت شما.',robots:{index:false,follow:false}};
export default async function ConfirmedOrder({params}:{params:Promise<{number:string}>}){
  const {number}=await params;if(!/^\d{6}$/.test(number))notFound();
  return <main id="main-content" className="cart-page checkout-page container"><PaymentConfirmation number={number}/></main>;
}
