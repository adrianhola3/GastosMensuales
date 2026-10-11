/* movil.mjs - La pantalla angosta, medida, ASERTADA y capturada. El teléfono es
 * un producto distinto al que miden `reglas.mjs` (1440) y `contraste-diseno.mjs`:
 * tiene su propia retícula, sus propios cortes y sus propias cifras, y ninguna de
 * las dos rondas anteriores lo cubrió.
 *
 * POR QUÉ ESTE ARCHIVO Y NO `diseno.mjs`
 * --------------------------------------
 * `diseno.mjs` mide la vista de escritorio en 1440/390. Este mide el teléfono en
 * 320/390/768 y, sobre todo, mide lo que `diseno.mjs` no pregunta: si un texto se
 * RECORTA o entra entero, si dos cajas caen en celdas distintas de la retícula y
 * cuántas filas entran en una pantalla de 844. Esos tres son los que un rediseño
 * rompe en silencio — la página se ve "casi bien" y nadie mide.
 *
 * POR QUÉ ASERTA Y NO SOLO REPORTA
 * --------------------------------
 * Un arnés que imprime y sale con 0 no es un arnés: es un parte. Si alguien revierte
 * el `display: contents` de `css/libro.css`, la página se ve "casi bien", el
 * informe sale igual de largo y el comando devuelve 0: nadie se entera hasta que
 * alguien lee el JSON a ojo. Cada invariante de este archivo es un `verificar()`
 * con nombre, y el código de salida es el veredicto:
 *   0  todo PASS   ·   1  algún FAIL de layout   ·   2  la infraestructura no
 *   permitió ni pasar ni fallar (no hay nada medido, o no todo).
 * Los tres estados son distintos a propósito. "No medible" NO es "correcto":
 * afirmar que el concepto no se recorta sobre CERO filas es un PASS mentiroso.
 *
 * LAS DOS FIXTURES, Y POR QUÉ DOS
 * ------------------------------
 * `baseline` tiene importes de tres dígitos y nunca estimated ≠ real: la
 * migración de `store.js:92-127` deja `montoReal = montoEstimado` en lo pagado
 * (diferencia 0) y `null` en lo pendiente (un solo `<div>`). El defecto que
 * motivó el arreglo de la retícula angosta es el de DOS importes de cuatro
 * dígitos DISTINTOS peleándose por el mismo ancho de columna, así que una
 * fixture que solo tiene `baseline` nunca ejercita el caso que motivó el cambio
 * — y un arnés que no lo ejercita no lo cubre. `produccion4digitos` (en
 * `sandbox.mjs`) copia `baseline` concepto por concepto y movimiento por
 * movimiento y solo cambia las seis cifras a `{montoEstimado, montoReal}`
 * distintos, para que el ancho del concepto siga siendo comparable entre
 * fixtures y un píxel de diferencia signifique algo.
 *
 * LO QUE TIRA
 * -----------
 *   capturas/movil-<fixture>-<ancho>.png          la vista desde arriba, con la
 *                                                 banda de secciones a la vista
 *   capturas/movil-<fixture>-<ancho>-filas.png   la misma página scrolleada
 *                                                 hasta las filas de gasto: es
 *                                                 donde se lee el recorte de un
 *                                                 concepto, que arriba no se ve
 *                                                 porque queda debajo del pliegue
 *   capturas/movil.report.json    `{ <fixture>: { <ancho>: {pedido, real,
 *                                                 fuente, alto} } }` — las dos
 *                                                 fixtures en el mismo informe
 *   y el bloque de aserciones, que es la prueba.
 *
 *   node odd\tasks\movil.mjs                    (320, 390, 768 × 2 fixtures)
 *   node odd\tasks\movil.mjs 390                (uno solo)
 *   node odd\tasks\movil.mjs --sin-captura      (solo medidas, no escribe PNG)
 *   node odd\tasks\movil.mjs --ancho-real        (clientWidth exacto del pedido)
 *
 * `--sin-captura` suprime SOLO los PNG. Nunca las medidas ni las aserciones: una
 * corrida sin capturas que no verifica nada es un arnés apagado que devuelve 0.
 *
 * LAS CUATRO TRAMPAS DE ESTE ENTORNO, POR QUÉ ESTÁN ESCRITAS ADENTRO
 * ====================================================================
 *
 * 1. EL ANCHO PEDIDO NO ES EL ANCHO QUE SE MIDE.
 *    `Emulation.setDeviceMetricsOverride` NO se come el scrollbar: pedir 320 deja
 *    `innerWidth` 320 y `clientWidth` 305, 15px menos. MEDIDO en esta máquina.
 *    Y `resize(320)` sobre un sandbox abierto a 320 no corrige nada, porque el
 *    override es el mismo número. Para tener `clientWidth` 320 hay que pedir
 *    335. Por eso este script mide DOS PASES por ancho:
 *      - el pase PEDIDO (320 -> clientWidth 305), que es el que se captura y el
 *        que nombra el archivo;
 *      - el pase de ANCHO REAL (335 -> clientWidth 320), que es el único
 *        comparable contra una cifra escrita como "a 320px".
 *    Toda medida sale con `clientWidth` al lado. Una cifra sin ese número al lado
 *    no es una medida, es una conjetura con decimal. Por eso las aserciones "por
 *    ancho" (A9-A13) solo corren en el pase PEDIDO: el pase real tiene otro
 *    `clientWidth` y compararlo contra un umbral escrito para 320 sería falso.
 *
 * 2. IBM PLEX SANS VIENE DE CDN.
 *    Sin `await document.fonts.ready` + una pausa, dos corridas dan anchos
 *    distintos y la diferencia parece una regresión. Se espera SIEMPRE, y si
 *    después de esperar la fuente no está `loaded`, el run es INFRA (2): con la
 *    fuente de reserva todos los anchos de texto son otros.
 *
 * 3. `Page.captureScreenshot` SIN `captureBeyondViewport`.
 *    Los `position: sticky` se renderizan en posición falsa y un bug de layout se
 *    disfraza de Captura buena. Además una captura descartada es la forma barata
 *    de forzar un frame, que es lo único que hace avanzar el reloj de
 *    animaciones y transiciones.
 *
 * 4. UNA LLAVE `}` DE MÁS NO DA ERROR.
 *    El navegador cierra el bloque sobrante y se come todo lo que viene
 *    después, dentro o fuera del @media. Es el modo de fallo más caro de un CSS
 *    partido en varios archivos. Se comprueba ANTES de capturar, y es un FAIL
 *    (exit 1) acumulado como cualquier otro: no corta el run, porque las otras
 *    celdas se siguen midiendo y un proceso que muere en la primera falla deja
 *    unRepo igual de mudo que uno que sale con 0.
 *
 * POR QUÉ `launchSandbox` Y NO `openPage`
 * ---------------------------------------
 * `openPage` (cdp.mjs) se conecta al navegador del usuario y abre una ventana
 * REAL Y VISIBLE, y además entra en MODO LECTOR: `.admin-action-btn` ocultos y
 * `exigirAdmin()` rechazando escrituras. Para una fixture de solo lectura alcanza,
 * pero acá se quiere medir el botón de editar y el de borrar, que en lector no
 * tienen caja. `launchSandbox` lanza su propio navegador headless, tira el perfil
 * después y siembra la fixture sintética que se le pida.
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox } from './sandbox.mjs';

const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const ROOT_CSS = path.join(process.cwd(), 'css');

const args = process.argv.slice(2);
const SIN_CAPTURA = args.includes('--sin-captura');
const REAL = args.includes('--ancho-real');
const pedidos = args.filter(a => !a.startsWith('--')).map(Number).filter(Boolean);
const ANCHOS = pedidos.length ? pedidos : [320, 390, 768];

/* Las dos fixtures. El orden es el de lectura: primero la de siempre, que es la
 * que nueve suites usan como referencia, después la que reproduce el defecto. */
