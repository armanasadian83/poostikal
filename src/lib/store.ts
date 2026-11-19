'use client';

import { useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import type { Product } from './catalog';

export type CartLine = { productId: string; variantId: string; quantity: number };
type CartSelection = Pick<CartLine, 'productId' | 'variantId'>;
type BasketResponse = {
  customerId: string;
  revision: string | null;
  expiresAt: string | null;
  lines: CartLine[];
  adjustments: (CartLine & { previousQuantity: number; reason: 'stock' | 'expired' })[];
};
type StoreState = {
  cartOwner: string | null;
  cart: CartLine[];
  cartRevision: string | null;
  cartExpiresAt: string | null;
  cartNotice: string;
  stockGeneration: number;
  saved: string[];
};

const EMPTY: StoreState = {
  cartOwner: null, cart: [], cartRevision: null, cartExpiresAt: null,
  cartNotice: '', stockGeneration: 0, saved: [],
};
const LEGACY_KEY = 'poostikal.cart.v3';
const SAVED_KEY = 'poostikal.saved.v1';
const AUTH_HINT = 'poostikal.basket-session.v1';
export const BASKET_CHANGED = 'poostikal.basket-changed.v1';
const STOCK_NOTICE = 'موجودی تغییر کرد. کالاهای ناموجود حذف شدند و تعدادها با موجودی به‌روز شدند.';
const EXPIRED_NOTICE = 'از آخرین تغییر سبدت ۲۴ ساعت گذشته بود و کالاها از سبد خارج شدند.';
const SESSION_CHANGED = 'حساب خرید تغییر کرده است. دوباره تلاش کن.';
const currentId = (id: string) => id.replace(/^raboteb-(?=\d+(?:-|$))/, 'catalog-');

let snapshot = EMPTY;
let initialized = false;
let accountGeneration = 0;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function storageRead(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageWrite(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* The server basket still works without browser storage. */ }
}
function readLegacy() {
  try {
    const data = JSON.parse(storageRead(LEGACY_KEY) ?? 'null') as {
      cartOwner?: unknown; cart?: unknown; saved?: unknown;
    } | null;
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
function savedIds(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string').map(currentId))] : [];
}
function readSaved() {
  const saved = storageRead(SAVED_KEY);
  if (saved === null) return savedIds(readLegacy()?.saved);
  try { return savedIds(JSON.parse(saved)); } catch { return []; }
}
function update(value: StoreState) {
  snapshot = value;
  listeners.forEach(listener => listener());
}
function initialize() {
  if (initialized) return;
  initialized = true;
  snapshot = { ...snapshot, saved: readSaved() };
}
function onStorage(event: StorageEvent) {
  if (event.key === SAVED_KEY || event.key === null) update({ ...snapshot, saved: readSaved() });
}
function subscribe(listener: () => void) {
  initialize();
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}
export function useStore() { return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY); }

export function accountMayHaveBasket() {
  return Boolean(snapshot.cartOwner || storageRead(AUTH_HINT) || typeof readLegacy()?.cartOwner === 'string');
}
function announceBasketChange() {
  storageWrite(BASKET_CHANGED, crypto.randomUUID());
}
function changeAccount(id: string | null) {
  if (snapshot.cartOwner !== id) {
    accountGeneration++;
    update({ ...EMPTY, cartOwner: id, saved: snapshot.saved });
  }
  storageWrite(AUTH_HINT, id ? '1' : null);
}
// Call after successful authentication or logout. Pending responses for a different
// account are discarded even if they arrive after this change.
export function setCartOwner(id: string | null) {
  initialize();
  accountGeneration++;
  changeAccount(id);
  announceBasketChange();
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation);
  queue = next.catch(() => {});
  return next;
}
function ensureCurrent(generation: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (generation !== accountGeneration) throw new Error(SESSION_CHANGED);
}
function withTimeout(signal?: AbortSignal) {
  return signal ? AbortSignal.any([AbortSignal.timeout(10_000), signal]) : AbortSignal.timeout(10_000);
}
function equalLines(a: CartLine[], b: CartLine[]) {
  return a.length === b.length && a.every((line, i) => line.productId === b[i].productId &&
    line.variantId === b[i].variantId && line.quantity === b[i].quantity);
}
function sameSelection(saved: CartLine[], requested: CartLine[]) {
  if (saved.length !== requested.length) return false;
  const byVariant = new Map(saved.map(line => [line.variantId, line]));
  return requested.every(line => {
    const value = byVariant.get(currentId(line.variantId));
    return value?.productId === currentId(line.productId) && value.quantity === line.quantity;
  });
}
function acceptBasket(basket: BasketResponse, stockChanged = false) {
  changeAccount(basket.customerId);
  const expired = basket.adjustments.some(item => item.reason === 'expired') ||
    (snapshot.cart.length > 0 && !basket.lines.length && !basket.expiresAt &&
      snapshot.cartExpiresAt !== null && Date.parse(snapshot.cartExpiresAt) <= Date.now());
  const stockAdjusted = basket.adjustments.some(item => item.reason === 'stock');
  const cartNotice = expired ? EXPIRED_NOTICE : stockAdjusted ? STOCK_NOTICE : snapshot.cartNotice;
  const cart = equalLines(snapshot.cart, basket.lines) ? snapshot.cart : basket.lines;
  if (cart !== snapshot.cart || basket.revision !== snapshot.cartRevision || basket.expiresAt !== snapshot.cartExpiresAt ||
      cartNotice !== snapshot.cartNotice || stockChanged) {
    update({
      ...snapshot, cart, cartNotice, cartRevision: basket.revision, cartExpiresAt: basket.expiresAt,
      stockGeneration: snapshot.stockGeneration + Number(stockChanged),
    });
  }
}

function readLegacyLines(owner: string) {
  const legacy = readLegacy();
  if (legacy?.cartOwner !== owner) return null;
  const lines = new Map<string, CartLine>();
  if (Array.isArray(legacy.cart)) for (const line of legacy.cart.slice(0, 100)) {
    if (line && typeof line.productId === 'string' && /^[\w-]{1,120}$/.test(line.productId) &&
        typeof line.variantId === 'string' && /^[\w-]{1,150}$/.test(line.variantId) &&
        Number.isInteger(line.quantity) && line.quantity > 0) {
      const variantId = currentId(line.variantId);
      lines.set(variantId, { productId: currentId(line.productId), variantId, quantity: Math.min(20, line.quantity) });
    }
  }
  return [...lines.values()];
}
async function fetchBasket(signal?: AbortSignal) {
  return api<BasketResponse>('/customer/basket', { signal: withTimeout(signal) });
}
async function saveBasket(basket: Pick<BasketResponse, 'customerId' | 'revision'>, lines: CartLine[], requireFull = false, signal?: AbortSignal) {
  return api<BasketResponse>('/customer/basket', {
    method: 'PUT',
    body: JSON.stringify({ customerId: basket.customerId, revision: basket.revision, lines, ...(requireFull ? { requireFull: true } : {}) }),
    signal: withTimeout(signal),
  });
}
async function loadBasket(signal?: AbortSignal, stockChanged = false): Promise<BasketResponse> {
  initialize();
  const generation = accountGeneration;
  try {
    let basket = await fetchBasket(signal);
    ensureCurrent(generation, signal);
    const legacy = readLegacyLines(basket.customerId);
    if (legacy !== null) {
      if (!basket.revision && legacy.length) {
        try {
          basket = await saveBasket(basket, legacy, false, signal);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          basket = await fetchBasket(signal);
        }
        ensureCurrent(generation, signal);
        if (basket.revision) announceBasketChange();
      }
      if (basket.revision || !legacy.length) {
        storageWrite(SAVED_KEY, JSON.stringify(snapshot.saved));
        storageWrite(LEGACY_KEY, null);
      }
    }
    acceptBasket(basket, stockChanged);
    return basket;
  } catch (error) {
    if (!signal?.aborted && generation === accountGeneration && error instanceof ApiError && error.status === 401) {
      changeAccount(null);
    }
    throw error;
  }
}
export function refreshBasket(signal?: AbortSignal, stockChanged = false) {
  return enqueue(() => loadBasket(signal, stockChanged));
}
export async function requireCartSession(signal?: AbortSignal) {
  return (await refreshBasket(signal)).customerId;
}
function announceAndAccept(basket: BasketResponse) {
  acceptBasket(basket);
  announceBasketChange();
}
async function persistBasket(basket: Pick<BasketResponse, 'customerId' | 'revision'>, lines: CartLine[], requireFull = false) {
  if (lines.length > 100) throw new Error('در هر سبد می‌تونی حداکثر ۱۰۰ انتخاب متفاوت داشته باشی.');
  const generation = accountGeneration;
  try {
    const saved = await saveBasket(basket, lines, requireFull);
    ensureCurrent(generation);
    announceAndAccept(saved);
    return saved;
  } catch (error) {
    if (generation === accountGeneration) {
      if (error instanceof ApiError && error.status === 401) changeAccount(null);
      // A stale revision, an expired cart, or a lost response can change the
      // server basket. Read it before accepting another edit.
      else {
        const recovered = await loadBasket().catch(() => null);
        if (!(error instanceof ApiError) || error.status >= 500) {
          if (generation === accountGeneration && recovered?.customerId === basket.customerId &&
              recovered.revision !== basket.revision && sameSelection(recovered.lines, lines)) {
            announceBasketChange();
            return recovered;
          }
          throw new Error('نتیجه ذخیره سبد مشخص نیست. سبدت رو قبل از تغییر دوباره بررسی کن.', {cause:error});
        }
      }
    }
    throw error;
  }
}
function addLine(lines: CartLine[], selection: CartSelection, quantity: number) {
  const previous = lines.find(line => line.variantId === selection.variantId);
  if (!previous) return [...lines, { ...selection, quantity: Math.min(quantity, 20) }];
  return lines.map(line => line === previous ? { ...line, quantity: Math.min(20, line.quantity + quantity) } : line);
}
export async function addToCart(product: Product, variantId = product.variants[0]?.id, quantity = 1) {
  if (!variantId || !Number.isInteger(quantity) || quantity < 1) throw new Error('این گزینه برای خرید در دسترس نیست.');
  return enqueue(async () => {
    const basket = await loadBasket();
    const previous = basket.lines.find(line => line.variantId === variantId)?.quantity ?? 0;
    if (previous >= 20) throw new Error('سقف خرید این انتخاب ۲۰ عدده.');
    const saved = await persistBasket(basket, addLine(basket.lines, { productId: product.id, variantId }, quantity));
    if ((saved.lines.find(line => line.variantId === variantId)?.quantity ?? 0) <= previous) {
      throw new Error('موجودی برای افزودن تعداد بیشتر کافی نیست.');
    }
    return saved.adjustments.length > 0;
  });
}
export async function addAnalysisBundle(lines: CartSelection[]) {
  return enqueue(async () => {
    const basket = await loadBasket();
    let cart = basket.lines;
    for (const line of lines) {
      if (cart.some(item => item.variantId === line.variantId && item.quantity >= 20)) {
        throw new Error('یکی از پیشنهادها به سقف خرید رسیده. سبدت رو بررسی کن.');
      }
      cart = addLine(cart, line, 1);
    }
    await persistBasket(basket, cart, true);
  });
}

const bundleKey = 'poostikal.analysis-purchase';
export function rememberAnalysisBundle(lines: CartSelection[]) {
  sessionStorage.setItem(bundleKey, JSON.stringify({ lines, expires: Date.now() + 20 * 60_000 }));
}
export function forgetAnalysisBundle() { sessionStorage.removeItem(bundleKey); }
export async function finishAnalysisPurchase() {
  const raw = sessionStorage.getItem(bundleKey);
  if (!raw) return;
  let intent;
  try { intent = JSON.parse(raw); } catch { forgetAnalysisBundle(); return; }
  if (!intent || !(intent.expires > Date.now()) || !Array.isArray(intent.lines) || !intent.lines.length || intent.lines.length > 3 ||
      !intent.lines.every((line: CartSelection) => typeof line?.productId === 'string' && typeof line.variantId === 'string')) {
    forgetAnalysisBundle();
    return;
  }
  await addAnalysisBundle(intent.lines);
  forgetAnalysisBundle();
}

export async function setQuantity(variantId: string, quantity: number, expectedRevision: string | null) {
  initialize();
  const { cartOwner, cartRevision, cart } = snapshot;
  if (!Number.isInteger(quantity) || quantity > 20 || quantity < 0 || !cartOwner || !cartRevision) return;
  return enqueue(async () => {
    if (expectedRevision !== cartRevision || snapshot.cartOwner !== cartOwner || snapshot.cartRevision !== cartRevision) {
      throw new Error('سبدت تغییر کرده. تعداد رو بررسی کن و دوباره تلاش کن.');
    }
    const lines = quantity === 0 ? cart.filter(line => line.variantId !== variantId) :
      cart.map(line => line.variantId === variantId ? { ...line, quantity } : line);
    await persistBasket({ customerId: cartOwner, revision: cartRevision }, lines);
  });
}
export function refreshBasketAfterOrder(owner: string) {
  if (snapshot.cartOwner !== owner) return;
  announceBasketChange();
  void refreshBasket().catch(() => {});
}
export function isCurrentCartOwner(owner: string) { return snapshot.cartOwner === owner; }
export function dismissBasketNotice() {
  if (snapshot.cartNotice) update({ ...snapshot, cartNotice: '' });
}
export function toggleSaved(productId: string) {
  if (!productId) return;
  initialize();
  const saved = snapshot.saved.includes(productId) ? snapshot.saved.filter(id => id !== productId) : [...snapshot.saved, productId];
  storageWrite(SAVED_KEY, JSON.stringify(saved));
  update({ ...snapshot, saved });
}
