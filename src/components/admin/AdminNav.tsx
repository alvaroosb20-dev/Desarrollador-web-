'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const ADMIN_LINKS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/solicitudes', label: 'Solicitudes' },
  { href: '/admin/llamadas', label: 'Llamadas agendadas' },
  { href: '/admin/disponibilidad', label: 'Disponibilidad' },
  { href: '/admin/contrataciones', label: 'Contrataciones' },
  { href: '/admin/paquetes', label: 'Paquetes y precios' },
  { href: '/admin/contenido', label: 'Preguntas y proyectos' },
  { href: '/admin/ajustes', label: 'Ajustes generales' },
  { href: '/admin/integraciones', label: 'Integraciones' },
];

export default function AdminNav({ variant }: { variant: 'side' | 'mobile' }) {
  const path = usePathname();
  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`));
  return (
    <>
      {ADMIN_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={variant === 'side' ? 'nav-item' : undefined} aria-current={isActive(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
