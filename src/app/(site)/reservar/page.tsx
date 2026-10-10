import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import BookingWidget from '@/components/BookingWidget';
import { getBookingSettings, getSettings } from '@/lib/settings';
import { LEAD_COOKIE, verifyLead } from '@/lib/lead-cookie';
import { serviceClient } from '@/lib/supabase/server';
import { whatsappLink } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Agendar una llamada',
  description: 'Elige día y hora para una llamada sin compromiso sobre tu proyecto web.',
  alternates: { canonical: '/reservar' },
};

async function prefillFromLead(): Promise<{ name: string; email: string; phone: string } | null> {
  try {
    const store = await cookies();
    const requestId = await verifyLead(store.get(LEAD_COOKIE)?.value);
    if (!requestId) return null;
    const { data } = await serviceClient()
      .from('requests')
      .select('contacts(name, email, phone)')
      .eq('id', requestId)
      .maybeSingle();
    const c: any = data ? (Array.isArray(data.contacts) ? data.contacts[0] : data.contacts) : null;
    return c ? { name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '' } : null;
  } catch {
    return null;
  }
}

export default async function ReservarPage() {
  const [cfg, s, prefill] = await Promise.all([getBookingSettings(), getSettings(), prefillFromLead()]);
  const wa = whatsappLink(s.whatsapp, 'Hola, me gustaría hablar sobre una página web.');

  return (
    <div className="container page-pad">
      <div className="section-head" style={{ marginBottom: 32 }}>
        <span className="eyebrow">Agendar una llamada</span>
        <h1 style={{ fontSize: 'clamp(34px,5vw,56px)' }}>
          Hablemos <span className="serif accent">15 minutos</span>
        </h1>
        <p>Elige el día y la hora que mejor te vengan. Recibirás la confirmación por correo.</p>
      </div>
      {cfg.enabled ? (
        <BookingWidget
          mode="new"
          durationMin={cfg.duration_min}
          businessTz={cfg.timezone}
          meetingDetails={cfg.meeting_details}
          prefill={prefill ?? undefined}
          linkedToRequest={Boolean(prefill)}
        />
      ) : (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 24 }}>Las reservas online estarán disponibles muy pronto</h2>
          <p className="muted">Mientras tanto, escríbenos y acordamos un momento para hablar.</p>
          <div className="row">
            <Link href="/#contacto" className="btn btn-primary">
              Ir al formulario de contacto
            </Link>
            {s.contact_email ? (
              <a href={`mailto:${s.contact_email}`} className="btn">
                {s.contact_email}
              </a>
            ) : null}
            {wa ? (
              <a href={wa} className="btn" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
