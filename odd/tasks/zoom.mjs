/* Recorte en alta resolucion del boton filled, para juzgar la etiqueta sin que
 * el escalado de la captura de 1440 la vuelva ambigua. */
import path from 'node:path';
import fs from 'node:fs';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const LABEL = process.argv[2] || 'r4';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.pump(3);
  await s.page.eval(`(() => { const m = document.getElementById('modalSessionRoleSelect');
    if (m) m.classList.remove('active');
    document.body.classList.remove('read-only-mode'); return 'ok'; })()`);
  await s.page.eval("document.getElementById('btnOpenNotesModal').click(); 'ok'");
  await s.pump(4);
  await new Promise(r => setTimeout(r, 900));

  /* deviceScaleFactor 3 + clip: la etiqueta se lee de verdad. */
  await s.page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 3, mobile: false });
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));

  const caja = await s.page.eval(`(() => {
    const b = document.querySelector('#modalMonthNotes .btn-primary');
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const clip = { x: Math.round(caja.x - 12), y: Math.round(caja.y - 12),
    width: Math.round(caja.w + 24), height: Math.round(caja.h + 24), scale: 3 };
  const r = await s.page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
  fs.writeFileSync(path.join(DIR, `tema-${LABEL}-zoom-boton-filled.png`), Buffer.from(r.data, 'base64'));

  const medido = await s.page.eval(`(() => {
    const b = document.querySelector('#modalMonthNotes .btn-primary');
    const cs = getComputedStyle(b);
    return { texto: b.textContent.trim(), fondo: cs.backgroundColor, etiqueta: cs.color,
      px: parseFloat(cs.fontSize), peso: cs.fontWeight, familia: cs.fontFamily.slice(0, 40) };
  })()`);
  console.log('boton filled medido: ' + JSON.stringify(medido));
  console.log('recorte: ' + JSON.stringify(clip) + ' -> tema-' + LABEL + '-zoom-boton-filled.png');
} finally {
  await s.close();
}