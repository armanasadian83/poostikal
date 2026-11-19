import Link from 'next/link';
export const metadata = { title: 'صفحه پیدا نشد', description: 'این صفحه در فروشگاه پوستیکال پیدا نشد.', robots: { index: false, follow: false } };
export default function NotFound() { return <main id="main-content" className="empty-page"><span className="empty-number">۴۰۴</span><h1>این صفحه رو پیدا نکردیم.</h1><p>شاید محصول مورد نظرت جای دیگه‌ای منتظرت باشه.</p><Link className="button primary" href="/shop">دیدن محصولات</Link></main>; }
