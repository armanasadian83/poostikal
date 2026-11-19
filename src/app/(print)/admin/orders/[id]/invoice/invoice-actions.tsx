'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AdminIcon } from '@/components/admin/admin-icon';
import styles from './invoice.module.css';

export function InvoiceActions() {
  useEffect(() => {
    let active = true;
    const logo = document.getElementById('invoice-logo') as HTMLImageElement | null;
    void Promise.allSettled([document.fonts.ready, logo?.decode()]).then(() => {
      if (active) window.print();
    });
    return () => { active = false; };
  }, []);

  return <nav className={styles.actions} aria-label="عملیات فاکتور">
    <Link href="/admin/orders"><AdminIcon name="arrow-right" size={17}/>بازگشت به سفارشات</Link>
    <button type="button" onClick={() => window.print()}><AdminIcon name="printer" size={18}/>چاپ فاکتور</button>
  </nav>;
}
