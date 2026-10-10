'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { IconCalendar, IconClose, IconMenu } from './Icons';

const LINKS = [
  { href: '/#servicios', label: 'Servicios' },
  { href: '/#proceso', label: 'Cómo trabajamos' },
  { href: '/#proyectos', label: 'Proyectos' },
  { href: '/#planes', label: 'Planes' },
  { href: '/#faq', label: 'Preguntas' },
  { href: '/#contacto', label: 'Contacto' },
];

export default function Header({ brand, logoUrl }: { brand: string; logoUrl: string | null }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="site-header" data-scrolled={scrolled || open}>
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${brand} — inicio`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brand} />
          ) : (
            <>
              <span className="brand-mark" aria-hidden="true">
                {brand.trim().charAt(0).toUpperCase()}
              </span>
              <span>{brand}</span>
            </>
          )}
        </Link>

        <nav className="nav" aria-label="Principal">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <Link href="/reservar" className="btn btn-call btn-sm">
            <IconCalendar />
            <span className="hide-sm">Agendar una llamada</span>
          </Link>
          <button
            className="menu-toggle"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="mobile-menu" data-open={open}>
        <nav aria-label="Menú móvil">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
        <Link href="/empezar" className="btn btn-primary" onClick={() => setOpen(false)}>
          Crear mi página web
        </Link>
        <Link href="/reservar" className="btn btn-call" onClick={() => setOpen(false)}>
          <IconCalendar /> Agendar una llamada
        </Link>
      </div>
    </header>
  );
}
