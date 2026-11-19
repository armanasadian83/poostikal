'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { normalizeAdminText, slugifyAdminValue, type AdminBrand, type AdminCategory } from '@/lib/admin-product-model';
import { validateAdminImageFile } from '@/lib/admin-image-upload';
import { formatNumber } from '@/lib/format';
import { normalizeSearch } from '@/lib/search';
import { useAdmin } from './admin-provider';
import { AdminIcon } from './admin-icon';
import { AdminEmpty, AdminModal, AdminPageHeading, AdminPagination, AdminPanel } from './admin-ui';

type TaxonomyKind = 'category' | 'brand';
type TaxonomyEntry = AdminCategory | AdminBrand;

const pageSize = 8;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const labels = {
  category: { singular: 'دسته‌بندی', plural: 'دسته‌بندی‌ها', icon: 'grid' as const, description: 'محصولات رو مرتب کن تا پیدا کردن انتخاب بعدی، ساده‌تر بشه.' },
  brand: { singular: 'برند', plural: 'برندها', icon: 'sparkles' as const, description: 'برای هر برند، یک جای مشخص در ویترین پوستیکال بساز.' },
};

function excludedParents(categories: AdminCategory[], id?: string): Set<string> {
  const excluded = new Set<string>(id ? [id] : []);
  if (!id) return excluded;
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && excluded.has(category.parentId) && !excluded.has(category.id)) {
        excluded.add(category.id);
        changed = true;
      }
    }
  }
  return excluded;
}

