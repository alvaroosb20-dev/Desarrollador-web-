import { requireAdmin } from '@/lib/admin';
import { centsToInput, euros } from '@/lib/format';
import Flash from '@/components/admin/Flash';
import { deleteCatalogItem, saveAddon, savePackage, savePlan } from '../../actions';

export const dynamic = 'force-dynamic';

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

export default async function Paquetes({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: packages }, { data: plans }, { data: addons }] = await Promise.all([
    supabase.from('packages').select('*').order('sort'),
    supabase.from('maintenance_plans').select('*').order('sort'),
    supabase.from('addons').select('*').order('sort'),
  ]);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Paquetes y precios</h1>
          <p className="muted mb-0">Los cambios se guardan en la base de datos y se reflejan en la web pública al momento.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <h2 style={{ fontSize: 20, margin: '8px 0 12px' }}>Paquetes de diseño web</h2>
      {(packages ?? []).map((p: any) => (
        <details key={p.id} className="admin-card edit">
          <summary className="row between">
            <span>
              <strong>{p.name}</strong> · {euros(p.price_cents)} {p.highlighted ? <span className="badge badge-accent">Destacado</span> : null}{' '}
              {!p.active ? <span className="badge badge-warn">Oculto</span> : null}
            </span>
            <span className="btn btn-sm">Editar</span>
          </summary>
          <PackageForm p={p} />
        </details>
      ))}
      <details className="admin-card edit">
        <summary className="btn btn-sm">+ Nuevo paquete</summary>
        <PackageForm p={null} />
      </details>

      <h2 style={{ fontSize: 20, margin: '32px 0 12px' }}>Planes de mantenimiento</h2>
      {(plans ?? []).map((m: any) => (
        <details key={m.id} className="admin-card edit">
          <summary className="row between">
            <span>
              <strong>{m.name}</strong> · {euros(m.price_cents, { from: m.price_from, monthly: true })}{' '}
              {!m.active ? <span className="badge badge-warn">Oculto</span> : null}
            </span>
            <span className="btn btn-sm">Editar</span>
          </summary>
          <PlanForm m={m} />
        </details>
      ))}
      <details className="admin-card edit">
        <summary className="btn btn-sm">+ Nuevo plan de mantenimiento</summary>
        <PlanForm m={null} />
      </details>

      <h2 style={{ fontSize: 20, margin: '32px 0 12px' }}>Servicios adicionales</h2>
      {(addons ?? []).map((a: any) => (
        <details key={a.id} className="admin-card edit">
          <summary className="row between">
            <span>
              <strong>{a.name}</strong> · {euros(a.price_cents, { from: a.price_from })}
              {a.unit === 'monthly' ? '/mes' : a.unit === 'hourly' ? '/hora' : ''} {!a.active ? <span className="badge badge-warn">Oculto</span> : null}
            </span>
            <span className="btn btn-sm">Editar</span>
          </summary>
          <AddonForm a={a} />
        </details>
      ))}
      <details className="admin-card edit">
        <summary className="btn btn-sm">+ Nuevo servicio adicional</summary>
        <AddonForm a={null} />
      </details>
    </>
  );
}

function DeleteButton({ id, table }: { id: string; table: string }) {
  return (
    <form action={deleteCatalogItem}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="table" value={table} />
      <button className="btn btn-ghost btn-sm">Eliminar</button>
    </form>
  );
}

function PackageForm({ p }: { p: any | null }) {
  return (
    <div style={{ marginTop: 16 }}>
      <form action={savePackage} className="form-grid">
        <input type="hidden" name="id" value={p?.id ?? ''} />
        <Field label="Nombre" name="name" def={p?.name} required />
        <Field label="URL (identificador)" name="slug" def={p?.slug} required hint="Ej.: web-basica. Cambiarla rompe los enlaces existentes." />
        <Field label="Precio (€)" name="price" def={p ? centsToInput(p.price_cents) : ''} required inputMode="decimal" />
        <Field label="Límite de páginas (vacío = sin límite)" name="page_limit" def={p?.page_limit ?? ''} type="number" />
        <Field label="Rondas de modificaciones" name="revision_rounds" def={p?.revision_rounds ?? 1} type="number" />
        <Field label="Etiqueta (p. ej. «Más elegido»)" name="badge" def={p?.badge} />
        <Field label="Texto del botón" name="cta_label" def={p?.cta_label} />
        <Field label="Orden" name="sort" def={p?.sort ?? 0} type="number" />
        <Field label="Para quién es" name="audience" def={p?.audience} full />
        <Field label="Descripción breve" name="description" def={p?.description} full />
        <div className="field full">
          <label htmlFor={`f-${p?.id ?? 'new'}`}>Características (una por línea)</label>
          <textarea id={`f-${p?.id ?? 'new'}`} name="features" className="textarea" style={{ minHeight: 180 }} defaultValue={arr(p?.features).join('\n')} />
        </div>
        <label className="check">
          <input type="checkbox" name="highlighted" defaultChecked={!!p?.highlighted} />
          <span>Destacar este paquete</span>
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={p ? !!p.active : true} />
          <span>Visible en la web</span>
        </label>
        <div className="full row">
          <button className="btn btn-primary btn-sm">Guardar paquete</button>
        </div>
      </form>
      {p ? <DeleteButton id={p.id} table="packages" /> : null}
    </div>
  );
}

