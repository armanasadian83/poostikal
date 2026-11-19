import type { Product } from './catalog';
export function getProductCardCopy(product: Product) { return { title: product.name }; }
