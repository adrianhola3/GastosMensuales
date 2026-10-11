/* contraste-diseno.mjs - Contraste REAL de los pares de texto del rediseño.
 *
 * POR QUÉ ESTO EXISTE Y POR QUÉ NO BASTA CALCULARLO A MANO
 * --------------------------------------------------------------------------
 * Una razón de contraste se calcula con dos colores. En una página real hay
 * tres cosas que la invalidan y que no se ven leyendo el CSS:
 *
 *   1. EL FONDO REAL NO ES EL FONDO DEL PADRE CUATRO NIVELES ARRIBA. Con
 *      `--sunk` y filas alternas hay alpha de por medio, y comparar el color de
 *      un texto contra el token `--surface` da un número optimista.
 *   2. LA REGLA DE WCAG DEPENDE DEL TAMAÑO Y DEL PESO. Un par que pasa con
 *      4.5:1 a 12px puede ser legal con 3:1 a 24px, y comparar todos contra
 *      4.5 ignora que la cifra protagonista tiene 48px.
 *   3. EL MÍNIMO SE APLICA POR PAR, NO POR HOJA. Lo que hay que medir es si
 *      ALGÚN par falla, no si la paleta "en general" es buena.
 *
 * Por eso el fondo se compone subiendo por los ancestros y componiendo alpha, y
 * el umbral se decide por tamaño y peso de cada par. Herramienta de referencia
 * del proyecto: `odd/tasks/color-probe.mjs`. Esta mide los pares del rediseño.
 *
 *   node odd\tasks\contraste-diseno.mjs
 */

import { launchSandbox } from './sandbox.mjs';

const SB = `(() => {
  const num = c => (c.match(/[\\d.]+/g) || []).map(Number);

  const lum = rgb => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };

  /* El fondo real: se sube por los ancestros y se compone el alpha de abajo
     hacia arriba. Un color totalmente opaco corta la subida. */
  const fondoDe = el => {
    const pila = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const p = num(getComputedStyle(n).backgroundColor);
      if (p.length >= 3 && (p[3] === undefined || p[3] > 0)) {
        pila.push(p);
        if (p[3] === 1) break;
      }
      n = n.parentElement;
    }
    let a = [255, 255, 255];
    for (let i = pila.length - 1; i >= 0; i--) {
      const f = pila[i];
      const al = f[3] === undefined ? 1 : f[3];
      a = [f[0] * al + a[0] * (1 - al), f[1] * al + a[1] * (1 - al), f[2] * al + a[2] * (1 - al)];
    }
    return a;
  };

  const medir = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fg = num(cs.color);
    const bg = fondoDe(el);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const px = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && peso >= 700);
    return {
      r: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2),
      min: grande ? 3 : 4.5,
      px: cs.fontSize,
      peso,
      fg: cs.color,
      bg: 'rgb(' + bg.map(Math.round).join(', ') + ')',
    };
  };

  const g = id => document.getElementById(id);
  const pend = document.querySelector('.status-pendiente');
  const pag = document.querySelector('.status-pagado');

  return {
    'cifra protagonista': medir(g('pendingSummaryLabel').children[1]),
    'extremo Cubierto': medir(g('pendingSummaryLabel').children[0]),
    'apoyo: valor': medir(g('monthBalanceNeto')),
    'apoyo: etiqueta': medir(g('paidTextInfo').previousElementSibling),
    'apoyo: nota': medir(g('monthIngresosCount')),
    'línea de apoyo': medir(g('monthGastosCount')),
    'concepto de fila': medir(document.querySelector('.expense-item-title')),
    'concepto cubierto': medir(document.querySelector('.expense-card-item:has(.status-pagado) .expense-item-title')),
    'marca Pendiente': medir(pend),
    'marca Pagado': medir(pag),
    'etiqueta de fila': medir(document.querySelector('.tag-badge')),
    'nombre de grupo': medir(document.querySelector('.ledger-group-name')),
    'subtotal de grupo': medir(document.querySelector('.ledger-group-subtotal')),
    'subtotal del riel': medir(document.querySelector('.rail-entry-total')),
    'nombre de sección (riel)': medir(document.querySelector('.segment-pill-btn .ledger-chip-label')),
    'período en la barra': medir(g('activeMonthHeaderBadge')),
    'buscador (placeholder)': medir(document.querySelector('.command-search-input')),
    'botón primario': medir(document.querySelector('.btn-primary')),
    'campo de formulario': medir(document.querySelector('.form-input-lg')),
  };
})()`;

const sb = await launchSandbox({ fixture: 'baseline', width: 1440, height: 900 });
let salidas = [];
try {
  const r = await sb.eval(SB);
  let peor = { r: 99 };
  for (const [k, v] of Object.entries(r)) {
    if (!v) continue;
    const ok = v.r >= v.min;
    salidas.push(`${ok ? '  OK   ' : '  FALLA'} ${k.padEnd(26)} ${v.r.toString().padStart(6)}:1  (min ${v.min})  ${v.px.padStart(7)} w${v.peso}  ${v.fg} sobre ${v.bg}`);
    if (v.r < peor.r) peor = { r: v.r, k };
  }
  salidas.push('');
  salidas.push(`  ${salidas.filter(s => s.includes('OK')).length} pares cumplen · ` +
    `${salidas.filter(s => s.includes('FALLA')).length} no cumplen`);
  salidas.push(`  el peor par: ${peor.k} a ${peor.r}:1`);
} finally {
  await sb.close();
}
console.log('=== contraste del rediseño (WCAG AA, mínimo por par) ===\n' + salidas.join('\n'));