const FIXTURAS = ['baseline', 'produccion4digitos'];

/* Los anchos con invariantes declarados. Pedir uno fuera de esta lista NO es un
 * ancho nuevo: es un ancho para el que este archivo no sabe qué afirmar, y salir
 * con 0 sin haber asserted nada sería el W1 con otro nombre. Va como INFRA. */
const ANCHOS_SOPORTADOS = new Set([320, 390, 768]);

/* El ancho de la lista: solo sirve para las capturas. 768 es una tablet, no un
 * teléfono, y por eso no comparte el alto de 844 con los otros dos. */
const ALTO_DE = w => (w <= 640 ? 844 : 1024);

/* ------------------------------------------------------------------
 * EL BLOQUE DE MEDIDAS
 * ------------------------------------------------------------------
 * Es una lista de preguntas, no una lista de selectores: cada línea es algo que
 * puede estar mal. Lo que se pregunta, en orden de importancia:
 *   - ¿el documento scrollea de lado? (una fila más ancha que la pantalla)
 *   - ¿el concepto se RECORTA? scrollWidth > clientWidth es el recorte real,
 *     medido en la caja, no una conjetura por el ancho de la fuente
 *   - ¿las dos cajas del importe caen en celdas DISTINTAS de la retícula, y la
 *     segunda en un renglón propio? gridRowStart comparado, no supuesto
 *   - ¿el botón mide 36x36? getBoundingClientRect, no el `width` de la regla
 *   - ¿el botón de editar se VE? opacity computada: un control invisible es un
 *     control muerto en un dispositivo sin hover
 *   - ¿cuántas filas COMPLETAS entran en la pantalla? `bottom <= alto`, porque
 *     media fila no cuenta
 * ------------------------------------------------------------------ */
