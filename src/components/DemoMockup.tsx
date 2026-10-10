import type { DemoProject } from '@/lib/types';

/**
 * Miniatura de diseño original generada con HTML/CSS (sin imágenes externas):
 * carga instantánea y se adapta a la paleta de cada demostración.
 * Si el proyecto tiene `image_url` (subida desde el panel), se muestra la imagen.
 */
export default function DemoMockup({ demo }: { demo: DemoProject }) {
  const { bg, fg, accent } = demo.palette ?? { bg: '#111', fg: '#eee', accent: '#c8f26d' };
  const soft = `color-mix(in srgb, ${fg} 12%, ${bg})`;
  const mid = `color-mix(in srgb, ${fg} 22%, ${bg})`;
  const line = (w: string, h = 5, c = mid, extra: React.CSSProperties = {}) => (
    <div style={{ width: w, height: h, borderRadius: 3, background: c, ...extra }} />
  );

  const frameBg = `linear-gradient(160deg, color-mix(in srgb, ${accent} 30%, #0d0d10), #0d0d10 70%)`;

  if (demo.image_url) {
    return (
      <div className="mock" style={{ background: frameBg }}>
        <div className="mock-browser" style={{ background: bg }}>
          <div className="mock-bar"><i /><i /><i /></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={demo.image_url} alt={`Diseño de demostración: ${demo.title}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    );
  }

  const nav = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
      <div style={{ fontWeight: 800, fontSize: 9, color: fg, letterSpacing: '-0.02em' }}>{demo.title}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {line('16px', 3)}
        {line('16px', 3)}
        {line('16px', 3)}
        <div style={{ width: 24, height: 9, borderRadius: 9, background: accent }} />
      </div>
    </div>
  );

  let body: React.ReactNode;
  switch (demo.layout) {
    case 'restaurant':
      body = (
        <div style={{ padding: '6px 12px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 10 }}>
          <div style={{ display: 'grid', gap: 6, alignContent: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 17, color: fg, lineHeight: 1 }}>Cocina de brasa</div>
            {line('80%', 4)}
            {line('60%', 4)}
            <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
              <div style={{ width: 44, height: 12, borderRadius: 2, background: accent }} />
              <div style={{ width: 36, height: 12, borderRadius: 2, border: `1px solid ${mid}` }} />
            </div>
          </div>
          <div style={{ borderRadius: '50% 50% 6px 6px', aspectRatio: '1', background: `radial-gradient(circle at 40% 35%, ${accent}, color-mix(in srgb, ${accent} 30%, ${bg}) 60%)` }} />
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 34, borderRadius: 4, background: soft }} />
            ))}
          </div>
        </div>
      );
      break;
    case 'workshop':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gap: 8 }}>
          <div style={{ background: soft, borderRadius: 6, padding: 10, display: 'grid', gap: 5, borderLeft: `3px solid ${accent}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: fg, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Cita previa en 1 minuto</div>
            {line('70%', 4)}
            <div style={{ display: 'flex', gap: 5 }}>
              <div style={{ flex: 1, height: 12, borderRadius: 3, background: bg }} />
              <div style={{ width: 40, height: 12, borderRadius: 3, background: accent }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 36, borderRadius: 5, border: `1px solid ${mid}`, display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: 99, border: `2px solid ${accent}` }} />
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'realestate':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, padding: 5, borderRadius: 99, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
            {line('30%', 8, soft)}
            {line('25%', 8, soft)}
            <div style={{ marginLeft: 'auto', width: 30, height: 8, borderRadius: 9, background: accent }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ borderRadius: 5, overflow: 'hidden', background: '#fff' }}>
                <div style={{ height: 34, background: `linear-gradient(135deg, color-mix(in srgb, ${accent} ${40 + i * 15}%, #ddd), #cfd8d3)` }} />
                <div style={{ padding: 5, display: 'grid', gap: 3 }}>
                  {line('70%', 3)}
                  {line('40%', 4, accent)}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'barber':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: fg, lineHeight: 1.05 }}>
              Estilo clásico, <span style={{ color: accent, fontStyle: 'italic' }}>sin esperas</span>
            </div>
            {line('85%', 3)}
            <div style={{ width: 52, height: 12, borderRadius: 2, background: accent }} />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {['10:00', '10:30', '11:00', '11:30'].map((t, i) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderRadius: 3, border: `1px solid ${i === 1 ? accent : mid}`, fontSize: 7, color: i === 1 ? accent : fg }}>
                <span>{t}</span>
                <span>●</span>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case 'fashion':
      body = (
        <div style={{ padding: '2px 12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 6 }}>
          <div style={{ gridRow: 'span 2', borderRadius: 2, background: 'linear-gradient(180deg,#d8cfc2,#b9ad9c)', minHeight: 92, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 6, bottom: 6, fontFamily: 'Georgia, serif', fontSize: 14, color: '#141414', fontStyle: 'italic' }}>Otoño</div>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ borderRadius: 2, background: i % 2 ? '#d9d2c8' : '#cbc2b5', minHeight: 43 }} />
          ))}
        </div>
      );
      break;
    case 'gym':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: fg, letterSpacing: '-0.05em', lineHeight: 0.9, textTransform: 'uppercase' }}>
            Entrena <span style={{ color: accent }}>fuerte</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ height: 18, borderRadius: 3, background: i === 3 || i === 7 ? accent : soft }} />
            ))}
          </div>
        </div>
      );
      break;
    case 'services':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: fg, lineHeight: 1.1 }}>Asesoría cercana para tu empresa</div>
            {line('90%', 3)}
            {line('70%', 3)}
            <div style={{ width: 54, height: 12, borderRadius: 6, background: accent }} />
          </div>
          <div style={{ background: '#fff', borderRadius: 8, padding: 8, display: 'grid', gap: 5, boxShadow: '0 4px 14px rgba(20,33,61,.12)' }}>
            {line('50%', 4)}
            <div style={{ height: 10, borderRadius: 3, border: `1px solid ${soft}` }} />
            <div style={{ height: 10, borderRadius: 3, border: `1px solid ${soft}` }} />
            <div style={{ height: 11, borderRadius: 3, background: accent }} />
          </div>
        </div>
      );
      break;
    case 'shop':
      body = (
        <div style={{ padding: '4px 12px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} style={{ display: 'grid', gap: 3 }}>
              <div style={{ aspectRatio: '1', borderRadius: 5, background: i === 2 ? accent : `color-mix(in srgb, ${accent} ${8 + (i % 3) * 8}%, #efe7dc)` }} />
              {line('80%', 3)}
              {line('40%', 3, fg)}
            </div>
          ))}
        </div>
      );
      break;
    default:
      body = (
        <div style={{ padding: '8px 12px', display: 'grid', gap: 6 }}>
          {line('60%', 10, fg)}
          {line('80%', 4)}
          {line('50%', 4)}
          <div style={{ width: 60, height: 14, borderRadius: 7, background: accent, marginTop: 4 }} />
        </div>
      );
  }

  return (
    <div className="mock" style={{ background: frameBg }} aria-hidden="true">
      <div className="mock-browser" style={{ background: bg }}>
        <div className="mock-bar">
          <i />
          <i />
          <i />
        </div>
        {nav}
        {body}
      </div>
    </div>
  );
}
