import { requireAdmin } from '@/lib/admin';
import { normalizeWeeklyHours } from '@/lib/slots';
import { formatDateTime, tzLabel } from '@/lib/time';
import Flash from '@/components/admin/Flash';
import { BLOCK_LABELS } from '@/components/admin/labels';
import { addBlock, deleteBlock, saveAvailability } from '../../actions';

export const dynamic = 'force-dynamic';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const ZONES = ['Atlantic/Canary', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/London', 'America/Mexico_City', 'America/Bogota', 'America/Argentina/Buenos_Aires', 'America/New_York', 'UTC'];

export default async function Disponibilidad({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: cfg }, { data: blocks }] = await Promise.all([
    supabase.from('booking_settings').select('*').eq('id', 1).single(),
    supabase.from('availability_blocks').select('*').gte('ends_at', new Date().toISOString()).order('starts_at'),
  ]);
  const weekly = normalizeWeeklyHours(cfg?.weekly_hours);
  const tz = cfg?.timezone ?? 'Atlantic/Canary';

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Disponibilidad</h1>
          <p className="muted mb-0">Solo se ofrecen las horas que configures aquí, menos las ya reservadas y los bloqueos.</p>
        </div>
        <a href="/reservar" target="_blank" rel="noopener" className="btn btn-sm">
          Ver página de reservas ↗
        </a>
      </div>
      <Flash sp={sp} />

      <form action={saveAvailability}>
        <section className="admin-card">
          <h2>General</h2>
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked={!!cfg?.enabled} />
            <span>
              <strong>Reservas online activadas.</strong> Si lo desactivas, la página de reservas muestra el formulario de contacto.
            </span>
          </label>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tz">Zona horaria del negocio</label>
              <input id="tz" name="timezone" className="input" list="zones" defaultValue={tz} required />
              <datalist id="zones">
                {ZONES.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              <span className="hint">Ahora: {tzLabel(tz)}</span>
            </div>
            <div className="field">
              <label htmlFor="dur">Duración de cada llamada (minutos)</label>
              <input id="dur" name="duration_min" type="number" min={5} max={240} className="input" defaultValue={cfg?.duration_min ?? 15} />
            </div>
            <div className="field">
              <label htmlFor="buf">Descanso entre llamadas (minutos)</label>
              <input id="buf" name="buffer_min" type="number" min={0} max={120} className="input" defaultValue={cfg?.buffer_min ?? 5} />
            </div>
            <div className="field">
              <label htmlFor="notice">Antelación mínima para reservar (horas)</label>
              <input id="notice" name="min_notice_hours" type="number" min={0} max={336} className="input" defaultValue={Math.round((cfg?.min_notice_min ?? 720) / 60)} />
            </div>
            <div className="field">
              <label htmlFor="adv">Antelación máxima (días)</label>
              <input id="adv" name="max_advance_days" type="number" min={1} max={365} className="input" defaultValue={cfg?.max_advance_days ?? 30} />
            </div>
            <div className="field full">
              <label htmlFor="md">Detalles de la llamada (se muestran al reservar y en el correo)</label>
              <textarea id="md" name="meeting_details" className="textarea" style={{ minHeight: 80 }} defaultValue={cfg?.meeting_details ?? ''} maxLength={500} />
            </div>
          </div>
        </section>

        <section className="admin-card">
          <h2>Horario semanal de atención</h2>
          <p className="small muted">Hasta tres franjas por día (por ejemplo, mañana y tarde). Deja vacías las que no uses.</p>
          {DAYS.map((name, i) => {
            const d = i + 1;
            const ranges = weekly[String(d)] ?? [];
            return (
              <div key={d} className="hours-row">
                <label className="check" style={{ margin: 0 }}>
                  <input type="checkbox" name={`d${d}_on`} defaultChecked={ranges.length > 0} />
                  <span>{name}</span>
                </label>
                <div className="row" style={{ gap: 10 }}>
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="inline-form" style={{ gap: 4 }}>
                      <input type="time" name={`d${d}_s${j}`} className="input" defaultValue={ranges[j]?.start ?? ''} aria-label={`${name}, franja ${j + 1}, inicio`} />
                      <span className="muted">–</span>
                      <input type="time" name={`d${d}_e${j}`} className="input" defaultValue={ranges[j]?.end ?? ''} aria-label={`${name}, franja ${j + 1}, fin`} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
        <button className="btn btn-primary">Guardar disponibilidad</button>
      </form>

      <section className="admin-card" style={{ marginTop: 24 }}>
        <h2>Festivos, vacaciones y bloqueos</h2>
        <form action={addBlock} className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="kind">Tipo</label>
            <select id="kind" name="kind" className="select" defaultValue="holiday">
              <option value="holiday">Festivo (día completo)</option>
              <option value="vacation">Vacaciones (varios días)</option>
              <option value="block">Bloquear horas concretas</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="reason">Motivo (interno)</label>
            <input id="reason" name="reason" className="input" maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="from">Fecha (o primer día)</label>
            <input id="from" name="from" type="date" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="to">Último día (solo vacaciones)</label>
            <input id="to" name="to" type="date" className="input" />
          </div>
          <div className="field">
            <label htmlFor="st">Desde la hora (solo bloqueo de horas)</label>
            <input id="st" name="start_time" type="time" className="input" />
          </div>
          <div className="field">
            <label htmlFor="et">Hasta la hora (solo bloqueo de horas)</label>
            <input id="et" name="end_time" type="time" className="input" />
          </div>
          <div className="full">
            <button className="btn btn-sm">Añadir bloqueo</button>
          </div>
        </form>

        <div className="stack" style={{ marginTop: 20 }}>
          {(blocks ?? []).map((b: any) => (
            <div key={b.id} className="row between note" style={{ whiteSpace: 'normal' }}>
              <span>
                <span className="badge">{BLOCK_LABELS[b.kind]}</span> {formatDateTime(b.starts_at, tz)} → {formatDateTime(b.ends_at, tz)}
                {b.reason ? <span className="muted"> · {b.reason}</span> : null}
              </span>
              <form action={deleteBlock}>
                <input type="hidden" name="id" value={b.id} />
                <button className="btn btn-ghost btn-sm">Quitar</button>
              </form>
            </div>
          ))}
          {!(blocks ?? []).length ? <p className="muted small mb-0">No hay bloqueos próximos.</p> : null}
        </div>
      </section>
    </>
  );
}
