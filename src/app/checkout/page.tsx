import {CartAccess} from '@/components/cart-access';
import type { Metadata } from 'next';
import { CheckoutPage } from '@/components/checkout-page';

export const metadata: Metadata = { title: 'تکمیل سفارش', description: 'ثبت نشانی، روش ارسال و تأیید سفارش شما.', robots: { index: false, follow: false } };

export default function Checkout() {
  return <main id="main-content" className="cart-page checkout-page container"><CartAccess><CheckoutPage/></CartAccess></main>;
}