const MEDIR = `(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
             bottom: Math.round(b.bottom) }; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const q = sel => document.querySelector(sel);
  const alto = window.innerHeight;

  /* --- A. LA BANDA DE SECCIONES --------------------------------- */
  const rail = q('.section-rail');
  const lista = q('.section-rail-list');
  const entradas = [...document.querySelectorAll('.rail-entry')];
  const totales = [...document.querySelectorAll('.rail-entry-total')];
  /* El ancho honesto del contenido scrolleable: la suma de las cajas, no el
     scrollWidth. Chrome mete el padding izquierdo dentro del scrollWidth y deja
     el derecho fuera, así que el scrollWidth de una caja con padding lateral es
     un número que no corresponde a nada visible. */
  const sumaEntradas = entradas.reduce((a, e) => a + e.getBoundingClientRect().width, 0);

  const banda = () => {
    const e = q('.section-rail');
    return e ? { h: +e.getBoundingClientRect().height.toFixed(1),
                 y: Math.round(e.getBoundingClientRect().y) } : null;
  };
  const bandaAdmin = banda();
  /* El modo lector se provoca con la misma clase que usa app.js:136. Se mide y
     se saca en el MISMO evaluate, así la página queda como estaba para la
     captura que viene después. */
  document.body.classList.add('read-only-mode');
  const bandaLector = banda();
  const adminVisiblesLector = [...document.querySelectorAll('.admin-action-btn')].filter(e => {
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0;
  }).length;
  document.body.classList.remove('read-only-mode');

  /* --- B. LA FILA DE GASTO ------------------------------------- */
  const filas = [...document.querySelectorAll('.expense-card-item')];
  const filasMedida = filas.map(f => {
    const t = f.querySelector('.expense-item-title');
    const celda = f.querySelector('.expense-item-amount');
    const divs = celda ? [...celda.children] : [];
    return {
      concepto: t ? t.textContent.trim() : null,
      titulo: t ? {
        caja: r(t), scrollW: t.scrollWidth, clientW: t.clientWidth,
        recortado: t.scrollWidth > t.clientWidth,
        necesita: (() => { const rg = document.createRange(); rg.selectNodeContents(t);
          return Math.ceil(rg.getBoundingClientRect().width); })(),
      } : null,
      /* "display: contents" no caja: el contenedor no tiene caja propia, así que
         lo que se mide son los <div> hijos como ítems de la retícula. */
      amount: {
        display: cs(celda, 'display'),
        divs: divs.map(d => {
          const s = getComputedStyle(d);
          return { texto: d.textContent.trim(), caja: r(d),
                   gridArea: s.gridArea,
                   row: s.gridRowStart + '/' + s.gridRowEnd,
                   col: s.gridColumnStart + '/' + s.gridColumnEnd,
                   justifySelf: s.justifySelf };
        }),
      },
      info: (() => { const e = f.querySelector('.expense-item-info');
        return e ? { gridArea: getComputedStyle(e).gridArea, caja: r(e) } : null; })(),
      acciones: (() => { const e = f.querySelector('.item-actions');
        return e ? { gridArea: getComputedStyle(e).gridArea, caja: r(e) } : null; })(),
      botones: ['.btn-edit-expense', '.btn-delete-expense', '.btn-status-toggle'].map(sel => {
        const e = f.querySelector(sel);
        /* opacity entra porque un botón de 36x36 que no se ve es un control
           muerto: en un riel angosto las acciones no tienen ":hover" que las
           aparezca. Se lee el estilo COMPUTADO, no la regla. */
        return { sel, caja: r(e), w: e ? Math.round(e.getBoundingClientRect().width) : null,
                 h: e ? Math.round(e.getBoundingClientRect().height) : null,
                 opacity: e ? getComputedStyle(e).opacity : null };
      }),
      fila: r(f),
    };
  });

  /* Cuántas filas COMPLETAS entran en una pantalla. "bottom <= alto" en vez de
     contar las que empiezan arriba: media fila no es una fila. */
  const completas = filas.filter(f => f.getBoundingClientRect().bottom <= alto + 0.5).length;
  const primeraY = filas.length ? Math.round(filas[0].getBoundingClientRect().y) : null;

  /* --- C. EL FEED DE MOVIMIENTOS ------------------------------- */
  const txs = [...document.querySelectorAll('.transaction-feed-item')];
  const feed = txs.map(f => {
    const l = f.querySelector('.tx-left');
    const rr = f.querySelector('.tx-right');
    const h4 = f.querySelector('.tx-left h4');
    const lb = l ? l.getBoundingClientRect() : null;
    const rb = rr ? rr.getBoundingClientRect() : null;
    return {
      concepto: h4 ? h4.textContent.trim() : null,
      txLeft: l ? { caja: r(l), scrollW: l.scrollWidth, clientW: l.clientWidth } : null,
      conceptoH4: h4 ? { caja: r(h4), scrollW: h4.scrollWidth, clientW: h4.clientWidth,
                          recortado: h4.scrollWidth > h4.clientWidth } : null,
      txRight: rr ? { caja: r(rr), gridRow: getComputedStyle(rr).gridRowStart,
                      justifySelf: getComputedStyle(rr).justifySelf } : null,
      /* ¿.tx-right está en el segundo renglón? Se compara la arista superior
         contra la de .tx-left: si arrancan al mismo y siguen en el mismo
         renglón, por mucha regla que diga lo contrario. */
      mismoRenglon: lb && rb ? Math.abs(lb.y - rb.y) < 2 : null,
      botones: ['.btn-edit-tx', '.btn-delete-tx'].map(sel => {
        const e = f.querySelector(sel);
        return { sel, w: e ? Math.round(e.getBoundingClientRect().width) : null,
                 h: e ? Math.round(e.getBoundingClientRect().height) : null };
      }),
    };
  });

  /* --- el resto del contexto ----------------------------------- */
  const de = document.documentElement;
  return {
    ancho: {
      pedido: window.__pedido || null,
      clientWidth: de.clientWidth,
      innerWidth: window.innerWidth,
      altoViewport: alto,
      media640: matchMedia('(max-width: 640px)').matches,
      /* Se declara si el navegador dice "sin hover". Si lo dijera, la regla
         base de libro.css (media hover:none) dejaria de ser la unica fuente
         de la opacidad 1 y una asercion sobre visibilidad no probaria lo que
         dice probar. */
      hoverNone: matchMedia('(hover: none)').matches,
    },
    banda: {
      caja: r(rail),
      altoAdmin: bandaAdmin,
      altoLector: bandaLector,
      altoCambiaConLector: bandaAdmin && bandaLector ? bandaAdmin.h !== bandaLector.h : null,
      adminVisiblesEnLector: adminVisiblesLector,
      entradas: entradas.length,
      lista: lista ? { caja: r(lista), scrollW: lista.scrollWidth, clientW: lista.clientWidth,
                       offsetW: lista.offsetWidth,
                       overflowX: cs(lista, 'overflowX'),
                       scrollLeft: lista.scrollLeft,
                       scrollea: lista.scrollWidth > lista.clientWidth } : null,
      anchoContenidoSumaCajas: Math.round(sumaEntradas),
      totales: totales.map(t => ({ texto: t.textContent.trim(), display: getComputedStyle(t).display,
                                   caja: r(t) })),
      etiquetas: entradas.map(e => {
        const b = e.querySelector('.ledger-chip-label');
        return { texto: b ? b.textContent.trim() : null, caja: r(e) };
      }),
    },
    filas: {
      total: filas.length,
      completasEnPantalla: completas,
      primeraFilaY: primeraY,
      detalle: filasMedida,
    },
    feed: { total: txs.length, detalle: feed },
    documento: {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      scrollHorizontal: de.scrollWidth > de.clientWidth,
      /* Cuál scrollea de lado, si alguno: el culpable tiene nombre.
         LO QUE CUENTA ES EL QUE SE SALE DE LA VENTANA. Un elemento que
         sobresale dentro de una caja con overflow-x auto está recortado por
         esa caja y NO ensucia el documento: la banda de secciones está hecha
         justamente para scrollear de lado (A8 lo exige), y sus entradas
         sobresalen de su propia caja a propósito. Por eso se sube por los
         ancestros: si alguno recorta en X, el elemento no es culpable. La
         versión anterior de esta comprobación —que solo miraba overflowX del
         propio elemento— señalaba las cinco entradas del riel en todas las
         corridas, y nunca se notó porque nadie afirmaba sobre la lista: otro
         agujero del mismo tipo que el que motiva este archivo. */
      culpables: [...document.querySelectorAll('body *')].filter(e => {
        const b = e.getBoundingClientRect();
        if (!(b.width > 0 && b.right > de.clientWidth + 1)) return false;
        if (getComputedStyle(e).overflowX !== 'visible') return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false;
        }
        return true;
      }).slice(0, 6).map(e => ({ sel: e.tagName.toLowerCase() + '.' +
        (typeof e.className === 'string' ? e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
        right: Math.round(e.getBoundingClientRect().right),
        w: Math.round(e.getBoundingClientRect().width) })),
    },
    tipografia: {
      familia: cs(document.body, 'fontFamily'),
      lista: cs(document.body, 'fontFamily').split(',')[0].replace(/["']/g, ''),
      status: document.fonts ? document.fonts.status : null,
    },
  };
})()`;

/* Una llave desbalanceada en UNA hoja no da error: el navegador cierra el bloque
   que sobra y se come todo lo que venía después, dentro o fuera del @media. Es
   el modo de fallo más caro de un CSS partido en varios archivos, porque la
   página se ve "casi bien" y ninguna regla parece rota. Se comprueba antes de
   capturar, no después. */
function verificarEstructuraCss(dir) {
  const malas = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.css'))) {
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
  return malas;
}

