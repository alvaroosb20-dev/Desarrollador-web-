import Link from 'next/link';
import type { SiteSettings } from '@/lib/types';
import { whatsappLink } from '@/lib/format';

export default function Footer({ s }: { s: SiteSettings }) {
  const wa = whatsappLink(s.whatsapp);
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ marginBottom: 14 }}>
              <span className="brand-mark" aria-hidden="true">
                {s.business_name.trim().charAt(0).toUpperCase()}
              </span>
              <span style={{ color: 'var(--text)' }}>{s.business_name}</span>
            </div>
            <p style={{ maxWidth: 380 }}>
              {s.footer_text || 'Diseño y desarrollo de páginas web modernas para negocios que quieren crecer en Internet.'}
            </p>
          </div>
          <div>
            <h4>Web</h4>
            <ul>
              <li><a href="/#servicios">Servicios</a></li>
              <li><a href="/#planes">Planes y precios</a></li>
              <li><a href="/#proyectos">Proyectos de demostración</a></li>
              <li><Link href="/reservar">Agendar una llamada</Link></li>
              <li><a href="/#contacto">Contacto</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link href="/legal/aviso-legal">Aviso legal</Link></li>
              <li><Link href="/legal/privacidad">Política de privacidad</Link></li>
              <li><Link href="/legal/cookies">Política de cookies</Link></li>
              <li><Link href="/legal/condiciones">Condiciones de contratación</Link></li>
            </ul>
          </div>
        </div>
        <div className="row between small">
          <span>
            © {new Date().getFullYear()} {s.business_name}
          </span>
          <span className="row" style={{ gap: 16 }}>
            {s.contact_email ? <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a> : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
          </span>
        </div>
      </div>
    </footer>
  );
}
