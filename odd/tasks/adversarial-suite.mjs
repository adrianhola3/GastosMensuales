/* adversarial-suite.mjs - T3: "Debe funcionar para cualquier situacion."
 *
 * WHAT THIS IS
 * ------------
 * T2 proved the happy path. This suite attacks it: empty states, amounts that
 * break number formatting, hostile text in `concepto`, corrupt JSON, CSV
 * injection, and destroying the last thing that exists. The pass criterion is
 * not "the app works" but "the app never lies": no NaN, no `undefined`, no dead
 * control, no crash, and never a silent data loss.
 *
 * THE HONESTY RULE, APPLIED HARD
 * ------------------------------
 * A test that cannot observe what it claims to test is worse than no test: it
 * manufactures a green checkmark. So:
 *   - every test records the concrete probe that produced its verdict;
 *   - a probe that captured NOTHING is marked INCONCLUSIVE, never PASS;
 *   - a capability that has no UI at all is reported as a finding with the DOM
 *     evidence that it is absent, rather than quietly downgraded to a store
 *     call. Three of the classes the brief asks for (import JSON, export CSV,
 *     bulk toggles) are in that bucket, and saying so IS the result.
 *
 * ISOLATION
 * ---------
 * sandbox.mjs: throwaway browser profile, forced admin session, a
 * `window.gastosRemoto` stub with ZERO network I/O, synthetic fixtures under
 * the real store key. The user's browser and real data are never involved.
 * assertNetworkClean() runs on EVERY test.
 *
 * XSS DETECTION - how a "no script executed" claim is actually earned
 * ------------------------------------------------------------------
 * `escaparHTML()` (app.js:56) is the only defence. If it were bypassed, an
 * injected `<img src=x onerror=alert(1)>` would create a real element whose
 * error handler fires `alert(1)`. The CDP dialog channel records EVERY alert,
 * so "alert(1) was never raised" is a genuine observation, not an assumption.
 * On top of that each case asserts (a) no `script`/`img`/`iframe` node appeared
 * inside the rendered row, (b) the row's `outerHTML` contains the escaped
 * entities, and (c) the row is still laid out with no horizontal overflow.
 *
 * Run:  node odd\tasks\adversarial-suite.mjs
 *       node odd\tasks\adversarial-suite.mjs --only=montos
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox, STORAGE_KEY, buildFixture, FIXTURE_NAMES } from './sandbox.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* =====================================================================
 * RUNNER
 * ===================================================================== */

const GROUPS = [];
let currentGroup = null;

function group(fixture, title) {
  currentGroup = { fixture, title, tests: [] };
  GROUPS.push(currentGroup);
}

function test(name, fn) {
  if (!currentGroup) throw new Error('test() called outside a group()');
  currentGroup.tests.push({ name, fn });
}

class Probe {
  constructor(name) {
    this.name = name;
    this.checks = [];
    this.gaps = [];
    this.notes = [];
  }
  ok(cond, label, detail) {
    this.checks.push({ pass: !!cond, label, detail: detail === undefined ? null : detail });
    return !!cond;
  }
  equal(actual, expected, label, extra) {
    const d = { actual, expected };
    if (extra !== undefined && extra !== null) d.contexto = extra;
    return this.ok(JSON.stringify(actual) === JSON.stringify(expected), label, d);
  }
  /** A probe that could not see the thing it claims to test. Never a PASS. */
  inconclusive(label, why) { this.gaps.push({ label, why }); }
  note(text) { this.notes.push(text); }
  get verdict() {
    if (this.checks.some(c => !c.pass)) return 'FAIL';
    if (this.gaps.length) return 'INCONCLUSIVE';
    return 'PASS';
  }
}

/* =====================================================================
 * DIALOG CHANNEL - real CDP answers
 * ===================================================================== */

const ctx = { dialogs: [], dialogPolicy: 'accept' };

function engancharDialogos(sb) {
  sb.page.on(msg => {
    if (msg.method !== 'Page.javascriptDialogOpening') return;
    const type = msg.params.type;
    const accept = type === 'confirm' ? ctx.dialogPolicy === 'accept' : false;
    ctx.dialogs.push({ type, message: msg.params.message, accepted: accept });
    sb.page.send('Page.handleJavaScriptDialog', { accept }).catch(() => { /* target closed */ });
  });
}

async function pulsarConDialogos(sb, expr, waitMs = 3500) {
  ctx.dialogs.length = 0;
  let res = null, err = null;
  const pendiente = sb.eval(expr).then(v => { res = v; }, e => { err = String(e && e.message || e); });
  await Promise.race([pendiente, sleep(waitMs)]);
  await sleep(150);
  return { res, err, dialogs: ctx.dialogs.slice(), colgado: res === null && err === null };
}

/** Count dialogs raised over an arbitrary window, without consuming the budget
 *  that `pulsarConDialogos` uses. */
async function contarDialogos(sb, expr, ms = 1200) {
  ctx.dialogs.length = 0;
  const pendiente = sb.eval(expr).then(() => {}, () => {});
  await Promise.race([pendiente, sleep(ms)]);
  return ctx.dialogs.slice();
}

/* =====================================================================
 * READ PROBES
 * ===================================================================== */

const disk = sb => sb.eval(`(() => { try {
  const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  return raw === null ? null : JSON.parse(raw);
} catch (e) { return { __error: String(e) }; } })()`);

const mem = sb => sb.data();

const modalAbierto = (sb, id) => sb.eval(
  `!!document.getElementById(${JSON.stringify(id)}) && ` +
  `document.getElementById(${JSON.stringify(id)}).classList.contains('active')`);

const erroresVisibles = sb => sb.eval(`(() => {
  const malos = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t || !n.parentElement) continue;
    const cs = getComputedStyle(n.parentElement);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (/(^|[^A-Za-z0-9_])(NaN|undefined|Infinity|null)([^A-Za-z0-9_]|$)/.test(t)) {
      malos.push({ texto: t.slice(0, 90), tag: n.parentElement.tagName.toLowerCase(),
                   id: n.parentElement.id || null });
    }
  }
  return malos;
})()`);

/** Was the screen actually painted? A blank body is the failure mode that
 *  "no NaN" alone would wave through. */
const pantallaUtil = sb => sb.eval(`(() => {
  const b = document.body;
  const texto = (b.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    chars: texto.length,
    viewMesActiva: !!(document.getElementById('viewMes') || {}).className
      && document.getElementById('viewMes').classList.contains('active'),
    filas: document.querySelectorAll('.expense-card-item, .transaction-feed-item').length,
    kpisVisibles: ['monthTotalIngresos', 'monthTotalEgresos', 'monthBalanceNeto',
      'activeMonthHeaderBadge'].filter(id => {
        const e = document.getElementById(id);
        return e && getComputedStyle(e).display !== 'none' && (e.textContent || '').trim().length > 0;
      }),
    texto: texto.slice(0, 220),
  };
})()`);

const PULSAR_EN_GASTO = (concepto, boton) => `(() => {
  const filas = [...document.querySelectorAll('.expense-card-item')];
  const f = filas.find(x => {
    const t = x.querySelector('.expense-item-title');
    return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return { ok: false, motivo: 'no hay fila con ese titulo',
    titulos: filas.map(x => (x.querySelector('.expense-item-title') || {}).textContent) };
  const b = f.querySelector(${JSON.stringify(boton)});
  if (!b) return { ok: false, motivo: 'la fila no tiene ' + ${JSON.stringify(boton)} };
  b.click();
  return { ok: true };
})()`;

const textoFilaGasto = (sb, concepto) => sb.eval(`(() => {
  const f = [...document.querySelectorAll('.expense-card-item')].find(x => {
    const t = x.querySelector('.expense-item-title'); return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return null;
  const chip = f.querySelector('.btn-status-toggle');
  const amt = f.querySelector('.expense-item-amount');
  const title = f.querySelector('.expense-item-title');
  const cs = getComputedStyle(title);
  return {
    titulo: title.textContent.trim(),
    outerHTML: title.outerHTML,
    importe: amt ? amt.textContent.trim() : null,
    estado: chip ? chip.textContent.trim() : null,
    overflowHorizontal: title.scrollWidth - title.clientWidth,
    cssWhiteSpace: cs.whiteSpace, cssOverflow: cs.overflow, cssTextOverflow: cs.textOverflow,
    hijos: [...f.children].map(c => c.className),
  };
})()`);

const textoMovimiento = (sb, concepto) => sb.eval(`(() => {
  const f = [...document.querySelectorAll('.transaction-feed-item')].find(x => {
    const t = x.querySelector('h4'); return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return null;
  const amt = f.querySelector('.tx-amount');
  return { concepto: f.querySelector('h4').textContent.trim(),
           outerHTML: f.querySelector('h4').outerHTML,
           importe: amt ? amt.textContent.trim() : null };
})()`);

async function escribirConTeclado(sb, selector, texto) {
  const foco = await sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
    e.value = ''; e.focus();
    return { ok: document.activeElement === e };
  })()`);
  if (!foco.ok) return foco;
  await sb.page.send('Input.insertText', { text: String(texto) });
  await sb.pump(1);
  const fin = await sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    return { ok: true, valor: e.value, longitud: e.value.length };
  })()`);
  fin.viaTeclado = fin.valor === String(texto);
  return fin;
}

/** Paste-equivalent. For `input[type=number]` the browser sanitizes the value, so
 *  this is also how "what does the field actually accept?" gets answered. */
