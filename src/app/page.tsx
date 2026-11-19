import { Home } from '@/components/home';
import { getServerSiteSettings } from '@/lib/server-site-settings';
import { getProductResults } from '@/lib/server-catalog';
import { absoluteUrl, publicMetadata } from '@/lib/seo';
import { StructuredData } from '@/components/structured-data';

export async function generateMetadata() {
  const { settings: { branding }, store } = await getServerSiteSettings();
  return publicMetadata({ path: '/', title: branding.seoTitle, fullTitle: true, description: branding.seoDescription || store.description });
}

export default async function HomePage() {
  const { settings: { branding, contact, home }, store } = await getServerSiteSettings();
  const initial = home.showCollection ? await getProductResults('category=all&limit=' + home.productLimit).catch(() => undefined) : undefined;
  const url = absoluteUrl('/');
  return <><StructuredData nodes={[
    { '@type': 'Organization', '@id': url + '#organization', name: store.name, url, logo: absoluteUrl(branding.logo),
      telephone: contact.phone || undefined, email: contact.email || undefined },
    { '@type': 'WebSite', '@id': url + '#website', name: store.name, url, inLanguage: 'fa', publisher: { '@id': url + '#organization' } },
  ]}/><Home initial={initial}/></>;
}
