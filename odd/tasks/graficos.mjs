/* graficos.mjs - Los tres cambios de `charts.js`/`app.js`, ASERTADOS en el navegador.
 *
 * POR QUÉ ESTE ARCHIVO Y NO UNO MÁS
 * ---------------------------------
 * Los tres cambios que entran en esta ronda están escritos en el árbol de trabajo
 * y NO tienen ni una sola aserción en todo el repo: ni `reglas.mjs`, ni `movil.mjs`,
 * ni `crud-suite.mjs`, ni `store-fix-suite.mjs` tocan un canvas, leen una opción de
 * Chart.js ni miden el ancho de una barra. Los tres se "verifican" abriendo la app y
 * mirándola, que es exactamente el método que deja pasar una reversión:
 *
 *   1. La dona del consolidado pasó de PLANIFICADO a REALIZADO (`catData` lee los
 *      `*Real` de `calculateGlobalTotals()`, `charts.js:345`).
 *   2. El tipo de movimiento del feed perdió el color de estado (`app.js:1076`).
 *   3. Las dos series de `#chartTrendBar` llevan `maxBarThickness: 36`
 *      (`charts.js:240` y `charts.js:248`).
 *
 * POR QUÉ ESTE ARCHIVO ASERTA Y NO REPORTA
 * ----------------------------------------
 * Un arnés que imprime y sale con 0 no es un arnés: es un parte. Si alguien revierte
 * el punto 1, la dona vuelve a mostrar plata que nadie pagó, el rótulo vuelve a decir
 * "Total estimado", el informe sale igual de largo y el comando devuelve 0. Ese hueco
 * es el que motivó el WARNING de la revisión nativa sobre el arnés anterior, y por eso
 * acá el código de salida es el veredicto:
 *   0  todo PASS   ·   1  algún FAIL   ·   2  la infraestructura no permitió ni
 *   pasar ni fallar (no hay nada medido, o no todo).
 * Los tres estados son distintos a propósito. "No medible" NO es "correcto": sobre
 * cero categorías, "la barra no pasa de 36px" es cierto por falta de barras.
 *
 * LA PRUEBA DE QUE ESTE ARHÉS MUERDE
 * -----------------------------------
 * Hay UNA aserción que decide si todo lo demás sirve: **D3**. Con una fixture en la
 * que estimado ≠ real, exige que el total del centro de la dona sea la suma de los
 * `montoReal` Y que sea DISTINTO de la suma de los `montoEstimados`. El código viejo
 * —el que leía `globalServicios`/`globalPersonales`/`globalExtras`— pinta el estimado
 * en el centro, así que D3 falla contra él. Las demás aserciones de este archivo
 * pueden ser cierta con el cambio revertido; D3 no puede.
 *
 * EL TEXTO DE LA DONA NO ESTÁ EN EL DOM, Y POR QUÉ ESO NO ES UN PROBLEMA
 * ----------------------------------------------------------------------
 * El plugin `gastos-total-centro` (`charts.js:98-122`) pinta con `ctx.fillText`:
 * escribe en el lienzo, no en un nodo. No hay `<div>` que leer y buscarlo sería
 * inventarse un contrato que la app no tiene. Este arnés lee DOS cosas distintas y
 * las cruza:
 *   · la opción que recibió el plugin (`chart.options.plugins['gastos-total-centro']`),
 *     que es lo que la app le pasó;
 *   · lo que el plugin PINTA de verdad, capturado parcheando
 *     `CanvasRenderingContext2D.prototype.fillText` alrededor de un `chart.render()`.
 * La segunda es la importante: la primera se puede herpesar con una reasignación que
 * no llegue nunca al lienzo, y el arnés no se entera. Leer las dos es lo que separa
 * "la opción dice" de "el usuario lo ve".
 *
 * LO QUE NO SE PUEDE MEDIR, Y POR QUÉ SE DICE EN VOZ ALTA
 * ---------------------------------------------------------
 * Nada de lo que este arnés afirma necesita píxeles. Las cifras de ancho, de color y
 * de total salen todas de la API del navegador (getBoundingClientRect, getComputedStyle,
 * la metadata de Chart.js) o del texto que el plugin pinta. Lo único que NO se
 * comprueba es el aspecto: que un anillo se vea "bien" no es una afirmación, es una
 * opinión, y un arnés que la convierte en PASS se está mintiendo. Las capturas PNG
 * quedan como evidencia para el ojo, nunca como veredicto.
 *
 * LAS TRAMPAS DE ESTE ENTORNO, POR QUÉ ESTÁN ESCRITAS ADENTRO
 * =============================================================
 *
 * 1. IBM PLEX SANS VIENE DE CDN.
 *    Sin `await document.fonts.ready` + una pausa, dos corridas dan medidas distintas
 *    y la diferencia parece una regresión. Se espera SIEMPRE, y si después de esperar
 *    la fuente no está `loaded`, la celda es INFRA (2): con la fuente de reserva los
 *    anchos de texto son otros y todas las cifras de esta página se invalidan.
 *
 * 2. UN `reload()` DESARMA LA FIXTURE.
 *    `sandbox.mjs` inyecta su semilla con `Page.addScriptToEvaluateOnNewDocument`
 *    (línea 814) y esa semilla corre en CADA navegación: escribe `localStorage` con la
 *    fixture original antes de que `store.js` parsee (línea 467). Por eso el camino
 *    obvio —escribir el estado en localStorage y recargar— NO existe acá: el estado
 *    nuevo se pierde en el mismo viaje. MEDIDO: sembrar `montoReal: null` en los 12
 *    ítems de `produccion4digitos`, recargar y contar cubiertos devuelve 7, no 0.
 *    La celda "todo pendiente" muta `financialStore.data` EN MEMORIA y vuelve a
 *    pintar; por eso está marcada como estado derivado y no como fixture.
 *
 * 3. UNA LLAVE `}` DE MÁS EN UN CSS NO DA ERROR.
 *    El navegador cierra el bloque sobrante y se come todo lo que viene después. Es
 *    el modo de fallo más caro de un CSS partido en varios archivos, y acá importa
 *    más que de costumbre: los colores que este arnés compara salen de tokens de
 *    `css/tokens.css`. Si esa hoja deja de leerse entera, `--accent-emerald` puede
 *    valer cualquier cosa y las comparaciones de la sección del feed pasan por
 *    casualidad. Se comprueba ANTES de capturar y es un FAIL acumulado, no un corte.
 *
 * 4. EL CONTRASTE DEL TOPE DE BARRA REARMA EL CHART.
 *    Para medir "qué pasa si `maxBarThickness` no estuviera", hay que construir un
 *    chart nuevo SIN el tope. Si ese chart queda vivo, la segunda lectura del chart
 *    bueno mide el counterfactual y el arnés pasa por dos comprobaciones la misma
 *    cosa. El contrafactual se destruye y se llama a `window.renderGlobalCharts()`
 *    para que el estado real vuelva a ser el de la app antes de seguir.
 *
 * POR QUÉ `launchSandbox` Y NO `openPage`
 * ---------------------------------------
 * `openPage` (cdp.mjs) se conecta al navegador del usuario y abre una ventana REAL Y
 * VISIBLE. `launchSandbox` lanza su propio navegador headless, tira el perfil después
 * y siembra la fixture sintética que se le pida.
 *
 *   node odd\tasks\graficos.mjs                 (las seis celdas, con capturas)
 *   node odd\tasks\graficos.mjs --sin-captura   (solo medidas y aserciones)
 *
 * `--sin-captura` suprime SOLO los PNG. Nunca las medidas ni las aserciones: una
 * corrida sin capturas que no verifica nada es un arnés apagado que devuelve 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchSandbox } from './sandbox.mjs';

/* La raíz se resuelve desde la ruta del propio módulo y no desde `process.cwd()`:
 * el arnés tiene que dar el mismo veredicto se lo llame desde donde se lo llame, y
 * un `path.join(process.cwd(), 'css')` devuelve un directorio inexistente —y un
 * balance de llaves vacío, o sea un PASS— sin dar ni un error. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIR = path.join(HERE, 'capturas');
const ROOT_CSS = path.join(ROOT, 'css');

const args = process.argv.slice(2);
const SIN_CAPTURA = args.includes('--sin-captura');

/* ------------------------------------------------------------------
 * EL BLOQUE DE MEDIDAS
 * ------------------------------------------------------------------
 * Todo se mide; nada se lee del código fuente de la app ni del atributo de una
 * regla CSS. El atributo `style="font-weight: 600;"` que escribe `app.js:1076` se
 * lee, pero SOLO como dato acompañante: la afirmación es sobre `getComputedStyle`,
 * porque el color puede venir de una hoja y leer el atributo no lo detectaría.
 * ------------------------------------------------------------------ */

