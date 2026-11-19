/** Normalize supported Iranian mobile formats without discarding invalid characters. */
export function normalizeIranianMobile(value: string): string | null {
  const digits = value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x06f0 : 0x0660)));
  const compact = digits.replace(/[\s()\-\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '');
  const local = /^\+989\d{9}$/.test(compact) ? `0${compact.slice(3)}`
    : /^00989\d{9}$/.test(compact) ? `0${compact.slice(4)}` : compact;
  return /^09\d{9}$/.test(local) ? local : null;
}
