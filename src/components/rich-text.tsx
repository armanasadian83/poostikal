import { sanitizeRichText } from '@poostikal/rich-text';

export function RichText({ content, className = '' }: { content: string; className?: string }) {
  return <div className={`rich-text-content ${className}`} dir="rtl" dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }}/>;
}
