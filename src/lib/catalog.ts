import type { AnimationBuild, AnimationAppearance, UnboxingSceneConfig } from './animation-config';
export const sourceSnapshotDate = "";
export const catalogDemoNotice = "ثبت سفارش فعال است؛ پرداخت آنلاین به‌زودی.";
export type CategoryId = string;

export function catalogCategoryHref(options: {id:string;label:string}[], group:'home-care'|'salon'|'equipment') {
  const labels = {
    'home-care':['محصولات خانگی','مراقبت خانگی'],
    salon:['محصولات کابین','محصولات سالنی','محصولات کلینیکال پوست'],
    equipment:['دستگاه های زیبایی','دستگاه ها و ابزارها','تجهیزات زیبایی'],
  };
  const match=options.find(option=>option.id===group)??labels[group].map(label=>options.find(option=>option.label===label)).find(Boolean);
  return match?`/shop?category=${encodeURIComponent(match.id)}`:'/shop';
}

export type SkinType = 'dry' | 'oily' | 'combination' | 'normal' | 'sensitive';
export type Concern = 'hydration' | 'texture' | 'sun' | 'gentle';

export interface ProductVariant {
  id: string;
  label: string;
  priceToman: number;
  stock?: number | null;
  originalPriceToman?: number;
  image?: string;
}

export interface Product {
  audio?: import('./product-audio').ProductAudio | null;
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: CategoryId;
  collections?: string[];
  description: string;
  shortDescription?: string;
  highlights: string[];
  skinTypes: SkinType[];
  concerns: Concern[];
  image: string;
  imageAlt?: string;
  variants: ProductVariant[];
  featured: boolean;
  recommendationEligible?: boolean;
  status?: string;
  stock?: number | null;
  images?: { id: string; url: string; alt: string; description: string }[];
  mediaType?: "photo" | "animation";
  animation?: { assetUrl?: string; assetType?: "video" | "model"; build?:AnimationBuild; template:UnboxingSceneConfig["template"] | "custom"; openingSide?: 'left' | 'right'; dimensions:UnboxingSceneConfig["dimensions"]; appearance?:AnimationAppearance };
}

export interface CatalogBrand {
  id: string;
  name: string;
  persianName: string;
  image: string;
}

export const categoryOptions: { id: string; label: string }[] = [{ id: "all", label: "همهٔ محصولات" }];

export const skinTypeOptions: { id: SkinType; label: string }[] = [
  { id: 'dry', label: 'خشک' },
  { id: 'oily', label: 'چرب' },
  { id: 'combination', label: 'مختلط' },
  { id: 'normal', label: 'معمولی' },
  { id: 'sensitive', label: 'حساس' },
];

export const concernOptions: { id: Concern; label: string }[] = [
  { id: 'hydration', label: 'آبرسانی' },
  { id: 'texture', label: 'بافت و ظاهر پوست' },
  { id: 'sun', label: 'مراقبت روزانه در برابر آفتاب' },
  { id: 'gentle', label: 'روتین ملایم' },
];

export const brands: CatalogBrand[] = [];
export const products: Product[] = [];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function matchesCategory(product: Product, category: CategoryId): boolean {
  if (category === 'all') return true;
  if (category === 'home-care' || category === 'salon') {
    return product.collections?.includes(category) ?? false;
  }
  return product.category === category || (product.collections as string[] | undefined)?.includes(category) === true;
}

/**
 * Stable merchandising order for the eligible home-care shortlist only.
 * Eligibility is explicit: professional ampoules, salon-only products and
 * equipment never enter the self-service quiz through a score/fallback.
 */
export function recommendProducts(
  skinType: SkinType | null = null,
  concerns: readonly Concern[] = [],
  catalog: Product[] = [],
): Product[] {
  const selectedConcerns = new Set(concerns);
  return catalog
    .filter((product) =>
      product.recommendationEligible === true &&
      product.collections?.includes('home-care') &&
      product.category !== 'equipment' &&
      product.category !== 'serum',
    )
    .map((product, index) => ({
      product,
      index,
      score:
        (skinType !== null && product.skinTypes.includes(skinType) ? 4 : 0) +
        product.concerns.reduce(
          (score, concern) => score + (selectedConcerns.has(concern) ? 3 : 0),
          0,
        ) +
        (product.featured ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ product }) => product);
}
