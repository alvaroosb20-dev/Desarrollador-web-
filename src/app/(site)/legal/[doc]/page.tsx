import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSettings, getMaintenancePlans } from '@/lib/settings';
import { siteUrl } from '@/lib/env';
import type { SiteSettings } from '@/lib/types';
import { NOT_INCLUDED } from '@/components/Pricing';

export const revalidate = 300;

const DOCS = {
  'aviso-legal': 'Aviso legal',
  privacidad: 'Política de privacidad',
  cookies: 'Política de cookies',
  condiciones: 'Condiciones de contratación',
} as const;
type Doc = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const title = DOCS[doc as Doc];
  return title ? { title, alternates: { canonical: `/legal/${doc}` } } : {};
}

/** Muestra el dato o un aviso visible de que falta completarlo en el panel. */
function V({ v, label }: { v: string | null | undefined; label: string }) {
  return v ? <>{v}</> : <span className="pending">[{label}: pendiente de completar en el panel]</span>;
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!(doc in DOCS)) notFound();
  const s = await getSettings();
  const plans = doc === 'condiciones' ? await getMaintenancePlans() : [];
  const missing = !s.legal_owner_name || !s.legal_tax_id || !s.legal_address || !(s.legal_email || s.contact_email);

  return (
    <div className="container page-pad">
      <article className="prose">
        <h1>{DOCS[doc as Doc]}</h1>
        {missing ? (
          <div className="alert alert-warn">
            Faltan datos del titular. Este texto es una plantilla orientativa y debe revisarse con un profesional antes de
            publicar la web.
          </div>
        ) : null}
        {doc === 'aviso-legal' ? <AvisoLegal s={s} /> : null}
        {doc === 'privacidad' ? <Privacidad s={s} /> : null}
        {doc === 'cookies' ? <Cookies s={s} /> : null}
        {doc === 'condiciones' ? <Condiciones s={s} plans={plans} /> : null}
        <p className="small" style={{ marginTop: 48 }}>
          Versión de las condiciones: {s.terms_version}
        </p>
      </article>
    </div>
  );
}

function Titular({ s }: { s: SiteSettings }) {
  return (
    <ul>
      <li>
        Titular: <V v={s.legal_owner_name} label="Nombre o razón social" />
      </li>
      <li>
        NIF/CIF: <V v={s.legal_tax_id} label="NIF o CIF" />
      </li>
      <li>
        Domicilio: <V v={s.legal_address} label="Domicilio" />
      </li>
      <li>
        Correo electrónico: <V v={s.legal_email || s.contact_email} label="Correo de contacto" />
      </li>
      {s.legal_registry ? <li>Datos registrales: {s.legal_registry}</li> : null}
    </ul>
  );
}

function AvisoLegal({ s }: { s: SiteSettings }) {
  return (
    <>
      <p>
        En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE),
        se informa de los datos del titular de este sitio web ({siteUrl()}), que opera con el nombre comercial{' '}
        <strong>{s.business_name}</strong>:
      </p>
      <Titular s={s} />
      <h2>Objeto</h2>
      <p>
        Este sitio web ofrece información sobre servicios de diseño y desarrollo de páginas web, permite solicitar
        información, agendar llamadas y contratar los planes publicados.
      </p>
      <h2>Condiciones de uso</h2>
      <p>
        El acceso a la web implica la aceptación de este aviso legal. El usuario se compromete a hacer un uso adecuado de
        los contenidos y a no emplearlos para actividades ilícitas o que puedan dañar el sitio o a terceros.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        Los textos, diseños, logotipos y código de esta web pertenecen a su titular o se usan con autorización. Los
        proyectos mostrados en la sección de demostraciones son diseños de ejemplo y no corresponden a clientes reales.
      </p>
      <h2>Responsabilidad</h2>
      <p>
        El titular no se responsabiliza de los daños derivados de interrupciones del servicio, errores técnicos o del uso
        indebido de la web por parte de terceros, en la medida permitida por la ley.
      </p>
      <h2>Legislación aplicable</h2>
      <p>Este aviso legal se rige por la legislación española.</p>
    </>
  );
}