async function escribirValor(sb, selector, texto) {
  return sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
    const pedido = ${JSON.stringify(String(texto))};
    e.value = pedido;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    const flags = e.validity ? Object.fromEntries(
      ['badInput', 'rangeOverflow', 'rangeUnderflow', 'stepMismatch',
       'typeMismatch', 'valueMissing'].map(k => [k, e.validity[k]])) : null;
    return { ok: true, pedido, valor: e.value, conservado: e.value === pedido,
             longitud: e.value.length, flags, vacio: e.value === '' };
  })()`);
}

const ELEGIR_EN_SELECT = (selector, valor) => `(() => {
  const s = document.querySelector(${JSON.stringify(selector)});
  if (!s) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
  if (![...s.options].some(o => o.value === ${JSON.stringify(valor)})) {
    return { ok: false, motivo: 'opcion inexistente', opciones: [...s.options].map(o => o.value) };
  }
  s.value = ${JSON.stringify(valor)};
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, valor: s.value };
})()`;

const PULSAR_SUBMIT_DE = (formId) => `(() => {
  const f = document.getElementById(${JSON.stringify(formId)});
  if (!f) return { ok: false, motivo: 'no existe el form' };
  const b = f.querySelector('button[type="submit"]');
  if (!b) return { ok: false, motivo: 'el form no tiene button[type=submit]' };
  const valido = f.checkValidity();
  const invalidos = [...f.querySelectorAll(':invalid')].map(e => ({
    id: e.id || null, valor: e.value,
    flags: Object.fromEntries(['badInput', 'rangeOverflow', 'rangeUnderflow', 'stepMismatch',
      'typeMismatch', 'valueMissing'].map(k => [k, e.validity[k]])),
  }));
  b.click();
  return { ok: true, valido, invalidos };
})()`;

async function pulsarEscape(sb) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await sb.page.send('Input.dispatchKeyEvent', {
      type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    });
  }
  await sb.pump(2);
  await sleep(250);
}

const mesDe = (data, mid) => (data && data.meses ? data.meses[mid] || null : null);
const todasListas = m => m ? [
  ...(m.servicios.fijos || []), ...(m.servicios.variables || []),
  ...(m.personales.fijos || []), ...(m.personales.variables || []), ...(m.extras || []),
] : [];
const listaDe = (m, seccion, sub) => {
  if (!m) return [];
  if (seccion === 'extras') return m.extras || [];
  return (m[seccion] && m[seccion][sub]) || [];
};
const buscarGasto = (m, id) => todasListas(m).find(i => i.id === id) || null;

const A = 'prueba-alfa-2026';
const B = 'prueba-beta-2026';

/* =====================================================================
 * SHARED BUILDERS - every one of these drives the real UI
 * ===================================================================== */

/** Add one expense through the topbar sheet. Returns a full observation of what
 *  the field accepted, what the store kept and what the screen shows. */
async function crearGastoPorUI(sb, { concepto, monto, seccion, subseccion, rango, estado }) {
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sb.pump(1);
  await sleep(200);
  if (seccion) await sb.eval(ELEGIR_EN_SELECT('#budgetSection', seccion));
  if (subseccion) await sb.eval(ELEGIR_EN_SELECT('#budgetSubsection', subseccion));
  const c = await escribirConTeclado(sb, '#budgetConcepto', concepto);
  const m = await escribirValor(sb, '#budgetMonto', monto);
  if (rango !== undefined) await escribirValor(sb, '#budgetRango', rango);
  if (estado) await sb.eval(ELEGIR_EN_SELECT('#budgetEstado', estado));
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2);
  await sleep(400);
  return { conceptoCampo: c, montoCampo: m, envio };
}

async function crearMovimientoPorUI(sb, { concepto, monto, fecha, flujo }) {
  const boton = flujo === 'Gasto' ? '#btnQuickActionExpense' : '#btnQuickActionIncome';
  await sb.eval(`document.querySelector(${JSON.stringify(boton)}).click(); 1`);
  await sb.pump(1);
  await sleep(250);
  await escribirConTeclado(sb, '#movConcepto', concepto);
  await escribirValor(sb, '#movMonto', String(monto));
  if (fecha) await escribirValor(sb, '#movFecha', fecha);
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddMovement'));
  await sb.pump(2);
  await sleep(400);
  return { envio };
}

/* =====================================================================
 * T3.1 - EMPTY STATES
 * "Debe funcionar para cualquier situación" starts with nothing at all.
 * ===================================================================== */

group('mesVacio', 'Estados vacios: un mes sin gastos, sin movimientos, sin nada');

test('empty.month-with-no-data: every KPI renders a real number, no NaN, no blank', async (sb, p) => {
  const d0 = await disk(sb);
  const m0 = mesDe(d0, A);
  p.equal(todasListas(m0).length, 0, 'fixture precondition: 0 expenses');
  p.equal(m0.movimientos.length, 0, 'fixture precondition: 0 movements');

  const pantalla = await pantallaUtil(sb);
  p.ok(pantalla.chars > 200, 'the month view painted real content, it is not a blank screen', pantalla);
  p.equal(pantalla.kpisVisibles.length, 4, 'all four headline KPIs rendered non-empty text',
    { kpis: pantalla.kpisVisibles });
  const kpis = await sb.eval(`(() => {
    const g = id => (document.getElementById(id) || {}).textContent;
    return { ingresos: g('monthTotalIngresos'), egresos: g('monthTotalEgresos'),
             balance: g('monthBalanceNeto'), etiquetaBalance: g('monthBalanceStatusLabel'),
             estadoPago: g('paidPercentBadge'), pendiente: g('pendingSummaryLabel'),
             informacion: g('paidTextInfo'), abono: g('monthAbonoPercentLabel'),
             countGastos: g('monthGastosCount'), countIngresos: g('monthIngresosCount'),
             topbar: g('topbarBalanceValue') };
  })()`);
  p.ok(Object.values(kpis).every(v => v && v.indexOf('NaN') < 0 && v.indexOf('undefined') < 0),
    'no KPI reads NaN or undefined', kpis);
  p.equal(kpis.ingresos, 'S/ 0.00', 'ingresos on an empty month');
  /* El presupuesto ya no es un número suelto: con estimado y real separados,
   * la celda NOMBRA la magnitud que muestra ("Estimado" = lo que se planeó).
   * El número no cambió —sigue siendo un cero real de 0.00—, lo que cambió es
   * que la celda diga cuál de los dos importes es. La comparación sigue siendo
   * EXACTA a propósito: un NaN o un "undefined" adentro la sigue haciendo
   * fallar, que es justo lo que este test existe para detectar. */
  p.equal(kpis.egresos, 'Estimado S/ 0.00',
    'egresos on an empty month: the cell names the magnitude (Estimado) AND holds a real zero');
  p.equal(kpis.balance, 'S/ 0.00', 'balance on an empty month');
  p.equal(kpis.etiquetaBalance, 'Equilibrado', 'the balance label says Equilibrado, not "0 of 0"');
  p.equal(kpis.estadoPago, '0.0% Pagado', 'the paid percentage is a number, not NaN%');
  p.equal(kpis.countGastos, '0 de 0 gastos pagados', 'the paid-count line reads 0 of 0');
  p.equal(kpis.countIngresos, '0 abonos registrados', 'the income-count line reads 0');
  p.ok(/S\/ 0\.00/.test(kpis.pendiente), 'the pending line shows a currency amount', kpis);
  p.equal(kpis.abono, '0.0%', 'the coverage percentage is 0.0%, not NaN%');
  const malos = await erroresVisibles(sb);
  p.equal(malos.length, 0, 'no visible NaN/undefined/Infinity/null text anywhere in the tree', { malos });
  p.equal((await sb.writeCount()).writes, 0, 'rendering an empty month persisted nothing');
});

/* T5: esta aserción codificaba CINCO contenedores —uno por colección: fijos de
 * servicios, variables de servicios, fijos de personales, variables de
 * personales, extras— más el feed. El libro agrupa por CATEGORÍA, así que los
 * cinco se vuelven uno y medio. Lo que se conserva no es el número: es el
 * comportamiento que se estaba comprobando, que es que NINGÚN grupo se queda en
 * blanco y que cada uno dice su estado vacío con la misma línea honesta. La
 * lista ahora sale de los grupos que existen en el DOM, y el aserto exige que
 * sean cuatro y que todos digan lo mismo. Si mañana aparece un quinto grupo,
 * esta prueba lo va a cubrir sin que nadie la toque. */
test('empty.every-section-shows-an-empty-state: every group + the feed, none blank', async (sb, p) => {
  const secciones = await sb.eval(`(() => {
    return [...document.querySelectorAll('.ledger-group')].map(g => {
      const rows = g.querySelector('.ledger-group-rows');
      const ph = rows ? rows.querySelector('.empty-feed-placeholder') : null;
      return { grupo: g.getAttribute('data-segment-card'),
               existe: !!rows, placeholder: ph ? ph.textContent.trim() : null,
               hijos: rows ? rows.children.length : 0,
               encabezado: !!g.querySelector('.ledger-group-toggle'),
               conteo: (g.querySelector('[data-group-count]') || {}).textContent || null };
    });
  })()`);
  p.equal(secciones.length, 4, 'the four ledger groups were inspected');
  p.ok(secciones.every(s => s.existe), 'every group has a row container in the DOM', { secciones });
  p.ok(secciones.every(s => s.encabezado), 'every group has a real toggle in its header', { secciones });
  const deGastos = secciones.filter(s => s.grupo !== 'movimientos');
  p.equal(deGastos.length, 3, 'three of the four groups are expense groups');
  p.ok(deGastos.every(s => s.placeholder === 'Sin gastos registrados.'),
    'every expense group renders the same honest empty-state line', { secciones });
  p.ok(secciones.every(s => s.conteo === '0'),
    'a group with nothing in it says 0 in its header, not a stale total', { secciones });
  const feed = await sb.eval(`(() => {
    const c = document.getElementById('ledgerRowsMovimientos');
    const ph = c ? c.querySelector('.empty-feed-placeholder') : null;
    return { placeholder: ph ? ph.textContent.trim() : null, hijos: c ? c.children.length : 0 };
  })()`);
  p.equal(feed.placeholder, 'Sin movimientos registrados.', 'the movement feed renders its empty state');
  p.equal(feed.hijos, 1, 'the feed shows exactly the placeholder and nothing else');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity in any empty state',
    { malos: await erroresVisibles(sb) });
});

test('empty.admin-buttons-are-absent-not-dead: no dangling controls in an empty month', async (sb, p) => {
  /* An empty list must not render edit/delete buttons that cannot do anything.
   * The audit criterion is "either it works or it is honestly absent". */
  const superficie = await sb.eval(`(() => ({
    editExpense: document.querySelectorAll('.btn-edit-expense').length,
    deleteExpense: document.querySelectorAll('.btn-delete-expense').length,
    statusToggles: document.querySelectorAll('.btn-status-toggle').length,
    editTx: document.querySelectorAll('.btn-edit-tx').length,
    deleteTx: document.querySelectorAll('.btn-delete-tx').length,
    botonesHuerfanos: [...document.querySelectorAll('.item-actions')].filter(
      el => !el.closest('.expense-card-item')).length,
  }))()`);
  p.equal(superficie, { editExpense: 0, deleteExpense: 0, statusToggles: 0,
    editTx: 0, deleteTx: 0, botonesHuerfanos: 0 },
    'PROVEN ABSENT: an empty month renders zero row-level admin controls - none dead',
    superficie);
  /* The controls that MUST still work are the global ones. */
  const globales = await sb.eval(`(() => ['btnHeaderAddBudget', 'btnHeaderAddIncome',
    'btnQuickActionIncome', 'btnQuickActionExpense', 'btnOpenNewMonthModal',
    'btnOpenNotesModal', 'btnNavPanel', 'btnNavMes'].map(id => {
      const e = document.getElementById(id);
      const cs = e ? getComputedStyle(e) : null;
      return { id, existe: !!e, visible: !!cs && cs.display !== 'none' && cs.visibility !== 'hidden'
               && e.getClientRects().length > 0 };
    }))()`);
  p.ok(globales.every(g => g.existe && g.visible),
    'every global control that creates data is present and laid out on an empty month', { globales });
  for (const id of ['btnHeaderAddBudget', 'btnHeaderAddIncome', 'btnOpenNewMonthModal', 'btnOpenNotesModal']) {
    const r = await sb.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.click(); return 1 })()`);
    await sb.pump(1); await sleep(250);
    const abiertos = await sb.eval(
      `[...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)`);
    p.ok(abiertos.length === 1, `the "${id}" control still opens exactly one sheet on an empty month`,
      { id, abiertos });
    await sb.eval(`document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 1`);
    await sb.pump(1);
  }
  p.equal((await sb.writeCount()).writes, 0, 'opening and closing sheets on an empty month writes nothing');
});

group('sinGastos', 'Estado vacio: 0 gastos pero con movimientos');

