export type SocialPlatform = 'whatsapp' | 'instagram' | 'telegram';

export function socialIdentity(href: string): {kind: SocialPlatform | 'link'; detail: string} {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return {kind: 'link', detail: ''};
    const host = url.hostname.replace(/^www\./, '');
    const account = url.pathname.split('/').filter(Boolean)[0];
    if (host === 'instagram.com' || host === 't.me' || host === 'telegram.me') {
      return {kind: host === 'instagram.com' ? 'instagram' : 'telegram', detail: account ? '@' + account : ''};
    }
    if (host === 'api.whatsapp.com' || host === 'wa.me' || host === 'chat.whatsapp.com') {
      const digits = (url.searchParams.get('phone') || (host === 'wa.me' ? account : '') || '').replace(/\D/g, '');
      return {kind: 'whatsapp', detail: /^989\d{9}$/.test(digits) ? '0' + digits.slice(2) : digits ? '+' + digits : ''};
    }
  } catch { /* Unrecognized destinations keep their generic link on the About page. */ }
  return {kind: 'link', detail: ''};
}

export function SocialMark({kind, className}: {kind: SocialPlatform; className?: string}) {
  return <svg aria-hidden="true" focusable="false" className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'instagram' && <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.9" r=".9" fill="currentColor" stroke="none"/></>}
    {kind === 'whatsapp' && <><path d="M21 11.8a9 9 0 0 1-13.3 8L3 21l1.2-4.6A9 9 0 1 1 21 11.8Z"/><path d="M8.7 7.1c-.6-.1-1.5.7-1.3 2.2.5 3.4 3.7 6.6 7.2 7.1 1.1.2 2.2-.5 2.3-1.6l-2.5-1.4-1.1 1c-1.7-.7-3-1.9-3.7-3.6l.9-1.1-1.2-2.6z" strokeWidth="1.3"/></>}
    {kind === 'telegram' && <path d="M20.9 3.6 17.7 20c-.1.7-.6.9-1.2.5l-5.4-4.1-2.6 2.4.5-5 8.3-7.2-10.4 6.2-4.5-1.5c-.8-.3-.8-.7 0-1.1l17.5-6.8c.7-.3 1.1-.1 1 .2Z"/>}
  </svg>;
}
