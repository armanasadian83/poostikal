import type { SVGProps } from 'react';
import { Icon, type IconName } from '../icons';

const extras = {
  printer: <><path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a1 1 0 0 1-1 1h-3"/><path d="M7 14h10v7H7zM17 11h1"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
  logout: <><path d="M10 4H5v16h5M9 12h12m-4-4 4 4-4 4"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="11" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="18" width="7" height="3" rx="1"/></>,
  products: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5"/></>,
  orders: <><path d="M3 3h2l2 13h12l2-9H6M9 20h.1M18 20h.1" strokeWidth="1.8"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a4 4 0 0 1 0 8m3 9v-2a6 6 0 0 0-2-4.5"/></>,
  settings: <><path d="m10 2-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3h-4Z"/><circle cx="12" cy="12.5" r="3.3"/></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15v5Z"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 22h4"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  external: <><path d="M14 3h7v7m0-7L11 13M9 3H3v18h18v-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18M7 15h.1m4 0h.1m4 0h.1"/></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-10m-6 0h6v6M4 21h16"/></>,
};
export type AdminIconName = IconName | keyof typeof extras;
export function AdminIcon({ name, size = 21, ...props }: SVGProps<SVGSVGElement> & { name: AdminIconName; size?: number }) {
  if (!(name in extras)) return <Icon name={name as IconName} size={size} {...props}/>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{extras[name as keyof typeof extras]}</svg>;
}
