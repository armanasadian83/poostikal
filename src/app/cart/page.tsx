import {CartAccess} from '@/components/cart-access';
import type { Metadata } from 'next';
import { ShoppingCart } from '@/components/shopping-cart';

export const metadata: Metadata = { title: 'سبد خرید', description: 'مشاهده و ویرایش اقلام سبد خرید شما.', robots: { index: false, follow: false } };

export default function CartPage() {
  return <main id="main-content" className="cart-page container"><CartAccess><ShoppingCart/></CartAccess></main>;
}
