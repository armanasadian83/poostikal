import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { getServerSiteSettings } from '@/lib/server-site-settings';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { settings } = await getServerSiteSettings();
  if (!settings.branding.searchIndexing) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: ['/', '/api/media/'], disallow: [
      '/admin', '/myaccount', '/account', '/cart', '/checkout', '/login', '/api/',
    ] },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
