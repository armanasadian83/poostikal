'use client';
import {useSiteSettings} from './site-settings-provider';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCatalog } from './catalog-provider';
import { api } from '@/lib/api';
import { type PreviewMessage } from '@/lib/chat-preview';
import { MAX_CHAT_MESSAGES, readChatHistory, writeChatHistory, type ChatConversation } from '@/lib/chat-history';
import { Dialog } from './dialog';
import { Icon } from './icons';
import { BannerBackdrop } from './banner-backdrop';
import { VoiceRecorder } from './voice-recorder';

const newId = () => crypto.randomUUID();

function resizeChatInput(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  const maximum = Number.parseFloat(getComputedStyle(element).maxHeight) || 150;
  const required = element.scrollHeight;
  element.style.height = `${Math.min(required, maximum)}px`;
  element.style.overflowY = required > maximum ? 'auto' : 'hidden';
}

function ProductLinks({ ids }: { ids: string[] }) {
  const { products } = useCatalog();
  return <div className="chat-product-links">{ids.map(id => {
    const product = products.find(item => item.id === id);
    if (!product) return null;
    return <Link className="chat-product-link" href={`/products/${product.slug}`} key={id}>
      <span className="chat-product-image"><Image src={product.variants[0].image ?? product.image} alt="" fill sizes="72px"/></span>
      <span className="chat-product-info"><span dir="ltr">{product.brand}</span><h3>{product.name}</h3><small>مشاهده محصول و اندازه‌ها</small></span>
      <Icon name="arrow-left" size={19}/>
    </Link>;
  })}</div>;
}

function ChatHistory({ conversations, activeId, onNew, onSelect, onDelete, close }: {
  conversations: ChatConversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (conversation: ChatConversation) => void;
  onDelete: (id: string) => void;
  close?: () => void;
}) {
  const {settings:{chat:config,branding}}=useSiteSettings();
  return <div className="chat-history-panel">
    <Link href="/" className="chat-wordmark" aria-label="پوستیکال، صفحه اصلی" onClick={close}><Image src={branding.logo} width={224} height={40} alt={branding.logoAlt}/></Link>
    <button className="chat-new-button" onClick={() => { onNew(); close?.(); }}><Icon name="plus" size={22}/>{config.newChatLabel}</button>
    <h2 className="chat-history-heading">گفتگوهای تو</h2>
    {conversations.length ? <ul className="chat-history-list">{conversations.map(conversation => <li key={conversation.id} className={`chat-history-item${conversation.id === activeId ? ' is-active' : ''}`}>
      <button className="chat-history-select" aria-current={conversation.id === activeId ? 'true' : undefined} onClick={() => { onSelect(conversation); close?.(); }}><Icon name="message" size={18}/><span>{conversation.title}</span></button>
      <button className="chat-history-delete" aria-label={`حذف گفتگو: ${conversation.title}`} onClick={() => onDelete(conversation.id)}><Icon name="trash" size={16}/></button>
    </li>)}</ul> : <div className="chat-history-empty"><Icon name="message" size={58}/><p>هنوز گفتگویی نداری</p></div>}
    <Link href="/" className="chat-store-link" onClick={close}><Icon name="bag" size={22}/><span>برگشت به فروشگاه</span><Icon name="arrow-left" size={18}/></Link>
  </div>;
}

