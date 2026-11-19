import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Product } from '@/lib/catalog';
import { ProductDetail } from '@/components/product-detail';
import { absoluteUrl, breadcrumbs, productPath, publicMetadata, snippet } from '@/lib/seo';
import { StructuredData } from '@/components/structured-data';

const fetchProduct = cache(async (slug: string): Promise<Product | null> => {
  const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Product service unavailable');
  return response.json();
});

function getProduct(routeSlug: string): Promise<Product | null> {
  // Page and metadata params can arrive encoded or decoded. Canonicalize before
  // the cached lookup so Persian slugs are encoded exactly once for the API.
  try {
    return fetchProduct(decodeURIComponent(routeSlug));
  } catch {
    return Promise.resolve(null);
  }
}

type ProductPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  return publicMetadata({ title: product.name, path: productPath(product.slug), description: productDescription(product),
    images: productImages(product), imageAlt: product.imageAlt || product.name });
}

function productImages(product: Product) {
  const gallery = product.mediaType === 'animation' ? [] : (product.images ?? []).map(image => image.url);
  return [...new Set([product.image, ...gallery].filter(Boolean))];
}

function productDescription(product: Product) {
  return snippet(product.shortDescription || '') || snippet(product.description) ||
    `مشخصات، بسته‌بندی، قیمت و موجودی ${product.name} را در فروشگاه پوستیکال ببینید.`;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const path = productPath(product.slug);
  const url = absoluteUrl(path);
  const offers = product.variants.filter(variant => variant.priceToman > 0).map(variant => ({
    '@type': 'Offer', url, name: variant.label, priceCurrency: 'IRR', price: variant.priceToman * 10,
    availability: 'https://schema.org/' + (product.status === 'out-of-stock' || product.stock === 0 || variant.stock === 0 ? 'OutOfStock' : 'InStock'),
  }));
  return <><StructuredData nodes={[{
    '@type': 'Product', '@id': url + '#product', url, name: product.name,
    description: productDescription(product), image: productImages(product).map(absoluteUrl),
    ...(product.brand && { brand: { '@type': 'Brand', name: product.brand } }),
    ...(offers.length > 0 && { offers }),
  }, breadcrumbs([{ name: 'خانه', path: '/' }, { name: 'فروشگاه', path: '/shop' }, { name: product.name, path }])]} />
    <ProductDetail product={product}/></>;
}
