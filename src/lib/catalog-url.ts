export type CatalogMode = 'shop' | 'brands';
export type CatalogSelection = { category: string; brand: string; q: string; sort: string; page: number };

export function catalogUrl(mode: CatalogMode, selection: Partial<CatalogSelection> = {}) {
  const params = new URLSearchParams();
  if (selection.category && selection.category !== 'all') params.set('category', selection.category);
  if (selection.brand) params.set('brand', selection.brand);
  if (selection.q) params.set('q', selection.q);
  if (selection.sort && selection.sort !== 'featured') params.set('sort', selection.sort);
  if (selection.page && selection.page > 1) params.set('page', String(selection.page));
  // Keep the same query spelling in links, canonical tags and the sitemap.
  const query = params.toString().replace(/\+/g, '%20');
  return '/' + mode + (query ? '?' + query : '');
}
