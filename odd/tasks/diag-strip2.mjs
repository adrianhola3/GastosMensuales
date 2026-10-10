/* diag-strip2.mjs - De donde sale el ancho de la tira, pieza por pieza.
 *
 * HECHO ESTABLECIDO (diag-strip.mjs): la tira necesita 1049.8px en UNA linea.
 * A 1440px con un rail de 236px y padding de 96px quedan 908px. Faltan 141.8px.
 * Conclusion: con una columna de secciones usable NO CABE en una linea. No es
 * un bug de CSS, es aritmetica.
 *
 * PREGUNTA QUE FALTA RESPONDER: de esos 1049.8px, cuanto son DATO y cuanto es
 * AIRE? Si 141.8px son espacio que se puede recuperar sin tocar la tipografia,
 * la columna de secciones entra sin envolver. Si son ancho de cifras, no entra
 * y hay que elegir.
 */
import { launchSandbox } from './sandbox.mjs';

const sb = await launchSandbox({ fixture: 'baseline', headless: true });
try {
  await sb.assertAdmin();
  await sb.markBootBaseline();
  await sb.pump(3);

  const anchoDe = expr => sb.eval(`(() => {
    const g = sel => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return +r.width.toFixed(1); };
    const anchoTexto = sel => { const e = document.querySelector(sel); if (!e) return null;
      const rg = document.createRange(); rg.selectNodeContents(e);
      const r = rg.getBoundingClientRect(); return +r.width.toFixed(1); };
    ${expr}
  })()`);

  /* 1. La celda "Pagado" es la anomalía: 301.9px contra 124.5 de las otras. */
  console.log('\n=== 1. LA CELDA "PAGADO" DESMENUZADA ===');
  const pagado = await anchoDe(`return {
    celda: g('.ledger-cell-paid'),
    lineaPagado: g('.ledger-paid-line'),
    denominador: anchoTexto('#monthGastosCount'),
    pista: g('.payments-track'),
    resultado: anchoTexto('#paidPercentBadge'),
    /* el texto de "#monthGastosCount" con el formato largo actual */
    textoDenominador: document.getElementById('monthGastosCount').textContent,
    textoResultado: document.getElementById('paidPercentBadge').textContent,
  };`);
  console.log(JSON.stringify(pagado, null, 2));
  console.log(`  ancho del renglon = ${pagado.denominador} + ${pagado.pista} + ${pagado.resultado} + 2 gaps de 8 = ${(pagado.denominador + pagado.pista + pagado.resultado + 16).toFixed(1)}`);
  console.log(`  pero la celda mide ${pagado.celda}: la DIFERENCIA es la cifra de 20px de arriba.`);

  /* 2. Cuanto mide cada cifra aislada, y cuanto le sobra a cada celda. */
  console.log('\n=== 2. CADA CELDA: IMPORTE vs CAJA ===');
  const celdas = await sb.eval(`(() => {
    const guardados = [];
    for (const el of [document.querySelector('.ledger-strip'),
      ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
      guardados.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
    }
    const out = [...document.querySelectorAll('.ledger-cell')].map(c => {
      const valor = c.querySelector('.ledger-cell-value');
      const nota = c.querySelector('.ledger-cell-note, .ledger-paid-line, .ledger-balance-line');
      const r = c.getBoundingClientRect();
      return {
        celda: (c.className.replace('ledger-cell','').trim() || 'base'),
        caja: +r.width.toFixed(1),
        valor: valor ? +valor.getBoundingClientRect().width.toFixed(1) : null,
        anchoDeLaNota: nota ? +nota.getBoundingClientRect().width.toFixed(1) : null,
        celdaAncha: !!nota && nota.getBoundingClientRect().width > (valor ? valor.getBoundingClientRect().width : 0),
      };
    });
    for (const [el, v] of guardados) el.style.flexWrap = v;
    return out;
  })()`);
  console.table(celdas.map(c => ({
    celda: c.celda, caja: c.caja, valor: c.valor, nota: c.anchoDeLaNota,
    /* el ancho lo fija la pieza mas ancha de la celda */
    sobra: c.valor !== null ? +(c.caja - Math.max(c.valor, c.anchoDeLaNota || 0)).toFixed(1) : null,
  })));

  /* 3. Escenario: quanto We'd recuperaria con la pista mas chica. */
  console.log('\n=== 3. ESCENARIOS DE ANCHO (los tres tocan la pista / el texto) ===');
  const scen = await sb.eval(`(() => {
    const celda = document.querySelector('.ledger-cell-paid');
    const linea = celda.querySelector('.ledger-paid-line');
    const pista = linea.querySelector('.payments-track');
    const den = document.getElementById('monthGastosCount');
    const textoOriginal = den.textContent;
    const medir = () => { const r = celda.getBoundingClientRect();
      const s = document.querySelector('.ledger-strip').getBoundingClientRect();
      return { celda: +r.width.toFixed(1), tira: +s.width.toFixed(1) }; };
    const out = { base: medir() };

    /* a) pista de 72px -> 40px */
    pista.style.flex = '0 0 40px';
    out.pista40 = medir();
    pista.style.flex = '';

    /* b) denominador corto: "2 de 6 gastos pagados" -> "2/6 pagados" */
    den.textContent = '2/6 pagados';
    out.denominadorCorto = medir();
    den.textContent = textoOriginal;

    /* c) las dos */
    pista.style.flex = '0 0 40px';
    den.textContent = '2/6 pagados';
    out.ambas = medir();
    pista.style.flex = '';
    den.textContent = textoOriginal;

    /* d) resultado sin la palabra "Pagado" (la etiqueta de la celda ya lo dice) */
    const res = document.getElementById('paidPercentBadge');
    const resOrig = res.textContent;
    res.textContent = '38.1%';
    pista.style.flex = '0 0 40px';
    out.pista40YresultadoCorto = medir();
    pista.style.flex = ''; res.textContent = resOrig;

    out.restaurado = medir();
    return out;
  })()`);
  console.log(JSON.stringify(scen, null, 2));

  console.log('\n=== 4. LECTURA ===');
  const base = scen.base.celda;
  const acciones = 110.1;
  const otras = 124.5 * 3 + 184.3;
  const gaps = 80;
  console.log(`  celda Pagado hoy: ${base}px  (las otras 4 celdas: ${otras}px, gaps ${gaps}px, acciones ${acciones}px)`);
  for (const [k, v] of Object.entries(scen)) {
    if (k === 'base' || k === 'restaurado') continue;
    const nuevo = otras + v.celda + gaps + acciones;
    const maxCol = Math.floor(1440 - 236 - 96 - nuevo);
    console.log(`  ${k.padEnd(24)} Pagado ${String(v.celda).padStart(6)}px -> tira ${String(nuevo).padStart(7)}px -> columna maxima ${maxCol}px`);
  }
} finally {
  await sb.close();
}