export function AdminTaxonomyDialog({ kind, initial, onClose, onSaved }: {
  kind: TaxonomyKind;
  initial?: TaxonomyEntry;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { categories, brands, saveCategory, saveBrand, createAssetUrl } = useAdmin();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parentId, setParentId] = useState(initial && 'parentId' in initial ? initial.parentId ?? '' : '');
  const [image, setImage] = useState(initial?.image ?? '');
  const [checkingImage, setCheckingImage] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const imageRequest = useRef(0);
  const fieldId = useId();
  const text = labels[kind];
  const entries: TaxonomyEntry[] = kind === 'category' ? categories : brands;
  const unavailableParents = excludedParents(categories, initial?.id);
  useEffect(() => () => { imageRequest.current += 1; }, []);

  function updateName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugifyAdminValue(value));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const request = ++imageRequest.current;
    setCheckingImage(false);
    if (!imageTypes.has(file.type) && !(file.type === '' && /\.(png|jpe?g|webp)$/i.test(file.name))) {
      setError('تصویر رو با فرمت PNG، JPG یا WebP انتخاب کن.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم تصویر باید کمتر از ۵ مگابایت باشه.');
      return;
    }
    setError('');
    setCheckingImage(true);
    try {
      await validateAdminImageFile(file);
      if (request === imageRequest.current) setImage(createAssetUrl(file));
    } catch (reason) {
      if (request === imageRequest.current) setError(reason instanceof Error ? reason.message : 'تصویر قابل نمایش نیست. فایل سالم دیگری انتخاب کن.');
    } finally {
      if (request === imageRequest.current) setCheckingImage(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkingImage) return;
    const form = event.currentTarget;
    function reject(message: string, field: string) {
      setError(message);
      const element = form.elements.namedItem(field);
      if (element instanceof HTMLElement) element.focus();
    }
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (!cleanName) return reject(`نام ${text.singular} رو وارد کن.`, 'taxonomy-name');
    if (!cleanSlug || !/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u.test(cleanSlug)) {
      return reject('نامک رو با حروف، عدد و خط تیره بنویس؛ فاصله مجاز نیست.', 'taxonomy-slug');
    }
    if (entries.some(entry => entry.id !== initial?.id && normalizeAdminText(entry.name) === normalizeAdminText(cleanName))) {
      return reject(`یک ${text.singular} با این نام وجود داره. نام دیگری انتخاب کن.`, 'taxonomy-name');
    }
    if (entries.some(entry => entry.id !== initial?.id && slugifyAdminValue(entry.slug) === slugifyAdminValue(cleanSlug))) {
      return reject('این نامک قبلاً استفاده شده. یک نامک متفاوت انتخاب کن.', 'taxonomy-slug');
    }
    if (kind === 'category' && parentId && (unavailableParents.has(parentId) || !categories.some(category => category.id === parentId))) {
      return reject('یک دسته‌بندی مادر معتبر انتخاب کن.', 'taxonomy-parent');
    }
    const id = initial?.id ?? `${kind}-${crypto.randomUUID()}`;
    const values = { id, name: cleanName, slug: cleanSlug, description: description.trim(), image: image || undefined };
    const result = kind === 'category'
      ? await saveCategory({ ...values, parentId: parentId || null })
      : await saveBrand(values);
    if (!result.ok) {
      setError(result.error ?? 'ذخیره انجام نشد. اطلاعات رو دوباره بررسی کن.');
      return;
    }
    onSaved?.(id);
    onClose();
  }

  return <AdminModal title={`${initial ? 'ویرایش' : 'افزودن'} ${text.singular}`} onClose={onClose} wide>
    <form onSubmit={submit} noValidate>
      {error ? <p id={`${fieldId}-error`} className="admin-form-error" role="alert">{error}</p> : null}
      <div className="admin-form-grid">
        <div className="admin-form-field">
          <label htmlFor={`${fieldId}-name`}>نام {text.singular} <span aria-hidden="true">*</span></label>
          <input id={`${fieldId}-name`} name="taxonomy-name" value={name} onChange={event => updateName(event.target.value)} maxLength={100} placeholder={kind === 'brand' ? 'مثلاً GENOSYS' : 'مثلاً مراقبت از پوست'} required data-admin-autofocus autoComplete="off"/>
        </div>
        <div className="admin-form-field">
          <label htmlFor={`${fieldId}-slug`}>نامک <span aria-hidden="true">*</span></label>
          <input id={`${fieldId}-slug`} name="taxonomy-slug" value={slug} onChange={event => { setSlugEdited(true); setSlug(event.target.value); }} maxLength={120} placeholder={kind === 'brand' ? 'genosys' : 'skin-care'} dir="ltr" spellCheck={false} required autoComplete="off" aria-describedby={`${fieldId}-slug-help`}/>
          <small id={`${fieldId}-slug-help`} className="admin-muted">نام کوتاه و یکتا برای آدرس {text.singular}.</small>
        </div>
        {kind === 'category' ? <div className="admin-form-field admin-form-field-wide">
          <label htmlFor={`${fieldId}-parent`}>دسته‌بندی مادر</label>
          <select id={`${fieldId}-parent`} name="taxonomy-parent" value={parentId} onChange={event => setParentId(event.target.value)}>
            <option value="">بدون مادر · دسته‌بندی اصلی</option>
            {categories.filter(category => !unavailableParents.has(category.id)).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <small className="admin-muted">برای ساخت زیرمجموعه، یک دسته‌بندی مادر انتخاب کن.</small>
        </div> : null}
        <div className="admin-form-field admin-form-field-wide">
          <label htmlFor={`${fieldId}-description`}>توضیحات</label>
          <textarea id={`${fieldId}-description`} name="taxonomy-description" rows={3} maxLength={1200} value={description} onChange={event => setDescription(event.target.value)} placeholder={`یک معرفی کوتاه برای این ${text.singular} بنویس…`}/>
        </div>
        <div className="admin-form-field admin-form-field-wide">
          <span id={`${fieldId}-image-label`}>{kind === 'brand' ? 'لوگوی برند' : 'تصویر دسته‌بندی'} <small className="admin-muted">(اختیاری)</small></span>
          <div className="admin-taxonomy-upload" role="group" aria-labelledby={`${fieldId}-image-label`}>
            <div className="admin-taxonomy-image">
              {image ? <Image src={image} alt={name ? `${kind === 'brand' ? 'لوگوی' : 'تصویر'} ${name}` : `پیش‌نمایش تصویر ${text.singular}`} width={80} height={80} unoptimized/> : <AdminIcon name={text.icon} size={30}/>}
            </div>
            <div className="admin-taxonomy-upload-actions">
              <input ref={fileInput} className="admin-taxonomy-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} aria-label={`انتخاب تصویر ${text.singular}`} tabIndex={-1}/>
              <div className="admin-table-actions">
                <button type="button" className="admin-button" onClick={() => fileInput.current?.click()}><AdminIcon name="plus" size={16}/>{image ? 'تغییر تصویر' : 'انتخاب تصویر'}</button>
                {image ? <button type="button" className="admin-icon-button" onClick={() => { imageRequest.current += 1; setCheckingImage(false); setImage(''); }} aria-label="حذف تصویر"><AdminIcon name="trash" size={17}/></button> : null}
              </div>
              <small className="admin-muted" role="status">{checkingImage ? 'در حال بررسی تصویر…' : 'PNG، JPG یا WebP · تا ۵ مگابایت'}</small>
            </div>
          </div>
        </div>
      </div>
      <div className="admin-form-actions">
        <button type="button" className="admin-button" onClick={onClose}>انصراف</button>
        <button type="submit" className="admin-button admin-button-primary" disabled={checkingImage}><AdminIcon name="check" size={17}/>{initial ? 'ذخیره تغییرات' : `افزودن ${text.singular}`}</button>
      </div>
    </form>
  </AdminModal>;
}

