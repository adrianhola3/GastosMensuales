/* shot.mjs - Captura del viewport para mirar, no para medir.
 *   node odd\tasks\shot.mjs <etiqueta>
 */
import { launchSandbox } from './sandbox.mjs';
import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] || 'shot';
const fixture = process.argv[3] || 'baseline';
const dir = 'odd/tasks/capturas';

const sb = await launchSandbox({ fixture, headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);
  const r = await sb.page.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
  });
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, label + '.png');
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('captura ->', f);

  /* Alineacion Vertical: elementos con texto visible cuyo texto NO esta
   * centrado verticalmente dentro de su propia caja, o cuya caja esta descentrada
   * respecto de la linea que la contiene. Y los controles que parecen texto. */
  const vertical = await sb.eval(`(() => {
    const out = [];
    const nombre = e => e.id ? '#' + e.id
      : e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' && e.className ? e.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
    const visit = el => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.trim();
          if (t.length < 2 || !n.parentElement) continue;
          const p = n.parentElement;
          const cs = getComputedStyle(p);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const pr = p.getBoundingClientRect();
          if (pr.height < 10) continue;
          const rng = document.createRange();
          rng.selectNodeContents(n);
          const tr = rng.getBoundingClientRect();
          if (tr.height < 4) continue;
          const dArriba = tr.top - pr.top;
          const dAbajo = pr.bottom - tr.bottom;
          out.push({
            sel: nombre(p), texto: t.slice(0, 26),
            alto: +pr.height.toFixed(1), textoAlto: +tr.height.toFixed(1),
            arriba: +dArriba.toFixed(1), abajo: +dAbajo.toFixed(1),
            delta: +(dAbajo - dArriba).toFixed(1),
            align: cs.textAlign, valign: cs.alignItems,
            display: cs.display,
          });
        } else if (n.nodeType === 1) visit(n);
      }
    };
    visit(document.body);
    return out;
  })()`);
  const malVertical = vertical.filter(v => Math.abs(v.delta) > 2.5);
  console.log('\n=== DESALINEACION VERTICAL (delta = abajo - arriba, px) ===');
  console.log('nodos:', vertical.length, '| desalineados >2.5px:', malVertical.length);
  console.table(malVertical.map(v => ({
    sel: v.sel, texto: v.texto, alto: v.alto, txtAlto: v.textoAlto,
    arriba: v.arriba, abajo: v.abajo, delta: v.delta, display: v.display,
  })));
} finally {
  await sb.close();
}