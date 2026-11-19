/** Normalize Persian/Arabic forms and word separators for catalog search. */
export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('fa-IR').replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064b-\u065f\u0670]/g, '').replace(/[\s\u200c\u200d]+/g, ' ').trim();
}
