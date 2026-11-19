import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AdminProvider } from '@/components/admin/admin-provider';
import { AdminShell } from '@/components/admin/admin-shell';
import './admin.css';
import './rich-text-editor.css';
import './admin-catalog.css';
import './admin-audio.css';
import './admin-orders.css';
import './admin-theme.css';
export const metadata: Metadata={title:'پنل مدیریت',description:'پنل مدیریت داخلی فروشگاه پوستیکال.',robots:{index:false,follow:false}};
export default function AdminLayout({children}:{children:ReactNode}){return <AdminProvider><AdminShell>{children}</AdminShell></AdminProvider>;}
import './admin-management.css';