/* ------------------------------------------------------------------
 * EL CONTRATO DE SALIDA
 * ------------------------------------------------------------------
 * Modelo de estilo y de acumulación: `reglas.mjs`. NO `contraste-diseno.mjs`, que
 * imprime FALLA y sale con 0 — que es exactamente el agujero que este archivo
 * vino a cerrar, no un modelo a copiar.
 *
 * El MODELO DE EXIT CODE no es el de `reglas.mjs`, y está bien que no lo sea:
 * aquel mezcla "la infraestructura anduvo mal" con "el layout está roto" en el
 * mismo 1, así que no se puede distinguir una regresión real de una máquina sin
 * navegador. Acá son TRES estados y solo tres:
 *
 *   0  todo PASS
 *   1  al menos un FAIL de layout (incluye el CSS desbalanceado y las
 *      excepciones de página: una página con excepciones no es "layout correcto")
 *   2  INFRAESTRUCTURA: ni PASS ni FAIL. No arrancó el navegador, no cargó la
 *      fuente, la fixture no renderizó, o se pidió un ancho sin invariantes
 *      declarados. AFIRMAR CUALQUIER COSA AQUÍ SERÍA MENTIR: sobre cero filas,
 *      "ningún concepto se recorta" es cierto por falta de conceptos.
 *
 * Nunca se corta en la primera falla: se miden las 2 fixtures × 3 anchos, se
 * acumula todo y recién al final se fija el código. Un proceso que muere en la
 * primera falla deja el repo igual de mudo que uno que sale con 0. */
const falla = [];
const pasa = [];
const infra = [];
const verificar = (nombre, ok, detalle = '') =>
  (ok ? pasa : falla).push(nombre + (detalle ? ' — ' + detalle : ''));
const verificarInfra = (nombre, ok, detalle = '') =>
  (ok ? pasa : infra).push(nombre + (detalle ? ' — ' + detalle : ''));

/* ------------------------------------------------------------------
 * LOS UMBRALES
 * ------------------------------------------------------------------
 * Todos salen de una MEDICIÓN, no de una opinión, y el margen está escrito al
 * lado del número. Dos tolerancias y ninguna más:
 *   ±1px  en altos   — el alto de la banda es una suma de tokens enteros
 *   ±8px  en anchos  — IBM Plex Sans viene de CDN (TRAMPA 2): dos corridas dan
 *                      cifras que difieren en un dígito, y un umbral pegado al
 *                      número medido convierte el ruido del navegador en una
 *                      falsa regresión.
 * Los que NO llevan margen son los que se miden contra un valor EXACTO y no
 * dependen de la fuente: el alto de la banda, el conteo de filas completas, el
 * ancho de los botones (CSS en px, sin texto adentro). */
const UMBRAL = {
  /* --- el concepto: el piso es el ancho que hay que GANAR ---
     Medidos con `baseline`, pase pedido: 173px a 320 y 243px a 390. El piso es
     8 px más abajo, que es justo la tolerancia de fuente. */
  concepto320Baseline: 165,
  concepto390Baseline: 235,

  /* `produccion4digitos`. CALIBRADO contra la corrida real del 2026-10-11, con
     `movil.mjs` y la fuente servida, y NO contra una conjetura.
       · a 320 mide 167px -> piso 159 (= medido − 8, la tolerancia de fuente)
       · a 390 mide 237px -> piso 229 (= medido − 8)
     El motivo de que producción quede ~6px POR DEBAJO de `baseline` (173 y 243)
     es el defecto que este arnés existe para cubrir: los importes de cuatro
     dígitos son más anchos que los de tres, se comen 6px de la columna del
     concepto y aun así el concepto entra entero. Ese margen de 6px es
     justamente lo que un piso muy alto taparía. La guarda de cordura de A9c
     (83 < medido < 173) existe para que un "pasa" acá siga significando
     "sigue funcionando" y no "el número se movió". */
  concepto320Produccion: 159,
  concepto390Produccion: 229,

  /* La columna del importe es de 88px en la retícula y el texto medido 76px; el
     umbral lleva los 8 de tolerancia. Si esto falla, el importe se comió la
     columna del concepto. MEDIDO con `produccion4digitos`: 82px (es 76px en
     `baseline`; el importe de cuatro dígitos cuesta 6px, los mismos que le
     ceden al concepto). */
  importeProduccion: 96,

  /* La banda de secciones, medida con las cinco entradas de `baseline`.
     NOTA — el número del diseño (832px) NO se reproduce contra este código.
     La cifra viene de un comentario de `css/layout.css:944` que dice "832px con
     los botones de alta y 784px sin ellos", y con el estado de hoy NO DA NINGUNO
     DE LOS DOS: el arnés corre en modo administrador, los cinco `.rail-add-btn`
     (.admin-action-btn) están VISIBLES y la suma sigue siendo 784px. Sin los
     botones de alta serían 563px. Las reglas de esa media query no cambiaron
     entre add9849 y HEAD, así que el 832 de ese comentario no corresponde a esta
     hoja: quedó viejo. Se congela el VALOR MEDIDO, que es lo único que un
     umbral puede comprobar; se reporta la discrepancia en vez de dejar el 832,
     porque un umbral que el código nunca puede cumplir es un arnés que siempre
     sale con 1 y entonces nadie lo mira. */
  bandaAlto: 47,               // ±1
  bandaEntradas: 5,
  bandaContenido: 784,         // ±8 — medido, no el 832 del comentario

  /* La primera fila de gasto, medida con la fixture `baseline`. */
  primeraFilaY: 463,           // ±30
  filasCompletas: 3,           // exacto

  /* El feed de movimientos: el `.tx-left` se come la fila después del arreglo. */
  feedIzq320: 249,             // medido 257
  feedIzq390: 319,             // medido 327

  /* Los botones táctiles. CSS en px, sin texto: valor exacto. */
  tactil: 36,
  chico: 22,
};

const casi = (valor, objetivo, tol) => Math.abs(valor - objetivo) <= tol;
const minTitulo = m => Math.min(...m.filas.detalle.map(f => (f.titulo ? f.titulo.caja.w : Infinity)));

/* ------------------------------------------------------------------
 * LAS ASERCIONES DE UNA CELDA (una fixture × un ancho × un pase)
 * ------------------------------------------------------------------
 * `m` es lo que devuelve MEDIR: estilo computado y `getBoundingClientRect`. NO se
 * lee la hoja CSS ni una sola vez acá adentro — leer el `width` de una regla
 * comprueba que la regla dice lo que dice, no que la caja mida eso. */
