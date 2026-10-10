/* diag-railfits.mjs - Cuanto falta para que el renglon de los dos botones de
 * Movimientos entre en la columna a 168px, y cuanto recupera cada palanca.
 * NO es una propuesta de arreglo: es la medida que decide si el desborde que
 * reporto es de 2px (un ajuste local) o de 18px (otra cosa).
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  const r = await sb.eval(`(() => {
    const rail = document.querySelector('.section-rail');
    const rr = rail.getBoundingClientRect();
    const adds = document.querySelector('.rail-entry-adds');
    const btns = [...adds.querySelectorAll('.rail-add-btn')];
    const cs = getComputedStyle(btns[0]);
    const tokens = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const desborde = () => +(btns[1].getBoundingClientRect().right - rr.right).toFixed(1);
    const out = {
      anchoRail: +rr.width.toFixed(1),
      anchoAdds: +adds.getBoundingClientRect().width.toFixed(1),
      margenAdds: getComputedStyle(adds).marginLeft,
      gap: getComputedStyle(adds).gap,
      anchoBtns: btns.map(b => +b.getBoundingClientRect().width.toFixed(1)),
      anchoTexto: btns.map(b => {
        const r0 = document.createRange(); r0.selectNodeContents(b);
        return +r0.getBoundingClientRect().width.toFixed(1);
      }),
      paddingBoton: cs.paddingLeft + ' / ' + cs.paddingRight,
      fuenteBoton: cs.fontSize,
      tokens: {
        space1: tokens('--space-1'), spaceTight: tokens('--space-tight'),
        textXs: tokens('--text-xs')
      },
      desbordeActual: desborde()
    };
    /* palanca 1: menos margen bajo el ícono */
    adds.style.marginLeft = '12px';
    out.conMargen12 = desborde();
    adds.style.marginLeft = '';
    /* palanca 2: menos padding horizontal en el boton */
    btns.forEach(b => { b.style.padding = '0 4px'; });
    out.conPadding4 = desborde();
    btns.forEach(b => { b.style.padding = ''; });
    /* palanca 3: las dos */
    adds.style.marginLeft = '12px';
    btns.forEach(b => { b.style.padding = '0 4px'; });
    out.conAmbas = desborde();
    adds.style.marginLeft = '';
    btns.forEach(b => { b.style.padding = ''; });
    /* palanca 4: solo menos padding */
    btns.forEach(b => { b.style.padding = '0 2px'; });
    out.conPadding2 = desborde();
    btns.forEach(b => { b.style.padding = ''; });
    /* palanca 5: apilados */
    adds.style.flexDirection = 'column';
    adds.style.marginLeft = '22px';
    btns.forEach(b => { b.style.width = '100%'; });
    out.apilados = desborde();
    adds.style.flexDirection = '';
    adds.style.marginLeft = '';
    btns.forEach(b => { b.style.width = ''; });
    return out;
  })()`);
  console.log(JSON.stringify(r, null, 1));
} finally {
  await sb.close();
}
