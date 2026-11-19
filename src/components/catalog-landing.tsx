import { cache } from 'react';
import { notFound } from 'next/navigation';
import { Catalog } from './catalog';
import { StructuredData } from './structured-data';
import { getProductResults, getPublicTaxonomy } from '@/lib/server-catalog';
import { getServerSiteSettings } from '@/lib/server-site-settings';
import { absoluteUrl, breadcrumbs, productPath, publicMetadata, snippet } from '@/lib/seo';
import { catalogUrl, type CatalogMode } from '@/lib/catalog-url';

export type ListingProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const getListing = cache(async (mode: CatalogMode, raw: string) => {
  const query = new URLSearchParams(raw);
  const pageValue = query.get('page') ?? '1';
  const page = Number(pageValue);
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1 || page > 10000) notFound();
  const brand = query.get('brand') ?? '';
  const categoryKey = query.get('category') || 'all';
  const q = (query.get('q') || '').trim().slice(0, 150);
  const sort = ['low', 'high'].includes(query.get('sort') || '') ? query.get('sort')! : 'featured';
  const [taxonomy, { settings: { shop } }] = await Promise.all([getPublicTaxonomy(), getServerSiteSettings()]);
  const category = taxonomy.categories.find(item => item.slug === categoryKey || item.id === categoryKey);
  const brandTerm = taxonomy.brands.find(item => item.name === brand);
  if ((categoryKey !== 'all' && !category) || (brand && !brandTerm)) notFound();
  const selection = { brand, category: category?.slug || 'all', q, sort, page };
  const result = await getProductResults(new URLSearchParams({ q, category: selection.category, brand, sort, page: String(page), limit: String(shop.pageSize) }).toString());
  if (page > 1 && (page - 1) * shop.pageSize >= result.total) notFound();
  const filtered = !!q || sort !== 'featured' || Boolean(brand && category);
  let canonicalMode = mode;
  if (!filtered) {
    if (brand) canonicalMode = 'brands';
    else if (category || page > 1) canonicalMode = 'shop';
  }
  const path = catalogUrl(canonicalMode, selection);
  const landingTitle = brand ? 'محصولات ' + brand : category?.name || (mode === 'brands' ? 'برندهای مراقبت از پوست و مو' : 'فروشگاه محصولات مراقبت از پوست و مو');
  const title = (q ? 'جستجوی «' + q + '»' : landingTitle) + (page > 1 ? ' – صفحه ' + page.toLocaleString('fa-IR') : '');
  const description = snippet((category || brandTerm)?.description || '') || (brand ? `محصولات برند ${brand} را با تصویر، قیمت، موجودی و مشخصات هر محصول در پوستیکال ببینید.`
    : category ? `محصولات دستهٔ ${category.name} را در پوستیکال بررسی کنید و قیمت، ویژگی‌ها و بسته‌بندی آن‌ها را مقایسه کنید.`
    : mode === 'brands' ? 'فهرست برندهای مراقبت از پوست، مو و زیبایی پوستیکال را ببینید و محصولات هر برند را با قیمت و مشخصات آن بررسی کنید.'
    : 'محصولات مراقبت خانگی و سالنی پوست، مو و تجهیزات زیبایی را در فروشگاه پوستیکال با قیمت، موجودی و مشخصات هر محصول مقایسه کنید.');
  return { selection, result, title, description: (page > 1 ? 'صفحه ' + page.toLocaleString('fa-IR') + '؛ ' : '') + description,
    path, index: !filtered && result.total > 0 };
});

async function listingFor(mode: CatalogMode, props: ListingProps) {
  const terms = new URLSearchParams();
  for (const [name, value] of Object.entries(await props.searchParams)) {
    if (!['page', 'category', 'brand', 'q', 'sort'].includes(name)) continue;
    if (Array.isArray(value)) notFound();
    if (value) terms.set(name, value);
  }
  return getListing(mode, terms.toString());
}

export async function listingMetadata(mode: CatalogMode, props: ListingProps) {
  return publicMetadata(await listingFor(mode, props));
}

export async function CatalogLanding({ mode, ...props }: ListingProps & { mode: CatalogMode }) {
  const { selection, result, path, title, index } = await listingFor(mode, props);
  return <main id="main-content" className={'page-main shop-page' + (mode === 'brands' ? ' brands-page' : '')}>
    {index && <StructuredData nodes={[breadcrumbs([{ name: 'خانه', path: '/' }, { name: title, path }]), {
      '@type': 'CollectionPage', url: absoluteUrl(path), name: title,
      mainEntity: { '@type': 'ItemList', itemListElement: result.items.map((item, i) => ({
        '@type': 'ListItem', position: i + 1, name: item.name, url: absoluteUrl(productPath(item.slug)),
      })) },
    }]}/>}
    <Catalog key={catalogUrl(mode, selection)} mode={mode} initial={result} selection={selection}/>
  </main>;
}
