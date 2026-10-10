// Miniaturas de diseños de demostración hechas con HTML/CSS (sin imágenes externas):
// cargan al instante y usan la paleta de cada demostración. Si el proyecto tiene
// una imagen subida desde el panel, se muestra la imagen.
import { esc } from './common.js';

const bar = (w, extra = '') => `<i class="mbar" style="width:${w};${extra}"></i>`;

const LAYOUTS = {
  restaurant: (d) => `
    <div class="mock-body" style="grid-template-columns:1.1fr 1fr;align-items:center">
      <div style="display:grid;gap:.7em">
        <div class="mtitle" style="font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:2.1em">Cocina<br>de brasa</div>
        ${bar('80%')}${bar('60%')}
        <div style="display:flex;gap:.5em"><i class="mbtn" style="width:4.5em"></i><i class="mbtn" style="width:3.6em;background:none;border:1px solid var(--msoft2)"></i></div>
      </div>
      <div style="aspect-ratio:1;border-radius:50% 50% .6em .6em;background:radial-gradient(circle at 40% 35%,var(--macc),color-mix(in srgb,var(--macc) 25%,var(--mbg)) 62%)"></div>
      <div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:.6em">${'<i class="mtile" style="height:3.4em"></i>'.repeat(3)}</div>
    </div>`,
  workshop: () => `
    <div class="mock-body">
      <div class="mtile" style="padding:1em;display:grid;gap:.6em;border-left:3px solid var(--macc)">
        <div class="mtitle" style="font-size:1.4em;text-transform:uppercase">Cita previa en 1 minuto</div>
        ${bar('70%')}
        <div style="display:flex;gap:.5em"><i style="flex:1;height:1.4em;border-radius:.3em;background:var(--mbg)"></i><i class="mbtn" style="width:4em"></i></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6em">${'<i style="height:3.4em;border-radius:.5em;border:1px solid var(--msoft2);display:grid;place-items:center"><b style="width:1.2em;height:1.2em;border-radius:50%;border:2px solid var(--macc)"></b></i>'.repeat(4)}</div>
    </div>`,
  realestate: () => `
    <div class="mock-body">
      <div style="display:flex;gap:.5em;padding:.5em;border-radius:2em;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);align-items:center">${bar('30%', 'height:.8em;background:var(--msoft)')}${bar('25%', 'height:.8em;background:var(--msoft)')}<i class="mbtn" style="margin-left:auto;width:3em;height:1em;border-radius:1em"></i></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6em">${[40, 55, 70]
        .map(
          (p) => `<div style="border-radius:.5em;overflow:hidden;background:#fff"><div style="height:3.6em;background:linear-gradient(135deg,color-mix(in srgb,var(--macc) ${p}%,#ddd),#cfd8d3)"></div><div style="padding:.5em;display:grid;gap:.3em">${bar('70%', 'height:.3em')}${bar('40%', 'height:.4em;background:var(--macc)')}</div></div>`,
        )
        .join('')}</div>
    </div>`,
  barber: () => `
    <div class="mock-body" style="grid-template-columns:1fr 1fr;align-items:center">
      <div style="display:grid;gap:.6em"><div style="font-family:Georgia,serif;font-size:1.6em;line-height:1.05">Estilo clásico, sin esperas</div>${bar('85%', 'height:.3em')}<i class="mbtn" style="width:5em"></i></div>
      <div style="display:grid;gap:.4em">${['10:00', '10:30', '11:00', '11:30']
        .map((t, i) => `<div style="display:flex;justify-content:space-between;padding:.35em .6em;border-radius:.3em;border:1px solid ${i === 1 ? 'var(--macc)' : 'var(--msoft2)'};color:${i === 1 ? 'var(--macc)' : 'inherit'};font-size:.8em"><span>${t}</span><span>Corte</span></div>`)
        .join('')}</div>
    </div>`,
  fashion: () => `
    <div class="mock-body" style="grid-template-columns:1.2fr 1fr 1fr;gap:.6em">
      <div style="grid-row:span 2;border-radius:.3em;background:linear-gradient(170deg,#d9d2c7,#b9ae9f)"></div>
      <div style="border-radius:.3em;background:linear-gradient(170deg,#cfc6b8,#a99c8a)"></div>
      <div style="display:grid;gap:.4em;align-content:end"><div class="mtitle" style="font-size:1.6em;font-weight:300;letter-spacing:.02em">Otoño</div>${bar('70%', 'height:.3em')}</div>
      <div style="grid-column:span 2;display:flex;gap:.5em;align-items:end">${bar('30%', 'height:.3em')}<i class="mbtn" style="width:4em;height:1.2em;border-radius:0"></i></div>
    </div>`,
  gym: () => `
    <div class="mock-body">
      <div class="mtitle" style="font-size:2.3em;font-style:italic;text-transform:uppercase;letter-spacing:-0.04em">Entrena <span style="color:var(--macc)">hoy</span></div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.4em">${['L', 'M', 'X', 'J', 'V']
        .map((d, i) => `<div style="padding:.5em .3em;border-radius:.4em;background:${i === 2 ? 'var(--macc)' : 'var(--msoft)'};color:${i === 2 ? 'var(--mbg)' : 'inherit'};text-align:center;font-weight:700;font-size:.9em">${d}</div>`)
        .join('')}</div>
      <div style="display:flex;gap:.6em">${'<i class="mtile" style="flex:1;height:2.6em"></i>'.repeat(3)}</div>
    </div>`,
  services: () => `
    <div class="mock-body" style="grid-template-columns:1.3fr 1fr;align-items:center">
      <div style="display:grid;gap:.6em"><div class="mtitle" style="font-size:1.6em">Asesoría clara para tu empresa</div>${bar('90%', 'height:.3em')}${bar('65%', 'height:.3em')}<div style="display:flex;gap:.5em"><i class="mbtn" style="width:4.5em"></i></div></div>
      <div style="padding:.8em;border-radius:.6em;background:#fff;box-shadow:0 4px 16px rgba(20,33,61,.1);display:grid;gap:.5em">${bar('100%', 'height:1.2em;border-radius:.3em;background:var(--msoft)')}${bar('100%', 'height:1.2em;border-radius:.3em;background:var(--msoft)')}<i class="mbtn" style="height:1.3em"></i></div>
    </div>`,
  shop: () => `
    <div class="mock-body" style="grid-template-columns:repeat(3,1fr);gap:.7em">
      ${['#f2c7a5', '#e8d5b0', '#c8d7c1']
        .map((c) => `<div style="display:grid;gap:.35em"><div style="aspect-ratio:1;border-radius:.5em;background:${c}"></div>${bar('70%', 'height:.3em')}<div style="display:flex;justify-content:space-between;align-items:center">${bar('35%', 'height:.4em;background:var(--macc)')}<i style="width:1.3em;height:1.3em;border-radius:50%;background:var(--mfg)"></i></div></div>`)
        .join('')}
    </div>`,
  generic: () => `<div class="mock-body"><div class="mtitle" style="font-size:2em">Tu negocio</div>${bar('70%')}${bar('50%')}<i class="mbtn" style="width:5em"></i></div>`,
};

