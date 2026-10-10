import { requireAdmin } from '@/lib/admin';
import { integrations, leadGateEnabled, siteUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function Integraciones() {
  const { supabase } = await requireAdmin();
  const { data: booking } = await supabase.from('booking_settings').select('enabled').eq('id', 1).maybeSingle();
  const { error: storageErr } = await supabase.storage.from('public-assets').list('', { limit: 1 });

  const items = [
    {
      name: 'Base de datos (Supabase)',
      ok: integrations.supabase(),
      detail: 'Guarda solicitudes, reservas, contrataciones y la configuración.',
      how: 'Variables NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).',
    },
    {
      name: 'Almacenamiento de imágenes',
      ok: !storageErr,
      detail: 'Para subir el logotipo y capturas de proyectos.',
      how: 'Ejecuta supabase/migrations/0002_storage.sql en el SQL Editor de Supabase.',
    },
    {
      name: 'Correo (Resend)',
      ok: integrations.email(),
      detail: 'Confirmaciones de solicitud y de reserva, cambios y cancelaciones de citas, recibos de contratación.',
      how: 'Crea una cuenta en resend.com, verifica tu dominio y añade RESEND_API_KEY y EMAIL_FROM. Sin esto no se envía ningún correo (y el panel lo indica en cada reserva).',
    },
    {
      name: 'Avisos al administrador',
      ok: integrations.adminEmail(),
      detail: 'Te avisa de nuevas solicitudes, reservas y pagos.',
      how: 'Además del correo, añade ADMIN_NOTIFY_EMAIL con tu dirección.',
    },
    {
      name: 'Pagos (Stripe)',
      ok: integrations.stripe(),
      detail: integrations.stripe()
        ? integrations.stripeTestMode()
          ? 'Configurado en MODO DE PRUEBAS: no se cobra dinero real.'
          : 'Configurado en modo real.'
        : 'Sin Stripe, la contratación se registra como «pago online no activo» y no se cobra nada.',
      how: `Añade STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. En Stripe → Developers → Webhooks crea un endpoint a ${siteUrl()}/api/stripe/webhook con los eventos checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired y charge.refunded.`,
    },
    {
      name: 'Reservas de llamadas',
      ok: Boolean(booking?.enabled),
      detail: 'Sistema propio con disponibilidad, bloqueos y protección contra reservas dobles.',
      how: 'Activa las reservas y revisa tu horario en Disponibilidad.',
    },
    {
      name: 'Firma de la cookie del formulario',
      ok: integrations.leadSecret(),
      detail: 'Recuerda quién ya completó el formulario inicial.',
      how: 'Añade LEAD_COOKIE_SECRET con una cadena aleatoria de al menos 32 caracteres (openssl rand -hex 32).',
    },
    {
      name: 'URL pública',
      ok: integrations.siteUrl(),
      detail: `Se usa en correos, Stripe y SEO. Ahora: ${siteUrl()}`,
      how: 'Añade NEXT_PUBLIC_SITE_URL con tu dominio (sin barra final).',
    },
    {
      name: 'Formulario obligatorio al entrar',
      ok: leadGateEnabled(),
      detail: leadGateEnabled() ? 'Activo: los visitantes nuevos ven primero el formulario.' : 'Desactivado (LEAD_GATE=off).',
      how: 'Controlado por la variable LEAD_GATE (on/off).',
    },
  ];

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Integraciones</h1>
          <p className="muted mb-0">Las claves se configuran como variables de entorno en Vercel por seguridad; aquí ves su estado (nunca su valor).</p>
        </div>
      </div>
      <div className="stack">
        {items.map((i) => (
          <section key={i.name} className="admin-card" style={{ marginBottom: 0 }}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{i.name}</h2>
              <span className={`badge ${i.ok ? 'badge-ok' : 'badge-warn'}`}>{i.ok ? 'Operativo' : 'Pendiente'}</span>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              {i.detail}
            </p>
            {!i.ok ? <p className="small" style={{ margin: '8px 0 0' }}>{i.how}</p> : null}
          </section>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 16 }}>
        Tras cambiar variables en Vercel, vuelve a desplegar (Deployments → Redeploy) para que se apliquen.
      </p>
    </>
  );
}
