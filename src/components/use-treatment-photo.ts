import { useLayoutEffect, type RefObject } from 'react';

// Fixed storefront controls switch glass palettes as the story photograph passes underneath.
export function useTreatmentPhoto(ref: RefObject<HTMLElement | null>, enabled: boolean, maskRef?: RefObject<SVGFEFloodElement | null>) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const control = ref.current;
    const photo = document.querySelector<HTMLElement>('.treatment-story-backdrop');
    if (!control || !photo) return;

    let frame = 0;
    const mask = maskRef?.current;
    const measure = () => {
      frame = 0;
      const controlBounds = control.getBoundingClientRect();
      const photoBounds = photo.getBoundingClientRect();
      const left = Math.max(controlBounds.left, photoBounds.left);
      const top = Math.max(controlBounds.top, photoBounds.top);
      const width = Math.min(controlBounds.right, photoBounds.right) - left;
      const height = Math.min(controlBounds.bottom, photoBounds.bottom) - top;
      const overlaps = width > 0 && height > 0;
      if (mask && overlaps) {
        // The filter uses the panel's border box as its coordinate system.
        const bounds = {
          x: (left - controlBounds.left) / controlBounds.width,
          y: (top - controlBounds.top) / controlBounds.height,
          width: width / controlBounds.width,
          height: height / controlBounds.height,
        };
        for (const [axis, length] of Object.entries(bounds)) {
          const value = String(length);
          if (mask.getAttribute(axis) !== value) mask.setAttribute(axis, value);
        }
      }
      if (control.dataset.overPhoto !== String(overlaps)) control.dataset.overPhoto = String(overlaps);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(control);
    observer.observe(photo);
    const main = photo.closest('main');
    if (main) observer.observe(main);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', schedule);
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      delete control.dataset.overPhoto;
    };
  }, [ref, enabled, maskRef]);
}