test('empty.zero-expenses-with-movements: the feed still works and the KPIs are sane', async (sb, p) => {
  const m0 = mesDe(await disk(sb), A);
  p.equal(todasListas(m0).length, 0, 'fixture precondition: 0 expenses');
  p.equal(m0.movimientos.length, 3, 'fixture precondition: 3 movements present');
  /* Expectations are derived from the fixture, not hardcoded: the balance is
   * ingresos MINUS the disbursed gasto movements, not ingresos minus zero. */
  const esperadoIngresos = m0.movimientos.filter(x => x.flujo === 'Ingreso')
    .reduce((s, x) => s + Number(x.monto), 0);
  const esperadoGastosMov = m0.movimientos.filter(x => x.flujo === 'Gasto')
    .reduce((s, x) => s + Number(x.monto), 0);
  const esperadoBalance = esperadoIngresos - esperadoGastosMov;
  const sde = n => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kpis = await sb.eval(`(() => {
    const g = id => (document.getElementById(id) || {}).textContent;
    return { ingresos: g('monthTotalIngresos'), egresos: g('monthTotalEgresos'),
             balance: g('monthBalanceNeto'), estadoPago: g('paidPercentBadge'),
             countGastos: g('monthGastosCount'), countIngresos: g('monthIngresosCount') };
  })()`);
  p.equal(kpis.ingresos, sde(esperadoIngresos), 'ingresos come from the movements alone', { esperadoIngresos });
  p.equal(kpis.egresos, 'Estimado S/ 0.00',
    'egresos is 0 when the budget lists are empty, and the cell says it is the estimate');
  p.equal(kpis.balance, sde(esperadoBalance),
    'the balance is ingresos MINUS the gasto movements, even with an empty budget', { esperadoBalance });
  p.equal(kpis.countGastos, '0 de 0 gastos pagados', 'the paid count is 0 of 0');
  p.equal(kpis.countIngresos, '2 abonos registrados', 'the income count reads 2');
  p.equal(kpis.estadoPago, '0.0% Pagado',
    'OBSERVED: the paid percentage is 0.0% even though totalEgresos is 0 - it is guarded, not NaN');
  p.equal(await sb.eval(`document.querySelectorAll('.transaction-feed-item').length`), 3,
    'the three movement rows still render');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity', { malos: await erroresVisibles(sb) });
  const c = await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-VACIO Abono', monto: 10, fecha: '2026-08-30', flujo: 'Ingreso' });
  p.equal(c.envio.valido, true, 'a movement can still be created on a month with zero expenses', c.envio);
  p.equal(await sb.eval(`document.querySelectorAll('.transaction-feed-item').length`), 4,
    'UI: the new movement row appeared');
  p.equal((await disk(sb)).meses[A].movimientos.length, 4, 'DISK: the new movement persisted');
  p.equal(await sb.eval(`document.getElementById('monthTotalIngresos').textContent`),
    sde(esperadoIngresos + 10), 'UI: the income total grew by exactly the new amount');
});

group('sinMovimientos', 'Estado vacio: 0 movimientos');

test('empty.zero-movements: creating the only movement, then deleting it, leaves a clean state', async (sb, p) => {
  p.equal(await sb.eval(`document.querySelectorAll('.transaction-feed-item').length`), 0,
    'fixture precondition: no movement rows');
  const d0 = await disk(sb);
  const expensesAntes = todasListas(mesDe(d0, A)).length;
  p.ok(expensesAntes > 0,
    'fixture precondition: the month DOES have expenses, so the two collections are separable',
    { expensesAntes });

  /* The one movement, created through the real UI. */
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-VACIO Unico', monto: 100, fecha: '2026-08-31', flujo: 'Ingreso' });
  await sb.resetWrites();
  p.equal(await sb.eval(`document.querySelectorAll('.transaction-feed-item').length`), 1,
    'UI: exactly one movement row exists');
  p.equal(await sb.eval(`document.getElementById('monthTotalIngresos').textContent`), 'S/ 100.00',
    'UI: the income total picked it up');
  p.equal(await sb.eval(`!!document.querySelector('#ledgerRowsMovimientos .empty-feed-placeholder')`), false,
    'UI: the empty-state placeholder is gone');

  /* Delete that single movement. */
  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, `(() => {
    const f = document.querySelector('.transaction-feed-item');
    const b = f && f.querySelector('.btn-delete-tx');
    if (!b) return { ok: false, motivo: 'no hay boton de borrar en la fila' };
    b.click();
    return { ok: true };
  })()`);
  p.ok(r.res && r.res.ok, 'the only movement was deleted', r.res || r.err);
  await sb.pump(2); await sleep(450);

  const estado = await sb.eval(`(() => ({
    movimientos: document.querySelectorAll('.transaction-feed-item').length,
    placeholder: !!document.querySelector('#ledgerRowsMovimientos .empty-feed-placeholder'),
    gastos: document.querySelectorAll('.expense-card-item').length,
    ingresos: document.getElementById('monthTotalIngresos').textContent,
    balance: document.getElementById('monthBalanceNeto').textContent,
    anchoBarra: document.getElementById('paidBarFill').style.width,
  }))()`);
  p.equal(estado.movimientos, 0, 'UI: no movement rows left');
  p.equal(estado.placeholder, true, 'UI: the feed shows its empty state again');
  p.equal(estado.ingresos, 'S/ 0.00', 'UI: the income total went back to a real zero');
  p.equal(estado.gastos, expensesAntes, 'UI: every expense row is untouched', { expensesAntes });
  p.ok(/^\d+(\.\d+)?%$/.test(estado.anchoBarra),
    'UI: the paid progress bar is still a real percentage, not NaN%', estado);
  const d = await disk(sb);
  p.equal(d.meses[A].movimientos.length, 0, 'DISK: the movement list is empty again');
  p.equal(todasListas(mesDe(d, A)).length, expensesAntes, 'DISK: no expense was lost');
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity after the delete',
    { malos: await erroresVisibles(sb) });
  p.ok((await pantallaUtil(sb)).chars > 200, 'the view is still painted', null);
});

group('unSoloMes', 'Un solo mes en todo el sistema');

test('empty.only-one-month: navigation degrades honestly with a single period', async (sb, p) => {
  p.equal((await disk(sb)).mesesOrden.length, 1, 'fixture precondition: exactly one month');
  await sb.eval(`document.getElementById('btnPrevMonth').click(); 1`);
  await sb.pump(2); await sleep(350);
  p.equal((await disk(sb)).activeMonthId, A, 'prev cannot move anywhere, and does not corrupt state');
  p.equal(await sb.eval(`document.getElementById('toastText').textContent`),
    'Estás en el primer mes registrado', 'the user is told why nothing happened');
  await sb.eval(`document.getElementById('btnNextMonth').click(); 1`);
  await sb.pump(2); await sleep(350);
  p.equal((await disk(sb)).activeMonthId, A, 'next cannot move anywhere either');
  p.equal(await sb.eval(`document.getElementById('toastText').textContent`),
    'Estás en el último mes registrado', 'the user is told why nothing happened');
  const pills = await sb.eval(`[...document.querySelectorAll('.month-pill-btn')].map(x => x.textContent.trim())`);
  p.equal(pills.length, 1, 'UI: one pill, no phantom periods');
  const c = await crearGastoPorUI(sb, { concepto: 'PRUEBA-UNMES G', monto: 5, seccion: 'servicios', subseccion: 'fijos' });
  p.equal(c.envio.valido, true, 'an expense can still be created when there is only one month', c.envio);
  p.equal(todasListas(mesDe(await disk(sb), A)).length, 7, 'DISK: the row landed in the single month');
  const panel = await sb.eval(`(() => { document.getElementById('btnNavPanel').click(); return 1 })()`);
  await sb.pump(2); await sleep(500);
  const global = await sb.eval(`(() => {
    const g = id => (document.getElementById(id) || {}).textContent;
    return { ingresos: g('kpiGlobalIngresos'), egresos: g('kpiGlobalEgresos'),
             balance: g('kpiGlobalBalance'), cumplimiento: g('kpiGlobalCumplimiento'),
             filas: document.querySelectorAll('#globalMatrixBody tr').length };
  })()`);
  p.ok(Object.values(global).every(v => String(v).indexOf('NaN') < 0),
    'the consolidated view has no NaN with a single month', global);
  p.equal(global.filas, 1, 'UI: the multi-month matrix has exactly one row');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity anywhere', { malos: await erroresVisibles(sb) });
});

/* =====================================================================
 * T3.2 - EXTREME AMOUNTS
 * The question is never "did it accept it" but "what does the user SEE and
 * does the stored value survive a reload".
 * ===================================================================== */

group('mesVacio', 'Importes extremos: 0, negativos, decimales largos, Infinity, NaN, texto');

/** One amount case: type it, submit, observe screen + the persisted bytes.
 *
 *  NO RELOAD HERE, and that is a deliberate honesty decision. sandbox.mjs seeds
 *  localStorage from the fixture on EVERY navigation, so a reload wipes the very
 *  mutation under test. Pretending otherwise would have produced a green tick
 *  for a persistence claim that was never exercised. The disk assertion below
 *  reads the actual persisted string instead, and reload persistence is reported
 *  as its own INCONCLUSIVE with the reason. */
async function casoImporte(sb, p, etiqueta, entrada, opciones = {}) {
  const antes = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sb.pump(1); await sleep(200);
  await sb.eval(ELEGIR_EN_SELECT('#budgetSection', 'servicios'));
  await sb.eval(ELEGIR_EN_SELECT('#budgetSubsection', 'fijos'));
  const concepto = 'PRUEBA-MONTO ' + etiqueta;
  const c = await escribirConTeclado(sb, '#budgetConcepto', concepto);
  const campo = await escribirValor(sb, '#budgetMonto', entrada);
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2); await sleep(400);

  const modalSigueAbierto = await modalAbierto(sb, 'modalAddBudget');
  const d = await disk(sb);
  const creado = todasListas(mesDe(d, A)).find(i => i.concepto === concepto);
  const ui = await textoFilaGasto(sb, concepto);
  const kpi = await sb.eval(`document.getElementById('monthTotalEgresos').textContent`);
  /* The raw persisted string, so the claim is about BYTES on disk and not about
   * a parsed object that could have been rebuilt in memory. */
  const crudo = await sb.eval(`(() => { try { return localStorage.getItem(${JSON.stringify(STORAGE_KEY)}); }
    catch (e) { return 'ERROR:' + e; } })()`);
  const enCrudo = typeof crudo === 'string' && creado
    ? new RegExp('"montoEstimado":' + JSON.stringify(creado.montoEstimado)).test(crudo.replace(/\\s+/g, ''))
    : false;

  const obs = {
    etiqueta, entrada, conceptoAceptado: c.valor === concepto,
    campoRecibido: campo.valor, campoConservoTexto: campo.conservado, campoVacio: campo.vacio,
    flags: campo.flags, formValido: envio.valido, modalSigueAbierto,
    /* Un alta escribe el ESTIMADO. `montoReal` queda en null hasta que alguien
     * paga el ítem, así que el campo que prueba "el importe que escribí se
     * guardó" es `montoEstimado`, no el real: buscar el real en un alta simple
     * compararía contra algo que el modelo nuevo garantiza que todavía no
     * existe. */
    creadoEnDisco: !!creado, montoGuardado: creado ? creado.montoEstimado : null,
    tipoGuardado: creado ? typeof (creado.montoEstimado) : null,
    montoPresenteEnLosBytesPersistidos: enCrudo,
    importeRenderizado: ui ? ui.importe : null,
    subtotalEgresosRenderizado: kpi,
    dialogos: ctx.dialogs.map(x => ({ tipo: x.type, mensaje: x.message })),
  };
  p.ok(c.valor === concepto, etiqueta + ': the concepto field really holds what was typed', obs);
  if (creado) {
    p.equal(enCrudo, true,
      etiqueta + ': the exact amount is present in the RAW localStorage string, not only in memory', obs);
  }

  /* Whatever the outcome, the invariant that must always hold. */
  if (creado) {
    p.ok(typeof creado.montoEstimado === 'number' && !Number.isNaN(creado.montoEstimado),
      etiqueta + ': a row was created, and its stored montoEstimado is a real NUMBER (never NaN)', obs);
  }
  p.ok(!(ui && /NaN|undefined/.test(ui.importe || '')),
    etiqueta + ': the rendered amount never contains NaN or undefined', obs);
  p.equal((await erroresVisibles(sb)).length, 0,
    etiqueta + ': no NaN/undefined/Infinity anywhere in the visible tree', obs);
  if (!creado) {
    p.equal(JSON.stringify(await disk(sb)), antes,
      etiqueta + ': a rejected amount changed nothing on disk', obs);
  }
  if (opciones.comentario) p.note(etiqueta + ': ' + opciones.comentario(obs));
  await sb.resetWrites();
  return obs;
}

