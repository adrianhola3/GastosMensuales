/* diag-barras.mjs - MEDICION TEMPORAL. No es parte del arnés.
 *
 * Verifica (o refuta) las cifras del comentario de `js/charts.js` sobre el grosor
 * de la barra de `#chartTrendBar`. NO edita ningún archivo de la app: el "sin
 * tope" se hace en memoria del navegador, destruir el chart y recrearlo desde el
 * MISMO objeto de configuración con `maxBarThickness` borrado.
 */

import { launchSandbox } from './sandbox.mjs';

/* Lectura del estado real del chart. Cifras sin truncar: el comentario trae
 * un decimal, así que hay que devolver más precisión que la que se afirma. */
const MEDIR = `(() => {
  const c = document.getElementById('chartTrendBar');
  if (!c) return { ok: false, reason: 'no existe #chartTrendBar' };
  const ch = Chart.getChart('chartTrendBar');
  if (!ch) return { ok: false, reason: 'no hay instancia de Chart' };
  const m0 = ch.getDatasetMeta(0);
  const m1 = ch.getDatasetMeta(1);
  const ca = ch.chartArea;
  const r = c.getBoundingClientRect();
  return {
    ok: true,
    chartjs: Chart.version,
    canvasAttr: { w: c.width, h: c.height },
    canvasCss: { w: +r.width.toFixed(3), h: +r.height.toFixed(3) },
    chartArea: ca ? { width: +ca.width.toFixed(3), height: +ca.height.toFixed(3) } : null,
    nLabels: ch.data.labels.length,
    labels: ch.data.labels.slice(0, 4),
    maxBarThicknessCrudo: (function () {
      const raw = (ch.config && ch.config._config) ? ch.config._config : ch.config;
      const ds = raw && raw.data && raw.data.datasets;
      return Array.isArray(ds) ? ds.map(d =>
        Object.prototype.hasOwnProperty.call(d, 'maxBarThickness') ? d.maxBarThickness : null) : 'n/d';
    })(),
    barras: {
      serie0: m0 && m0.data ? m0.data.map(d => +d.width.toFixed(3)) : null,
      serie1: m1 && m1.data ? m1.data.map(d => +d.width.toFixed(3)) : null,
    },
    viewport: {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      pedido: window.__pedido === undefined ? null : window.__pedido,
    },
  };
})()`;

/* El "sin tope": se saca la clave del dataset crudo y se reconstruye el chart.
 * `chart.config` es un `Config` de Chart.js que hace proxy a `_config`, así que
 * el objeto de datasets es el MISMO que recibió el `new Chart(...)` original. */
const SIN_TOPE = `(() => {
  const ch = Chart.getChart('chartTrendBar');
  if (!ch) return { ok: false, reason: 'no hay instancia de Chart' };
  try {
    const raw = ch.config && ch.config._config ? ch.config._config : ch.config;
    window.__rawCfg = raw;
    window.__capGuardado = raw.data.datasets.map(d =>
      Object.prototype.hasOwnProperty.call(d, 'maxBarThickness') ? d.maxBarThickness : null);
    raw.data.datasets.forEach(d => { delete d.maxBarThickness; });
if (ch) ch.destroy();
    window.__sinTope = new Chart(document.getElementById('chartTrendBar'), raw);
    return { ok: true, capGuardado: window.__capGuardado };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e) };
  }
})()`;

const CELLS = [
  { fixture: 'baseline', ancho: 1440, alto: 900 },
  { fixture: 'unSoloMes', ancho: 1440, alto: 900 },
  { fixture: 'periodos24', ancho: 1440, alto: 900 },
  { fixture: 'baseline', ancho: 390, alto: 844 },
  { fixture: 'unSoloMes', ancho: 390, alto: 844 },
  { fixture: 'periodos24', ancho: 390, alto: 844 },
];

/* TRAMPA 2 de movil.mjs: la fuente viene de CDN. */
async function esperarFuente(sb) {
  const listo = await sb.eval(
    'document.fonts.ready.then(function(){ return document.fonts.status; })',
    { awaitPromise: true });
  await new Promise(z => setTimeout(z, 800));
  return listo;
}

async function asentar(sb) {
  await sb.pump(4);
  await new Promise(z => setTimeout(z, 1400));
  await sb.pump(2);
}

const salida = [];

