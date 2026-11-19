export const DESCRIPTION_LIMITS: Readonly<{ short: 500; full: 20000; raw: 200000 }>;
export function sanitizeRichText(value?: string): string;
export function richTextToPlainText(value?: string): string;
export function richTextLength(value?: string): number;
export function isSafeRichTextLink(value: string): boolean;

export function storefrontRichText(value?: string): string;
export function storefrontText(value?: string): string;
