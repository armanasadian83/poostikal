'use client';

import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { DESCRIPTION_LIMITS, isSafeRichTextLink, richTextLength, sanitizeRichText } from '@poostikal/rich-text';
import { formatNumber } from '@/lib/format';

type Props = { label: string; value: string; onChange: (html: string) => void; placeholder: string; maxLength: number; compact?: boolean; disabled?: boolean };
const paths = {
  bullet: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  ordered: 'M9 6h12M9 12h12M9 18h12M3 3h1v5M3 12c0-2 3-2 3 0 0 1-3 3-3 4h3',
  link: 'm10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  right: 'M3 5h18M9 10h12M3 15h18M9 20h12',
  center: 'M3 5h18M6 10h12M3 15h18M6 20h12',
  left: 'M3 5h18M3 10h12M3 15h18M3 20h12',
  undo: 'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',
  redo: 'm15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  clear: 'm5 15 8-11 7 5-8 11H8l-3-5Zm3-4 7 5m0 4h6',
};
function ToolIcon({ name }: { name: keyof typeof paths }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>; }

export const AdminRichTextEditor = memo(function AdminRichTextEditor({ label, value, onChange, placeholder, maxLength, compact, disabled = false }: Props) {
  const id = useId();
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [newTab, setNewTab] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [notice, setNotice] = useState('');
  const lastEmitted = useRef(value);
  const [selection, setSelection] = useState({ from: 0, to: 0 });
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const count = richTextLength(value);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: null, rel: null } } }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'right' }),
    ],
    content: sanitizeRichText(value),
    editable: !disabled,
    editorProps: {
      attributes: { id: `${id}-visual`, class: 'rich-text-content admin-rich-text-body', dir: 'rtl', role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', 'aria-describedby': `${id}-count` },
      transformPastedHTML: html => sanitizeRichText(html),
    },
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? '' : current.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });
  const active = useEditorState({ editor, selector: ({ editor: current }) => current ? {
    bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'), strike: current.isActive('strike'),
    bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'), quote: current.isActive('blockquote'), link: current.isActive('link'),
    alignment: current.isActive({ textAlign: 'center' }) ? 'center' : current.isActive({ textAlign: 'left' }) ? 'left' : 'right',
    heading: current.isActive('heading', { level: 1 }) ? '1' : current.isActive('heading', { level: 2 }) ? '2' : current.isActive('heading', { level: 3 }) ? '3' : 'p',
    undo: current.can().undo(), redo: current.can().redo(),
  } : null });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => {
    if (!editor || mode !== 'visual' || value === lastEmitted.current) return;
    const html = sanitizeRichText(value);
    if (html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false });
    lastEmitted.current = value;
  }, [editor, value, mode]);

  function changeMode(next: 'visual' | 'code') {
    if (next === mode || !editor) return;
    setLinkOpen(false);
    const html = next === 'code' ? (editor.isEmpty ? '' : editor.getHTML()) : sanitizeRichText(value);
    if (next === 'visual') {
      if (sanitizeRichText(editor.getHTML()) !== html) {
        // Keep a source edit separate from the next typing/formatting undo step.
        editor.view.dispatch(closeHistory(editor.state.tr));
        editor.commands.setContent(html, { emitUpdate: false });
        editor.view.dispatch(closeHistory(editor.state.tr));
      }
      const normalized = editor.isEmpty ? '' : editor.getHTML();
      setNotice(normalized !== value && value.trim() ? 'کد با قالب‌های پشتیبانی‌شده هماهنگ شد.' : '');
      lastEmitted.current = normalized;
      onChange(normalized);
    } else {
      lastEmitted.current = html;
      onChange(html);
      setNotice('');
    }
    setMode(next);
  }

  function openLink() {
    if (!editor) return;
    setSelection({ from: editor.state.selection.from, to: editor.state.selection.to });
    setLinkUrl(editor.getAttributes('link').href || '');
    setNewTab(editor.getAttributes('link').target === '_blank');
    setLinkError('');
    setLinkOpen(true);
  }
  function applyLink(remove = false) {
    if (!editor) return;
    const href = linkUrl.trim();
    if (!remove && !isSafeRichTextLink(href)) { setLinkError('یک نشانی معتبر با https:// یا مسیر داخلی مثل /shop وارد کن.'); return; }
    const chain = editor.chain().focus().setTextSelection(selection).extendMarkRange('link');
    if (remove) chain.unsetLink().run();
    else if (selection.from === selection.to && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href, target: newTab ? '_blank' : null, rel: newTab ? 'noopener noreferrer' : null } }] }).run();
    } else chain.setLink({ href, target: newTab ? '_blank' : null, rel: newTab ? 'noopener noreferrer' : null }).run();
    setLinkOpen(false);
  }
  function tool(title: string, child: ReactNode, action: () => void, pressed?: boolean, unavailable = false) {
    return <button type="button" title={title} aria-label={title} aria-pressed={pressed} disabled={disabled || !editor || unavailable} onMouseDown={event => event.preventDefault()} onClick={action}>{child}</button>;
  }

  return <div className={`admin-form-field admin-form-field-wide admin-rich-text-field${compact ? ' is-compact' : ''}`}>
    <div className="admin-rich-text-label"><span id={`${id}-label`}>{label}</span><small>ویرایشگر متن</small></div>
    <div className={`admin-rich-text${count > maxLength ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="admin-rich-text-topline">
        <div className="admin-rich-text-tabs" role="tablist" aria-label={`حالت ${label}`}>
          {(['visual', 'code'] as const).map(tab => <button type="button" role="tab" key={tab} id={`${id}-${tab}-tab`} aria-selected={mode === tab} aria-controls={`${id}-panel`} tabIndex={mode === tab ? 0 : -1} disabled={disabled || !editor} onClick={() => changeMode(tab)} onKeyDown={event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next = event.key === 'Home' ? 'visual' : event.key === 'End' ? 'code' : mode === 'visual' ? 'code' : 'visual';
              changeMode(next);
              document.getElementById(`${id}-${next}-tab`)?.focus();
            }
          }}><span aria-hidden="true">{tab === 'visual' ? 'Aa' : '</>'}</span>{tab === 'visual' ? 'متن' : 'کد'}</button>)}
        </div>
        <span className="admin-rich-text-mode-label">{mode === 'visual' ? 'ویرایش دیداری' : 'HTML'}</span>
      </div>
      {mode === 'visual' ? <div className="admin-rich-text-toolbar" role="group" aria-label={`ابزارهای ${label}`}>
        <select aria-label={`نوع تیتر ${label}`} value={active?.heading || 'p'} disabled={disabled || !editor} onChange={event => {
          if (event.target.value === 'p') editor?.chain().focus().setParagraph().run();
          else editor?.chain().focus().setHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run();
        }}><option value="p">پاراگراف</option><option value="1">تیتر ۱ · H1</option><option value="2">تیتر ۲ · H2</option><option value="3">تیتر ۳ · H3</option></select>
        <div className="admin-rich-text-tools">
          {tool('پررنگ (Ctrl+B)', <b>B</b>, () => { editor?.chain().focus().toggleBold().run(); }, active?.bold)}
          {tool('مورب (Ctrl+I)', <i>I</i>, () => { editor?.chain().focus().toggleItalic().run(); }, active?.italic)}
          {tool('زیرخط (Ctrl+U)', <u>U</u>, () => { editor?.chain().focus().toggleUnderline().run(); }, active?.underline)}
          {tool('خط‌خورده', <s>S</s>, () => { editor?.chain().focus().toggleStrike().run(); }, active?.strike)}
        </div>
        <div className="admin-rich-text-tools">
          {tool('فهرست نقطه‌ای', <ToolIcon name="bullet"/>, () => { editor?.chain().focus().toggleBulletList().run(); }, active?.bullet)}
          {tool('فهرست شماره‌دار', <ToolIcon name="ordered"/>, () => { editor?.chain().focus().toggleOrderedList().run(); }, active?.ordered)}
          {tool('نقل‌قول', <span className="admin-rich-text-quote">❞</span>, () => { editor?.chain().focus().toggleBlockquote().run(); }, active?.quote)}
          {tool('درج یا ویرایش لینک', <ToolIcon name="link"/>, openLink, active?.link)}
        </div>
        <div className="admin-rich-text-tools">
          {(['right', 'center', 'left'] as const).map(align => <span key={align}>{tool(align === 'right' ? 'راست‌چین' : align === 'center' ? 'وسط‌چین' : 'چپ‌چین', <ToolIcon name={align}/>, () => { editor?.chain().focus().setTextAlign(align).run(); }, active?.alignment === align)}</span>)}
          {tool('خط جداکننده', <span aria-hidden="true">―</span>, () => { editor?.chain().focus().setHorizontalRule().run(); })}
        </div>
        <div className="admin-rich-text-tools">
          {tool('پاک کردن قالب‌بندی', <ToolIcon name="clear"/>, () => { editor?.chain().focus().unsetAllMarks().clearNodes().run(); })}
          {tool('واگرد (Ctrl+Z)', <ToolIcon name="undo"/>, () => { editor?.chain().focus().undo().run(); }, undefined, !active?.undo)}
          {tool('انجام دوباره (Ctrl+Shift+Z)', <ToolIcon name="redo"/>, () => { editor?.chain().focus().redo().run(); }, undefined, !active?.redo)}
        </div>
      </div> : <div className="admin-rich-text-code-hint">کد HTML متن را ویرایش کن؛ برای دیدن نتیجه، به «متن» برگرد.</div>}
      {linkOpen && <div className="admin-rich-text-link" role="group" aria-label="تنظیمات لینک" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setLinkOpen(false); editor?.commands.focus(); }
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'url') { event.preventDefault(); applyLink(); }
      }}>
        <label htmlFor={`${id}-url`}>نشانی لینک</label>
        <div className="admin-rich-text-link-row"><input id={`${id}-url`} type="url" dir="ltr" autoFocus placeholder="https://example.com" value={linkUrl} onChange={event => { setLinkUrl(event.target.value); setLinkError(''); }} aria-invalid={!!linkError} aria-describedby={linkError ? `${id}-link-error` : undefined}/><button type="button" onClick={() => applyLink()}>اعمال لینک</button><button type="button" onClick={() => { setLinkOpen(false); editor?.commands.focus(); }}>بستن</button></div>
        <div className="admin-rich-text-link-options"><label><input type="checkbox" checked={newTab} onChange={event => setNewTab(event.target.checked)}/>باز شدن در زبانهٔ جدید</label>{active?.link && <button type="button" onClick={() => applyLink(true)}>حذف لینک</button>}</div>
        {linkError && <p id={`${id}-link-error`} role="alert">{linkError}</p>}
      </div>}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}-tab`}>
        {mode === 'visual' ? <EditorContent editor={editor}/> : <textarea ref={codeRef} className="admin-rich-text-code" aria-label={`کد HTML ${label}`} aria-describedby={`${id}-count`} dir="ltr" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={value} maxLength={DESCRIPTION_LIMITS.raw} disabled={disabled} onChange={event => onChange(event.target.value)} onKeyDown={event => {
          // Editing HTML must not accidentally submit the enclosing product form.
          if (event.key === 'Enter') event.stopPropagation();
        }}/>}
        {!editor && <div className="admin-rich-text-loading" role="status">در حال آماده‌سازی ویرایشگر…</div>}
      </div>
      <div className="admin-rich-text-bottom"><small id={`${id}-count`} className={count > maxLength ? 'is-error' : ''}>{formatNumber(count)} / {formatNumber(maxLength)} نویسه</small><small>{count > maxLength ? 'متن را کوتاه‌تر کن.' : 'قالب‌بندی در شمارش متن حساب نمی‌شود.'}</small></div>
    </div>
    {notice && <small role="status">{notice}</small>}
  </div>;
});
