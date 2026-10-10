import { requireAdmin } from '@/lib/admin';
import Flash from '@/components/admin/Flash';
import { saveLogo, saveSettings } from '../../actions';

export const dynamic = 'force-dynamic';

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default async function Ajustes({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: s } = await supabase.from('site_settings').select('*').eq('id', 1).single();
  const services = arr<{ key: string; title: string; description: string }>(s?.services);
  const steps = arr<{ title: string; description: string }>(s?.process_steps);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Ajustes generales</h1>
          <p className="muted mb-0">Nombre, colores, contacto, textos, datos legales y pagos.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <section className="admin-card">
        <h2>Logotipo</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          {s?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt="Logotipo actual" style={{ height: 40, width: 'auto', background: '#000', padding: 6, borderRadius: 8 }} />
          ) : (
            <span className="muted small">Sin logotipo: se muestra la inicial y el nombre.</span>
          )}
          <form action={saveLogo} className="inline-form">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input" aria-label="Archivo del logotipo" />
            <button className="btn btn-sm">Subir</button>
          </form>
          {s?.logo_url ? (
            <form action={saveLogo}>
              <input type="hidden" name="remove" value="true" />
              <button className="btn btn-ghost btn-sm">Quitar logotipo</button>
            </form>
          ) : null}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          PNG, JPG, WEBP o SVG de hasta 2 MB. Mejor con fondo transparente y en horizontal.
        </p>
      </section>

      <form action={saveSettings}>
        <section className="admin-card">
          <h2>Marca y contacto</h2>
          <div className="form-grid">
            <F label="Nombre comercial" name="business_name" def={s?.business_name} required />
            <div className="field">
              <label htmlFor="accent">Color de acento</label>
              <div className="inline-form">
                <input id="accent" name="accent_color" type="color" defaultValue={s?.accent_color ?? '#c8f26d'} style={{ width: 56, height: 42, border: 0, background: 'none' }} />
                <span className="hint">Botones y elementos destacados. Elige un tono con buen contraste sobre negro.</span>
              </div>
            </div>
            <F label="Correo de contacto (público)" name="contact_email" def={s?.contact_email} type="email" />
            <F label="WhatsApp (con prefijo, p. ej. +34600000000)" name="whatsapp" def={s?.whatsapp} />
          </div>
        </section>

        <section className="admin-card">
          <h2>Textos de la página</h2>
          <div className="form-grid">
            <F label="Título principal" name="hero_title" def={s?.hero_title} full />
            <A label="Subtítulo principal" name="hero_subtitle" def={s?.hero_subtitle} />
            <A label="Nota de precios" name="pricing_note" def={s?.pricing_note} />
            <A label="Texto del pie de página" name="footer_text" def={s?.footer_text} />
          </div>
          <h3 style={{ fontSize: 16, marginTop: 20 }}>Servicios (tarjetas)</h3>
          {Array.from({ length: Math.max(6, services.length + 1) }).slice(0, 8).map((_, i) => (
            <div key={i} className="form-grid" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <input type="hidden" name={`svc_key_${i}`} defaultValue={services[i]?.key ?? ''} />
              <F label={`Servicio ${i + 1} · título`} name={`svc_title_${i}`} def={services[i]?.title} />
              <F label="Descripción breve" name={`svc_desc_${i}`} def={services[i]?.description} />
            </div>
          ))}
          <h3 style={{ fontSize: 16, marginTop: 20 }}>Cómo trabajamos (pasos)</h3>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="form-grid" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <F label={`Paso ${i + 1} · título`} name={`step_title_${i}`} def={steps[i]?.title} />
              <F label="Descripción" name={`step_desc_${i}`} def={steps[i]?.description} />
            </div>
          ))}
        </section>

        <section className="admin-card">
          <h2>Pagos</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pm">Al contratar se cobra</label>
              <select id="pm" name="payment_mode" className="select" defaultValue={s?.payment_mode ?? 'full'}>
                <option value="full">El importe completo</option>
                <option value="deposit">Una señal inicial</option>
              </select>
            </div>
            <F label="Porcentaje de la señal (%)" name="deposit_percent" def={s?.deposit_percent ?? 50} type="number" />
          </div>
        </section>

        <section className="admin-card">
          <h2>Datos legales</h2>
          <p className="small muted">
            Aparecen en el aviso legal, la política de privacidad y las condiciones. Mientras falten, esas páginas muestran un aviso. Revisa
            los textos legales con un profesional antes de publicar.
          </p>
          <div className="form-grid">
            <F label="Titular (nombre o razón social)" name="legal_owner_name" def={s?.legal_owner_name} />
            <F label="NIF / CIF" name="legal_tax_id" def={s?.legal_tax_id} />
            <F label="Domicilio" name="legal_address" def={s?.legal_address} full />
            <F label="Correo para privacidad y avisos legales" name="legal_email" def={s?.legal_email} type="email" />
            <F label="Datos registrales (si es sociedad)" name="legal_registry" def={s?.legal_registry} />
            <F label="Versión de las condiciones" name="terms_version" def={s?.terms_version ?? '1.0'} hint="Cámbiala cuando modifiques las condiciones: cada contratación guarda la versión aceptada." />
          </div>
        </section>

        <button className="btn btn-primary">Guardar ajustes</button>
      </form>
    </>
  );
}

function F({ label, name, def, type = 'text', full, required, hint }: { label: string; name: string; def?: string | number | null; type?: string; full?: boolean; required?: boolean; hint?: string }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={`s-${name}`}>{label}</label>
      <input id={`s-${name}`} name={name} type={type} className="input" defaultValue={def ?? ''} required={required} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function A({ label, name, def }: { label: string; name: string; def?: string | null }) {
  return (
    <div className="field full">
      <label htmlFor={`s-${name}`}>{label}</label>
      <textarea id={`s-${name}`} name={name} className="textarea" style={{ minHeight: 80 }} defaultValue={def ?? ''} />
    </div>
  );
}
