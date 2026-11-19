'use client';
import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { AdminPageHeading, AdminPanel } from './admin-ui';
import { AdminIcon } from './admin-icon';
import { useAdmin, type AdminSettings } from './admin-provider';
import { useSiteSettings } from '../site-settings-provider';
import { AdminThemeSettings, useAdminThemeEditor } from './admin-theme-settings';
import { useSettingsDirty } from './settings-navigation';

type SettingsDraft = Omit<AdminSettings, 'stockThreshold'> & { stockThreshold: string };

export function AdminSettingsPage() {
  const { settings, saveSettings } = useAdmin();
  const site = useSiteSettings();
  const editor = useAdminThemeEditor();
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const form = draft ?? { ...settings, stockThreshold: String(settings.stockThreshold) };
  const busy = saving || editor.busy;
  const generalDirty = draft !== null && JSON.stringify(form) !== JSON.stringify({ ...settings, stockThreshold: String(settings.stockThreshold) });
  const dirty = generalDirty || editor.dirty;
  useSettingsDirty(dirty);

  function edit(change: Partial<SettingsDraft>) {
    setDraft({ ...form, ...change });
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    setError('');
    setNotice('');

    const value = {
      ...form,
      storeName: form.storeName.trim(),
      storeDescription: form.storeDescription.trim(),
      email: form.email.trim(),
      stockThreshold: Number(form.stockThreshold),
    };

    if (generalDirty && (!event.currentTarget.reportValidity() || !value.storeName)) {
      setError(!value.storeName ? 'نام فروشگاه را وارد کن.' : 'مقدار فیلد مشخص‌شده را بررسی کن.');
      return;
    }

    setSaving(true);
    try {
      if (generalDirty) {
        const result = await saveSettings(value);
        if (!result.ok) {
          setError(result.error ?? 'تنظیمات عمومی ذخیره نشد.');
          return;
        }
        setDraft(null);
        if (value.storeName !== settings.storeName || value.storeDescription !== settings.storeDescription) {
          // The settings write has committed. A refresh failure leaves the saved values intact.
          void site.refresh().catch(() => {});
        }
      }

      if (editor.dirty) {
        const result = await editor.saveDraft();
        if (!result.ok) {
          const message = result.error ?? 'پالت ذخیره نشد.';
          setError(generalDirty ? `تنظیمات عمومی ذخیره شد. ${message}` : message);
          return;
        }
      }
      setNotice('تغییرات ذخیره شد.');
    } finally {
      setSaving(false);
    }
  }

  return <>
    <AdminPageHeading
      title="عمومی"
      description="مشخصات فروشگاه و ترجیحات مدیریت رو اینجا تنظیم کن."
      action={<button className="admin-button admin-button-primary" type="submit" form="admin-settings-form" disabled={busy || !dirty}>
        <AdminIcon name="check" size={18}/>{saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
      </button>}
    />
    {error ? <p role="alert" className="admin-form-error">{error}</p> : null}
    {notice && !dirty ? <p role="status" className="theme-feedback"><AdminIcon name="check" size={17}/>{notice}</p> : null}
    <AdminThemeSettings editor={editor} saving={saving}/>
    <div className="admin-settings-layout">
      <form id="admin-settings-form" onSubmit={submit} noValidate className="admin-settings-form">
        <AdminPanel title="مشخصات فروشگاه">
          <div className="admin-form-grid">
            <label className="admin-form-field">نام فروشگاه
              <input required maxLength={60} value={form.storeName} disabled={busy} onChange={event => edit({ storeName: event.target.value })}/>
            </label>
            <label className="admin-form-field">ایمیل اطلاع‌رسانی
              <input type="email" dir="ltr" placeholder="name@example.com" value={form.email} disabled={busy} onChange={event => edit({ email: event.target.value })}/>
            </label>
            <label className="admin-form-field admin-form-field-wide">معرفی کوتاه
              <textarea maxLength={180} rows={3} value={form.storeDescription} disabled={busy} onChange={event => edit({ storeDescription: event.target.value })}/>
            </label>
            <label className="admin-form-field">زبان پنل<input value="فارسی" readOnly/></label>
            <label className="admin-form-field">واحد قیمت<input value="تومان" readOnly/></label>
          </div>
        </AdminPanel>
        <AdminPanel title="ترجیحات پنل">
          <label className="admin-toggle-row">
            <span><strong>یادآور سفارش‌های جدید</strong><small>نمایش سفارش‌های منتظر بررسی در پنل</small></span>
            <input type="checkbox" role="switch" checked={form.orderNotifications} disabled={busy} onChange={event => edit({ orderNotifications: event.target.checked })}/>
          </label>
          <label className="admin-toggle-row">
            <span><strong>هشدار موجودی کم</strong><small>نمایش محصولات نزدیک به اتمام در پنل</small></span>
            <input type="checkbox" role="switch" checked={form.lowStockAlerts} disabled={busy} onChange={event => edit({ lowStockAlerts: event.target.checked })}/>
          </label>
          <label className="admin-form-field admin-threshold">آستانه هشدار موجودی
            <input type="number" min={0} max={999} required value={form.stockThreshold} disabled={busy} onChange={event => edit({ stockThreshold: event.target.value })}/>
          </label>
          <label className="admin-toggle-row">
            <span><strong>جدول‌های فشرده</strong><small>ردیف‌های بیشتر در فضای کمتر</small></span>
            <input type="checkbox" role="switch" checked={form.compactTables} disabled={busy} onChange={event => edit({ compactTables: event.target.checked })}/>
          </label>
        </AdminPanel>
        <p className="admin-small admin-muted">تنظیمات در پایگاه داده ذخیره می‌شوند. ارسال ایمیل هنوز فعال نیست.</p>
      </form>
      <div className="admin-settings-aside">
        <AdminPanel title="هویت فروشگاه">
          <div className="admin-store-preview">
            <Image src={site.settings.branding.logo} width={2039} height={367} alt="پوستیکال" sizes="210px"/>
            <h2>{form.storeName || 'نام فروشگاه'}</h2><p>{form.storeDescription}</p><span>فارسی · تومان</span>
          </div>
        </AdminPanel>
      </div>
    </div>
  </>;
}