for (const celda of CELLS) {
  const etiqueta = `${celda.fixture}@${celda.ancho}`;
  const fila = { etiqueta, fixture: celda.fixture, anchoPedido: celda.ancho, conTope: null, sinTope: null };
  let sb = null;
  try {
    sb = await launchSandbox({ fixture: celda.fixture, width: celda.ancho, height: celda.alto });
    await sb.markBootBaseline();
    fila.fuente = await esperarFuente(sb);

    /* El gráfico está en la vista de consolidado (tema-claro.mjs:115). */
    await sb.eval(`window.__pedido = ${celda.ancho}; 1`);
    await sb.eval("document.getElementById('btnNavPanel').click(); 1");
    await asentar(sb);

    fila.conTope = await sb.eval(MEDIR);

    /* Segunda lectura sin tocar nada: si el ancho se mueve entre dos lecturas
     * separadas, hay animación en curso y la cifra no es estable. */
    await new Promise(z => setTimeout(z, 900));
    await sb.pump(2);
    const repeticion = await sb.eval(MEDIR);
    fila.estabilidad = {
      serie0: repeticion.barras.serie0,
      iguales: JSON.stringify(fila.conTope.barras.serie0) ===
        JSON.stringify(repeticion.barras.serie0),
    };

    fila.parcheo = await sb.eval(SIN_TOPE);
    await asentar(sb);
    fila.sinTope = await sb.eval(MEDIR);

    fila.consola = sb.consoleErrors.slice(0, 4);
    fila.excepciones = sb.exceptions.slice(0, 4);
  } catch (e) {
    fila.error = String(e && e.message ? e.message : e).split('\n')[0];
  } finally {
    if (sb) await sb.close();
  }
  salida.push(fila);
}

console.log(JSON.stringify(salida, null, 1));

/* ------------------------------------------------------------------
 * BARRIDO DEL TOPE: ¿desde cuántos períodos deja de morder `maxBarThickness: 36`?
 * Se recorta el conjunto de etiquetas del chart YA creado, en memoria, y se
 * reconstruye el chart una vez con el tope y otra sin él. Nada en disco.
 * ------------------------------------------------------------------ */
const BARRIDO = `(() => {
  const base = window.__rawCfg;
  if (!base) return { ok: false, reason: 'sin configuracion base' };
  const canvas = document.getElementById('chartTrendBar');
  const NS = [1, 2, 5, 8, 9, 10, 11, 12, 24];
  const out = [];
  for (const N of NS) {
    const ds = base.data.datasets.map(d => ({
      label: d.label, data: d.data.slice(0, N), backgroundColor: d.backgroundColor,
      borderRadius: d.borderRadius, borderSkipped: d.borderSkipped }));
    const etiquetas = base.data.labels.slice(0, N);
    const arma = cap => ({
      type: 'bar', plugins: base.plugins,
      data: { labels: etiquetas,
              datasets: cap ? ds.map(d => Object.assign({}, d, { maxBarThickness: cap }))
                            : ds },
      options: base.options,
    });
    const previo = Chart.getChart('chartTrendBar');
    if (previo) previo.destroy();
    const conTope = new Chart(canvas, arma(36));
    const wConTope = +conTope.getDatasetMeta(0).data[0].width.toFixed(3);
    const area = +conTope.chartArea.width.toFixed(3);
    conTope.destroy();
    const sinTope = new Chart(canvas, arma(0));
    const wSinTope = +sinTope.getDatasetMeta(0).data[0].width.toFixed(3);
    sinTope.destroy();
    out.push({ N, chartArea: area, conTope: wConTope, sinTope: wSinTope,
               elTopeMorde: wSinTope > wConTope + 0.001 });
  }
  return { ok: true, filas: out };
})()`;

const barrido = [];
{
  let sb = null;
  try {
    sb = await launchSandbox({ fixture: 'periodos24', width: 1440, height: 900 });
    await sb.markBootBaseline();
    await esperarFuente(sb);
    await sb.eval("document.getElementById('btnNavPanel').click(); 1");
    await asentar(sb);
    await sb.eval(SIN_TOPE);
    barrido.push(await sb.eval(BARRIDO));
  } catch (e) {
    barrido.push({ error: String(e && e.message ? e.message : e).split('\n')[0] });
  } finally {
    if (sb) await sb.close();
  }
}
console.log(JSON.stringify(barrido, null, 1));