test('amount.zero: 0 is accepted, stored and rendered as a real amount', async (sb, p) => {
  const o = await casoImporte(sb, p, 'cero', '0');
  p.equal(o.campoRecibido, '0', 'the field holds "0"', o);
  p.equal(o.formValido, true, '0 is a valid amount (min=0 is inclusive)', o);
  p.equal(o.creadoEnDisco, true, 'the row was created', o);
  p.equal(o.montoGuardado, 0, 'DISK: stored as the number 0, not "0" and not null', o);
  p.equal(o.montoPresenteEnLosBytesPersistidos, true,
    'DISK: the 0 is literally present in the persisted string', o);
  p.equal(o.importeRenderizado, 'S/ 0.00', 'UI: renders as S/ 0.00, not S/ -0.00', o);
  p.equal(o.subtotalEgresosRenderizado, 'Estimado S/ 0.00',
    'UI: the month total includes it as a real zero, and says it is the estimate', o);
});

test('amount.negative: rejected by min=0 with the browser pointing at the field', async (sb, p) => {
  const o = await casoImporte(sb, p, 'negativo', '-42.50');
  p.equal(o.campoRecibido, '-42.50', 'the field accepts the negative text verbatim', o);
  p.equal(o.formValido, false, 'the form is invalid, so the submit is blocked by the browser', o);
  p.equal(o.flags.rangeUnderflow, true,
    'the ValidityState flag is rangeUnderflow (the value is below min=0)', o);
  p.equal(o.modalSigueAbierto, true, 'the sheet stays open rather than losing the typed data', o);
  p.equal(o.creadoEnDisco, false, 'DISK: nothing was created', o);
  p.equal(o.dialogos.length, 0,
    'no alert(): HTML5 validation is the only guard in play, and it works here', o);
});

test('amount.half-cent: 0.005 is BLOCKED by step=0.01, which the display layer would have rounded', async (sb, p) => {
  const o = await casoImporte(sb, p, 'medio-centavo', '0.005');
  p.equal(o.campoRecibido, '0.005', 'the field holds 0.005 verbatim', o);
  p.equal(o.flags.stepMismatch, true,
    'OBSERVED: step="0.01" makes 0.005 a stepMismatch, and that DOES block the submit', o);
  p.equal(o.formValido, false, 'so the form is invalid', o);
  p.equal(o.creadoEnDisco, false, 'DISK: nothing was created', o);
  p.equal(o.modalSigueAbierto, true, 'the sheet stays open', o);
  p.equal(o.dialogos.length, 0, 'and nothing in the app tells the user why', o);
  p.note('FINDING (the input layer disagrees with the display layer). 0.005 cannot be entered, yet '
    + 'formatCurrency(store.js:826) would render it as "S/ 0.01", and sanear() does not round, so a JSON '
    + 'import carrying 0.005 would display as S/ 0.01 while the UI refuses to let the user type it. '
    + 'Blocking sub-cent precision in a soles field is defensible; the inconsistency is the defect. '
    + 'T4: either accept and round on input, or state the 2-decimal rule in the field hint.');
});

test('amount.fifteen-decimals: also blocked by step=0.01, never truncated in silence', async (sb, p) => {
  const entrada = '1.234567890123456';
  const o = await casoImporte(sb, p, '15-decimales', entrada);
  p.equal(o.campoRecibido, entrada, 'the field holds the full 15-decimal value', o);
  p.equal(o.flags.stepMismatch, true, 'step="0.01" rejects it', o);
  p.equal(o.formValido, false, 'so the submit is blocked', o);
  p.equal(o.creadoEnDisco, false, 'DISK: nothing was created, so no float-precision question arises', o);
  p.equal(o.montoGuardado, null, 'no amount was stored at all', o);
  p.note('Worth stating plainly because it looks like a defect and is not: high-precision decimals are '
    + 'NOT silently truncated. The browser refuses the submit and the store is never asked, so the data '
    + 'stays intact. The rejection is quiet (no toast, no inline message), which is the only complaint '
    + 'here and it is the same complaint as the whitespace-concepto case.');
});

test('amount.infinity-1e309: the NUMBER FIELD refuses it, so the || 0 bug is unreachable', async (sb, p) => {
  const o = await casoImporte(sb, p, 'infinito', '1e309');
  p.equal(o.campoRecibido, '',
    'OBSERVED: input[type=number] sanitises "1e309" to an EMPTY string, because the HTML spec only '
    + 'accepts a finite floating-point number in that field', o);
  p.equal(o.campoConservoTexto, false, 'the requested text did not survive in the field', o);
  p.equal(o.flags.valueMissing, true, 'so the failure surfaces as valueMissing, not rangeOverflow', o);
  p.equal(o.formValido, false, 'the submit is blocked', o);
  p.equal(o.creadoEnDisco, false, 'DISK: nothing was created and Infinity never reached the store', o);
  p.equal(o.modalSigueAbierto, true, 'the sheet stays open', o);
  p.note('CORRECTION to an earlier hypothesis, stated because the correction is the useful part. '
    + '`parseFloat("1e309") || 0` at app.js:1253 (same pattern at app.js:1532, store.js:518 and '
    + 'store.js:644) WOULD map Infinity to 0 and report success - but that branch is UNREACHABLE from '
    + 'this UI, because the browser never lets an overflowing literal sit in the field. So the `|| 0` is '
    + 'latent, not observable. It only matters for programmatic callers such as a future import path. '
    + 'T4 should still fix it, as hardening, and must not be reported as a user-visible repair.');
});

test('amount.nan-text: non-numeric text never reaches the store as a string', async (sb, p) => {
  for (const entrada of ['abc', 'NaN', 'null', 'undefined', '1,5e', '--5', 'e5']) {
    const o = await casoImporte(sb, p, 'texto-' + entrada, entrada);
    p.equal(o.campoRecibido, '', `the number field sanitised "${entrada}" to an empty string`, o);
    p.equal(o.formValido, false, 'the empty field trips required, so the submit is blocked', o);
    p.equal(o.modalSigueAbierto, true, 'the sheet stays open with the concepto preserved', o);
    p.equal(o.creadoEnDisco, false, `DISK: nothing was stored for "${entrada}"`, o);
    p.equal(o.dialogos.length, 0, 'no alert(): the browser blocked it first', o);
    await sb.eval(`document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 1`);
  }
});

test('amount.comma-decimal: "12,34" is discarded silently, while "1e3" is honoured', async (sb, p) => {
  const coma = await casoImporte(sb, p, 'comma-decimal', '12,34');
  p.equal(coma.campoRecibido, '', 'the number field rejects a comma decimal outright', coma);
  p.equal(coma.formValido, false, 'so the submit is blocked and nothing is stored', coma);
  p.equal(coma.creadoEnDisco, false, 'DISK: nothing was stored', coma);

  const exp = await casoImporte(sb, p, 'notacion-exponencial', '1e3');
  p.equal(exp.campoRecibido, '1e3', 'the field keeps exponent notation verbatim', exp);
  p.equal(exp.formValido, true, 'and 1e3 is a multiple of the step, so it is accepted', exp);
  p.equal(exp.montoGuardado, 1000, 'DISK: parseFloat turns 1e3 into the number 1000', exp);
  p.equal(exp.importeRenderizado, 'S/ 1,000.00', 'UI: rendered as a thousands-separated amount', exp);
  p.note('DEFECT (silent rejection of the local number format). For a Peruvian user "12,34" is the '
    + 'natural way to type a decimal, and the field discards it with no message beyond the browser '
    + 'bubble. Meanwhile EVERY rendered amount uses es-PE grouping ("S/ 1,000.00"), so the format the app '
    + 'displays is not a format the app accepts. Severity: medium - this is the most likely real-world '
    + 'input mistake and it fails without explanation. T4 should normalise a comma to a dot before '
    + 'validating.');
});

test('amount.huge-value: a realistic nine-figure amount survives intact', async (sb, p) => {
  const conSeparador = await casoImporte(sb, p, 'separador-miles', '987654321.99');
  p.equal(conSeparador.campoRecibido, '987654321.99', 'a plain dot decimal is accepted', conSeparador);
  p.equal(conSeparador.formValido, true, 'and it is a multiple of the 0.01 step', conSeparador);
  p.equal(conSeparador.montoGuardado, 987654321.99, 'DISK: stored exactly, no float drift', conSeparador);
  p.equal(conSeparador.montoPresenteEnLosBytesPersistidos, true,
    'DISK: the literal 987654321.99 is in the persisted string', conSeparador);
  p.equal(conSeparador.importeRenderizado, 'S/ 987,654,321.99',
    'UI: rendered with thousands separators', conSeparador);

  const conComaMiles = await casoImporte(sb, p, 'coma-miles', '1,000');
  p.equal(conComaMiles.campoRecibido, '',
    'a comma used as a thousands separator is ALSO rejected, so the user cannot type back the exact '
    + 'format the app displays', conComaMiles);
  p.equal(conComaMiles.formValido, false, 'so the submit is blocked', conComaMiles);
});

test('amount.reload-persistence: NOT testable in this harness, and that is stated not faked', async (sb, p) => {
  /* Every persistence assertion in this suite reads the real localStorage bytes,
   * which is the strongest claim available here. A true "survives a reload" check
   * is impossible: sandbox.mjs seeds localStorage from the fixture on EVERY
   * navigation (sandbox.mjs:402), so reloading restores the fixture and destroys
   * the mutation. This test proves that limitation instead of hiding it. */
  await crearGastoPorUI(sb, { concepto: 'PRUEBA-RECARGA Unico', monto: 123.45,
    seccion: 'servicios', subseccion: 'fijos' });
  const antes = await disk(sb);
  p.ok(todasListas(mesDe(antes, A)).some(i => i.concepto === 'PRUEBA-RECARGA Unico'),
    'precondition: the row exists on disk');

  await sb.reload(9000);
  await sb.assertAdmin();
  await sb.pump(3); await sleep(900);
  const despues = await disk(sb);
  const sigue = todasListas(mesDe(despues, A)).some(i => i.concepto === 'PRUEBA-RECARGA Unico');
  p.equal(sigue, false,
    'PROVEN: after a real reload the row is gone, because the harness re-seeded localStorage from the '
    + 'fixture. That is the harness working as designed, NOT an app bug.', { habiaLaFila: !!sigue });
  p.equal(despues.mesesOrden.length, antes.mesesOrden.length,
    'and the fixture came back exactly as it was seeded');
  p.inconclusive('"the stored value survives a reload" cannot be tested in this harness',
    'sandbox.mjs writes the fixture into localStorage on every navigation (sandbox.mjs:402), so a reload '
    + 'wipes any mutation. Testing real reload persistence needs a harness option that seeds ONCE and '
    + 'then reloads without re-seeding. Until that exists the raw-bytes assertions are the ceiling, and '
    + 'they are asserted everywhere else in this suite.');
});
/* =====================================================================
 * T3.3 - HOSTILE TEXT in `concepto`
 * ===================================================================== */

