'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const HEADER_OFFSET = 120;
const BOTTOM_PADDING = 16;
const LG_MEDIA = '(min-width: 1024px)';

interface StickySidebarProps {
  children: ReactNode;
  className?: string;
}

export function StickySidebar({ children, className }: StickySidebarProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mql = window.matchMedia(LG_MEDIA);
    let translateY = 0;
    let lastScrollY = window.scrollY;
    let frame = 0;

    const reset = () => {
      el.style.position = '';
      el.style.top = '';
      el.style.transform = '';
      el.style.willChange = '';
      translateY = 0;
    };

    const apply = () => {
      frame = 0;
      if (!mql.matches) {
        reset();
        return;
      }

      const sidebarH = el.offsetHeight;
      const viewportH = window.innerHeight;
      const overflow = sidebarH + HEADER_OFFSET + BOTTOM_PADDING - viewportH;

      el.style.position = 'sticky';
      el.style.top = `${HEADER_OFFSET}px`;

      const scrollY = window.scrollY;
      const dy = scrollY - lastScrollY;
      lastScrollY = scrollY;

      // The untransformed top of the sidebar: rect.top already includes our
      // own transform, so subtract it back out. The sidebar is only "stuck"
      // (pinned at HEADER_OFFSET) once that natural top reaches the offset.
      // Before then it sits in normal flow below the hero, so applying any
      // upward transform would drag it up over the hero — hence the overlap.
      const naturalTop = el.getBoundingClientRect().top - translateY;
      const stuck = naturalTop <= HEADER_OFFSET + 0.5;

      if (overflow <= 0 || !stuck) {
        if (translateY !== 0) {
          translateY = 0;
          el.style.transform = '';
        }
        el.style.willChange = '';
        return;
      }

      el.style.willChange = 'transform';
      translateY = Math.max(-overflow, Math.min(0, translateY - dy));
      el.style.transform = `translateY(${translateY}px)`;
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    const onResize = () => {
      translateY = 0;
      lastScrollY = window.scrollY;
      schedule();
    };

    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    mql.addEventListener('change', onResize);

    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      mql.removeEventListener('change', onResize);
      ro.disconnect();
    };
  }, []);

  return (
    <aside ref={ref} className={className}>
      {children}
    </aside>
  );
}
