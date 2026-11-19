'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import type { Product } from './catalog';
import { useStore, type CartLine } from './store';

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function useCartHydrated() {
  return useSyncExternalStore(subscribeHydration, clientReady, serverReady);
}

// Both steps resolve saved IDs against the current catalogue, not cached prices.
export function useCartProducts(lines: CartLine[]) {
  const ids = [...new Set(lines.map(line => line.productId))].sort().join(',');
  const [attempt, setAttempt] = useState(0);
  const { stockGeneration } = useStore();
  const requestKey = `${attempt}:${stockGeneration}:${ids}`;
  const [result, setResult] = useState({ key: '', requestedIds: [] as string[], products: [] as Product[], error: '' });
  useEffect(() => {
    const controller = new AbortController();
    const list = ids ? ids.split(',') : [];
    const requests = [];
    for (let start = 0; start < list.length; start += 100) {
      requests.push(api<{ items: Product[] }>(`/products?limit=100&ids=${encodeURIComponent(list.slice(start, start + 100).join(','))}`, { signal: controller.signal }));
    }
    Promise.all(requests).then(results => {
      if (!controller.signal.aborted) setResult({ key: requestKey, requestedIds: list, products: results.flatMap(result => result.items), error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setResult(previous => ({
        ...previous, key: requestKey, error: 'اطلاعات سبد دریافت نشد. انتخاب‌هات محفوظ هستند؛ دوباره امتحان کن.',
      }));
    });
    return () => controller.abort();
  }, [ids, requestKey]);
  const hasRemainingProducts = !ids || ids.split(',').every(id => result.requestedIds.includes(id));
  return { ...result, hasRemainingProducts, loading: result.key !== requestKey && !hasRemainingProducts,
    revalidating: result.key !== requestKey, retry: () => setAttempt(value => value + 1) };
}

export function summarizeCart(lines: CartLine[], products: Product[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  const resolved = lines.map(line => {
    const product = byId.get(line.productId);
    const variant = product?.variants.find(item => item.id === line.variantId);
    const limit = Math.min(20, variant?.stock ?? 20, product?.stock ?? 20);
    const available = Boolean(product && variant && variant.priceToman > 0 && product.status !== 'out-of-stock' && limit > 0);
    return { line, product, variant, limit, available };
  });
  const subtotal = resolved.reduce((sum, item) => sum + (item.available && item.variant ? Math.max(item.variant.originalPriceToman ?? 0, item.variant.priceToman) * item.line.quantity : 0), 0);
  const total = resolved.reduce((sum, item) => sum + (item.available && item.variant ? item.variant.priceToman * item.line.quantity : 0), 0);
  return {
    resolved, subtotal, total, discount: subtotal - total,
    needsAttention: resolved.some(item => !item.available || item.line.quantity > item.limit),
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}