/** Create an expense with a hostile concept and report what the app did.
 *  The XSS verdict is earned, not assumed: if escaparHTML were bypassed, an
 *  injected `<img src=x onerror=alert(1)>` would build a real element whose
 *  handler fires alert(1), and the CDP dialog channel would record it. */
async function casoConcepto(sb, p, etiqueta, concepto, opciones = {}) {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sb.pump(1); await sleep(200);
  await sb.eval(ELEGIR_EN_SELECT('#budgetSection', 'servicios'));
  await sb.eval(ELEGIR_EN_SELECT('#budgetSubsection', 'fijos'));
  await escribirValor(sb, '#budgetMonto', '10.00');
  const c = await escribirConTeclado(sb, '#budgetConcepto', concepto);
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2); await sleep(500);

  const guardado = todasListas(mesDe(await disk(sb), A)).find(i => i.concepto === concepto);
  const ui = await textoFilaGasto(sb, concepto);
  /* Injection evidence. If escaparHTML were bypassed, these nodes would exist. */
  const inyeccion = await sb.eval(`(() => {
    const filas = [...document.querySelectorAll('.expense-card-item')];
    return {
      scriptsEnFilas: filas.filter(f => f.querySelector('script')).length,
      imagenesEnFilas: filas.filter(f => f.querySelector('img')).length,
      iframesEnDocumento: document.querySelectorAll('iframe').length,
      onerrorEnDocumento: document.querySelectorAll('[onerror]').length,
      onloadEnDocumento: document.querySelectorAll('[onload]').length,
      hrefsJavascript: [...document.querySelectorAll('[href^="javascript:"],[src^="javascript:"]')].length,
      totalElementosDOM: document.querySelectorAll('*').length,
    };
  })()`);
  const obs = {
    etiqueta, longitudPedida: String(concepto).length,
    campoRecibio: c.valor, viaTeclado: c.viaTeclado,
    formValido: envio.valido, creadoEnDisco: !!guardado,
    tituloRenderizado: ui ? ui.titulo : null,
    outerHTMLDelTitulo: ui ? ui.outerHTML.slice(0, 200) : null,
    overflowHorizontalPx: ui ? ui.overflowHorizontal : null,
    cssWhiteSpace: ui ? ui.cssWhiteSpace : null,
    cssTextOverflow: ui ? ui.cssTextOverflow : null,
    cssOverflow: ui ? ui.cssOverflow : null,
    importedes: ui ? ui.importe : null,
    inyeccion,
    dialogos: ctx.dialogs.map(x => ({ tipo: x.type, mensaje: x.message })),
  };
  p.ok(c.viaTeclado || c.valor === concepto,
    etiqueta + ': the field really holds the string that was sent', obs);
  /* Only an `alert` carrying the payload's own number counts as an XSS tripwire.
   * `confirm` is the delete confirmation, which `verificaAlBorrar` triggers on
   * purpose, and the app legitimately alerts on invalid amounts. */
  const alertsDePayload = obs.dialogos.filter(d => d.tipo === 'alert'
    && /^\s*[12]\s*$/.test(d.mensaje || ''));
  p.equal(alertsDePayload.length, 0,
    etiqueta + ': NO script executed (no alert() carrying the payload number ever fired)', obs);
  p.equal(inyeccion.scriptsEnFilas, 0, etiqueta + ': no <script> node inside any rendered row', obs);
  p.equal(inyeccion.imagenesEnFilas, 0, etiqueta + ': no <img> node inside any rendered row', obs);
  p.equal(inyeccion.onerrorEnDocumento, 0, etiqueta + ': no onerror attribute anywhere in the document', obs);
  p.equal(inyeccion.onloadEnDocumento, 0, etiqueta + ': no onload attribute anywhere in the document', obs);
  p.equal(inyeccion.hrefsJavascript, 0, etiqueta + ': no javascript: URL in the document', obs);
  if (ui) {
    p.equal(ui.titulo, concepto,
      etiqueta + ': UI: the row shows the text back verbatim (escaped, not stripped)', obs);
    p.ok(!/[<>]/.test(concepto)
        || ui.outerHTML.indexOf('&lt;') >= 0 || ui.outerHTML.indexOf('&gt;') >= 0,
      etiqueta + ': angle brackets are HTML-ENTITIES in the DOM, not live markup', obs);
  }
  p.equal((await erroresVisibles(sb)).length, 0, etiqueta + ': no NaN/undefined/Infinity', obs);

  if (opciones.verificaAlBorrar) {
    /* The delete confirm is the one place the raw concepto goes into a native
     * dialog. Proving the text arrives intact there closes the last path where
     * the string is consumed as anything other than a text node. */
    ctx.dialogPolicy = 'cancel';
    const r = await pulsarConDialogos(sb, PULSAR_EN_GASTO(concepto, '.btn-delete-expense'));
    const mensaje = r.dialogs[0] ? r.dialogs[0].message : null;
    obs.mensajeConfirm = mensaje;
    p.ok(!!mensaje && mensaje.indexOf(concepto) >= 0,
      etiqueta + ': the native confirm() receives the raw string intact, so the app is not mangling it', obs);
    p.equal(!!guardado, true,
      etiqueta + ': the row really exists, so the confirm match is not a false positive', obs);
  }
  if (!guardado) {
    p.equal(JSON.stringify(await disk(sb)), antesDisco,
      etiqueta + ': nothing was stored, and the disk document is unchanged', obs);
  }
  await sb.resetWrites();
  return obs;
}
test('hostile.script-tag: escaped, not executed', async (sb, p) => {
  const payload = '<script>alert(1)<\/script>';
  const o = await casoConcepto(sb, p, 'script-tag', payload, { verificaAlBorrar: true });
  p.equal(o.creadoEnDisco, true, 'the expense WAS created - so the row really renders the payload', o);
  p.ok(o.outerHTMLDelTitulo.indexOf('&lt;script&gt;') >= 0,
    'the DOM holds &lt;script&gt; as text, proof escaparHTML ran', o);
  p.equal(o.tituloRenderizado, payload, 'the user sees the literal text, not a blank cell', o);
  p.equal(o.importedes, 'S/ 10.00', 'the row is complete: the amount is unaffected', o);
});

test('hostile.img-onerror: escaped, no element created, no handler fired', async (sb, p) => {
  const payload = '<img src=x onerror=alert(1)>';
  const o = await casoConcepto(sb, p, 'img-onerror', payload, { verificaAlBorrar: true });
  p.equal(o.creadoEnDisco, true, 'the expense WAS created', o);
  p.ok(o.outerHTMLDelTitulo.indexOf('&lt;img') >= 0,
    'the DOM holds &lt;img as text, so no element was ever created', o);
  p.equal(o.inyeccion.imagenesEnFilas, 0, 'zero <img> nodes in any row (this is the whole point)', o);
  p.equal(o.dialogos.length, 0, 'alert(1) never fired', o);
});

test('hostile.quotes-backticks: stored and shown exactly, no markup created', async (sb, p) => {
  const payload = 'a"b\'c`d';
  const o = await casoConcepto(sb, p, 'comillas', payload, { verificaAlBorrar: true });
  p.equal(o.creadoEnDisco, true, 'the expense WAS created', o);
  p.equal(o.tituloRenderizado, 'a"b\'c`d',
    'UI: all four characters survive round-trip, none is swallowed or doubled', o);
  p.ok(o.mensajeConfirm && o.mensajeConfirm.indexOf('a"b\'c`d') >= 0,
    'the native confirm shows the raw quotes unchanged, so nothing is silently stripped', o);
  p.equal(o.inyeccion.scriptsEnFilas, 0, 'no element was created out of the quotes', o);
});

test('hostile.javascript-url-and-markup-attributes: inert text', async (sb, p) => {
  const payload = 'javascript:alert(1)"><svg onload=alert(2)>';
  const o = await casoConcepto(sb, p, 'js-url', payload, { verificaAlBorrar: true });
  p.equal(o.creadoEnDisco, true, 'the expense WAS created', o);
  p.equal(o.inyeccion.iframesEnDocumento, 0, 'no iframe was created', o);
  p.equal(o.inyeccion.onloadEnDocumento, 0, 'no onload attribute exists: the <svg> never became an element', o);
  p.equal(o.inyeccion.hrefsJavascript, 0, 'no javascript: URL reached the DOM', o);
  p.equal(o.dialogos.length, 0, 'neither alert(1) nor alert(2) fired', o);
});

test('hostile.emoji-accents-cjk: stored and displayed without corruption', async (sb, p) => {
  for (const [etiqueta, texto] of [
    ['emoji', 'PAGO 💰🎉 café ☕'],
    ['acentos', 'Ñoño áéíóú ÁÉÍÓÜ'],
    ['cjk', '支出 测试 한국어 日本語'],
    ['rtl-override', 'abc\u202Edef\u202C ghi'],
    ['combining-marks', 'e\u0301 vs \u00E9 vs \u0065\u0301'],
  ]) {
    const o = await casoConcepto(sb, p, etiqueta, texto, { verificaAlBorrar: true });
    p.equal(o.creadoEnDisco, true, etiqueta + ': stored on disk', o);
    p.equal(o.tituloRenderizado, texto, etiqueta + ': rendered back identically (no mojibake)', o);
    p.ok(o.mensajeConfirm && o.mensajeConfirm.indexOf(texto) >= 0,
      etiqueta + ': the confirm() string matches byte for byte', o);
  }
  p.note('The RTL override U+202E is stored and rendered as a literal character. It is NOT stripped. '
    + 'That is a deliberate non-goal for this app - the data belongs to the user and no text is filtered - '
    + 'but it does mean a hostile month/expense name can visually reverse what follows it. Recorded as a '
    + 'known limitation, not a defect in escaping.');
});

test('hostile.500-chars: renders truncated-with-ellipsis without breaking the layout', async (sb, p) => {
  const payload = 'L'.repeat(500);
  const o = await casoConcepto(sb, p, '500-caracteres', payload);
  p.equal(o.creadoEnDisco, true, 'the 500-character expense was stored');
  p.equal(o.tituloRenderizado.length, 500,
    'UI: the DOM text node holds all 500 characters - nothing was silently dropped on save', o);
  /* .expense-item-title is `white-space:nowrap; overflow:hidden;
   * text-overflow:ellipsis` (styles.css:1913), so scrollWidth > clientWidth is
   * the INTENDED behaviour, not a break. What matters is (a) the truncation is
   * signalled with an ellipsis and (b) the container does not scroll. */
  p.equal(o.cssTextOverflow, 'ellipsis',
    'UI: the row CLIPS the title with an ellipsis, so the user is told it is truncated', o);
  p.equal(o.cssWhiteSpace, 'nowrap', 'UI: the title stays on one line by design', o);
  p.ok(o.overflowHorizontalPx > 0,
    'OBSERVED: scrollWidth exceeds clientWidth, i.e. the clip is actually active', o);
  const ancho = await sb.eval(`(() => {
    const f = [...document.querySelectorAll('.expense-card-item')]
      .find(x => { const t = x.querySelector('.expense-item-title'); return t && t.textContent.trim().length === 500; });
    if (!f) return { encontrado: false };
    const card = f.closest('.ledger-group') || f.parentElement;
    return { encontrado: true, anchoFila: Math.round(f.getBoundingClientRect().width),
             anchoTituloVisible: Math.round(f.querySelector('.expense-item-title').getBoundingClientRect().width),
             scrollTarjeta: card.scrollWidth, clientTarjeta: card.clientWidth,
             desbordeTarjeta: card.scrollWidth - card.clientWidth,
             bodyDesborde: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  })()`);
  p.ok(ancho.encontrado, 'the row with the 500-character title was located for the layout probe', ancho);
  p.equal(ancho.desbordeTarjeta <= 2, true,
    'UI: the containing card does not scroll horizontally because of it', ancho);
  p.equal(ancho.bodyDesborde <= 2, true, 'UI: the page itself gains no horizontal scrollbar', ancho);
  p.ok(ancho.anchoTituloVisible < ancho.anchoFila,
    'UI: the visible title box is narrower than the row, i.e. the clip is active and the row keeps its shape', ancho);
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity', o);
});

