'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import styles from './support.module.css';

const SupportPanel = dynamic(() => import('./support-panel'));

export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const widget = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: MouseEvent) {
      if (widget.current && !event.composedPath().includes(widget.current)) setOpen(false);
    }
    document.addEventListener('click', dismissOutside, true);
    return () => document.removeEventListener('click', dismissOutside, true);
  }, [open]);
  function close() { setOpen(false); button.current?.focus({preventScroll:true}); }

  return <aside ref={widget} className={styles.widget} dir="rtl" aria-label="پشتیبانی فروشگاه">
    {open && <SupportPanel onClose={close}/>}
    <button type="button" ref={button} className={styles.launcher} aria-label="پشتیبانی" title="پشتیبانی"
      aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? 'support-panel' : undefined}
      onClick={()=>open ? close() : setOpen(true)}><Icon name={open ? 'close' : 'headset'} size={25}/></button>
  </aside>;
}
