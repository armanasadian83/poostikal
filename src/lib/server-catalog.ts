import 'server-only';
import { cache } from 'react';
import type { Product } from './catalog';

export type ProductResults = { items: Product[]; total: number };
export type PublicTerm = { id: string; slug: string; name: string; description: string; image: string };
const origin = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
async function catalogRequest<T>(path: string, options: RequestInit = { cache: 'no-store' }): Promise<T> {
  const response = await fetch(origin + '/api/' + path, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Public catalog unavailable');
  return response.json();
}
export const getProductResults = cache((query: string) => catalogRequest<ProductResults>('products?' + query));
export const getPublicTaxonomy = cache(() => catalogRequest<{ brands: PublicTerm[]; categories: PublicTerm[] }>('catalog'));
