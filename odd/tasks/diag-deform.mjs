/* diag-deform.mjs - En que ancho exacto se parte la tira de cifras, y por que.
 *
 * HECHO ESTABLECIDO (`diag-deploy.mjs`, sobre la pagina REAL desplegada):
 *   1440 -> 3 columnas (236 / 168 / 1021), tira en 1 fila
 *   1280 -> main 861px   y el documento crece a 974px
 *   1200 -> main 781px   y el documento crece a 974px
 *   1024 -> main 1009px  (la columna de secciones pasa a banda horizontal)
 *    768 -> main 753px, 2 filas de tira
 *    640 -> main 625px, 2 filas de tira
 *
 * Lo que NO esta medido y es lo que hay que medir: de que ancho a que ancho
 * esta la fila de la tira. Un "a 1280 se parte" sin el limite exacto no
 * permite decidir nada.
 *
 * Ademas: el token `--section-rail-width` sigue valiendo 168px POR DEBAJO de
 * 1024, donde la columna ya no es columna. Si algo lo lee para calcular ancho,
 * esta contando 168px de una pieza que ahora es una banda. Eso hay que
 * verificar, no suponer.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  const leer = async () => {
    await sb.pump(2);
    return sb.eval(`(() => {
      const strip = document.querySelector('.ledger-strip');
      const main = document.querySelector('.main-content');
      const celdas = [...strip.querySelectorAll('.ledger-cell')];
      const tops = [...new Set(celdas.map(c => Math.round(c.getBoundingClientRect().top)))];
      /* ancho que la tira NECESITA en una linea: todos los renglones internos en
       * nowrap, porque si el renglon se parte el navegador no esta usando el
       * ancho que dice que necesita. */
      const g = [];
      for (const el of [strip, ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
        g.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
      }
      let necesario = 0;
      for (const c of celdas) {
        c.style.width = 'min-content';
        necesario += c.getBoundingClientRect().width;
        c.style.width = '';
      }
      necesario += (parseFloat(getComputedStyle(strip).columnGap) || 0) * celdas.length;
      for (const [el, v] of g) el.style.flexWrap = v;

      const cs = getComputedStyle(document.documentElement);
      const mc = getComputedStyle(main);
      const disponible = main.clientWidth
        - (parseFloat(mc.paddingLeft) || 0) - (parseFloat(mc.paddingRight) || 0);
      return {
        ventana: innerWidth,
        filas: tops.size,
        necesario: +necesario.toFixed(1),
        disponible: +disponible.toFixed(1),
        holgura: +(disponible - necesario).toFixed(1),
        altoDoc: document.documentElement.scrollHeight,
        anchoMain: +main.clientWidth.toFixed(1),
        tokenSeccion: cs.getPropertyValue('--section-rail-width').trim(),
        cols: getComputedStyle(document.querySelector('.app-layout')).gridTemplateColumns,
      };
    })()`);
  };

  console.log('\n=== 1. LA FILA DE LA TIRA, ANCHO POR ANCHO ===');
  console.log('  ventana | main    disponible necesario holgura | filas | altoDoc | cols');
  const res = [];
  for (const w of [1600, 1520, 1440, 1400, 1366, 1320, 1280, 1200, 1100, 1025, 1024, 900, 768, 640]) {
    await sb.page.send('Emulation.setDeviceMetricsOverride',
      { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    const r = await leer();
    res.push(r);
    console.log(`  ${String(r.ventana).padStart(7)} | ${String(r.anchoMain).padStart(6)} ${String(r.disponible).padStart(10)} ${String(r.necesario).padStart(9)} ${String(r.holgura).padStart(7)} | ${String(r.filas).padStart(5)} | ${String(r.altoDoc).padStart(7)} | ${r.cols}`);
  }

  console.log('\n=== 2. EL LIMITE EXACTO ===');
  const uno = res.filter(r => r.filas === 1).map(r => r.ventana);
  const dos = res.filter(r => r.filas > 1).map(r => r.ventana);
  console.log('  anchos con la tira en 1 fila: ' + (uno.length ? uno.join(', ') : 'ninguno'));
  console.log('  anchos con la tira partida   : ' + (dos.length ? dos.join(', ') : 'ninguno'));

  console.log('\n=== 3. EL TOKEN POR DEBAJO DEL BREAKPOINT ===');
  console.log('  (168px de una pieza que ya no es columna: cuenta ancho que no existe)');
  for (const r of res.filter(x => x.ventana <= 1100)) {
    console.log(`  ${String(r.ventana).padStart(5)}px -> cols "${r.cols}" | token ${r.tokenSeccion} | main real ${r.anchoMain}`);
  }

  console.log('\n=== 4. QUE HARIA FALTAR ===');
  const r1280 = res.find(r => r.ventana === 1280);
  const r1440 = res.find(r => r.ventana === 1440);
  if (r1280 && r1440) {
    console.log(`  a 1440 sobra ${r1440.holgura}px; a 1280 falta ${-r1280.holgura}px`);
    console.log(`  la diferencia de main entre 1440 y 1280 es ${r1440.anchoMain - r1280.anchoMain}px`);
    console.log(`  para que entre a 1280 haria falta un main de ${r1280.necesario}px`);
    console.log(`  => hay que devolver ${(r1280.necesario - r1280.disponible).toFixed(1)}px de ancho,`);
    console.log(`     o bajar la tira a ${(r1280.ventana - 236 - 96 - r1280.necesario).toFixed(1)}px de columna... que es negativo.`);
    console.log(`     O看不懂: no alcanza con angostar la columna. Habria que achicar la celda "Pagado"`);
  }
} finally {
  await sb.close();
}