import type { Metadata } from 'next';
import Link from 'next/link';
import ManageBooking from '@/components/ManageBooking';
import { findBookingByToken } from '@/lib/booking';
import { getBookingSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Gestionar mi cita', robots: { index: false, follow: false } };

export default async function CitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ accion?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const [booking, cfg] = await Promise.all([findBookingByToken(token), getBookingSettings()]);

  let body: React.ReactNode;
  if (!booking) {
    body = (
      <div className="card" style={{ maxWidth: 620 }}>
        <h1 style={{ fontSize: 28 }}>Enlace no válido</h1>
        <p className="muted">Este enlace no existe o ya no es válido (por ejemplo, si la cita se cambió y se envió un enlace nuevo).</p>
        <Link href="/reservar" className="btn btn-primary">
          Reservar una llamada
        </Link>
      </div>
    );
  } else if (booking.status !== 'confirmed') {
    body = (
      <div className="card" style={{ maxWidth: 620 }}>
        <h1 style={{ fontSize: 28 }}>{booking.status === 'cancelled' ? 'Esta cita está cancelada' : 'Esta llamada ya se realizó'}</h1>
        <Link href="/reservar" className="btn btn-primary">
          Reservar otra llamada
        </Link>
      </div>
    );
  } else if (new Date(booking.starts_at).getTime() < Date.now()) {
    body = (
      <div className="card" style={{ maxWidth: 620 }}>
        <h1 style={{ fontSize: 28 }}>Esta cita ya ha pasado</h1>
        <Link href="/reservar" className="btn btn-primary">
          Reservar otra llamada
        </Link>
      </div>
    );
  } else {
    body = (
      <ManageBooking
        token={token}
        startsAt={booking.starts_at}
        businessTz={booking.business_timezone}
        visitorTz={booking.visitor_timezone}
        durationMin={Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000)}
        meetingDetails={cfg.meeting_details}
        initialAction={sp.accion === 'cancelar' ? 'cancel' : sp.accion === 'cambiar' ? 'reschedule' : null}
        canReschedule={cfg.enabled && (booking.reschedule_count ?? 0) < 3}
      />
    );
  }
  return <div className="container page-pad">{body}</div>;
}
