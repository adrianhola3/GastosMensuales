/* diag-deploy.mjs - Por que la pagina DESPLEGADA se ve deformada.
 *
 * `sandbox.mjs` a proposito, no `cdp.mjs`: este lanza su propio navegador con
 * perfil throwaway y `--headless=new`, y NO abre ninguna ventana visible. Es
 * exactamente el punto de la regla que quedo escrita en el encabezado de cdp.mjs.
 *
 * La pregunta no es "que cambia" sino "a que ancho se rompe", asi que se mide la
 * pagina real en varios anchos y se reportan las tres cosas que la harian ver
 * deforme: el ancho de cada columna, si el contenido se desborda, y si algo se
 * recorta.
 */
import { launchSandbox } from './sandbox.mjs';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://adrianhola3.github.io/GastosMensuales/';
const dir = 'odd/tasks/capturas';

const sb = await launchSandbox({ fixture: 'baseline', headless: true, url: URL });
try {
  await sb.markBootBaseline();
  await sb.pump(3);

  const carga = await sb.eval(`(() => ({
    url: location.href,
    titulo: document.title,
    fuenteCss: [...document.styleSheets].map(s => s.href).filter(Boolean),
    reglasCss: (() => { try { return document.styleSheets[0].cssRules.length; } catch (e) { return 'BLOQUEADO: ' + e.name; } })(),
    fuenteInter: getComputedStyle(document.body).fontFamily,
    altoDoc: document.documentElement.scrollHeight,
    seccionesRail: !!document.querySelector('.section-rail'),
  }))()`);
  console.log('\n=== 1. LO QUE CARGO LA PAGINA DESPLEGADA ===');
  console.log(JSON.stringify(carga, null, 2));

  console.log('\n=== 2. GEOMETRIA POR ANCHO ===');
  console.log('  ancho | layout      rail sec  main     scrollX overflow | altoScroll | recorte');

  for (const w of [1440, 1280, 1200, 1024, 900, 768, 640, 480]) {
    await sb.page.send('Emulation.setDeviceMetricsOverride',
      { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sb.pump(3);
    await new Promise(r => setTimeout(r, 400));

    const r = await sb.eval(`(() => {
      const d = document.documentElement;
      const box = sel => { const e = document.querySelector(sel);
        if (!e) return null; const b = e.getBoundingClientRect();
        return { x: +b.x.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
      const layout = box('.app-layout');
      const rail = box('.app-sidebar');
      const sec = box('.section-rail');
      const main = box('.main-content');
      const cols = getComputedStyle(document.querySelector('.app-layout')).gridTemplateColumns;
      const recorte = [...document.querySelectorAll('.rail-entry-name, .ledger-cell-label, .brand-title')]
        .filter(e => e.scrollWidth > e.clientWidth + 1)
        .map(e => e.textContent.trim().slice(0, 22));
      const desborde = [...document.querySelectorAll('.ledger-strip, .section-rail, .app-sidebar, .main-content')]
        .filter(e => e.scrollWidth > e.clientWidth + 2)
        .map(e => e.className + ' (' + e.scrollWidth + '>' + e.clientWidth + ')');
      return {
        cols, rail, sec, main,
        scrollX: d.scrollWidth - d.clientWidth,
        alto: d.scrollHeight,
        recorte, desborde,
        railVisible: rail ? getComputedStyle(document.querySelector('.app-sidebar')).transform : null,
      };
    })()`);

    console.log(`  ${String(w).padStart(5)} | ${String(r.cols).padEnd(20)} ${String(r.sec ? r.sec.w : '-').padStart(4)} ${String(r.main ? r.main.w : '-').padStart(7)} ${String(r.scrollX).padStart(6)} ${String(r.desborde.length).padStart(7)} | ${String(r.alto).padStart(9)} | ${r.recorte.length ? r.recorte.join(',') : '-'}`);

    if (w === 1440 || w === 1024 || w === 768) {
      const cap = await sb.page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `deploy-${w}.png`), Buffer.from(cap.data, 'base64'));
    }
  }

  console.log('\n=== 3. LA COLUMNA DE SECCIONES EN ANCHOS ANCHOS ===');
  console.log('  (si se mantiene en 168px por debajo de 1024, el contenido se aprieta)');
  for (const w of [1024, 900, 768, 640]) {
    await sb.page.send('Emulation.setDeviceMetricsOverride',
      { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sb.pump(2);
    const r = await sb.eval(`(() => {
      const sec = document.querySelector('.section-rail');
      const main = document.querySelector('.main-content');
      const strip = document.querySelector('.ledger-strip');
      const cs = getComputedStyle(document.documentElement);
      const csSec = sec ? getComputedStyle(sec) : null;
      const filas = new Set([...strip.querySelectorAll('.ledger-cell')]
        .map(c => Math.round(c.getBoundingClientRect().top))).size;
      return {
        tokenSeccion: cs.getPropertyValue('--section-rail-width').trim(),
        secDisplay: csSec ? csSec.display : null,
        secW: sec ? +sec.getBoundingClientRect().width.toFixed(1) : null,
        mainW: +main.getBoundingClientRect().width.toFixed(1),
        filasTira: filas,
      };
    })()`);
    console.log(`  ${String(w).padStart(5)}px -> token ${r.tokenSeccion} | sec display ${r.secDisplay} ancho ${r.secW} | main ${r.mainW} | filas de la tira ${r.filasTira}`);
  }
} finally {
  await sb.close();
}