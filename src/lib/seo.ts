import 'server-only';
import type { Metadata } from 'next';
import { richTextToPlainText } from '@poostikal/rich-text';
import { getServerSiteSettings } from './server-site-settings';

export const siteOrigin = new URL(process.env.SITE_URL || 'https://poostikal.ir').origin;
export const absoluteUrl = (path: string) => new URL(path, siteOrigin).href;
export const productPath = (slug: string) => '/products/' + encodeURIComponent(slug);

export function snippet(value: string) {
  const text = richTextToPlainText(value).replace(/\s+/g, ' ').trim();
  if (text.length <= 165) return text;
  return text.slice(0, 164).replace(/\s+\S*$/, '').trimEnd() + '…';
}

type PageMeta = {
  path: string; title: string; description: string; images?: string[]; imageAlt?: string;
  index?: boolean; fullTitle?: boolean;
};

export async function publicMetadata(page: PageMeta): Promise<Metadata> {
  const { settings: { branding }, store } = await getServerSiteSettings();
  const title = page.fullTitle ? page.title : page.title + ' | ' + store.name;
  const description = snippet(page.description);
  const url = absoluteUrl(page.path);
  const photos = page.images?.length ? page.images : [branding.logo];
  const images = photos.map(path => ({ url: absoluteUrl(path), alt: page.imageAlt || title }));
  const index = branding.searchIndexing && page.index !== false;
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    robots: { index, follow: branding.searchIndexing, ...(index ? { 'max-image-preview': 'large' as const } : {}) },
    openGraph: { type: 'website', siteName: store.name, locale: 'fa_IR', title, description, url, images },
    twitter: { card: page.images?.length ? 'summary_large_image' : 'summary', title, description, images: images.slice(0, 1) },
  };
}

export function breadcrumbs(links: { name: string; path: string }[]) {
  return { '@type': 'BreadcrumbList', itemListElement: links.map(({ name, path }, index) => ({
    '@type': 'ListItem', position: index + 1, name, item: absoluteUrl(path),
  })) };
}