function evaluar(fixture, ancho, pase, m) {
  const ctx = `${fixture}@${ancho}/${pase}`;

  /* --- INFRA primero: si el terreno no sirve, no se afirma nada sobre él --- */
  const infraAntes = infra.length;
  verificarInfra(`${ctx} · la fixture renderizó filas`, m.filas.total > 0,
    m.filas.total + ' .expense-card-item');
  verificarInfra(`${ctx} · la banda de secciones renderizó`, m.banda.entradas > 0,
    m.banda.entradas + ' .rail-entry');
  verificarInfra(`${ctx} · la fuente de CDN cargó`, m.tipografia.status === 'loaded',
    'document.fonts.status=' + m.tipografia.status);
  if (infra.length > infraAntes) {
    /* Algo de esta celda no es medible. Afirmar sobre cero filas daría un PASS
       mentiroso, así que la celda no entra al bloque de invariantes. */
    return;
  }

  /* ---------------- INVARIANTES DE TELÉFONO: 320 y 390 --------------- */
  if (ancho === 320 || ancho === 390) {
    /* A1 — nada más ancho que la pantalla. `culpables` va con el booleano
       porque "scrollHorizontal === false" solo dice que no hay scroll, no que
       nada esté asomando: un elemento puede sobresalir y no ARMAR scroll si el
       padre recorta. Los dos, juntos, son la afirmación. */
    verificar(`${ctx} · A1 sin scroll horizontal`,
      m.documento.scrollHorizontal === false && m.documento.culpables.length === 0,
      'scrollHorizontal=' + m.documento.scrollHorizontal +
      ' culpables=' + JSON.stringify(m.documento.culpables.map(c => c.sel)));

    /* A2 — el concepto entra entero. `scrollWidth > clientWidth` medido en la
       caja: el recorte real, no una conjetura por el ancho de la fuente. */
    const recortes = m.filas.detalle.filter(f => f.titulo && f.titulo.recortado);
    verificar(`${ctx} · A2 ningún concepto recortado`, recortes.length === 0,
      recortes.length + ' de ' + m.filas.total +
      (recortes.length ? ' (' + recortes.map(r => r.concepto).join(', ') + ')' : ''));

    /* A3 — el importe se DISUELVE a los 640px. Si vuelve a ser `block`, los dos
       <div> se apilan dentro de una caja que ocupa la celda entera, el detalle
       no llega a ser un ítem de la retícula y el concepto pierde ancho. */
    const displays = [...new Set(m.filas.detalle.map(f => (f.amount ? f.amount.display : 'null')))];
    const noDisueltos = m.filas.detalle.filter(f => !f.amount || f.amount.display !== 'contents');
    verificar(`${ctx} · A3 el importe disuelto (display: contents)`,
      noDisueltos.length === 0,
      noDisueltos.length + ' de ' + m.filas.total + ' filas sin disolver, display=' +
      JSON.stringify(displays));

    /* A4 — el detalle real cae en SU renglón.
       OJO con la fila sin detalle: en `baseline` un gasto "Pendiente" no tiene
       monto real, `pintarImporteFila` (app.js:874-877) escribe UN solo <div> y
       exigirle un segundo sería exigir algo que la app no dibuja. Para esas se
       exige la mitad de la mitad: disolverse y caer en la celda `amount`. */
    const problemasA4 = [];
    m.filas.detalle.forEach(f => {
      const d = f.amount ? f.amount.divs : [];
      const nombre = f.concepto || '?';
      if (d.length === 0) { problemasA4.push(nombre + ': sin <div> de importe'); return; }
      if (d[0].gridArea !== 'amount') problemasA4.push(nombre + ': div0 gridArea=' + d[0].gridArea);
      if (d[0].justifySelf !== 'end') problemasA4.push(nombre + ': div0 justifySelf=' + d[0].justifySelf);
      if (d.length === 1) return;   // sin monto real: un renglón es lo correcto
      if (d[1].gridArea !== 'real') problemasA4.push(nombre + ': div1 gridArea=' + d[1].gridArea);
      if (d[1].justifySelf !== 'end') problemasA4.push(nombre + ': div1 justifySelf=' + d[1].justifySelf);
      if (d[0].row === d[1].row) {
        problemasA4.push(nombre + ': estimado y real en el MISMO renglón (' + d[0].row + ')');
      }
      if (!d[1].caja || !d[0].caja || d[1].caja.y < d[0].caja.bottom - 2) {
        problemasA4.push(nombre + ': el detalle no cae debajo (y=' +
          (d[1].caja ? d[1].caja.y : '?') + ' vs bottom=' + (d[0].caja ? d[0].caja.bottom : '?') + ')');
      }
    });
    verificar(`${ctx} · A4 el detalle real cae en su propio renglón`,
      problemasA4.length === 0,
      problemasA4.length ? problemasA4.join(' | ') :
        m.filas.detalle.filter(f => f.amount && f.amount.divs.length > 1).length + ' de ' +
        m.filas.total + ' filas con detalle, todas en renglón propio');

    /* A5 — el objetivo táctil mide lo que dice. `.btn-status-toggle` queda
       afuera a propósito: es una marca de estado con texto, no un botón de
       ícono, y nunca fue de 36. */
    const chicos = [];
    m.filas.detalle.forEach(f => f.botones.forEach(b => {
      if (b.sel === '.btn-status-toggle') return;
      if (b.w !== UMBRAL.tactil || b.h !== UMBRAL.tactil) {
        chicos.push((f.concepto || '?') + ' ' + b.sel + ' ' + b.w + 'x' + b.h);
      }
    }));
    verificar(`${ctx} · A5 botones táctiles de 36x36`, chicos.length === 0,
      chicos.length ? chicos.slice(0, 4).join(' | ') :
        (m.filas.total * 2) + ' botones de ' + UMBRAL.tactil + 'x' + UMBRAL.tactil);

    /* A6 — el subtotal del riel NO se escribe. `totales.length > 0` va en la
       misma afirmación a propósito: `.every()` sobre un array vacío devuelve
       `true`, y un `true` sobre cero totales es el PASS mentiroso exacto. */
    verificar(`${ctx} · A6 el subtotal del riel no se escribe`,
      m.banda.totales.length > 0 && m.banda.totales.every(t => t.display === 'none'),
      m.banda.totales.length + ' totales, display=' + JSON.stringify(m.banda.totales.map(t => t.display)));

    /* A7 — el feed se apila: el importe baja a su renglón. `gridRowStart` dice
       dónde lo COLOCÓ la retícula y `mismoRenglon` si de verdad comparte fila
       con el dato — que es lo que se ve, y no siempre lo que dice la regla. */
    const feedApilado = m.feed.detalle.length > 0 && m.feed.detalle.every(f =>
      f.txRight && f.txRight.gridRow === '2' && f.mismoRenglon === false);
    verificar(`${ctx} · A7 el feed apilado (importe en el renglón 2)`, feedApilado,
      m.feed.detalle.length + ' movimientos, gridRow=' +
      JSON.stringify(m.feed.detalle.map(f => (f.txRight ? f.txRight.gridRow : 'null'))) +
      ' mismoRenglon=' + JSON.stringify(m.feed.detalle.map(f => f.mismoRenglon)));

    /* A8 — la banda de secciones: alto fijo, cinco entradas, y scrollea. */
    verificar(`${ctx} · A8 alto de banda 47px en admin y en lector`,
      !!m.banda.altoAdmin && !!m.banda.altoLector &&
      casi(m.banda.altoAdmin.h, UMBRAL.bandaAlto, 1) &&
      casi(m.banda.altoLector.h, UMBRAL.bandaAlto, 1),
      'admin ' + (m.banda.altoAdmin ? m.banda.altoAdmin.h + 'px' : '?') +
      ' / lector ' + (m.banda.altoLector ? m.banda.altoLector.h + 'px' : '?'));
    verificar(`${ctx} · A8 la banda no cambia de alto en lector`,
      m.banda.altoCambiaConLector === false,
      'cambia=' + m.banda.altoCambiaConLector +
      ' (.admin-action-btn visibles en lector: ' + m.banda.adminVisiblesEnLector + ')');
    verificar(`${ctx} · A8 la banda tiene 5 entradas`,
      m.banda.entradas === UMBRAL.bandaEntradas,
      m.banda.entradas + ' de ' + UMBRAL.bandaEntradas);
    verificar(`${ctx} · A8 la lista de la banda scrollea de lado`,
      !!m.banda.lista && m.banda.lista.scrollea === true,
      m.banda.lista ? 'scrollW ' + m.banda.lista.scrollW + ' > clientW ' +
        m.banda.lista.clientW : 'sin .section-rail-list');
    verificar(`${ctx} · A8 ancho del contenido de la banda`,
      casi(m.banda.anchoContenidoSumaCajas, UMBRAL.bandaContenido, 8),
      m.banda.anchoContenidoSumaCajas + 'px (esperado ' + UMBRAL.bandaContenido + ' ±8)');

    /* ---------------- ASERCIONES "POR ANCHO" -------------------------
       SOLO en el pase pedido. El pase de ancho real tiene otro `clientWidth`
       (TRAMPA 1) y un umbral escrito contra 320 no se le puede aplicar. */
    if (pase === 'pedido') {
      /* A9 — el piso del concepto: el ancho que hay que GANAR con el arreglo.
         Un piso, no una igualdad: lo que importa es que el arreglo sigue
         haciendo su trabajo, no que dé el mismo número que ayer. */
      const minW = minTitulo(m);
      if (fixture === 'baseline' && ancho === 320) {
        verificar(`${ctx} · A9a el concepto no baja de ${UMBRAL.concepto320Baseline}px`,
          minW >= UMBRAL.concepto320Baseline,
          'concepto mínimo ' + minW + 'px (piso ' + UMBRAL.concepto320Baseline + ')');
      }
      if (fixture === 'baseline' && ancho === 390) {
        verificar(`${ctx} · A9b el concepto no baja de ${UMBRAL.concepto390Baseline}px`,
          minW >= UMBRAL.concepto390Baseline,
          'concepto mínimo ' + minW + 'px (piso ' + UMBRAL.concepto390Baseline + ')');
      }
      if (fixture === 'produccion4digitos' && (ancho === 320 || ancho === 390)) {
        const piso = ancho === 320 ? UMBRAL.concepto320Produccion : UMBRAL.concepto390Produccion;
        const techo = ancho === 320 ? 173 : 243;   // el valor de `baseline` a este ancho
        /* 83px es el valor documentado de ANTES del arreglo, y solo existe para
           320 (libro.css lo cuenta como "165px que se recortaban"). A 390 el
           piso de la guarda es cero y lo que se vigila es el techo. */
        const pisoViejo = ancho === 320 ? 83 : 0;
        verificar(`${ctx} · A9c el concepto en producción no baja de ${piso}px`, minW >= piso,
          'concepto mínimo ' + minW + 'px (piso ' + piso + ')');
        /* LA GUARDA DE CORDURA, y va aparte del piso a propósito.
           El piso es un número que se calibre; la guarda es una afirmación
           sobre el fixture. Si el concepto en producción a 320 midiera 80 o
           180, el piso "pasa" o "falla" por razones que no tienen que ver con
           el arreglo: significaría que la fixture cambió de forma, que el
           concepto se alargó, o que el CSS se movió. Es una señal de que hay
           que ir a MIRAR, no un número para maquillar. */
        verificar(`${ctx} · A9c el piso calibrado cae en la franja real`,
          minW > pisoViejo && minW < techo,
          'concepto ' + minW + 'px, tiene que quedar entre ' + (pisoViejo + 1) +
          ' y ' + (techo - 1) + ' (piso previo al arreglo / techo de baseline a este ancho)');
      }

      /* A10 — la caja del importe ACOTADA. El arreglo dio 8px de hueco al
         concepto; si el importe se pasa de su columna, los recuperó él. */
      if (fixture === 'produccion4digitos') {
        const anchos = m.filas.detalle.map(f => (f.amount && f.amount.divs[0] ? f.amount.divs[0].caja.w : null))
          .filter(x => typeof x === 'number');
        const peor = anchos.length ? Math.max(...anchos) : null;
        verificar(`${ctx} · A10 la caja del importe no pasa de ${UMBRAL.importeProduccion}px`,
          peor !== null && peor <= UMBRAL.importeProduccion,
          'importe más ancho ' + (peor === null ? '?' : peor + 'px') +
          ' (columna base 88px, umbral ' + UMBRAL.importeProduccion + ' con los ±8 de fuente)');
      }

      /* A11 — densidad: cuántas filas COMPLETAS entran y dónde arranca la
         primera. Es lo que se pierde cuando un renglón nuevo se cuela arriba. */
      verificar(`${ctx} · A11 ${UMBRAL.filasCompletas} filas completas en pantalla`,
        m.filas.completasEnPantalla === UMBRAL.filasCompletas,
        m.filas.completasEnPantalla + ' de ' + m.filas.total +
        ' (alto viewport ' + m.ancho.altoViewport + 'px)');
      verificar(`${ctx} · A11 la primera fila arranca en y≈${UMBRAL.primeraFilaY}`,
        m.filas.primeraFilaY !== null && casi(m.filas.primeraFilaY, UMBRAL.primeraFilaY, 30),
        'y=' + m.filas.primeraFilaY + ' (esperado ' + UMBRAL.primeraFilaY + ' ±30)');

      /* A12 — el feed: el concepto del movimiento entra entero y el importe no
         se lo come. El piso es el ancho que dejó el arreglo, medido. */
      const izq = m.feed.detalle.map(f => (f.txLeft ? f.txLeft.caja.w : 0));
      const minIzq = izq.length ? Math.min(...izq) : 0;
      const pisoFeed = ancho === 320 ? UMBRAL.feedIzq320 : UMBRAL.feedIzq390;
      verificar(`${ctx} · A12 el .tx-left no baja de ${pisoFeed}px`,
        m.feed.detalle.length > 0 && minIzq >= pisoFeed,
        '.tx-left mínimo ' + minIzq + 'px (piso ' + pisoFeed + ')');
      const h4Cortados = m.feed.detalle.filter(f => f.conceptoH4 && f.conceptoH4.recortado);
      verificar(`${ctx} · A12 ningún concepto del feed recortado`, h4Cortados.length === 0,
        h4Cortados.length + ' de ' + m.feed.total +
        (h4Cortados.length ? ' (' + h4Cortados.map(x => x.concepto).join(', ') + ')' : ''));

      /* A13 — el botón de editar SE VE. Un control de 36x36 con `opacity: 0`
         es un control muerto en un riel angosto, donde las acciones no tienen
         ":hover" que las aparezca. Se lee la opacidad COMPUTADA de la primera
         fila: con la fuente de fallback esto no cambia, es un hecho de layout. */
      const primera = m.filas.detalle[0];
      const editar = primera ? primera.botones.find(b => b.sel === '.btn-edit-expense') : null;
      verificar(`${ctx} · A13 el botón de editar es visible`,
        !!editar && editar.opacity === '1',
        'opacity=' + (editar ? editar.opacity : 'sin botón') +
        ' en "' + (primera ? primera.concepto : '?') + '"' +
        (m.ancho.hoverNone ? ' [el navegador declara hover:none, ver A13 en el informe]' : ''));
    }
  }

  /* ---------------- 768: ASERCIONES DE FRONTERA, NO DE TELÉFONO --------
     768 NO entra al `@media 640px`. Lo que hay que clavar NO es que el teléfono
     siga siendo teléfono, sino que las reglas de 640 no sangren hacia arriba:
     el importe vuelve a ser `block`, los botones vuelven a 22 y el subtotal del
     riel vuelve a estar escrito. Son tres regresiones que una media query mal
     cerrada rompe sin que nadie lo note en un escritorio. */
  if (ancho === 768 && pase === 'pedido') {
    verificar(`${ctx} · B1 768 no entra al @media de 640`,
      m.ancho.media640 === false, 'media640=' + m.ancho.media640 +
      ' (clientWidth ' + m.ancho.clientWidth + ')');

    const displays768 = [...new Set(m.filas.detalle.map(f => (f.amount ? f.amount.display : 'null')))];
    verificar(`${ctx} · B2 el importe NO está disuelto a 768`,
      m.filas.detalle.length > 0 && m.filas.detalle.every(f => f.amount && f.amount.display === 'block'),
      'display=' + JSON.stringify(displays768));

    const chicos768 = [];
    m.filas.detalle.forEach(f => f.botones.forEach(b => {
      if (b.sel === '.btn-status-toggle') return;
      if (b.w !== UMBRAL.chico || b.h !== UMBRAL.chico) {
        chicos768.push((f.concepto || '?') + ' ' + b.sel + ' ' + b.w + 'x' + b.h);
      }
    }));
    verificar(`${ctx} · B3 los botones vuelven a ${UMBRAL.chico}x${UMBRAL.chico}`,
      chicos768.length === 0,
      chicos768.length ? chicos768.slice(0, 4).join(' | ') :
        (m.filas.total * 2) + ' botones de ' + UMBRAL.chico + 'x' + UMBRAL.chico);

    verificar(`${ctx} · B4 el subtotal del riel vuelve a estar escrito`,
      m.banda.totales.length > 0 && m.banda.totales.every(t => t.display !== 'none'),
      m.banda.totales.length + ' totales, display=' + JSON.stringify(m.banda.totales.map(t => t.display)));
  }
}