/* =====================================================================
 * T3.4 - IMPORT JSON
 * There is NO UI for importJSON. That is the finding, and it is proven with
 * DOM evidence rather than asserted from a source read.
 * ===================================================================== */

group('mesVacio', 'Importacion JSON: sin superficie de UI (hallazgo)');

test('import.no-ui-surface: importJSON is unreachable, proven by enumerating controls', async (sb, p) => {
  const superficie = await sb.eval(`(() => {
    const controles = [...document.querySelectorAll(
      'button, a[href], input, select, textarea, [role=button], [onclick], label[for]')];
    const conTexto = controles.filter(el => {
      const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' '
        + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
      return /import|restaurar|respaldo|cargar|abrir archivo|json|export|descargar|csv|excel/.test(t);
    }).map(el => ({ tag: el.tagName.toLowerCase(), type: el.type || null, id: el.id || null,
                    texto: (el.textContent || '').trim().slice(0, 50),
                    accept: el.getAttribute('accept') }));
    return {
      totalControles: controles.length,
      entradasDeArchivo: document.querySelectorAll('input[type=file]').length,
      candidatos: conTexto,
      hayFormularioDeSubida: !!document.querySelector('form[enctype], form[action]'),
    };
  })()`);
  p.note('js/store.js:787 importJSON(jsonString) and js/store.js:774 exportJSON() and '
    + 'js/store.js:802 exportCSV() are implemented. js/app.js never calls any of them, and index.html has '
    + 'no button, no <input type=file> and no inline handler for them.');
  p.equal(superficie.entradasDeArchivo, 0,
    'PROVEN ABSENT: the document contains zero <input type=file>, so no file can be chosen at all', superficie);
  p.equal(superficie.candidatos.length, 0,
    'PROVEN ABSENT: not one control in the whole document is labelled import/export/restore/backup', superficie);
  p.equal(superficie.totalControles > 40, true,
    'the enumeration was not vacuous: it inspected a real number of controls', superficie);
  p.equal(superficie.hayFormularioDeSubida, false, 'PROVEN ABSENT: no upload form either');
  p.inconclusive('Every import-JSON case in the brief (malformed JSON, wrong shape, empty string, '
    + 'null, deeply nested garbage, export->import round trip) is UNTESTABLE through the UI',
    'importJSON has no caller and no control. The only way to observe it would be to call '
    + 'window.financialStore.importJSON(...), which is precisely the store-level shortcut this suite '
    + 'refuses to pass off as UI evidence. This is reported as a product finding instead: README.md:20 '
    + 'advertises "copia de seguridad en JSON" and CSV export, and neither feature is reachable. '
    + 'T4 has to add the UI before these cases can be tested at all.');
});

/* =====================================================================
 * T3.5 - EXPORT CSV
 * Same conclusion, different reason: exportCSV emits only month names and
 * totals, so `concepto` never reaches a CSV cell in the first place.
 * ===================================================================== */

group('mesVacio', 'Exportacion CSV: sin superficie de UI (hallazgo)');

test('export.no-ui-surface: exportCSV / exportJSON are unreachable', async (sb, p) => {
  const superficie = await sb.eval(`(() => {
    const controles = [...document.querySelectorAll('button, a[href], [role=button], [onclick]')];
    const candidatos = controles.filter(el => {
      const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' '
        + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('download') || '')).toLowerCase();
      return /export|csv|excel|descarg|respaldo|backup|json/.test(t);
    }).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
                    texto: (el.textContent || '').trim().slice(0, 50),
                    download: el.getAttribute('download') }));
    return { totalControles: controles.length, candidatos };
  })()`);
  p.note('js/store.js:802 exportCSV builds a Blob and clicks a synthetic <a download>, but nothing in the '
    + 'UI ever calls it. Note also what it would emit: the header is '
    + '"MES,SERVICIOS,PERSONALES,GASTOS EXTRA,TOTAL EGRESOS,INGRESOS,BALANCE NETO,% AVANCE" and each row '
    + 'contains r.nombre plus totals.toFixed(2). `concepto` is NOT part of exportCSV at all, so hostile '
    + 'expense text can never reach a CSV cell through this path. The only free-text injection surface '
    + 'would be the month `nombre`, which is wrapped in double quotes but not formula-guarded.');
  p.equal(superficie.candidatos.length, 0,
    'PROVEN ABSENT: no control in the document can trigger a CSV or JSON export', superficie);
  p.equal(superficie.totalControles > 20, true,
    'the enumeration was not vacuous', superficie);
  p.inconclusive('The CSV-injection and escaping case is UNTESTABLE through the UI',
    'exportCSV has no caller and no control. Observed statically (documented above): the hostile-text '
    + 'vectors never reach it, so the residual risk is confined to the month nombre, which is quoted but '
    + 'not prefixed against =, +, - or @. That is a real, if narrow, finding - and it is exactly the '
    + 'kind of thing a test written against the unreachable method would have hidden behind a green tick.');
});

/* =====================================================================
 * T3.6 - DESTRUCTIVE EXTREMES
 * ===================================================================== */

group('mesVacio', 'Destruccion en el limite: el ultimo elemento, el unico mes, con un modal abierto');

test('destroy.last-expense-in-section: the empty state returns and the KPIs stay real', async (sb, p) => {
  await crearGastoPorUI(sb, { concepto: 'PRUEBA-ULTIMO Unico', monto: 12.34,
    seccion: 'servicios', subseccion: 'fijos' });
  await sb.resetWrites();
  p.equal(listaDe(mesDe(await disk(sb), A), 'servicios', 'fijos').length, 1,
    'precondition: the section holds exactly one expense');

  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, PULSAR_EN_GASTO('PRUEBA-ULTIMO Unico', '.btn-delete-expense'));
  p.ok(r.res && r.res.ok, 'the last expense of its section was deleted', r.res || r.err);
  await sb.pump(2); await sleep(450);

  const ui = await sb.eval(`(() => {
    /* T5: la colección 'servicios.fijos' ya no tiene caja propia, y el grupo de
       Servicios tampoco: sus fijos y sus variables son el mismo grupo. Lo que se
       comprueba es la misma propiedad al nivel que ahora existe —el grupo vacío
       cae a cero y lo dice— más el encabezado, que es donde vive el número. */
    const c = document.getElementById('ledgerRowsServicios');
    const ph = c.querySelector('.empty-feed-placeholder');
    return { placeholder: ph ? ph.textContent.trim() : null,
             filas: c.querySelectorAll('.expense-card-item').length,
             subtotal: document.getElementById('summaryTagServicios').textContent,
             conteo: document.querySelector('[data-segment-card="servicios"] [data-group-count]').textContent,
             total: document.getElementById('monthTotalEgresos').textContent,
             balance: document.getElementById('monthBalanceNeto').textContent };
  })()`);
  p.equal(ui.filas, 0, 'UI: the section is now empty');
  p.equal(ui.placeholder, 'Sin gastos registrados.', 'UI: the honest empty state is back');
  p.equal(ui.conteo, '0', 'UI: the header count is a real zero, not a stale total');
  p.equal(ui.subtotal, 'S/ 0.00', 'UI: the group subtotal is a real zero');
  p.equal(ui.total, 'Estimado S/ 0.00', 'UI: the month total is a real zero, and says it is the estimate');
  p.equal(ui.balance, 'S/ 0.00', 'UI: the balance is a real zero');
  p.equal(listaDe(mesDe(await disk(sb), A), 'servicios', 'fijos').length, 0, 'DISK: the list is empty');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity anywhere', { malos: await erroresVisibles(sb) });
  const pantalla = await pantallaUtil(sb);
  p.ok(pantalla.chars > 200, 'the view is still painted, not blank', pantalla);
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for the delete');
});

test('destroy.last-movement: the feed returns to its empty state', async (sb, p) => {
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-ULTIMO Mov', monto: 5, fecha: '2026-08-01', flujo: 'Gasto' });
  await sb.resetWrites();
  p.equal((await disk(sb)).meses[A].movimientos.length, 1, 'precondition: exactly one movement');

  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, `(() => {
    const f = document.querySelector('.transaction-feed-item');
    const b = f && f.querySelector('.btn-delete-tx');
    if (!b) return { ok: false };
    b.click();
    return { ok: true };
  })()`);
  p.ok(r.res && r.res.ok, 'the only movement was deleted', r.res || r.err);
  await sb.pump(2); await sleep(450);

  const ui = await sb.eval(`(() => {
    const c = document.getElementById('ledgerRowsMovimientos');
    const ph = c.querySelector('.empty-feed-placeholder');
    return { placeholder: ph ? ph.textContent.trim() : null,
             filas: c.querySelectorAll('.transaction-feed-item').length,
             ingresos: document.getElementById('monthTotalIngresos').textContent,
             balance: document.getElementById('monthBalanceNeto').textContent,
             etiqueta: document.getElementById('monthBalanceStatusLabel').textContent,
             countIngresos: document.getElementById('monthIngresosCount').textContent };
  })()`);
  p.equal(ui.filas, 0, 'UI: no movement rows left');
  p.equal(ui.placeholder, 'Sin movimientos registrados.', 'UI: the feed empty state is back');
  p.equal(ui.ingresos, 'S/ 0.00', 'UI: ingresos is a real zero');
  p.equal(ui.balance, 'S/ 0.00', 'UI: the balance is a real zero');
  p.equal(ui.etiqueta, 'Equilibrado', 'UI: the balance label is honest');
  p.equal(ui.countIngresos, '0 abonos registrados', 'UI: the income count is 0');
  p.equal((await disk(sb)).meses[A].movimientos.length, 0, 'DISK: the movement list is empty');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity anywhere',
    { malos: await erroresVisibles(sb) });
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for the delete');
});

