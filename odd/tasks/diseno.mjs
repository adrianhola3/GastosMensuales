/* diseno.mjs - Captura de la vista en dos anchos, para el rediseño visual.
 *
 * POR QUÉ ESTE ARCHIVO Y NO `cdp.mjs`
 * ----------------------------------
 * `cdp.mjs` abre una ventana nueva y visible. Para juzgar maquetación, una
 * ventana visible molesta y encima deja el foco de la sesión en otra pestaña.
 * `launchSandbox` de `sandbox.mjs` es headless por defecto, tira el perfil
 * después y además siembra una fixture sintética: sin datos reales, y sin red.
 *
 * LO QUE TIRA
 * -----------
 *   capturas/diseno-<ancho>.png    la vista mensual completa
 *   capturas/diseno-panel-<ancho>.png  la vista consolidada
 *   y un bloque de MEDIDAS por consola, que es la parte que hay que mirar antes
 *   que la foto: cuánto mide cada pieza, cuántas filas caben y si algo se sale.
 *
 *   node odd\tasks\diseno.mjs            (ambos anchos)
 *   node odd\tasks\diseno.mjs 1440       (uno solo)
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox } from './sandbox.mjs';

const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const ROOT_CSS = path.join(process.cwd(), 'css');
const ANCHOS = process.argv[2] ? [Number(process.argv[2])] : [1440, 390];

/* Lo que hay que mirar en cada captura, y por qué. Es una lista de preguntas,
   no una lista de selectores: cada línea es algo que puede estar mal. */
const MEDIR = `(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const g = id => document.getElementById(id);
  const q = sel => document.querySelector(sel);

  const filas = [...document.querySelectorAll('.expense-card-item')];
  const primera = filas[0];
  const estados = [...document.querySelectorAll('.btn-status-toggle')];

  return {
    desbordePagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollVertical: document.documentElement.scrollHeight,

    /* P1 - la fila de cifras: una sola cifra protagonista */
    tira: r(q('.ledger-strip')),
    celdas: [...document.querySelectorAll('.ledger-strip > *')].map(c => ({
      clase: c.className, caja: r(c), lineas: c.getClientRects().length,
    })),
    pendiente: r(g('pendingSummaryLabel')),
    pendienteHijos: [...(g('pendingSummaryLabel') || { children: [] }).children].map(c => ({
      texto: c.textContent, caja: r(c), px: cs(c, 'fontSize'),
    })),

    /* P2 - el balance duplicado */
    balanceTopbar: r(g('topbarBalanceValue')),
    balanceTira: r(g('monthBalanceNeto')),

    /* P3 - el ruido de la fila */
    fila: r(primera),
    titulo: r(q('.expense-item-title')),
    tituloCss: { ws: cs(q('.expense-item-title'), 'whiteSpace'),
                 ov: cs(q('.expense-item-title'), 'overflow'),
                 te: cs(q('.expense-item-title'), 'textOverflow') },
    tags: r(q('.expense-item-tags')),
    tagsAlineacion: cs(q('.expense-item-tags'), 'justifyContent'),
    estado: r(q('.expense-item-state')),
    importe: r(q('.expense-item-amount')),
    tagTexto: (q('.expense-item-tags') || {}).textContent || null,

    /* P4 - el rail */
    rail: r(q('.app-sidebar')),
    railScroll: q('.app-sidebar') ? q('.app-sidebar').scrollHeight : null,
    railAlto: q('.app-sidebar') ? q('.app-sidebar').clientHeight : null,
    secciones: r(q('.section-rail')),
    area: r(q('.app-main-area')),

    /* P5 - color por categoría */
    acentos: ['servicios','personales','movimientos','extras'].map(k => {
      const g2 = q('[data-accent="' + k + '"]');
      return { cat: k, fondo: g2 ? getComputedStyle(g2).backgroundColor : null };
    }),

    /* Lo que las suites miden */
    estadosCount: estados.length,
    filas: filas.length,
    overlayPosicion: cs(q('.modal-overlay'), 'position'),
    overlayZ: cs(q('.modal-overlay'), 'zIndex'),
    roHidden: (() => { const b = q('.admin-action-btn');
      return b ? getComputedStyle(b).display : 'sin admin-action-btn'; })(),
    fuente: cs(document.body, 'fontFamily'),
    fuenteCifra: cs(g('monthBalanceNeto'), 'fontFamily'),
    tabular: cs(g('monthBalanceNeto'), 'fontVariantNumeric'),
    temaOscuro: !!document.querySelector('html.theme-dark'),
  };
})()`;

const r = await fs.promises;

/* Una llave desbalanceada en UNA hoja no da error: el navegador cierra el bloque
   que sobra y se come todo lo que venía después, dentro o fuera del @media. Es
   el modo de fallo más caro de un CSS partido en varios archivos, porque la
   página se ve "casi bien" y ninguna regla parece rota. Se comprueba antes de
 * capturar, no después. */
function verificarEstructuraCss(dir) {
  const malas = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.css'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    let depth = 0, linea = 1, primeraDeuda = null;
    const limpio = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    for (const ch of limpio) {
      if (ch === '\n') linea++;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0 && primeraDeuda === null) primeraDeuda = linea; }
    }
    if (depth !== 0) malas.push(`${f}: profundidad final ${depth}` +
      (primeraDeuda ? `, llave de sobra en la línea ${primeraDeuda}` : ', falta cerrar'));
  }
  return malas;
}

const malas = verificarEstructuraCss(path.join(ROOT_CSS));
if (malas.length) {
  console.error('CSS DESBALANCEADO — las reglas de adentro pueden estar muerto:\n  ' + malas.join('\n  '));
  process.exit(1);
}

for (const ancho of ANCHOS) {
  const sb = await launchSandbox({ fixture: 'baseline', width: ancho, height: 1000 });
  try {
    const f1 = path.join(DIR, `diseno-${ancho}.png`);
    const f2 = path.join(DIR, `diseno-panel-${ancho}.png`);
    const f3 = path.join(DIR, `diseno-modal-${ancho}.png`);
    await sb.shot(f1);
    await sb.eval("document.getElementById('btnNavPanel').click(); 1");
    await sb.pump(2);
    await new Promise(z => setTimeout(z, 900));
    await sb.shot(f2);
    /* El sheet es la otra mitad de la pantalla y no se judging mirando la vista
       principal: es donde están los campos, el botón primario y el velo. */
    await sb.eval("document.getElementById('btnNavMes').click(); 1");
    await sb.pump(2);
    await new Promise(z => setTimeout(z, 400));
    await sb.eval("document.getElementById('btnHeaderAddBudget').click(); 1");
    await sb.pump(2);
    await new Promise(z => setTimeout(z, 500));
    await sb.shot(f3);
    await sb.eval("document.getElementById('modalAddBudget').classList.remove('active'); 1");
    await sb.pump(1);
    await new Promise(z => setTimeout(z, 300));

    const m = await sb.eval(MEDIR);
    console.log(`\n===== ${ancho}px =====`);
    console.log(JSON.stringify(m, null, 1));
    console.log('capturas:', f1, '|', f2, '|', f3);
    console.log('console errors:', JSON.stringify(sb.consoleErrors));
    console.log('excepciones   :', JSON.stringify(sb.exceptions));
  } finally {
    await sb.close();
  }
}