function PlanForm({ m }: { m: any | null }) {
  return (
    <div style={{ marginTop: 16 }}>
      <form action={savePlan} className="form-grid">
        <input type="hidden" name="id" value={m?.id ?? ''} />
        <Field label="Nombre" name="name" def={m?.name} required />
        <Field label="URL (identificador)" name="slug" def={m?.slug} required />
        <Field label="Precio mensual (€)" name="price" def={m ? centsToInput(m.price_cents) : ''} required inputMode="decimal" />
        <Field label="Orden" name="sort" def={m?.sort ?? 0} type="number" />
        <Field label="Descripción" name="description" def={m?.description} full />
        <Field label="Tiempo de respuesta" name="response_time" def={m?.response_time} full />
        <Field label="Límites del plan" name="limits" def={m?.limits} full hint="Ej.: hasta 2 horas al mes; no acumulables." />
        <div className="field full">
          <label htmlFor={`m-${m?.id ?? 'new'}`}>Tareas incluidas (una por línea)</label>
          <textarea id={`m-${m?.id ?? 'new'}`} name="features" className="textarea" defaultValue={arr(m?.features).join('\n')} />
        </div>
        <label className="check">
          <input type="checkbox" name="price_from" defaultChecked={!!m?.price_from} />
          <span>Mostrar como «desde»</span>
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={m ? !!m.active : true} />
          <span>Visible en la web</span>
        </label>
        <div className="full">
          <button className="btn btn-primary btn-sm">Guardar plan</button>
        </div>
      </form>
      {m ? <DeleteButton id={m.id} table="maintenance_plans" /> : null}
    </div>
  );
}

function AddonForm({ a }: { a: any | null }) {
  return (
    <div style={{ marginTop: 16 }}>
      <form action={saveAddon} className="form-grid">
        <input type="hidden" name="id" value={a?.id ?? ''} />
        <Field label="Nombre" name="name" def={a?.name} required />
        <Field label="Precio (€)" name="price" def={a ? centsToInput(a.price_cents) : ''} required inputMode="decimal" />
        <div className="field">
          <label htmlFor={`u-${a?.id ?? 'new'}`}>Unidad</label>
          <select id={`u-${a?.id ?? 'new'}`} name="unit" className="select" defaultValue={a?.unit ?? 'one_time'}>
            <option value="one_time">Pago único</option>
            <option value="monthly">Mensual</option>
            <option value="hourly">Por hora</option>
          </select>
        </div>
        <Field label="Orden" name="sort" def={a?.sort ?? 0} type="number" />
        <Field label="Descripción" name="description" def={a?.description} full />
        <label className="check">
          <input type="checkbox" name="price_from" defaultChecked={!!a?.price_from} />
          <span>Mostrar como «desde»</span>
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={a ? !!a.active : true} />
          <span>Visible en la web</span>
        </label>
        <div className="full">
          <button className="btn btn-primary btn-sm">Guardar servicio</button>
        </div>
      </form>
      {a ? <DeleteButton id={a.id} table="addons" /> : null}
    </div>
  );
}

function Field({
  label,
  name,
  def,
  required,
  type = 'text',
  full,
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  def?: string | number | null;
  required?: boolean;
  type?: string;
  full?: boolean;
  hint?: string;
  inputMode?: 'decimal' | 'text';
}) {
  const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} className="input" defaultValue={def ?? ''} required={required} inputMode={inputMode} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
