'use client';
import {useSiteSettings} from './site-settings-provider';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCatalog } from './catalog-provider';
import { skinTypeOptions, type Product } from '@/lib/catalog';
import { formatNumber, formatPrice } from '@/lib/format';
import {useAddToCart} from './cart-access';
import { toggleSaved, useStore } from '@/lib/store';
import { Icon } from './icons';
import { ProductCard } from './product-card';
import { ProductAudioPlayer } from './product-audio';
import { RichText } from './rich-text';
import { ProductAnimation } from './product-animation';
import { sceneConfig } from '@/lib/animation-config';
import { ProductUnboxing } from './product-unboxing';
import { useUI } from './site-shell';

export function ProductDetail({ product, preview = false, categoryLabel }: { product: Product; preview?: boolean; categoryLabel?: string }) {
  const Root = preview ? 'div' : 'main';
  const {settings:{shop:config}}=useSiteSettings();
  const { products, categoryOptions } = useCatalog();
  const [variantId, setVariantId] = useState((product.variants.find(item=>item.stock!==0&&item.priceToman>0)??product.variants[0]).id);
  const [quantity, updateQuantity] = useState(1);
  const { saved } = useStore();
  const { openPanel } = useUI();
  const {add,pending}=useAddToCart();
  const variant = product.variants.find(item => item.id === variantId)!;
  const isSaved = saved.includes(product.id);
  const category = categoryOptions.find(option => option.id === product.category);
  const generatedScene = useMemo(()=>product.animation ? sceneConfig(product.animation) : undefined,[product.animation]);
  const hasUnboxing = product.mediaType === 'animation' && !!(generatedScene || product.animation?.assetUrl);
  const [photoIndex,setPhotoIndex] = useState(0);
  const photo = product.images?.[photoIndex];
  const brandSuffix = ` – ${product.brand}`;
  const titleWithoutBrand = product.name.endsWith(brandSuffix) ? product.name.slice(0, -brandSuffix.length) : null;

  const saveButton = <button className={`wishlist-button ${isSaved ? 'is-saved' : ''}`} aria-disabled={preview} onClick={() => { if (!preview) toggleSaved(product.id); }} aria-label={isSaved ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'} aria-pressed={isSaved}><Icon name="heart"/></button>;
  const fullDescription = product.description ? <section className="product-full-description" aria-labelledby="product-description-title"><h2 id="product-description-title">دربارهٔ این محصول</h2><RichText content={product.description}/></section> : null;

  const purchaseCopy = <div className="detail-copy">
    <div className="detail-brand-row">
      {product.brand && <Link href={`/brands?brand=${encodeURIComponent(product.brand)}`} className="detail-brand" dir="ltr">{product.brand}</Link>}
      {hasUnboxing ? saveButton : null}
    </div>
    <h1>{titleWithoutBrand ? <>{titleWithoutBrand}<span className="detail-name-brand">{' – '}<bdi>{product.brand}</bdi></span></> : product.name}</h1>
    {product.shortDescription ? <RichText className="detail-description" content={product.shortDescription}/> : null}
    {product.skinTypes.length ? <div className="skin-tags">{product.skinTypes.map(type => <span key={type}>{skinTypeOptions.find(option => option.id === type)?.label}</span>)}</div> : null}
    <fieldset className="variant-field" id={hasUnboxing ? 'unboxing-purchase' : undefined}>
      <legend>انتخاب بسته‌بندی</legend>
      <div>{product.variants.map(item => <button key={item.id} className={item.id === variantId ? 'selected' : ''} onClick={() => {setVariantId(item.id);updateQuantity(1);setPhotoIndex(Math.max(0,product.images?.findIndex(image=>image.url===item.image)??0));}} aria-pressed={item.id === variantId}>{item.label}{item.id === variantId ? <Icon name="check" size={16}/> : null}</button>)}</div>
    </fieldset>
    {config.showAudio?<ProductAudioPlayer audio={product.audio} productName={product.name}/>:null}
    <div className="detail-price-row"><p className="price">{variant.priceToman > 0 ? <>{formatPrice(variant.priceToman)} <span>تومان</span></> : 'تماس برای قیمت'}</p><span className="subtle small" aria-live="polite">{product.status==='out-of-stock'||product.stock===0||variant.stock===0?'ناموجود':'موجود'}</span></div>
    <div className="purchase-row">
      <div className="quantity-control"><button aria-label="افزایش تعداد" disabled={quantity >= Math.min(20,variant.stock??20)} onClick={() => updateQuantity(value => Math.min(20, value + 1))}><Icon name="plus" size={18}/></button><span>{formatNumber(quantity)}</span><button aria-label="کاهش تعداد" disabled={quantity <= 1} onClick={() => updateQuantity(value => Math.max(1, value - 1))}><Icon name="minus" size={18}/></button></div>
      <button className="button primary" disabled={pending || variant.priceToman <= 0 || product.status === "out-of-stock" || product.stock === 0 || variant.stock === 0} aria-disabled={preview} onClick={() => { if(!preview)void add(product,variantId,quantity); }}><Icon name="bag" size={20}/>افزودن به سبد خرید</button>
    </div>
    <div className="detail-highlights">{product.highlights.map(highlight => <p key={highlight}><Icon name="check" size={17}/><span>{highlight}</span></p>)}</div>
    {config.showQuiz?<button className="detail-quiz-link" aria-disabled={preview} onClick={() => {if(!preview)openPanel('quiz');}}><Icon name="leaf" size={20}/><span>{config.quizLabel}</span><Icon name="arrow-left" size={18}/></button>:null}
  </div>;

  return <Root id={preview ? undefined : "main-content"} data-product={product.slug} className={`product-page themed-product-page container${hasUnboxing ? ' unboxing-product-page' : ' standard-product-page'}`}>
    <nav className="breadcrumb" aria-label="مسیر صفحه"><Link href="/">خانه</Link><span>/</span><Link href="/shop">فروشگاه</Link><span>/</span><span>{categoryLabel ?? category?.label}</span></nav>
    {hasUnboxing && (generatedScene || product.animation?.assetType==='model') ? <ProductUnboxing config={generatedScene} modelUrl={product.animation?.assetType==='model'?product.animation.assetUrl:undefined} images={product.images} name={product.name} poster={product.image}>{purchaseCopy}{fullDescription}</ProductUnboxing> : hasUnboxing ? <ProductAnimation url={product.animation!.assetUrl!} type={product.animation!.assetType ?? "video"} poster={product.image}>{purchaseCopy}{fullDescription}</ProductAnimation> : <div className="product-detail-layout"><div><div className="detail-image"><Image src={photo?.url ?? variant.image ?? product.image} alt={photo?.alt || product.name} fill priority sizes="(max-width: 760px) 90vw, 45vw"/>{saveButton}</div>{(product.images?.length ?? 0)>1 ? <div className="product-thumbnails">{product.images!.map((image,index)=><button key={image.id} className={index===photoIndex?"selected":""} onClick={()=>setPhotoIndex(index)} aria-label={image.alt || `تصویر ${index+1}`} aria-pressed={index===photoIndex}><Image src={image.url} width={70} height={70} alt={image.alt}/></button>)}</div> : null}{photo?.description ? <p className="subtle small">{photo.description}</p>:null}</div>{purchaseCopy}</div>}
    {!hasUnboxing ? fullDescription : null}
    {!preview && config.showRelated && <section className="related-section"><div className="section-heading"><h2>{config.relatedTitle}</h2><Link className="text-link" href="/shop">همه محصولات<Icon name="arrow-left" size={19}/></Link></div><div className="product-grid">{products.filter(item => item.id !== product.id).slice(0, 4).map((item, index) => <ProductCard product={item} key={item.id} index={index}/>)}</div></section>}
  </Root>;
}
