import type { Metadata } from 'next';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { orderStatusLabels, type AdminOrder } from '@/lib/admin-preview';
import { formatNumber, formatPrice } from '@/lib/format';
import { getServerSiteSettings } from '@/lib/server-site-settings';
import { InvoiceActions } from './invoice-actions';
import styles from './invoice.module.css';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `فاکتور فروش ${id}`, robots: { index: false, follow: false } };
}

export default async function OrderInvoicePage({ params }: PageProps) {
  const { id } = await params;
  const session = (await cookies()).get('poostikal_admin');
  if (!session) redirect('/admin');
  const origin = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
  const response = await fetch(origin + '/api/admin/orders/' + encodeURIComponent(id), {
    headers: { Cookie: 'poostikal_admin=' + encodeURIComponent(session.value) },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) redirect('/admin');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('دریافت فاکتور سفارش انجام نشد.');
  const order: AdminOrder = await response.json();
  const { store, settings: { branding } } = await getServerSiteSettings();
  const recipient = order.recipient;
  const address = [recipient?.province, recipient?.city, recipient?.address].filter(Boolean).join('، ');
  const discount = order.discountToman ?? 0;
  const note = recipient?.note || order.note;

  return <main id="main-content" dir="rtl" className={styles.page}>
    <InvoiceActions />
    <article className={styles.sheet} aria-labelledby="invoice-title">
      <header className={styles.heading}>
        <div><h1 id="invoice-title">فاکتور فروش</h1>
          <p className={styles.reference}>شماره سفارش <bdi dir="ltr">#{order.number ?? order.id}</bdi></p>
        </div>
        <div className={styles.seller}>
          <Image id="invoice-logo" className={styles.logo} src={branding.logo} alt={store.name} width={162} height={42} loading="eager" unoptimized />
          <p>فروشنده · {store.name}</p>
        </div>
      </header>
      <div className={styles.details}>
        <section><h2>گیرنده</h2>
          <div className={styles.contact}><strong>{recipient?.name || order.userName}</strong>
            {recipient?.phone && <span>موبایل <bdi dir="ltr">{recipient.phone}</bdi></span>}
          </div>
          {address && <p>{address}</p>}
          {recipient?.postalCode && <p>کد پستی <bdi dir="ltr">{recipient.postalCode}</bdi></p>}
        </section>
        <section><h2>مشخصات سفارش</h2><dl className={styles.facts}>
          <div><dt>تاریخ ثبت</dt><dd>{order.dateLabel}</dd></div>
          <div><dt>وضعیت سفارش</dt><dd>{orderStatusLabels[order.status]}</dd></div>
          {order.shipping?.name && <div><dt>روش ارسال</dt><dd>{order.shipping.name}</dd></div>}
        </dl>
        </section>
      </div>
      <table className={styles.items}>
        <caption><span>اقلام سفارش</span> <small>مبالغ به تومان</small></caption>
        <thead><tr><th scope="col">شرح کالا</th><th scope="col">تعداد</th><th scope="col">قیمت واحد</th><th scope="col">مبلغ</th></tr></thead>
        <tbody>{order.items.map((item, index) => <tr key={index}>
          <th scope="row"><bdi>{item.name}</bdi>{item.variantLabel && <small>{item.variantLabel}</small>}</th>
          <td>{formatNumber(item.quantity)}</td><td>{formatPrice(item.unitPriceToman)}</td><td>{formatPrice(item.unitPriceToman * item.quantity)}</td>
        </tr>)}</tbody>
      </table>
      <div className={styles.summary}>
        {note && <section className={styles.note}><h2>یادداشت سفارش</h2><p>{note}</p></section>}
        <dl className={styles.totals}>
          {discount > 0 && <>
            <div><dt>جمع پیش از تخفیف</dt><dd>{formatPrice(order.subtotalToman + discount)} تومان</dd></div>
            <div><dt>تخفیف</dt><dd>{formatPrice(discount)} تومان</dd></div>
          </>}
          <div><dt>{discount > 0 ? 'جمع کالاها پس از تخفیف' : 'جمع کالاها'}</dt><dd>{formatPrice(order.subtotalToman)} تومان</dd></div>
          <div><dt>هزینه ارسال</dt><dd>{order.shipping?.type === 'collect' ? 'پس‌کرایه' : formatPrice(order.shippingToman) + ' تومان'}</dd></div>
          <div className={styles.total}><dt>مبلغ کل سفارش</dt><dd><strong>{formatPrice(order.totalToman)}</strong> تومان</dd></div>
        </dl>
      </div>
    </article>
  </main>;
}
