/* diag-verifica-deploy.mjs - Verificar el ARREGLO en la pagina DESPLEGADA, no
 * en la local. Es el unico chequeo que importa: el bug se reporto en la pagina
 * desplegada, y la local ya estaba bien desde el primer dia.
 *
 * Corrido sobre la URL real, con el ancho del monitor del usuario (1366) y el
 * rango completo alrededor de los dos breakpoints.
 */
import { launchSandbox } from './sandbox.mjs';

const URL = 'https://adrianhola3.github.io/GastosMensuales/';
const sb = await launchSandbox({ fixture: 'baseline', headless: true, url: URL });
try {
  await sb.markBootBaseline();
  await sb.pump(3);

  console.log('\n=== 1. LA HOJA DESPLEGADA TIENE EL ARREGLO ===');
  const css = await sb.eval(`(() => {
    const texto = [...document.styleSheets].map(s => s.href || 'inline').join(', ');
    let reglas1440 = 0, reglas1024 = 0;
    for (const s of document.styleSheets) {
      try {
        for (const r of s.cssRules) {
          const cond = r.conditionText || '';
          if (cond.includes('1440px')) reglas1440++;
          if (cond.includes('1024px')) reglas1024++;
        }
      } catch (e) { /* cross-origin */ }
    }
    return {
      hojas: texto,
      reglasEnMedia1440: reglas1440,
      reglasEnMedia1024: reglas1024,
      tokenSeccion: getComputedStyle(document.documentElement)
        .getPropertyValue('--section-rail-width').trim(),
    };
  })()`);
  console.log(JSON.stringify(css, null, 2));

  console.log('\n=== 2. BARRIDO SOBRE LA PAGINA REAL ===');
  console.log('  ventana | filas holgura | scrollX | altoDoc | modo    | recorte');
  for (const w of [1920, 1600, 1520, 1441, 1440, 1366, 1280, 1200, 1100, 1025, 1024, 900, 768]) {
    await sb.page.send('Emulation.setDeviceMetricsOverride',
      { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sb.pump(3);
    await new Promise(r => setTimeout(r, 350));
    const r = await sb.eval(`(() => {
      const strip = document.querySelector('.ledger-strip');
      const main = document.querySelector('.main-content');
      const d = document.documentElement;
      const celdas = [...strip.querySelectorAll('.ledger-cell')];
      const tops = new Set(celdas.map(c => Math.round(c.getBoundingClientRect().top)));
      const g = [];
      for (const el of [strip, ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
        g.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
      }
      let nec = 0;
      for (const c of celdas) {
        c.style.width = 'min-content';
        nec += c.getBoundingClientRect().width;
        c.style.width = '';
      }
      nec += (parseFloat(getComputedStyle(strip).columnGap) || 0) * (celdas.length - 1);
      for (const [el, v] of g) el.style.flexWrap = v;
      const mc = getComputedStyle(main);
      const disp = main.clientWidth - (parseFloat(mc.paddingLeft) || 0) - (parseFloat(mc.paddingRight) || 0);
      const cols = getComputedStyle(document.querySelector('.app-layout')).gridTemplateColumns;
      const recorte = [...document.querySelectorAll('.rail-entry-name, .ledger-cell-label')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 18));
      return {
        filas: tops.size,
        holgura: +(disp - nec).toFixed(1),
        scrollX: d.scrollWidth - d.clientWidth,
        alto: d.scrollHeight,
        cols,
        recorte,
      };
    })()`);
    const modo = (r.cols.split(' ').length === 3) ? 'columna' : 'banda';
    console.log(`  ${String(w).padStart(7)} | ${String(r.filas).padStart(5)} ${String(r.holgura).padStart(7)} | ${String(r.scrollX).padStart(6)} | ${String(r.alto).padStart(7)} | ${modo.padEnd(7)} | ${r.recorte.length ? r.recorte.join(',') : '-'}`);
  }
} finally {
  await sb.close();
}