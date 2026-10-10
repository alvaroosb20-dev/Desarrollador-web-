import { requireAdmin } from '@/lib/admin';
import Flash from '@/components/admin/Flash';
import DemoMockup from '@/components/DemoMockup';
import { deleteContent, saveDemo, saveFaq } from '../../actions';

export const dynamic = 'force-dynamic';

const LAYOUTS = [
  ['restaurant', 'Restaurante'],
  ['workshop', 'Taller'],
  ['realestate', 'Inmobiliaria'],
  ['barber', 'Barbería / peluquería'],
  ['fashion', 'Moda'],
  ['gym', 'Gimnasio'],
  ['services', 'Servicios'],
  ['shop', 'Tienda online'],
  ['generic', 'Genérico'],
];

export default async function Contenido({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: faqs }, { data: demos }] = await Promise.all([
    supabase.from('faqs').select('*').order('sort'),
    supabase.from('demo_projects').select('*').order('sort'),
  ]);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Preguntas y proyectos</h1>
          <p className="muted mb-0">Preguntas frecuentes y galería de proyectos de demostración.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <h2 style={{ fontSize: 20, margin: '8px 0 12px' }}>Preguntas frecuentes</h2>
      {(faqs ?? []).map((f: any) => (
        <details key={f.id} className="admin-card edit">
          <summary className="row between">
            <span>
              <strong>{f.question}</strong> {!f.active ? <span className="badge badge-warn">Oculta</span> : null}
            </span>
            <span className="btn btn-sm">Editar</span>
          </summary>
          <FaqForm f={f} />
        </details>
      ))}
      <details className="admin-card edit">
        <summary className="btn btn-sm">+ Nueva pregunta</summary>
        <FaqForm f={null} />
      </details>

      <h2 style={{ fontSize: 20, margin: '32px 0 4px' }}>Proyectos de demostración</h2>
      <p className="small muted">
        Se muestran siempre con la etiqueta «Demo». No añadas clientes, reseñas ni resultados que no sean reales.
      </p>
      <div className="grid grid-2">
        {(demos ?? []).map((d: any) => (
          <details key={d.id} className="admin-card edit" style={{ marginBottom: 0 }}>
            <summary>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
                <DemoMockup demo={d} />
              </div>
              <div className="row between" style={{ marginTop: 10 }}>
                <span>
                  <strong>{d.title}</strong> <span className="muted small">· {d.sector}</span>{' '}
                  {!d.active ? <span className="badge badge-warn">Oculto</span> : null}
                </span>
                <span className="btn btn-sm">Editar</span>
              </div>
            </summary>
            <DemoForm d={d} />
          </details>
        ))}
      </div>
      <details className="admin-card edit" style={{ marginTop: 16 }}>
        <summary className="btn btn-sm">+ Nuevo proyecto de demostración</summary>
        <DemoForm d={null} />
      </details>
    </>
  );
}

function FaqForm({ f }: { f: any | null }) {
  const id = f?.id ?? 'new';
  return (
    <div style={{ marginTop: 16 }}>
      <form action={saveFaq}>
        <input type="hidden" name="id" value={f?.id ?? ''} />
        <div className="field">
          <label htmlFor={`q-${id}`}>Pregunta</label>
          <input id={`q-${id}`} name="question" className="input" defaultValue={f?.question ?? ''} required />
        </div>
        <div className="field">
          <label htmlFor={`a-${id}`}>Respuesta</label>
          <textarea id={`a-${id}`} name="answer" className="textarea" defaultValue={f?.answer ?? ''} required />
        </div>
        <div className="inline-form">
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" name="active" defaultChecked={f ? !!f.active : true} />
            <span>Visible</span>
          </label>
          <label className="small muted" htmlFor={`o-${id}`}>
            Orden
          </label>
          <input id={`o-${id}`} name="sort" type="number" className="input" style={{ width: 90 }} defaultValue={f?.sort ?? 0} />
          <button className="btn btn-primary btn-sm">Guardar</button>
        </div>
      </form>
      {f ? (
        <form action={deleteContent} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={f.id} />
          <input type="hidden" name="table" value="faqs" />
          <button className="btn btn-ghost btn-sm">Eliminar</button>
        </form>
      ) : null}
    </div>
  );
}

function DemoForm({ d }: { d: any | null }) {
  const id = d?.id ?? 'new';
  const p = d?.palette ?? { bg: '#111111', fg: '#f5f5f5', accent: '#c8f26d' };
  return (
    <div style={{ marginTop: 16 }}>
      <form action={saveDemo} className="form-grid">
        <input type="hidden" name="id" value={d?.id ?? ''} />
        <div className="field">
          <label htmlFor={`t-${id}`}>Título (nombre ficticio)</label>
          <input id={`t-${id}`} name="title" className="input" defaultValue={d?.title ?? ''} required />
        </div>
        <div className="field">
          <label htmlFor={`s-${id}`}>Sector</label>
          <input id={`s-${id}`} name="sector" className="input" defaultValue={d?.sector ?? ''} required />
        </div>
        <div className="field full">
          <label htmlFor={`d-${id}`}>Descripción</label>
          <input id={`d-${id}`} name="description" className="input" defaultValue={d?.description ?? ''} />
        </div>
        <div className="field">
          <label htmlFor={`l-${id}`}>Estilo de la miniatura</label>
          <select id={`l-${id}`} name="layout" className="select" defaultValue={d?.layout ?? 'generic'}>
            {LAYOUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Colores (fondo · texto · acento)</span>
          <div className="inline-form">
            <input type="color" name="bg" defaultValue={p.bg} aria-label="Color de fondo" />
            <input type="color" name="fg" defaultValue={p.fg} aria-label="Color de texto" />
            <input type="color" name="accent" defaultValue={p.accent} aria-label="Color de acento" />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`i-${id}`}>Captura propia (opcional, sustituye la miniatura)</label>
          <input id={`i-${id}`} type="file" name="image" accept="image/png,image/jpeg,image/webp" className="input" />
          {d?.image_url ? (
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" name="remove_image" />
              <span>Quitar la imagen actual</span>
            </label>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={`o-${id}`}>Orden</label>
          <input id={`o-${id}`} name="sort" type="number" className="input" defaultValue={d?.sort ?? 0} />
        </div>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={d ? !!d.active : true} />
          <span>Visible en la web</span>
        </label>
        <div className="full">
          <button className="btn btn-primary btn-sm">Guardar proyecto</button>
        </div>
      </form>
      {d ? (
        <form action={deleteContent} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={d.id} />
          <input type="hidden" name="table" value="demo_projects" />
          <button className="btn btn-ghost btn-sm">Eliminar</button>
        </form>
      ) : null}
    </div>
  );
}
