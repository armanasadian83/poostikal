'use client';

import { useEffect, useId, useRef, useState } from 'react';

type ConnectionGeometry = { width: number; height: number; paths: string[] };

const emptyGeometry: ConnectionGeometry = { width: 1, height: 1, paths: [] };
const point = (value: number) => Math.round(value * 10) / 10;

/** Connect the chronological card endpoints, including partly filled rows. */
export function StoryConnections() {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = `story-connection-${useId().replaceAll(':', '')}`;
  const [geometry, setGeometry] = useState<ConnectionGeometry>(emptyGeometry);

  useEffect(() => {
    const section = svgRef.current?.closest<HTMLElement>('.treatment-story');
    const content = section?.querySelector<HTMLElement>('.treatment-story-content');
    if (!section || !content) return;

    const desktop = window.matchMedia('(min-width: 761px)');
    let disposed = false;
    let frame = 0;
    let nearViewport = false;

    const measure = () => {
      frame = 0;
      if (disposed) return;
      if (!desktop.matches) {
        setGeometry(previous => previous.paths.length ? emptyGeometry : previous);
        return;
      }
      if (!nearViewport) return;

      const sectionBounds = section.getBoundingClientRect();
      if (!sectionBounds.width || !sectionBounds.height) return;
      const rows = Array.from(content.querySelectorAll<HTMLElement>('.treatment-story-row'));
      const paths: string[] = [];

      for (let index = 0; index < rows.length - 1; index += 1) {
        const sourceCards = rows[index].querySelectorAll<HTMLElement>('.treatment-story-card');
        const source = sourceCards[sourceCards.length - 1];
        const destination = rows[index + 1].querySelector<HTMLElement>('.treatment-story-card');
        if (!source || !destination) continue;

        const start = source.getBoundingClientRect();
        const end = destination.getBoundingClientRect();
        const leftTurn = index % 2 === 0;
        const startX = point((leftTurn ? start.left : start.right) - sectionBounds.left);
        const endX = point((leftTurn ? end.left : end.right) - sectionBounds.left);
        const startY = point(start.top + start.height / 2 - sectionBounds.top);
        const endY = point(end.top + end.height / 2 - sectionBounds.top);
        const outsideX = point(leftTurn ? Math.min(startX, endX) - 18 : Math.max(startX, endX) + 18);
        const direction = leftTurn ? 1 : -1;
        const radius = Math.min(14, Math.max(0, (endY - startY) / 2));
        const cornerX = point(outsideX + direction * radius);

        paths.push(`M ${startX} ${startY} H ${cornerX} Q ${outsideX} ${startY} ${outsideX} ${point(startY + radius)} V ${point(endY - radius)} Q ${outsideX} ${endY} ${cornerX} ${endY} H ${endX}`);
      }

      const next = { width: point(sectionBounds.width), height: point(sectionBounds.height), paths };
      setGeometry(previous => previous.width === next.width && previous.height === next.height
        && previous.paths.length === paths.length && previous.paths.every((path, index) => path === paths[index])
        ? previous : next);
    };

    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(section);
    resizeObserver.observe(content);
    content.querySelectorAll('.treatment-story-card').forEach(card => resizeObserver.observe(card));

    const intersectionObserver = new IntersectionObserver(entries => {
      nearViewport = entries.some(entry => entry.isIntersecting);
      if (nearViewport) schedule();
    }, { rootMargin: '240px' });
    intersectionObserver.observe(section);
    desktop.addEventListener('change', schedule);
    document.fonts.ready.then(schedule);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      desktop.removeEventListener('change', schedule);
    };
  }, []);

  return (
    <svg ref={svgRef} className="story-connections" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" data-path-count={geometry.paths.length}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--tone-1243)" stopOpacity=".7"/>
          <stop offset="1" stopColor="var(--tone-1244)" stopOpacity=".6"/>
        </linearGradient>
      </defs>
      {geometry.paths.map((path, index) => <path key={index} d={path} fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}
    </svg>
  );
}
