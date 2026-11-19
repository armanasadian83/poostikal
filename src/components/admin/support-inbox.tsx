'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAdmin } from './admin-provider';
import { AdminModal } from './admin-ui';
import { api } from '@/lib/api';
import { Icon } from '../icons';
import { Conversation } from '../support/conversation';
import styles from '../support/support.module.css';

type Thread = {id: string; phone: string; name: string | null; pinned: boolean; sender: 'customer'|'staff'; preview: string; updatedAt: string};
const stamp = new Intl.DateTimeFormat('fa-IR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

function Avatar({thread}: {thread: Thread}) {
  return <span className={styles.avatar} aria-hidden="true">{thread.name?.trim().slice(0,1) || <Icon name="user" size={19}/>}</span>;
}

type MenuTarget = { id: string; x: number; y: number; row: HTMLButtonElement };
type TouchHold = { target: MenuTarget; timer: number; opened: boolean };

export function SupportInbox() {
  const { notify } = useAdmin();
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const touchHold = useRef<TouchHold | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{threads:Thread[]; hasMore:boolean; search:string; page:number} | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Thread | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const selectedId = selected?.id;

  useLayoutEffect(() => {
    const element = menuElement.current;
    if (!menu || !element) return;
    const {clientWidth, clientHeight} = document.documentElement;
    const {width, height} = element.getBoundingClientRect();
    const left = menu.x - width >= 8 ? menu.x - width : menu.x;
    const top = menu.y + height <= clientHeight - 8 ? menu.y : menu.y - height;
    element.style.left = Math.max(8, Math.min(left, clientWidth - width - 8)) + 'px';
    element.style.top = Math.max(8, Math.min(top, clientHeight - height - 8)) + 'px';
    element.querySelector('button')?.focus({preventScroll:true});

    const close = () => setMenu(null);
    const dismissOutside = (event: PointerEvent) => {
      if (!event.composedPath().includes(element)) close();
    };
    const list = menu.row.parentElement;
    document.addEventListener('pointerdown', dismissOutside, true);
    list?.addEventListener('scroll', close);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      list?.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const cancelHold = useCallback(() => {
    if (touchHold.current) window.clearTimeout(touchHold.current.timer);
    touchHold.current = null;
  }, []);

  useEffect(() => cancelHold, [cancelHold]);

  function openHeldMenu(hold: TouchHold) {
    if (hold.opened || !hold.target.row.isConnected) return;
    window.clearTimeout(hold.timer);
    hold.opened = true;
    setMenu(hold.target);
  }

  function startHold(event: TouchEvent<HTMLButtonElement>, id: string) {
    cancelHold();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = { id, row: event.currentTarget, x: touch.clientX, y: touch.clientY };
    const timer = window.setTimeout(() => {
      const hold = touchHold.current;
      if (hold && target.row.contains(document.elementFromPoint(target.x, target.y))) openHeldMenu(hold);
    }, 500);
    touchHold.current = {target, timer, opened:false};
  }

  function moveHold(event: TouchEvent<HTMLButtonElement>) {
    const hold = touchHold.current;
    if (!hold || hold.opened) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || Math.hypot(touch.clientX - hold.target.x, touch.clientY - hold.target.y) > 10) cancelHold();
  }

  function finishHold(event: TouchEvent<HTMLButtonElement>) {
    // A hold consumes the release so it cannot tap the row or the menu underneath.
    if (touchHold.current?.opened && event.cancelable) event.preventDefault();
    cancelHold();
  }

  function closeMenu() {
    menu?.row.focus({preventScroll:true});
    setMenu(null);
  }

  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      closeMenu();
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = (index + 1) % items.length; break;
      case 'ArrowUp': next = (index + items.length - 1) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  function openThread(thread: Thread) {
    setSelected(thread);
    setActionError('');
  }

  function confirmDelete(thread: Thread) {
    setActionError('');
    setDeleteTarget(thread);
  }

  const closeMissingChat = useCallback(() => {
    setSelected(open => open?.id === selectedId ? null : open);
    setRefresh(v => v + 1);
  }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function read() {
      if (busy || document.hidden || controller.signal.aborted) return;
      busy = true;
      try {
        const q=search.trim().replace(/[۰-۹٠-٩]/g, d=>String(d.charCodeAt(0)-(d>='۰'?0x06f0:0x0660)));
        const query = new URLSearchParams({q, offset:String(page * 40)});
        const data=await api<{threads:Thread[];hasMore:boolean}>('/admin/support?'+query,{signal:controller.signal});
        if (!controller.signal.aborted) {
          if (page > 0 && !data.threads.length) {
            setPage(page - 1);
            return;
          }
          setResult({...data, search, page});
          setMenu(open => open && data.threads.some(thread => thread.id === open.id) ? open : null);
          setSelected(open => data.threads.find(thread => thread.id === open?.id) ?? open);
          setError('');
        }
      } catch(e) { if(!controller.signal.aborted) setError(e instanceof Error ? e.message : 'گفت‌وگوها دریافت نشد.'); }
      finally { busy=false; }
    }
    const first=window.setTimeout(read,search ? 200 : 0);
    const timer=window.setInterval(read,4500);
    document.addEventListener('visibilitychange',read);
    return ()=>{clearTimeout(first);clearInterval(timer);controller.abort();document.removeEventListener('visibilitychange',read);};
  },[search,page,refresh]);

  async function togglePin(thread: Thread) {
    if (saving) return;
    setSaving(true);
    setActionError('');
    try {
      const { pinned } = await api<{pinned: boolean}>('/admin/support/'+thread.id+'/pin', {
        method: 'PATCH', body: JSON.stringify({pinned: !thread.pinned}),
      });
      setResult(list => list && {...list, threads:list.threads.map(item => item.id === thread.id ? {...item, pinned} : item)});
      setSelected(open => open?.id === thread.id ? {...open, pinned} : open);
      setRefresh(v => v + 1);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تغییر سنجاق گفت‌وگو انجام نشد.');
    } finally { setSaving(false); }
  }

  async function removeThread(thread: Thread) {
    if (saving) return;
    setSaving(true);
    setActionError('');
    try {
      await api('/admin/support/'+thread.id, {method:'DELETE'});
      setResult(list => list && {...list, threads:list.threads.filter(item => item.id !== thread.id)});
      setSelected(open => open?.id === thread.id ? null : open);
      setDeleteTarget(null);
      setRefresh(v => v + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'حذف گفت‌وگو انجام نشد.');
    } finally { setSaving(false); }
  }

  const current=result?.page===page && result?.search===search ? result : null;
  const menuThread = menu && current?.threads.find(thread => thread.id === menu.id);
  return <div dir="rtl" className={styles.adminSupport}>
    <h1 className={styles.srOnly}>پشتیبانی</h1>
    <div className={styles.inbox} data-selected={Boolean(selected)}>
      <section className={styles.threadList} aria-label="فهرست گفت‌وگوها">
        <header className={styles.listHeader}><h2>گفت‌وگوها</h2>
          <label className={styles.search}><Icon name="search" size={17}/>
            <input type="search" aria-label="جست‌وجوی گفت‌وگو" placeholder="نام یا شماره موبایل" value={search}
              onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
        </header>
        {error && <p className={styles.error} role="status">{error}</p>}
        <div className={styles.contacts}>{current?.threads.map(thread=>
          <button key={thread.id} type="button" className={styles.thread} aria-pressed={selected?.id===thread.id}
            aria-haspopup="menu" aria-expanded={menuThread?.id===thread.id} onClick={()=>openThread(thread)}
            onTouchStart={event=>startHold(event,thread.id)} onTouchMove={moveHold}
            onTouchEnd={finishHold} onTouchCancel={cancelHold}
            onContextMenu={event=>{
              event.preventDefault();
              const hold = touchHold.current;
              if (hold?.target.row === event.currentTarget) openHeldMenu(hold);
              else setMenu({id:thread.id, x:event.clientX, y:event.clientY, row:event.currentTarget});
            }}
            onKeyDown={event=>{
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
              event.preventDefault();
              const row = event.currentTarget;
              const bounds = row.getBoundingClientRect();
              setMenu({id:thread.id, x:bounds.right - 8, y:bounds.bottom, row});
            }}>
            <Avatar thread={thread}/><span className={styles.contactText}><strong><bdi>{thread.name || thread.phone}</bdi></strong>
              <small>{thread.sender==='staff' ? 'پشتیبانی: ' : ''}{thread.preview}</small></span>
            <span className={styles.meta}><time dateTime={thread.updatedAt}>{stamp.format(new Date(thread.updatedAt))}</time>
              <span className={styles.threadMarkers}>
                {thread.pinned && <span title="سنجاق‌شده"><span className={styles.srOnly}>سنجاق‌شده</span><Icon name="pushpin" size={14}/></span>}
                {thread.sender==='customer' && <i title="در انتظار پاسخ" aria-label="در انتظار پاسخ"/>}
              </span></span>
          </button>)}
          {!error && !current?.threads.length && <p className={styles.listHint}>{!current ? 'در حال دریافت…' : search ? 'گفت‌وگویی پیدا نشد.' : 'هنوز پیامی نرسیده.'}</p>}
        </div>
        {(page>0 || current?.hasMore) && <div className={styles.paging}><button disabled={!page} onClick={()=>setPage(p=>p-1)}>قبلی</button>
          <button disabled={!current?.hasMore} onClick={()=>setPage(p=>p+1)}>بعدی</button></div>}
      </section>
      <section className={styles.activeThread} aria-label="گفت‌وگوی انتخاب‌شده">{selected ? <>
        <header className={styles.threadHeader}>
          <button type="button" className={styles.back} onClick={()=>setSelected(null)} aria-label="بازگشت به گفت‌وگوها"><Icon name="arrow-right" size={20}/></button>
          <Avatar thread={selected}/><div><h2><bdi>{selected.name || selected.phone}</bdi></h2>
            {selected.name && <small><bdi dir="ltr">{selected.phone}</bdi></small>}</div>
          <div className={styles.threadActions}>
            <button type="button" className="admin-icon-button" aria-label={selected.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن گفت‌وگو'}
              title={selected.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن گفت‌وگو'} aria-pressed={selected.pinned}
              disabled={saving} onClick={()=>void togglePin(selected)}><Icon name="pushpin" size={19}/></button>
            <button type="button" className="admin-icon-button" aria-label="حذف گفت‌وگو" title="حذف گفت‌وگو"
              disabled={saving} onClick={()=>confirmDelete(selected)}><Icon name="trash" size={19}/></button>
          </div>
        </header>
        <Conversation key={selected.id} viewer="staff" path={'/admin/support/'+selected.id+'/messages'} onLost={closeMissingChat} onSent={()=>setRefresh(v=>v+1)}/>
      </> : <div className={styles.idle}><span className={styles.idleMark}><Icon name="headset" size={36}/></span>
        <h2>برای پاسخ، یک گفت‌وگو رو انتخاب کن.</h2></div>}</section>
    </div>
    {menuThread && createPortal(
      <div ref={menuElement} dir="rtl" role="menu" aria-label={'گزینه‌های گفت‌وگو با '+(menuThread.name || menuThread.phone)}
        className={styles.threadMenu} onKeyDown={navigateMenu} onContextMenu={event=>event.preventDefault()}>
        <button type="button" role="menuitem" tabIndex={-1} onClick={()=>{closeMenu();openThread(menuThread);}}>
          <Icon name="message" size={17}/>باز کردن
        </button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={saving} onClick={()=>{closeMenu();void togglePin(menuThread);}}>
          <Icon name="pushpin" size={17}/>{menuThread.pinned ? 'برداشتن پین' : 'پین کردن'}
        </button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={saving} className={styles.menuDelete}
          onClick={()=>{closeMenu();confirmDelete(menuThread);}}>
          <Icon name="trash" size={17}/>حذف
        </button>
      </div>, document.body)}
    {deleteTarget && <AdminModal title="حذف گفت‌وگو" onClose={()=>{if (!saving) {setDeleteTarget(null);setActionError('');}}}>
      <p>گفت‌وگو با <strong><bdi>{deleteTarget.name || deleteTarget.phone}</bdi></strong> و همهٔ پیام‌هاش برای مشتری و پشتیبانی برای همیشه حذف می‌شن.</p>
      {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
      <div className="admin-form-actions">
        <button type="button" className="admin-button admin-button-danger" disabled={saving} onClick={()=>void removeThread(deleteTarget)}>حذف گفت‌وگو</button>
        <button type="button" className="admin-button" data-admin-autofocus disabled={saving} onClick={()=>{setDeleteTarget(null);setActionError('');}}>انصراف</button>
      </div>
    </AdminModal>}
  </div>;
}
