import { publicMetadata } from '@/lib/seo';
import { getServerSiteSettings } from '@/lib/server-site-settings';
import { PoostikalChat } from '@/components/poostikal-chat';

export async function generateMetadata() {
  const { settings: { chat } } = await getServerSiteSettings();
  return publicMetadata({ path: '/ask-poostikal', title: chat.title,
    description: chat.description + ' در گفتگوی پوستیکال درباره محصولات مراقبت از پوست، برندها و انتخاب روتین خود بپرسید.' });
}

export default function AskPoostikalPage() {
  return <PoostikalChat/>;
}
