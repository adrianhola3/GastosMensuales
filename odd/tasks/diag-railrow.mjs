/* diag-railrow.mjs - El renglon de abajo: alto en Administrador (con
 * "Abono"/"Gasto") y en Solo Lectura (sin ellos, `admin-action-btn`).
 * Sirve para confirmar que las acciones no agrandan la barra.
 */
import { launchSandbox } from './sandbox.mjs';

const medir = () => `(() => {
  const nav = document.querySelector('.ledger-row-nav');
  const barra = document.querySelector('.ledger-toolbar');
  const acc = document.querySelector('.ledger-actions');
  return {
    modo: document.body.classList.contains('read-only-mode') ? 'lector' : 'admin',
    renglonNav: +nav.getBoundingClientRect().height.toFixed(1),
    barra: +barra.getBoundingClientRect().height.toFixed(1),
    acciones: acc ? +acc.getBoundingClientRect().width.toFixed(1) : null,
    accionesVisibles: acc ? acc.querySelectorAll('button:not([hidden])')
      .length + '/' + acc.querySelectorAll('button').length : null
  };
})()`;

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);
  console.log('admin   ', JSON.stringify(await sb.eval(medir())));
  await sb.eval(`document.body.classList.add('read-only-mode')`);
  await sb.pump(2);
  console.log('lector  ', JSON.stringify(await sb.eval(medir())));
} finally {
  await sb.close();
}
