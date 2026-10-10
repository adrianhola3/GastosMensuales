/* diag-strip3.mjs - Probar la correccion antes de escribirla.
 *
 * HECHO ESTABLECIDO: la tira necesita 1049.8px en una linea; a 1440 con rail de
 * 236 + columna de 200 + padding de 96 quedan 908px. Faltan 141.8px, y el ancho
 * es DATO, no aire: las cuatro celdas que no son "Pagado" no tienen ni un px
 * de sobrante.
 *
 * LO QUE SE PRUEBA, en este orden, sin escribir nada en la hoja todavia:
 *   1. mover "Abono"/"Gasto" al renglon de abajo (el del buscador). La tira
 *      entonces lleva SOLO las cinco celdas comparables, que es lo que la hoja
 *      dice que es una tira de cifras. Se recuperan 110.1 + 8 = 118.1px.
 *   2. si todavia falta, achicar la pista de 72 a 40px: se recuperan 32px.
 *
 * La pregunta que responde: alcanza, o la columna de secciones tiene que bajar
 * de 200px?
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  const medir = async etiqueta => {
    await sb.pump(2);
    const r = await sb.eval(`(() => {
      const strip = document.querySelector('.ledger-strip');
      const celdas = [...strip.querySelectorAll('.ledger-cell')];
      const tops = new Set(celdas.map(c => Math.round(c.getBoundingClientRect().top)));
      const barra = document.querySelector('.ledger-toolbar');
      const nav = document.querySelector('.ledger-row-nav');
      const d = document.documentElement;
      const principal = document.querySelector('.main-content');
      /* la primera fila de gasto, para ver si el scroll total mejoro */
      const primera = document.querySelector('.expense-card-item');
      return {
        filasDeCeldas: tops.size,
        altoBarra: +barra.getBoundingClientRect().height.toFixed(1),
        altoNav: +nav.getBoundingClientRect().height.toFixed(1),
        mainScrollHeight: principal.scrollHeight,
        primeraFilaY: primera ? +primera.getBoundingClientRect().y.toFixed(1) : null,
        scrollX: d.scrollWidth - d.clientWidth,
        anchoSearch: +document.querySelector('.command-search-box').getBoundingClientRect().width.toFixed(1),
        recorteLabel: [...document.querySelectorAll('.ledger-cell-label, .rail-entry-name')]
          .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
      };
    })()`);
    console.log(`  ${etiqueta.padEnd(42)} filas:${r.filasDeCeldas} barra:${String(r.altoBarra).padStart(6)}px nav:${String(r.altoNav).padStart(5)}px scrollH:${String(r.mainScrollHeight).padStart(5)} 1aFila:${r.primeraFilaY} scrollX:${r.scrollX}` +
      (r.recorteLabel.length ? '  RECORTA: ' + r.recorteLabel.join(', ') : ''));
    return r;
  };

  console.log('\n=== ESTADO ACTUAL ===');
  await medir('base (acciones en la tira)');

  /* 1. Acciones al renglon de abajo. */
  await sb.eval(`(() => {
    const strip = document.querySelector('.ledger-strip');
    const nav = document.querySelector('.ledger-row-nav');
    nav.appendChild(strip.querySelector('.ledger-actions'));
    return 'movido';
  })()`);
  console.log('\n=== 1. ACCIONES ABAJO (la tira queda con 5 celdas) ===');
  await medir('acciones movidas al renglon del buscador');

  /* 2. Pista de 72 a 40px. */
  await sb.eval(`(() => {
    document.querySelector('.payments-track').style.flex = '0 0 40px';
    return 'pista40';
  })()`);
  console.log('\n=== 2. + PISTA DE 40px ===');
  await medir('pista 40px');

  /* 3. Con la pista en 40, cuanto margen queda para la columna? */
  const holgura = await sb.eval(`(() => {
    const guardados = [];
    for (const el of [document.querySelector('.ledger-strip'),
      ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
      guardados.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
    }
    let total = 0, gaps = 0;
    for (const c of document.querySelectorAll('.ledger-cell')) {
      c.style.width = 'min-content';
      total += c.getBoundingClientRect().width;
      c.style.width = '';
    }
    gaps = (parseFloat(getComputedStyle(document.querySelector('.ledger-strip')).columnGap) || 0)
      * document.querySelectorAll('.ledger-cell').length;
    for (const [el, v] of guardados) el.style.flexWrap = v;
    return { total: +(total + gaps).toFixed(1), celdas: document.querySelectorAll('.ledger-cell').length };
  })()`);
  console.log(`\n  tira sin acciones y con pista 40px: ${holgura.total}px (${holgura.celdas} celdas)`);
  console.log(`  disponible a 1440 con columna de 200: ${1440 - 236 - 200 - 96}px`);
  console.log(`  HOLGURA: ${(1440 - 236 - 200 - 96 - holgura.total).toFixed(1)}px`);
  const colMax = Math.floor(1440 - 236 - 96 - holgura.total);
  console.log(`  columna maxima con esta correction: ${colMax}px (hoy 200px)`);

  /* 4. Con la holgura, ¿cabe con una columna mas ancha? */
  console.log('\n=== 4. CUANTA COLUMNA COMPRA LA HOLGURA ===');
  for (const col of [colMax, 220, 240, 260]) {
    await sb.eval(`document.documentElement.style.setProperty('--section-rail-width', ${col} + 'px'); 'ok'`);
    const r = await medir(`columna ${col}px`);
    if (r.recorteLabel.length) console.log('        ^ RECORTA: ' + r.recorteLabel.join(', '));
  }
} finally {
  await sb.close();
}