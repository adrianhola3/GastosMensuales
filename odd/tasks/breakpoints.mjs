/* Verificacion de los breakpoints que la sonda mide por numero pero que hay que
 * VER: 1024 (donde el rail pasa a drawer y las KPIs bajan a 2 columnas) y 833.
 * Captura SOLO del viewport. */
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const HIDE_EXTRA = `(() => { const s=document.createElement('style'); s.textContent='#sidebarBackdrop{display:none !important}'; document.head.appendChild(s); return true; })()`;

const page = await openPage({ width: 1024, height: 900 });
try {
  await page.goto(PAGE_URL, 7000);
  await page.page.eval(HIDE_ROLE_MODAL);
  await page.page.eval(HIDE_EXTRA);
  await page.pump(3);
  await new Promise(r => setTimeout(r, 1200));
  await page.shot('odd/tasks/capturas/color-w1024-mes.png');
  await page.page.eval(`(() => { document.getElementById('btnNavPanel').click(); return 1; })()`);
  await page.pump(3);
  await new Promise(r => setTimeout(r, 1800));
  await page.shot('odd/tasks/capturas/color-w1024-panel.png');

  const info = await page.page.eval(`(() => {
    const de = document.documentElement;
    const rail = document.querySelector('.app-sidebar');
    const m = document.querySelector('.main-content');
    return {
      innerW: window.innerWidth,
      hScroll: de.scrollWidth > de.clientWidth,
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
railTransform: getComputedStyle(rail).transform,
      railPosition: getComputedStyle(rail).position,
      hamburger: getComputedStyle(document.getElementById('btnToggleMobileSidebar')).display,
      mainPadding: getComputedStyle(m).paddingLeft + ' / ' + getComputedStyle(m).paddingRight,
      /* T1: `.metrics-row` ya no existe (sus cuatro celdas bajaron a la barra
         de comando), así que la columna de la banda de métricas ya no se
         puede leer. Se mide la barra, que es la banda que quedó. */
      barraCols: (() => { const t = document.querySelector('.ledger-toolbar');
        return t ? getComputedStyle(t).display + ' / filas ' + t.querySelectorAll('.ledger-row').length : null; })(),
      heroCols: getComputedStyle(document.querySelector('.metrics-hero-grid')).gridTemplateColumns,
      matrixScroll: (() => { const w = document.querySelector('.matrix-table-wrapper'); return w.scrollWidth > w.clientWidth ? 'la tabla scrollea DENTRO: ' + w.scrollWidth + '>' + w.clientWidth : 'entra entera'; })(),
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  console.log('consola:', JSON.stringify(page.consoleErrors), 'excepciones:', JSON.stringify(page.exceptions));
  console.log('fallos red:', JSON.stringify(page.failedRequests));
} finally {
  await page.close();
}
