/* diag-railhdr.mjs - El boton de alta de la columna de secciones: cuanto
 * sobresale del borde derecho de `.section-rail` a cada ancho de columna.
 * El objetivo es separar "lo que YA estaba" de "lo que causó el cambio a
 * 168px", para no atribuir a este trabajo un defecto previo ni al revés.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  for (const col of [200, 184, 176, 168, 160, 152, 144]) {
    await sb.eval(`(() => {
      document.documentElement.style.setProperty('--section-rail-width', ${col} + 'px');
      return 'ok';
    })()`);
    await sb.pump(2);
    const r = await sb.eval(`(() => {
      const rail = document.querySelector('.section-rail');
      const rr = rail.getBoundingClientRect();
      const out = { columna: ${col} };
      out.desborde = [...document.querySelectorAll('.rail-add-btn')].map(b => {
        const br = b.getBoundingClientRect();
        return b.textContent.trim() + ' +' + (br.right - rr.right).toFixed(1) + 'px';
      });
      out.recortados = [...document.querySelectorAll('.rail-entry-name, .rail-total')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim());
      out.scrollX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return out;
    })()`);
    console.log(JSON.stringify(r));
  }
} finally {
  await sb.close();
}
