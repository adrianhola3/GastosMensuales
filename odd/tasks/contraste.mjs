/* Calculadora de contraste WCAG para calibrar los tokens.
 *
 * Se ejecuta aparte del navegador a proposito: los tokens claros se eligen por
 * contraste MEDIDO, no a ojo. `color-mix()` no se usa en ningun token de texto
 * justamente para que este calculo y el del navegador coincidan.
 *
 * Uso: node odd/tasks/contraste.mjs
 */

const srgb = c => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/* --- parseo de colores: hex, rgb(), rgba() compuesto sobre un fondo --- */
function parse(str, bg = [255, 255, 255]) {
  str = String(str).trim();
  let m;
  if ((m = str.match(/^#([0-9a-f]{3})$/i))) {
    const h = m[1];
    return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16));
  }
  if ((m = str.match(/^#([0-9a-f]{6})$/i))) {
    const h = m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  if ((m = str.match(/^rgba?\(([^)]+)\)$/i))) {
    const p = m[1].split(/[,/]/).map(s => parseFloat(s.trim()));
    const [r, g, b] = p;
    if (p.length >= 4 && p[3] < 1) {
      return [r, g, b].map((c, i) => Math.round(c * p[3] + bg[i] * (1 - p[3])));
    }
    return [r, g, b];
  }
  throw new Error('No parseable: ' + str);
}

/* --- hex helper para generar candidatos desde HSL --- */
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

export { parse, ratio, lum, hsl, hex };

/* ------------------------------------------------------------------ */
/* Paleta clara candidata                                              */
/* ------------------------------------------------------------------ */
const LIGHT = {
  '--bg-canvas': '#f5f5f7',
  '--bg-surface': '#ffffff',
  '--bg-card': '#ffffff',
  '--bg-chrome': '#ffffff',
  '--bg-inset': '#f2f2f5',
  '--bg-raised': '#ececef',
  '--material-bg': 'rgba(250, 250, 252, 0.8)',

  '--hairline': 'rgba(29, 29, 31, 0.12)',
  '--hairline-strong': 'rgba(29, 29, 31, 0.20)',
  '--hairline-focus': 'rgba(29, 29, 31, 0.36)',

  '--text-main': '#1d1d1f',
  '--text-secondary': '#5b5f67',
  '--text-muted': '#656972',

  '--accent-primary': '#0088ff',
  '--accent-primary-hover': '#4da3ff',
  '--accent-primary-wash': 'rgba(0, 136, 255, 0.10)',
  '--accent-primary-wash-strong': 'rgba(0, 136, 255, 0.18)',
  '--accent-primary-border': 'rgba(0, 136, 255, 0.42)',
  '--accent-on-primary': '#0b0b0c',
  '--focus-ring': '#0088ff',

  '--accent-emerald': '#1f7a52',
  '--accent-rose': '#b03a48',
  '--accent-cyan': '#2b6c8c',
  '--text-emerald': '#1f7a52',
  '--text-rose': '#b03a48',
  '--text-cyan': '#2b6c8c',

  '--cat-servicios': '#506e82',
  '--cat-personales': '#786197',
  '--cat-movimientos': '#4a745d',
  '--cat-extras': '#7c6849',
  '--cat-matrix': '#6d727a',
  '--cat-trend': '#6d727a',
  '--cat-categories': '#6d727a',
};

/* Fondos reales, compuestos como lo haria el navegador */
const canvas = parse(LIGHT['--bg-canvas']);
const surface = parse(LIGHT['--bg-surface']);
const inset = parse(LIGHT['--bg-inset']);
const raised = parse(LIGHT['--bg-raised']);
/* El topbar es translucido: se compone sobre la superficie Y sobre el canvas,
   y el texto de estado se escribe ahi (app.js:550). Se toma el PEOR caso. */
const materialSurface = parse(LIGHT['--material-bg'], surface);
const materialCanvas = parse(LIGHT['--material-bg'], canvas);

/* Pares que tienen que medirse. `min` = 4.5 texto normal, 3 texto grande /
   indicador no textual, 1 filete (solo tiene que ser distinguishable). */
const PAIRS = [
  ['texto principal', '--text-main', '--bg-surface', 4.5],
  ['texto principal', '--text-main', '--bg-canvas', 4.5],
  ['texto principal', '--text-main', '--bg-inset', 4.5],
  ['texto principal', '--text-main', '--bg-raised', 4.5],
  ['texto secundario', '--text-secondary', '--bg-surface', 4.5],
  ['texto secundario', '--text-secondary', '--bg-canvas', 4.5],
  ['texto secundario', '--text-secondary', '--bg-inset', 4.5],
  ['texto secundario', '--text-secondary', '--bg-raised', 4.5],
  ['texto terciario', '--text-muted', '--bg-surface', 4.5],
  ['texto terciario', '--text-muted', '--bg-canvas', 4.5],
  ['texto terciario', '--text-muted', '--bg-inset', 4.5],
  ['texto terciario', '--text-muted', '--bg-raised', 4.5],
  ['estado: ingreso (14px topbar)', '--accent-emerald', '--material-bg', 4.5],
  ['estado: ingreso (14px topbar)', '--accent-emerald', '--bg-surface', 4.5],
  ['estado: gasto (14px topbar)', '--accent-rose', '--material-bg', 4.5],
  ['estado: gasto (14px topbar)', '--accent-rose', '--bg-surface', 4.5],
  ['estado: balance cero (28px)', '--text-cyan', '--bg-surface', 4.5],
  ['estado: ingreso (28px)', '--text-emerald', '--bg-surface', 4.5],
  ['estado: gasto (28px)', '--text-rose', '--bg-surface', 4.5],
  ['estado: gasto (13px notas)', '--text-rose', '--bg-surface', 4.5],
  ['boton primario: etiqueta', '--accent-on-primary', '--accent-primary', 4.5],
  ['boton primario: etiqueta hover', '--accent-on-primary', '--accent-primary-hover', 4.5],
  ['anillo de foco (indicador)', '--focus-ring', '--bg-surface', 3],
  ['anillo de foco (indicador)', '--focus-ring', '--bg-canvas', 3],
  ['tick activo del rail', '--accent-primary', '--bg-canvas', 3],
  ['barra de pagos', '--accent-primary', '--bg-surface', 3],
  ['categoria servicios', '--cat-servicios', '--bg-surface', 3],
  ['categoria personales', '--cat-personales', '--bg-surface', 3],
  ['categoria movimientos', '--cat-movimientos', '--bg-surface', 3],
  ['categoria extras', '--cat-extras', '--bg-surface', 3],
  ['categoria neutra (matriz)', '--cat-matrix', '--bg-surface', 3],
  ['acento de barra (ingresos)', '--accent-emerald', '--bg-surface', 3],
  ['acento de barra (balance)', '--accent-rose', '--bg-surface', 3],
  ['segmento: cuenta de capsule', '--text-muted', '--bg-inset', 4.5],
  ['modo: etiqueta admin sobre wash', '--text-secondary', '--accent-primary-wash', 4.5],
  ['modo: etiqueta lector sobre inset', '--text-muted', '--bg-inset', 4.5],
  ['boton secundario sobre inset', '--text-main', '--bg-inset', 4.5],
];

const BG = {
  '--bg-surface': surface,
  '--bg-canvas': canvas,
  '--bg-inset': inset,
  '--bg-raised': raised,
  '--material-bg': materialCanvas,
  '--accent-primary': parse(LIGHT['--accent-primary']),
  '--accent-primary-hover': parse(LIGHT['--accent-primary-hover']),
  '--accent-primary-wash': parse(LIGHT['--accent-primary-wash'], surface),
};

function fg(name) {
  return parse(LIGHT[name], BG['--bg-surface']);
}

let fails = 0;
let lowest = { r: 99, label: '' };
const rows = PAIRS.map(([label, f, b, min]) => {
  const r = ratio(fg(f), BG[b]);
  const ok = r >= min;
  if (!ok) fails++;
  if (r >= min && r < lowest.r) lowest = { r, label: `${label} (${f} sobre ${b})` };
  return { label, f, b, min, r, ok };
});

const w = (s, n) => String(s).padEnd(n);
console.log(w('par', 34), w('foreground', 22), w('fondo', 20), w('ratio', 8), w('min', 5), 'cumple');
console.log('-'.repeat(98));
for (const r of rows) {
  console.log(
    w(r.label, 34), w(r.f, 22), w(r.b, 20),
    w(r.r.toFixed(2), 8), w(r.min, 5), r.ok ? 'SI' : '*** FALLA ***'
  );
}
console.log('-'.repeat(98));
console.log(`total pares: ${rows.length}   fallos: ${fails}`);
console.log(`mas bajo que cumple: ${lowest.r.toFixed(2)}:1  ${lowest.label}`);

/* Material translucido: hay que medir tambien compuesto sobre superficie clara */
console.log('');
console.log('material-bg compuesto: sobre superficie', hex(materialSurface), ' sobre canvas', hex(materialCanvas));
console.log('estado ingreso 14px sobre material(peor caso)',
  ratio(parse(LIGHT['--accent-emerald']), materialCanvas).toFixed(2));
console.log('estado gasto  14px sobre material(peor caso)',
  ratio(parse(LIGHT['--accent-rose']), materialCanvas).toFixed(2));

/* Generador de candidatos de categoria desde HSL, para calibrar el tono */
console.log('');
console.log('candidatos de acento de categoria por HSL (mismo hue que el oscuro):');
const HUES = { servicios: [203, 24], personales: [266, 22], movimientos: [148, 22], extras: [37, 26] };
for (const [name, [h, s]] of Object.entries(HUES)) {
  const row = [];
  for (const l of [30, 33, 36, 39, 42, 45]) {
    const c = hsl(h, s, l);
    row.push(`${l}%:${hex(c)} ${ratio(c, surface).toFixed(2)}`);
  }
  console.log(w(name, 12), row.join('   '));
}

/* Generador de grises para texto secundario y terciario */
console.log('');
console.log('grises (contraste contra cada superficie):');
for (const l of [36, 38, 40, 41, 42, 43, 44, 45, 46, 48]) {
  const c = hsl(220, 6, l);
  console.log(w(`${l}% ${hex(c)}`, 16),
    'surface', ratio(c, surface).toFixed(2),
    '| inset', ratio(c, inset).toFixed(2),
    '| raised', ratio(c, raised).toFixed(2),
    '| canvas', ratio(c, canvas).toFixed(2));
}

/* Los cuatro acentos de categoria con la MISMA luminancia WCAG: asi se leen
 * como familia y no como arcoiris. En vez de ajustar a ojo, se resuelve el
 * lightness HSL que produce la luminancia objetivo. */
console.log('');
console.log('acento de categoria resuelto a luminancia WCAG objetivo:');
const TARGET_L = 0.1460;
for (const T of [0.1400, TARGET_L, 0.1520]) {
  const row = [];
  for (const [name, [h, s]] of Object.entries(HUES)) {
    let lo = 5, hi = 95, out = null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const c = hsl(h, s, mid);
      if (lum(c) < T) lo = mid; else hi = mid;
      out = mid;
    }
    const c = hsl(h, s, out);
    row.push(`${name} ${hex(c)} L=${lum(c).toFixed(4)} r=${ratio(c, surface).toFixed(2)}`);
  }
  console.log('  L=' + T + '  ' + row.join('  |  '));
}

/* family check: the four category accents share luminance -> read as a family */
console.log('');
console.log('luminancia relativa de los 4 acentos (deben ser parecidos):');
for (const n of ['servicios', 'personales', 'movimientos', 'extras']) {
  const c = parse(LIGHT['--cat-' + n]);
  console.log(w('--cat-' + n, 20), hex(c), 'L=' + lum(c).toFixed(4), 'ratio=' + ratio(c, surface).toFixed(2));
}