function Privacidad({ s }: { s: SiteSettings }) {
  return (
    <>
      <h2>Responsable del tratamiento</h2>
      <Titular s={s} />
      <h2>Qué datos tratamos y para qué</h2>
      <table>
        <thead>
          <tr>
            <th>Origen</th>
            <th>Datos</th>
            <th>Finalidad</th>
            <th>Base jurídica</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Formulario inicial y de contacto</td>
            <td>Nombre, correo, teléfono (opcional), datos del proyecto</td>
            <td>Responder a tu solicitud y preparar un presupuesto</td>
            <td>Medidas precontractuales a petición del interesado (art. 6.1.b RGPD)</td>
          </tr>
          <tr>
            <td>Reserva de llamadas</td>
            <td>Nombre, correo, teléfono (opcional), descripción del proyecto, fecha elegida</td>
            <td>Gestionar la llamada y enviarte la confirmación</td>
            <td>Medidas precontractuales (art. 6.1.b RGPD)</td>
          </tr>
          <tr>
            <td>Contratación</td>
            <td>Datos de contacto, plan elegido, requisitos, estado del pago</td>
            <td>Ejecutar el contrato y cumplir obligaciones fiscales</td>
            <td>Ejecución del contrato y obligación legal (art. 6.1.b y 6.1.c RGPD)</td>
          </tr>
          <tr>
            <td>Comunicaciones comerciales</td>
            <td>Nombre y correo</td>
            <td>Enviarte novedades y ofertas, solo si lo has marcado</td>
            <td>Consentimiento (art. 6.1.a RGPD), revocable en cualquier momento</td>
          </tr>
        </tbody>
      </table>
      <p>
        Los datos de pago con tarjeta los gestiona directamente Stripe; nunca llegan a nuestros servidores. Para evitar el
        spam guardamos una huella cifrada de la dirección IP, no la IP en claro.
      </p>
      <h2>Cuánto tiempo los conservamos</h2>
      <ul>
        <li>Solicitudes que no terminan en contratación: hasta 12 meses desde el último contacto, salvo que pidas antes su supresión.</li>
        <li>Datos de clientes: durante la relación contractual y los plazos legales de conservación (fiscales y mercantiles).</li>
        <li>Consentimiento comercial: hasta que lo retires.</li>
        <li>El borrador del formulario se guarda solo en tu navegador y se elimina al enviarlo o a las 24 horas.</li>
      </ul>
      <h2>Con quién los compartimos</h2>
      <p>
        No vendemos tus datos. Los tratan, por cuenta nuestra y con las garantías adecuadas, los proveedores necesarios
        para prestar el servicio: alojamiento de la web y base de datos (Vercel, Supabase), envío de correos (Resend) y pagos
        (Stripe). Algunos pueden estar fuera del Espacio Económico Europeo, amparados en cláusulas contractuales tipo o
        decisiones de adecuación.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a{' '}
        <V v={s.legal_email || s.contact_email} label="Correo de contacto" />. También puedes reclamar ante la Agencia
        Española de Protección de Datos (aepd.es).
      </p>
    </>
  );
}

function Cookies({ s }: { s: SiteSettings }) {
  return (
    <>
      <p>
        Esta web utiliza únicamente cookies técnicas, necesarias para su funcionamiento. No usamos cookies de analítica,
        publicidad ni seguimiento, por lo que no es necesario pedir tu consentimiento para ellas.
      </p>
      <table>
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Finalidad</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>wqv_lead</td>
            <td>Recordar que ya has completado el formulario inicial. Solo contiene un identificador firmado, sin datos personales.</td>
            <td>180 días</td>
          </tr>
          <tr>
            <td>sb-*</td>
            <td>Sesión del panel de administración (solo para el administrador).</td>
            <td>Sesión</td>
          </tr>
        </tbody>
      </table>
      <p>
        Además, el formulario guarda temporalmente tus respuestas en el almacenamiento local de tu navegador para que no las
        pierdas si recargas la página. Se eliminan al enviar el formulario o a las 24 horas.
      </p>
      <p>
        Si en el futuro se añaden herramientas de analítica o publicidad, se mostrará un aviso para que puedas aceptarlas o
        rechazarlas antes de que se instalen. Dudas: <V v={s.legal_email || s.contact_email} label="Correo de contacto" />.
      </p>
    </>
  );
}