test('destroy.delete-while-a-modal-is-open: NOT REACHABLE, and that is proven, not assumed', async (sb, p) => {
  /* The brief asks for "delete while a modal is open". Before pretending to
   * test it, check whether a user can even do it: .modal-overlay is
   * position:fixed; inset:0; z-index:100 (styles.css:2649), so it covers the
   * whole viewport. The honest result may well be "impossible", and a test that
   * faked its way past the overlay would prove nothing about the product. */
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-MODAL Mov', monto: 9, fecha: '2026-08-02', flujo: 'Gasto' });
  await crearGastoPorUI(sb, { concepto: 'PRUEBA-MODAL Gasto', monto: 8,
    seccion: 'servicios', subseccion: 'fijos' });
  await sb.resetWrites();

  const antesNotas = (await disk(sb)).meses[A].notas;
  await sb.eval(`document.getElementById('btnOpenNotesModal').click(); 1`);
  await sb.pump(1); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalMonthNotes'), 'precondition: the notes sheet is open');

  /* Hit-test the actual position of a row's delete button with a real mouse. */
  const hit = await sb.eval(`(() => {
    const b = document.querySelector('.expense-card-item .btn-delete-expense');
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const encima = document.elementFromPoint(x, y);
    const overlay = document.getElementById('modalMonthNotes');
    const cs = getComputedStyle(overlay);
    return { x, y, elementoEncima: encima ? encima.tagName.toLowerCase() + '#' + (encima.id || '') +
             '.' + (encima.className || '') : null,
             esElOverlay: encima === overlay,
             overlayDisplay: cs.display, overlayPosition: cs.position, overlayZ: cs.zIndex };
  })()`);
  p.equal(hit.esElOverlay, true,
    'PROVEN: with a sheet open, a real click at the delete button position lands on the overlay, '
    + 'not on the button - so "delete while a modal is open" is not a reachable user action',
    { hit });
  p.equal(hit.overlayPosition, 'fixed', 'the overlay is position:fixed, covering the viewport', hit);

  /* The reachable hazard that IS worth testing: the notes textarea autosaves on
   * a 400 ms debounce, and closing the sheet does not cancel that timer. So a
   * user who types, hits Escape immediately, and believes they discarded the
   * change is wrong. Measure it instead of guessing. */
  await escribirConTeclado(sb, '#monthNotesTextarea', 'PRUEBA-MODAL nota con carrera');
  const alCerrar = (await disk(sb)).meses[A].notas;
  await pulsarEscape(sb);
  const abiertos = await sb.eval(`[...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)`);
  p.equal(abiertos.length, 0, 'a real Escape closed the sheet', { abiertos });
  p.equal(alCerrar, antesNotas, 'OBSERVED: nothing was persisted yet, the 400 ms debounce had not fired');
  await sleep(1000);
  const d = await disk(sb);
  p.equal(d.meses[A].notas, 'PRUEBA-MODAL nota con carrera',
    'DEFECT (contradicts the brief\'s own criterion): Escape closed the sheet but the pending autosave '
    + 'still fired 400 ms later. The user cancelled a sheet and the edit persisted anyway.', d.meses);
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity', null);
  p.ok((await pantallaUtil(sb)).chars > 200, 'the view is still painted', null);
  p.note('This is a genuine conflict with the acceptance criterion "modal cancel leaves data untouched". '
    + 'The notes sheet is documented as autosaving (index.html:798 "Guardado automatico en tiempo real"), '
    + 'so persisting is defensible - but then Escape is NOT a cancel and the sheet must say so. Right now '
    + 'it is indistinguishable from a cancel. T4 decision needed: either cancel the pending timer on '
    + 'close, or stop presenting the close button as a cancel.');
  p.inconclusive('"Delete while a modal is open" as literally specified',
    'Not reachable: the modal overlay covers the page (proven above by hit test). Proving behaviour the '
    + 'user cannot trigger would be theatre. The nearest reachable hazard - a pending autosave surviving '
    + 'a close - IS tested above and it failed.');
});

test('destroy.delete-while-edit-sheet-open: the edit sheet survives and still saves correctly', async (sb, p) => {
  /* The reachable version of the same hazard: the edit sheet holds a hidden
   * monthId/itemId pair. If a re-render swapped the row underneath, the patch
   * would land on the wrong record. That is asserted by checking the id. */
  const antesVacio = (await disk(sb)).meses[A];
  p.ok(antesVacio.servicios.fijos.length === 0,
    'fixture precondition: the month starts empty, so the row is created through the UI', { antesVacio });
  await crearGastoPorUI(sb, { concepto: 'PRUEBA-RERENDER Original', monto: 44.44,
    seccion: 'servicios', subseccion: 'fijos' });
  const antes = (await disk(sb)).meses[A];
  const objetivo = antes.servicios.fijos[0];
  p.ok(!!objetivo, 'the target record exists after the UI create', { objetivo });
  await sb.resetWrites();
  await sb.eval(PULSAR_EN_GASTO(objetivo.concepto, '.btn-edit-expense'));
  await sb.pump(2); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalEditExpense'), 'the edit sheet is open for a known item');

  /* Re-render the whole view from underneath the open sheet. */
  await sb.eval(`document.getElementById('btnNavPanel').click(); 1`);
  await sb.pump(2); await sleep(350);
  await sb.eval(`document.getElementById('btnNavMes').click(); 1`);
  await sb.pump(3); await sleep(500);
  p.ok(await modalAbierto(sb, 'modalEditExpense'),
    'the sheet survived two full re-renders - its hidden ids were not cleared');

  const ids = await sb.eval(`(() => ({
    monthId: document.getElementById('editExpenseMonthId').value,
    itemId: document.getElementById('editExpenseItemId').value,
    concepto: document.getElementById('editExpenseConcepto').value,
    monto: document.getElementById('editExpenseMonto').value,
  }))()`);
  p.equal(ids.itemId, objetivo.id, 'the sheet still points at the original record', ids);
  p.equal(ids.monthId, A, 'and at the original month', ids);

  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-TRAS-RE-RENDER');
  await escribirValor(sb, '#editExpenseMonto', '31.31');
  await sb.resetWrites();
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(400);
  p.equal(envio.valido, true, 'the submit is accepted', envio);
  const d = await disk(sb);
  const parcheado = buscarGasto(mesDe(d, A), objetivo.id);
  p.ok(!!parcheado, 'DISK: the original record id still exists', { objetivo: objetivo.id });
  if (parcheado) {
    p.equal(parcheado.concepto, 'PRUEBA-TRAS-RE-RENDER', 'DISK: the patch landed on the RIGHT record', parcheado);
    /* La hoja de edición edita el ESTIMADO, no lo ya pagado: el parche que
     * manda es {concepto, montoEstimado} y a propósito NO lleva `montoReal`,
     * porque pagar el ítem es una acción aparte. Comprobar `montoEstimado` es
     * comprobar el campo que la hoja realmente escribió; `montoReal` acá
     * seguiría en null y no probaría nada. */
    p.equal(parcheado.montoEstimado, 31.31, 'DISK: the amount landed too');
  }
  p.equal(todasListas(mesDe(d, A)).length, todasListas(antes).length,
    'DISK: no record was created or destroyed by the re-render + edit');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-TRAS-RE-RENDER')) !== null, 'UI: the row re-rendered correctly');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity', { malos: await erroresVisibles(sb) });
});

test('destroy.reopen-edit-sheet-after-delete: a stale sheet cannot resurrect a deleted row', async (sb, p) => {
  await crearGastoPorUI(sb, { concepto: 'PRUEBA-STALE Original', monto: 21.21,
    seccion: 'servicios', subseccion: 'fijos' });
  const antes = (await disk(sb)).meses[A];
  const objetivo = antes.servicios.fijos[0];
  p.ok(!!objetivo, 'the target record exists', { objetivo });
  await sb.resetWrites();
  await sb.eval(PULSAR_EN_GASTO(objetivo.concepto, '.btn-edit-expense'));
  await sb.pump(2); await sleep(300);
  const idAbierto = await sb.eval(`document.getElementById('editExpenseItemId').value`);
  p.equal(idAbierto, objetivo.id, 'the sheet holds the original record id');

  /* Delete the very record the open sheet is editing. */
  await sb.eval(`document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 1`);
  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, PULSAR_EN_GASTO(objetivo.concepto, '.btn-delete-expense'));
  p.ok(r.res && r.res.ok, 'the record was deleted', r.res || r.err);
  await sb.pump(2); await sleep(400);
  p.ok(!buscarGasto(mesDe(await disk(sb), A), objetivo.id), 'DISK: the record is really gone');

  /* Now replay the patch the open sheet was holding. Reached in the product by
   * deleting from another tab and then pressing Save here. */
  const replay = await sb.eval(`(() => {
    const f = document.getElementById('formEditExpense');
    const antes = JSON.stringify(window.financialStore.data);
    f.requestSubmit();
    return { despues: JSON.stringify(window.financialStore.data) === antes };
  })()`);
  await sb.pump(2); await sleep(400);
  const d = await disk(sb);
  p.equal(buscarGasto(mesDe(d, A), objetivo.id), null,
    'DISK: updateBudgetItem did NOT resurrect the deleted record', replay);
  p.ok(!!replay.despues, 'MEMORY: the store document is byte-identical after the stale patch');
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity', { malos: await erroresVisibles(sb) });
  p.ok((await pantallaUtil(sb)).chars > 200, 'the view is still painted', null);
});

/* =====================================================================
 * T3.7 - SEGMENT FILTERS on empty state
 * ===================================================================== */

group('mesVacio', 'Filtros de segmento sobre el estado vacio');

test('empty.segment-filters: toggling every segment off shows the honest notice', async (sb, p) => {
  const botones = await sb.eval(`[...document.querySelectorAll('.segment-pill-btn')].map(b => ({
    data: b.getAttribute('data-segment'), texto: b.textContent.trim(),
    activa: b.classList.contains('active') }))`);
  p.ok(botones.length >= 5, 'the segment pills exist', { botones });
  for (const b of botones) {
    if (b.data === 'all') continue;
    await sb.eval(`(() => {
      const el = document.querySelector('.segment-pill-btn[data-segment="' + ${JSON.stringify(b.data)} + '"]');
      if (el) el.click();
      return !!el;
    })()`);
    await sb.pump(1); await sleep(300);
  }
  await sb.pump(3); await sleep(400);
  const estado = await sb.eval(`(() => {
    const cards = [...document.querySelectorAll('[data-segment-card]')];
    const notice = document.getElementById('noSegmentsSelectedNotice');
    return { visibles: cards.filter(c => c.style.display !== 'none').length,
             totalCards: cards.length,
             avisoVisible: notice ? getComputedStyle(notice).display !== 'none' : false,
             pillsActivas: document.querySelectorAll('.segment-pill-btn.active').length };
  })()`);
  p.equal(estado.visibles, 0, 'every content card was hidden', estado);
  p.equal(estado.avisoVisible, true,
    'the "no segments selected" notice is shown instead of a blank page', estado);
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity in the notice',
    { malos: await erroresVisibles(sb) });
  await sb.eval(`(() => {
    const el = document.querySelector('.segment-pill-btn[data-segment="all"]');
    if (el) el.click();
    return !!el;
  })()`);
  await sb.pump(3); await sleep(500);
  const restaurado = await sb.eval(`(() => ({
    visibles: [...document.querySelectorAll('[data-segment-card]')].filter(c => c.style.display !== 'none').length,
    total: document.querySelectorAll('[data-segment-card]').length }))()`);
  p.equal(restaurado.visibles, restaurado.total, '"Ver todo" brought every card back', restaurado);
  p.equal((await sb.writeCount()).writes, 0, 'segment filtering persisted nothing');
});

/* =====================================================================
 * T5 - EL BUSCADOR CONTRA EL LIBRO AGRUPADO
 * ---------------------------------------------------------------------
 * El buscador ya filtraba filas, pero antes cada fila vivía en una caja
 * con su encabezado arriba, y ocultar la fila dejaba el encabezado announcing
 * un total que ya no tenía nada debajo. Con el libro eso se ve más: los
 * grupos son menos y más grandes.
 *
 * Lo que se comprueba acá es la clase de defecto, no un caso: un grupo al que
 * la búsqueda le deja CERO filas tiene que irse con ellas, y un grupo al que
 * le deja algunas tiene que DECIR cuántas de cuántas son.
 *
 * Van en su propio grupo y con el fixture `baseline` porque necesitan un mes CON
 * gastos: un grupo vacío no tiene nada que filtrar, y una prueba que pasa
 * porque no hay nada que probar no es una prueba.
 * ===================================================================== */