export function renderMock(d) {
  const pal = d.palette ?? { bg: '#16181c', fg: '#eeeeee', accent: '#d8b46a' };
  const style = `--mbg:${pal.bg};--mfg:${pal.fg};--macc:${pal.accent};--msoft:color-mix(in srgb,${pal.fg} 9%,${pal.bg});--msoft2:color-mix(in srgb,${pal.fg} 20%,${pal.bg})`;
  if (d.image_url) {
    return `<div class="mock" style="${esc(style)}"><img src="${esc(d.image_url)}" alt="Diseño de demostración: ${esc(d.title)}" loading="lazy"></div>`;
  }
  const body = (LAYOUTS[d.layout] ?? LAYOUTS.generic)(d);
  return `<div class="mock" style="${esc(style)}" role="img" aria-label="Diseño de demostración para ${esc(d.sector)}: ${esc(d.title)}">
    <div class="mock-nav"><b>${esc(d.title)}</b><span><i></i><i></i><i></i><em></em></span></div>${body}</div>`;
}

export const LAYOUT_NAMES = {
  restaurant: 'Restaurante',
  workshop: 'Taller',
  realestate: 'Inmobiliaria',
  barber: 'Barbería',
  fashion: 'Moda',
  gym: 'Gimnasio',
  services: 'Servicios',
  shop: 'Tienda online',
  generic: 'Genérico',
};