/* La fuente es de CDN. Sin esto, dos corridas dan anchos distintos y la
   diferencia parece una regresión. TRAMPA 2. */
async function esperarFuente(sb) {
  const listo = await sb.eval(
    'document.fonts.ready.then(function(){ return document.fonts.status; })',
    { awaitPromise: true });
  await new Promise(z => setTimeout(z, 800));
  return listo;
}

/* TRAMPA 4 — pero acumulada, no corta. Una llave de más se come el `@media`
   entero y todas las reglas de 640, que es lo que hace que esto cueste: sin
  Css desbalanceado, cinco invariantes de teléfono y tres de frontera después
   reportan "todo bien" sobre una hoja que ya no se está leyendo entera. */
const malas = verificarEstructuraCss(ROOT_CSS);
if (malas.length) {
  verificar('CSS · llaves balanceadas en las hojas',
    false, malas.join(' | ') + ' — el navegador se come todo lo que viene después');
} else {
  console.log('CSS balanceado en', fs.readdirSync(ROOT_CSS).filter(x => x.endsWith('.css')).length, 'hojas.');
}

/* ------------------------------------------------------------------
 * EL BUCLE: fixture × ancho
 * ------------------------------------------------------------------ */
const salida = {};
let celdasMedidas = 0;

/* Un ancho sin invariantes declarados no es un ancho nuevo. Es un ancho para el
   que este archivo no sabe qué afirmar, y salir con 0 sin haber asserted nada
   sería W1 con otro nombre: el mismo bug, más difícil de ver. Se descarta UNA
   vez por ancho, antes del bucle de fixtures, para no repetir el mismo INFRA
   dos veces en la salida. */
