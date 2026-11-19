'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function Dialog({ title, children, onClose, drawer = false, drawerSide = 'left' }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean; drawerSide?: 'left' | 'right' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`dialog ${drawer ? 'drawer' : ''}${drawer && drawerSide === 'right' ? ' drawer-right' : ''}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); } }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="بستن" onClick={onClose}><Icon name="close"/></button></div>
    <div className="dialog-content">{children}</div>
  </dialog>;
}
