'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { productStatusLabels, type AdminProductListItem } from '@/lib/admin-preview';
import { getCategoryLabel } from '@/lib/admin-product-model';
import { formatNumber, formatPrice, formatStock } from '@/lib/format';
import { normalizeSearch } from '@/lib/search';
import { useAdmin } from './admin-provider';
import { AdminIcon } from './admin-icon';
import { AdminBadge, AdminEmpty, AdminModal, AdminPageHeading, AdminPagination, AdminPanel } from './admin-ui';

const pageSize = 6;

export function AdminProducts() {
  const { products, categories, removeProduct, settings } = useAdmin();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AdminProductListItem | null>(null);
  const normalizedQuery = normalizeSearch(query);
  const filtered = products.filter(product => (category === 'all' || product.categoryIds.includes(category))
    && (status === 'all' || product.status === status)
    && normalizeSearch(`${product.name} ${product.brand} ${product.id} ${product.slug}`).includes(normalizedQuery));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const lowStock = products.filter(product => product.stock !== null && product.stock > 0 && product.stock <= settings.stockThreshold).length;

  return <>
    <AdminPageHeading title="محصولات" description="محصولات و موجودی فروشگاهت رو یک‌جا مدیریت کن." action={<div className="admin-form-actions"><Link href="/admin/settings/raboteb" className="admin-button">ورود از رابوطب</Link><Link href="/admin/products/new" className="admin-button admin-button-primary"><AdminIcon name="plus" size={18}/>افزودن محصول</Link></div>}/>
    <div className="admin-stat-strip" role="group" aria-label="خلاصه محصولات">
      <div><span>کل محصولات</span><strong>{formatNumber(products.length)}</strong></div>
      <div><span>محصولات فعال</span><strong>{formatNumber(products.filter(product => product.status === 'active').length)}</strong></div>
      <div><span>کم‌موجود</span><strong>{formatNumber(lowStock)}</strong></div>
      <div><span>ناموجود</span><strong>{formatNumber(products.filter(product => product.status === 'out-of-stock' || product.stock === 0).length)}</strong></div>
    </div>
    <AdminPanel title="فهرست محصولات" action={<span className="admin-small admin-muted">{formatNumber(filtered.length)} محصول</span>}>
      <div className="admin-toolbar">
        <label className="admin-search-field"><AdminIcon name="search" size={19}/><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} aria-label="جستجوی محصولات" placeholder="جستجوی نام، برند یا کد محصول..."/></label>
        <select className="admin-field" aria-label="فیلتر دسته‌بندی محصولات" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="all">همهٔ دسته‌بندی‌ها</option>{categories.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
        <select className="admin-field" aria-label="فیلتر وضعیت محصولات" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">همه وضعیت‌ها</option>{Object.entries(productStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        {query || category !== 'all' || status !== 'all' ? <button className="admin-button" type="button" onClick={() => { setQuery(''); setCategory('all'); setStatus('all'); setPage(1); }}>پاک کردن فیلترها</button> : null}
      </div>
      {visible.length ? <>
        <div className="admin-table-wrap"><table className="admin-table" aria-label="فهرست محصولات فروشگاه"><thead><tr><th scope="col">محصول</th><th scope="col">دسته‌بندی</th><th scope="col">قیمت</th><th scope="col">موجودی</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>{visible.map(product => <tr key={product.id}>
          <td><div className="admin-product-cell"><span className="admin-product-thumb">{product.image ? <Image src={product.image} alt={product.imageAlt} width={48} height={52} unoptimized={product.image.startsWith('blob:')}/> : <AdminIcon name="products" size={25}/>}</span><div><Link href={`/admin/products/${encodeURIComponent(product.id)}/edit`}><strong>{product.name}</strong></Link><small dir="ltr">{product.brand || '—'}</small></div></div></td>
          <td>{product.categoryIds.length ? product.categoryIds.map(id => getCategoryLabel(id, categories)).join('، ') : 'بدون دسته‌بندی'}</td>
          <td><div className="admin-money">{product.priceToman > 0 ? <><strong>{formatPrice(product.priceToman)}</strong><small>تومان</small></> : <span>تماس برای قیمت</span>}</div>{product.discountPriceToman !== undefined && product.regularPriceToman > product.priceToman ? <del className="admin-small admin-muted">{formatPrice(product.regularPriceToman)} تومان</del> : null}</td>
          <td><span className={product.stock !== null && product.stock > 0 && product.stock <= settings.stockThreshold ? 'admin-stock-low' : ''}>{formatStock(product.stock, product.status)}</span>{product.stock !== null && product.stock > 0 && product.stock <= settings.stockThreshold ? <small className="admin-stock-low"> کم‌موجود</small> : null}</td>
          <td><AdminBadge status={product.status}/></td>
          <td><div className="admin-table-actions"><Link href={`/admin/products/${encodeURIComponent(product.id)}/view`} className="admin-icon-button" aria-label={`مشاهده ${product.name}`} title="پیش‌نمایش محصول"><AdminIcon name="eye" size={18}/></Link><Link href={`/admin/products/${encodeURIComponent(product.id)}/edit`} className="admin-icon-button" aria-label={`ویرایش ${product.name}`} title="ویرایش محصول"><AdminIcon name="edit" size={18}/></Link><button type="button" className="admin-icon-button" aria-label={`حذف ${product.name}`} title="حذف محصول" onClick={() => setDeleting(product)}><AdminIcon name="trash" size={18}/></button></div></td>
        </tr>)}</tbody></table></div>
        <AdminPagination page={currentPage} pages={pages} onChange={setPage} total={filtered.length}/>
      </> : <AdminEmpty title="محصولی پیدا نشد." description="نام محصول یا فیلترهای انتخاب‌شده رو تغییر بده."/>}
    </AdminPanel>
    {deleting ? <AdminModal title="حذف محصول" onClose={() => setDeleting(null)}><p>محصول <strong>{deleting.name}</strong> از فهرست حذف بشه؟</p><p className="admin-small admin-muted">این محصول به سطل زباله منتقل می‌شود و قابل بازیابی است.</p><div className="admin-form-actions"><button type="button" className="admin-button admin-button-danger" onClick={async () => { const result = await removeProduct(deleting.id); if (result.ok) setDeleting(null); }}>حذف از فهرست</button><button type="button" className="admin-button" onClick={() => setDeleting(null)}>انصراف</button></div></AdminModal> : null}
  </>;
}
