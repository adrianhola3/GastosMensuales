/* movil.mjs - La pantalla angosta, medida y capturada. El teléfono es un producto
 * distinto al que miden `reglas.mjs` (1440) y `contraste-diseno.mjs`: tiene su
 * propia retícula, sus propios cortes y sus propias cifras, y ninguna de las dos
 * rondas anteriores lo cubrió.
 *
 * POR QUÉ ESTE ARCHIVO Y NO `diseno.mjs`
 * --------------------------------------
 * `diseno.mjs` mide la vista de escritorio en 1440/390. Este mide el teléfono en
 * 320/390/768 y, sobre todo, mide lo que `diseno.mjs` no pregunta: si un texto se
 * RECORTA o entra entero, si dos cajas caen en celdas distintas de la retícula y
 * cuántas filas entran en una pantalla de 844. Esos tres son los que un rediseño
 * rompe en silencio — la página se ve "casi bien" y nadie mide.
 *
 * LO QUE TIRA
 * -----------
 *   capturas/movil-<ancho>.png         la vista desde arriba, con la banda de
 *                                       secciones a la vista
 *   capturas/movil-<ancho>-filas.png   la misma página scrolleada hasta las
 *                                       filas de gasto: es donde se lee el
 *                                       recorte de un concepto, que arriba no
 *                                       se ve porque queda debajo del pliegue
 *   y un bloque JSON de MEDIDAS por consola, que es la prueba.
 *
 *   node odd\tasks\movil.mjs                    (320, 390, 768)
 *   node odd\tasks\movil.mjs 390                (uno solo)
 *   node odd\tasks\movil.mjs --sin-captura      (solo medidas, no escribe PNG)
 *   node odd\tasks\movil.mjs --ancho-real 320   (clientWidth exacto de 320)
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
 *    Toda medidasale con `clientWidth` al lado. Una cifra sin ese número al lado
 *    no es una medida, es una conjetura con decimal.
 *
 * 2. IBM PLEX SANS VIENE DE CDN.
 *    Sin `await document.fonts.ready` + una pausa, dos corridas dan anchos
 *    distintos y la diferencia parece una regresión. Se espera SIEMPRE.
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
 *    partido en varios archivos. Se comprueba ANTES de capturar, no después.
 *
 * POR QUÉ `launchSandbox` Y NO `openPage`
 * ---------------------------------------
 * `openPage` (cdp.mjs) se conecta al navegador del usuario y abre una ventana
 * REAL Y VISIBLE, y además entra en MODO LECTOR: `.admin-action-btn` ocultos y
 * `exigirAdmin()` rechazando escrituras. Para una fixture de solo lectura alcanza,
 * pero acá se quiere medir el botón de editar y el de borrar, que en lector no
 * tienen caja. `launchSandbox` lanza su propio navegador headless, tira el perfil
 * después y siembra la fixture sintética `baseline`.
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
        return { sel, caja: r(e), w: e ? Math.round(e.getBoundingClientRect().width) : null,
                 h: e ? Math.round(e.getBoundingClientRect().height) : null };
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
      /* Cuál scrollea de lado, si alguno: el culpable tiene nombre. */
      culpables: [...document.querySelectorAll('body *')].filter(e => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.right > de.clientWidth + 1 &&
               getComputedStyle(e).overflowX === 'visible';
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

const malas = verificarEstructuraCss(ROOT_CSS);
if (malas.length) {
  console.error('CSS DESBALANCEADO — las reglas de adentro pueden estar muerto:\n  ' + malas.join('\n  '));
  process.exit(1);
}
console.log('CSS balanceado en', fs.readdirSync(ROOT_CSS).filter(x => x.endsWith('.css')).length, 'hojas.');

/* La fuente es de CDN. Sin esto, dos corridas dan anchos distintos y la
   diferencia parece una regresión. TRAMPA 2. */
async function esperarFuente(sb) {
  const listo = await sb.eval(
    'document.fonts.ready.then(function(){ return document.fonts.status; })',
    { awaitPromise: true });
  await new Promise(z => setTimeout(z, 800));
  return listo;
}

const salida = {};

for (const ancho of ANCHOS) {
  const alto = ALTO_DE(ancho);
  const sb = await launchSandbox({ fixture: 'baseline', width: ancho, height: alto });
  try {
    await sb.markBootBaseline();
    const fuente = await esperarFuente(sb);
    await sb.pump(3);

    /* PASE 1 - el ancho pedido. Es el que se captura y el que da nombre al
       archivo. `clientWidth` sale 15px menor; se reporta, no se esconde. */
    await sb.eval(`window.__pedido = ${ancho}; 1`);
    const pedido = await sb.eval(MEDIR);

    if (!SIN_CAPTURA) {
      await sb.shot(path.join(DIR, `movil-${ancho}.png`));
      /* La vista de las filas: el concepto se lee arriba de todo, y arriba es
         justo donde no se lee. Scrollear hasta la primera fila menos el
         encabezado del grupo es lo que hace falta para VER el recorte. */
      const y = Math.max(0, (pedido.filas.primeraFilaY || 0) - 120);
      await sb.eval(`window.scrollTo(0, ${y}); 1`);
      await sb.pump(2);
      await new Promise(z => setTimeout(z, 350));
      await sb.shot(path.join(DIR, `movil-${ancho}-filas.png`));
      await sb.eval('window.scrollTo(0, 0); 1');
      await sb.pump(1);
      await new Promise(z => setTimeout(z, 250));
    }

    /* PASE 2 - el ancho REAL. `resize(ancho + 15)` es lo único que deja
       clientWidth === ancho, porque el scrollbar sigue ahí (TRAMPA 1). Solo
       cuando hay algo que medir: para 1440, que no es un teléfono, no hace
       falta una segunda pasada. */
    let real = null;
    if (REAL && ancho <= 640) {
      await sb.resize(ancho + 15, alto);
      await esperarFuente(sb);
      await sb.pump(2);
      await sb.eval(`window.__pedido = ${ancho}; 1`);
      real = await sb.eval(MEDIR);
    }

    salida[ancho] = { pedido, real, fuente, alto };

    console.log(`\n===== ${ancho}px pedido (clientWidth ${pedido.ancho.clientWidth}, alto ${alto}) =====`);
    console.log(JSON.stringify({ pedido, real }, null, 1));
    console.log('fuente lista:', fuente, '| console errors:', JSON.stringify(sb.consoleErrors));
    console.log('excepciones   :', JSON.stringify(sb.exceptions));
  } finally {
    await sb.close();
  }
}

console.log('\n===== RESUMEN =====');
for (const w of Object.keys(salida)) {
  const p = salida[w].pedido;
  const f = p.filas.detalle[0];
  const h4 = p.feed.detalle[0];
  console.log(`${w} pedido -> clientWidth ${p.ancho.clientWidth}` +
    ` | banda ${p.banda.altoAdmin.h}px (lector ${p.banda.altoLector.h}px)` +
    ` | entradas ${p.banda.entradas} / contenido ${p.banda.anchoContenidoSumaCajas}px` +
    ` | concepto ${f && f.titulo ? f.titulo.caja.w + 'px' : '?'}` +
    ` | recortados ${p.filas.detalle.filter(x => x.titulo && x.titulo.recortado).length}/${p.filas.total}` +
    ` | 1ra fila y=${p.filas.primeraFilaY} / completas ${p.filas.completasEnPantalla}` +
    ` | tx-izq ${h4 && h4.txLeft ? h4.txLeft.caja.w + 'px' : '?'}` +
    ` | scroll horiz ${p.documento.scrollHorizontal ? 'SI' : 'no'}`);
}
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'movil.report.json'), JSON.stringify(salida, null, 1), 'utf8');
console.log('informe:', path.join(DIR, 'movil.report.json'));