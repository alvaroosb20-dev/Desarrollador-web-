'use client';

import Link from 'next/link';
import { useState } from 'react';
import BookingWidget from './BookingWidget';
import { postJson } from '@/lib/client';

type Props = {
  token: string;
  startsAt: string;
  businessTz: string;
  visitorTz: string | null;
  durationMin: number;
  meetingDetails: string;
  initialAction: 'cancel' | 'reschedule' | null;
  canReschedule: boolean;
};

export default function ManageBooking(p: Props) {
  const tz = p.visitorTz || p.businessTz;
  const [view, setView] = useState<'info' | 'cancel' | 'reschedule' | 'cancelled'>(
    p.initialAction === 'cancel' ? 'cancel' : p.initialAction === 'reschedule' ? 'reschedule' : 'info',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const when = new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(p.startsAt));

  const cancel = async () => {
    setBusy(true);
    setError('');
    const res = await postJson<{ emailStatus: string }>('/api/booking/manage', { token: p.token, action: 'cancel', reason });
    setBusy(false);
    if (res.ok) {
      setEmailStatus(res.emailStatus);
      setView('cancelled');
    } else setError(res.error);
  };

  if (view === 'reschedule') {
    return (
      <>
        <button className="btn btn-ghost btn-sm" onClick={() => setView('info')} style={{ marginBottom: 16 }}>
          ← Volver
        </button>
        <BookingWidget mode="reschedule" token={p.token} durationMin={p.durationMin} businessTz={p.businessTz} meetingDetails={p.meetingDetails} />
      </>
    );
  }

  if (view === 'cancelled') {
    return (
      <div className="card" role="status" style={{ maxWidth: 620 }}>
        <h2 style={{ fontSize: 26 }}>Cita cancelada</h2>
        <p className="muted">
          Hemos cancelado la llamada del {when}.{' '}
          {emailStatus === 'sent' ? 'Te hemos enviado un correo de confirmación.' : 'No se ha podido enviar el correo de confirmación, pero la cancelación está registrada.'}
        </p>
        <Link href="/reservar" className="btn btn-primary">
          Reservar otra hora
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <span className="eyebrow">Tu cita</span>
      <h2 style={{ fontSize: 28, textTransform: 'capitalize' }}>{when}</h2>
      <p className="muted small">
        Zona horaria: {tz.replace(/_/g, ' ')} · {p.durationMin} minutos
      </p>
      <p className="muted">{p.meetingDetails}</p>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {view === 'cancel' ? (
        <div>
          <div className="field">
            <label htmlFor="m-reason">Motivo (opcional)</label>
            <textarea id="m-reason" className="textarea" style={{ minHeight: 90 }} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={cancel} disabled={busy} aria-busy={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null} Sí, cancelar la cita
            </button>
            <button className="btn btn-ghost" onClick={() => setView('info')} disabled={busy}>
              No, mantenerla
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          {p.canReschedule ? (
            <button className="btn btn-primary" onClick={() => setView('reschedule')}>
              Cambiar la hora
            </button>
          ) : null}
          <button className="btn" onClick={() => setView('cancel')}>
            Cancelar la cita
          </button>
        </div>
      )}
    </div>
  );
}
