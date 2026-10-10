import Link from 'next/link';
import AdminNav from '@/components/admin/AdminNav';
import { requireAdmin } from '@/lib/admin';
import { getSettings } from '@/lib/settings';
import { logout } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, s] = await Promise.all([requireAdmin(), getSettings()]);
  return (
    <div className="admin">
      <aside className="admin-side" aria-label="Menú del panel">
        <Link href="/admin" className="brand">
          <span className="brand-mark" aria-hidden="true">
            {s.business_name.trim().charAt(0).toUpperCase()}
          </span>
          <span>Panel</span>
        </Link>
        <nav style={{ display: 'grid', gap: 2 }}>
          <AdminNav variant="side" />
        </nav>
        <div className="spacer" />
        <a href="/" className="nav-item" target="_blank" rel="noopener">
          Ver la web ↗
        </a>
        <div className="tiny muted" style={{ padding: '8px 12px', wordBreak: 'break-all' }}>
          {user.email}
        </div>
        <form action={logout}>
          <button className="btn btn-ghost btn-sm btn-block">Cerrar sesión</button>
        </form>
      </aside>
      <main id="contenido" className="admin-main">
        <nav className="admin-mobile-nav" aria-label="Menú del panel">
          <AdminNav variant="mobile" />
          <form action={logout}>
            <button className="btn btn-ghost btn-sm">Salir</button>
          </form>
        </nav>
        {children}
      </main>
    </div>
  );
}
