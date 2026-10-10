/* diag-strip4.mjs - Barrido de (ancho de columna x ancho de pista) para
 * encontrar una combinacion ROBUSTA, no una que entre por 0.2px.
 *
 * POR QUE ESTE INSTRUMENTO EXISTE: diag-strip3.mjs encontró que con las
 * acciones movidas al renglon del buscador y la pista en 40px, la tira entra en
 * UNA linea con 0.2px de holgura. Cero. Un numero de 0.2px no es una
 * configuracion: es una coincidencia. Cualquier cifra un poco mas larga, o un
 * navegador que mida medio pixel distinto, y vuelve a partirse — sin que nada
 * avise.
 *
 * Se busca entonces la combinacion con MAS holgura por debajo de 200px de
 * columna, y se descarta todo lo que quede por debajo de 24px: una barra de
 * cifras que depende de 0.2px de aire es una barra que se rompe sola.
 */
import { launchSandbox } from './sandbox.mjs';

const MIN_HOLGURA = 24;
const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  /* Las acciones al renglon de abajo, una sola vez: es parte del escenario.
     T6 lo movio de verdad en index.html, asi que hoy ya estan ahi y este paso
     solo tiene que ser idempotente — si siguen dentro de la tira, las saca; si
     ya bajaron, no toca nada. La medicion no depende del gesto. */
  await sb.eval(`(() => {
    const strip = document.querySelector('.ledger-strip');
    const dentro = strip.querySelector('.ledger-actions');
    if (dentro) document.querySelector('.ledger-row-nav').appendChild(dentro);
    return dentro ? 'movidas' : 'ya estaban en el renglon de abajo';
  })()`);

  const cols = [168, 176, 184, 192, 200];
  const pistas = [32, 40, 48, 56, 64, 72];
  const filas = [];

  for (const col of cols) {
    for (const pista of pistas) {
      await sb.eval(`(() => {
        document.documentElement.style.setProperty('--section-rail-width', ${col} + 'px');
        document.querySelector('.payments-track').style.flex = '0 0 ${pista}px';
        return 'ok';
      })()`);
      await sb.pump(2);
      const r = await sb.eval(`(() => {
        const strip = document.querySelector('.ledger-strip');
        const barra = document.querySelector('.ledger-toolbar');
        const principal = document.querySelector('.main-content');
        const tops = new Set([...strip.querySelectorAll('.ledger-cell')]
          .map(c => Math.round(c.getBoundingClientRect().top)));
        /* ancho que la tira NECESITA, con todos los renglones internos en nowrap:
         * si el renglon se parte, el navegador no esta "usando" el ancho que
         * dice que necesita, asi que medir el ancho reservado daria un numero
         * mas chico que el real. */
        const g = [];
        for (const el of [strip, ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
          g.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
        }
        let necesario = 0;
        for (const c of strip.querySelectorAll('.ledger-cell')) {
          c.style.width = 'min-content';
          necesario += c.getBoundingClientRect().width;
          c.style.width = '';
        }
        necesario += (parseFloat(getComputedStyle(strip).columnGap) || 0)
          * strip.querySelectorAll('.ledger-cell').length;
        for (const [el, v] of g) el.style.flexWrap = v;
        const d = document.documentElement;
        return {
          filas: tops.size,
          holgura: +(principal.clientWidth - 96 - necesario).toFixed(1),
          barra: +barra.getBoundingClientRect().height.toFixed(1),
          scrollH: principal.scrollHeight,
          scrollX: d.scrollWidth - d.clientWidth,
          recorte: [...document.querySelectorAll('.rail-entry-name, .ledger-cell-label')]
            .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
        };
      })()`);
      filas.push({ col, pista, ...r });
    }
  }

  console.log('\n=== BARRIDO: columna x pista (1440x900, acciones en el renglon de abajo) ===');
  console.log(`  minimo de holgura aceptable: ${MIN_HOLGURA}px\n`);
  console.table(filas.map(f => ({
    col: f.col + 'px', pista: f.pista + 'px',
    filas: f.filas, holgura: f.holgura,
    barra: f.barra + 'px', scrollH: f.scrollH,
    scrollX: f.scrollX === 0 ? 'ok' : 'HORIZONTAL',
    veredicto: f.recorte.length ? 'recorta' :
      f.filas > 1 ? 'se parte' :
      f.holgura < MIN_HOLGURA ? 'fragil' : 'OK',
  })));

  const ok = filas.filter(f => f.filas === 1 && f.holgura >= MIN_HOLGURA && !f.recorte.length);
  console.log('\n=== COMBINACIONES ROBUSTAS ===');
  if (!ok.length) {
    console.log('  NINGUNA con estos dos parametros. El problema no es la pista.');
  } else {
    /* la de mas columna que aun sea robusta: gana navegacion */
    ok.sort((a, b) => b.col - a.col || a.pista - b.pista);
    for (const f of ok.slice(0, 8)) {
      console.log(`  columna ${f.col}px + pista ${f.pista}px -> holgura ${f.holgura}px, barra ${f.barra}px, scrollH ${f.scrollH}`);
    }
  }
} finally {
  await sb.close();
}