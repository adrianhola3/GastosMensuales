/* Dos comprobaciones puntuales que el recorrido no resolvió:
 *  - el selector de segmentos: por qué la tarjeta "Extras" no se apaga
 *  - el buscador: por qué "luz" da 0 resultados (probe: contaba nodos, no visibles)
 */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, PAGE_URL } from './cdp.mjs';
import { PROBES } from './probes.mjs';

const s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await s.page.eval(PROBES);
  await s.page.eval(`(() => { const m = document.getElementById('modalSessionRoleSelect');
    if (m) m.classList.remove('active');
    document.body.classList.remove('read-only-mode'); return 'ok'; })()`);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 900));

  const estado = () => s.page.eval(`(() => {
    const c = document.querySelector('[data-segment-card="extras"]');
    const pills = [...document.querySelectorAll('.segment-pill-btn')].map(b => ({
      seg: b.getAttribute('data-segment'), activo: b.classList.contains('active'),
      texto: b.textContent.trim().slice(0, 18) }));
    return { inlineDisplay: c.style.display, computada: getComputedStyle(c).display,
      clases: c.className, animOut: c.classList.contains('card-anim-out'),
      animIn: c.classList.contains('card-anim-in'),
      altura: Math.round(c.getBoundingClientRect().height),
      pills, aviso: (() => { const n = document.getElementById('noSegmentsSelectedNotice');
        return n ? getComputedStyle(n).display : null; })() };
  })()`);

  console.log('INICIAL   ' + JSON.stringify(await estado()));

  await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="extras"]').click(); 'ok'`);
  for (const ms of [50, 250, 600, 1200]) {
    await new Promise(r => setTimeout(r, ms));
    console.log('click +' + ms + 'ms  ' + JSON.stringify(await estado()));
  }

  /* Volver a "todos" */
  await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="all"]').click(); 'ok'`);
  await new Promise(r => setTimeout(r, 600));
  console.log('tras "all"  ' + JSON.stringify(await estado()));

  /* Buscador con un termino que SI existe en el dataset */
  const term = await s.page.eval(`(() => {
    const it = [...document.querySelectorAll('.expense-item-title')].map(e => e.textContent.trim());
    return it[0]; })()`);
  console.log('primer concepto del dataset: ' + JSON.stringify(term));
  const buscar = async q => {
    await s.page.eval(`(() => { const i = document.getElementById('commandSearchInput');
      i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
    await s.pump(2);
    await new Promise(r => setTimeout(r, 600));
    return s.page.eval(`(() => {
      const filas = [...document.querySelectorAll('.expense-card-item')];
      return { consulta: ${JSON.stringify(q)},
        nodos: filas.length,
        visibles: filas.filter(f => getComputedStyle(f).display !== 'none').length,
        feedback: (document.getElementById('searchResultsCountText') || {}).textContent,
        feedbackVisible: getComputedStyle(document.getElementById('commandSearchResultsFeedback')).display,
        limpiar: getComputedStyle(document.getElementById('btnCommandClearSearch')).display };
    })()`);
  };
  console.log('buscar "luz"        ' + JSON.stringify(await buscar('luz')));
  console.log('buscar "internet"   ' + JSON.stringify(await buscar('internet')));
  await s.page.eval("document.getElementById('btnCommandClearSearch').click(); 'ok'");
  await new Promise(r => setTimeout(r, 500));
  console.log('tras limpiar        ' + JSON.stringify(await s.page.eval(`(() => {
    const filas = [...document.querySelectorAll('.expense-card-item')];
    return { nodos: filas.length, visibles: filas.filter(f => getComputedStyle(f).display !== 'none').length };
  })()`)));
} finally {
  await s.close();
}