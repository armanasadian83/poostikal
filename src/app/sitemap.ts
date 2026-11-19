import type { MetadataRoute } from 'next';
import { catalogUrl } from '@/lib/catalog-url';
import { absoluteUrl, productPath } from '@/lib/seo';
import { getServerSiteSettings } from '@/lib/server-site-settings';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { settings } = await getServerSiteSettings();
  if (!settings.branding.searchIndexing) return [];
  const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/catalog/sitemap`,
    { next: { revalidate: 300 }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Public sitemap catalog unavailable');
  const catalog: { products: string[]; brands: string[]; categories: string[] } = await response.json();
  const paths = ['/', '/shop', '/brands', '/about-us', '/ask-poostikal', '/skin-analysis',
    ...catalog.products.map(productPath),
    ...catalog.brands.map(brand => catalogUrl('brands', { brand })),
    ...catalog.categories.map(category => catalogUrl('shop', { category })),
  ];
  return [...new Set(paths)].map(path => ({ url: absoluteUrl(path) }));
}
