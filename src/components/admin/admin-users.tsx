'use client';

import { useState } from 'react';
import Link from 'next/link';
import { userRoleLabels, userStatusLabels, type AdminUser, type AdminUserStatus } from '@/lib/admin-preview';
import { formatNumber } from '@/lib/format';
import { normalizeSearch } from '@/lib/search';
import { useAdmin } from './admin-provider';
import { AdminIcon } from './admin-icon';
import { AdminBadge, AdminEmpty, AdminModal, AdminPageHeading, AdminPagination, AdminPanel, downloadAdminCsv } from './admin-ui';

const PAGE_SIZE = 6;
const searchText = (value: string) => normalizeSearch(value).replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));

export function AdminUsers() {
  const { users, notify, removeUser } = useAdmin();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AdminUserStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalized = searchText(query);
  const filtered = users.filter(user => (filter === 'all' || user.status === filter) && searchText(`${user.name} ${user.phone} ${user.city}`).includes(normalized));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    const result = await removeUser(deleting.id);
    setBusy(false);
    if (result.ok) setDeleting(null);
    else setError(result.error ?? 'انتقال کاربر به سطل زباله انجام نشد.');
  }

  function exportUsers() {
    downloadAdminCsv('poostikal-users.csv', [
      ['نام کاربر', 'شماره نمایشی', 'شهر', 'تاریخ عضویت', 'نقش', 'وضعیت', 'تعداد سفارشات', 'مجموع خرید (تومان)'],
      ...filtered.map(user => [user.name, user.phone, user.city, user.joinedLabel, userRoleLabels[user.role], userStatusLabels[user.status], user.orderCount, user.totalSpentToman]),
    ]);
    notify('خروجی کاربران نمایش‌داده‌شده آماده شد.');
  }

  return <>
    <AdminPageHeading title="کاربران" description="مشتری‌ها و همراه‌های پوستیکال رو بهتر بشناس." action={<button type="button" className="admin-button" onClick={exportUsers} disabled={!filtered.length}><AdminIcon name="download" size={18}/>خروجی کاربران</button>}/>
    <div className="admin-stat-strip">
      <div className="admin-summary-item"><span>همه کاربران</span><strong>{formatNumber(users.length)}</strong></div>
      <div className="admin-summary-item"><span>کاربران فعال</span><strong>{formatNumber(users.filter(user => user.status === 'active').length)}</strong></div>
      <div className="admin-summary-item"><span>کاربران غیرفعال</span><strong>{formatNumber(users.filter(user => user.status === 'blocked').length)}</strong></div>
      <div className="admin-summary-item"><span>مشتریان دارای سفارش</span><strong>{formatNumber(users.filter(user => user.orderCount > 0).length)}</strong></div>
    </div>
    <AdminPanel title="فهرست کاربران" action={<span className="admin-small admin-muted">{formatNumber(filtered.length)} کاربر</span>}>
      <div className="admin-toolbar">
        <label className="admin-search-field"><AdminIcon name="search" size={19}/><input type="search" aria-label="جستجوی کاربران" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="جستجوی نام، شماره نمایشی یا شهر..."/></label>
        <label className="admin-filter-label"><span>وضعیت</span><select className="admin-field" aria-label="فیلتر وضعیت کاربر" value={filter} onChange={event => { setFilter(event.target.value as AdminUserStatus | 'all'); setPage(1); }}><option value="all">همه کاربران</option>{Object.entries(userStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {visible.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">کاربر</th><th scope="col">شهر</th><th scope="col">تاریخ عضویت</th><th scope="col">سفارشات</th><th scope="col">نقش</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>
        {visible.map(user => <tr key={user.id}><td><div className="admin-customer-cell"><span className="admin-user-avatar" aria-hidden="true">{user.name.charAt(0)}</span><span>{user.name}<small dir="ltr">{user.phone}</small></span></div></td><td>{user.city}</td><td className="admin-small">{user.joinedLabel}</td><td>{formatNumber(user.orderCount)}</td><td><AdminBadge status={user.role}>{userRoleLabels[user.role]}</AdminBadge></td><td><AdminBadge status={user.status}/></td><td>
          <div className="admin-row-actions">
            <Link className="admin-table-action" aria-label={`مشاهده کاربر ${user.name}`} href={`/admin/users/${encodeURIComponent(user.id)}`} prefetch={false}>مشاهده<AdminIcon name="arrow-left" size={16}/></Link>
            <button type="button" className="admin-icon-button" title="حذف کاربر" aria-label={`حذف کاربر ${user.name}`} onClick={() => { setError(''); setDeleting(user); }}><AdminIcon name="trash" size={18}/></button>
          </div>
        </td></tr>)}
      </tbody></table></div> : <AdminEmpty/>}
      <AdminPagination page={currentPage} pages={pages} onChange={setPage} total={filtered.length}/>
    </AdminPanel>
    {deleting && <AdminModal title="حذف کاربر" onClose={() => { if (!busy) setDeleting(null); }}>
      <p>حساب «{deleting.name}» به سطل زباله منتقل بشه؟</p>
      <p className="admin-small admin-muted">کاربر از حسابش خارج می‌شه. سفارش‌هاش محفوظ می‌مونن و می‌تونی حسابش رو از سطل زباله بازیابی کنی.</p>
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      <div className="admin-form-actions">
        <button type="button" className="admin-button admin-button-danger" disabled={busy} onClick={confirmDelete}>{busy ? 'در حال انتقال…' : 'انتقال به سطل زباله'}</button>
        <button type="button" className="admin-button" disabled={busy} onClick={() => setDeleting(null)}>انصراف</button>
      </div>
    </AdminModal>}
  </>;
}
