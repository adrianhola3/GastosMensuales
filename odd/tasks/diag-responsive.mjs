/* diag-responsive.mjs - La columna de secciones a 168px en los tres
 * breakpoints donde deja de ser columna y pasa a banda horizontal.
 * Pregunta una sola cosa: aparece scroll horizontal en la pagina.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  for (const w of [1440, 1280, 1024, 833, 640, 480, 375]) {
    await sb.resize(w, 900);
    await sb.pump(3);
    const r = await sb.eval(`(() => {
      const d = document.documentElement;
      const rail = document.querySelector('.section-rail');
      const rr = rail.getBoundingClientRect();
      const strip = document.querySelector('.ledger-strip');
      const tops = new Set([...strip.querySelectorAll('.ledger-cell')]
        .map(c => Math.round(c.getBoundingClientRect().top)));
      const anchoPrincipal = document.querySelector('.main-content').clientWidth;
      return {
        ancho: ${w},
        anchoPrincipal,
        filasTira: tops.size,
        rail: getComputedStyle(rail).position === 'fixed' ? 'fijo' : 'flujo',
        altoRail: +rr.height.toFixed(1),
        scrollX: d.scrollWidth - d.clientWidth,
        entradas: rail.querySelectorAll('.rail-entry').length,
        botones: rail.querySelectorAll('.rail-add-btn').length,
        recortes: [...document.querySelectorAll('.rail-entry-name, .ledger-cell-label')]
          .filter(e => e.scrollWidth > e.clientWidth + 1).length,
        desbordesRail: [...rail.querySelectorAll('.rail-add-btn')]
          .filter(b => b.getBoundingClientRect().right > rr.right + 0.5).length,
        barra: +document.querySelector('.ledger-toolbar').getBoundingClientRect().height.toFixed(1)
      };
    })()`);
    console.log(JSON.stringify(r));
  }
} finally {
  await sb.close();
}
