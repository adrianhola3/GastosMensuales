/* reglas.mjs - Comprueba, en la página real, las reglas que el rediseño se
 *.auto，这一次 se impone por ESTILO y no por opinión.
 *
 * POR QUÉ ESTO EXISTE Y POR QUÉ NO BASTA CON MIRAR LAS CAPTURAS
 * --------------------------------------------------------------------------
 * Una captura demuestra que algo SE VE bien. No demuestra que no haya un
 * `box-shadow` en la fila 2.000 de una hoja que nadie va a leer entera. Estas
 * reglas son mecánicas —cero sombras, cero degradados, cero emojis, un solo
 * color de estado— y las mecánicas se comprueban con un `querySelectorAll`,
 * no con los ojos.
 *
 * Y LO QUE NO SE PUEDE COMPROBAR AQUÍ, DICHO DE UNA
 * --------------------------------------------------------------------------
 * Que el texto se lea bien y que la jerarquía sea la correcta: eso lo decide
 * alguien mirando `diseno-<ancho>.png`. Esta hoja no lo sustituye.
 *
 *   node odd\tasks\reglas.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox } from './sandbox.mjs';

const ROOT = path.join(process.cwd(), 'css');
const archivos = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'));

const falla = [];
const pasa = [];
const check = (nombre, ok, detalle = '') => (ok ? pasa : falla).push(nombre + (detalle ? ' — ' + detalle : ''));

/* ---------------------------------------------------------------- 1. STATIC */
for (const f of archivos) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // Los comentarios hablan de sombras y degradados todo el tiempo. Solo cuentan
  // los que están en una DECLARACIÓN.
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lineas = codigo.split('\n');

  const props = (re) => lineas
    .map((l, i) => ({ n: i + 1, l }))
    .filter(x => re.test(x.l));

  for (const { n, l } of props(/\bbox-shadow\s*:/)) {
    falla.push(`${f}:${n} box-shadow DECLARADO — "${l.trim()}"`);
  }
  for (const { n, l } of props(/\b(linear|radial|conic)-gradient\s*\(/)) {
    falla.push(`${f}:${n} degradado DECLARADO — "${l.trim()}"`);
  }
  for (const { n, l } of props(/[←-⯿☀-➿]/u)) {
    falla.push(`${f}:${n} glifo fuera de latin-1 (posible emoji) — "${l.trim().slice(0, 60)}"`);
  }
  for (const { n, l } of props(/^\s*h[1-6]\s*[,{]|^\s*p\s*[,{]|^\s*button\s*[,{]|^\s*input\s*[,{]|^\s*select\s*[,{]/)) {
    falla.push(`${f}:${n} selector de TAG desnudo — "${l.trim()}"`);
  }
}

/* El tema oscuro tiene que estar gone del código, no "puesto en none". */
for (const f of archivos) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/theme-dark|prefers-color-scheme/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    falla.push(`${f}: sigue habiendo tema oscuro declarado`);
  }
}

/* La regla de permisos tiene que seguir siendo la misma, literal. */
const modales = fs.readFileSync(path.join(ROOT, 'modales.css'), 'utf8');
check('body.read-only-mode .admin-action-btn { display: none !important }',
  /body\.read-only-mode \.admin-action-btn\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(modales));

/* El factor de zoom tiene que multiplicar los TAMAÑOS, no solo el espaciado. */
const tokens = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
const pasos = [...tokens.matchAll(/--text-(?:2xs|xs|sm|md|base|lg|xl|2xl|3xl|hero):\s*([^;]+);/g)];
check('la escala de texto multiplica por --text-zoom-factor',
  pasos.length >= 10 && pasos.every(m => /var\(--text-zoom-factor\)/.test(m[1])),
  pasos.filter(m => !/var\(--text-zoom-factor\)/.test(m[1])).map(m => m[0]).join(', '));

/* Una sola familia tipográfica: display, body y mono tienen que ser la misma
   primera entrada. */
const familias = [...tokens.matchAll(/--font-(?:display|body|mono):\s*([^;]+);/g)]
  .map(m => m[1].trim().split(',')[0].trim());
check('una sola familia tipográfica en las tres pilas',
  familias.length === 3 && familias.every(f => f === "'IBM Plex Sans'"),
  familias.join(' | '));

/* Los tokens que charts.js lee tienen que ser LITERALES: readToken devuelve el
   valor escrito, y un `var(...)` ahí llega al canvas como texto. */
const leenCharts = ['--accent-emerald', '--accent-rose', '--text-muted', '--text-main',
  '--hairline-strong', '--bg-surface', '--bg-inset', '--bg-card',
  '--cat-servicios', '--cat-personales', '--cat-extras'];
for (const t of leenCharts) {
  const m = [...tokens.matchAll(new RegExp('^\\s*' + t + ':\\s*([^;]+);', 'gm'))];
  check(`token ${t} es literal (charts.js lo pinta en un canvas)`,
    m.length > 0 && !m.every(x => /var\(/.test(x[1])),
    m.map(x => x[1].trim()).join(' | '));
}

/* ---------------------------------------------------------------- 2. RUNTIME */
const sb = await launchSandbox({ fixture: 'baseline', width: 1440, height: 900 });
let runtime = {};
try {
  runtime = await sb.eval(`(() => {
    const g = id => document.getElementById(id);
    const cs = el => getComputedStyle(el);
    const nodosConSombra = [...document.querySelectorAll('*')]
      .filter(el => cs(el).boxShadow !== 'none')
      .map(el => el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]);
    const conDegradado = [...document.querySelectorAll('*')]
      .filter(el => cs(el).backgroundImage.includes('gradient'))
      .map(el => el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]);
    return {
      sombras: [...new Set(nodosConSombra)],
      degradados: [...new Set(conDegradado)],
      emojis: (document.body.innerText.match(/[←-⯿☀-➿]/gu) || []),
      fuente: cs(document.body).fontFamily.split(',')[0],
      tabularCifra: cs(g('monthBalanceNeto')).fontVariantNumeric,
      tabularHeredado: cs(document.body).fontVariantNumeric,
      heroPx: cs(g('pendingSummaryLabel').children[1]).fontSize,
      heroColor: cs(g('pendingSummaryLabel').children[1]).color,
      cubiertoColor: cs(g('pendingSummaryLabel').children[0]).color,
      balanceDuplicado: !!g('topbarBalanceValue'),
      barraRelleno: cs(g('paidBarFill')).backgroundColor,
      barraPista: cs(g('paidBarFill').parentElement).backgroundColor,
      railW: Math.round(document.querySelector('.app-sidebar').getBoundingClientRect().width),
      seccionesW: Math.round(document.querySelector('.section-rail').getBoundingClientRect().width),
      contenidoW: Math.round(document.querySelector('.app-main-area').getBoundingClientRect().width),
      scrollbar: window.innerWidth - document.documentElement.clientWidth,
      /* Las tres cosas que el rediseño promete y que no se ven en una captura. */
      primeraFilaY: (() => { const f = document.querySelector('.expense-card-item');
        return f ? Math.round(f.getBoundingClientRect().y) : null; })(),
      filasVisibles: (() => { const f = document.querySelector('.expense-card-item');
        if (!f) return null;
        const r = f.getBoundingClientRect();
        return Math.floor((900 - r.y) / r.height); })(),
      anchoBarra: Math.round((document.querySelector('.status-track') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
      accentosDeCategoria: ['servicios','personales','movimientos','extras'].map(k => {
        const n = document.querySelector('[data-accent="' + k + '"]');
        return k + '=' + (n ? cs(n).backgroundColor : '?');
      }),
      textoEnLinea: cs(g('monthBalanceNeto')).color,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);

  check('cero sombras computadas en la página', runtime.sombras.length === 0, runtime.sombras.join(', '));
  check('cero degradados computados en la página', runtime.degradados.length === 0, runtime.degradados.join(', '));
  check('cero emojis en el texto renderizado', runtime.emojis.length === 0, runtime.emojis.join(' '));
  check('la familia es IBM Plex Sans', /^['"]IBM Plex Sans['"]/.test(runtime.fuente), runtime.fuente);
  check('las cifras de dinero son tabulares', runtime.tabularCifra.includes('tabular') && runtime.tabularHeredado.includes('tabular'));
  check('la cifra protagonista domina', parseFloat(runtime.heroPx) >= 36, runtime.heroPx);
  check('la cifra protagonista lleva el color del estado pendiente',
    runtime.heroColor === 'rgb(138, 90, 27)', runtime.heroColor + ' (esperado #8A5A1B)');
  check('el extremo "Cubierto" lleva el color del estado cubierto',
    runtime.cubiertoColor === 'rgb(47, 107, 79)', runtime.cubiertoColor + ' (esperado #2F6B4F)');
  check('el Balance duplicado en el topbar ya no está', runtime.balanceDuplicado === false);
  check('la pista de la barra es visible (no es un 0% invisible)',
    runtime.barraPista !== runtime.barraRelleno, runtime.barraPista + ' vs ' + runtime.barraRelleno);
  check('la barra se rellena con el color de "cubierto"', runtime.barraRelleno === 'rgb(47, 107, 79)', runtime.barraRelleno);
  check('el rail se angostó', runtime.railW === 196, runtime.railW + 'px');
  check('la columna de secciones se angostó', runtime.seccionesW === 152, runtime.seccionesW + 'px');
  /* El contenido no es "el resto": es el resto MENOS la barra de scroll. Sin
     descontarla, la comprobación compara 1092 contra 1077 y falla siempre,
     y lo que uno aprende de eso es a ignorar el número. */
  check('las dos columnas se llevan el ancho que se les pidió',
    runtime.contenidoW === 1440 - runtime.railW - runtime.seccionesW - runtime.scrollbar,
    runtime.contenidoW + 'px = 1440 - ' + runtime.railW + ' - ' + runtime.seccionesW + ' - ' + runtime.scrollbar + ' (scrollbar)');
  check('las categorías ya no llevan color de superficie',
    new Set(runtime.accentosDeCategoria.map(s => s.split('=')[1])).size === 1,
    runtime.accentosDeCategoria.join(', '));
  check('sin scroll horizontal', runtime.overflow <= 2, runtime.overflow + 'px');

  /* Estas tres son la prueba de que el rediseño no costó altura. La referencia
     son los números MEDIDOS de la pantalla anterior a 1440x900: primera fila de
     gasto en y=315 y 12 filas completas por pantalla. El rediseño tiene que
     estar en esos dos números o mejor; quedarse cerca y llamarlo "casi igual"
     es agregar 30px de cromo delante de cada lectura. */
  check('la primera fila de gasto sube o se mantiene (antes: y=315)',
    runtime.primeraFilaY <= 315, 'y=' + runtime.primeraFilaY);
  check('entran 12 filas o más por pantalla (antes: 12)',
    runtime.filasVisibles >= 12, runtime.filasVisibles + ' filas');
  check('la barra de avance ocupa el ancho del contenido, no un tercio',
    runtime.anchoBarra >= runtime.contenidoW * 0.6,
    Math.round(runtime.anchoBarra) + 'px de ' + runtime.contenidoW + 'px');

  /* --- el modo de solo lectura, que es un contrato y no un detalle --- */
  const ro = await sb.eval(`(() => {
    document.body.classList.add('read-only-mode');
    const b = [...document.querySelectorAll('.admin-action-btn')];
    const visibles = b.filter(x => { const s = getComputedStyle(x);
      return s.display !== 'none' && s.visibility !== 'hidden' && x.getClientRects().length > 0; });
    const r = { total: b.length, visibles: visibles.length,
                ejemplo: visibles[0] ? (visibles[0].id || visibles[0].className) : null };
    document.body.classList.remove('read-only-mode');
    return r;
  })()`);
  check('modo lector: los .admin-action-btn se ocultan TODOS',
    ro.total > 0 && ro.visibles === 0, ro.visibles + '/' + ro.total + ' visibles');

  /* --- el foco se ve: un anillo, y es de tinta --- */
  const foco = await sb.eval(`(() => {
    const b = document.getElementById('btnOpenNotesModal');
    b.focus();
    const s = getComputedStyle(b);
    return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, outlineColor: s.outlineColor };
  })()`);
  check('el foco tiene anillo visible', parseFloat(foco.outlineWidth) >= 2 && foco.outlineStyle !== 'none',
    JSON.stringify(foco));
} finally {
  await sb.close();
}

/* ---------------------------------------------------------------- 3. SALIDA */
console.log('\n=== reglas del rediseño ===\n');
for (const p of pasa) console.log('  OK    ' + p);
if (falla.length) {
  console.log('');
  for (const f of falla) console.log('  FALLA ' + f);
}
console.log('\n  ' + pasa.length + ' reglas cumplen · ' + falla.length + ' no cumplen');
console.log('\nRUNTIME\n' + JSON.stringify(runtime, null, 1));
process.exit(falla.length ? 1 : 0);