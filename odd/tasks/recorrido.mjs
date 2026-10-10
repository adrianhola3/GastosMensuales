/* Recorrido funcional en TEMA CLARO.
 *
 *   node odd\tasks\recorrido.mjs <etiqueta>
 *
 * Regla dura: NO se dispara ninguna acción que escriba en Supabase. No se
 * guarda, no se borra, no se agrega, no se cambia el estado de un gasto.
 * `gastosRemoto.guardar`, `.iniciarSesion`, `.salirDeSesion` y
 * `.iniciarSesionConGithub` se congelan con contadores ANTES de la primera
 * interacción, y el contador se lee DESPUÉS de cada paso: así se puede decir de
 * qué paso vino cada intento, en vez de dar un total sin origen.
 *
 * Abrir y cerrar drawers y modales está permitido: no escriben.
 */
import path from 'node:path';
import fs from 'node:fs';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, PAGE_URL } from './cdp.mjs';
import { PROBES } from './probes.mjs';

const LABEL = process.argv[2] || 'r4';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const pasos = [];
let ultimasEscrituras = { guardar: 0, iniciarSesion: 0, salirDeSesion: 0, github: 0 };
let s;

const settle = async (ms = 700) => { await s.pump(3); await new Promise(r => setTimeout(r, ms)); };
/* app.js corta la tarjeta a los 160ms con setTimeout (card-anim-out). Cualquier
   lectura hecha antes de eso ve el estado ANTIGUO y parece un bug. */
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function paso(nombre, fn, ASSERT = () => true, escribir = false) {
  const antes = JSON.parse(await s.page.eval('JSON.stringify(window.__probe)'));
  const r = await fn();
  await settle();
  const despues = JSON.parse(await s.page.eval('JSON.stringify(window.__probe)'));
  const nuevas = Object.fromEntries(Object.keys(despues).map(k => [k, despues[k] - antes[k]]));
  const total = Object.values(nuevas).reduce((a, b) => a + b, 0);
  const ok = ASSERT(r);
  pasos.push({ n: pasos.length + 1, nombre, ok, detalle: r, escrituras: nuevas, escribio: total > 0 });
  console.log(
    (ok ? 'OK   ' : 'FALLA') + ' ' + String(pasos.length).padStart(2) + '. ' + nombre.padEnd(46) +
    (total > 0 ? '  *** ' + total + ' ESCRITURA(S) ' + JSON.stringify(nuevas) : '')
  );
  if (r && typeof r === 'object') console.log('        ' + JSON.stringify(r).slice(0, 300));
  return r;
}

/* Atajos de lectura */
const leer = sel => `document.querySelector(${JSON.stringify(sel)})`;
const texto = sel => s.page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim() : null; })()`);
const cuenta = sel => s.page.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const activo = sel => s.page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.classList.contains('active') : null; })()`);

