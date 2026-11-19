'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';
import { getProductCardCopy } from '@/lib/product-card-copy';
import {useAddToCart} from './cart-access';
import { toggleSaved, useStore } from '@/lib/store';
import { Icon } from './icons';

export function ProductCard({ product, index = 0, variantId, preview = false }: { product: Product; index?: number; variantId?: string; preview?: boolean }) {
  const { saved } = useStore();
  const {add,pending}=useAddToCart();
  const isSaved = saved.includes(product.id);
  const variant = product.variants.find(item=>item.id===variantId) ?? product.variants.find(item=>item.stock!==0&&item.priceToman>0) ?? product.variants[0];
  const inStock = product.status !== 'out-of-stock' && product.stock !== 0 && variant.stock !== 0;
  const copy = getProductCardCopy(product);
  return <article className="product-card" data-product={product.slug} style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}>
    {product.brand ? <span className="product-brand-ribbon" dir="auto" title={product.brand}>{product.brand}</span> : null}
    <button type="button" className={`wishlist-button ${isSaved ? 'is-saved' : ''}`} aria-label={isSaved ? `حذف ${product.name} از علاقه‌مندی‌ها` : `ذخیره ${product.name}`} aria-pressed={isSaved} onClick={() => toggleSaved(product.id)}><Icon name="heart" size={18}/></button>
    <div className="product-card-main">
      <div className="product-card-copy">
        <h3 className="product-card-heading"><Link href={`/products/${product.slug}`} className="product-title" dir="auto" title={product.name}>{copy.title}</Link></h3>
        {!preview && <span className={`product-stock-status${inStock ? '' : ' is-unavailable'}`} dir="rtl">{inStock ? 'موجود' : 'ناموجود'}</span>}
      </div>
      <div className="product-image-wrap">
        <Link className="product-image-link" href={`/products/${product.slug}`} aria-label={`مشاهده ${product.name}`}><Image className="product-image" src={product.mediaType === 'animation' ? product.image : variant.image ?? product.image} alt={product.imageAlt || product.name} fill quality={95} sizes="(max-width: 740px) 42vw, (max-width: 1399px) 220px, 200px"/></Link>
      </div>
    </div>
    <div className="product-bottom">
      <p className="price">{preview ? <span>قیمت روز در فروشگاه</span> : variant.priceToman > 0 ? <><bdi>{formatPrice(variant.priceToman)}</bdi><span>تومان</span></> : <span>تماس برای قیمت</span>}</p>
      {variant.label !== 'بسته‌بندی اصلی' ? <span className="product-package" title={variant.label} aria-label={`بسته‌بندی: ${variant.label}`}><bdi>{variant.label}</bdi></span> : null}
      <button type="button" className="add-button" disabled={preview || pending || variant.priceToman <= 0 || !inStock} aria-label={`افزودن ${product.name} به سبد`} title={preview ? 'برای بررسی قیمت و موجودی، محصول رو باز کن' : inStock ? 'افزودن به سبد' : 'ناموجود'} onClick={() => void add(product,variant.id)}><Icon name="bag" size={20}/></button>
    </div>
  </article>;
}
