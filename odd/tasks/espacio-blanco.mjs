/* DIAGNOSTICO —.empty space + navigation cost in the CURRENT state.
 *
 * Read-only. Nothing is written to the app: it opens the page, hides the role
 * modal (an injected style, not a code change), freezes remote writes, and then
 * only reads geometry.
 *
 * Answers three questions with numbers, not opinions:
 *   1. Where is the empty space? (rail voids, gutters, bands above the content)
 *   2. How many "control bands" does a row of expenses sit below?
 *   3. How many clicks to reach a common target?
 */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, PAGE_URL } from './cdp.mjs';

const CAPTURAS = path.resolve('capturas', 'odd', 'tasks');

/* Reads the geometry of the visible chrome and content. Everything is
 * getBoundingClientRect + getComputedStyle: no assumption about the classes,
 * so it keeps working after the DOM changes. */
const MEDIR = String.raw`(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  /* offsetParent no sirve: .app-main-area es fixed y devuelve null para todos
   * sus descendientes aunque esten pintados. El area del rect si. */
  const vis = el => { if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0; };
  const box = sel => { const el = document.querySelector(sel); return vis(el) ? r(el) : null; };

  /* ---- 1. RAIL: where is the void? ---- */
  const rail = document.getElementById('appSidebar');
  const railBox = r(rail);
  const hijosRail = [...rail.children].filter(vis).map(el => ({
    sel: el.className || el.id, ...r(el) }));
  /* the tallest vertical gap between consecutive rail children */
  let huecoRail = 0, entre = null;
  for (let i = 1; i < hijosRail.length; i++) {
    const d = hijosRail[i].y - (hijosRail[i - 1].y + hijosRail[i - 1].h);
    if (d > huecoRail) { huecoRail = d; entre = [hijosRail[i - 1].sel, hijosRail[i].sel]; }
  }

  /* ---- 2. MAIN: how many bands before the first expense row? ---- */
  const main = document.querySelector('.main-content');
  const mainBox = r(main);
  /* T5: el id listServiciosFijos ya no existe —el libro agrupa por categoría, y
     los fijos y los variables de Servicios son el mismo grupo—. La primera fila
     del libro es la primera fila de Servicios, y ese es el ancla que hay que
     medir: es la fila que la persona quiere ver primero. */
  const primeraFila = document.querySelector('#ledgerRowsServicios .expense-card-item')
    || document.querySelector('.expense-card-item');
  const capas = [...document.querySelectorAll('#viewMes > *')].filter(vis).map(el => ({
    sel: el.className || el.id, ...r(el) }));

/* ---- 3. The gutter: how much of the viewport is not content? ----
   * T1 Tapareo el ancla: la clase .metrics-row ya no existe (sus cuatro
   * celdas bajaron a .ledger-toolbar), asi que el selector daba null y
   * anchoUtil/canalIzq quedaban en null sin decir por que. Se apunta a la
   * PRIMERA BANDA de la vista, que sigue siendo la misma cosa: la banda que
   * abre el contenido. canalDer nunca cambio de ancla.
   *
   * T5: la clase .segments-workspace-container tambien se fue, con las cuatro
   * tarjetas: ahora el libro es #ledgerBody. */
  const anchoTotal = window.innerWidth;
  const primero = document.querySelector('#viewMes .ledger-toolbar');
  const ultimo = document.querySelector('#viewMes #ledgerBody');
  const anchoUtil = vis(primero) && vis(ultimo)
    ? Math.round(ultimo.getBoundingClientRect().right - primero.getBoundingClientRect().left)
    : null;

  /* ---- 4. Rows per screen: how many expense rows fit in one viewport? ---- */
  const filas = [...document.querySelectorAll('.expense-card-item')].filter(vis);
  const alturas = filas.map(f => +f.getBoundingClientRect().height.toFixed(1));
  const primeraY = filas.length ? filas[0].getBoundingClientRect().y : null;

  /* T5 — filasEnPantalla SE CORRIGIÓ, Y NO PARA QUE DIERA MEJOR NÚMERO.
   *
   * La fórmula anterior era (altoDeVentana - primeraY) / altoDeFila: un
   * número que no existía. Multiplicaba el alto de UNA fila por una distancia
   * que, en un libro agrupado, no es una distancia de filas: entre la primera
   * y la última hay encabezados de grupo, filetes y estados vacíos. Con cuatro
   * tarjetas arriba la diferencia se notaba poco; con el libro, el contador
   * habría contado filas que no están y la métrica habría dejado de ser
   * una medida.
   *
   * Ahora cuenta filas REALES cuyo borde superior cae dentro del viewport: una
   * fila cortada por el borde inferior se ve, se lee y se puede tocar, así que
   * entra. Lo que no se hace es inventar filas.
   *
   * Y como eso deja de contestar la pregunta que la métrica realmente hace —
   * "¿cuántas filas CABEN en una pantalla?"—, se agrega capacidadFilas. La
   * diferencia importa: con el mes que hay en localStorage hay 9 gastos, así
   * que filasEnPantalla no puede decir 14 aunque la maquetación las soporte.
   * capacidadFilas responde a la maquetación, con la cota superior que
   * corresponde: una fila cada alturaFila.media, sin cruzar otro encabezado de
   * grupo. Los 32px de cada encabezado que se cruce salen de bloqueos. */
  const filasEnPantalla = filas.filter(f => f.getBoundingClientRect().top < window.innerHeight);
  const bloqueos = [...document.querySelectorAll(
    '.ledger-group-head, .ledger-group-filters, .empty-feed-placeholder')]
    .filter(vis).map(el => ({ sel: el.className, ...r(el) }));
  const alturaFilaMedia = alturas.length
    ? alturas.reduce((a, b) => a + b, 0) / alturas.length : null;

  return {
    viewport: { w: anchoTotal, h: window.innerHeight },
    rail: { ...railBox, scrollH: rail.scrollHeight, clientH: rail.clientHeight,
      scrollea: rail.scrollHeight > rail.clientHeight + 1,
      hijosRail, huecoRail: +huecoRail.toFixed(1), entre,
      alturaUsada: hijosRail.length ? Math.round(hijosRail[hijosRail.length - 1].y + hijosRail[hijosRail.length - 1].h - railBox.y) : 0 },
    /* BUG CORREGIDO: canalIzq restaba de railBox.right, y r() devuelve
       {x, y, w, h} — no hay ningún .right, así que la resta daba NaN y el
       gutter izquierdo salía null en cada corrida sin que nadie lo notara.
       Y se pregunta por VISIBILIDAD: en la vista Consolidado el toolbar de la
       Vista Mensual existe pero no está pintado, así que su rect es de ceros y
       el gutter daba -236. Un gutter de una vista oculta no es un gutter:
       no hay ninguno, y se dice null. */
    main: { ...mainBox, anchoUtil,
      canalIzq: vis(primero) ? Math.round(primero.getBoundingClientRect().left - (railBox.x + railBox.w)) : null,
      canalDer: vis(ultimo) ? Math.round(anchoTotal - ultimo.getBoundingClientRect().right) : null },
    capas,
    primeraFilaY: primeraY === null ? null : +primeraY.toFixed(1),
    filasVisibles: filas.length,
    gastosEnElMes: filas.length,
    alturaFila: alturas.length ? { min: Math.min(...alturas), max: Math.max(...alturas), media: Math.round(alturas.reduce((a, b) => a + b, 0) / alturas.length) } : null,
    filasEnPantalla: primeraY === null ? null : filasEnPantalla.length,
    capacidadFilas: primeraY === null || !alturaFilaMedia
      ? null : Math.max(0, Math.floor((window.innerHeight - primeraY) / alturaFilaMedia)),
    bloqueos: { cantidad: bloqueos.length, altoTotal: Math.round(bloqueos.reduce((a, b) => a + b.h, 0)), detalle: bloqueos },
  };
})()`;

