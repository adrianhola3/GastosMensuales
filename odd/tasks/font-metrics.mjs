/* Metricas reales de Inter vs la pila actual.
 *
 * El objetivo es una `@font-face` de respaldo con `size-adjust`,
 * `ascent-override`, `descent-override` y `line-gap-override` calibrados, para
 * que el swap de Inter no mueva el layout. Esos cuatro numeros NO se inventan:
 * se miden en el navegador con `TextMetrics.fontBoundingBox*`.
 *
 * `size-adjust` escala todos los contornos y metricas del respaldo. Para que el
 * ancho medio de avance coincida con el de Inter hace falta
 * size-adjust = ancho(Inter) / ancho(respaldo). Y los overrides de asension,
 * descension y line-gap llevan la altura de linea al mismo lugar.
 */
import { openPage, HIDE_ROLE_MODAL } from './cdp.mjs';

const FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files/inter-latin-wght-normal.woff2';
const FONT_URL_EXT = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files/inter-latin-ext-wght-normal.woff2';

const SETUP = `
(async () => {
  const s = document.createElement('style');
  s.textContent = \`
    @font-face {
      font-family: 'Inter Medida';
      font-style: normal;
      font-display: block;
      font-weight: 100 900;
      src: url('${FONT_URL}') format('woff2-variations');
    }
  \`;
  document.head.appendChild(s);

  // font-display: block hace que document.fonts.load espere de verdad.
  const cargadas = [];
  for (const w of [400, 500, 600, 700]) {
    try { await document.fonts.load(w + ' 100px "Inter Medida"', 'Servicios del hog S/ 12,345.67'); cargadas.push(w); }
    catch (e) { cargadas.push('ERR:' + w); }
  }
  try { await document.fonts.load('100px "Inter Medida"', '\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00f1\\u00bf\\u00a1'); } catch (e) {}

  const M = 1000; // px de referencia: las proporciones no dependen del tamano
  const textos = [
    'Servicios del hog S/ 12,345.67',
    'Detalle mensual Consolidado multimes',
    'Gastos Pagados Pendiente 0.0% Pagado',
    'Ingresos y abonos Presupuesto de gastos',
  ];
  const pesos = [400, 500, 600, 700];

  const medir = (familia, peso) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = peso + ' ' + M + 'px ' + familia;
    const out = {};
    let ancho = 0;
    for (const t of textos) ancho += c.measureText(t).width;
    const mt = c.measureText('SxgHÁ');
    out.ancho = Number(ancho.toFixed(3));
    out.advancePorChar = Number((ancho / (textos.join('').length)).toFixed(4));
    out.ascent = Number((mt.fontBoundingBoxAscent ?? 0).toFixed(3));
    out.descent = Number((mt.fontBoundingBoxDescent ?? 0).toFixed(3));
    // alto de la caja de linea tal como la calcula el navegador
    out.emCaja = out.ascent + out.descent;
    return out;
  };

  const inter = {}, respaldo = {};
  for (const w of pesos) {
    inter[w] = medir('"Inter Medida"', w);
    respaldo[w] = medir('system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', w);
  }

  const calc = {};
  for (const w of pesos) {
    calc[w] = {
      sizeAdjust: Number((inter[w].ancho / respaldo[w].ancho * 100).toFixed(2)),
      ascentOverride: Number((inter[w].ascent / M * 100).toFixed(2)),
      descentOverride: Number((inter[w].descent / M * 100).toFixed(2)),
      lineGapOverride: '0',
      interAncho: inter[w].ancho, respaldoAncho: respaldo[w].ancho,
      interAscent: inter[w].ascent, respaldoAscent: respaldo[w].ascent,
      interDescent: inter[w].descent, respaldoDescent: respaldo[w].descent,
    };
  }

  // Inter es mas ancha que el respaldo: el factor ponderado de los 4 pesos es el
  // que se usa, porque la pagina usa 400/600 sobre todo.
  const pond = (k) => (calc[400][k] * 0.45 + calc[500][k] * 0.1 + calc[600][k] * 0.3 + calc[700][k] * 0.15);
  const combinado = {
    sizeAdjust: Number(pond('sizeAdjust').toFixed(2)),
    ascentOverride: Number(pond('ascentOverride').toFixed(2)),
    descentOverride: Number(pond('descentOverride').toFixed(2)),
  };

  return {
    cargadas, pesos, inter, respaldo, calc, combinado,
    interDisponible: document.fonts.check('16px "Inter Medida"'),
    checkEspanol: document.fonts.check('16px "Inter Medida"', '\\u00f1\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00bf\\u00a1'),
    checkEmoji: document.fonts.check('16px "Inter Medida"', '\\u{1F600}'),
  };
})()
`;

const page = await openPage({ width: 1440, height: 900 });
let out;
try {
  await page.goto('file:///C:/Users/User/Desktop/Web%20de%20Gastos%20Mensuales/index.html', 5000);
  await page.page.eval(HIDE_ROLE_MODAL);
  out = await page.page.eval(SETUP, { awaitPromise: true });
  console.log('fuente pedida:', FONT_URL);
  console.log('fuente pedida ext:', FONT_URL_EXT);
  console.log(JSON.stringify(out, null, 1));
  console.log('\n--- DERIVADOS PARA EL @font-face DE RESPALDO ---');
  console.log('size-adjust: ' + out.combinado.sizeAdjust + '%');
  console.log('ascent-override: ' + out.combinado.ascentOverride + '%');
  console.log('descent-override: ' + out.combinado.descentOverride + '%');
  console.log('line-gap-override: 0%');
  console.log('fallos de red:', JSON.stringify(page.failedRequests));
  console.log('errores de consola:', JSON.stringify(page.consoleErrors));
} finally {
  await page.close();
}
