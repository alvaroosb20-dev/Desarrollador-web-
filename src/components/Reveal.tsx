'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Activa las animaciones de entrada (.reveal) cuando los elementos aparecen
 * en pantalla. Un único observador para toda la página: coste mínimo.
 * Sin JavaScript, el contenido se ve igual (ver <noscript> en el layout).
 */
export default function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
