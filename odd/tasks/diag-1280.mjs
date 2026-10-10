/* diag-1280.mjs - La tira a 1280: ¿el parteo de dos filas es una regresion de
 * la correccion o ya venia? Compara las tres configuraciones de ancho.
 */
import { launchSandbox } from './sandbox.mjs';

const medir = `(() => {
  const strip = document.querySelector('.ledger-strip');
  const tops = new Set([...strip.querySelectorAll('.ledger-cell')]
    .map(c => Math.round(c.getBoundingClientRect().top)));
  const p = document.querySelector('.main-content');
  return {
    filas: tops.size,
    principal: p.clientWidth,
    barra: +document.querySelector('.ledger-toolbar').getBoundingClientRect().height.toFixed(1),
    scrollH: p.scrollHeight
  };
})()`;

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.resize(1280, 900);
  await sb.pump(3);
  console.log('ahora (168 + pista32 + acciones abajo) ',
    JSON.stringify(await sb.eval(medir)));
  await sb.eval(`(() => {
    document.documentElement.style.setProperty('--section-rail-width','200px');
    return 'ok';
  })()`);
  await sb.pump(2);
  console.log('antes (200 + pista32 + acciones abajo)',
    JSON.stringify(await sb.eval(medir)));
  await sb.eval(`(() => {
    document.querySelector('.payments-track').style.flex = '0 0 72px';
    document.querySelector('.ledger-row-nav').appendChild(
      document.querySelector('.ledger-actions'));
    return 'ok';
  })()`);
  await sb.pump(2);
  console.log('T2-T5 (200 + pista72 + acciones en tira)',
    JSON.stringify(await sb.eval(medir)));
} finally {
  await sb.close();
}