/* La suma del PLANIFICADO y la del REALIZADO se recalculan acá, recorriendo los
 * ítems crudos del store, y NO llamando a `calculateGlobalTotals()`: si el arnés
 * preguntara al store y comparara al store consigo mismo, D3 probaría que el store
 * es consistente, no que la dona muestra lo correcto. El predicado reproducido es
 * `estaCubierto` (store.js:555-557) a propósito, escrito aparte para que se pueda
 * ver en el informe. */
const MEDIR_DONA = `(() => {
  const canvas = document.getElementById('chartCategoryDonut');
  if (!canvas) return { ok: false, motivo: 'no existe #chartCategoryDonut' };
  const ch = Chart.getChart('chartCategoryDonut');
  if (!ch) return { ok: false, motivo: 'no hay instancia de Chart en el lienzo' };
  const store = window.financialStore;
  if (!store) return { ok: false, motivo: 'no hay window.financialStore' };

  /* El estimado POR CATEGORÍA, no solo el total: el CSV exporta una columna por
     categoría y sin este desglose "el CSV sigue exportando el planificado" no se
     puede comprobar —comparar la columna SERVICIOS contra el total de las tres sería
     comparar dos cosas distintas y obtener un fallo que no significa nada. */
  let sumaEstimado = 0, sumaReal = 0, items = 0, cubiertos = 0;
  const estPorCat = [0, 0, 0];
  const realPorCat = [0, 0, 0];
  for (const id of store.data.mesesOrden) {
    const m = store.data.meses[id];
    if (!m) continue;
    const listas = [
      [...m.servicios.fijos, ...m.servicios.variables],
      [...m.personales.fijos, ...m.personales.variables],
      [...m.extras],
    ];
    listas.forEach((lista, cat) => {
      for (const it of lista) {
        items++;
        const est = Number(it.montoEstimado) || 0;
        sumaEstimado += est;
        estPorCat[cat] += est;
        if (it.montoReal !== null && it.montoReal !== undefined) {
          const real = Number(it.montoReal) || 0;
          cubiertos++;
          sumaReal += real;
          realPorCat[cat] += real;
        }
      }
    });
  }

  const opCentro = ch.options.plugins['gastos-total-centro'] || {};
  const opVacio = ch.options.plugins['gastos-sin-datos'] || {};
  const meta = ch.getDatasetMeta(0);
  const primerArco = meta && meta.data && meta.data.length ? meta.data[0] : null;
  const seccion = canvas.closest('.chart-section');
  const root = getComputedStyle(document.documentElement);
  const token = n => root.getPropertyValue(n).trim();

  const t = store.calculateGlobalTotals();
  return {
    ok: true,
    chartjs: Chart.version,
    /* Lo que Chart.js tiene EN EL ANILLO, no lo que la app quiso ponerle. */
    datasetData: ch.data.datasets[0].data.map(Number),
    coloresArcos: ch.data.datasets[0].backgroundColor,
    /* La opción que recibió el plugin. Se cruza con lo pintado, no se afirma sola. */
    opCentro: { etiqueta: opCentro.etiqueta === undefined ? null : String(opCentro.etiqueta),
                valor: opCentro.valor === undefined ? null : String(opCentro.valor) },
    opVacio: { texto: opVacio.texto === undefined ? null : String(opVacio.texto) },
    leyenda: ch.options.plugins.legend.display,
    seccionVacia: seccion ? seccion.classList.contains('is-empty') : null,
    hayHole: !!primerArco && primerArco.innerRadius > 0,
    hole: primerArco ? { inner: +primerArco.innerRadius.toFixed(3), outer: +primerArco.outerRadius.toFixed(3) } : null,
    /* Los tokens de superficie y de categoría, LEÍDOS del navegador. Sirven para
       afirmar sobre el anillo vacío sin escribir un hex de memoria: si la paleta
       cambia, el arnés sigue siendo cierto. */
    tokens: { surface: token('--bg-surface'), inset: token('--bg-inset'), card: token('--bg-card'),
              catServicios: token('--cat-servicios'), catPersonales: token('--cat-personales'),
              catExtras: token('--cat-extras') },
    /* Los dos juegos de totales, viejo y nuevo, para poder afirmar sobre el que
       NO se tocó tanto como sobre el que se cambió. */
    planificado: [t.globalServicios, t.globalPersonales, t.globalExtras],
    realizado: [t.globalServiciosReal, t.globalPersonalesReal, t.globalExtrasReal],
    estimadoPorCategoria: estPorCat.map(v => +v.toFixed(2)),
    realPorCategoria: realPorCat.map(v => +v.toFixed(2)),
    sumaEstimado: +sumaEstimado.toFixed(2),
    sumaReal: +sumaReal.toFixed(2),
    items, cubiertos,
    /* El feed también vive en el store: una fixture sin movimientos tiene que
       DECIRLO, para que "esta celda no comprueba el feed" sea una omisión declarada y
       no un agujero silencioso. */
    movimientos: store.data.mesesOrden.reduce((n, id) => {
      const m = store.data.meses[id];
      return n + (m && m.movimientos ? m.movimientos.length : 0);
    }, 0),
    /* El mismo formateador que usa la app, corrido acá: sirve para comparar el texto
       pintado como CADENA, que es la comparación fuerte, y no solo como número. */
    formatReal: window.formatCurrency(sumaReal),
    formatEstimado: window.formatCurrency(sumaEstimado),
  };
})()`;

/* Lo que el plugin PINTA. Se parchea `fillText` alrededor de un `render()` y se
 * registra cada texto con el lienzo al que pertenece: sin esto, "la opción dice
 * Total realizado" y "el usuario ve Total realizado" serían el mismo afirmación. */
const PINTADO = `(() => {
  const ch = Chart.getChart('chartCategoryDonut');
  if (!ch) return { ok: false, motivo: 'sin chart' };
  const proto = CanvasRenderingContext2D.prototype;
  const original = proto.fillText;
  const registros = [];
  proto.fillText = function (texto, x, y) {
    registros.push({ texto: String(texto), lienzo: this.canvas ? this.canvas.id : null });
    return original.apply(this, arguments);
  };
  try { ch.render(); } finally { proto.fillText = original; }
  return { ok: true, textos: registros.map(r => r.texto), lienzos: [...new Set(registros.map(r => r.lienzo))] };
})()`;

const MEDIR_BARRAS = `(() => {
  const canvas = document.getElementById('chartTrendBar');
  if (!canvas) return { ok: false, motivo: 'no existe #chartTrendBar' };
  const ch = Chart.getChart('chartTrendBar');
  if (!ch) return { ok: false, motivo: 'no hay instancia de Chart en el lienzo' };
  const meta = i => {
    const m = ch.getDatasetMeta(i);
    return m && m.data ? m.data.map(d => +Number(d.width).toFixed(3)) : null;
  };
  return {
    ok: true,
    categorias: ch.data.labels.length,
    etiquetas: ch.data.labels.slice(0, 3),
    series: ch.data.datasets.map(d => d.label),
    /* El tope DECLARADO en el dataset, leído del chart vivo. Se afirma aparte del
       ancho porque son dos cosas distintas: que el tope esté puesto y que el tope
       acote. Un chart puede declarar 36 y no acotar si nadie pasa por acá. */
    topes: ch.data.datasets.map(d =>
      Object.prototype.hasOwnProperty.call(d, 'maxBarThickness') ? d.maxBarThickness : null),
    anchos: [meta(0), meta(1)],
    chartArea: ch.chartArea ? +ch.chartArea.width.toFixed(3) : null,
  };
})()`;

/* EL CONTRASTE, Y POR QUÉ NO MUTA EL OBJETO DE LA APP
 * ----------------------------------------------------
 * `diag-barras.mjs` borra `maxBarThickness` del config crudo y reconstruye. Eso
 * funciona, pero deja el chart de la app en un objeto que ya no es el suyo. Acá se
 * arman datasets NUEVOS a partir de los mismos datos y se pasa `plugins`/`options`
 * por referencia (solo se leen), así que el config de la app no se toca. Al final se
 * destruye el contrafactual y se llama a `window.renderGlobalCharts()`, que es lo
 * único que sabe reconstruir los charts de verdad (TRAMPA 4). */