const s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 1200));
  /* localStorage recuerda la ultima vista: si quedo en Consolidado, esta
   * medicion seria de la otra mitad de la navegacion. Se fuerza mensual. */
  await s.page.eval(`document.getElementById('btnNavMes').click(); 'ok'`);
  await new Promise(r => setTimeout(r, 1200));
  await s.pump(3);

  const m = await s.page.eval(MEDIR);
  console.log(JSON.stringify(m, null, 2));

  await s.shot(path.join(CAPTURAS, 'diag-espacio-blanco-1440.png'));

  /* Consolidated view: it is the second half of the navigation. */
  await s.page.eval(`document.getElementById('btnNavPanel').click(); 'ok'`);
  await new Promise(r => setTimeout(r, 1200));
  await s.pump(3);
  const p = await s.page.eval(MEDIR);
  console.log('--- CONSOLIDADO ---');
  console.log(JSON.stringify({ rail: p.rail, main: p.main, capas: p.capas }, null, 2));
  await s.shot(path.join(CAPTURAS, 'diag-espacio-blanco-panel.png'));

  /* Narrow: the drawer layout, where the rail becomes an overlay. */
  await s.resize(1024, 900);
  await new Promise(r => setTimeout(r, 900));
  await s.page.eval(`document.getElementById('btnNavMes').click(); 'ok'`);
  await new Promise(r => setTimeout(r, 1000));
  await s.pump(3);
  const n = await s.page.eval(MEDIR);
  console.log('--- 1024 ---');
  console.log(JSON.stringify({ main: n.main, capas: n.capas, filasVisibles: n.filasVisibles, filasEnPantalla: n.filasEnPantalla }, null, 2));
  await s.shot(path.join(CAPTURAS, 'diag-espacio-blanco-1024.png'));
} finally {
  await s.close();
}