function Condiciones({ s, plans }: { s: SiteSettings; plans: { name: string; response_time: string | null; limits: string | null }[] }) {
  return (
    <>
      <p>
        Estas condiciones regulan la contratación de los servicios de diseño y desarrollo web ofrecidos por{' '}
        <V v={s.legal_owner_name} label="Nombre o razón social" /> ({s.business_name}).
      </p>
      <h2>1. Alcance del servicio</h2>
      <p>
        Cada plan incluye exactamente lo descrito en su ficha en el momento de la contratación (número de páginas,
        funcionalidades y rondas de modificaciones). Ese contenido queda guardado junto a tu pedido. Lo que exceda ese
        alcance se presupuesta aparte y solo se realiza si lo aceptas.
      </p>
      <h2>2. Qué no está incluido</h2>
      <p>Salvo acuerdo expreso por escrito, el precio no incluye:</p>
      <ul>
        {NOT_INCLUDED.map((x) => (
          <li key={x}>{x}.</li>
        ))}
      </ul>
      <h2>3. Precio y pagos</h2>
      <p>
        Los precios publicados son orientativos para el alcance descrito. Antes de pagar verás el precio final, el importe
        que se cobra en ese momento y cualquier coste recurrente.{' '}
        {s.payment_mode === 'deposit'
          ? `Al contratar se abona una señal del ${s.deposit_percent}% del precio; el resto se abona antes de la publicación de la web.`
          : 'Al contratar se abona el importe completo del plan.'}{' '}
        Los pagos se procesan con Stripe. Los impuestos aplicables se indicarán en la factura.
      </p>
      <h2>4. Plazos</h2>
      <p>
        El plazo de entrega se acuerda en el presupuesto y empieza a contar cuando dispongamos del contenido necesario
        (textos, imágenes, accesos). Los retrasos en la entrega de contenido por parte del cliente amplían el plazo en la
        misma medida.
      </p>
      <h2>5. Revisiones</h2>
      <p>
        Cada plan incluye el número de rondas de modificaciones indicado. Una ronda agrupa los cambios que nos envíes en un
        mismo mensaje sobre el diseño entregado. Los cambios que supongan nuevas funciones o secciones no están incluidos.
      </p>
      <h2>6. Aprobación y publicación</h2>
      <p>La web se publica únicamente después de tu aprobación expresa.</p>
      <h2>7. Propiedad</h2>
      <p>
        Una vez abonado el importe total, el diseño final y los contenidos de tu web son tuyos. El dominio y el hosting se
        contratan a tu nombre. Las licencias de terceros (plantillas, plugins, tipografías de pago) se rigen por sus propias
        condiciones.
      </p>
      <h2>8. Cancelación y desistimiento</h2>
      <p>
        Puedes cancelar el encargo antes de que empecemos a trabajar y se te devolverá lo abonado. Si el trabajo ya ha
        comenzado a petición tuya, se descontará la parte proporcional del trabajo realizado. Si contratas como consumidor,
        dispones de 14 días naturales para desistir; si nos pides empezar antes de que termine ese plazo, se aplicará el
        mismo criterio proporcional.
      </p>
      <h2>9. Mantenimiento</h2>
      <p>
        El mantenimiento es opcional, mensual y se puede cancelar con un mes de preaviso. Cada modalidad tiene tareas,
        tiempos de respuesta y límites definidos; no hay mantenimiento ilimitado.
      </p>
      {plans.length ? (
        <ul>
          {plans.map((p) => (
            <li key={p.name}>
              <strong>{p.name}:</strong> {p.response_time} {p.limits}
            </li>
          ))}
        </ul>
      ) : null}
      <h2>10. Contacto y dudas</h2>
      <p>
        Para cualquier duda sobre estas condiciones escribe a <V v={s.legal_email || s.contact_email} label="Correo de contacto" /> o{' '}
        <Link className="link" href="/reservar">
          agenda una llamada
        </Link>
        .
      </p>
    </>
  );
}
