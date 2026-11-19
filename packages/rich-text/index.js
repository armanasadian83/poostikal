import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

export const DESCRIPTION_LIMITS = Object.freeze({ short: 500, full: 20000, raw: 200000 });
const hasMarkup = /<\/?[a-z][^>]*>/i;
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const blockTags = ['p', 'h1', 'h2', 'h3', 'blockquote'];

/** One policy for the editor, API and storefront. No executable or embedded content. */
export function sanitizeRichText(value = '') {
  if (!value.trim()) return '';
  const html = hasMarkup.test(value) ? value : `<p>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>`;
  return sanitizeHtml(html, {
    allowedTags: [...blockTags, 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'hr', 'a', 'code', 'pre'],
    allowedAttributes: {
      ...Object.fromEntries(blockTags.map(tag => [tag, ['style']])),
      a: ['href', 'title', 'target', 'rel'], ol: ['start'],
    },
    allowedStyles: { '*': { 'text-align': [/^(left|center|right|justify)$/] } },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      b: 'strong', i: 'em', del: 's', strike: 's',
      a: (tagName, attribs) => ({ tagName, attribs: {
        href: attribs.href || '', ...(attribs.title ? { title: attribs.title } : {}),
        ...(attribs.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      } }),
    },
  }).trim();
}

export function richTextToPlainText(value = '') {
  const html = sanitizeRichText(value).replace(/<\/(p|h[1-3]|li|blockquote|pre)>|<br\s*\/?\s*>|<hr\s*\/?\s*>/gi, '\n');
  return decodeHTML(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function richTextLength(value = '') { return Array.from(richTextToPlainText(value)).length; }

export function isSafeRichTextLink(value) {
  const href = value.trim();
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(href) && !/[\s\\]/.test(href) && !Array.from(href).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

// Supplier editorial material stays in the private catalog, never in storefront copy.
const supplierMention = /rab[\s_-]*o?[\s_-]*teb|راب[\s\u200c-]*و?[\s\u200c-]*طب/i;
// Ordinary catalog labels have neither markup nor entity syntax. Only take this fast path
// when the full HTML policy cannot change the content. Complex input still uses that policy.
const literalLine = value => !/[<>&"'\p{Cc}]/u.test(value);
export function storefrontRichText(value = '') {
  if (literalLine(value)) return value.trim() && !supplierMention.test(value) ? `<p>${value}</p>` : '';
  const withoutSourceLinks = sanitizeRichText(value).replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attributes, label) => {
    if (!supplierMention.test(decodeHTML(attributes))) return match;
    // A source-hosted video or editorial article cannot be opened from our storefront.
    if (/\.(?:mp4|webm)|مشاهده.*وید|کلیک کنید/i.test(attributes + label)) return '';
    return label;
  });
  const cleaned = sanitizeHtml(withoutSourceLinks, {
    allowedTags: [...blockTags, 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'hr', 'a', 'code', 'pre'],
    allowedAttributes: { '*': ['style'], a: ['href', 'title', 'target', 'rel'], ol: ['start'] },
    exclusiveFilter: frame => ['p', 'li', 'h1', 'h2', 'h3', 'blockquote'].includes(frame.tag) && supplierMention.test(frame.text),
    textFilter: text => supplierMention.test(decodeHTML(text)) ? '' : text,
    transformTags: { a: (tagName, attribs) => {
      if (supplierMention.test(decodeHTML(attribs.title || ''))) delete attribs.title;
      return { tagName, attribs };
    } },
  });
  return sanitizeRichText(cleaned).replace(/<(p|h[1-3])>\s*<\/\1>/g, '').trim();
}
export function storefrontText(value = '') {
  if (literalLine(value)) return supplierMention.test(value) ? '' : value.replace(/\u00a0/g,' ').replace(/[\u200b\ufeff]/g,'').trim();
  return richTextToPlainText(storefrontRichText(value));
}
