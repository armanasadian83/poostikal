'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Product } from '@/lib/catalog';

import type { ProductResults } from '@/lib/server-catalog';

export function useProductSearch(filters: Record<string, string>, initial?: ProductResults) {
  const query = new URLSearchParams(filters).toString();
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${attempt}:${query}`;
  const [initialKey] = useState(initial ? requestKey : '');
  const [result, setResult] = useState({ products: [] as Product[], total: 0, requestKey: '', error: '' });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (initialKey === requestKey) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api<{ items: Product[]; total: number }>(`/products?${query}`, { signal: abort.signal })
        .then(data => { if (!abort.signal.aborted) setResult({ products: data.items, total: data.total, requestKey, error: '' }); })
        .catch(error => {
          if (error.name !== 'AbortError' && !abort.signal.aborted) setResult({ products: [], total: 0, requestKey, error: 'دریافت محصولات انجام نشد.' });
        });
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, requestKey, initialKey]);

  if (initial && initialKey === requestKey) return { products: initial.items, total: initial.total, error: '', loading: false, retry };
  const loading = result.requestKey !== requestKey;
  return { products: result.products, total: result.total, loading, error: loading ? '' : result.error, retry };
}
