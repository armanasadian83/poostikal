'use client';

import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { DESCRIPTION_LIMITS, richTextLength, sanitizeRichText } from '@poostikal/rich-text';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { formatNumber, formatPrice, formatStock } from '@/lib/format';
import { productStatusLabels } from '@/lib/admin-preview';
import { createEmptyAnimation, normalizeAdminProduct, readAdminInteger, slugifyAdminValue, type AdminProduct, type AdminProductAttribute, type AdminProductStatus } from '@/lib/admin-product-model';
import { useAdmin } from './admin-provider';
import { AdminIcon } from './admin-icon';
import { AdminBadge, AdminPanel } from './admin-ui';
import { AdminProductMedia } from './admin-product-media';
import { AdminProductAudio } from './admin-product-audio';
import { AdminAnimationAsset } from './admin-animation-asset';
import { AdminTaxonomyDialog } from './admin-taxonomy';

const AdminRichTextEditor = dynamic(() => import('./admin-rich-text-editor').then(module => module.AdminRichTextEditor), {
  ssr: false,
  loading: () => <div className="admin-form-field-wide admin-rich-text-loading" role="status">در حال آماده‌سازی ویرایشگر…</div>,
});

type VariantDraft = { id: string; label: string; sku: string; regular: string; discount: string; stock: string; image: string; attributes: AdminProductAttribute[] };
type ProductDraft = Omit<AdminProduct, 'regularPriceToman' | 'discountPriceToman' | 'priceToman' | 'stock' | 'variants'> & { regular: string; discount: string; stockText: string; variants: VariantDraft[] };
type FormError = { section: string; message: string };

function makeDraft(product?: AdminProduct): ProductDraft {
  const base = product ? normalizeAdminProduct(product) : {
    id: '', slug: '', name: '', brand: '', brandId: '', category: '', categoryIds: [], image: '', images: [], description: '', shortDescription: '', attributes: [],
    regularPriceToman: 0, priceToman: 0, stock: 0, status: 'active' as const, variants: [], mediaType: 'photo' as const, animation: createEmptyAnimation(),
  };
  return { ...base, regular: product ? String(base.regularPriceToman) : '', discount: base.discountPriceToman === undefined ? '' : String(base.discountPriceToman), stockText: base.stock===null?'':String(base.stock),
    variants: base.variants.map(variant => ({ id: variant.id, label: variant.label, sku: variant.sku ?? '', regular: String(variant.regularPriceToman ?? variant.priceToman), discount: variant.discountPriceToman === undefined ? '' : String(variant.discountPriceToman), stock: variant.stock===null?'':String(variant.stock ?? 0), image: variant.image ?? '', attributes: variant.attributes ?? [] })),
  };
}

function AttributeFields({ attributes, onChange, variant = false }: { attributes: AdminProductAttribute[]; onChange: (value: AdminProductAttribute[]) => void; variant?: boolean }) {
  return <div className="admin-attribute-fields">{attributes.map((attribute, index) => <div className="admin-attribute-row" key={attribute.id}>
    <label className="admin-form-field"><span>{variant ? 'ویژگی تنوع' : 'نام ویژگی'} {formatNumber(index + 1)}</span><input value={attribute.key} maxLength={100} placeholder="مثلاً حجم" onChange={event => onChange(attributes.map(item => item.id === attribute.id ? { ...item, key: event.target.value } : item))}/></label>
    <label className="admin-form-field"><span>مقدار {formatNumber(index + 1)}</span><input value={attribute.value} maxLength={300} placeholder="مثلاً ۱۲۰ میلی‌لیتر" onChange={event => onChange(attributes.map(item => item.id === attribute.id ? { ...item, value: event.target.value } : item))}/></label>
    <button type="button" className="admin-icon-button admin-remove-field" aria-label={`حذف ${variant ? 'ویژگی تنوع' : 'ویژگی'} ${formatNumber(index + 1)}`} onClick={() => onChange(attributes.filter(item => item.id !== attribute.id))}><AdminIcon name="trash" size={18}/></button>
  </div>)}<button type="button" className="admin-button admin-add-inline" disabled={attributes.length >= 30} onClick={() => onChange([...attributes, { id: crypto.randomUUID(), key: '', value: '' }])}><AdminIcon name="plus" size={16}/>{variant ? 'افزودن ویژگی تنوع' : 'افزودن ویژگی'}</button></div>;
}

