import {SiteSettingsProvider} from '@/components/site-settings-provider';
import { getPublicTaxonomy } from '@/lib/server-catalog';
import { siteOrigin } from '@/lib/seo';
import {getServerSiteSettings} from '@/lib/server-site-settings';
import { CatalogProvider } from "@/components/catalog-provider";
import type { Metadata, Viewport } from 'next';
import { SiteShell } from '@/components/site-shell';
import { ChatTransitionProvider } from '@/components/chat-transition';
import { VioletCursor } from '@/components/violet-cursor';
import { ThemeProvider } from '@/components/theme-provider';
import { getServerTheme } from '@/lib/server-theme';
import './globals.css';
import './navigation.css';
import './banner.css';
import './banner-product-orbit.css';
import './product-cards.css';
import './product-unboxing.css';
import './product-detail.css';
import './product-audio.css';
import './rich-text.css';
import './skin-quiz-banner.css';
import './treatment-story.css';
import './story-connections.css';
import './branding.css';
import './treatment-navigation.css';
import './brand-dark-logo.css';
import './chat.css';
import './voice-recorder.css';
import './chat-transition.css';
import './login.css';
import './footer.css';
import './shop.css';
import './cart.css';
import './scroll-and-cursor.css';
import './theme.css';

export async function generateMetadata():Promise<Metadata>{const {settings,store}=await getServerSiteSettings();return {metadataBase:new URL(siteOrigin),applicationName:store.name,title:{default:settings.branding.seoTitle,template:'%s | '+store.name},description:settings.branding.seoDescription,icons:{icon:settings.branding.favicon,apple:settings.branding.favicon},robots:{index:settings.branding.searchIndexing,follow:settings.branding.searchIndexing}};}
export async function generateViewport(): Promise<Viewport> {
  const theme = await getServerTheme();
  return { width: 'device-width', initialScale: 1, themeColor: theme.palette.background };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme,site,taxonomy] = await Promise.all([getServerTheme(),getServerSiteSettings(),getPublicTaxonomy().catch(() => undefined)]);
  const initial = taxonomy && {
    categories: taxonomy.categories.map(({ id, name, slug }) => ({ id, name, slug })),
    brands: taxonomy.brands.map(({ id, name, image }) => ({ id, name, image: image || '', persianName: name })),
  };
  return <html lang="fa" dir="rtl" data-scroll-behavior="smooth"><body><SiteSettingsProvider initial={site}><ThemeProvider initialTheme={theme}><a href="#main-content" className="skip-link">رفتن به محتوای اصلی</a><CatalogProvider initial={initial}><ChatTransitionProvider><SiteShell>{children}</SiteShell></ChatTransitionProvider></CatalogProvider><VioletCursor /></ThemeProvider></SiteSettingsProvider></body></html>;
}
