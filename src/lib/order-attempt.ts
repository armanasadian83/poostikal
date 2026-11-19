import { api, ApiError } from './api';
import type { OrderReceipt } from './orders';

export type OrderAttempt = { id: string; payload: string };
const key = (owner: string) => 'poostikal-order-attempt:' + owner;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function readOrderAttempt(owner: string): OrderAttempt | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key(owner)) ?? 'null');
    return uuid.test(cached?.id ?? '') && /^[0-9a-f]{64}$/.test(cached?.payload ?? '') ? cached : null;
  } catch { return null; }
}

export function writeOrderAttempt(owner: string, value: OrderAttempt) {
  try {sessionStorage.setItem(key(owner), JSON.stringify(value));}
  catch { /* Retry remains possible in memory. */ }
}

export function forgetOrderAttempt(owner: string, id: string) {
  if (readOrderAttempt(owner)?.id !== id) return;
  try {sessionStorage.removeItem(key(owner));}
  catch { /* Storage can be disabled. */ }
}

export async function findOrderAttempt(requestId: string, signal?: AbortSignal): Promise<OrderReceipt | null> {
  const timeout = AbortSignal.timeout(8_000);
  try {
    return await api<OrderReceipt>('/customer/order-attempts/' + encodeURIComponent(requestId), {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