export function AdminProductEditor({ productId }: { productId?: string }) {
  return productId ? <ExistingProduct key={productId} id={productId}/> : <ProductForm key="new"/>;
}
function ExistingProduct({id}:{id:string}) {
  const [product,setProduct]=useState<AdminProduct>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    api<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`,{signal:controller.signal})
      .then(p=>{if(!controller.signal.aborted)setProduct(p);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'دریافت محصول انجام نشد.');});
    return ()=>controller.abort();
  },[id]);
  if(error)return <AdminPanel title="دریافت محصول"><p role="alert">{error}</p><Link className="admin-button" href="/admin/products">بازگشت به محصولات</Link></AdminPanel>;
  if(!product)return <AdminPanel title="در حال دریافت محصول"><p role="status">در حال بارگذاری…</p></AdminPanel>;
  return <ProductForm initial={product}/>;
}

function ProductForm({ initial }: { initial?: AdminProduct }) {
  const router = useRouter();
  const external = !!initial?.supplier;
  const { products, categories, brands, saveProduct } = useAdmin();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => makeDraft(initial));
  const [slugEdited, setSlugEdited] = useState(!!initial);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [taxonomyDialog, setTaxonomyDialog] = useState<'category' | 'brand' | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const sectionId = (name: string) => `${fieldId}-${name}`;
  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) { setDraft(previous => ({ ...previous, [key]: value })); }
  function updateVariant(id: string, change: Partial<VariantDraft>) { setDraft(previous => ({ ...previous, variants: previous.variants.map(variant => variant.id === id ? { ...variant, ...change } : variant) })); }
  const regular = readAdminInteger(draft.regular) ?? 0;
  const discount = draft.discount.trim() ? readAdminInteger(draft.discount) : null;
  const totalStock = draft.variants.length ? draft.variants.reduce((total, variant) => total + (readAdminInteger(variant.stock) ?? 0), 0) : readAdminInteger(draft.stockText) ?? 0;
  const previewImage = draft.mediaType === 'animation' ? draft.animation.thumbnail?.url ?? draft.images[0]?.url ?? draft.animation.build?.cartonUrl : draft.images[0]?.url;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (uploadBusy || assetBusy || audioBusy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const isDraft = submitter instanceof HTMLButtonElement && submitter.value === 'draft';
    const status: AdminProductStatus = isDraft ? 'draft' : draft.status;
    const strict = status !== 'draft' && !external;
    const nextErrors: FormError[] = [];
    const add = (section: string, message: string) => nextErrors.push({ section, message });
    const name = draft.name.trim();
    const slug = slugifyAdminValue(draft.slug || name);
    if (!name) add('details', 'نام محصول رو وارد کن.');
    if (!slug) add('details', 'نشانی معتبر برای محصول بنویس.');
    if (products.some(product => product.id !== draft.id && product.slug === slug)) add('details', 'این نشانی برای محصول دیگه‌ای استفاده شده؛ یک نشانی متفاوت بنویس.');
    const shortLength = richTextLength(draft.shortDescription);
    const fullLength = richTextLength(draft.description);
    if (strict && (!shortLength || !fullLength)) add('details', 'توضیحات کوتاه و کامل محصول رو بنویس.');
    if (!external && shortLength > DESCRIPTION_LIMITS.short) add('details', 'توضیحات کوتاه باید حداکثر ۵۰۰ نویسه باشد.');
    if (!external && fullLength > DESCRIPTION_LIMITS.full) add('details', 'توضیحات کامل باید حداکثر ۲۰٬۰۰۰ نویسه باشد.');
    if (draft.shortDescription.length > DESCRIPTION_LIMITS.raw || draft.description.length > DESCRIPTION_LIMITS.raw) add('details', 'حجم کد توضیحات بیش از حد مجاز است.');
    if (strict && !draft.brandId) add('classification', 'برند محصول رو انتخاب کن.');
    if (strict && !draft.categoryIds.length) add('classification', 'حداقل یک دسته‌بندی انتخاب کن.');
    const parsedRegular = readAdminInteger(draft.regular);
    const parsedDiscount = draft.discount.trim() ? readAdminInteger(draft.discount) : undefined;
    if ((strict || draft.regular.trim()) && (parsedRegular === null || parsedRegular < 0 || (strict && parsedRegular === 0))) add('pricing', 'قیمت باید عدد صحیح و برای انتشار بیشتر از صفر باشه.');
    if (parsedDiscount !== undefined && (parsedDiscount === null || parsedDiscount <= 0 || parsedDiscount >= (parsedRegular ?? 0))) add('pricing', 'قیمت با تخفیف باید بیشتر از صفر و کمتر از قیمت اصلی باشه.');
    const parsedStock = readAdminInteger(draft.stockText);
    if (!external && !draft.variants.length && parsedStock === null) add('pricing', 'موجودی باید عدد صحیح صفر یا بیشتر باشه.');
    if (!Number.isSafeInteger(totalStock)) add('pricing', 'مجموع موجودی‌ها از محدودهٔ مجاز بیشتره.');
    if (strict && status === 'active' && totalStock <= 0) add('pricing', 'محصول فعال باید موجودی داشته باشه؛ وضعیت ناموجود رو انتخاب کن یا موجودی اضافه کن.');
    const attributes = draft.attributes.filter(attribute => attribute.key.trim() || attribute.value.trim());
    if (attributes.some(attribute => !attribute.key.trim() || !attribute.value.trim())) add('attributes', 'نام و مقدار هر ویژگی رو کامل کن یا ردیف خالی رو حذف کن.');
    if (new Set(attributes.map(item => slugifyAdminValue(item.key))).size !== attributes.length) add('attributes', 'نام ویژگی‌های محصول نباید تکراری باشه.');
    const labels = new Set<string>();
    const skus = new Set<string>();
    for (const [index, variant] of draft.variants.entries()) {
      if (external) continue;
      const label = variant.label.trim();
      const labelKey = slugifyAdminValue(label);
      if (strict && !label) add('variants', `نام تنوع ${formatNumber(index + 1)} رو بنویس.`);
      if (labelKey && labels.has(labelKey)) add('variants', 'نام تنوع‌ها نباید تکراری باشه.');
      labels.add(labelKey);
      if (variant.sku.trim() && skus.has(variant.sku.trim().toLowerCase())) add('variants', 'شناسهٔ تنوع‌ها نباید تکراری باشه.');
      if (variant.sku.trim()) skus.add(variant.sku.trim().toLowerCase());
      if (readAdminInteger(variant.stock) === null) add('variants', `موجودی تنوع ${formatNumber(index + 1)} رو به‌صورت عدد صحیح بنویس.`);
      const variantRegular = variant.regular.trim() ? readAdminInteger(variant.regular) : parsedRegular;
      const variantDiscount = variant.discount.trim() ? readAdminInteger(variant.discount) : undefined;
      if ((strict || variant.regular.trim()) && (variantRegular === null || variantRegular < 0 || (strict && variantRegular === 0))) add('variants', `قیمت تنوع ${formatNumber(index + 1)} معتبر نیست.`);
      if (variantDiscount !== undefined && (variantDiscount === null || variantDiscount <= 0 || variantDiscount >= (variantRegular ?? 0))) add('variants', `تخفیف تنوع ${formatNumber(index + 1)} باید کمتر از قیمتش باشه.`);
      if (variant.attributes.some(attribute => (attribute.key.trim() || attribute.value.trim()) && (!attribute.key.trim() || !attribute.value.trim()))) add('variants', `ویژگی‌های تنوع ${formatNumber(index + 1)} رو کامل کن.`);
    }
    if (strict && draft.mediaType === 'photo') {
      if (!draft.images.length) add('media', 'حداقل یک تصویر معمولی اضافه کن.');
      if (draft.images.some(image => !image.alt.trim())) add('media', 'متن جایگزین همهٔ تصاویر رو بنویس.');
    }
    if (strict && draft.mediaType === 'animation') {
      if (draft.animation.thumbnail && !draft.animation.thumbnail.alt.trim()) add('media', 'متن جایگزین تصویر بندانگشتی را بنویس.');
      if (draft.animation.references.some(reference => !reference.image)) add('media', 'چهار تصویر مرجع انیمیشن رو اضافه کن.');
      if (draft.animation.references.some(reference => reference.image && !reference.image.alt.trim())) add('media', 'متن جایگزین تصاویر مرجع رو کامل کن.');
      if (!draft.animation.build && !draft.animation.assetUrl) add('media', 'ابتدا انیمیشن را بساز یا فایل آماده اضافه کن.');
      if (!draft.animation.reviewConfirmed) add('media', 'در مرحلهٔ بازبینی، تنظیمات انیمیشن رو تأیید کن.');
    }
    if (draft.mediaType === 'animation' && Object.values(draft.animation.dimensions).some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))) add('media', 'ابعاد بسته‌بندی باید عدد مثبت باشن.');
    if (nextErrors.length) {
      setErrors(nextErrors);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const basePrice = parsedRegular ?? 0;
    const cleanAttributes = (items: AdminProductAttribute[]) => items.filter(item => item.key.trim() || item.value.trim()).map(item => ({ ...item, key: item.key.trim(), value: item.value.trim() }));
    const product: AdminProduct = {
      version: initial?.version, id: draft.id || `product-${crypto.randomUUID()}`, name, slug, brandId: draft.brandId, brand: brands.find(brand => brand.id === draft.brandId)?.name ?? '',
      category: draft.categoryIds[0] ?? '', categoryIds: draft.categoryIds, description: sanitizeRichText(draft.description), shortDescription: sanitizeRichText(draft.shortDescription), attributes: cleanAttributes(attributes),
      images: draft.images, image: previewImage ?? '', mediaType: draft.mediaType, animation: draft.animation, audio: draft.audio ?? null,
      regularPriceToman: basePrice, discountPriceToman: parsedDiscount ?? undefined, priceToman: parsedDiscount ?? basePrice, stock: external ? initial!.stock : totalStock, status,
      variants: draft.variants.map(variant => {
        const regularPrice = variant.regular.trim() ? readAdminInteger(variant.regular) ?? 0 : basePrice;
        const discountPrice = variant.discount.trim() ? readAdminInteger(variant.discount) ?? undefined : variant.regular.trim() ? undefined : parsedDiscount ?? undefined;
        return { id: variant.id, label: variant.label.trim(), sku: variant.sku.trim(), regularPriceToman: regularPrice, discountPriceToman: discountPrice,
          priceToman: discountPrice ?? regularPrice, originalPriceToman: discountPrice ? regularPrice : undefined, stock: external ? readAdminInteger(variant.stock) : readAdminInteger(variant.stock) ?? 0,
          image: variant.image || undefined, attributes: cleanAttributes(variant.attributes) };
      }),
    };
    setSaving(true);
    const result = await saveProduct(product);
    setSaving(false);
    if (!result.ok) { setErrors([{ section: 'details', message: result.error ?? 'محصول ذخیره نشد.' }]); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    router.push('/admin/products');
  }

  const actions = <><button type="submit" disabled={uploadBusy || assetBusy || audioBusy || saving} className="admin-button admin-button-primary" value="save"><AdminIcon name="check" size={18}/>ذخیره محصول</button><button type="submit" disabled={external || uploadBusy || assetBusy || audioBusy || saving} className="admin-button" value="draft"><AdminIcon name="clipboard" size={18}/>ذخیره پیش‌نویس</button></>;
  return <>
    <form className="admin-product-form" noValidate onSubmit={submit}>
      <div className="admin-product-page-heading"><div><Link className="admin-editor-back" href="/admin/products"><AdminIcon name="arrow-right" size={16}/>محصولات</Link><h1>{initial ? 'ویرایش محصول' : 'افزودن محصول'}</h1><p>جزئیات، تصاویر و انتخاب‌های محصولت رو کنار هم بچین.</p></div><div className="admin-product-heading-actions">{actions}</div></div>
      <p className="admin-product-preview-note"><AdminIcon name="device" size={18}/>اطلاعات در پایگاه داده ذخیره می‌شوند. محصولات فعال در فروشگاه نمایش داده می‌شوند.</p>
      {external ? <p className="admin-product-preview-note">قیمت، تخفیف، موجودی و تنوع‌ها از رابوطب دریافت می‌شوند. <Link href="/admin/raboteb">وضعیت همگام‌سازی</Link></p> : null}
      {errors.length ? <div className="admin-product-errors" role="alert" ref={errorRef} tabIndex={-1}><strong>این موارد رو بررسی کن:</strong><ul>{errors.map((error, index) => <li key={`${error.section}-${index}`}><a href={`#${sectionId(error.section)}`}>{error.message}</a></li>)}</ul></div> : null}
      <div className="admin-product-editor-layout"><div className="admin-product-editor-main">
        <div id={sectionId('details')} className="admin-editor-anchor"><AdminPanel title="اطلاعات محصول" action={<AdminIcon name="products" size={21}/>}><div className="admin-form-grid">
          <label className="admin-form-field"><span>نام محصول <em>*</em></span><input value={draft.name} maxLength={200} placeholder="مثلاً آبرسان روزانه پوست چرب" onChange={event => { const name = event.target.value; setDraft(previous => ({ ...previous, name, slug: slugEdited ? previous.slug : slugifyAdminValue(name) })); }}/></label>
          <label className="admin-form-field"><span>نشانی محصول (Slug) <em>*</em></span><input value={draft.slug} maxLength={180} dir="ltr" placeholder="daily-moisturizer" onChange={event => { setSlugEdited(true); update('slug', event.target.value); }} onBlur={() => update('slug', slugifyAdminValue(draft.slug))}/><small className="admin-slug-hint" dir="ltr">/products/{draft.slug || 'product-name'}</small></label>
          <AdminRichTextEditor label="توضیحات کوتاه" value={draft.shortDescription} maxLength={external ? DESCRIPTION_LIMITS.raw : DESCRIPTION_LIMITS.short} compact disabled={saving} placeholder="خلاصه‌ای که کنار تصویر محصول دیده می‌شه..." onChange={value => update('shortDescription', value)}/>
          <AdminRichTextEditor label="توضیحات کامل" value={draft.description} maxLength={external ? DESCRIPTION_LIMITS.raw : DESCRIPTION_LIMITS.full} disabled={saving} placeholder="معرفی، کاربرد، ترکیبات و روش استفاده از محصول رو بنویس..." onChange={value => update('description', value)}/>
        </div></AdminPanel></div>
        <div id={sectionId('media')} className="admin-editor-anchor"><AdminPanel className="admin-media-panel"><AdminProductMedia disabled={assetBusy || saving} mediaType={draft.mediaType} images={draft.images} animation={draft.animation} onBusyChange={setUploadBusy} onMediaTypeChange={value => update('mediaType', value)} onImagesChange={value => update('images', value)} onAnimationChange={value => update('animation', value)}/>{draft.mediaType === 'animation' ? <AdminAnimationAsset disabled={uploadBusy || saving} onBusyChange={setAssetBusy} value={draft.animation} onChange={value=>update('animation',value)}/> : null}</AdminPanel></div>
        <div id={sectionId('audio')} className="admin-editor-anchor"><AdminPanel title="معرفی صوتی محصول"><AdminProductAudio value={draft.audio} productName={draft.name} disabled={saving} onChange={value => update('audio', value)} onBusyChange={setAudioBusy}/></AdminPanel></div>
        <div id={sectionId('attributes')} className="admin-editor-anchor"><AdminPanel title="ویژگی‌های محصول" action={<AdminIcon name="sliders" size={21}/>}><p className="admin-editor-section-note">مشخصات مشترک مثل نوع پوست، ترکیبات یا کشور سازنده.</p><AttributeFields attributes={draft.attributes} onChange={value => update('attributes', value)}/></AdminPanel></div>
        <div id={sectionId('variants')} className="admin-editor-anchor"><AdminPanel title="تنوع‌های محصول" action={<span className="admin-small admin-muted">{formatNumber(draft.variants.length)} تنوع</span>}><p className="admin-editor-section-note">برای حجم، رنگ یا بسته‌بندی متفاوت، تنوع اضافه کن. قیمت خالی از قیمت محصول استفاده می‌کنه؛ موجودی هر تنوع جداست.</p>
          <fieldset disabled={external} className="admin-supplier-fieldset"><div className="admin-product-variants">{draft.variants.map((variant, index) => <div key={variant.id} className="admin-product-variant"><div className="admin-product-variant-header"><strong>تنوع {formatNumber(index + 1)}{variant.label ? ` · ${variant.label}` : ''}</strong><button type="button" className="admin-icon-button" aria-label={`حذف تنوع ${formatNumber(index + 1)}`} onClick={() => update('variants', draft.variants.filter(item => item.id !== variant.id))}><AdminIcon name="trash" size={18}/></button></div><div className="admin-variant-fields-grid">
            <label className="admin-form-field"><span>نام تنوع {formatNumber(index + 1)}</span><input value={variant.label} maxLength={120} placeholder="مثلاً ۱۲۰ میلی‌لیتر" onChange={event => updateVariant(variant.id, { label: event.target.value })}/></label>
            <label className="admin-form-field"><span>شناسه (SKU) {formatNumber(index + 1)}</span><input value={variant.sku} maxLength={80} dir="ltr" placeholder="MAD-120" onChange={event => updateVariant(variant.id, { sku: event.target.value })}/></label>
            <label className="admin-form-field"><span>قیمت تنوع (تومان) {formatNumber(index + 1)}</span><input inputMode="numeric" value={variant.regular} placeholder="قیمت محصول" onChange={event => updateVariant(variant.id, { regular: event.target.value })}/></label>
            <label className="admin-form-field"><span>قیمت با تخفیف {formatNumber(index + 1)}</span><input inputMode="numeric" value={variant.discount} placeholder="اختیاری" onChange={event => updateVariant(variant.id, { discount: event.target.value })}/></label>
            <label className="admin-form-field"><span>موجودی تنوع {formatNumber(index + 1)}</span><input inputMode={external ? 'text' : 'numeric'} value={external ? formatStock(readAdminInteger(variant.stock), initial?.status) : variant.stock} onChange={event => updateVariant(variant.id, { stock: event.target.value })}/></label>
            <label className="admin-form-field"><span>تصویر تنوع {formatNumber(index + 1)}</span><select value={variant.image} onChange={event => updateVariant(variant.id, { image: event.target.value })}><option value="">تصویر اصلی محصول</option>{variant.image && !draft.images.some(image => image.url === variant.image) ? <option value={variant.image}>تصویر فعلی</option> : null}{draft.images.map((image, imageIndex) => <option key={image.id} value={image.url}>{image.alt || `تصویر ${formatNumber(imageIndex + 1)}`}</option>)}</select></label>
          </div><details className="admin-variant-attributes"><summary>ویژگی‌های این تنوع</summary><AttributeFields variant attributes={variant.attributes} onChange={value => updateVariant(variant.id, { attributes: value })}/></details></div>)}</div>
          <button type="button" className="admin-button admin-add-inline" disabled={draft.variants.length >= 30} onClick={() => update('variants', [...draft.variants, { id: crypto.randomUUID(), label: '', sku: '', regular: '', discount: '', stock: '0', image: '', attributes: [] }])}><AdminIcon name="plus" size={17}/>افزودن تنوع</button></fieldset>
        </AdminPanel></div>
      </div><aside className="admin-product-editor-aside">
        <div id={sectionId('classification')} className="admin-editor-anchor"><AdminPanel title="طبقه‌بندی محصول" action={<AdminIcon name="grid" size={20}/>}><div className="admin-editor-aside-fields"><label className="admin-form-field"><span>برند</span><select value={draft.brandId} onChange={event => update('brandId', event.target.value)}><option value="">انتخاب برند</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><button type="button" className="admin-editor-text-button" onClick={() => setTaxonomyDialog('brand')}><AdminIcon name="plus" size={15}/>افزودن برند جدید</button><fieldset className="admin-product-categories"><legend>دسته‌بندی‌ها</legend><div>{categories.map(category => <label key={category.id}><input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={event => update('categoryIds', event.target.checked ? [...draft.categoryIds, category.id] : draft.categoryIds.filter(id => id !== category.id))}/><span>{category.parentId ? <span aria-hidden="true">↳ </span> : null}{category.name}</span></label>)}</div><small>اولین انتخاب، دسته‌بندی اصلی محصوله.</small></fieldset><button type="button" className="admin-editor-text-button" onClick={() => setTaxonomyDialog('category')}><AdminIcon name="plus" size={15}/>افزودن دسته‌بندی جدید</button></div></AdminPanel></div>
        <div id={sectionId('pricing')} className="admin-editor-anchor"><AdminPanel title="قیمت و موجودی" action={<AdminIcon name="bag" size={20}/>}><fieldset disabled={external} className="admin-supplier-fieldset admin-editor-aside-fields">
          <label className="admin-form-field"><span>قیمت (تومان)</span><input inputMode="numeric" value={draft.regular} placeholder="مثلاً ۸۶۵۰۰۰۰" onChange={event => update('regular', event.target.value)}/></label>
          <label className="admin-form-field"><span>قیمت با تخفیف (تومان)</span><input inputMode="numeric" value={draft.discount} placeholder="اختیاری" onChange={event => update('discount', event.target.value)}/></label>
          {regular > 0 && discount !== null && discount > 0 && discount < regular ? <div className="admin-discount-preview"><span>{formatNumber(Math.round((regular - discount) / regular * 100))}٪ تخفیف</span><strong>{formatPrice(discount)} تومان</strong></div> : null}
          <label className="admin-form-field"><span>{!external && draft.variants.length ? 'مجموع موجودی تنوع‌ها' : 'موجودی'}</span><input inputMode={external ? 'text' : 'numeric'} readOnly={external || !!draft.variants.length} value={external ? formatStock(initial?.stock, initial?.status) : draft.variants.length ? String(totalStock) : draft.stockText} onChange={event => update('stockText', event.target.value)}/>{!external && draft.variants.length ? <small>از موجودی تنوع‌ها محاسبه می‌شه.</small> : null}</label>
          <label className="admin-form-field"><span>وضعیت محصول</span><select value={draft.status} onChange={event => update('status', event.target.value as AdminProductStatus)}>{Object.entries(productStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </fieldset></AdminPanel></div>
        <AdminPanel title="مرور محصول" className="admin-product-mini-preview"><div className="admin-mini-preview-image">{previewImage ? <Image src={previewImage} alt={draft.name || 'تصویر محصول'} width={220} height={180} unoptimized={previewImage.startsWith('blob:')}/> : <AdminIcon name="products" size={50}/>}</div><small>{brands.find(brand => brand.id === draft.brandId)?.name || 'برند محصول'}</small><h3>{draft.name || 'نام محصول تو'}</h3><div className="admin-mini-preview-bottom"><strong>{regular ? formatPrice(discount && discount < regular && discount > 0 ? discount : regular) : '—'} <small>تومان</small></strong><AdminBadge status={draft.status}/></div><p>{draft.mediaType === 'photo' ? `${formatNumber(draft.images.length)} تصویر معمولی` : 'نمایش سه‌بعدی با حرکت صفحه'}</p></AdminPanel>
      </aside></div>
      <div className="admin-product-bottom-actions"><Link className="admin-button" href="/admin/products">انصراف</Link><div>{actions}</div></div>
    </form>
    {taxonomyDialog ? <AdminTaxonomyDialog kind={taxonomyDialog} onClose={() => setTaxonomyDialog(null)} onSaved={id => { if (taxonomyDialog === 'brand') update('brandId', id); else update('categoryIds', [...draft.categoryIds, id]); }}/> : null}
  </>;
}