s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await s.page.eval(PROBES);
  await s.page.eval(`(() => {
    const m = document.getElementById('modalSessionRoleSelect');
    if (m) m.classList.remove('active');
    document.body.classList.remove('read-only-mode');
    return 'ok';
  })()`);
  await settle(900);
  ultimasEscrituras = JSON.parse(await s.page.eval('JSON.stringify(window.__probe)'));
  console.log('escrituras RESIDUALES del arranque de la app: ' + JSON.stringify(ultimasEscrituras));
  console.log('');

  /* ---------------- 1. Vistas ---------------- */
  await paso('Vista Mensual activa al entrar',
    async () => ({ mes: await activo('#viewMes'), panel: await activo('#viewPanel'), rail: await activo('#btnNavMes') }),
    r => r.mes === true && r.panel === false && r.rail === true);

  await paso('Consolidado: cambiar de vista',
    async () => {
      await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
      return { mes: await activo('#viewMes'), panel: await activo('#viewPanel'), rail: await activo('#btnNavPanel'),
        filasMatriz: await cuenta('.matrix-table tbody tr'), kpi: await cuenta('.metric-kpi') };
    },
    r => r.mes === false && r.panel === true && r.filasMatriz > 0);

  await paso('Volver a Vista Mensual',
    async () => {
      await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
      await esperar(600);
      /* `getComputedStyle(c).display` no basta: los 3 bloques del Consolidado
       * siguen con display:block propia, lo que los oculta es el ancestro
       * `#viewPanel`. `checkVisibility()` sí resuelve por el árbol. */
      return { mes: await activo('#viewMes'),
        /* T5: las cuatro cajas del libro son ahora los cuatro grupos. */
        gruposTotales: await cuenta('.ledger-group'),
        gruposVisibles: await s.page.eval(`[...document.querySelectorAll('.ledger-group')]
          .filter(c => c.checkVisibility()).length`) };
    },
    r => r.mes === true && r.gruposVisibles === 4);

  /* ---------------- 2. Buscador ---------------- */
  await paso('Buscador: filtra y restaura',
    async () => {
      const visibles = () => s.page.eval(`[...document.querySelectorAll('.expense-card-item')]
        .filter(f => getComputedStyle(f).display !== 'none').length`);
      /* El termino tiene que existir en el dataset: app.js:1010 compara el
       * texto de la fila con `includes`, y "luz" no esta en ningun concepto
       * (esta en la DESCRIPCION de la seccion). Con "luz" da 0 resultados y las
       * 10 filas quedan ocultas, que es correcto y no un fallo del buscador. */
      const antes = await visibles();
      await s.page.eval(`(() => { const i = document.getElementById('commandSearchInput');
        i.value = 'internet'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
      await esperar(500);
      const conFiltro = await visibles();
      const feedback = await texto('#searchResultsCountText');
      const conCero = await s.page.eval(`(() => { const i = document.getElementById('commandSearchInput');
        i.value = 'luz'; i.dispatchEvent(new Event('input', { bubbles: true }));
        return { visibles: [...document.querySelectorAll('.expense-card-item')]
          .filter(f => getComputedStyle(f).display !== 'none').length,
          limpiar: getComputedStyle(document.getElementById('btnCommandClearSearch')).display,
          feedback: getComputedStyle(document.getElementById('commandSearchResultsFeedback')).display }; })()`);
      const feedbackCero = await texto('#searchResultsCountText');
      await s.page.eval("document.getElementById('btnCommandClearSearch').click(); 'ok'");
      await esperar(500);
      const limpio = await visibles();
      return { antes, conFiltro, feedback, conCero: conCero.visibles,
        limpiarConConsulta: conCero.limpiar, feedbackConConsulta: conCero.feedback,
        feedbackCero, limpio,
        /* Al limpiar, app.js:981-982 esconde el botón de limpiar y el feedback:
           con la consulta vacía no hay nada que mostrar. */
        limpiarAlLimpiar: await s.page.eval("getComputedStyle(document.getElementById('btnCommandClearSearch')).display"),
        feedbackAlLimpiar: await s.page.eval("getComputedStyle(document.getElementById('commandSearchResultsFeedback')).display") };
    },
    /* T5 — se saiu el literal `r.antes === 10` de esta aserción.
     *
     * No arreglaba nada: el 10 era el número de gastos del mes que estaba activo
     * cuando se escribió el recorrido, y el perfil real cambia de período a lo
     * largo de la corrida. Con 9 gastos la comprobación fallaba aunque el
     * buscador hiciera todo lo correcto —y lo hacía: 1 resultado con "internet",
     * 0 con "luz", y las 9 de vuelta al limpiar—.
     *
     * Lo que esta aserción tiene que decir es sobre el BUSCADOR, no sobre el
     * dataset: que filtra, que no inventa resultados, que restaura y que
     * esconde el botón de limpiar cuando ya no hay consulta. `antes` se usa
     * como línea de base, no como constante. */
    r => r.antes > 0 && r.conFiltro === 1 && /1 resultado/.test(r.feedback || '') &&
         r.conCero === 0 && /0 resultados/.test(r.feedbackCero || '') &&
         r.limpiarConConsulta === 'flex' && r.feedbackConConsulta === 'flex' &&
         r.limpio === r.antes &&
         r.limpiarAlLimpiar === 'none' && r.feedbackAlLimpiar === 'none');

  /* ---------------- 3. Periodos ---------------- */
  await paso('Los 6 periodos con uno activo',
    async () => {
      const total = await cuenta('.month-pill-btn');
      const activos = await s.page.eval(`[...document.querySelectorAll('.month-pill-btn')]
        .filter(b => b.getAttribute('aria-pressed') === 'true').length`);
      return { total, activos, nombres: await s.page.eval(`[...document.querySelectorAll('.month-pill-btn')].map(b => b.textContent.trim())`) };
    },
    r => r.total === 6 && r.activos === 1);

  await paso('Periodo activo coherente con el topbar',
    async () => ({ topbar: await texto('#activeMonthHeaderBadge'),
      activo: await texto('.month-pill-btn[aria-pressed="true"]'),
      reglas: await s.page.eval(`(() => { const b = document.querySelector('.month-pill-btn[aria-pressed="true"]');
        return getComputedStyle(b, '::after').backgroundColor; })()`) }),
    r => r.topbar === r.activo);

  await paso('Click en un periodo re-renderiza',
    async () => {
      await s.page.eval("document.querySelectorAll('.month-pill-btn')[1].click(); 'ok'");
      return { topbar: await texto('#activeMonthHeaderBadge'), filas: await cuenta('.expense-card-item') };
    },
    r => /septiembre/i.test(r.topbar) && r.filas > 0);

  await paso('Flecha siguiente / anterior',
    async () => {
      await s.page.eval("document.querySelector('#btnNextMonth').click(); 'ok'");
      const sig = await texto('#activeMonthHeaderBadge');
      await s.page.eval("document.querySelector('#btnPrevMonth').click(); 'ok'");
      const ant = await texto('#activeMonthHeaderBadge');
      await s.page.eval("document.querySelector('#btnPrevMonth').click(); 'ok'");
      return { sig, ant, vuelta: await texto('#activeMonthHeaderBadge') };
    },
    r => /octubre/i.test(r.sig) && /septiembre/i.test(r.ant) && /agosto/i.test(r.vuelta));

  /* ---------------- 4. Las 4 categorias ---------------- */
  await paso('Las 4 categorias con su total',
    async () => {
      const out = [];
      for (const k of ['servicios', 'personales', 'movimientos', 'extras']) {
        out.push(await s.page.eval(`(() => {
          const c = document.querySelector('[data-segment-card="' + ${JSON.stringify(k)} + '"]');
          if (!c) return null;
          return { k: ${JSON.stringify(k)},
            titulo: c.querySelector('h3') ? c.querySelector('h3').textContent.trim() : null,
            cifra: c.querySelector('.section-total-value, .summary-tag-value, [class*="section-total"]') ?
              c.querySelector('.section-total-value, .summary-tag-value, [class*="section-total"]').textContent.trim() : null,
            filas: c.querySelectorAll('.expense-card-item').length,
            visible: getComputedStyle(c).display !== 'none' };
        })()`));
      }
      return out;
    },
    r => r.length === 4 && r.every(x => x && x.visible));

  await paso('Un acento por categoria, cuatro tics distintos',
    async () => {
      const t = await s.page.eval(`[...document.querySelectorAll('.cat-tick')]
        .map(e => getComputedStyle(e).backgroundColor)`);
      return { total: t.length, distintos: new Set(t).size, colores: t };
    },
    r => r.total === 7 && r.distintos >= 4);

  /* ---------------- 5. Segmentos: apagar una categoria ---------------- */
  await paso('Selector de segmentos: apagar y reactivar',
    async () => {
      const pills = await s.page.eval(`[...document.querySelectorAll('.segment-pill-btn')]
        .map(b => b.getAttribute('data-segment'))`);
      await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="extras"]').click(); 'ok'`);
      await esperar(600);
      const apagada = await s.page.eval(`getComputedStyle(document.querySelector('[data-segment-card="extras"]')).display`);
      const pillActiva = await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="extras"]').classList.contains('active')`);
      const verTodoInactivo = await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="all"]').classList.contains('active')`);
      await s.page.eval(`document.querySelector('.segment-pill-btn[data-segment="all"]').click(); 'ok'`);
      await esperar(600);
      return { pills, apagada, pillActiva, verTodoInactivo,
        reactivada: await s.page.eval(`getComputedStyle(document.querySelector('[data-segment-card="extras"]')).display`) };
    },
    r => r.apagada === 'none' && r.pillActiva === false && r.verTodoInactivo === false && r.reactivada !== 'none');

  /* ---------------- 6. El encabezado del grupo contrae y despliega ---------
   * T5: el control es `.ledger-group-toggle`, un <button> real. Antes se
   * buscaban `.section-header, h3` dentro del grupo, que era un selector de
   * adivinanza sobre nombres que no existen en el DOM: el encabezado era un
   * `div`, y el `h3` estaba DENTRO de él, así que el clic caía en el hijo y el
   * `if (e.target.closest('button')) return` lo descartaba. El paso pasaba por
   * casualidad, no por lo que probaba. */
  await paso('Encabezado del grupo: colapsa y expande, y lo dice con aria-expanded',
    async () => {
      const estado = () => s.page.eval(`(() => {
        const g = document.querySelector('[data-segment-card="servicios"]');
        const t = g.querySelector('.ledger-group-toggle');
        return { alto: Math.round(g.getBoundingClientRect().height),
                 collapsed: g.classList.contains('collapsed'),
                 aria: t.getAttribute('aria-expanded') };
      })()`);
      const antes = await estado();
      await s.page.eval(`document.querySelector('[data-segment-card="servicios"] .ledger-group-toggle').click(); 'ok'`);
      const colapsada = await estado();
      await s.page.eval(`document.querySelector('[data-segment-card="servicios"] .ledger-group-toggle').click(); 'ok'`);
      const expandida = await estado();
      return { antes, colapsada, expandida };
    },
    r => r.colapsada.alto < r.antes.alto && r.colapsada.collapsed === true
      && r.colapsada.aria === 'false' && r.expandida.aria === 'true'
      && Math.abs(r.expandida.alto - r.antes.alto) < 2);

  /* ---------------- 7. Cifras de cabecera ---------------- */
  await paso('Cifras del mes: ingresos, presupuesto, balance, cobertura',
    async () => ({
      ingresos: await texto('#monthTotalIngresos'),
      egresos: await texto('#monthTotalEgresos'),
      balance: await texto('#monthBalanceNeto'),
      estado: await texto('#monthBalanceStatusLabel'),
      cobertura: await texto('#monthAbonoPercentLabel'),
      pagado: await texto('#paidTextInfo'),
      pendiente: await texto('#pendingSummaryLabel'),
      pct: await texto('#paidPercentBadge'),
      notasIngresos: await texto('#monthIngresosCount'),
      notasGastos: await texto('#monthGastosCount'),
    }),
    r => /^S\//.test(r.ingresos || '') && /^S\//.test(r.balance || '') && /%/.test(r.cobertura || ''));

  await paso('El acento de estado solo va en la cifra del balance',
    async () => ({
      balance: await s.page.eval("getComputedStyle(document.getElementById('monthBalanceNeto')).color"),
      ingresos: await s.page.eval("getComputedStyle(document.getElementById('monthTotalIngresos')).color"),
      etiqueta: await s.page.eval("getComputedStyle(document.getElementById('monthBalanceStatusLabel')).color"),
    }),
    r => r.balance !== r.ingresos);

  /* ---------------- 8. Graficos ---------------- */
  await paso('Consolidado: los dos lienzos pintados y con color',
    async () => {
      await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
      await settle(1500);
      const c = await s.page.eval('window.__audit.canvas()');
      return c.map(x => ({ id: x.id, w: x.cssW, h: x.cssH, pintados: x.pintados, colores: x.coloresDistintos,
        conAcento: (x.colores || []).filter(c => c !== 'rgb(0, 0, 0)' && !/rgb\(255, 255, 255\)/.test(c)).length }));
    },
    r => r.length === 2 && r.every(x => x.pintados > 1000 && x.conAcento > 0),
    true);

  /* ---------------- 9. Notas ---------------- */
  await paso('Notas: abre con el periodo y cierra',
    async () => {
      await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
      await settle(800);
      await s.page.eval("document.querySelector('#btnOpenNotesModal').click(); 'ok'");
      const abierto = await activo('#modalMonthNotes');
      const sub = await texto('#modalNotesSubtitle');
      await s.page.eval("(function(){const b=document.querySelector('#modalMonthNotes .btn-close-sheet-btn, #modalMonthNotes .modal-close'); if(b) b.click(); return 'ok';})()");
      return { abierto, sub, cerrado: await activo('#modalMonthNotes') };
    },
    r => r.abierto === true && /2026|2027/.test(r.sub || '') && r.cerrado === false);

  /* ---------------- 10. Estado de conexion ---------------- */
  await paso('Estado de conexion visible',
    async () => ({ badge: await texto('.conn-badge'),
      clase: await s.page.eval("document.querySelector('.conn-badge').className"),
      punto: await s.page.eval("(() => { const b = document.querySelector('.conn-badge'); return b ? getComputedStyle(b, '::before').backgroundColor : null; })()") }),
    r => /en linea|en l\xednea|conect/i.test(r.badge || ''));

  /* ---------------- 11. Modo Lector / Administrador ---------------- */
  await paso('Modo Lector oculta las acciones de administrador',
    async () => {
      await s.page.eval("document.body.classList.add('read-only-mode'); 'ok'");
      const comoLector = await s.page.eval(`(() => {
        const bs = [...document.querySelectorAll('.admin-action-btn')];
        return { total: bs.length, visibles: bs.filter(b => getComputedStyle(b).display !== 'none').length };
      })()`);
      const etiqueta = await texto('#authModeLabel');
      await s.page.eval("document.body.classList.remove('read-only-mode'); 'ok'");
      const comoAdmin = await s.page.eval(`(() => {
        const bs = [...document.querySelectorAll('.admin-action-btn')];
        return bs.filter(b => getComputedStyle(b).display !== 'none').length;
      })()`);
      return { total: comoLector.total, visiblesComoLector: comoLector.visibles,
        visiblesComoAdmin: comoAdmin, etiqueta };
    },
    r => r.total > 0 && r.visiblesComoLector === 0 && r.visiblesComoAdmin === r.total,
    true);

  /* ---------------- 12. Drawer / modal de pago variable ( Variable + Pendiente ) ---------------- */
  await paso('Modal de pago variable abre SIN escribir',
    async () => {
      /* Solo se puede abrir desde una fila Variable y Pendiente: en una fila Fija
         el mismo click llama a store.toggleBudgetItemStatus, que ES una escritura.
         Por eso el selector filtra por etiqueta antes de hacer nada. */
      const idx = await s.page.eval(`(() => {
        const filas = [...document.querySelectorAll('.expense-card-item')];
        return filas.findIndex(f => {
          const tags = f.querySelector('.expense-item-tags');
          const st = f.querySelector('.btn-status-toggle');
          return tags && /Variable/i.test(tags.textContent) && st && /Pendiente/i.test(st.textContent);
        });
      })()`);
      if (idx < 0) return { idx, nota: 'el dataset no tiene filas Variable+Pendiente en este periodo' };
      await s.page.eval(`document.querySelectorAll('.expense-card-item')[${idx}].querySelector('.btn-status-toggle').click(); 'ok'`);
      return { idx, abierto: await activo('#modalPayVariableExpense'),
        titulo: await texto('#modalPayVarTitle') };
    },
    r => r.idx < 0 ? true : r.abierto === true,
    true);

  await paso('Cerrar el modal de pago variable',
    async () => {
      await s.page.eval("(function(){for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active'); return 'ok';})()");
      return { cerrados: await s.page.eval(`[...document.querySelectorAll('.modal-overlay.active')].length`) };
    },
    r => r.cerrados === 0);

  /* ---------------- 13. prefers-reduced-motion ---------------- */
  await paso('prefers-reduced-motion cubre transiciones y keyframes',
    async () => {
      await s.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await s.pump(2);
      const m = await s.page.eval('window.__audit.movimiento()');
      const press = await s.page.eval(`(() => { const b = document.querySelector('.sidebar-nav-tab');
        b.classList.add('x'); return getComputedStyle(b).transitionDuration; })()`);
      await s.page.send('Emulation.setEmulatedMedia', { features: [] });
      await s.pump(2);
      return { ...m };
    },
    r => Object.values(r).every(v => !v.transition || parseFloat(v.transition) < 0.001));

  /* ---------------- 14. Sin exceptions ni console.error ---------------- */
  const resumen = {
    pasos: pasos.length,
    ok: pasos.filter(p => p.ok).length,
    falla: pasos.filter(p => !p.ok).map(p => p.n + '. ' + p.nombre),
    conEscritura: pasos.filter(p => p.escribio).map(p => p.n + '. ' + p.nombre + ' ' + JSON.stringify(p.escrituras)),
    escriturasTotales: pasos.reduce((a, p) => a + Object.values(p.escrituras).reduce((x, y) => x + y, 0), 0),
    consoleErrors: [...s.consoleErrors],
    exceptions: [...s.exceptions],
    fallosRed: [...s.failedRequests],
  };
  console.log('');
  console.log('=== RESUMEN DEL RECORRIDO EN CLARO ===');
  console.log('pasos: ' + resumen.pasos + '   OK: ' + resumen.ok + '   FALLA: ' + resumen.falla.length);
  if (resumen.falla.length) console.log('  fallan: ' + resumen.falla.join(' | '));
  console.log('escrituras a Supabase durante el recorrido: ' + resumen.escriturasTotales +
    (resumen.conEscritura.length ? '  en ' + resumen.conEscritura.join(' | ') : '  (ninguna)'));
  console.log('residual del arranque: ' + JSON.stringify(ultimasEscrituras));
  console.log('console.error: ' + resumen.consoleErrors.length + '   excepciones: ' + resumen.exceptions.length +
    '   red>=400: ' + resumen.fallosRed.length + (resumen.fallosRed.length ? ' -> ' + resumen.fallosRed.join(' | ') : ''));
  pasos.resumen = resumen;
} finally {
  await s.close();
}

fs.writeFileSync(path.join(DIR, `recorrido-${LABEL}.report.json`), JSON.stringify(pasos, null, 2));