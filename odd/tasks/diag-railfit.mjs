/* diag-railfit.mjs - Medida puntual del ancho de la columna de secciones a
 * 168px: que ningun nombre recorte y que nada desborde el borde derecho.
 * Complementa a diag-strip4.mjs, que mide la tira de cifras y no la columna.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  const r = await sb.eval(`(() => {
    const d = document.documentElement;
    const rail = document.querySelector('.section-rail');
    const rr = rail.getBoundingClientRect();
    const strip = document.querySelector('.ledger-strip');
    const principal = document.querySelector('.main-content');
    const barra = document.querySelector('.ledger-toolbar');
    const nav = document.querySelector('.ledger-row-nav');
    const pagado = document.querySelector('.ledger-cell-paid');
    const cola = document.querySelector('.payments-track');
    const tops = new Set([...strip.querySelectorAll('.ledger-cell')]
      .map(c => Math.round(c.getBoundingClientRect().top)));
    const sobra = e => +(e.getBoundingClientRect().width - [...e.children]
      .reduce((s, c) => s + c.getBoundingClientRect().width, 0)).toFixed(1);
    return {
      tokenSecciones: getComputedStyle(d).getPropertyValue('--section-rail-width').trim(),
      columnaSecciones: +rr.width.toFixed(1),
      railScroll: rail.scrollWidth + ' / client ' + rail.clientWidth,
      nombresRecortados: [...document.querySelectorAll('.rail-entry-name, .ledger-cell-label')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()),
      desbordeColumna: [...document.querySelectorAll('.section-rail *')]
        .filter(e => e.getBoundingClientRect().width > 0 &&
          (e.getBoundingClientRect().right > rr.right + 0.5 ||
           e.getBoundingClientRect().left < rr.left - 0.5))
        .map(e => e.className + ' :: ' + e.textContent.trim()),
      celdaPagado: +pagado.getBoundingClientRect().width.toFixed(1),
      celdas: [...strip.querySelectorAll('.ledger-cell')].map(c => ({
        etiqueta: c.querySelector('.ledger-cell-label').textContent.trim(),
        ancho: +c.getBoundingClientRect().width.toFixed(1),
        sobra: sobra(c)
      })),
      pista: +cola.getBoundingClientRect().width.toFixed(1),
      filasTira: tops.size,
      renglonBuscador: +nav.getBoundingClientRect().height.toFixed(1),
      barra: +barra.getBoundingClientRect().height.toFixed(1),
      mainScrollHeight: principal.scrollHeight,
      mainClientHeight: principal.clientHeight,
      mainClientWidth: principal.clientWidth,
      scrollX: d.scrollWidth - d.clientWidth
    };
  })()`);
  console.log(JSON.stringify(r, null, 1));
} finally {
  await sb.close();
}
