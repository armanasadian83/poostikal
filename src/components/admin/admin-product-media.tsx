'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { AdminAnimationConfig, AdminProductImage } from '@/lib/admin-product-model';
import { validateAdminImageFile } from '@/lib/admin-image-upload';
import { formatNumber } from '@/lib/format';
import { useAdmin } from './admin-provider';
import { AdminIcon, type AdminIconName } from './admin-icon';
import { AdminModal } from './admin-ui';
import { AdminAnimationArtwork } from './admin-animation-artwork';
import { templateDimensions, appearanceForTemplate } from '@/lib/animation-config';

const TemplatePreview = dynamic(() => import('./admin-product-template-preview').then(module => module.AdminProductTemplatePreview), {
  loading: () => <p className="admin-muted" role="status">در حال آماده‌سازی پیش‌نمایش محصول…</p>,
});

const MAX_IMAGES = 8;
const REFERENCE_SLOTS = [
  { slot: 'closed', label: 'بسته‌بندی بسته', description: 'نمای روبه‌رو؛ کل جعبه در کادر باشد.', icon: 'products' },
  { slot: 'open', label: 'بسته‌بندی باز', description: 'درِ باز و داخل بسته‌بندی مشخص باشد.', icon: 'bag' },
  { slot: 'product', label: 'محصول بیرون از جعبه', description: 'محصول کامل و برچسب آن دیده شود.', icon: 'bottle' },
  { slot: 'angle', label: 'زاویهٔ دیگر', description: 'نمای سه‌رخ برای شناخت فرم و عمق.', icon: 'refresh' },
] as const;
const TEMPLATES: { value: AdminAnimationConfig['template']; label: string; description: string; icon: AdminIconName }[] = [
  { value: 'dropper-box', label: 'قطره‌چکان + جعبه', description: 'باز شدن درِ جعبه و بیرون آمدن بطری', icon: 'pipette' },
  { value: 'pump-box', label: 'بطری پمپی + جعبه', description: 'بطری پمپی با درپوش و نازل سه‌بعدی', icon: 'pump' },
  { value: 'jar-box', label: 'ظرف کرم + جعبه', description: 'ظرف کرم با درپوش و برچسب دور ظرف', icon: 'cream' },
  { value: 'pouch-box', label: 'پاکت تخت + جعبهٔ کشویی', description: 'باز شدن درِ کناری و بیرون آمدن نرم پاکت', icon: 'bag' },
  { value: 'custom', label: 'بسته‌بندی اختصاصی', description: 'نیازمند ساخت مدل مخصوص محصول', icon: 'sliders' },
];
const POUCH_DIMENSIONS = [
  { key: 'boxWidth', label: 'عرض جعبه' },
  { key: 'boxHeight', label: 'ارتفاع جعبه' },
  { key: 'boxDepth', label: 'عمق جعبه' },
  { key: 'productWidth', label: 'عرض پاکت' },
  { key: 'productHeight', label: 'ارتفاع پاکت' },
  { key: 'productDepth', label: 'ضخامت پاکت' },
] as const;
const DIMENSIONS = [
  { key: 'boxWidth', label: 'عرض جعبه' },
  { key: 'boxHeight', label: 'ارتفاع جعبه' },
  { key: 'boxDepth', label: 'عمق جعبه' },
  { key: 'productHeight', label: 'ارتفاع محصول' },
  { key: 'productDiameter', label: 'قطر محصول' },
] as const;

