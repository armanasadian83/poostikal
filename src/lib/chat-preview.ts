export interface PreviewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  productIds?: string[];
}

export interface PreviewReply {
  content: string;
  productIds?: string[];
}

export const previewSuggestions = [
  'از کجا روتینم رو شروع کنم؟',
  'برای انتخاب مرطوب‌کننده راهنماییم کن',
  'چه برندهایی دارید؟',
  'شوینده‌ها رو ببینم',
] as const;

