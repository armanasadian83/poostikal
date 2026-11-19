'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '../icons';
import styles from './support.module.css';
import { ExpressionPicker, MessageBubble, QuotePreview, type Sender, type Message, type Quote, type Likes, type Picker } from './message-content';

type History = { messages: Message[]; hasMore: boolean; updates: Likes[]; likeCursor: string; moreUpdates: boolean };
const time = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
const date = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

function newerVersion(incoming: string, current: string) {
  return incoming.length !== current.length ? incoming.length > current.length : incoming >= current;
}

function merge(current: Message[], batch: Message[], updates: Likes[] = []) {
  const unique = new Map(current.map(item => [item.id, item]));
  for (const item of batch) {
    const existing = unique.get(item.id);
    if (!existing || newerVersion(item.version, existing.version)) unique.set(item.id, item);
  }
  for (const update of updates) {
    const existing = unique.get(update.id);
    if (existing && newerVersion(update.version, existing.version)) unique.set(update.id, {...existing, ...update});
  }
  return Array.from(unique.values()).sort((a,b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
}

export function Conversation({ path, viewer, onSent, onLost }: {
  path: string; viewer: Sender; onSent?: () => void; onLost?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyTo, setReplyTo] = useState<Quote | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [liking, setLiking] = useState<Set<string>>(new Set());
  const pendingLikes = useRef(new Set<string>());
  const pickerRoot = useRef<HTMLDivElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const newest = useRef('');
  const updatesDuringPaging = useRef<Likes[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const anchor = useRef<{id: string; top: number} | null>(null);
  const attempt = useRef<{key: string; clientId: string} | null>(null);
  const sendingNow = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const checkAccess = useCallback((e: unknown) => {
    if (e instanceof ApiError && [401,403,404].includes(e.status)) onLost?.();
  }, [onLost]);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    let likeCursor: string | undefined;
    async function refresh() {
      if (document.hidden || busy || controller.signal.aborted) return;
      busy = true;
      try {
        let more: boolean;
        do {
          const after = newest.current;
          const params = new URLSearchParams();
          if (after) params.set('after', after);
          if (likeCursor !== undefined) params.set('since',likeCursor);
          const data = await api<History>(path + '?' + params, {signal:controller.signal});
          if (controller.signal.aborted) return;
          if (!after) setHasOlder(data.hasMore);
          updatesDuringPaging.current?.push(...data.updates);
          if (data.messages.length) {
            newest.current = data.messages[data.messages.length - 1].id;
          }
          likeCursor = data.likeCursor;
          if (data.messages.length || data.updates.length) setMessages(previous => merge(previous, data.messages, data.updates));
          more = Boolean(after && data.hasMore) || data.moreUpdates;
        } while (more && !controller.signal.aborted);
        setReady(true); setNetworkError(false);
      } catch (e) {
        if (!controller.signal.aborted) { setNetworkError(true); checkAccess(e); }
      } finally { busy = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3500);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [path, checkAccess]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (anchor.current) {
      const previous = el.querySelector<HTMLElement>('[data-message="' + anchor.current.id + '"]');
      if (previous) el.scrollTop += previous.getBoundingClientRect().top - anchor.current.top;
      anchor.current = null;
    } else if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function older() {
    if (updatesDuringPaging.current || !messages.length) return;
    const inFlightUpdates: Likes[] = [];
    updatesDuringPaging.current = inFlightUpdates;
    setLoadingOlder(true);
    try {
      const first = messages[0].id;
      const data = await api<History>(path + '?before=' + first);
      const row = scroller.current?.querySelector<HTMLElement>('[data-message="' + first + '"]');
      if (row) anchor.current = { id: first, top: row.getBoundingClientRect().top };
      setMessages(previous => merge(previous, data.messages, inFlightUpdates));
      setHasOlder(data.hasMore);
    } catch (e) { setNetworkError(true); checkAccess(e); }
    finally { updatesDuringPaging.current = null; setLoadingOlder(false); }
  }

  useEffect(() => {
    if (!picker) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRoot.current?.contains(event.target)) setPicker(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key==='Escape') {
        event.preventDefault(); event.stopPropagation(); setPicker(null); pickerButton.current?.focus();
      }
    }
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape,true);
    return () => { document.removeEventListener('pointerdown',dismiss); document.removeEventListener('keydown',escape,true); };
  },[picker]);

  function insertEmoji(emoji: string, focusComposer: boolean) {
    const field = input.current;
    if (!field) return;
    const { selectionStart, selectionEnd } = field;
    if (field.value.length - (selectionEnd - selectionStart) + emoji.length > field.maxLength) return;
    field.setRangeText(emoji, selectionStart, selectionEnd, 'end');
    setDraft(field.value);
    if (focusComposer) field.focus({ preventScroll: true });
  }

  async function like(message: Message) {
    if (pendingLikes.current.has(message.id)) return;
    pendingLikes.current.add(message.id); setLiking(new Set(pendingLikes.current)); setSendError('');
    try {
      const updated=await api<Likes>(path+'/'+message.id+'/like',{method:'POST',body:JSON.stringify({liked:!message.liked})});
      setMessages(previous=>merge(previous,[],[updated]));
    } catch(e) { setSendError(e instanceof Error ? e.message : 'ثبت پسند انجام نشد.'); checkAccess(e); }
    finally { pendingLikes.current.delete(message.id); setLiking(new Set(pendingLikes.current)); }
  }

  async function send(stickerId?: string) {
    const body=draft.trim();
    if ((!stickerId && !body) || sendingNow.current || !ready) return;
    sendingNow.current = true; setSending(true); setSendError('');
    const payload={...(stickerId ? {stickerId} : {body}), replyTo:replyTo?.id};
    const key=JSON.stringify(payload);
    if (attempt.current?.key !== key) attempt.current = { key, clientId: crypto.randomUUID() };
    try {
      const message = await api<Message>(path, { method:'POST', body:JSON.stringify({...payload,clientId:attempt.current.clientId}) });
      pinned.current = true; setMessages(previous => merge(previous, [message]));
      attempt.current = null; if (!stickerId) setDraft('');
      setReplyTo(null); setPicker(null); onSent?.();
    } catch (e) { setSendError(e instanceof Error ? e.message : 'ارسال نشد. دوباره تلاش کن.'); checkAccess(e); }
    finally { sendingNow.current = false; setSending(false); input.current?.focus(); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }

  return <div className={styles.conversation}>
    <div className={styles.history} ref={scroller} onScroll={e => {
      const el=e.currentTarget; pinned.current = el.scrollHeight-el.scrollTop-el.clientHeight<50;
    }}>
      {hasOlder && <button type="button" className={styles.older} disabled={loadingOlder} onClick={older}>پیام‌های قبلی</button>}
      <div role="log" aria-label="پیام‌های گفت‌وگو" aria-live="polite" className={styles.messages}>
        {messages.map((message,index) => {
          const stamp=new Date(message.createdAt);
          const day=date.format(stamp);
          return <Fragment key={message.id}>{(index===0 || day!==date.format(new Date(messages[index-1].createdAt))) && <span className={styles.day}>{day}</span>}
            <MessageBubble message={message} viewer={viewer} clock={time.format(stamp)} busy={liking.has(message.id)}
              onReply={()=>{if (!sendingNow.current) {setReplyTo(message);setPicker(null);input.current?.focus();}}}
              onLike={()=>void like(message)}/></Fragment>;
        })}
      </div>
      {!messages.length && <div className={styles.empty}><Icon name="message" size={30}/><p>{ready ? 'اولین پیامت رو بنویس.' : 'در حال دریافت پیام‌ها…'}</p></div>}
    </div>
    {networkError && <p className={styles.error} role="status">ارتباط قطع شده. در حال اتصال دوباره…</p>}
    {sendError && <p className={styles.error} role="alert">{sendError}</p>}
    {replyTo && <div className={styles.replyDraft}><Icon name="reply" size={19}/><QuotePreview message={replyTo}/>
      <button type="button" aria-label="لغو پاسخ" disabled={sending} onClick={()=>{setReplyTo(null);input.current?.focus();}}><Icon name="close" size={16}/></button></div>}
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.pickerRoot} ref={pickerRoot}>
        <button ref={pickerButton} type="button" className={styles.expressionButton} aria-label="ایموجی و استیکر" aria-expanded={Boolean(picker)}
          disabled={!ready || sending} onClick={()=>setPicker(value=>value ? null : 'emoji')}><Icon name="smile" size={22}/></button>
        {picker && <ExpressionPicker tab={picker} onTab={setPicker} onEmoji={insertEmoji} onSticker={id=>void send(id)} disabled={sending}/>}
      </div>
      <textarea rows={1} aria-label="متن پیام" placeholder="پیامت رو بنویس…" dir="auto" maxLength={3000} ref={input}
        value={draft} readOnly={sending} onChange={e=>setDraft(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
      <button className={styles.send} type="submit" aria-label="ارسال پیام" disabled={!ready || sending || !draft.trim()}><Icon name="send" size={20}/></button>
    </form>
  </div>;
}