function UploadZone({ title, description, multiple = false, disabled = false, busy = false, onFiles }: {
  title: string; description: string; multiple?: boolean; disabled?: boolean; busy?: boolean; onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  }
  return <div className={`admin-upload-zone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`} aria-busy={busy}
    onDragOver={event => { event.preventDefault(); if (!disabled) { event.dataTransfer.dropEffect = 'copy'; setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={drop}>
    <button type="button" className="admin-upload-trigger" disabled={disabled} onClick={() => input.current?.click()}>
      <span className="admin-upload-symbol"><AdminIcon name={busy ? 'refresh' : 'plus'} size={24}/></span>
      <span className="admin-upload-copy"><strong>{title}</strong><small>{description}</small></span>
    </button>
    <input ref={input} className="admin-upload-input" type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={disabled} tabIndex={-1} aria-label={title}
      onChange={event => { if (event.target.files) onFiles(Array.from(event.target.files)); event.target.value = ''; }}/>
  </div>;
}

export type AdminProductMediaProps = {
  mediaType: 'photo' | 'animation';
  images: AdminProductImage[];
  animation: AdminAnimationConfig;
  onMediaTypeChange: (type: 'photo' | 'animation') => void;
  onImagesChange: (images: AdminProductImage[]) => void;
  onAnimationChange: (animation: AdminAnimationConfig) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?:boolean;
};

export function AdminProductMedia({ mediaType, images, animation, onMediaTypeChange, onImagesChange, onAnimationChange, onBusyChange, disabled=false }: AdminProductMediaProps) {
  const { createAssetUrl, prepareAnimation } = useAdmin();
  const [preparing,setPreparing]=useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSeen, setPreviewSeen] = useState('');
  const [uploads, setUploads] = useState<string[]>([]);
  const mounted = useRef(true);
  const activeUploads = useRef(new Map<string, AbortController>());
  const currentImages = useRef(images);
  const currentAnimation = useRef(animation);
  const prefix = useId();
  const errorId = `${prefix}-error`;
  const completedReferences = REFERENCE_SLOTS.filter(({ slot }) => animation.references.some(reference => reference.slot === slot && reference.image?.url)).length;
  const dimensionsValid = DIMENSIONS.every(({ key }) => animation.dimensions[key] === undefined || (Number.isFinite(animation.dimensions[key]) && animation.dimensions[key]! > 0));
  const reviewKey = animation.build?.id || animation.assetUrl || '';
  const chosenTemplate = TEMPLATES.find(template => template.value === animation.template) ?? TEMPLATES[0];

  useEffect(() => { currentImages.current = images; }, [images]);
  useEffect(() => { currentAnimation.current = animation; }, [animation]);
  useEffect(() => {
    mounted.current = true;
    const controllers = activeUploads.current;
    return () => { mounted.current = false; controllers.forEach(controller => controller.abort()); controllers.clear(); };
  }, []);

  function cancelUpload(key: string) {
    activeUploads.current.get(key)?.abort();
    activeUploads.current.delete(key);
    if (mounted.current) { setUploads(previous => previous.filter(item => item !== key)); onBusyChange?.(activeUploads.current.size > 0); }
  }
  function changeMediaType(type: 'photo' | 'animation') {
    activeUploads.current.forEach(controller => controller.abort());
    activeUploads.current.clear();
    setUploads([]);
    onBusyChange?.(false);
    setError('');
    onMediaTypeChange(type);
  }
  async function inspectUploads(key: string, files: File[], accept: (validFiles: File[], errors: string[]) => void) {
    if (!files.length) return;
    activeUploads.current.get(key)?.abort();
    const controller = new AbortController();
    activeUploads.current.set(key, controller);
    setUploads(previous => previous.includes(key) ? previous : [...previous, key]);
    onBusyChange?.(true);
    const validFiles: File[] = [];
    const errors: string[] = [];
    try {
      for (const file of files) {
        try { await validateAdminImageFile(file, controller.signal); validFiles.push(file); }
        catch (issue) {
          if (controller.signal.aborted) return;
          errors.push(`«${file.name}»: ${issue instanceof Error ? issue.message : 'فایل تصویر معتبر نیست.'}`);
        }
      }
      if (!mounted.current || controller.signal.aborted || activeUploads.current.get(key) !== controller) return;
      accept(validFiles, errors);
    } finally {
      if (activeUploads.current.get(key) === controller) {
        activeUploads.current.delete(key);
        if (mounted.current) { setUploads(previous => previous.filter(item => item !== key)); onBusyChange?.(activeUploads.current.size > 0); }
      }
    }
  }
  function commitPhotos(next: AdminProductImage[]) {
    currentImages.current = next;
    onImagesChange(next);
  }
  function commitAnimation(next: AdminAnimationConfig) {
    currentAnimation.current = next;
    onAnimationChange(next);
  }

  function imageFromFile(file: File, previous?: AdminProductImage | null): AdminProductImage {
    return { id: previous?.id ?? crypto.randomUUID(), url: createAssetUrl(file), fileName: file.name, alt: previous?.alt ?? '', description: previous?.description ?? '' };
  }
  function updateAnimation(next: AdminAnimationConfig) {
    setPreviewSeen('');
    commitAnimation({ ...next, build: undefined, reviewConfirmed: false });
  }
  function changeReference(slot: typeof REFERENCE_SLOTS[number]['slot'], image: AdminProductImage | null) {
    const latest = currentAnimation.current;
    updateAnimation({ ...latest, references: REFERENCE_SLOTS.map(reference => ({ slot: reference.slot, image: reference.slot === slot ? image : latest.references.find(item => item.slot === reference.slot)?.image ?? null })) });
  }
  function addPhotos(files: File[]) {
    void inspectUploads('photos:add', files.slice(0, MAX_IMAGES), (validFiles, errors) => {
      const latest = currentImages.current;
      const remaining = Math.max(0, MAX_IMAGES - latest.length);
      const accepted = validFiles.slice(0, remaining);
      if (files.length > MAX_IMAGES || validFiles.length > remaining) errors.push('حداکثر ۸ تصویر می‌توانی اضافه کنی.');
      if (accepted.length) commitPhotos([...latest, ...accepted.map(file => imageFromFile(file))]);
      setError(errors.join(' '));
    });
  }
  function replacePhoto(index: number, files: File[]) {
    const file = files[0];
    const target = currentImages.current[index];
    if (!file || !target) return;
    void inspectUploads(`photo:${target.id}`, [file], (validFiles, errors) => {
      const latest = currentImages.current;
      const existing = latest.find(image => image.id === target.id);
      if (validFiles[0] && existing) commitPhotos(latest.map(image => image.id === target.id ? imageFromFile(validFiles[0], image) : image));
      setError(errors.join(' '));
    });
  }
  function uploadReference(slot: typeof REFERENCE_SLOTS[number]['slot'], files: File[]) {
    const file = files[0];
    if (!file) return;
    void inspectUploads(`reference:${slot}`, [file], (validFiles, errors) => {
      if (validFiles[0]) { const image=imageFromFile(validFiles[0], currentAnimation.current.references.find(reference => reference.slot === slot)?.image); if(!image.alt)image.alt=REFERENCE_SLOTS.find(ref=>ref.slot===slot)!.label; changeReference(slot,image); }
      setError(errors.join(' '));
    });
  }
  function uploadThumbnail(files: File[]) {
    if (!files[0]) return;
    void inspectUploads('thumbnail', [files[0]], (validFiles, errors) => {
      if (validFiles[0]) {
        const thumbnail = imageFromFile(validFiles[0], currentAnimation.current.thumbnail);
        if (!thumbnail.alt) thumbnail.alt = 'تصویر بندانگشتی محصول';
        // A storefront cover is independent of the geometry and its approved build.
        commitAnimation({ ...currentAnimation.current, thumbnail });
      }
      setError(errors.join(' '));
    });
  }
  function movePhoto(index: number, destination: number) {
    if (destination < 0 || destination >= currentImages.current.length) return;
    const next = [...currentImages.current];
    const [image] = next.splice(index, 1);
    next.splice(destination, 0, image);
    commitPhotos(next);
  }
  function goToStep(next: number) {
    if (next > step && uploads.length) { setError('کمی صبر کن تا بررسی تصاویر تمام شود.'); return; }
    if (next > 0 && completedReferences !== REFERENCE_SLOTS.length) { setError('برای ادامه، هر چهار تصویر مرجع را اضافه کن.'); return; }
    if (next > 1 && !dimensionsValid) { setError('ابعاد واردشده باید عددی بزرگ‌تر از صفر باشند؛ فیلدهای اختیاری را می‌توانی خالی بگذاری.'); return; }
    setError('');
    setStep(next);
  }

  async function buildAnimation() {
    setError('');setPreparing(true);onBusyChange?.(true);setPreviewSeen('');
    try {
      const result=await prepareAnimation(currentAnimation.current);
      if(mounted.current){commitAnimation(result);setPreviewOpen(true);}
    } catch(issue) {if(mounted.current)setError(issue instanceof Error?issue.message:'ساخت انیمیشن انجام نشد؛ دوباره امتحان کن.');}
    finally {if(mounted.current){setPreparing(false);onBusyChange?.(activeUploads.current.size>0);}}
  }

  return <div className="admin-product-media" aria-busy={uploads.length > 0 || preparing}>
    <fieldset className="admin-media-fieldset" disabled={preparing || disabled}>
    <div className="admin-media-heading"><div><h3>تصاویر و نمایش محصول</h3><p className="admin-small admin-muted">نوع نمایش را انتخاب کن؛ اطلاعات هر دو حالت حفظ می‌شوند.</p></div>
      <div className="admin-media-pills" role="group" aria-label="نوع نمایش محصول">
        <button type="button" aria-pressed={mediaType === 'photo'} className={mediaType === 'photo' ? 'is-active' : ''} onClick={() => changeMediaType('photo')}><AdminIcon name="grid" size={17}/>عکس معمولی</button>
        <button type="button" aria-pressed={mediaType === 'animation'} className={mediaType === 'animation' ? 'is-active' : ''} onClick={() => changeMediaType('animation')}><AdminIcon name="products" size={17}/>انیمیشن</button>
      </div>
    </div>
    {mediaType === 'photo' ? <div>
      <UploadZone title={uploads.includes('photos:add') ? 'در حال بررسی تصاویر…' : images.length >= MAX_IMAGES ? 'ظرفیت گالری کامل است' : 'تصاویر محصول را اینجا بکش یا انتخاب کن'} description={`JPG، PNG یا WebP · هر فایل تا ۵ مگابایت · ${formatNumber(images.length)} از ۸ تصویر`} multiple busy={uploads.includes('photos:add')} disabled={images.length >= MAX_IMAGES || uploads.includes('photos:add')} onFiles={addPhotos}/>
      <p className="admin-media-note">اولین عکس، تصویر اصلی محصول است. ترتیب تصاویر را با دکمه‌های هر عکس تغییر بده.</p>
      {images.length ? <div className="admin-media-gallery">{images.map((image, index) => <article className={`admin-media-card${index === 0 ? ' is-cover' : ''}`} key={image.id}>
        <div className="admin-media-image"><Image src={image.url} alt={image.alt || `تصویر محصول ${formatNumber(index + 1)}`} width={300} height={260} unoptimized/><span className="admin-media-image-meta">{index === 0 ? 'تصویر اصلی' : `تصویر ${formatNumber(index + 1)}`}</span></div>
        <div className="admin-media-card-fields">
          {image.fileName ? <p className="admin-small admin-muted" dir="auto" title={image.fileName}>{image.fileName}</p> : null}
          <label className="admin-form-field"><span>متن جایگزین عکس {formatNumber(index + 1)}</span><input className="admin-field" value={image.alt} maxLength={220} onChange={event => commitPhotos(currentImages.current.map(item => item.id === image.id ? { ...item, alt: event.target.value } : item))} placeholder="مثلاً نمای روبه‌روی سرم با جعبه"/></label>
          <label className="admin-form-field"><span>توضیح عکس {formatNumber(index + 1)}</span><textarea className="admin-field" rows={2} value={image.description} maxLength={500} onChange={event => commitPhotos(currentImages.current.map(item => item.id === image.id ? { ...item, description: event.target.value } : item))} placeholder="توضیح کوتاه این نما…"/></label>
        </div>
        <div className="admin-media-card-actions">
          <button type="button" className="admin-button" disabled={index === 0} onClick={() => movePhoto(index, 0)}><AdminIcon name="check" size={15}/>{index === 0 ? 'تصویر اصلی' : 'انتخاب اصلی'}</button>
          <button type="button" className="admin-icon-button" aria-label={`جابه‌جایی عکس ${formatNumber(index + 1)} به قبل`} disabled={index === 0} onClick={() => movePhoto(index, index - 1)}><AdminIcon name="arrow-right" size={16}/></button>
          <button type="button" className="admin-icon-button" aria-label={`جابه‌جایی عکس ${formatNumber(index + 1)} به بعد`} disabled={index === images.length - 1} onClick={() => movePhoto(index, index + 1)}><AdminIcon name="arrow-left" size={16}/></button>
          <ReplaceImage label={`تعویض عکس ${formatNumber(index + 1)}`} busy={uploads.includes(`photo:${image.id}`)} onFiles={files => replacePhoto(index, files)}/>
          <button type="button" className="admin-icon-button" aria-label={`حذف عکس ${formatNumber(index + 1)}`} onClick={() => { cancelUpload(`photo:${image.id}`); commitPhotos(currentImages.current.filter(item => item.id !== image.id)); setError(''); }}><AdminIcon name="trash" size={16}/></button>
        </div>
      </article>)}</div> : null}
    </div> : <div className="admin-animation-wizard">
      <section className="admin-animation-thumbnail" aria-labelledby={`${prefix}-thumbnail-title`}>
        <div className="admin-media-heading"><div><h4 id={`${prefix}-thumbnail-title`}>تصویر بندانگشتی محصول</h4><p className="admin-small admin-muted">عکس مخصوص کارت محصول در فروشگاه؛ مستقل از چهار تصویر مرجع و حرکت سه‌بعدی.</p></div><span className="admin-badge">کاور فروشگاه</span></div>
        <div className="admin-animation-thumbnail-layout">
          <div className="admin-animation-thumbnail-preview">{animation.thumbnail ? <Image src={animation.thumbnail.url} alt={animation.thumbnail.alt || 'تصویر بندانگشتی محصول'} width={260} height={260} unoptimized/> : <><AdminIcon name="products" size={42}/><span>کاور محصول</span></>}</div>
          <div className="admin-animation-thumbnail-fields">
            <UploadZone title={uploads.includes('thumbnail') ? 'در حال بررسی کاور…' : animation.thumbnail ? 'تعویض تصویر بندانگشتی' : 'بارگذاری تصویر بندانگشتی'} description="JPG، PNG یا WebP · تا ۵ مگابایت · پس‌زمینهٔ ساده یا شفاف" busy={uploads.includes('thumbnail')} disabled={uploads.includes('thumbnail')} onFiles={uploadThumbnail}/>
            {animation.thumbnail ? <>
              <label className="admin-form-field"><span>متن جایگزین تصویر بندانگشتی</span><input className="admin-field" maxLength={220} value={animation.thumbnail.alt} onChange={event=>commitAnimation({...currentAnimation.current,thumbnail:{...currentAnimation.current.thumbnail!,alt:event.target.value}})}/></label>
              <label className="admin-form-field"><span>توضیح تصویر بندانگشتی</span><textarea className="admin-field" rows={2} maxLength={500} value={animation.thumbnail.description} onChange={event=>commitAnimation({...currentAnimation.current,thumbnail:{...currentAnimation.current.thumbnail!,description:event.target.value}})}/></label>
              <button type="button" className="admin-button" onClick={()=>{cancelUpload('thumbnail');commitAnimation({...currentAnimation.current,thumbnail:null});}}><AdminIcon name="trash" size={16}/>حذف تصویر بندانگشتی</button>
            </> : <p className="admin-media-note">تا زمان انتخاب کاور، عکس اول گالری یا طرح آمادهٔ جعبه نمایش داده می‌شود.</p>}
            {images.length ? <div className="admin-thumbnail-gallery" role="group" aria-label="انتخاب کاور از گالری">{images.map((image,index)=><button key={image.id} type="button" aria-label={`انتخاب عکس ${formatNumber(index+1)} گالری برای بندانگشتی`} aria-pressed={animation.thumbnail?.url===image.url} onClick={()=>{cancelUpload('thumbnail');commitAnimation({...currentAnimation.current,thumbnail:{...image}});}}><Image src={image.url} alt={image.alt || `عکس ${formatNumber(index+1)}`} width={64} height={64} unoptimized/></button>)}<span>یا از گالری همین محصول انتخاب کن.</span></div> : null}
          </div>
        </div>
      </section>
      <p className="admin-media-note"><AdminIcon name="sparkles" size={17}/>چهار عکس را اضافه کن، قالب و طرح چاپی را تنظیم کن و نمایش سه‌بعدی همین محصول را بساز.</p>
      <div className="admin-animation-steps" aria-label="مراحل آماده‌سازی انیمیشن">{['تصاویر مرجع', 'فرم و طرح محصول', 'ساخت و تأیید'].map((title, index) => <button type="button" key={title} className={`${step === index ? 'is-active' : ''}${index < step ? ' is-complete' : ''}`} aria-current={step === index ? 'step' : undefined} onClick={() => goToStep(index)}><span>{index < step ? <AdminIcon name="check" size={14}/> : formatNumber(index + 1)}</span>{title}</button>)}</div>
      <div className="admin-animation-step-content">
        {step === 0 ? <div>
          <div className="admin-media-heading"><div><h4>چهار نما، یک شناخت بهتر از محصول</h4><p className="admin-small admin-muted">ترجیحاً نور یکسان، پس‌زمینهٔ ساده و بدون دست. هر فایل تا ۵ مگابایت.</p></div><span className="admin-badge">{formatNumber(completedReferences)} از ۴ نما</span></div>
          <div className="admin-animation-references">{REFERENCE_SLOTS.map(({ slot, label, description, icon }, index) => {
            const reference = animation.references.find(item => item.slot === slot)?.image;
            return <article className={`admin-animation-reference${reference ? ' has-image' : ''}`} key={slot}>
              <div className="admin-reference-copy"><span className="admin-reference-number">{formatNumber(index + 1)}</span><div><h4>{label}</h4><p>{description}</p></div></div>
              {reference ? <><div className="admin-reference-image"><Image src={reference.url} alt={reference.alt || label} width={270} height={220} unoptimized/></div>
                <label className="admin-form-field"><span>متن جایگزین · {label}</span><input className="admin-field" value={reference.alt} maxLength={220} onChange={event => changeReference(slot, { ...reference, alt: event.target.value })} placeholder={label}/></label>
                <label className="admin-form-field"><span>توضیح مرجع · {label}</span><textarea className="admin-field" rows={2} maxLength={500} value={reference.description} onChange={event => changeReference(slot, { ...reference, description: event.target.value })} placeholder="جزئیات مهم این تصویر…"/></label>
                <div className="admin-reference-actions"><ReplaceImage label={`تعویض ${label}`} busy={uploads.includes(`reference:${slot}`)} onFiles={files => uploadReference(slot, files)}/><button type="button" className="admin-button" onClick={() => { cancelUpload(`reference:${slot}`); changeReference(slot, null); }}><AdminIcon name="trash" size={15}/>حذف</button></div>
              </> : <><div className="admin-template-symbol"><AdminIcon name={icon} size={32}/></div><UploadZone title={uploads.includes(`reference:${slot}`) ? 'در حال بررسی تصویر…' : `افزودن ${label}`} description="انتخاب یا کشیدن فایل · JPG، PNG، WebP" busy={uploads.includes(`reference:${slot}`)} disabled={uploads.includes(`reference:${slot}`)} onFiles={files => uploadReference(slot, files)}/></>}
            </article>;
          })}</div>
        </div> : null}
        {step === 1 ? <div>
          <h4>فرم بسته‌بندی محصول را انتخاب کن</h4><p className="admin-small admin-muted">عکس‌ها به‌تنهایی هندسهٔ دقیق نمی‌سازند؛ قالب، فرم و حرکت مدل را مشخص می‌کند.</p>
          <div className="admin-animation-templates" role="group" aria-label="قالب بسته‌بندی">{TEMPLATES.map(template => <button type="button" key={template.value} className={`admin-template-option${animation.template === template.value ? ' is-active' : ''}`} aria-pressed={animation.template === template.value} onClick={() => { const changesShape = (animation.template === 'pouch-box') !== (template.value === 'pouch-box'); updateAnimation({ ...animation, template: template.value, ...(changesShape ? {dimensions:{},appearance:appearanceForTemplate(template.value),openingSide:undefined} : {}) }); }}><span className="admin-template-symbol"><AdminIcon name={template.icon} size={29}/></span><span className="admin-template-copy"><strong>{template.label}</strong><small>{template.description}</small></span>{animation.template === template.value ? <AdminIcon name="check" size={17}/> : null}</button>)}</div>
          {animation.template === 'custom' ? <p className="admin-media-note">این بسته‌بندی به مدل و حرکت اختصاصی نیاز دارد. خروجی نهایی GLB یا MP4 را در بخش فایل اختصاصی پایین همین فرم اضافه کن.</p> : null}
          <div className="admin-media-heading"><div><h4>اندازه‌ها <small className="admin-muted">اختیاری · میلی‌متر</small></h4><p className="admin-small admin-muted">اندازه‌های واقعی، تناسب جعبه و محصول را برای ساخت مدل مشخص می‌کنند.</p></div></div>
          {animation.template !== 'custom' ? <button type="button" className="admin-button" onClick={()=>updateAnimation({...animation,dimensions:{}})}>اندازه‌های پیش‌فرض قالب</button> : null}
          <div className="admin-dimension-grid">{(animation.template === 'pouch-box' ? POUCH_DIMENSIONS : DIMENSIONS).map(({ key, label }) => <label className="admin-form-field" key={key}><span>{label}</span><input className="admin-field" type="number" min="0.1" step="any" inputMode="decimal" dir="ltr" value={animation.dimensions[key] ?? ''} aria-invalid={animation.dimensions[key] !== undefined && (!Number.isFinite(animation.dimensions[key]) || animation.dimensions[key]! <= 0)} onChange={event => updateAnimation({ ...animation, dimensions: { ...animation.dimensions, [key]: event.target.value === '' ? undefined : Number(event.target.value) } })} placeholder={animation.template === 'custom' ? "mm" : String(templateDimensions[animation.template][key])}/></label>)}</div>
          {animation.template === 'pouch-box' ? <label className="admin-form-field"><span>جهت باز شدن جعبه</span><select className="admin-field" value={animation.openingSide ?? 'left'} onChange={event=>updateAnimation({...animation,openingSide:event.target.value as 'left'|'right'})}><option value="left">از سمت چپ</option><option value="right">از سمت راست</option></select><small className="admin-muted">درِ کناری باز می‌شود، پاکت کاملاً بیرون می‌آید و کنار جعبه قرار می‌گیرد.</small></label> : null}
          {animation.template !== 'custom' ? <AdminAnimationArtwork animation={animation} onChange={updateAnimation}/> : null}
        </div> : null}
        {step === 2 ? <div className="admin-animation-review">
          <div className="admin-media-heading"><div><h4>محصولت را زنده ببین</h4><p className="admin-small admin-muted">{animation.template==='pouch-box'?'باز شدن درِ کناری، خروج کامل پاکت و قرار گرفتن آن کنار جعبه؛ حرکت با اسکرول قابل برگشت است.':'حرکت یکپارچهٔ باز شدن جعبه، بیرون آمدن محصول و قرار گرفتن آن پشت بسته‌بندی.'}</p></div><span className="admin-badge">{chosenTemplate.label}</span></div>
          <div className="admin-animation-review-assets">{REFERENCE_SLOTS.map(({ slot, label }) => { const image = animation.references.find(reference => reference.slot === slot)?.image; return <div key={slot}><div className="admin-animation-review-image">{image ? <Image src={image.url} alt={image.alt || label} width={160} height={150} unoptimized/> : <AdminIcon name="products" size={30}/>}</div><span>{label}</span></div>; })}</div>
          <dl className="admin-animation-review-settings"><div><dt>قالب</dt><dd>{chosenTemplate.label}</dd></div><div><dt>وضعیت</dt><dd>{preparing?'در حال آماده‌سازی طرح‌ها…':animation.build?'نمایش سه‌بعدی ساخته شد':animation.assetUrl?'فایل اختصاصی آماده است':'آمادهٔ ساخت'}</dd></div></dl>
          {animation.template !== 'custom' ? <button type="button" className="admin-button admin-button-primary" disabled={preparing || uploads.length>0} onClick={buildAnimation}><AdminIcon name={preparing?'refresh':'sparkles'} size={18}/>{preparing?'در حال ساخت…':animation.build?'بازسازی انیمیشن':'ساخت انیمیشن محصول'}</button> : <p className="admin-media-note">فایل اختصاصی را در پایین فرم اضافه کن، سپس پیش‌نمایش را بررسی کن.</p>}
          {animation.build || animation.assetUrl ? <button type="button" className="admin-button" onClick={()=>setPreviewOpen(true)}><AdminIcon name="play" size={17}/>دیدن پیش‌نمایش محصول</button> : null}
          {animation.build?.warnings.map(warning=><p className="admin-media-note" key={warning}>{warning}</p>)}
          <label className="admin-review-confirm"><input type="checkbox" checked={animation.reviewConfirmed} disabled={(previewSeen !== reviewKey && !animation.reviewConfirmed) || (!animation.build && !animation.assetUrl)} onChange={event => commitAnimation({ ...currentAnimation.current, reviewConfirmed: event.target.checked })}/><span>طرح، تناسب و حرکت همین محصول را دیدم و تأیید می‌کنم.</span></label>
          {previewSeen !== reviewKey && !animation.reviewConfirmed ? <p className="admin-small admin-muted">ابتدا انیمیشن را بساز و پیش‌نمایش آن را ببین. بعد از تأیید می‌توانی محصول را منتشر کنی.</p> : null}
        </div> : null}
      </div>
      <div className="admin-wizard-actions"><button type="button" className="admin-button" disabled={step === 0} onClick={() => goToStep(step - 1)}><AdminIcon name="arrow-right" size={16}/>مرحلهٔ قبل</button>{step < 2 ? <button type="button" className="admin-button admin-button-primary" onClick={() => goToStep(step + 1)}>ادامه<AdminIcon name="arrow-left" size={16}/></button> : <span className="admin-small admin-muted">{animation.reviewConfirmed ? 'بررسی اطلاعات تأیید شد.' : 'پس از بررسی، محصول را از بالای صفحه ذخیره کن.'}</span>}</div>
    </div>}
    </fieldset>
    {preparing ? <p className="admin-build-status" role="status"><span/>در حال ذخیرهٔ عکس‌ها و آماده‌سازی طرح‌های باکیفیت…</p> : null}
    {error ? <p id={errorId} className="admin-form-error" role="alert">{error}</p> : null}
    {previewOpen ? <AdminModal title="پیش‌نمایش انیمیشن محصول" wide onClose={() => setPreviewOpen(false)}><TemplatePreview animation={animation} onReady={()=>setPreviewSeen(reviewKey)}/></AdminModal> : null}
  </div>;
}

function ReplaceImage({ label, busy = false, onFiles }: { label: string; busy?: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <><button type="button" className="admin-icon-button" disabled={busy} aria-busy={busy} aria-label={busy ? `در حال بررسی · ${label}` : label} title={busy ? 'در حال بررسی تصویر…' : label} onClick={() => input.current?.click()}><AdminIcon name={busy ? 'refresh' : 'edit'} size={16}/></button><input ref={input} className="admin-upload-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={busy} tabIndex={-1} onChange={event => { if (event.target.files) onFiles(Array.from(event.target.files)); event.target.value = ''; }}/></>;
}