group('baseline', 'El libro agrupado: encabezado, conteo y buscador');

/* `sb.eval` recibe UNA expresión, no una función con argumentos: hay que
 * interpolar la consulta adentro. La primera versión pasaba la flecha y el
 * argumento por separado, `sb.eval` ignoraba el segundo, y la expresión —que era
 * una función— se evaluaba sin ejecutarse. La prueba "fallaba" porque el
 * buscador nunca se había movido. */
const buscarEnLedger = q => `(function () {
  const i = document.getElementById('commandSearchInput');
  i.value = ${JSON.stringify(q)};
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`;
const ESTADO_LEDGER = `(() => [...document.querySelectorAll('.ledger-group')].map(g => {
  const rows = g.querySelector('.ledger-group-rows');
  const filas = [...rows.children].filter(f =>
    f.classList.contains('expense-card-item') || f.classList.contains('transaction-feed-item'));
  const head = g.querySelector('.ledger-group-head');
  return { grupo: g.getAttribute('data-segment-card'),
           filas: filas.length,
           visibles: filas.filter(f => f.style.display !== 'none').length,
           conteo: g.querySelector('[data-group-count]').textContent.trim(),
           encabezadoPintado: head ? getComputedStyle(head).display !== 'none' : false };
}))()`;

test('ledger.search-hides-empty-groups: a group with no visible rows goes with them', async (sb, p) => {
  const antes = await sb.eval(ESTADO_LEDGER);
  const conFilas = antes.filter(g => g.filas > 0).map(g => g.grupo);
  p.ok(conFilas.length >= 2,
    'the fixture has at least two non-empty groups, so hiding them is a real test', { antes });

  await sb.eval(buscarEnLedger('zzz-no-existe-este-concepto-zzz'));
  await sb.pump(2); await sleep(400);
  const cero = await sb.eval(ESTADO_LEDGER);
  /* TODOS los grupos se vacían con una consulta que no existe, y TODOS tienen que
   * irse. La versión anterior de esta prueba daba por hecho que uno se
   * conservaría "porque tiene filas pero no coincidencias", y eso era
   * exactamente el defecto: un encabezado pintado sobre cero filas visibles
   * anuncia un nombre y un subtotal que no corresponden a nada en pantalla. */
  p.ok(cero.every(g => g.visibles === 0),
    'no group has a visible row left for a query that matches nothing', { cero });
  p.ok(cero.every(g => g.encabezadoPintado === false),
    'every group header stops being painted when its last visible row goes', { cero });
  p.ok(cero.every(g => /^0 de \d+$/.test(g.conteo)),
    'and the count says "0 de N" rather than the stale total', { cero });

  await sb.eval(buscarEnLedger(''));
  await sb.pump(2); await sleep(400);
  const limpio = await sb.eval(ESTADO_LEDGER);
  p.ok(limpio.every(g => g.visibles === g.filas),
    'clearing the query brings every row back', { limpio });
  p.ok(limpio.every(g => g.encabezadoPintado),
    'clearing the query brings every header back', { limpio });
  p.ok(limpio.every(g => g.conteo === String(g.filas)),
    'with no filter the count is the plain number of rows, not "x de y"', { limpio });
  p.equal((await erroresVisibles(sb)).length, 0, 'no NaN/undefined/Infinity', { malos: await erroresVisibles(sb) });
  p.equal((await sb.writeCount()).writes, 0, 'searching persisted nothing');
});

test('ledger.search-counts-are-honest: a partially matched group says "N de M"', async (sb, p) => {
  /* La mitad del caso anterior: el buscador también tiene que MENTIR con
   * calma cuando deja filas a la vista. Un encabezado que dice "9" sobre una
   * lista de dos está diciendo una falsehood que la persona no puede ver. */
  const totales = await sb.eval(`(() => {
    const g = document.querySelector('[data-segment-card="servicios"]');
    return { filas: g.querySelectorAll('.expense-card-item').length };
  })()`);
  p.ok(totales.filas >= 2, 'the services group has at least two rows to split', totales);

  /* Se busca el concepto EXACTO de la primera fila: el buscador deja esa fila y
   * descarta el resto del grupo, así que el encabezado queda con "1 de N". */
  const concepto = await sb.eval(`document.querySelector(
    '[data-segment-card="servicios"] .expense-card-item .expense-item-title').textContent`);
  await sb.eval(buscarEnLedger(concepto));
  await sb.pump(2); await sleep(400);
  const g = (await sb.eval(ESTADO_LEDGER)).find(x => x.grupo === 'servicios');
  p.equal(g.visibles, 1, 'exactly the matched row survives', { g, concepto });
  p.equal(g.conteo, `1 de ${totales.filas}`,
    'the header says "1 de N" instead of claiming the full total', { g, concepto });
  p.equal(g.encabezadoPintado, true,
    'a group with a visible row keeps its header', { g });

  await sb.eval(buscarEnLedger(''));
  await sb.pump(2); await sleep(400);
  const restaurado = (await sb.eval(ESTADO_LEDGER)).find(x => x.grupo === 'servicios');
  p.equal(restaurado.conteo, String(totales.filas),
    'clearing the query restores the plain total', { restaurado });
  p.equal((await sb.writeCount()).writes, 0, 'searching persisted nothing');
});

/* =====================================================================
 * EXECUTION
 * ===================================================================== */

async function ejecutar() {
  const solo = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
  const resultados = [];
  const red = [];
  let fallosInfra = 0;

  console.log('sandbox fixtures available: ' + FIXTURE_NAMES.join(', '));

  for (const g of GROUPS) {
    if (solo && g.title.toLowerCase().indexOf(solo.toLowerCase()) < 0
             && g.fixture !== solo) continue;
    console.log('\n' + '='.repeat(78));
    console.log('FIXTURE ' + g.fixture + '  ::  ' + g.title);
    console.log('='.repeat(78));

    let sb = null;
    try {
      sb = await launchSandbox({ fixture: g.fixture, headless: true });
    } catch (e) {
      console.error('  !! sandbox never launched: ' + e.message);
      fallosInfra++;
      for (const t of g.tests) {
        resultados.push({ group: g.title, name: t.name, verdict: 'INCONCLUSIVE', fixture: g.fixture,
          observation: 'the sandbox never launched, so nothing could be observed',
          checks: [], gaps: [], notes: [], network: 'NOT RUN' });
      }
      continue;
    }
    engancharDialogos(sb);

    try {
      const a = await sb.assertAdmin();
      console.log('  admin gate OK: read-only-mode=' + a.readOnlyMode + ', .admin-action-btn ' +
        a.adminButtonsVisible + '/' + a.adminButtonsTotal);
    } catch (e) {
      console.error('  !! NOT ADMIN, every result in this group would be meaningless: ' + e.message);
      fallosInfra++;
      const cierre = await sb.close();
      for (const t of g.tests) {
        resultados.push({ group: g.title, name: t.name, verdict: 'INCONCLUSIVE', fixture: g.fixture,
          observation: 'the admin gate failed, so no control was reachable: ' + e.message,
          checks: [], gaps: [], notes: [], network: 'NOT RUN', profileDeleted: cierre.removed });
      }
      continue;
    }

    for (const t of g.tests) {
      const p = new Probe(t.name);
      let thrown = null;
      const netAntes = sb.requests.length;
      ctx.dialogs.length = 0;
      ctx.dialogPolicy = 'accept';

      try {
        await sb.reload(9000);
        await sb.assertAdmin();
        await sb.pump(3);
        await sleep(900);
        await sb.markBootBaseline();
        await sb.pump(2);
        await sleep(500);
        await t.fn(sb, p);
      } catch (e) {
        thrown = e;
        p.gaps.push({ label: 'the test body threw', why: String(e && e.message || e) });
      }

      let redTexto;
      try {
        const r = await sb.assertNetworkClean();
        red.push({ test: t.name, supabaseRequests: r.supabaseRequests, tripwire: r.tripwireAttempts });
        redTexto = 'CLEAN (supabase=' + r.supabaseRequests + ', tripwire=' + r.tripwireAttempts + ')';
        p.ok(r.supabaseRequests === 0 && r.tripwireAttempts === 0,
          'NETWORK: nothing reached a Supabase host', r);
      } catch (e) {
        red.push({ test: t.name, supabaseRequests: -1, tripwire: -1, error: e.message });
        redTexto = 'LEAK: ' + e.message;
        p.ok(false, 'NETWORK CLEAN (this must never fail)', { error: e.message });
      }

      const w = await sb.writeCount().catch(() => null);
      p.note('observation method -> console errors this test: '
        + (sb.consoleErrors.length ? sb.consoleErrors.slice(-3).join(' | ') : 'none')
        + '; page exceptions: ' + (sb.exceptions.length ? sb.exceptions.slice(-2).join(' | ') : 'none')
        + '; counted setItem calls: ' + (w ? w.writes : 'unknown')
        + '; page requests during this test: ' + (sb.requests.length - netAntes));

      const fallidos = p.checks.filter(c => !c.pass);
      const obs = fallidos.length
        ? 'failed -> ' + fallidos.map(c => c.label).join('; ')
        : p.gaps.length
          ? 'observed but untestable -> ' + p.gaps.map(g => g.label).join('; ')
          : p.checks.length + ' checks passed across UI + memory + disk + network';

      resultados.push({
        group: g.title, name: t.name, fixture: g.fixture, verdict: p.verdict, observation: obs,
        checks: p.checks, gaps: p.gaps, notes: p.notes, network: redTexto,
        thrown: thrown ? String(thrown.message || thrown) : null,
      });

      const marca = p.verdict === 'PASS' ? 'PASS ' : p.verdict === 'FAIL' ? 'FAIL ' : 'INCON';
      console.log('  [' + marca + '] ' + t.name);
      if (p.verdict !== 'PASS') {
        fallidos.forEach(c => console.log('        x ' + c.label + '  ' + JSON.stringify(c.detail)));
        p.gaps.forEach(g => console.log('        ? ' + g.label + '  -> ' + g.why));
      }
      p.notes.forEach(n => console.log('        i ' + n));
    }

    const limpieza = await sb.close();
    console.log('  throwaway profile deleted: ' + limpieza.removed + ' -> ' + limpieza.profileDir);
  }

  const dir = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, 'adversarial-suite.report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    suite: 'adversarial-suite', generatedAt: new Date().toISOString(), storageKey: STORAGE_KEY,
    network: red, results: resultados,
  }, null, 2), 'utf8');

  console.log('\n' + '='.repeat(78));
  console.log('T3 adversarial-suite summary');
  console.log('='.repeat(78));
  const n = v => resultados.filter(r => r.verdict === v).length;
  console.log('PASS        : ' + n('PASS'));
  console.log('FAIL        : ' + n('FAIL'));
  console.log('INCONCLUSIVE: ' + n('INCONCLUSIVE'));
  console.log('total       : ' + resultados.length + '   (infrastructure failures: ' + fallosInfra + ')');
  console.log('assertNetworkClean() ran on ' + red.length + '/' + resultados.length + ' tests; '
    + 'Supabase requests across the whole run: ' + red.reduce((s, r) => s + r.supabaseRequests, 0));
  console.log('report: ' + reportPath);
  return n('FAIL') > 0 ? 1 : 0;
}

process.exit(await ejecutar());