const CONTRAFACTUAL_SIN_TOPE = `(() => {
  const ch = Chart.getChart('chartTrendBar');
  if (!ch) return { ok: false, motivo: 'sin chart de barras' };
  const base = ch.config && ch.config._config ? ch.config._config : ch.config;
  const canvas = document.getElementById('chartTrendBar');
  const previo = Chart.getChart('chartTrendBar');
  if (previo) previo.destroy();
  let nuevo = null;
  try {
    nuevo = new Chart(canvas, {
      type: 'bar',
      plugins: base.plugins,
      data: {
        labels: base.data.labels,
        datasets: base.data.datasets.map(d => {
          const o = { label: d.label, data: d.data.slice(), backgroundColor: d.backgroundColor,
                      borderRadius: d.borderRadius, borderSkipped: d.borderSkipped };
          /* SIN maxBarThickness: esa es toda la variable del contrafactual. */
          return o;
        }),
      },
      options: base.options,
    });
    const m0 = nuevo.getDatasetMeta(0), m1 = nuevo.getDatasetMeta(1);
    const salida = {
      ok: true,
      categorias: nuevo.data.labels.length,
      topes: nuevo.data.datasets.map(d =>
        Object.prototype.hasOwnProperty.call(d, 'maxBarThickness') ? d.maxBarThickness : null),
      anchos: [
        m0.data.map(d => +Number(d.width).toFixed(3)),
        m1.data.map(d => +Number(d.width).toFixed(3)),
      ],
    };
    nuevo.destroy();
    return salida;
  } catch (e) {
    if (nuevo) { try { nuevo.destroy(); } catch (x) {} }
    return { ok: false, motivo: String(e && e.message || e) };
  } finally {
    /* En ambos caminos el chart real vuelve. Sin esto, la lectura siguiente
       mediría el contrafactual. */
    if (typeof window.renderGlobalCharts === 'function') window.renderGlobalCharts();
  }
})()`;

/* La celda "todo pendiente" arma su estado EN MEMORIA. Ver TRAMPA 2: no se puede
 * sembrar en localStorage y recargar, porque la semilla del sandbox corre en cada
 * navegación y revierte el estado. Se llama a `renderGlobalCharts()` después de
 * mutar porque es la función que lee `calculateGlobalTotals()` en cada render: el
 * store es la única fuente y el gráfico no cachea nada. */
const DEJAR_SIN_PAGO = `(() => {
  const store = window.financialStore;
  if (!store) return { ok: false, motivo: 'sin store' };
  let items = 0;
  for (const id of store.data.mesesOrden) {
    const m = store.data.meses[id];
    if (!m) continue;
    for (const it of [...m.servicios.fijos, ...m.servicios.variables,
                      ...m.personales.fijos, ...m.personales.variables, ...m.extras]) {
      it.montoReal = null; items++;
    }
  }
  window.renderGlobalCharts();
  return { ok: true, items, meses: store.data.mesesOrden.length };
})()`;

/* El feed de movimientos. El `style` inline se lee como dato acompañante y el color
 * se computa: el atributo podría no llevar nada y el color venir de
 * `.tx-details p` (`css/libro.css:473-480`), y al revés también. Los tokens de
 * estado se leen del navegador y NO de memoria: `#2F6B4F` y `#9B3B2E` están en
 * `css/tokens.css:147-148` HOY, y una paleta nueva tiene que hacer fallar este
 * arnés, no dejarlo comparando contra un número viejo. */
const MEDIR_FEED = `(() => {
  const root = getComputedStyle(document.documentElement);
  const token = n => root.getPropertyValue(n).trim();
  /* getComputedStyle().color devuelve "rgb(...)"; un token declarado como hex
     vuelve como hex. Se normalizan los dos a rgb() para comparar. */
  const aRgb = color => {
    if (!color) return null;
    const c = String(color).trim();
    if (c.startsWith('rgb')) return c.replace(/\\s+/g, '');
    if (/^#[0-9a-f]{3}$/i.test(c)) {
      const h = c.slice(1).split('').map(x => parseInt(x + x, 16));
      return 'rgb(' + h.join(',') + ')';
    }
    if (/^#[0-9a-f]{6}$/i.test(c)) {
      const h = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
      return 'rgb(' + h.join(',') + ')';
    }
    return c.toLowerCase();
  };
  const Items = [...document.querySelectorAll('.transaction-feed-item')];
  return {
    total: Items.length,
    tokens: {
      verde: aRgb(token('--accent-emerald')), verdeTexto: aRgb(token('--text-emerald')),
      rojo: aRgb(token('--accent-rose')), rojoTexto: aRgb(token('--text-rose')),
      tinta2: aRgb(token('--ink-2')), tinta: aRgb(token('--ink')), tintaMain: aRgb(token('--text-main')),
    },
    filas: Items.map(f => {
      const p = f.querySelector('.tx-details p');
      const spans = p ? [...p.querySelectorAll('span')] : [];
      /* El último span de los tres es el tipo: los otros dos son la fecha y el
         separador "•". */
      const tipo = spans.length ? spans[spans.length - 1] : null;
      const st = tipo ? getComputedStyle(tipo) : null;
      const importe = f.querySelector('.tx-amount');
      return {
        texto: tipo ? tipo.textContent.trim() : null,
        estiloInline: tipo ? (tipo.getAttribute('style') || '') : null,
        color: st ? aRgb(st.color) : null,
        peso: st ? st.fontWeight : null,
        importa: importe ? { texto: importe.textContent.trim(), clase: importe.className,
                             color: aRgb(getComputedStyle(importe).color) } : null,
      };
    }),
  };
})()`;

/* El CSV, para probar la OTRA mitad del cambio 1: los campos viejos no se tocaron
 * porque `exportCSV` los escribe en columnas rotuladas como planificado. Interceptar
 * el Blob es la única forma de leerlo sin descargar un archivo al disco del usuario.
 * La promesa de `blob.text()` obliga a `awaitPromise`. */
const LEER_CSV = `(() => {
  const crear = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  let blob = null;
  URL.createObjectURL = function (b) { blob = b; return 'blob:arnes'; };
  HTMLAnchorElement.prototype.click = function () {};
  try { window.financialStore.exportCSV(); }
  finally { URL.createObjectURL = crear; HTMLAnchorElement.prototype.click = click; }
  if (!blob) return Promise.resolve({ ok: false, motivo: 'no se capturó el Blob' });
  return blob.text().then(t => ({ ok: true, csv: t }));
})()`;

/* Una llave desbalanceada en UNA hoja no da error: el navegador cierra el bloque que
 * sobra y se come todo lo que venía después (TRAMPA 3). */
function verificarEstructuraCss(dir) {
  const malas = [];
  const hojas = fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => x.endsWith('.css')) : null;
  if (!hojas) return { error: 'no existe el directorio ' + dir, malas: [] };
  for (const f of hojas) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    let depth = 0, linea = 1, primeraDeuda = null;
    const limpio = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    for (const ch of limpio) {
      if (ch === '\n') linea++;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0 && primeraDeuda === null) primeraDeuda = linea; }
    }
    if (depth !== 0) malas.push(`${f}: profundidad final ${depth}` +
      (primeraDeuda ? `, llave de sobra en la línea ${primeraDeuda}` : ', falta cerrar'));
  }
  return { error: null, malas, hojas: hojas.length };
}

/* ------------------------------------------------------------------
 * EL CONTRATO DE SALIDA
 * ------------------------------------------------------------------
 * Modelo de estilo y de acumulación: `movil.mjs`. NO `contraste-diseno.mjs`, que
 * imprime FALLA y sale con 0 — que es exactamente el agujero que este archivo vino
 * a cerrar, no un modelo a copiar.
 * ------------------------------------------------------------------ */
const falla = [];
const pasa = [];
const infra = [];
const na = [];
const verificar = (nombre, ok, detalle = '') =>
  (ok ? pasa : falla).push(nombre + (detalle ? ' — ' + detalle : ''));
const verificarInfra = (nombre, ok, detalle = '') =>
  (ok ? pasa : infra).push(nombre + (detalle ? ' — ' + detalle : ''));
/* La cuarta salida: el caso declarado como inexistente. No es PASS y no es FAIL —
   el ejemplo es `mesVacio`, que por construcción no tiene movimientos y por eso no
   puede comprobar el color del tipo de movimiento. Se imprime siempre. */
const noAplica = (nombre, motivo) => na.push(nombre + ' — ' + motivo);

/* ------------------------------------------------------------------
 * LOS UMBRALES
 * ------------------------------------------------------------------
 * Un solo número sale de una regla y no de una medición: `maxBarThickness: 36`, que
 * es un CONTRATO escrito en `charts.js:240` y `charts.js:248`. Si el código cambia
 * el tope, el arnés tiene que avisar, y por eso va como constante explícita y no
 * como un número suelto en un `.mjs` al lado del chart. La tolerancia es de medio
 * píxel: Chart.js acota con `Math.min`, y el resto es aritmética de flotantes.
 *
 * La banda del ancho natural con 24 períodos (B8) sí sale de una MEDICIÓN —13.847px
 * en la corrida del 2026-10-11 a 1440x900, contra los "~13.8px" anotados en
 * `charts.js:206`— y lleva un margen de 1px porque depende del `chartArea`, que
 * cambia si el scrollbar aparece o desaparece. Es una guarda de cordura: si el
 * número se mueve de la franja, el comentario de `charts.js` quedó viejo y hay que
 * ir a MIRAR, no un número para maquillar. */
const TOPE_BARRA = 36;
const TOL_TOPE = 0.5;
const BANDA_NATURAL_24 = { min: 12.8, max: 14.9 };