const ANCHOS_MEDIBLES = ANCHOS.filter(a => {
  if (ANCHOS_SOPORTADOS.has(a)) return true;
  verificarInfra(`ancho@${a} · hay invariantes declarados para este ancho`, false,
    'este arnés declara invariantes para ' + [...ANCHOS_SOPORTADOS].join(', ') +
    '; pediste ' + a + '. Medirlo y no afirmar nada sería un verde falso.');
  return false;
});

for (const fixture of FIXTURAS) {
  salida[fixture] = {};

  for (const ancho of ANCHOS_MEDIBLES) {
    const alto = ALTO_DE(ancho);
    let sb = null;
    try {
      sb = await launchSandbox({ fixture, width: ancho, height: alto });
    } catch (e) {
      /* Sin navegador no hay medidas: eso es INFRA, no layout roto. */
      verificarInfra(`${fixture}@${ancho} · el sandbox arrancó`, false,
        String(e && e.message ? e.message : e).split('\n')[0]);
      continue;
    }

    try {
      await sb.markBootBaseline();
      const fuente = await esperarFuente(sb);
      await sb.pump(3);

      /* PASE 1 - el ancho pedido. Es el que se captura y el que da nombre al
         archivo. `clientWidth` sale 15px menos; se reporta, no se esconde. */
      await sb.eval(`window.__pedido = ${ancho}; 1`);
      const pedido = await sb.eval(MEDIR);

      if (!SIN_CAPTURA) {
        await sb.shot(path.join(DIR, `movil-${fixture}-${ancho}.png`));
        /* La vista de las filas: el concepto se lee arriba de todo, y arriba es
           justo donde no se lee. Scrollear hasta la primera fila menos el
           encabezado del grupo es lo que hace falta para VER el recorte. */
        const y = Math.max(0, (pedido.filas.primeraFilaY || 0) - 120);
        await sb.eval(`window.scrollTo(0, ${y}); 1`);
        await sb.pump(2);
        await new Promise(z => setTimeout(z, 350));
        await sb.shot(path.join(DIR, `movil-${fixture}-${ancho}-filas.png`));
        await sb.eval('window.scrollTo(0, 0); 1');
        await sb.pump(1);
        await new Promise(z => setTimeout(z, 250));
      }

      /* PASE 2 - el ancho REAL. `resize(ancho + 15)` es lo único que deja
         clientWidth === ancho, porque el scrollbar sigue ahí (TRAMPA 1). Solo
         cuando hay algo que medir: para 768, que no es un teléfono, no hace
         falta una segunda pasada. Los invariantes de teléfono (A1-A8) se
         cumplen también en este pase; los "por ancho" (A9-A13) no, porque
         este pase tiene otro clientWidth y su umbral está escrito para el
         pedido. */
      let real = null;
      if (REAL && ancho <= 640) {
        await sb.resize(ancho + 15, alto);
        await esperarFuente(sb);
        await sb.pump(2);
        await sb.eval(`window.__pedido = ${ancho}; 1`);
        real = await sb.eval(MEDIR);
      }

      salida[fixture][ancho] = { pedido, real, fuente, alto };
      celdasMedidas++;

      const ctx = `${fixture}@${ancho}`;
      console.log(`\n===== ${ctx} pedido (clientWidth ${pedido.ancho.clientWidth}, alto ${alto}) =====` +
        (real ? ` | real (clientWidth ${real.ancho.clientWidth})` : ''));
      console.log('  fuente:', pedido.tipografia.lista, pedido.tipografia.status,
        '| hover:none:', pedido.ancho.hoverNone,
        '| media640:', pedido.ancho.media640,
        '| filas:', pedido.filas.total, '| movimientos:', pedido.feed.total);
      console.log('  banda  :', pedido.banda.entradas, 'entradas,',
        pedido.banda.anchoContenidoSumaCajas + 'px de contenido,',
        pedido.banda.altoAdmin.h + 'px de alto',
        '| totales:', JSON.stringify(pedido.banda.totales.map(t => t.display)));
      console.log('  filas  :', pedido.filas.completasEnPantalla, 'completas,',
        '1ra en y=' + pedido.filas.primeraFilaY,
        '| concepto min ' + minTitulo(pedido) + 'px',
        '| recortados ' + pedido.filas.detalle.filter(x => x.titulo && x.titulo.recortado).length +
        '/' + pedido.filas.total);
      console.log('  detalle:', pedido.filas.detalle.map(f => {
        const d = f.amount ? f.amount.divs : [];
        return (f.concepto || '?').replace('PRUEBA-ALFA ', '') + ':' +
          (d.length ? d.map(x => x.caja.w + 'px/' + x.gridArea).join(' + ') : 'SIN IMPORTE');
      }).join('  '));
      console.log('  console errors:', JSON.stringify(sb.consoleErrors));
      console.log('  excepciones   :', JSON.stringify(sb.exceptions));

      /* --- ASSERT --- */
      verificar(`${ctx} · la página no tiró errores de consola`, sb.consoleErrors.length === 0,
        JSON.stringify(sb.consoleErrors).slice(0, 300));
      verificar(`${ctx} · la página no tiró excepciones`, sb.exceptions.length === 0,
        JSON.stringify(sb.exceptions).slice(0, 300));

      if (real) {
        verificar(`${ctx} · la segunda pasada no ensució la página`,
          sb.consoleErrors.length === 0 && sb.exceptions.length === 0, '');
      }

      evaluar(fixture, ancho, 'pedido', pedido);
      if (real) evaluar(fixture, ancho, 'real', real);
    } catch (e) {
      /* Excepción midiendo: no hay veredicto de layout, hay INFRA. No se hace
         `process.exit` acá: todavía quedan celdas por medir y cada una es
         evidencia. */
      verificarInfra(`${fixture}@${ancho} · la medición se completó`, false,
        String(e && e.message ? e.message : e).split('\n')[0]);
    } finally {
      await sb.close();
    }
  }
}

