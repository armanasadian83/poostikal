import { categoryOptions, type ProductVariant } from './catalog';

export type AdminProductStatus = 'active' | 'draft' | 'out-of-stock';
export type AdminMediaType = 'photo' | 'animation';
export type AdminAnimationSlot = 'closed' | 'open' | 'product' | 'angle';
export type AdminAnimationTemplate = 'dropper-box' | 'pump-box' | 'jar-box' | 'pouch-box' | 'custom';

export interface AdminProductAttribute { id: string; key: string; value: string }
export interface AdminProductImage { id: string; url: string; alt: string; description: string; fileName?: string }
export interface AdminProductVariant extends ProductVariant {
  regularPriceToman?: number;
  discountPriceToman?: number;
  sku?: string;
  stock?: number | null;
  attributes?: AdminProductAttribute[];
}
export interface AdminAnimationDimensions {
  boxWidth?: number;
  boxHeight?: number;
  boxDepth?: number;
  productHeight?: number;
  productDiameter?: number;
  productWidth?: number;
  productDepth?: number;
}
export interface AdminAnimationReference { slot: AdminAnimationSlot; image: AdminProductImage | null }
export interface AdminAnimationConfig {
  thumbnail?: AdminProductImage | null;
  openingSide?: 'left' | 'right';
  artwork?: import('./animation-config').AnimationArtwork;
  appearance?: import('./animation-config').AnimationAppearance;
  build?: import('./animation-config').AnimationBuild;
  assetUrl?: string;
  assetType?: "video" | "model";
  references: AdminAnimationReference[];
  template: AdminAnimationTemplate;
  dimensions: AdminAnimationDimensions;
  reviewConfirmed: boolean;
}
export interface AdminProduct {
  audio?: (import('./product-audio').ProductAudio & { fileName?: string }) | null;
  version?: number;
  id: string;
  slug: string;
  name: string;
  brand: string;
  brandId: string;
  category: string;
  categoryIds: string[];
  image: string;
  images: AdminProductImage[];
  description: string;
  shortDescription: string;
  attributes: AdminProductAttribute[];
  regularPriceToman: number;
  discountPriceToman?: number;
  priceToman: number;
  supplier?: { name: 'raboteb'; sourceId: number; url: string; checkedAt: string };
  stock: number | null;
  status: AdminProductStatus;
  variants: AdminProductVariant[];
  mediaType: AdminMediaType;
  animation: AdminAnimationConfig;
}
export interface AdminCategory { id: string; name: string; slug: string; description: string; parentId: string | null; image?: string }
export interface AdminBrand { id: string; name: string; slug: string; description: string; image?: string }
export type AdminMutationResult = { ok: boolean; error?: string };

export const animationReferenceSlots: { id: AdminAnimationSlot; label: string; description: string }[] = [
  { id: 'closed', label: 'بسته‌بندی بسته', description: 'نمای کامل جعبه، پیش از باز شدن' },
  { id: 'open', label: 'بسته‌بندی باز', description: 'جعبه با درِ باز و فضای داخلی مشخص' },
  { id: 'product', label: 'محصول خارج از جعبه', description: 'محصول به‌تنهایی با برچسب خوانا' },
  { id: 'angle', label: 'زاویهٔ تکمیلی', description: 'نمای جانبی یا زاویه‌ای دیگر از محصول' },
];
export const animationTemplateOptions: { id: AdminAnimationTemplate; label: string }[] = [
  { id: 'dropper-box', label: 'قطره‌چکان و جعبه' },
  { id: 'pump-box', label: 'بطری پمپی و جعبه' },
  { id: 'jar-box', label: 'کاسه و جعبه' },
  { id: 'pouch-box', label: 'پاکت تخت و جعبهٔ کشویی' },
  { id: 'custom', label: 'بسته‌بندی اختصاصی' },
];

export function createEmptyAnimation(): AdminAnimationConfig {
  return { references: animationReferenceSlots.map(({ id }) => ({ slot: id, image: null })), template: 'dropper-box', dimensions: {}, reviewConfirmed: false };
}

export function normalizeAdminDigits(value: string): string {
  return value.replace(/[۰-۹]/g, character => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(character)))
    .replace(/[٠-٩]/g, character => String('٠١٢٣٤٥٦٧٨٩'.indexOf(character)));
}

/** Empty, fractional, negative and unsafe amounts are invalid rather than silently coerced. */
export function readAdminInteger(value: string): number | null {
  const normalized = normalizeAdminDigits(value).replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isSafeInteger(result) ? result : null;
}

export function normalizeAdminText(value: string): string {
  return normalizeAdminDigits(value).normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]+/g, ' ').trim().toLocaleLowerCase();
}

export function slugifyAdminValue(value: string): string {
  return normalizeAdminText(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

export function getCategoryLabel(id: string, categories?: Pick<AdminCategory, 'id' | 'name'>[]): string {
  return categories?.find(category => category.id === id)?.name ?? categoryOptions.find(category => category.id === id)?.label ?? id;
}

type LegacyProductInput = Pick<AdminProduct, 'id' | 'slug' | 'name' | 'brand' | 'category' | 'image' | 'description' | 'priceToman' | 'stock' | 'status' | 'variants'> & Partial<AdminProduct>;

/** Fresh copies keep editor changes isolated from both the seed catalog and saved previews. */
export function normalizeAdminProduct(product: LegacyProductInput): AdminProduct {
  const images = product.images?.map(image => ({ ...image })) ?? (product.image ? [{ id: `${product.id}-image`, url: product.image, alt: product.name, description: '' }] : []);
  const animation = product.animation ?? createEmptyAnimation();
  const regularPriceToman = product.regularPriceToman ?? product.priceToman;
  return {
    ...product,
    brandId: product.brandId ?? slugifyAdminValue(product.brand),
    categoryIds: [...(product.categoryIds ?? (product.category ? [product.category] : []))],
    images,
    image: product.mediaType === 'animation'
      ? animation.thumbnail?.url ?? images[0]?.url ?? animation.build?.cartonUrl ?? ''
      : images[0]?.url ?? product.image,
    shortDescription: product.shortDescription ?? '',
    attributes: product.attributes?.map(attribute => ({ ...attribute })) ?? [],
    regularPriceToman,
    priceToman: product.discountPriceToman ?? regularPriceToman,
    variants: product.variants.map(variant => ({ ...variant, regularPriceToman: variant.regularPriceToman ?? variant.originalPriceToman ?? variant.priceToman, attributes: variant.attributes?.map(attribute => ({ ...attribute })) })),
    mediaType: product.mediaType ?? 'photo',
    animation: {
      ...animation,
      thumbnail: animation.thumbnail ? { ...animation.thumbnail } : null,
      dimensions: { ...animation.dimensions },
      references: animationReferenceSlots.map(({ id }) => {
        const image = animation.references.find(reference => reference.slot === id)?.image;
        return { slot: id, image: image ? { ...image } : null };
      }),
    },
  };
}