/* `formatCurrency` escribe `S/ 1,234.56` con `toLocaleString('es-PE')`
 * (`store.js:1331`). El separador de miles y el decimal dependen del locale del
 * navegador, así que el conversor no supone ninguno: si hay coma y punto, la coma
 * es de miles; si hay una sola coma con dos dígitos detrás, es decimal. La
 * comparación fuerte igual es de CADENA contra el formateador de la app; esto es la
 * segunda red, la que traduce "el texto dice 24438.11" a un número comparable. */
function aNumero(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.replace(/[^\d,.-]/g, '');
  if (!limpio) return null;
  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  let normalizado;
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    normalizado = ultimoPunto > ultimaComa
      ? limpio.replace(/,/g, '')                 // 1,234.56 -> millares con coma
      : limpio.replace(/\./g, '').replace(',', '.');
  } else if (ultimaComa !== -1) {
    normalizado = /,\d{1,2}$/.test(limpio) && limpio.indexOf(',') === ultimoComa
      ? limpio.replace(',', '.')
      : limpio.replace(/,/g, '');
  } else {
    normalizado = limpio;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/* La fuente es de CDN. Sin esto, dos corridas dan medidas distintas (TRAMPA 1). */
async function esperarFuente(sb) {
  const listo = await sb.eval(
    'document.fonts.ready.then(function(){ return document.fonts.status; })',
    { awaitPromise: true });
  await new Promise(z => setTimeout(z, 800));
  return listo;
}

/* `renderPanelView` difería `renderGlobalCharts()` con `setTimeout(..., 60)`
 * (`app.js:1208`), así que asentar es pump + reloj real + pump: una captura
 * descartada es lo único que hace avanzar `requestAnimationFrame` en headless
 * (TRAMPA 5 de `sandbox.mjs`). */
async function asentar(sb) {
  await sb.pump(4);
  await new Promise(z => setTimeout(z, 1600));
  await sb.pump(2);
}

const casi = (valor, objetivo, tol) => typeof valor === 'number' && Math.abs(valor - objetivo) <= tol;

/* TRAMPA 3 — acumulada, no corta. Sin CSS balanceado, diez aserciones de color
   podrían pasar sobre una hoja que ya no se está leyendo entera. */
const css = verificarEstructuraCss(ROOT_CSS);
if (css.error) {
  verificarInfra('CSS · se pudo abrir el directorio de hojas', false, css.error);
} else if (css.malas.length) {
  verificar('CSS · llaves balanceadas en las hojas', false,
    css.malas.join(' | ') + ' — el navegador se come todo lo que viene después');
} else {
  console.log('CSS balanceado en', css.hojas, 'hojas de', ROOT_CSS + '.');
}

/* ------------------------------------------------------------------
 * EL BUCLE: una celda por estado del mundo
 * ------------------------------------------------------------------
 * Las seis celdas son seis navegadores, y no se recyclean: cada una tiene que poder
 * afirmar en el estado de las otras cinco.
 *
 * CADA CELDA DECLARA QUÉ PUEDE COMPROBAR, Y POR QUÉ
 * -------------------------------------------------
 * `quiere` no es una comodidad, es el antídoto contra el PASS mentiroso. Una
 * aserción como "el total del centro es el realizado" sobre una celda sin nada
 * realizado es cierta por falta de nada —igual que "ningún concepto se recorta"
 * sobre cero filas en `movil.mjs`—, y una suite que se calla justo en el caso que
 * no puede medir se está mintiendo con los ojos abiertos. El arnés tiene tres
 * salidas y ninguna de las dos cómodas:
 *   · la celda dice que el caso existe   -> corre todo y el hallazgo es un FAIL;
 *   · la celda dice que NO existe        -> se omite, se imprime como NO APLICA, y
 *                                           el estado vacío se AFIRMA en positivo;
 *   · la celda decía que sí y no lo hay  -> INFRA (2), porque el arnés se quedó
 *                                           sin el terreno y afirmar ahí sería
 *                                           inventar.
 * `NO APLICA` no cuenta para el código de salida y por eso tiene que quedar
 * impreso: si algún día son la mitad de las comprobaciones, eso es un hecho que hay
 * que poder leer, no un detalle de formato.
 *
 * `quiere.realizado` NO es lo mismo que "esta celda mira la dona": la celda
 * `sin-pago` la mira y NO tiene realizado, y esa es justamente la que sirve. Lo que
 * declara es si D3-D11 —el bloque "el centro es la plata que salió"— tiene terreno.
 * `vacia` marca la celda cuyo vacío viene de la FIXTURE y no de una mutación, y lo
 * que se afirma de ella es que no queda ni un ítem: sin ese campo el arnés no
 * distinguiría "el fixture dejó de estar vacío" de "el arnés se quedó sin casos". */
const CELLS = [
  { ctx: 'realizado', fixture: 'produccion4digitos',
    quiere: { realizado: true, feed: true, barras: true }, vacia: false,
    que: 'dona = realizado sobre estimado ≠ real' },
  { ctx: 'sin-pago', fixture: 'produccion4digitos',
    quiere: { realizado: false, feed: true, barras: true }, derivada: true, vacia: false,
    que: 'todo estimado y nada pagado (estado derivado en memoria)' },
  { ctx: 'vacio', fixture: 'mesVacio',
    quiere: { realizado: false, feed: false, barras: true }, vacia: true,
    que: 'la dona sin nada que mostrar' },
  { ctx: 'baseline', fixture: 'baseline',
    quiere: { realizado: true, feed: true, barras: true }, vacia: false,
    que: 'feed sin color de estado + barras con 2 períodos' },
  { ctx: 'un-mes', fixture: 'unSoloMes',
    quiere: { realizado: true, feed: true, barras: true }, vacia: false,
    que: 'barras con 1 solo período' },
  { ctx: 'p24', fixture: 'periodos24',
    quiere: { realizado: true, feed: true, barras: true }, vacia: false,
    que: 'barras con 24 períodos: el tope no debe morder' },
];

const salida = {};
let celdasMedidas = 0;

for (const celda of CELLS) {
  const ctx = celda.ctx;
  salida[ctx] = { fixture: celda.fixture, que: celda.que };
  let sb = null;
  try {
    sb = await launchSandbox({ fixture: celda.fixture, width: 1440, height: 900 });
  } catch (e) {
    verificarInfra(`${ctx} · el sandbox arrancó`, false,
      String(e && e.message ? e.message : e).split('\n')[0]);
    continue;
  }

  try {
    await sb.markBootBaseline();
    const fuente = await esperarFuente(sb);
    await sb.pump(3);

    /* INFRA primero: si el terreno no sirve, no se afirma nada sobre él. */
    verificarInfra(`${ctx} · la fuente de CDN cargó`, fuente === 'loaded',
      'document.fonts.status=' + fuente);

    /* Los tres cambios viven en la vista de consolidado y en la de mes. Se entra a
       las dos: el consolidado para los gráficos, y de vuelta al mes para el feed
       (`diag-barras.mjs:105` usa el mismo botón). */
    await sb.eval(`document.getElementById('btnNavPanel').click(); 1`);
    await asentar(sb);

    salida[ctx].fuente = fuente;
    salida[ctx].consola = sb.consoleErrors.slice();
    salida[ctx].excepciones = sb.exceptions.slice();

    /* ============ CAMBIO 1: LA DONA DEL CONSOLIDADO ES REALIZADO ============ */

    /* La celda `sin-pago` no es una fixture: es `produccion4digitos` con los pagos
       borrados. El estado se arma ACÁ, en memoria, y se vuelve a pintar —ver TRAMPA
       2: sembrar en localStorage y recargar no sirve, porque la semilla del sandbox
       corre en cada navegación y revierte lo escrito. Se hace antes de medir y
       antes de leer la consola, para que una excepción del propio arnés no se
       cuente como si fuera de la app. */
    if (celda.derivada) {
      salida[ctx].estadoDerivado = await sb.eval(DEJAR_SIN_PAGO);
      await asentar(sb);
    }

    const dona = await sb.eval(MEDIR_DONA);
    if (dona && dona.ok) {
      salida[ctx].dona = dona;
      const pintado = await sb.eval(PINTADO);
      salida[ctx].pintado = pintado;
      const pintados = pintado && pintado.ok ? pintado.textos : [];

      verificarInfra(`${ctx} · la dona se construyó`, dona.datasetData.length === 3,
        'dataset de ' + dona.datasetData.length + ' valores');

      /* La compuerta de la celda, y el agujero que cierra: `mesVacio` no tiene nada
         que repartir, así que D3-D11 no se le aplican —afirmar ahí que el centro
         "es el realizado" sería cierto sobre cero datos. Pero la omisión tiene que
         quedar AFIRMADA en positivo: si la fixture que se declaró vacía dejara de
         estarlo, el arnés tiene que enterarse. Y `sin-pago` se afirma distinto: no
         está vacía, tiene todo estimado y nada pagado, y eso es lo que hay que
         comprobar para que su omisión sea legítima. */
      const hayRealizado = dona.items > 0 && dona.sumaReal > 0;
      if (hayRealizado !== celda.quiere.realizado) {
        verificarInfra(`${ctx} · la celda declara el caso que le corresponde`, false,
          `quiere.realizado=${celda.quiere.realizado} pero hay ${dona.items} ítems y ` +
          `${dona.sumaReal} de realizado`);
      } else if (celda.vacia) {
        verificar(`${ctx} · la fixture está vacía de verdad`,
          dona.items === 0 && dona.sumaEstimado === 0 && dona.sumaReal === 0 && dona.movimientos === 0,
          `${dona.items} ítems, ${dona.movimientos} movimientos, estimado ` +
          `${dona.sumaEstimado}, realizado ${dona.sumaReal}`);
        noAplica(`${ctx} · D3-D11 (el centro es el realizado)`,
          'la celda no tiene nada realizado: su estado vacío se afirma en D18/D19');
      } else if (!hayRealizado) {
        /* Sólo la celda derivada llega acá: una celda con realizado pasó el `if` de
           la compuerta y no tiene por qué ser "todo estimado y nada pagado". */
        verificar(`${ctx} · el estado derivado dejó todo estimado y nada pagado`,
          dona.items > 0 && dona.cubiertos === 0 && dona.sumaEstimado > 0,
          `${dona.items} ítems, ${dona.cubiertos} cubiertos, estimado ${dona.sumaEstimado}, ` +
          `realizado ${dona.sumaReal}`);
        noAplica(`${ctx} · D3-D11 (el centro es el realizado)`,
          'por construcción no hay realizado: el estado vacío se afirma en D13-D17');
      }

      if (!hayRealizado) {
        /* Nada que repartir: se cierra el bloque de la dona con realizada. */
      } else {

      /* --- D3, LA ASERCIÓN QUE DECIDE SI ESTE ARNÉS MUERDE -------------------
       * Se escribe primero y se marca aparte porque es el criterio de aceptación
       * de todo el archivo: con estimado ≠ real, el total del centro tiene que ser
       * la suma de los `montoReal` Y tiene que ser DISTINTO de la suma de los
       * estimados. Contra el código viejo —el que pintaba el planificado— falla.
       * Las dos mitades van en la misma afirmación: un centro igual al estimado
       * falla aunque coincida con el real, y al revés también. */
      const delta = Math.abs(dona.sumaReal - dona.sumaEstimado);
      const centroNum = aNumero(dona.opCentro.valor);
      verificar(`${ctx} · D3 el total del centro es el REALIZADO y NO el planificado`,
        dona.sumaEstimado !== dona.sumaReal &&
        centroNum !== null && Math.abs(centroNum - dona.sumaReal) < 0.01 &&
        delta >= 0.01,
        `centro "${dona.opCentro.valor}" = ${centroNum} | suma de montoReal ` +
        `${dona.sumaReal} (${dona.cubiertos}/${dona.items} ítems cubiertos) | suma de ` +
        `montoEstimados ${dona.sumaEstimado} | difieren en ${delta.toFixed(2)}`);

      /* La cadena, no el número. `formatCurrency` es el MISMO formateador de la fila
         "Total del año", y la comparación fuerte es que el texto pintado sea
         idéntico al que la app produce con la suma del realizado. */
      verificar(`${ctx} · D4 el texto del centro es el que produce la app con el realizado`,
        dona.opCentro.valor === dona.formatReal && dona.opCentro.valor !== dona.formatEstimado,
        `"${dona.opCentro.valor}" vs formatCurrency(realizado)=${dona.formatReal} y ` +
        `formatCurrency(planificado)=${dona.formatEstimado}`);

      /* Y que ese texto se PINTE, no solo que esté en la opción. Una reasignación
         de la opción que nunca llegue al lienzo tiene que hacer fallar esto. */
      verificar(`${ctx} · D5 el valor del centro se pinta en el lienzo`,
        pintados.includes(dona.opCentro.valor) && dona.opCentro.valor !== '',
        `pintados=[${pintados.map(t => JSON.stringify(t)).join(', ')}]`);

      verificar(`${ctx} · D6 el rótulo del centro dice "Total realizado"`,
        dona.opCentro.etiqueta === 'Total realizado' &&
        dona.opCentro.etiqueta !== 'Total estimado' &&
        pintados.includes('Total realizado'),
        `opción="${dona.opCentro.etiqueta}", pintado=${pintados.includes('Total realizado')}`);

      /* El anillo entero, no solo el centro: el `datasetData` es lo que Chart.js
         reparte en arcos. Si el centro fuera correcto y los arcos no, el gráfico
         estaría mintiendo por partida doble. */
      const arcosOk = dona.datasetData.every((v, i) => Math.abs(v - dona.realizado[i]) < 0.01);
      const arcosVsPlan = dona.datasetData.every((v, i) => Math.abs(v - dona.planificado[i]) < 0.01);
      verificar(`${ctx} · D7 el anillo reparte los montos realizados, no los planificados`,
        arcosOk && !arcosVsPlan && dona.realizado.some((v, i) => Math.abs(v - dona.planificado[i]) >= 0.01),
        `arcos=[${dona.datasetData.join(', ')}] | realizado=[${dona.realizado.join(', ')}] | ` +
        `planificado=[${dona.planificado.join(', ')}]`);

      /* Los tres arcos tienen que sumar el mismo total que el del centro. No es la
         misma afirmación que D3: aquella mira el número escrito arriba y ésta mira
         lo que Chart.js repartió entre las porciones. Un centro correcto con un
         anillo que suma otra cosa es un gráfico que se contradice a sí mismo. */
      const sumaArcos = dona.datasetData.reduce((a, b) => a + b, 0);
      verificar(`${ctx} · D8 la suma de los arcos es el total del centro`,
        Math.abs(sumaArcos - dona.sumaReal) < 0.01,
        `suma de arcos ${sumaArcos.toFixed(2)} vs suma de montoReal ${dona.sumaReal}`);

      /* La mitad que el cambio NO tocó, afirmada igual. Los campos viejos son los que
         `exportCSV` escribe en columnas rotuladas SERVICIOS / PERSONALES / GASTOS
         EXTRA (`store.js:1313`), así que si esos cambiaran de significado el CSV
         empezaría a decir una cosa y la pantalla otra, sin un solo error visible.
         *
         * La comparación es POR CATEGORÍA contra el estimado de esa misma categoría.
         * Exigir que las tres difieran del realizado sería inventar un requisito: un
         * ítem migrado como "Pagado" tiene `montoReal === montoEstimado` (store.js:106)
         * y su categoría queda IGUAL en los dos juegos de números. Lo que sí tiene
         * que cumplirse es que el conjunto viejo no sea una copia del nuevo. */
      const viejoEsEstimado = dona.planificado.every((v, i) =>
        Math.abs(v - dona.estimadoPorCategoria[i]) < 0.01);
      const viejoEsCopiaDelRealizado = dona.planificado.every((v, i) =>
        Math.abs(v - dona.realizado[i]) < 0.01);
      verificar(`${ctx} · D9 los campos viejos siguen siendo el PLANIFICADO`,
        viejoEsEstimado && !viejoEsCopiaDelRealizado,
        `globalServicios/Personales/Extras=[${dona.planificado.join(', ')}] vs ` +
        `estimado por categoría=[${dona.estimadoPorCategoria.join(', ')}] · ` +
        `¿copia del realizado? ${viejoEsCopiaDelRealizado}`);

      /* El estado vacío: con realizado no hay nada que avisar. */
      verificar(`${ctx} · D10 con realizado la leyenda se muestra`,
        dona.leyenda === true, 'legend.display=' + dona.leyenda);
      verificar(`${ctx} · D11 con realizado la sección NO se marca vacía`,
        dona.seccionVacia === false, 'is-empty=' + dona.seccionVacia);
      }   /* cierra el "con realizado" */
    } else {
      verificarInfra(`${ctx} · la dona se pudo medir`, false,
        dona && dona.motivo ? dona.motivo : 'sin respuesta');
    }

    /* --- El CSV: la otra mitad de por qué los campos viejos no se tocaron.
       El CSV tiene UNA COLUMNA POR CATEGORÍA, así que la comparación es columna por
       columna contra `planificado[i]`, nunca contra el total de las tres. */
    if (celda.quiere.realizado && dona && dona.ok) {
      const csv = await sb.eval(LEER_CSV, { awaitPromise: true });
      salida[ctx].csv = csv;
      if (csv && csv.ok) {
        const filas = csv.csv.trim().split(/\r?\n/);
        const lineaTotales = filas.find(f => f.startsWith('"TOTALES"'));
        verificarInfra(`${ctx} · el CSV se pudo leer`, !!lineaTotales,
          'filas del CSV: ' + filas.length);
        const celdas = lineaTotales ? lineaTotales.split(',') : [];
        const exportado = [1, 2, 3].map(i => Number(celdas[i]));
        const nombres = ['SERVICIOS', 'PERSONALES', 'GASTOS EXTRA'];
        const csvEsPlanificado = exportado.every((v, i) => Math.abs(v - dona.planificado[i]) < 0.01);
        const csvEsRealizado = exportado.every((v, i) => Math.abs(v - dona.realizado[i]) < 0.01);
        verificar(`${ctx} · D12 el CSV sigue exportando el PLANIFICADO, columna por columna`,
          !!lineaTotales && csvEsPlanificado && !csvEsRealizado,
          `TOTALES exportado=[${exportado.join(', ')}] · ` +
          `${nombres.map((n, i) => n + ' ' + exportado[i]).join(' · ')} · ` +
          `planificado=[${dona.planificado.join(', ')}] · es copia del realizado? ${csvEsRealizado}`);
        /* Los rótulos de las columnas son parte del mismo contrato: son las que dicen
           "esto es lo que se planeó", y un CSV con las cifras del realizado bajo un
           encabezado de planificado es el modo de fallo exacto que motivó los campos
           nuevos. */
        verificar(`${ctx} · D12b el encabezado del CSV sigue rotulando PLANIFICADO`,
          filas[0] === 'MES,SERVICIOS,PERSONALES,GASTOS EXTRA,TOTAL EGRESOS,INGRESOS,BALANCE NETO,% AVANCE',
          `encabezado="${filas[0]}"`);
      } else {
        verificarInfra(`${ctx} · el CSV se pudo leer`, false, csv && csv.motivo);
      }
    }

    /* ============ CAMBIO 2: EL TIPO DEL FEED SIN COLOR DE ESTADO ============== */

    await sb.eval(`document.getElementById('btnNavMes').click(); 1`);
    await asentar(sb);
    const feed = await sb.eval(MEDIR_FEED);
    salida[ctx].feed = feed;

    /* Misma compuerta que la dona. `mesVacio` no tiene movimientos por
       construcción, y F2 sobre cero palabras es el PASS mentiroso exacto. Que la
       omisión sea honesta depende de que la celda lo diga, y eso se afirma: la
       fixture tiene que seguir sin movimientos. */
    if (feed && feed.total > 0) {
      if (!celda.quiere.feed) {
        verificarInfra(`${ctx} · la celda declara el caso que le corresponde`, false,
          `quiere.feed=${celda.quiere.feed} pero el feed renderizó ${feed.total} movimientos`);
      }
      /* La guarda de vacuidad: sin un ingreso y un gasto, "el color no es verde ni
         rojo" se cumple sobre cero palabras y es el PASS mentiroso exacto. */
      const hayIngreso = feed.filas.some(f => f.texto === 'Ingreso');
      const hayGasto = feed.filas.some(f => f.texto === 'Gasto');
      verificar(`${ctx} · F1 el feed tiene al menos un ingreso y un gasto`,
        hayIngreso && hayGasto,
        `${hayIngreso ? 1 : 0} Ingreso / ${hayGasto ? 1 : 0} Gasto de ${feed.total} filas`);

      /* El color COMPUTADO de la palabra, no el atributo: el color puede venir de
         `.tx-details p` (`css/libro.css:473-480`) y además `app.js:1076` escribe un
         `style` inline. Lo que se afirma es sobre lo que se ve. */
      const verde = new Set([feed.tokens.verde, feed.tokens.verdeTexto].filter(Boolean));
      const rojo = new Set([feed.tokens.rojo, feed.tokens.rojoTexto].filter(Boolean));
      const coloreadas = feed.filas.filter(f => verde.has(f.color) || rojo.has(f.color));
      verificar(`${ctx} · F2 el tipo de movimiento NO lleva el verde de estado`,
        verde.size > 0 && feed.filas.every(f => !verde.has(f.color)),
        `verde=${[...verde].join('/')}, colores medidos=[${[...new Set(feed.filas.map(f => f.color))].join(', ')}]`);
      verificar(`${ctx} · F3 el tipo de movimiento NO lleva el rojo de estado`,
        rojo.size > 0 && feed.filas.every(f => !rojo.has(f.color)),
        `rojo=${[...rojo].join('/')}, colores medidos=[${[...new Set(feed.filas.map(f => f.color))].join(', ')}]`);

      /* El peso sobrevive: lo que se sacó fue el color, no la jerarquía. Y el `600`
         es EXACTO, porque `app.js:1076` lo escribe inline en un `<span>` sin reglas
         que lo compitan. */
      const pesos = [...new Set(feed.filas.map(f => f.peso))];
      verificar(`${ctx} · F4 el tipo de movimiento conserva el peso 600`,
        feed.filas.length > 0 && pesos.length === 1 && pesos[0] === '600',
        `pesos medidos=${JSON.stringify(pesos)} de ${feed.filas.length} filas`);

      /* El `style` inline como dato acompañante. No alcanza para probar nada sobre
         el color —por eso la aserción de arriba es sobre el estilo computado— pero
         sí sirve para nombrar dónde se quitó: si alguien reintrodujera el color acá,
         esta es la línea que lo traiciona. */
      const conColorInline = feed.filas.filter(f => /(^|;)\s*color\s*:/i.test(f.estiloInline || ''));
      verificar(`${ctx} · F5 el estilo inline del tipo no declara color`,
        feed.filas.length > 0 && conColorInline.length === 0,
        conColorInline.length ? conColorInline.map(f => f.texto + ': ' + f.estiloInline).join(' | ')
          : `[${[...new Set(feed.filas.map(f => f.estiloInline))].join(' | ')}]`);

      /* Todas las filas, no una: el feed es una lista heterogénea y basta un
         `flujo === 'Ingreso'` que se colara en una rama para que el color vuelva. */
      verificar(`${ctx} · F6 todas las filas del feed cumplen lo mismo`,
        feed.filas.every(f => f.color && !verde.has(f.color) && !rojo.has(f.color) && f.peso === '600'),
        `${coloreadas.length} de ${feed.filas.length} filas con color de estado`);

      /* La tinta que quedó, nombrada. No es una aserción de contrato (la app no
         promete un color exacto) sino el dato del informe: dice de qué color quedó. */
      console.log(`  ${ctx}: el tipo del feed quedó en ${[...new Set(feed.filas.map(f => f.color))].join(', ')} ` +
        `(tokens: verde ${feed.tokens.verde}, rojo ${feed.tokens.rojo}, tinta-2 ${feed.tokens.tinta2})`);
    } else if (feed && celda.quiere.feed) {
      verificarInfra(`${ctx} · el feed renderizó filas`, false, feed.total + ' movimientos');
    } else {
      /* El feed no renderizó y la celda no lo pedía: se afirma que efectivamente no
         hay movimientos, para que "no se comprobó" sea un hecho y no un olvido. */
      verificar(`${ctx} · la fixture no tiene movimientos que comprobar`,
        !!feed && feed.total === 0,
        `${feed ? feed.total : '?'} movimientos · el store tiene ` +
        `${dona && dona.ok ? dona.movimientos : '?'}`);
      noAplica(`${ctx} · F1-F6 (el tipo del feed sin color de estado)`,
        'la celda no tiene movimientos en el feed');
    }

    /* ============ CAMBIO 3: maxBarThickness 36 EN LAS DOS SERIESES ========== */

    await sb.eval(`document.getElementById('btnNavPanel').click(); 1`);
    await asentar(sb);
    const barras = await sb.eval(MEDIR_BARRAS);
    salida[ctx].barras = barras;

    if (barras && barras.ok) {
      verificarInfra(`${ctx} · el chart de barras se construyó`,
        barras.categorias > 0 && !!barras.anchos[0] && barras.anchos[0].length === barras.categorias,
        `${barras.categorias} categorías, chartArea ${barras.chartArea}px`);

      /* El tope declarado en el DATASET. Es distinto del ancho: que la clave esté
         puesta y que acote son dos afirmaciones, y una sin la otra es un chart que
         se ve bien por casualidad. */
      verificar(`${ctx} · B1 las DOS series declaran maxBarThickness: ${TOPE_BARRA}`,
        barras.topes.length === 2 && barras.topes.every(t => t === TOPE_BARRA),
        `topes=[${barras.topes.join(', ')}] sobre [${barras.series.join(' | ')}]`);

      const anchos = [...barras.anchos[0], ...barras.anchos[1]];
      const peor = anchos.length ? Math.max(...anchos) : null;
      verificar(`${ctx} · B2 ninguna barra pasa de ${TOPE_BARRA}px`,
        peor !== null && peor <= TOPE_BARRA + TOL_TOPE,
        `${anchos.length} barras de ${barras.categorias} períodos, la más ancha ${peor}px` +
        ` (tope ${TOPE_BARRA} ±${TOL_TOPE}; chartArea ${barras.chartArea}px)`);

      /* El contrafactual. Es lo que convierte "36" en una AFIRMACIÓN sobre el tope:
         sin esta medición, un chart con 36 porque el `maxBarThickness` no existe
         pero el `barPercentage` también dio 36 sería indistinguible del correcto. */
      const contra = await sb.eval(CONTRAFACTUAL_SIN_TOPE);
      salida[ctx].barrasSinTope = contra;
      await asentar(sb);
      if (contra && contra.ok) {
        const sinTope = [...contra.anchos[0], ...contra.anchos[1]];
        const peorSin = sinTope.length ? Math.max(...sinTope) : null;
        /* LA INVARIANTE COMPLETA DEL TOPE, y por qué no son dos
         * -----------------------------------------------------------
         * `maxBarThickness: 36` significa exactamente una cosa: el ancho de la barra
         * es `min(natural, 36)`. Decir "el tope acota" a secas sólo vale cuando el
         * natural pasa los 36; con 24 períodos el natural es 13.8 y el tope es
         * inerte, así que la versión corta de esa frase falla AHÍ — y falla por la
         * razón contraria a la que uno quiere. Por eso la afirmación dice las dos
         * ramas, y el detalle imprime cuál de las dos se midió.
         *
         * Esta es también la que distingue un chart bien de uno que sale con 36 de
         * casualidad: sin el contrafactual, un `barPercentage` que también diera
         * 36 sería indistinguible del correcto. */
        const maxDiff = anchos.length
          ? Math.max(...anchos.map((w, i) => Math.abs(w - sinTope[i]))) : null;
        const naturalPasa = peorSin !== null && peorSin > TOPE_BARRA + TOL_TOPE;
        verificar(`${ctx} · B3 el ancho es el mínimo entre el natural y el tope`,
          peorSin !== null && (naturalPasa
            ? casi(peor, TOPE_BARRA, TOL_TOPE)
            : (maxDiff !== null && maxDiff <= 0.001)),
          `con tope ${peor}px · sin tope ${peorSin}px, con ${barras.categorias} categorías ` +
          `(chartArea ${barras.chartArea}px) · el natural ${naturalPasa ? 'PASA' : 'NO pasa'} ` +
          `los ${TOPE_BARRA}px, así que el tope ${naturalPasa ? 'morde' : 'es inerte'}` +
          (naturalPasa ? '' : ` · diferencia máxima con/sin tope ${maxDiff}px`));
      } else {
        verificarInfra(`${ctx} · se pudo medir el contrafacial sin tope`, false,
          contra && contra.motivo ? contra.motivo : 'sin respuesta');
      }
    } else {
      verificarInfra(`${ctx} · el chart de barras se pudo medir`, false,
        barras && barras.motivo ? barras.motivo : 'sin respuesta');
    }

    /* ============ EL VEREDICTO POR CELDA ==================================== */
    verificar(`${ctx} · la página no tiró errores de consola`,
      sb.consoleErrors.length === 0, JSON.stringify(sb.consoleErrors).slice(0, 300));
    verificar(`${ctx} · la página no tiró excepciones`,
      sb.exceptions.length === 0, JSON.stringify(sb.exceptions).slice(0, 300));

    celdasMedidas++;

    if (!SIN_CAPTURA) {
      await sb.shot(path.join(DIR, `graficos-${ctx}.png`));
    }

    /* --- LO QUE SE MUESTRA, QUE NO ES EL VEREDICTO --- */
    console.log(`\n===== ${ctx} (${celda.fixture}) — ${celda.que} =====`);
    console.log('  fuente  :', fuente);
    console.log('  consola :', JSON.stringify(sb.consoleErrors).slice(0, 200));
    console.log('  exc     :', JSON.stringify(sb.exceptions).slice(0, 200));
    if (salida[ctx].dona) {
      const d = salida[ctx].dona;
      console.log('  dona    : arcos=[' + d.datasetData.join(', ') + '] · centro="' +
        d.opCentro.valor + '" · "' + d.opCentro.etiqueta + '" · pintado=[' +
        (salida[ctx].pintado && salida[ctx].pintado.ok
          ? salida[ctx].pintado.textos.map(t => JSON.stringify(t)).join(' ') : '?') + ']');
      console.log('            estimado ' + d.sumaEstimado + ' vs realizado ' + d.sumaReal +
        ' (difieren ' + Math.abs(d.sumaReal - d.sumaEstimado).toFixed(2) + ') · ' +
        d.cubiertos + '/' + d.items + ' cubiertos · leyenda=' + d.leyenda +
        ' · is-empty=' + d.seccionVacia);
    }
    if (salida[ctx].barras) {
      const b = salida[ctx].barras;
      console.log('  barras  : ' + b.categorias + ' períodos · serie0 ' +
        JSON.stringify(b.anchos[0].slice(0, 4)) + ' · serie1 ' +
        JSON.stringify(b.anchos[1].slice(0, 4)) + (b.categorias > 4 ? ' …' : '') +
        ' · topes=[' + b.topes.join(', ') + ']');
      if (salida[ctx].barrasSinTope && salida[ctx].barrasSinTope.ok) {
        console.log('            sin tope: serie0 ' +
          JSON.stringify(salida[ctx].barrasSinTope.anchos[0].slice(0, 4)) +
          (b.categorias > 4 ? ' …' : ''));
      }
    }
  } catch (e) {
    /* Excepción midiendo: no hay veredicto, hay INFRA. No se corta el run, porque
       las otras celdas son evidencia igual. */
    verificarInfra(`${ctx} · la medición se completó`, false,
      String(e && e.message ? e.message : e).split('\n')[0]);
  } finally {
    await sb.close();
  }
}

/* ------------------------------------------------------------------
 * UNA AFIRMACIÓN QUE NO ES DE LAS TRES, Y POR QUÉ ESTÁ
 * ------------------------------------------------------------------
 * La celda `sin-pago` es la que separa mejor el código viejo del nuevo, y por eso
 * merece una afirmación propia y explícita en el informe. Se hace acá y no dentro
 * de la celda porque es una comparación ENTRE dos mediciones. */
{
  const conPago = salida['realizado'] && salida['realizado'].dona;
  const sinPago = salida['sin-pago'] && salida['sin-pago'].dona;
  if (conPago && sinPago) {
    verificar('D13 · sin pagos la dona queda vacía aunque haya planificado',
      sinPago.sumaReal === 0 && sinPago.sumaEstimado > 0 &&
      sinPago.opCentro.valor === '' && sinPago.seccionVacia === true &&
      sinPago.leyenda === false &&
      sinPago.datasetData.every(v => v === 1),
      `planificado ${sinPago.sumaEstimado} (${conPago.sumaEstimado}) · realizado ` +
      `${sinPago.sumaReal} (${conPago.sumaReal}) · centro "${sinPago.opCentro.valor}" · ` +
      `is-empty=${sinPago.seccionVacia} · leyenda=${sinPago.leyenda}`);

    /* La trampa de este caso: el código viejo pinta el centro con el PLANIFICADO
       aunque no haya salido un sol. Con el anillo en estado vacío, ningún texto
       numérico puede estar en el lienzo. */
    const pintadosSinPago = (salida['sin-pago'].pintado && salida['sin-pago'].pintado.ok)
      ? salida['sin-pago'].pintado.textos : [];
    const numeros = pintadosSinPago.map(aNumero).filter(n => n !== null);
    const planned = aNumero(sinPago.formatEstimado);
    verificar('D14 · sin pagos no se escribe ninguna cifra en el anillo',
      numeros.length === 0,
      `pintados=[${pintadosSinPago.map(t => JSON.stringify(t)).join(', ')}] · ` +
      `números=[${numeros.join(', ')}] · el planificado que el código viejo habría ` +
      `pintado era ${planned}`);

    /* Y el texto del estado vacío: el viejo decía "gastos", el nuevo dice "pagos". */
    const viejo = 'Sin gastos registrados en el acumulado.';
    const nuevo = 'Sin pagos registrados en el acumulado.';
    verificar('D15 · el texto de vacío es el de PAGOS, no el de gastos',
      sinPago.opVacio.texto === nuevo && sinPago.opVacio.texto !== viejo &&
      pintadosSinPago.includes(nuevo),
      `"${sinPago.opVacio.texto}" · pintado=${pintadosSinPago.includes(nuevo)}`);

    /* El planificado NO se movió al dejar todo pendiente: la celda derivada cambió
       una sola cosa, y el informe tiene que poder demostrar cuál. */
    verificar('D16 · el planificado quedó intacto al vaciar los pagos',
      Math.abs(sinPago.sumaEstimado - conPago.sumaEstimado) < 0.01,
      `estimado ${sinPago.sumaEstimado} vs ${conPago.sumaEstimado} en la misma fixture`);

    /* El anillo vacío se pinta con superficies, no con los acentos de categoría:
       sin datos no hay nada que categorizar y un arcoíris de tres tonos sería
       mentira visual. Los tokens se leen del navegador, no de memoria.
       *
       * Corren las DOS celdas vacías, y no solo una: "todo pendiente" y "nada
       * estimado" llegan al mismo estado por caminos distintos, y que las dos
       * pinten superficies es la forma de comprobar que el estado vacío depende del
       * REALIZADO y no de si la lista tiene ítems. */
    const vacio = salida['vacio'] && salida['vacio'].dona;
    const celdasVacias = [['sin-pago', sinPago], ['vacio', vacio]].filter(([, d]) => !!d);
    if (celdasVacias.length) {
      const superficies = new Set([sinPago.tokens.surface, sinPago.tokens.inset]
        .filter(Boolean).map(c => String(c).toLowerCase()));
      const acentos = new Set([sinPago.tokens.catServicios, sinPago.tokens.catPersonales,
        sinPago.tokens.catExtras].filter(Boolean).map(c => String(c).toLowerCase()));
      const malos = [];
      for (const [nombre, d] of celdasVacias) {
        const conAcento = d.coloresArcos.filter(c => acentos.has(String(c).toLowerCase()));
        const conSuperficie = d.coloresArcos.filter(c => superficies.has(String(c).toLowerCase()));
        if (conAcento.length || conSuperficie.length !== d.coloresArcos.length) {
          malos.push(nombre + ': colores=[' + d.coloresArcos.join(', ') + ']');
        }
      }
      verificar('D17 · el anillo vacío se pinta con superficies, no con acentos',
        superficies.size > 0 && acentos.size > 0 && malos.length === 0,
        (malos.length ? malos.join(' | ')
          : celdasVacias.map(([n, d]) => n + ' [' + d.coloresArcos.join(', ') + ']').join(' · ')) +
        ` · superficies=[${[...superficies].join(', ')}] · acentos=[${[...acentos].join(', ')}]`);
    }

    /* La celda `mesVacio`: el vacío de verdad, sin ni un ítem estimado. Tiene que
       dar el MISMO estado que "todo pendiente", porque para la dona son el mismo
       hecho: cero plata salida. */
    if (vacio) {
      verificar('D18 · sin gastos ni pagos el anillo queda en el mismo estado vacío',
        vacio.items === 0 && vacio.sumaReal === 0 && vacio.opCentro.valor === '' &&
        vacio.seccionVacia === true && vacio.leyenda === false,
        `${vacio.items} ítems · arcos=[${vacio.datasetData.join(', ')}] · centro ` +
        `"${vacio.opCentro.valor}" · is-empty=${vacio.seccionVacia} · leyenda=${vacio.leyenda}`);

      const pintadosVacio = (salida['vacio'].pintado && salida['vacio'].pintado.ok)
        ? salida['vacio'].pintado.textos : [];
      verificar('D19 · el texto de vacío se PINTA, no solo está en la opción',
        pintadosVacio.includes('Sin pagos registrados en el acumulado.') &&
        !pintadosVacio.includes('Sin gastos registrados en el acumulado.') &&
        pintadosVacio.filter(t => aNumero(t) !== null).length === 0,
        `pintados=[${pintadosVacio.map(t => JSON.stringify(t)).join(', ')}]`);
    } else {
      verificarInfra('D18 · la celda `mesVacio` se pudo medir', false, 'sin dona medida');
    }
  } else {
    verificarInfra('D12 · las dos celdas de la dona se pudieron comparar', false,
      `realizado=${!!conPago} sin-pago=${!!sinPago}`);
  }
}

/* ------------------------------------------------------------------
 * LA GEMELA DE B3 PARA EL CASO DE 24 PERÍODOS
 * ------------------------------------------------------------------
 * B3 ya afirma la invariante completa del tope (`min(natural, 36)`), que en las dos
 * ramas es cierta. Estas dos son la versión con nombre y número del caso que B3 no
 * puede destacar: con muchas categorías el tope debe ser INERTE, y eso es lo que
 * afirma el comentario de `charts.js:225-227`. La cifra sale de la corrida de hoy,
 * no de un comentario. */
{
  const p24 = salida['p24'] && salida['p24'].barras;
  const p24s = salida['p24'] && salida['p24'].barrasSinTope;
  if (p24 && p24.ok && p24s && p24s.ok) {
    const conTope = [...p24.anchos[0], ...p24.anchos[1]];
    const sinTope = [...p24s.anchos[0], ...p24s.anchos[1]];
    const ancho = conTope.length ? conTope[0] : null;
    const diferencias = conTope.map((w, i) => Math.abs(w - sinTope[i]));
    const maxDiff = diferencias.length ? Math.max(...diferencias) : null;
    verificar('B4 · con 24 períodos el tope NO muerde: el ancho natural se conserva',
      p24.categorias === 24 && maxDiff !== null && maxDiff <= 0.001,
      `${p24.categorias} períodos · con tope ${ancho}px · sin tope ${sinTope[0]}px · ` +
      `diferencia máxima ${maxDiff}px (chartArea ${p24.chartArea}px)`);

    /* Y la guarda de cordura del número anotado en `charts.js:206`. Si el ancho
       natural se mueve de la franja, el comentario del código quedó viejo: eso es
       una señal de que hay que ir a mirar, no un número para maquillar. */
    verificar('B5 · el ancho natural con 24 períodos es el que dice charts.js:206',
      ancho !== null && ancho >= BANDA_NATURAL_24.min && ancho <= BANDA_NATURAL_24.max,
      `medido ${ancho}px, el comentario dice "~13.8px" y la banda es ` +
      `${BANDA_NATURAL_24.min}-${BANDA_NATURAL_24.max}px`);
  } else {
    verificarInfra('B4 · se pudo medir el tope con 24 períodos', false,
      `barras=${!!(p24 && p24.ok)} sinTope=${!!(p24s && p24s.ok)}`);
  }

  /* El orden de encendido del tope, que es lo que la celda `un-mes` mide y lo que
     el comentario no dice: con UNA sola categoría el tope baja la barra de ~334px
     a 36. Es la prueba de que el 36 es un tope y no un detalle cosmético. */
  const unMes = salida['un-mes'] && salida['un-mes'].barras;
  const unMesSin = salida['un-mes'] && salida['un-mes'].barrasSinTope;
  if (unMes && unMes.ok && unMesSin && unMesSin.ok) {
    const con = unMes.anchos[0][0];
    const sin = unMesSin.anchos[0][0];
    verificar('B6 · con un solo período el tope baja una barra de más de 300px',
      unMes.categorias === 1 && con !== null && sin !== null &&
      con <= TOPE_BARRA + TOL_TOPE && sin > TOPE_BARRA + TOL_TOPE,
      `1 categoría · con tope ${con}px · sin tope ${sin}px (chartArea ${unMes.chartArea}px)`);
  } else {
    verificarInfra('B6 · se pudo medir el tope con un solo período', false,
      `barras=${!!(unMes && unMes.ok)} sinTope=${!!(unMesSin && unMesSin.ok)}`);
  }
}

/* ------------------------------------------------------------------
 * LO QUE SE MUESTRA, QUE NO ES EL VEREDICTO
 * ------------------------------------------------------------------ */
console.log('\n===== RESUMEN DE MEDIDAS (no es el veredicto) =====');
for (const celda of CELLS) {
  const s = salida[celda.ctx];
  if (!s || !s.dona) continue;
  const d = s.dona;
  const b = s.barras;
  console.log(`${celda.ctx.padEnd(9)} ${celda.fixture.padEnd(20)}` +
    ` | estimado ${String(d.sumaEstimado).padStart(10)} · realizado ${String(d.sumaReal).padStart(10)}` +
    ` | centro "${d.opCentro.valor || '(vacío)'}"` +
    ` | ${d.cubiertos}/${d.items} ítems` +
    (b ? ` | ${b.categorias} períodos, barra ${b.anchos[0][0]}px de ${TOPE_BARRA}` : ''));
}

/* El informe en disco, para el que quiera citar cifras sin volver a correr. */
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'graficos.report.json'),
  JSON.stringify({ generado: new Date().toISOString(), topeBarra: TOPE_BARRA, salida }, null, 1), 'utf8');

/* ------------------------------------------------------------------ SALIDA */
console.log('\n===== ASERCIONES =====');
console.log(`celdas medidas: ${celdasMedidas} de ${CELLS.length}\n`);
for (const p of pasa) console.log('  OK    ' + p);
if (falla.length) {
  console.log('');
  for (const f of falla) console.log('  FALLA ' + f);
}
if (infra.length) {
  console.log('');
  for (const i of infra) console.log('  INFRA ' + i);
}
if (na.length) {
  console.log('');
  for (const n of na) console.log('  N/A   ' + n);
}
console.log('\n  ' + pasa.length + ' aserciones cumplen · ' + falla.length + ' no cumplen' +
  (infra.length ? ' · ' + infra.length + ' no medibles (infraestructura)' : '') +
  (na.length ? ' · ' + na.length + ' declaradas no aplicables' : ''));

const codigo = falla.length ? 1 : (infra.length ? 2 : 0);
console.log('código de salida:', codigo, codigo === 0 ? '(todo PASS)' :
  codigo === 1 ? '(alguna afirmación no se sostiene)' : '(infraestructura: ni PASS ni FAIL)');
process.exit(codigo);