console.log('\n===== RESUMEN DE MEDIDAS (no es el veredicto) =====');
for (const fixture of FIXTURAS) {
  for (const ancho of ANCHOS_MEDIBLES) {
    const celda = salida[fixture] && salida[fixture][ancho];
    if (!celda) continue;
    const p = celda.pedido;
    console.log(`${fixture}/${ancho} -> clientWidth ${p.ancho.clientWidth}` +
      ` | banda ${p.banda.altoAdmin.h}px (lector ${p.banda.altoLector.h}px)` +
      ` | entradas ${p.banda.entradas} / contenido ${p.banda.anchoContenidoSumaCajas}px` +
      ` | concepto min ${minTitulo(p)}px` +
      ` | recortados ${p.filas.detalle.filter(x => x.titulo && x.titulo.recortado).length}/${p.filas.total}` +
      ` | 1ra fila y=${p.filas.primeraFilaY} / completas ${p.filas.completasEnPantalla}` +
      ` | tx-izq ${p.feed.detalle[0] && p.feed.detalle[0].txLeft ? p.feed.detalle[0].txLeft.caja.w + 'px' : '?'}` +
      ` | scroll horiz ${p.documento.scrollHorizontal ? 'SI' : 'no'}`);
  }
}

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'movil.report.json'), JSON.stringify(salida, null, 1), 'utf8');

/* ------------------------------------------------------------------ SALIDA */
console.log('\n===== ASERCIONES =====');
console.log(`celdas medidas: ${celdasMedidas} de ${FIXTURAS.length * ANCHOS_MEDIBLES.length}\n`);
for (const p of pasa) console.log('  OK    ' + p);
if (falla.length) {
  console.log('');
  for (const f of falla) console.log('  FALLA ' + f);
}
if (infra.length) {
  console.log('');
  for (const i of infra) console.log('  INFRA ' + i);
}
console.log('\n  ' + pasa.length + ' aserciones cumplen · ' + falla.length + ' no cumplen' +
  (infra.length ? ' · ' + infra.length + ' no medibles (infraestructura)' : ''));

const codigo = falla.length ? 1 : (infra.length ? 2 : 0);
console.log('código de salida:', codigo, codigo === 0 ? '(todo PASS)' :
  codigo === 1 ? '(layout roto)' : '(infraestructura: ni PASS ni FAIL)');
process.exit(codigo);