export function PoostikalChat() {
  const {settings:{chat:config,branding}}=useSiteSettings();
  const [replyError,setReplyError] = useState('');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceReset, setVoiceReset] = useState(0);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyGeneration = useRef(0);
  const pendingRef = useRef(false);
  const histories = useRef<ChatConversation[]>([]);
  const activeRef = useRef<ChatConversation | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);

  useEffect(() => {
    // Let the server-rendered welcome screen paint before reading browser storage.
    // Initial hydration never writes an empty history over existing conversations.
    const frame = requestAnimationFrame(() => {
      try {
        const restored = readChatHistory(window.localStorage);
        histories.current = restored;
        setConversations(restored);
        activeRef.current = restored[0] ?? null;
        setActive(restored[0] ?? null);
      } catch { setStorageAvailable(false); }
      setStorageReady(true);
    });
    return () => { cancelAnimationFrame(frame); replyGeneration.current += 1; if (replyTimer.current) clearTimeout(replyTimer.current); };
  }, []);

  useEffect(() => {
    resizeChatInput(textarea.current);
  }, [draft]);

  useEffect(() => {
    const resize = () => resizeChatInput(textarea.current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeMobileHistory = (event: MediaQueryListEvent) => { if (event.matches) setHistoryOpen(false); };
    desktop.addEventListener('change', closeMobileHistory);
    return () => desktop.removeEventListener('change', closeMobileHistory);
  }, []);

  useEffect(() => {
    const element = transcript.current;
    if (element && followBottom.current) element.scrollTop = element.scrollHeight;
  }, [active, pending]);

  function persist(next: ChatConversation[]) {
    histories.current = next;
    setConversations(next);
    try { setStorageAvailable(writeChatHistory(window.localStorage, next)); }
    catch { setStorageAvailable(false); }
  }

  function saveConversation(conversation: ChatConversation) {
    activeRef.current = conversation;
    setActive(conversation);
    persist([conversation, ...histories.current.filter(item => item.id !== conversation.id)].slice(0, 12));
  }

  function cancelReply() {
    replyGeneration.current += 1;
    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = null;
    pendingRef.current = false;
    setPending(false);
  }

  function resetChat() {
    cancelReply();
    setVoiceReset(value => value + 1);
    activeRef.current = null;
    setActive(null);
    setDraft('');
    setAnnouncement('گفتگوی تازه آماده است.');
    followBottom.current = true;
    textarea.current?.focus();
  }

  function selectChat(conversation: ChatConversation) {
    cancelReply();
    setVoiceReset(value => value + 1);
    activeRef.current = conversation;
    setActive(conversation);
    setDraft('');
    followBottom.current = true;
  }

  function deleteChat(id: string) {
    if (activeRef.current?.id === id) resetChat();
    persist(histories.current.filter(item => item.id !== id));
    setAnnouncement('گفتگو حذف شد.');
  }

  async function startReply(conversation: ChatConversation) {
    const lastUser = conversation.messages.at(-1);
    if (pendingRef.current || lastUser?.role !== 'user') return;
    const generation = ++replyGeneration.current;
    pendingRef.current = true;
    setPending(true);
    setAnnouncement('پاسخ در حال آماده شدن است.');
    setReplyError('');
    try {
      const result=await api<{text:string;productIds:string[]}>('/chat',{method:'POST',body:JSON.stringify({messages:conversation.messages.slice(-16).map(m=>({role:m.role,content:m.content}))})});
      if (replyGeneration.current !== generation || activeRef.current?.id !== conversation.id) return;
      const reply = {content:result.text,productIds:result.productIds};
      const completed: ChatConversation = {
        ...conversation,
        // eslint-disable-next-line react-hooks/purity -- Runs after an awaited chat request from an event handler.
        updatedAt: Date.now(),
        messages: [...conversation.messages, { id: newId(), role: 'assistant', ...reply }],
      };
      replyTimer.current = null;
      pendingRef.current = false;
      setPending(false);
      saveConversation(completed);
      setAnnouncement('پاسخ آماده شد.');
    } catch(error) {if(replyGeneration.current===generation){setReplyError(error instanceof Error?error.message:'دریافت پاسخ انجام نشد.');pendingRef.current=false;setPending(false);}}

  }

  function sendMessage(value: string) {
    const content = value.trim().slice(0, 2000);
    if (!content || pendingRef.current || recording || !storageReady) return;
    const current = activeRef.current;
    if ((current?.messages.length ?? 0) > MAX_CHAT_MESSAGES - 2) return;
    const conversation: ChatConversation = {
      id: current?.id ?? newId(),
      title: current?.title ?? content.replace(/\s+/g, ' ').slice(0, 70),
      // eslint-disable-next-line react-hooks/purity -- Timestamp for the user-submit event, not render output.
      updatedAt: Date.now(),
      messages: [...(current?.messages ?? []), { id: newId(), role: 'user', content }],
    };
    followBottom.current = true;
    saveConversation(conversation);
    setDraft('');
    startReply(conversation);
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); sendMessage(draft); }
  const messages: PreviewMessage[] = active?.messages ?? [];
  const canRetry = !pending && messages.at(-1)?.role === 'user';
  const atLimit = messages.length > MAX_CHAT_MESSAGES - 2;
  const historyProps = { conversations, activeId: active?.id ?? null, onNew: resetChat, onSelect: selectChat, onDelete: deleteChat };

  return <main className="poostikal-chat" id="main-content">
    <BannerBackdrop/>
    <aside className="chat-desktop-sidebar" aria-label="گفتگوهای تو"><ChatHistory {...historyProps}/></aside>
    <section className="chat-workspace" aria-labelledby="chat-title">
      <header className="chat-topbar">
        <button className="chat-history-toggle" aria-label="باز کردن گفتگوها" aria-haspopup="dialog" onClick={() => { setVoiceReset(value => value + 1); setHistoryOpen(true); }}><Icon name="menu" size={23}/></button>
        <div className="chat-topbar-title"><Image className="chat-topbar-wordmark" src={branding.logo} alt={branding.logoAlt} width={156} height={28}/><h1 id="chat-title">{config.title}</h1><span className="chat-preview-label">مشاور هوشمند پوستیکال</span></div>
        <button className="chat-new-mobile" aria-label="گفتگوی تازه" onClick={resetChat}><Icon name="plus" size={24}/></button>
      </header>
      <div className="chat-transcript" ref={transcript} onScroll={event => { const element = event.currentTarget; followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        {messages.length ? <div className="chat-messages" role="log" aria-label="پیام‌های گفتگو" aria-live="off">{messages.map(message => <article className={`chat-message ${message.role}`} key={message.id} aria-label={message.role === 'user' ? 'پیام تو' : 'پاسخ پوستیکال'}>
          {message.role === 'assistant' ? <span className="chat-avatar"><Image src="/brand/poostikal-lips-transparent.png" alt="" width={40} height={40}/></span> : null}
          <div className="chat-message-body">{message.role === 'assistant' ? <p className="chat-message-label">پوستیکال · پاسخ</p> : null}<div className="chat-message-bubble"><p dir="auto">{message.content}</p></div>{message.productIds?.length ? <ProductLinks ids={message.productIds}/> : null}</div>
        </article>)}
          {pending ? <div className="chat-pending" aria-hidden="true"><Image src="/brand/poostikal-lips-transparent.png" alt="" width={36} height={36}/><span/><span/><span/></div> : null}
          {canRetry ? <div className="chat-interrupted"><span role="alert">{replyError || "پاسخ هنوز آماده نشده."}</span><button disabled={recording} onClick={() => { if (active) startReply(active); textarea.current?.focus(); }}><Icon name="refresh" size={16}/>دوباره امتحان کن</button></div> : null}
        </div> : <div className="chat-welcome">
          <h2>{config.welcome}</h2>
          <p>{config.description}</p>
          <div className="chat-suggestions">{config.suggestions.map(({text:label}) => <button disabled={!storageReady || recording} key={label} onClick={() => sendMessage(label)}>{label}</button>)}</div>
        </div>}
      </div>
      <div className="chat-composer-wrap">
        {atLimit ? <p className="chat-limit-message">برای ادامه، یک گفتگوی تازه باز کن.</p> : null}
        <form className="chat-composer" onSubmit={submit}>
          <label className="chat-sr-only" htmlFor="chat-message">پیامت را بنویس</label>
          <textarea id="chat-message" className="chat-input" ref={textarea} value={draft} rows={1} maxLength={2000} placeholder={config.placeholder} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(draft); }
          }} disabled={!storageReady || atLimit || recording}/>
          <VoiceRecorder disabled={pending || !storageReady || atLimit} resetKey={`${active?.id ?? 'new'}:${voiceReset}`} onRecordingChange={setRecording}/>
          {pending ? <button type="button" className="chat-send" aria-label="توقف پاسخ" onClick={() => { cancelReply(); setAnnouncement('پاسخ متوقف شد.'); textarea.current?.focus(); }}><Icon name="stop" size={19}/></button> : <button type="submit" className="chat-send" aria-label="ارسال پیام" disabled={!draft.trim() || !storageReady || atLimit || recording}><Icon name="send" size={22}/></button>}
        </form>
        <p className="chat-storage-note">{storageAvailable ? 'گفتگوها در این مرورگر ذخیره می‌شوند.' : 'ذخیرهٔ گفتگو در این مرورگر در دسترس نیست.'}</p>
      </div>
      <span className="chat-sr-only" role="status" aria-live="polite">{announcement}</span>
    </section>
    {historyOpen ? <Dialog title="گفتگوهای تو" drawer drawerSide="right" onClose={() => setHistoryOpen(false)}><ChatHistory {...historyProps} close={() => setHistoryOpen(false)}/></Dialog> : null}
  </main>;
}
