/* diag-strip.mjs - Por que la tira de cifras se partio en dos renglones, y que
 * ancho de columna lo arregla.
 *
 * TRAMPA DE ESTE INSTRUMENTO, CORREGIDA: la primera version midio `min-content`
 * de cada celda y dio 877.5px, que SI cabe en 989px. Pero `.ledger-paid-line`
 * y `.ledger-balance-line` tienen `flex-wrap: wrap`, asi que su `min-content`
 * es el de la version ENVUELTA, que es mas chico que lo que necesitan en un
 * renglon. Un numero que nadie reviso es una hipotesis, no una medicion
 * (memoria #198). Aqui se mide con TODOS los renglones internos en `nowrap`:
 * ese es el ancho que la celda necesita de verdad para no partirse.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  /* 1. Ancho real de cada celda con la tira y sus renglones internos en nowrap. */
  const natural = await sb.eval(`(() => {
    const strip = document.querySelector('.ledger-strip');
    const fila = document.querySelector('.ledger-row-nav');
    const guardados = [];
    const nowrap = () => {
      for (const el of [strip, fila,
        ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
        guardados.push([el, el.style.flexWrap]);
        el.style.flexWrap = 'nowrap';
      }
    };
    nowrap();
    const celdas = [...strip.querySelectorAll('.ledger-cell')].map(c => {
      const r = c.getBoundingClientRect();
      c.style.width = 'min-content';
      const min = c.getBoundingClientRect().width;
      c.style.width = '';
      return {
        celda: c.className.replace('ledger-cell', '').trim() || 'base',
        unaLinea: +r.width.toFixed(1),
        minContent: +min.toFixed(1),
        /* el mas ancho de los dos es el que manda */
        necesario: +Math.max(r.width, min).toFixed(1),
      };
    });
    const acciones = strip.querySelector('.ledger-actions');
    const rAcc = acciones.getBoundingClientRect();
    const cs = getComputedStyle(strip);
    const gap = parseFloat(cs.columnGap) || 0;
    for (const [el, v] of guardados) el.style.flexWrap = v;
    return {
      celdas,
      suma: +celdas.reduce((s, c) => s + c.necesario, 0).toFixed(1),
      gap: +gap.toFixed(1),
      acciones: +rAcc.width.toFixed(1),
      necesarioTotal: +(celdas.reduce((s, c) => s + c.necesario, 0)
        + gap * celdas.length + rAcc.width).toFixed(1),
    };
  })()`);
  console.log('\n=== 1. NECESARIO PARA UNA SOLA LINEA (todo en nowrap) ===');
  console.table(natural.celdas.map(c => ({ celda: c.celda, unaLinea: c.unaLinea, minContent: c.minContent, necesario: c.necesario })));
  console.log('  suma celdas     :', natural.suma);
  console.log('  gap x', natural.celdas.length, '      :', (natural.gap * natural.celdas.length).toFixed(1));
  console.log('  acciones        :', natural.acciones);
  console.log('  NECESARIO TOTAL :', natural.necesarioTotal, 'px');

  /* 2. La cuenta del ancho, a cada ventana. */
  const tokens = await sb.eval(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const main = getComputedStyle(document.querySelector('.main-content'));
    return {
      rail: parseFloat(cs.getPropertyValue('--rail-width')),
      section: parseFloat(cs.getPropertyValue('--section-rail-width')),
      pad: (parseFloat(main.paddingLeft) || 0) + (parseFloat(main.paddingRight) || 0),
    };
  })()`);
  console.log('\n=== 2. LA CUENTA ===');
  console.log('  rail', tokens.rail, '+ seccion', tokens.section, '+ padding', tokens.pad);
  for (const v of [1600, 1440, 1366, 1280, 1152]) {
    const disponible = v - tokens.rail - tokens.section - tokens.pad;
    const falta = natural.necesarioTotal - disponible;
    console.log(`  a ${String(v).padStart(4)}px -> disponible ${disponible.toFixed(1)}px -> ` +
      (falta > 0 ? `FALTAN ${falta.toFixed(1)}px` : `sobran ${(-falta).toFixed(1)}px`));
  }

  /* 3. Resolver el ancho de la columna para que la tira quepa a 1440px. */
  const maxCol = Math.floor(1440 - tokens.rail - tokens.pad - natural.necesarioTotal);
  console.log(`\n  ancho MAXIMO de columna para 1 linea a 1440px: ${maxCol}px`);
  console.log('  ancho ACTUAL:', tokens.section, 'px ->', maxCol < tokens.section
    ? `reduce ${tokens.section - maxCol}px` : `puede crecer ${maxCol - tokens.section}px`);

  /* 4. Verificar de verdad: poner el anchoCalculado y medir filas reales. */
  console.log('\n=== 4. VERIFICACION REAL POR ANCHO DE COLUMNA ===');
  console.log('  ventana | main | filas celdas | alto barra | scrollX');
  for (const col of [maxCol, 176, 184, 192, 200, 208]) {
    await sb.eval(`(() => {
      document.documentElement.style.setProperty('--section-rail-width', ${col} + 'px');
      return 'ok';
    })()`);
    for (const v of [1440]) {
      await sb.page.send('Emulation.setDeviceMetricsOverride',
        { width: v, height: 900, deviceScaleFactor: 1, mobile: false });
      await sb.pump(2);
      const r = await sb.eval(`(() => {
        const strip = document.querySelector('.ledger-strip');
        const barra = document.querySelector('.ledger-toolbar');
        const main = document.querySelector('.main-content');
        const tops = new Set([...strip.querySelectorAll('.ledger-cell')]
          .map(c => Math.round(c.getBoundingClientRect().top)));
        const d = document.documentElement;
        return {
          main: +main.getBoundingClientRect().width.toFixed(1),
          filas: tops.size,
          alto: +barra.getBoundingClientRect().height.toFixed(1),
          scrollX: d.scrollWidth - d.clientWidth,
          overflow: d.scrollWidth > d.clientWidth ? 'SCROLL HORIZONTAL' : 'ok',
          etiquetaRecortada: [...document.querySelectorAll('.ledger-cell-label')]
            .filter(e => e.scrollWidth > e.clientWidth + 1)
            .map(e => e.textContent),
          recorteRail: [...document.querySelectorAll('.rail-entry-name')]
            .filter(e => e.scrollWidth > e.clientWidth + 1)
            .map(e => e.textContent),
        };
      })()`);
      console.log(`  ${String(col).padStart(3)}px col | ${String(r.main).padStart(6)} | ${r.filas} | ${String(r.alto).padStart(6)}px | ${r.overflow}` +
        (r.etiquetaRecortada.length ? ' | RECORTA: ' + r.etiquetaRecortada.join(',') : '') +
        (r.recorteRail.length ? ' | RAIL RECORTA: ' + r.recorteRail.join(',') : ''));
    }
  }
  await sb.eval(`document.documentElement.style.removeProperty('--section-rail-width'); 'ok'`);
} finally {
  await sb.close();
}