export function AdminTaxonomyPage({ kind }: { kind: TaxonomyKind }) {
  const { categories, brands, products, removeCategory, removeBrand } = useAdmin();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ initial?: TaxonomyEntry } | null>(null);
  const [deleting, setDeleting] = useState<TaxonomyEntry | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const text = labels[kind];
  const entries: TaxonomyEntry[] = kind === 'category' ? categories : brands;
  const counts = new Map<string, number>();
  for (const product of products) {
    if (kind === 'category') {
      for (const id of new Set(product.categoryIds?.length ? product.categoryIds : [product.category])) counts.set(id, (counts.get(id) ?? 0) + 1);
    } else {
      const brand = product.brandId || brands.find(item => normalizeSearch(item.name) === normalizeSearch(product.brand))?.id;
      if (brand) counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
  }
  const search = normalizeSearch(query);
  const filtered = entries.filter(entry => !search || normalizeSearch(`${entry.name} ${entry.slug} ${entry.description}`).includes(search));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const assigned = entries.filter(entry => (counts.get(entry.id) ?? 0) > 0).length;
  const childCount = deleting && kind === 'category' ? categories.filter(category => category.parentId === deleting.id).length : 0;
  const relatedCount = deleting ? counts.get(deleting.id) ?? 0 : 0;

  async function confirmDelete() {
    if (!deleting) return;
    const result = kind === 'category' ? await removeCategory(deleting.id) : await removeBrand(deleting.id);
    if (!result.ok) {
      setDeleteError(result.error ?? 'این مورد هنوز در محصولات یا دسته‌بندی‌ها استفاده می‌شه.');
      return;
    }
    setDeleting(null);
    setDeleteError('');
  }

  return <>
    <AdminPageHeading title={text.plural} description={text.description} action={<button type="button" className="admin-button admin-button-primary" onClick={() => setEditor({})}><AdminIcon name="plus" size={18}/>افزودن {text.singular}</button>}/>
    <div className="admin-taxonomy-stats">
      <div className="admin-glass admin-taxonomy-stat"><span>همه {text.plural}</span><strong>{formatNumber(entries.length)}</strong><AdminIcon name={text.icon}/></div>
      <div className="admin-glass admin-taxonomy-stat"><span>دارای محصول</span><strong>{formatNumber(assigned)}</strong><AdminIcon name="products"/></div>
      <div className="admin-glass admin-taxonomy-stat"><span>آماده افزودن محصول</span><strong>{formatNumber(entries.length - assigned)}</strong><AdminIcon name="plus"/></div>
    </div>
    <AdminPanel title={`مدیریت ${text.plural}`} action={<span className="admin-muted admin-small">{formatNumber(filtered.length)} مورد</span>}>
      <div className="admin-toolbar">
        <label className="admin-search-field"><AdminIcon name="search" size={18}/><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder={`جستجوی ${text.singular}…`} aria-label={`جستجوی ${text.singular}`}/></label>
        <span className="admin-muted admin-small">با ویرایش هر مورد، اطلاعاتش در پایگاه داده ذخیره می‌شه.</span>
      </div>
      {visible.length ? <>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th scope="col">{kind === 'brand' ? 'برند' : 'دسته‌بندی'}</th><th scope="col">نامک</th>{kind === 'category' ? <th scope="col">دسته‌بندی مادر</th> : null}<th scope="col">محصولات</th><th scope="col">عملیات</th></tr></thead>
            <tbody>{visible.map(entry => <tr key={entry.id}>
              <td><div className="admin-taxonomy-name"><div className="admin-taxonomy-image">{entry.image ? <Image src={entry.image} alt={kind === 'brand' ? `لوگوی ${entry.name}` : entry.name} width={48} height={48} unoptimized/> : <AdminIcon name={text.icon} size={22}/>}</div><div><strong>{entry.name}</strong>{entry.description ? <p className="admin-taxonomy-description">{entry.description}</p> : null}</div></div></td>
              <td><span className="admin-taxonomy-slug" dir="ltr">{entry.slug}</span></td>
              {kind === 'category' ? <td>{'parentId' in entry && entry.parentId ? categories.find(category => category.id === entry.parentId)?.name ?? '—' : <span className="admin-muted">دسته‌بندی اصلی</span>}</td> : null}
              <td><span className="admin-taxonomy-count">{formatNumber(counts.get(entry.id) ?? 0)} محصول</span></td>
              <td><div className="admin-table-actions"><button type="button" className="admin-icon-button" onClick={() => setEditor({ initial: entry })} aria-label={`ویرایش ${entry.name}`}><AdminIcon name="edit" size={17}/></button><button type="button" className="admin-icon-button" onClick={() => { setDeleting(entry); setDeleteError(''); }} aria-label={`حذف ${entry.name}`}><AdminIcon name="trash" size={17}/></button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <AdminPagination page={currentPage} pages={pages} total={filtered.length} onChange={setPage}/>
      </> : <AdminEmpty title={query ? 'نتیجه‌ای پیدا نشد.' : `هنوز ${text.singular}ی اضافه نشده.`} description={query ? 'نام یا نامک دیگری رو جستجو کن.' : `با دکمه افزودن ${text.singular}، اولین مورد رو بساز.`}/>}
    </AdminPanel>
    {editor ? <AdminTaxonomyDialog key={editor.initial?.id ?? `new-${kind}`} kind={kind} initial={editor.initial} onClose={() => setEditor(null)}/> : null}
    {deleting ? <AdminModal title={`حذف ${text.singular}`} onClose={() => { setDeleting(null); setDeleteError(''); }}>
      <div className="admin-confirm-icon"><AdminIcon name="trash" size={38}/></div>
      <p className="admin-confirm-copy">{text.singular} «{deleting.name}» از فروشگاه حذف بشه؟</p>
      {relatedCount || childCount ? <p className="admin-taxonomy-delete-note">این {text.singular} {relatedCount ? `در ${formatNumber(relatedCount)} محصول استفاده شده` : ''}{relatedCount && childCount ? ' و ' : ''}{childCount ? `${formatNumber(childCount)} زیرمجموعه داره` : ''}. با انتقال به سطل زباله، ارتباط‌ها برای بازیابی محفوظ می‌مانند.</p> : null}
      {deleteError ? <p className="admin-form-error" role="alert">{deleteError}</p> : null}
      <div className="admin-form-actions"><button type="button" className="admin-button" onClick={() => setDeleting(null)}>انصراف</button><button type="button" className="admin-button admin-button-primary" onClick={confirmDelete}>حذف {text.singular}</button></div>
    </AdminModal> : null}
  </>;
}
