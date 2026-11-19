'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { orderStatusLabels, productStatusLabels, userStatusLabels } from '@/lib/admin-preview';
import { AdminIcon } from './admin-icon';
import { formatNumber } from '@/lib/format';

export function AdminPageHeading({ title, description, action }: { title: ReactNode; description?: string; action?: ReactNode }) { return <div className="admin-page-heading"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}<span className="admin-preview-label"><span/>مدیریت فروشگاه</span></div>{action}</div>; }
export function AdminPanel({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`admin-glass admin-panel ${className}`}>{title || action ? <div className="admin-panel-heading"><h2>{title}</h2>{action}</div> : null}{children}</section>; }
export function AdminBadge({ status, children }: { status: string; children?: ReactNode }) {
  const labels: Record<string, string> = { ...productStatusLabels, ...orderStatusLabels, ...userStatusLabels };
  return <span className={`admin-badge admin-badge-${status}`}>{children ?? labels[status] ?? status}</span>;
}
export function AdminEmpty({ title = 'نتیجه‌ای پیدا نشد.', description = 'جستجو یا فیلترها رو تغییر بده.' }: { title?: string; description?: string }) { return <div className="admin-empty"><AdminIcon name="search" size={33}/><h3>{title}</h3><p>{description}</p></div>; }
export function AdminModal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog=ref.current; const focus=document.activeElement instanceof HTMLElement ? document.activeElement : null; const overflow=document.body.style.overflow; dialog?.showModal(); dialog?.querySelector<HTMLElement>('[data-admin-autofocus]')?.focus({preventScroll:true}); document.body.style.overflow='hidden'; return () => { dialog?.close(); document.body.style.overflow=overflow; focus?.focus({preventScroll:true}); }; }, []);
  return <dialog ref={ref} className={`admin-dialog${wide ? ' admin-dialog-wide' : ''}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}><header><h2 id={id}>{title}</h2><button type="button" className="admin-icon-button" aria-label="بستن" onClick={onClose}><AdminIcon name="close"/></button></header><div className="admin-dialog-content">{children}</div></dialog>;
}
export function AdminPagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total: number }) {
 return <div className="admin-pagination"><span>{formatNumber(total)} مورد</span><div><button type="button" className="admin-icon-button" aria-label="صفحه قبل" disabled={page<=1} onClick={()=>onChange(page-1)}><AdminIcon name="arrow-right" size={17}/></button><span>{formatNumber(page)} از {formatNumber(Math.max(1,pages))}</span><button type="button" className="admin-icon-button" aria-label="صفحه بعد" disabled={page>=pages} onClick={()=>onChange(page+1)}><AdminIcon name="arrow-left" size={17}/></button></div></div>;
}

export function downloadAdminCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(value => { const text=String(value); const safe=/^[=+\-@\t\r]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a'); link.href=url; link.download=filename; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

