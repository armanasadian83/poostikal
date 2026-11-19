const numberFormatter = new Intl.NumberFormat('fa-IR', {
  maximumFractionDigits: 0,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Local preview prices are integer Toman; the caller supplies the unit label. */
export function formatPrice(priceToman: number): string {
  return numberFormatter.format(priceToman);
}

/** A missing stock count means availability-only, never zero inventory. */
export function formatStock(stock: number | null | undefined, status?: string): string {
  if (status === 'out-of-stock' || stock === 0) return 'ناموجود';
  return stock == null ? 'موجود' : `${formatNumber(stock)} عدد`;
}
