'use client';

import { useEffect } from 'react';
import { accountMayHaveBasket, BASKET_CHANGED, refreshBasket, useStore } from '@/lib/store';

// One stream per visible tab with a non-empty basket. Reading an unchanged
// basket never extends its lifetime.
export function BasketSync({ enabled, basketPage }: { enabled: boolean; basketPage: boolean }) {
  const { cartOwner, cart, cartExpiresAt } = useStore();
  const hasItems = cart.length > 0;

  useEffect(() => {
    if (!enabled) return;
    const lifetime = new AbortController();
    let stream: EventSource | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    let dirty = false;
    const visible = () => document.visibilityState === 'visible';

    async function read() {
      if (reading || !visible() || lifetime.signal.aborted) return;
      reading = true;
      dirty = false;
      try { await refreshBasket(lifetime.signal, true); }
      catch { /* Focus, reconnect, and polling retry without dropping the basket. */ }
      finally {
        reading = false;
        if (dirty) schedule();
      }
    }
    function schedule() {
      dirty = true;
      if (reading || timeout || !visible() || lifetime.signal.aborted) return;
      timeout = setTimeout(() => {
        timeout = undefined;
        void read();
      }, 200);
    }
    function connect(event?: Event) {
      if (!visible()) {
        stream?.close();
        stream = undefined;
        return;
      }
      if ((event || !basketPage) && accountMayHaveBasket()) schedule();
      if (!cartOwner || !hasItems || stream) return;
      stream = new EventSource('/api/customer/stock-events');
      stream.addEventListener('stock', schedule);
    }
    function otherTab(event: StorageEvent) {
      if (event.key === BASKET_CHANGED || event.key === null) schedule();
    }
    connect();
    document.addEventListener('visibilitychange', connect);
    window.addEventListener('focus', connect);
    window.addEventListener('pageshow', connect);
    window.addEventListener('storage', otherTab);
    const fallback = cartOwner && (hasItems || basketPage) ? setInterval(schedule, 30_000) : undefined;
    return () => {
      lifetime.abort();
      stream?.close();
      clearTimeout(timeout);
      clearInterval(fallback);
      document.removeEventListener('visibilitychange', connect);
      window.removeEventListener('focus', connect);
      window.removeEventListener('pageshow', connect);
      window.removeEventListener('storage', otherTab);
    };
  }, [enabled, basketPage, cartOwner, hasItems]);

  useEffect(() => {
    if (!enabled || !cartExpiresAt) return;
    const lifetime = new AbortController();
    const expiry = setTimeout(() => {
      if (document.visibilityState === 'visible') void refreshBasket(lifetime.signal).catch(() => {});
    }, Math.max(0, Date.parse(cartExpiresAt) - Date.now() + 1_000));
    return () => { clearTimeout(expiry); lifetime.abort(); };
  }, [enabled, cartExpiresAt]);

  return null;
}
