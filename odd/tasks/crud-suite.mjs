/* crud-suite.mjs - T2: the full admin CRUD cycle, driven through the REAL UI.
 *
 * WHAT THIS IS
 * ------------
 * Session #156 shipped the admin edit modals but never proved a full
 * create -> edit -> delete cycle, and never proved movement editing against
 * anything but an in-memory seed. This suite runs the deployed UI: real
 * clicks, real modals, real form submits, real confirm() dialogs. The store is
 * only ever READ, never called to satisfy an assertion - that split is the
 * whole point, because a store-level call would pass even if the button that
 * is supposed to reach it were dead.
 *
 * Therefore every mutation asserts THREE surfaces:
 *   1. UI     - the rendered DOM: text, node counts, computed styles.
 *   2. MEMORY - window.financialStore.data.
 *   3. DISK   - JSON.parse(localStorage['control_gastos_mensuales_db_v1']).
 *   UI + MEMORY without DISK is the "looks saved, is not saved" defect, and
 *   it is exactly the class of bug this suite exists to catch.
 *
 * ISOLATION
 * ---------
 * sandbox.mjs gives a throwaway browser profile, a forced admin session and a
 * `window.gastosRemoto` stub that performs ZERO network I/O. Every test runs
 * against a synthetic fixture seeded under the real store key. The user's own
 * browser profile and real data are never involved.
 *
 * WRITE ACCOUNTING
 * ----------------
 * The app writes once at boot on its own (app.js:1656 -> switchView -> save).
 * markBootBaseline() freezes that and keeps it in bootWriteLog with its real
 * stack. Mutating tests are EXPECTED to write, so they assert the expected
 * count instead of asserting zero (assertNoWrites would fail by design).
 * assertNetworkClean() runs on EVERY test, pass or fail.
 *
 * DIALOGS
 * -------
 * confirm()/alert() are answered through the real CDP channel
 * (Page.javascriptDialogOpening -> Page.handleJavaScriptDialog), never by
 * overriding the DOM functions: the app's own `if (confirm(...))` branch has to
 * execute for real. The answer is chosen per test.
 *
 * HONESTY RULE
 * ------------
 * Every test records HOW it observed its verdict. A check whose probe captured
 * nothing is marked INCONCLUSIVE, never PASS. Precedence:
 *   any failed check      -> FAIL
 *   else any inconclusive -> INCONCLUSIVE
 *   else                  -> PASS
 *
 * Run:  node odd\tasks\crud-suite.mjs
 *       node odd\tasks\crud-suite.mjs --only=movimiento
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox, STORAGE_KEY } from './sandbox.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* =====================================================================
 * RUNNER
 * Tests are grouped by fixture so one browser serves a whole group. Each test
 * re-navigates, which re-runs the document-start injection and therefore
 * re-seeds localStorage from the fixture: state cannot leak between tests.
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

/** Assertion recorder. Keeps every check so the report can justify a verdict. */
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
 * DIALOG CHANNEL - real CDP answers, app-side logic untouched
 * ===================================================================== */

const ctx = { dialogs: [], dialogPolicy: 'accept' };

function engancharDialogos(sb) {
  sb.page.on(msg => {
    if (msg.method !== 'Page.javascriptDialogOpening') return;
    const type = msg.params.type;
    /* confirm() is the product decision under test, so the answer is ours to
     * choose per test. alert() is informational: always dismiss so the renderer
     * unblocks, but record the message so "did it complain?" is observable. */
    const accept = type === 'confirm' ? ctx.dialogPolicy === 'accept' : false;
    ctx.dialogs.push({ type, message: msg.params.message, accepted: accept });
    sb.page.send('Page.handleJavaScriptDialog', { accept }).catch(() => { /* target closed */ });
  });
}

/** Fire a UI action that may raise a dialog, WITHOUT awaiting the evaluate.
 *  A blocking dialog stops the renderer, so the evaluate only returns once we
 *  have answered it. Returns whatever came back, plus the dialogs raised. */
async function pulsarConDialogos(sb, expr, waitMs = 3500) {
  ctx.dialogs.length = 0;
  let res = null, err = null;
  const pendiente = sb.eval(expr).then(v => { res = v; }, e => { err = String(e && e.message || e); });
  await Promise.race([pendiente, sleep(waitMs)]);
  await sleep(150);
  return { res, err, dialogs: ctx.dialogs.slice(), colgado: res === null && err === null };
}

/* =====================================================================
 * READ PROBES - each one reads something observable from the live page
 * ===================================================================== */

/** DISK surface: the real persisted bytes, parsed. Not memory, not a mock. */
const disk = sb => sb.eval(`(() => { try {
  const raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  return raw === null ? null : JSON.parse(raw);
} catch (e) { return { __error: String(e) }; } })()`);

const mem = sb => sb.data();

const modalAbierto = (sb, id) => sb.eval(
  `!!document.getElementById(${JSON.stringify(id)}) && ` +
  `document.getElementById(${JSON.stringify(id)}).classList.contains('active')`);

const MODALES_ACTIVOS = `[...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)`;

/** Any user-visible NaN / undefined / Infinity / null in a rendered text node.
 *  Sweeps the whole visible tree so one pass catches a broken KPI, a broken
 *  subtotal and a broken row. */
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

/** Find a rendered expense row by its visible title and press one of its buttons. */
const PULSAR_EN_GASTO = (concepto, boton) => `(() => {
  const filas = [...document.querySelectorAll('.expense-card-item')];
  const f = filas.find(x => {
    const t = x.querySelector('.expense-item-title');
    return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return { ok: false, motivo: 'no hay fila con ese titulo',
    titulos: filas.map(x => (x.querySelector('.expense-item-title') || {}).textContent) };
  const b = f.querySelector(${JSON.stringify(boton)});
  if (!b) return { ok: false, motivo: 'la fila no tiene ' + ${JSON.stringify(boton)},
    hijos: [...f.children].map(c => c.className) };
  const antes = {
    titulo: f.querySelector('.expense-item-title').textContent,
    importe: (f.querySelector('.expense-item-amount') || {}).textContent,
    estado: (f.querySelector('.btn-status-toggle') || {}).textContent,
  };
  b.click();
  return { ok: true, pulsado: ${JSON.stringify(boton)}, antes };
})()`;

const PULSAR_EN_MOVIMIENTO = (concepto, boton) => `(() => {
  const filas = [...document.querySelectorAll('.transaction-feed-item')];
  const f = filas.find(x => {
    const t = x.querySelector('h4');
    return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return { ok: false, motivo: 'no hay movimiento con ese concepto',
    conceptos: filas.map(x => (x.querySelector('h4') || {}).textContent) };
  const b = f.querySelector(${JSON.stringify(boton)});
  if (!b) return { ok: false, motivo: 'el movimiento no tiene ' + ${JSON.stringify(boton)} };
  const antes = {
    concepto: f.querySelector('h4').textContent,
    importe: (f.querySelector('.tx-amount') || {}).textContent,
  };
  b.click();
  return { ok: true, pulsado: ${JSON.stringify(boton)}, antes };
})()`;

/** GENUINE typing: real focus plus CDP Input.insertText, which fires a real
 *  `input` event. Required for the notes auto-save, which listens on `input`.
 *  For text fields this is indistinguishable from a human typing. */
async function escribirConTeclado(sb, selector, texto) {
  const foco = await sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
    e.value = ''; e.focus();
    return { ok: document.activeElement === e, tag: e.tagName.toLowerCase(), type: e.type || null };
  })()`);
  if (!foco.ok) return foco;
  await sb.page.send('Input.insertText', { text: String(texto) });
  await sb.pump(1);
  const fin = await sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    return { ok: true, valor: e.value, tag: e.tagName.toLowerCase(), type: e.type || null };
  })()`);
  fin.viaTeclado = fin.valor === String(texto);
  return fin;
}

/** Paste-equivalent for `input[type=number]`: assign .value directly and fire a
 *  real `input` event. Input.insertText is an IME-composition API and cannot
 *  reliably produce a number that is momentarily invalid ("-" alone, then
 *  digits), so the negative-amount cases need this path. Stated in the test
 *  notes rather than hidden. */
async function escribirValor(sb, selector, texto) {
  return sb.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
    e.value = ${JSON.stringify(String(texto))};
    e.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, valor: e.value, pedido: ${JSON.stringify(String(texto))},
             tag: e.tagName.toLowerCase(), type: e.type || null,
             sanity: { valueMissing: e.validity ? e.validity.valueMissing : null,
                       rangeOverflow: e.validity ? e.validity.rangeOverflow : null } };
  })()`);
}

/** Pick a select option and fire the real `change` event so conditional fields
 *  react exactly as they do for a human. */
const ELEGIR_EN_SELECT = (selector, valor) => `(() => {
  const s = document.querySelector(${JSON.stringify(selector)});
  if (!s) return { ok: false, motivo: 'no existe ' + ${JSON.stringify(selector)} };
  if (![...s.options].some(o => o.value === ${JSON.stringify(valor)})) {
    return { ok: false, motivo: 'opcion inexistente ' + ${JSON.stringify(valor)},
             opciones: [...s.options].map(o => o.value) };
  }
  s.value = ${JSON.stringify(valor)};
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, valor: s.value };
})()`;

/** Press the REAL submit button of a form. This runs HTML5 interactive
 *  validation, exactly as a human click does - which is precisely the point:
 *  whether a bad amount is stopped by the browser or by app.js is a different
 *  claim with a different consequence. */
const PULSAR_SUBMIT_DE = (formId) => `(() => {
  const f = document.getElementById(${JSON.stringify(formId)});
  if (!f) return { ok: false, motivo: 'no existe el form ' + ${JSON.stringify(formId)} };
  const b = f.querySelector('button[type="submit"]');
  if (!b) return { ok: false, motivo: 'el form no tiene button[type=submit]' };
  const valido = f.checkValidity();
  const invalidos = [...f.querySelectorAll(':invalid')].map(e => ({
    id: e.id || null, tag: e.tagName.toLowerCase(), valor: e.value,
    /* Every ValidityState flag, not just the two guessed ones. Guessing
     * rangeOverflow for a value below min was wrong: below min is
     * rangeUnderflow, and the assertion would have "failed" for the wrong
     * reason. The flags are read, not assumed. */
    flags: Object.fromEntries(['badInput', 'customError', 'patternMismatch', 'rangeOverflow',
      'rangeUnderflow', 'stepMismatch', 'tooLong', 'tooShort', 'typeMismatch', 'valueMissing',
      'valid'].map(k => [k, e.validity[k]])),
  }));
  b.click();
  return { ok: true, valido, invalidos, hayRequestSubmit: typeof f.requestSubmit === 'function' };
})()`;

/** Adaptive REAL mouse click on the overlay itself, outside the sheet. Returns
 *  the element that actually receives the click, so the hit target is proven
 *  rather than assumed. */
async function clicEnOverlay(sb, modalId) {
  const punto = await sb.eval(`(() => {
    const ov = document.getElementById(${JSON.stringify(modalId)});
    if (!ov || !ov.classList.contains('active')) return { ok: false, motivo: 'overlay no activo' };
    const sheet = ov.querySelector('.modal-sheet');
    const s = sheet ? sheet.getBoundingClientRect() : null;
    const dentro = (x, y) => !!s && x >= s.left && x <= s.right && y >= s.top && y <= s.bottom;
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    for (let y = 4; y < h; y += 6) {
      for (let x = 4; x < w; x += 6) {
        if (dentro(x, y)) continue;
        const el = document.elementFromPoint(x, y);
        if (el === ov) {
          return { ok: true, x, y, hitId: el.id || null, hitClass: el.className || null,
                   sheet: { left: Math.round(s.left), top: Math.round(s.top),
                            right: Math.round(s.right), bottom: Math.round(s.bottom) } };
        }
      }
    }
    return { ok: false, motivo: 'ningun punto del viewport cae sobre el overlay fuera del sheet' };
  })()`);
  if (!punto.ok) return punto;
  await sb.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: punto.x, y: punto.y, buttons: 0 });
  await sb.page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: punto.x, y: punto.y, button: 'left', clickCount: 1, buttons: 1 });
  await sb.page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: punto.x, y: punto.y, button: 'left', clickCount: 1, buttons: 0 });
  await sb.pump(2);
  await sleep(250);
  return punto;
}

/** Real CDP key events. T1 verified these DO deliver on this machine; the
 *  previous "keyboard trap" note came from the user's Brave profile. */
async function pulsarEscape(sb) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await sb.page.send('Input.dispatchKeyEvent', {
      type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
    });
  }
  await sb.pump(2);
  await sleep(250);
}

/* The row templates are indented multi-line strings, so textContent carries the
 * surrounding newlines and spaces. Everything asserted about rendered text is
 * trimmed; without this the suite would "fail" on whitespace that no user sees. */
const textoFilaGasto = (sb, concepto) => sb.eval(`(() => {
  const f = [...document.querySelectorAll('.expense-card-item')].find(x => {
    const t = x.querySelector('.expense-item-title'); return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return null;
  const chip = f.querySelector('.btn-status-toggle');
  const amt = f.querySelector('.expense-item-amount');
  return { titulo: f.querySelector('.expense-item-title').textContent.trim(),
           importe: amt ? amt.textContent.trim() : null,
           estado: chip ? chip.textContent.trim() : null, estadoClass: chip ? chip.className : null,
           tipoTags: [...f.querySelectorAll('.tag-badge')].map(t => t.textContent.trim()) };
})()`);

const textoMovimiento = (sb, concepto) => sb.eval(`(() => {
  const f = [...document.querySelectorAll('.transaction-feed-item')].find(x => {
    const t = x.querySelector('h4'); return t && t.textContent.trim() === ${JSON.stringify(concepto)};
  });
  if (!f) return null;
  const amt = f.querySelector('.tx-amount');
  const fecha = f.querySelector('.tx-details .font-mono');
  return { concepto: f.querySelector('h4').textContent.trim(),
           importe: amt ? amt.textContent.trim() : null,
           fecha: fecha ? fecha.textContent.trim() : null };
})()`);

/* T5: contar gastos ya no es preguntar por cinco cajas. El libro agrupa por
 * categoría, y las filas de gasto son las de los tres grupos de presupuesto:
 * servicios (fijos + variables), personales (fijos + variables) y extras. */
const conteoGastos = sb => sb.eval(
  `document.querySelectorAll('#ledgerRowsServicios .expense-card-item,`
  + ` #ledgerRowsPersonales .expense-card-item,`
  + ` #ledgerRowsExtras .expense-card-item').length`);
const conteoMovimientos = sb => sb.eval(`document.querySelectorAll('.transaction-feed-item').length`);
const pillsDeMes = sb => sb.eval(`[...document.querySelectorAll('.month-pill-btn')].map(x => ({
  texto: x.textContent.trim(), activa: x.classList.contains('active'),
  ariaPressed: x.getAttribute('aria-pressed') }))`);

/* Store readers: plain navigation of the read JSON. No store method is called. */
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
const buscarMov = (m, id) => ((m && m.movimientos) || []).find(x => x.id === id) || null;

const A = 'prueba-alfa-2026';
const B = 'prueba-beta-2026';

/* =====================================================================
 * T2a - GASTO (expense)
 * ===================================================================== */

group('baseline', 'Gasto: crear / editar / borrar / marcar pagado');

const CONCEPTO_NUEVO = 'PRUEBA-CRUD Nuevo Fijo';

test('expense.create.servicios-fijos: UI, memory and disk all gain the row', async (sb, p) => {
  const antesUI = await conteoGastos(sb);
  const antesDisco = (await disk(sb)).meses[A].servicios.fijos.length;

  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sb.pump(1); await sleep(250);
  p.ok(await modalAbierto(sb, 'modalAddBudget'),
    'the real topbar "add expense" button opens the sheet', { modal: 'modalAddBudget' });

  p.equal((await sb.eval(ELEGIR_EN_SELECT('#budgetSection', 'servicios'))).ok, true,
    'the category select accepts "servicios"');
  p.equal((await sb.eval(ELEGIR_EN_SELECT('#budgetSubsection', 'fijos'))).ok, true,
    'the type select accepts "fijos"');
  p.equal(await sb.eval(`getComputedStyle(document.getElementById('inputBudgetRangeField')).display`),
    'none', 'UI: the range field stays hidden for a fixed expense (the sheet reacts to the select)');

  const c = await escribirConTeclado(sb, '#budgetConcepto', CONCEPTO_NUEVO);
  p.ok(c.viaTeclado, 'the concepto was typed with real key events, not assigned', c);
  const m = await escribirValor(sb, '#budgetMonto', '123.45');
  p.equal(m.valor, '123.45', 'the amount field holds 123.45');
  await sb.eval(ELEGIR_EN_SELECT('#budgetEstado', 'Pendiente'));

  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  p.ok(envio.ok && envio.valido, 'the real submit button passes HTML5 validation', envio);
  await sb.pump(2); await sleep(400);

  p.ok(!(await modalAbierto(sb, 'modalAddBudget')), 'the sheet closes after a successful submit');
  p.ok((await textoFilaGasto(sb, CONCEPTO_NUEVO)) !== null,
    'UI: a rendered expense row shows the new concepto', { antesUI });
  const d = await disk(sb); const mo = await mem(sb);
  const enDisco = (d.meses[A].servicios.fijos || []).find(i => i.concepto === CONCEPTO_NUEVO);
  const enMemoria = (mo.meses[A].servicios.fijos || []).find(i => i.concepto === CONCEPTO_NUEVO);
  p.ok(!!enDisco, 'DISK: localStorage holds the new row', { count: d.meses[A].servicios.fijos.length });
  p.ok(!!enMemoria, 'MEMORY: window.financialStore holds the new row');
  if (enDisco) {
    p.equal(enDisco.monto, 123.45, 'DISK: monto persisted as a number, not a string');
    p.equal(enDisco.tipo, 'Fijo', 'DISK: tipo derived from the chosen subsection');
    p.equal(enDisco.estado, 'Pendiente', 'DISK: estado persisted');
    p.equal(enMemoria.monto, 123.45, 'MEMORY: monto matches DISK');
  }
  p.equal(await conteoGastos(sb), antesUI + 1, 'UI: exactly one row was added');
  p.equal(d.meses[A].servicios.fijos.length, antesDisco + 1, 'DISK: the target list grew by one');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one create');
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity on screen',
    { offenders: await erroresVisibles(sb) });
});

test('expense.create.variables: the range field appears and is persisted', async (sb, p) => {
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await sb.eval(ELEGIR_EN_SELECT('#budgetSection', 'servicios'));
  await sb.eval(ELEGIR_EN_SELECT('#budgetSubsection', 'variables'));
  p.equal(await sb.eval(`getComputedStyle(document.getElementById('inputBudgetRangeField')).display`),
    'block', 'UI: choosing "variables" reveals the range field');
  await escribirConTeclado(sb, '#budgetConcepto', 'PRUEBA-CRUD Variable Rango');
  await escribirValor(sb, '#budgetMonto', '45.50');
  await escribirValor(sb, '#budgetRango', '30-60');
  await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2); await sleep(350);
  const d = await disk(sb);
  const it = listaDe(mesDe(d, A), 'servicios', 'variables').find(i => i.concepto === 'PRUEBA-CRUD Variable Rango');
  p.ok(!!it, 'DISK: the row landed in servicios.variables');
  if (it) {
    p.equal(it.rango, '30-60', 'DISK: rango persisted');
    p.equal(it.tipo, 'Variable', 'DISK: tipo is Variable');
    p.equal(it.monto, 45.5, 'DISK: monto persisted as a number');
  }
  p.ok((await textoFilaGasto(sb, 'PRUEBA-CRUD Variable Rango')) !== null, 'UI: the row is rendered');
  const chip = await textoFilaGasto(sb, 'PRUEBA-CRUD Variable Rango');
  p.ok(chip && chip.tipoTags.join(' ').indexOf('Variable') >= 0, 'UI: the Variable tag renders', { chip });
});

test('expense.create.extras: extras hides subsection and range, forces tipo Extra', async (sb, p) => {
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await sb.eval(ELEGIR_EN_SELECT('#budgetSection', 'extras'));
  p.equal(await sb.eval(`getComputedStyle(document.getElementById('selectBudgetSubsectionField')).display`),
    'none', 'UI: extras hides the subsection field');
  p.equal(await sb.eval(`getComputedStyle(document.getElementById('inputBudgetRangeField')).display`),
    'none', 'UI: extras hides the range field');
  await escribirConTeclado(sb, '#budgetConcepto', 'PRUEBA-CRUD Extra');
  await escribirValor(sb, '#budgetMonto', '77.77');
  await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2); await sleep(350);
  const d = await disk(sb);
  const it = (d.meses[A].extras || []).find(i => i.concepto === 'PRUEBA-CRUD Extra');
  p.ok(!!it, 'DISK: the row landed in extras');
  if (it) p.equal(it.tipo, 'Extra', 'DISK: tipo forced to Extra');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-CRUD Extra')) !== null, 'UI: the row is rendered');
});

test('expense.edit: concepto + monto change on all three surfaces; the merge preserves tipo/estado', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf1';
  const orig = buscarGasto(mesDe(await disk(sb), A), ITEM);
  p.ok(!!orig, 'fixture precondition: the target expense exists', { ITEM });
  const origEstado = orig.estado, origTipo = orig.tipo;

  const pulso = await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-edit-expense'));
  p.ok(pulso.ok, 'the row edit button is reachable and was clicked', pulso);
  await sb.pump(2); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalEditExpense'), 'UI: the edit sheet opens');

  const pre = await sb.eval(`(() => ({
    concepto: document.getElementById('editExpenseConcepto').value,
    monto: document.getElementById('editExpenseMonto').value,
    tipo: document.getElementById('editExpenseTipoReadonly').textContent,
    monthId: document.getElementById('editExpenseMonthId').value,
    itemId: document.getElementById('editExpenseItemId').value,
    rangoVisible: getComputedStyle(document.getElementById('editExpenseRangeField')).display,
  }))()`);
  p.equal(pre.concepto, 'PRUEBA-ALFA Internet', 'the sheet is prefilled with the real concepto');
  p.equal(pre.monto, '111.11', 'the sheet is prefilled with the real monto at 2 decimals');
  p.equal(pre.tipo, 'Fijo', 'the read-only tipo shows the real tipo');
  p.equal(pre.itemId, ITEM, 'the hidden item id is the clicked item');
  p.equal(pre.monthId, A, 'the hidden month id is the active month');
  p.equal(pre.rangoVisible, 'none', 'UI: a fixed expense hides the range field');

  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRDF Internet EDITADO');
  await escribirValor(sb, '#editExpenseMonto', '222.99');
  await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(350);

  p.ok(!(await modalAbierto(sb, 'modalEditExpense')), 'the edit sheet closes after saving');
  const ui = await textoFilaGasto(sb, 'PRUEBA-CRDF Internet EDITADO');
  p.ok(ui !== null, 'UI: the row now shows the edited concepto', { ui });
  if (ui) {
    p.equal(ui.importe, 'S/ 222.99', 'UI: the row amount re-rendered to the edited value');
    p.equal(ui.estado, origEstado, 'UI: the state chip did not change');
  }
  const d = await disk(sb); const mo = await mem(sb);
  const enDisco = buscarGasto(mesDe(d, A), ITEM);
  p.ok(!!enDisco, 'DISK: the same id is still present (a patch, not delete+insert)');
  if (enDisco) {
    p.equal(enDisco.concepto, 'PRUEBA-CRDF Internet EDITADO', 'DISK: concepto changed');
    p.equal(enDisco.monto, 222.99, 'DISK: monto changed and stayed a number');
    p.equal(enDisco.estado, origEstado, 'DISK: estado survived the merge (the form never sends it)');
    p.equal(enDisco.tipo, origTipo, 'DISK: tipo survived the merge (declared read-only)');
  }
  const enMemoria = buscarGasto(mesDe(mo, A), ITEM);
  p.ok(!!enMemoria && enMemoria.concepto === 'PRUEBA-CRDF Internet EDITADO',
    'MEMORY: matches DISK', { enMemoria });
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one edit');
});

test('expense.edit.variable: the rango field is editable and the merge is scoped to it', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sv1';
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Limpieza', '.btn-edit-expense'));
  await sb.pump(2); await sleep(250);
  p.equal(await sb.eval(`getComputedStyle(document.getElementById('editExpenseRangeField')).display`),
    'block', 'UI: a variable expense shows the range field');
  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRDF Limpieza EDITADA');
  await escribirValor(sb, '#editExpenseMonto', '399.99');
  await escribirConTeclado(sb, '#editExpenseRango', '380-420');
  await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(350);
  const d = await disk(sb);
  const it = buscarGasto(mesDe(d, A), ITEM);
  p.ok(!!it, 'DISK: still the same id');
  if (it) {
    p.equal(it.rango, '380-420', 'DISK: rango changed');
    p.equal(it.monto, 399.99, 'DISK: monto changed');
    p.equal(it.estado, 'Pendiente', 'DISK: estado untouched');
  }
  p.ok((await textoFilaGasto(sb, 'PRUEBA-CRDF Limpieza EDITADA')) !== null, 'UI: the row re-rendered');
});

test('expense.edit.rejects-negative: HTML5 min=0 blocks it before app.js ever sees it', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf2';
  const antesMonto = buscarGasto(mesDe(await disk(sb), A), ITEM).monto;
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Celular', '.btn-edit-expense'));
  await sb.pump(2); await sleep(250);
  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRDF Celular NEGATIVO');
  const monto = await escribirValor(sb, '#editExpenseMonto', '-10');
  p.equal(monto.valor, '-10', 'the amount field really holds -10 (paste-equivalent transport)');
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(300);
  p.ok(envio.ok, 'the real submit button was pressed', envio);
  p.equal(envio.valido, false, 'HTML5 constraint validation rejects monto = -10');
  const ofensor = envio.invalidos.find(i => i.id === 'editExpenseMonto');
  p.ok(!!ofensor, '#editExpenseMonto is the only invalid field', { invalidos: envio.invalidos });
  if (ofensor) {
    p.equal(ofensor.flags.rangeUnderflow, true,
      'the ValidityState flag is rangeUnderflow (value is BELOW min=0)', { flags: ofensor.flags });
    p.equal(ofensor.flags.valueMissing, false, 'and it is not valueMissing: the field is not empty');
  }
  p.equal(ctx.dialogs.length, 0,
    'no alert() was raised: the browser stopped the submit before app.js:1423 could run');
  p.ok(await modalAbierto(sb, 'modalEditExpense'), 'the sheet stays open, so nothing was saved');
  p.equal(buscarGasto(mesDe(await disk(sb), A), ITEM).monto, antesMonto, 'DISK: the monto is unchanged');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-ALFA Celular')) !== null,
    'UI: the row still shows the original concepto');
  p.equal((await sb.writeCount()).writes, 0, 'a rejected submit persists nothing');
  p.note('app.js:1424 alert("Por favor ingresa un monto valido") is UNREACHABLE through the real UI: '
    + 'input[type=number] refuses non-numeric text (the field goes empty, tripping `required`) and '
    + 'min=0 refuses negatives, so parseFloat on this field can never be NaN or < 0. The guard is '
    + 'dead code from the UI. Not a crash risk - a duplicated concern that will drift.');
});

test('expense.edit.rejects-empty-monto: required blocks an empty amount', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf2';
  const antesMonto = buscarGasto(mesDe(await disk(sb), A), ITEM).monto;
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Celular', '.btn-edit-expense'));
  await sb.pump(2); await sleep(250);
  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRDF Celular SIN MONTO');
  const monto = await escribirValor(sb, '#editExpenseMonto', '');
  p.equal(monto.valor, '', 'the amount field is genuinely empty');
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(250);
  p.equal(envio.valido, false, 'a blank amount fails required');
  p.ok(envio.invalidos.some(i => i.id === 'editExpenseMonto' && i.flags.valueMissing),
    'the failure is validity.valueMissing on #editExpenseMonto', { invalidos: envio.invalidos });
  p.equal(ctx.dialogs.length, 0, 'no alert(): the browser blocked it first');
  p.ok(await modalAbierto(sb, 'modalEditExpense'), 'the sheet stays open');
  p.equal(buscarGasto(mesDe(await disk(sb), A), ITEM).monto, antesMonto, 'DISK: monto unchanged');
  p.equal((await sb.writeCount()).writes, 0, 'nothing persisted');
});

test('expense.edit.whitespace-concepto: DEFECT - Save does nothing, silently', async (sb, p) => {
  /* app.js:1421 does concepto.trim() and app.js:1422 does a bare
   * `if (!concepto) return;`. HTML5 `required` does NOT treat "   " as empty, so
   * the browser lets the submit through, the handler trims it to "", and the
   * handler returns with no toast, no shake and no message. The result: the user
   * presses "Guardar cambios" on a form that looks valid and NOTHING happens. */
  const ITEM = 'i-prueba-alfa-2026-sf2';
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Celular', '.btn-edit-expense'));
  await sb.pump(2); await sleep(250);
  await escribirConTeclado(sb, '#editExpenseConcepto', '     ');
  await escribirValor(sb, '#editExpenseMonto', '55.55');
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formEditExpense'));
  await sb.pump(2); await sleep(400);
  const vacio = await sb.eval(`(() => ({
    conceptoEnElCampo: document.getElementById('editExpenseConcepto').value,
    conceptoEnElCampoTrim: document.getElementById('editExpenseConcepto').value.trim(),
    toastVisible: document.getElementById('neoToast').classList.contains('show'),
    toastTexto: document.getElementById('toastText').textContent,
    shake: !!document.querySelector('#modalEditExpense .modal-shake'),
    validationMessage: document.getElementById('editExpenseConcepto').validationMessage,
  }))()`);
  p.equal(envio.valido, true,
    'OBSERVED: HTML5 `required` accepts a whitespace-only value, so the browser lets the submit through',
    { invalidos: envio.invalidos, vacio });
  p.equal(vacio.conceptoEnElCampo.trim(), '', 'the app sees an empty string after trim()');
  p.equal(vacio.toastVisible, false, 'DEFECT: no toast explains why nothing happened', vacio);
  p.equal(vacio.shake, false, 'DEFECT: the sheet is not shaken to signal a rejection', vacio);
  p.equal(ctx.dialogs.length, 0, 'no alert() either', vacio);
  p.ok(await modalAbierto(sb, 'modalEditExpense'), 'the sheet silently stays open');
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: nothing was persisted (so no data was lost)');
  p.equal((await sb.writeCount()).writes, 0, 'no write');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-ALFA Celular')) !== null, 'UI: the row is unchanged');
  p.note('EXPECTED vs ACTUAL. Expected: the user gets told the concept cannot be blank. '
    + 'Actual: Save is a dead control for whitespace-only input - the click is swallowed by '
    + 'app.js:1422 with no user-visible feedback. Severity: low (no data loss, no wrong value) '
    + 'but it is exactly the "dead control" class the brief asks to eliminate. Fix belongs to T4: '
    + 'add `required` handling on the trimmed value, or reuse the existing modal-shake affordance.');
});

test('expense.delete.cancel: the confirm dialog appears and cancelling really cancels', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf1';
  const antesDisco = JSON.stringify(await disk(sb));
  ctx.dialogPolicy = 'cancel';
  const r = await pulsarConDialogos(sb, PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-delete-expense'));
  p.ok(r.res && r.res.ok, 'the row delete button was clicked', r.res || r.err);
  await sb.pump(2); await sleep(400);
  p.equal(r.dialogs.length, 1, 'OBSERVED: exactly one real confirm() dialog was raised over CDP');
  const d0 = r.dialogs[0];
  if (d0) {
    p.equal(d0.type, 'confirm', 'the dialog type is confirm');
    p.ok(/Eliminar gasto/.test(d0.message), 'the message names the operation', { message: d0.message });
    p.ok(d0.message.indexOf('PRUEBA-ALFA Internet') >= 0, 'the message carries the real concepto');
    p.equal(d0.accepted, false, 'the harness answered "Cancel"');
  }
  const d = await disk(sb);
  p.ok(!!buscarGasto(mesDe(d, A), ITEM), 'DISK: the expense survived the cancelled delete');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-ALFA Internet')) !== null, 'UI: the row is still rendered');
  p.equal(JSON.stringify(d), antesDisco, 'DISK: the whole persisted document is byte-identical');
  p.equal((await sb.writeCount()).writes, 0, 'a cancelled delete persists nothing');
});

test('expense.delete.confirm: the row leaves UI, memory and disk together', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf1';
  const antesUI = await conteoGastos(sb);
  const antesDisco = (await disk(sb)).meses[A].servicios.fijos.length;
  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-delete-expense'));
  p.ok(r.res && r.res.ok, 'the row delete button was clicked', r.res || r.err);
  await sb.pump(2); await sleep(400);
  p.equal(r.dialogs.length, 1, 'exactly one confirm dialog was raised');
  if (r.dialogs[0]) p.equal(r.dialogs[0].accepted, true, 'the harness answered "OK"');
  const d = await disk(sb); const mo = await mem(sb);
  p.ok(!buscarGasto(mesDe(d, A), ITEM), 'DISK: the expense is gone');
  p.ok(!buscarGasto(mesDe(mo, A), ITEM), 'MEMORY: the expense is gone');
  p.equal(await conteoGastos(sb), antesUI - 1, 'UI: one row fewer');
  p.equal(d.meses[A].servicios.fijos.length, antesDisco - 1, 'DISK: the target list shrank by one');
  p.equal(await textoFilaGasto(sb, 'PRUEBA-ALFA Internet'), null, 'UI: the deleted row is no longer rendered');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one delete');
});

test('expense.toggle.pagado-pendiente: the row chip flips and the store follows', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf1';
  const antesEstado = buscarGasto(mesDe(await disk(sb), A), ITEM).estado;
  const pulso = await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-status-toggle'));
  p.ok(pulso.ok, 'the row status toggle was clicked', pulso);
  await sb.pump(2); await sleep(350);
  const esperado = antesEstado === 'Pagado' ? 'Pendiente' : 'Pagado';
  const ui = await textoFilaGasto(sb, 'PRUEBA-ALFA Internet');
  p.equal(ui && ui.estado, esperado, `UI: the chip reads "${esperado}"`);
  p.ok(!!ui && ui.estadoClass.indexOf(esperado === 'Pagado' ? 'status-pagado' : 'status-pendiente') >= 0,
    'UI: the chip class matches the new state', { estadoClass: ui && ui.estadoClass });
  p.equal(ctx.dialogs.length, 0, 'a fixed expense toggles without any dialog');
  const d = await disk(sb); const mo = await mem(sb);
  p.equal(buscarGasto(mesDe(d, A), ITEM).estado, esperado, 'DISK: estado flipped');
  p.equal(buscarGasto(mesDe(mo, A), ITEM).estado, esperado, 'MEMORY: estado flipped');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one toggle');
  const kpi = await sb.eval(`document.getElementById('monthGastosCount').textContent`);
  p.ok(/de .* gastos pagados/.test(kpi), 'the live KPI re-rendered', { kpi });
});

test('expense.toggle-all: toggleAllBudgetItems has no UI control', async (sb, p) => {
  const items = todasListas(mesDe(await disk(sb), A));
  const superficie = await sb.eval(`(() => {
    /* Enumerate EVERY clickable control and classify it by SCOPE, not by
     * wording. A bulk paid/unpaid action would have to live outside every row;
     * that structural fact is what gets asserted, because label matching would
     * be a guess about wording (and "Todos" / "Ver todo" are segment filters,
     * not paid-state actions). */
    const etiquetados = (el) => ((el.textContent || '') + ' ' + (el.title || '') + ' '
      + (el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim();
    const todas = [...document.querySelectorAll('button, a[href], input, [role=button]')];
    /* Controls OUTSIDE any expense row, whose label talks about paid/state. */
    const fueraDeFilaConEstado = todas.filter(el => !el.closest('.expense-card-item')
        /* Word-bounded on purpose: an unbounded /estado/ matches "presupuestado"
         * in the "Anadir nuevo gasto presupuestado" button, which is a false
         * positive that would have "proven" a control that does not exist. */
        && /marcar|pagar|pagado|pendiente|\\bestado\\b/i.test(etiquetados(el)))
      .map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
                    etiqueta: etiquetados(el).slice(0, 60),
                    dentroDeFormPago: !!el.closest('#formPayVariableExpense') }));
    return {
      totalControles: todas.length,
      fueraDeFilaConEstado,
      togglesPorFila: document.querySelectorAll('.expense-card-item .btn-status-toggle').length,
      filasGasto: document.querySelectorAll('.expense-card-item').length,
      togglesHuerfanos: document.querySelectorAll('.btn-status-toggle:not(.expense-card-item .btn-status-toggle)').length,
    };
  })()`);
  p.note('store.js:611 toggleAllBudgetItems is implemented and has ZERO callers: it is not '
    + 'referenced by js/app.js, js/charts.js, or any inline handler in index.html.');
  p.equal(items.length, 6, 'the fixture month does hold 6 expenses, so the case is not vacuous');
  p.equal(superficie.filasGasto, 6, 'UI: all 6 render as expense rows');
  p.equal(superficie.togglesPorFila, superficie.filasGasto,
    'the ONLY status control is the per-row chip: exactly one per row, no bulk equivalent');
  p.equal(superficie.togglesHuerfanos, 0,
    'PROVEN ABSENT: there is no .btn-status-toggle anywhere outside an expense row, which is the '
    + 'only shape a "mark all" toggle could take', { totalControles: superficie.totalControles });
  p.ok(superficie.fueraDeFilaConEstado.every(c => c.dentroDeFormPago),
    'PROVEN ABSENT: outside the rows, the only control that talks about "pagado" is the '
    + 'single-item pay-variable submit. "Todos" and "Ver todo" are segment filters, not paid actions.',
    { fueraDeFilaConEstado: superficie.fueraDeFilaConEstado });
  p.inconclusive('toggleAllBudgetItems cannot be exercised through the UI',
    'No button, link or inline handler calls it. Observing its behaviour would require calling '
    + 'window.financialStore.toggleAllBudgetItems directly, which this suite refuses to do because '
    + 'a store-level call is not evidence about the deployed UI.');
});

test('expense.create.blank-concepto: required blocks a nameless expense', async (sb, p) => {
  const antesUI = await conteoGastos(sb);
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await escribirConTeclado(sb, '#budgetConcepto', '');
  await escribirValor(sb, '#budgetMonto', '10.00');
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formAddBudget'));
  await sb.pump(2); await sleep(250);
  p.equal(envio.valido, false, 'a blank concepto fails required');
  p.ok(envio.invalidos.some(i => i.id === 'budgetConcepto' && i.flags.valueMissing),
    'the offending field is #budgetConcepto with validity.valueMissing', { invalidos: envio.invalidos });
  p.ok(await modalAbierto(sb, 'modalAddBudget'), 'the sheet stays open');
  p.equal(await conteoGastos(sb), antesUI, 'UI: no row appeared');
  p.equal((await sb.writeCount()).writes, 0, 'nothing persisted');
});

/** Create one movement by driving the real sheet, so the edit/delete cases can
 *  start from a genuinely empty month instead of borrowing state from a
 *  previous test. Nothing is written into the store directly: this is the same
 *  path a user takes, which is also what makes the cycle a real cycle. */
async function crearMovimientoPorUI(sb, { concepto, monto, fecha, flujo }) {
  const boton = flujo === 'Gasto' ? '#btnQuickActionExpense' : '#btnQuickActionIncome';
  await sb.eval(`document.querySelector(${JSON.stringify(boton)}).click(); 1`);
  await sb.pump(1);
  await sleep(300);
  if (!(await modalAbierto(sb, 'modalAddMovement'))) {
    throw new Error('could not open the movement sheet from ' + boton);
  }
  await escribirConTeclado(sb, '#movConcepto', concepto);
  await escribirValor(sb, '#movMonto', String(monto));
  await escribirValor(sb, '#movFecha', fecha);
  await sb.eval(PULSAR_SUBMIT_DE('formAddMovement'));
  await sb.pump(2);
  await sleep(400);
  return buscarMov(mesDe(await disk(sb), A), (await disk(sb)).meses[A].movimientos[0].id);
}

/* =====================================================================
 * T2b - MOVIMIENTO (movement)
 * ===================================================================== */

group('sinMovimientos', 'Movimiento: crear / editar / borrar desde un mes con 0 movimientos');

test('movement.create.ingreso: on a month that starts with zero movements', async (sb, p) => {
  const antesUI = await conteoMovimientos(sb);
  p.equal(antesUI, 0, 'fixture precondition: the active month renders zero movement rows');
  p.equal((await disk(sb)).meses[A].movimientos.length, 0, 'fixture precondition: 0 movements on disk');
  p.ok(await sb.eval(`!!document.querySelector('#ledgerRowsMovimientos .empty-feed-placeholder')`),
    'UI: the empty-state placeholder is shown before any movement exists');

  await sb.eval(`document.getElementById('btnQuickActionIncome').click(); 1`);
  await sb.pump(1); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalAddMovement'), 'the real quick-action button opens the movement sheet');
  p.equal(await sb.eval(`document.getElementById('modalMovementTitle').textContent`), 'Registrar Ingreso',
    'the sheet title reflects the requested flujo');

  const c = await escribirConTeclado(sb, '#movConcepto', 'PRUEBA-CRUD Abono Nuevo');
  p.ok(c.viaTeclado, 'the concepto was typed with real key events', c);
  await escribirValor(sb, '#movMonto', '1500.00');
  await escribirValor(sb, '#movFecha', '2026-08-15');
  await sb.eval(PULSAR_SUBMIT_DE('formAddMovement'));
  await sb.pump(2); await sleep(400);

  p.ok(!(await modalAbierto(sb, 'modalAddMovement')), 'the sheet closes after saving');
  const ui = await textoMovimiento(sb, 'PRUEBA-CRUD Abono Nuevo');
  p.ok(ui !== null, 'UI: a feed row shows the new concepto', { antesUI });
  if (ui) {
    p.ok(ui.importe.indexOf('+') === 0, 'UI: an ingreso renders with a leading +', { importe: ui.importe });
    p.ok(ui.importe.indexOf('1,500.00') >= 0, 'UI: the amount uses the es-PE thousands format', ui);
    p.equal(ui.fecha, '2026-08-15', 'UI: the date is rendered next to the concept');
  }
  p.equal(await sb.eval(`!!document.querySelector('#ledgerRowsMovimientos .empty-feed-placeholder')`), false,
    'UI: the empty-state placeholder is gone');

  const d = await disk(sb); const mo = await mem(sb);
  const enDisco = (d.meses[A].movimientos || []).find(x => x.concepto === 'PRUEBA-CRUD Abono Nuevo');
  const enMemoria = (mo.meses[A].movimientos || []).find(x => x.concepto === 'PRUEBA-CRUD Abono Nuevo');
  p.ok(!!enDisco, 'DISK: the movement is persisted');
  p.ok(!!enMemoria, 'MEMORY: the movement is in the store');
  if (enDisco) {
    p.equal(enDisco.monto, 1500, 'DISK: monto is a number');
    p.equal(enDisco.flujo, 'Ingreso', 'DISK: flujo persisted');
    p.equal(enDisco.fecha, '2026-08-15', 'DISK: fecha persisted');
    p.equal(enDisco.estado, 'Pagado', 'DISK: estado defaults to Pagado');
    p.equal(enDisco.categoria, 'Ingreso', 'DISK: categoria is derived from flujo');
    p.equal(enMemoria.monto, 1500, 'MEMORY: monto matches DISK');
  }
  p.equal(await conteoMovimientos(sb), antesUI + 1, 'UI: exactly one feed row added');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one create');
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity on screen',
    { offenders: await erroresVisibles(sb) });
});

test('movement.create.gasto: the danger button and its minus sign', async (sb, p) => {
  await sb.eval(`document.getElementById('btnQuickActionExpense').click(); 1`);
  await sb.pump(1); await sleep(250);
  p.equal(await sb.eval(`document.getElementById('modalMovementTitle').textContent`), 'Registrar Gasto',
    'the title flips to Registrar Gasto');
  p.equal(await sb.eval(`document.getElementById('movFlujo').value`), 'Gasto',
    'the hidden flujo field carries Gasto');
  p.ok((await sb.eval(`document.getElementById('btnSubmitMovement').className`)).indexOf('btn-danger') >= 0,
    'the submit button switches to the danger variant');
  await escribirConTeclado(sb, '#movConcepto', 'PRUEBA-CRUD Gasto Nuevo');
  await escribirValor(sb, '#movMonto', '88.80');
  await escribirValor(sb, '#movFecha', '2026-08-20');
  await sb.eval(PULSAR_SUBMIT_DE('formAddMovement'));
  await sb.pump(2); await sleep(350);
  const ui = await textoMovimiento(sb, 'PRUEBA-CRUD Gasto Nuevo');
  p.ok(ui !== null, 'UI: the feed row renders', { ui });
  if (ui) p.ok(ui.importe.indexOf('-') === 0, 'UI: a gasto renders with a leading "-"', { importe: ui.importe });
  const mv = (await disk(sb)).meses[A].movimientos.find(x => x.concepto === 'PRUEBA-CRUD Gasto Nuevo');
  p.ok(!!mv, 'DISK: persisted');
  if (mv) {
    p.equal(mv.flujo, 'Gasto', 'DISK: flujo is Gasto');
    p.equal(mv.categoria, 'Gasto', 'DISK: categoria is Gasto');
  }
});

test('movement.edit: concepto, monto and fecha change; the merge keeps the hidden fields', async (sb, p) => {
  /* Start from the 0-movement fixture and create the row through the UI, so
   * this is a full create -> edit cycle from an empty month. */
  p.equal((await disk(sb)).meses[A].movimientos.length, 0, 'fixture precondition: 0 movements');
  const creado = await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-CRUD Abono Base', monto: 1000, fecha: '2026-08-10', flujo: 'Ingreso' });
  p.ok(!!creado, 'the movement to edit was created through the real UI', { creado });
  /* The create above is SETUP, not the step under test. Zero the counter so the
   * write assertion below measures only the edit. */
  await sb.resetWrites();
  const mv0 = (await disk(sb)).meses[A].movimientos[0];
  const { categoria: oc, retornable: orr, estado: oe, flujo: of } = mv0;

  const pulso = await sb.eval(PULSAR_EN_MOVIMIENTO(mv0.concepto, '.btn-edit-tx'));
  p.ok(pulso.ok, 'the feed edit button was clicked', pulso);
  await sb.pump(2); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalEditMovement'), 'UI: the edit-movement sheet opens');
  const pre = await sb.eval(`(() => ({
    concepto: document.getElementById('editMovementConcepto').value,
    monto: document.getElementById('editMovementMonto').value,
    fecha: document.getElementById('editMovementFecha').value,
    flujo: document.getElementById('editMovementFlujoReadonly').textContent,
    movId: document.getElementById('editMovementId').value,
    monthId: document.getElementById('editMovementMonthId').value,
  }))()`);
  p.equal(pre.concepto, mv0.concepto, 'the sheet is prefilled with the real concepto');
  p.equal(pre.flujo, of, 'the read-only flujo shows the real flujo');
  p.equal(pre.movId, mv0.id, 'the hidden id is the clicked movement');
  p.equal(pre.monthId, A, 'the hidden month id is the active month');

  await escribirConTeclado(sb, '#editMovementConcepto', 'PRUEBA-CRUD Abono EDITADO');
  await escribirValor(sb, '#editMovementMonto', '1999.49');
  await escribirValor(sb, '#editMovementFecha', '2026-08-22');
  await sb.eval(PULSAR_SUBMIT_DE('formEditMovement'));
  await sb.pump(2); await sleep(400);

  p.ok(!(await modalAbierto(sb, 'modalEditMovement')), 'the sheet closes after saving');
  const ui = await textoMovimiento(sb, 'PRUEBA-CRUD Abono EDITADO');
  p.ok(ui !== null, 'UI: the feed row shows the edited concepto', { ui });
  if (ui) {
    p.ok(ui.importe.indexOf('1,999.49') >= 0, 'UI: the amount re-rendered to the edited value', ui);
    p.equal(ui.fecha, '2026-08-22', 'UI: the date re-rendered to the edited value');
  }
  const d = await disk(sb); const mo = await mem(sb);
  const enDisco = buscarMov(mesDe(d, A), mv0.id);
  const enMemoria = buscarMov(mesDe(mo, A), mv0.id);
  p.ok(!!enDisco, 'DISK: the same id is still present (a patch, not a replace)');
  if (enDisco) {
    p.equal(enDisco.concepto, 'PRUEBA-CRUD Abono EDITADO', 'DISK: concepto changed');
    p.equal(enDisco.monto, 1999.49, 'DISK: monto changed and stayed numeric');
    p.equal(enDisco.fecha, '2026-08-22', 'DISK: fecha changed');
    p.equal(enDisco.flujo, of, 'DISK: flujo survived the merge');
    p.equal(enDisco.categoria, oc, 'DISK: categoria survived the merge');
    p.equal(enDisco.retornable, orr, 'DISK: retornable survived the merge');
    p.equal(enDisco.estado, oe, 'DISK: estado survived the merge');
  }
  p.ok(!!enMemoria && enMemoria.concepto === 'PRUEBA-CRUD Abono EDITADO', 'MEMORY: matches DISK');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one edit');
});

test('movement.edit.rejects-negative: blocked by min=0, nothing persisted', async (sb, p) => {
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-CRUD Negativo', monto: 42, fecha: '2026-08-11', flujo: 'Gasto' });
  await sb.resetWrites();          /* the create is setup, not the step under test */
  const mv0 = (await disk(sb)).meses[A].movimientos[0];
  const montoAntes = mv0.monto;
  await sb.eval(PULSAR_EN_MOVIMIENTO(mv0.concepto, '.btn-edit-tx'));
  await sb.pump(2); await sleep(250);
  await escribirValor(sb, '#editMovementMonto', '-5');
  const envio = await sb.eval(PULSAR_SUBMIT_DE('formEditMovement'));
  await sb.pump(2); await sleep(250);
  p.equal(envio.valido, false, 'HTML5 min=0 rejects monto = -5');
  p.ok(envio.invalidos.some(i => i.id === 'editMovementMonto' && i.flags.rangeUnderflow),
    'the offending field is #editMovementMonto with validity.rangeUnderflow', { invalidos: envio.invalidos });
  p.ok(await modalAbierto(sb, 'modalEditMovement'), 'the sheet stays open');
  p.equal(buscarMov(mesDe(await disk(sb), A), mv0.id).monto, montoAntes, 'DISK: monto unchanged');
  p.equal((await sb.writeCount()).writes, 0, 'nothing persisted');
});

test('movement.delete.cancel: the dialog names the movement and cancelling cancels', async (sb, p) => {
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-CRUD Cancelar', monto: 77, fecha: '2026-08-12', flujo: 'Gasto' });
  await sb.resetWrites();          /* the create is setup, not the step under test */
  const d0 = await disk(sb);
  const mv0 = d0.meses[A].movimientos[0];
  const antesUI = await conteoMovimientos(sb);
  ctx.dialogPolicy = 'cancel';
  const r = await pulsarConDialogos(sb, PULSAR_EN_MOVIMIENTO(mv0.concepto, '.btn-delete-tx'));
  p.ok(r.res && r.res.ok, 'the feed delete button was clicked', r.res || r.err);
  await sb.pump(2); await sleep(400);
  p.equal(r.dialogs.length, 1, 'exactly one confirm dialog was raised');
  if (r.dialogs[0]) {
    p.ok(/Eliminar movimiento/.test(r.dialogs[0].message), 'the message names the operation',
      { message: r.dialogs[0].message });
    p.ok(r.dialogs[0].message.indexOf(mv0.concepto) >= 0, 'the message carries the real concepto');
    p.equal(r.dialogs[0].accepted, false, 'the harness answered "Cancel"');
  }
  p.ok(!!buscarMov(mesDe(await disk(sb), A), mv0.id), 'DISK: the movement survived');
  p.equal(await conteoMovimientos(sb), antesUI, 'UI: row count unchanged');
  p.equal((await sb.writeCount()).writes, 0, 'nothing persisted');
});

test('movement.delete.confirm: gone from UI, memory and disk', async (sb, p) => {
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-CRUD Borrar', monto: 88, fecha: '2026-08-13', flujo: 'Ingreso' });
  await sb.resetWrites();          /* the create is setup, not the step under test */
  const d0 = await disk(sb);
  const mv0 = d0.meses[A].movimientos[0];
  const antesUI = await conteoMovimientos(sb);
  ctx.dialogPolicy = 'accept';
  const r = await pulsarConDialogos(sb, PULSAR_EN_MOVIMIENTO(mv0.concepto, '.btn-delete-tx'));
  p.ok(r.res && r.res.ok, 'the feed delete button was clicked', r.res || r.err);
  await sb.pump(2); await sleep(400);
  p.equal(r.dialogs.length, 1, 'exactly one confirm dialog was raised');
  const d = await disk(sb); const mo = await mem(sb);
  p.ok(!buscarMov(mesDe(d, A), mv0.id), 'DISK: the movement is gone');
  p.ok(!buscarMov(mesDe(mo, A), mv0.id), 'MEMORY: the movement is gone');
  p.equal(await conteoMovimientos(sb), antesUI - 1, 'UI: one row fewer');
  p.equal(await textoMovimiento(sb, mv0.concepto), null, 'UI: the row is no longer rendered');
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one delete');
});

test('movement.toggle: toggleMovementStatus has no UI control', async (sb, p) => {
  /* Seed one movement through the UI first: an "absence" proof is only worth
   * anything if the thing that should be there would have been visible. */
  await crearMovimientoPorUI(sb,
    { concepto: 'PRUEBA-CRUD Toggle', monto: 55, fecha: '2026-08-14', flujo: 'Gasto' });
  const antes = (await disk(sb)).meses[A].movimientos.map(x => x.estado);
  const superficie = await sb.eval(`(() => {
    const filas = [...document.querySelectorAll('.transaction-feed-item')];
    return {
      filas: filas.length,
      hayStatusToggle: document.querySelectorAll('.transaction-feed-item .btn-status-toggle').length,
      botonesPorFila: filas.map(f => [...f.querySelectorAll('button')].map(b => ({
        clase: b.className, titulo: b.title || null }))),
    };
  })()`);
  p.note('store.js:694 toggleMovementStatus is implemented and has ZERO callers. The feed row '
    + '(app.js:732-783) renders exactly two buttons per movement - edit and delete - and no state control.');
  p.equal(superficie.hayStatusToggle, 0, 'PROVEN ABSENT: no status toggle exists in any feed row');
  p.ok(superficie.filas > 0, 'the fixture does render movement rows, so the absence is not vacuous',
    { filas: superficie.filas });
  p.ok(superficie.botonesPorFila.every(b => b.length === 2),
    'each feed row has exactly two controls (edit, delete) - nothing else', { botonesPorFila: superficie.botonesPorFila });
  p.equal(antes.length, superficie.filas, 'every movement has exactly one row');
  p.inconclusive('toggleMovementStatus cannot be exercised through the UI',
    'No control calls it. Observing it would require a direct store call, which this suite refuses '
    + 'to substitute for UI evidence. Consequence: a movement can be edited and deleted, but its '
    + 'Pagado/Pendiente state is write-only - nothing in the app ever displays or changes it.');
});

/* =====================================================================
 * T2c - MES (month)
 * ===================================================================== */

group('baseline', 'Mes: crear, duplicar, navegar, renombrar, borrar');

test('month.create.empty: a brand new month with nothing in it', async (sb, p) => {
  const antesPills = (await pillsDeMes(sb)).length;
  const antesOrden = (await disk(sb)).mesesOrden.length;

  await sb.eval(`document.getElementById('btnOpenNewMonthModal').click(); 1`);
  await sb.pump(1); await sleep(300);
  p.ok(await modalAbierto(sb, 'modalNewMonth'), 'the real "Nuevo mes" button opens the sheet');
  const opciones = await sb.eval(`[...document.getElementById('newMonthCloneSelect').options].map(o => o.value)`);
  p.ok(opciones.indexOf('') >= 0, 'the clone select offers a "do not clone" option', { opciones });
  p.equal(opciones.filter(v => v).length, antesOrden,
    'the clone select offers every existing month', { opciones });

  await escribirConTeclado(sb, '#newMonthName', 'PRUEBA-CRUD Gamma 2026');
  await sb.eval(ELEGIR_EN_SELECT('#newMonthCloneSelect', ''));
  await sb.eval(PULSAR_SUBMIT_DE('formNewMonth'));
  await sb.pump(2); await sleep(600);

  p.ok(!(await modalAbierto(sb, 'modalNewMonth')), 'the sheet closes after creating');
  const d = await disk(sb); const mo = await mem(sb);
  const nuevoId = d.mesesOrden.find(id => d.meses[id].nombre === 'PRUEBA-CRUD Gamma 2026');
  p.ok(!!nuevoId, 'DISK: a month with that nombre exists', { nuevoId, orden: d.mesesOrden });
  p.equal(d.mesesOrden.length, antesOrden + 1, 'DISK: mesesOrden grew by one');
  p.equal(mo.mesesOrden.length, antesOrden + 1, 'MEMORY: mesesOrden grew by one');
  if (nuevoId) {
    const m = d.meses[nuevoId];
    p.equal(todasListas(m).length, 0, 'DISK: the new month has zero expenses (nothing cloned)');
    p.equal((m.movimientos || []).length, 0, 'DISK: the new month has zero movements');
    p.equal(m.notas, '', 'DISK: notas start empty');
    p.equal(d.activeMonthId, nuevoId, 'DISK: the new month became the active one');
  }
  const pills = await pillsDeMes(sb);
  p.ok(pills.some(x => x.texto === 'PRUEBA-CRUD Gamma 2026'), 'UI: a month pill shows the new name', { pills });
  p.equal(pills.length, antesPills + 1, 'UI: one pill was added');
  p.equal(pills.filter(x => x.activa).length, 1, 'UI: exactly one pill is marked active');
  p.equal(await sb.eval(`document.getElementById('activeMonthHeaderBadge').textContent`),
    'PRUEBA-CRUD Gamma 2026', 'UI: the header badge shows the new month');
  p.equal((await sb.writeCount()).writes, 3,
    'three persisted writes: addNewMonth save, then switchView saves for activeMonthId and for currentView');
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity on the empty month',
    { offenders: await erroresVisibles(sb) });
});

test('month.create.clone: recurrent expenses copied, fresh ids, all reset to Pendiente', async (sb, p) => {
  const d0 = await disk(sb);
  const origen = mesDe(d0, A);
  /* Only fijos+variables are cloned (store.js:727-735). `extras` is deliberately
   * excluded, and index.html:823 documents that ("se copian los gastos fijos y
   * variables"). So the expected count is the recurrent items only. */
  const recurrentes = [
    ...origen.servicios.fijos, ...origen.servicios.variables,
    ...origen.personales.fijos, ...origen.personales.variables,
  ];
  const extrasOrigen = (origen.extras || []).length;
  const movsOrigen = (origen.movimientos || []).length;
  p.ok(extrasOrigen > 0, 'fixture precondition: the source has an extra, to prove it is NOT cloned',
    { extrasOrigen });
  p.ok(movsOrigen > 0, 'fixture precondition: the source has movements', { movsOrigen });

  await sb.eval(`document.getElementById('btnOpenNewMonthModal').click(); 1`);
  await sb.pump(1); await sleep(250);
  await escribirConTeclado(sb, '#newMonthName', 'PRUEBA-CRUD Delta 2026');
  p.equal((await sb.eval(ELEGIR_EN_SELECT('#newMonthCloneSelect', A))).ok, true,
    'the source month can be chosen in the clone select');
  await sb.eval(PULSAR_SUBMIT_DE('formNewMonth'));
  await sb.pump(2); await sleep(600);

  const d = await disk(sb);
  const nuevoId = d.mesesOrden.find(id => d.meses[id].nombre === 'PRUEBA-CRUD Delta 2026');
  p.ok(!!nuevoId, 'DISK: the clone exists', { nuevoId });
  if (!nuevoId) { p.inconclusive('clone contents', 'no new month was created, nothing to inspect'); return; }
  const clonado = mesDe(d, nuevoId);
  const items = todasListas(clonado);
  p.equal(items.length, recurrentes.length,
    `DISK: all ${recurrentes.length} fixed+variable expenses were copied`);
  p.equal((clonado.extras || []).length, 0,
    'DISK: extras were NOT cloned (store.js:736 hardcodes extras: []; index.html:823 documents it)');
  p.equal((clonado.movimientos || []).length, 0, 'DISK: movements were NOT cloned (store.js:738)');
  p.equal(clonado.notas, '', 'DISK: notas start empty');
  p.ok(items.every(i => i.estado === 'Pendiente'), 'DISK: every cloned item was reset to Pendiente',
    { estados: items.map(i => i.estado) });
  p.equal(items.filter(i => recurrentes.some(o => o.id === i.id)).length, 0,
    'DISK: no cloned item kept the source id (fresh generateId)');
  p.equal(JSON.stringify(items.map(i => i.monto).sort()),
    JSON.stringify(recurrentes.map(i => i.monto).sort()),
    'DISK: the amounts came across unchanged');
  p.equal(await conteoGastos(sb), items.length, 'UI: the cloned month renders every cloned row');
  p.ok((await erroresVisibles(sb)).length === 0, 'no NaN/undefined/Infinity after cloning',
    { offenders: await erroresVisibles(sb) });
  p.note('index.html:823 says the clone copies "los gastos fijos y variables marcados como pendientes", '
    + 'but store.js:727-735 copies ALL of them and then resets every estado to Pendiente. A month with '
    + 'an item already marked Pagado is cloned as Pendiente. That is the behaviour, and it is the '
    + 'sensible one - the hint is imprecise, not the code. Not a defect, a wording nit for T4.');
});

test('month.switch: clicking a pill moves the active month and re-renders', async (sb, p) => {
  p.equal((await disk(sb)).activeMonthId, A, 'precondition: we start on PRUEBA-ALFA');
  const pulso = await sb.eval(`(() => {
    const pills = [...document.querySelectorAll('.month-pill-btn')];
    const p = pills.find(x => x.textContent.trim() === 'PRUEBA-BETA 2026');
    if (!p) return { ok: false, pills: pills.map(x => x.textContent.trim()) };
    p.click();
    return { ok: true };
  })()`);
  p.ok(pulso.ok, 'UI: the PRUEBA-BETA 2026 pill was clicked', pulso);
  await sb.pump(2); await sleep(500);
  const d = await disk(sb);
  const esperado = mesDe(d, B);
  const subtotalServicios = [...esperado.servicios.fijos, ...esperado.servicios.variables]
    .reduce((s, i) => s + (Number(i.monto) || 0), 0);
  p.equal(d.activeMonthId, B, 'DISK: activeMonthId changed');
  p.equal(await sb.eval(`document.getElementById('activeMonthHeaderBadge').textContent`),
    'PRUEBA-BETA 2026', 'UI: the header badge follows');
  const pills = await pillsDeMes(sb);
  p.equal(pills.filter(x => x.activa).length, 1, 'UI: exactly one pill is active');
  p.equal(pills.find(x => x.activa).texto, 'PRUEBA-BETA 2026', 'UI: the right pill is the active one');
  p.equal(pills.find(x => x.activa).ariaPressed, 'true',
    'UI: the active pill also announces aria-pressed=true (the pill is a real toggle)');
  p.equal(await sb.eval(`document.getElementById('summaryTagServicios').textContent`),
    'S/ ' + subtotalServicios.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    'UI: the subtotals were recomputed for the newly active month',
    { esperado: subtotalServicios });
  p.equal(await sb.eval(`document.getElementById('summaryTagMovimientos').textContent`),
    '0 movs', 'UI: the movement count tag reflects the empty month we switched to');
  p.equal((await sb.writeCount()).writes, 2, 'two persisted writes (switchView saves twice)');
});

test('month.nav.boundaries: prev on the first month and next on the last are inert', async (sb, p) => {
  const antes = (await disk(sb)).activeMonthId;
  await sb.eval(`document.getElementById('btnPrevMonth').click(); 1`);
  await sb.pump(2); await sleep(400);
  p.equal((await disk(sb)).activeMonthId, antes,
    'DISK: prev on the first month does not move the active month');
  p.equal(await sb.eval(`document.getElementById('neoToast').className.indexOf('show') >= 0`), true,
    'UI: a toast explains that this is the first month',
    { toast: await sb.eval(`document.getElementById('toastText').textContent`) });
  p.equal((await sb.writeCount()).writes, 0, 'the boundary click persists nothing');

  await sb.eval(`document.getElementById('btnNextMonth').click(); 1`);
  await sb.pump(2); await sleep(400);
  p.equal((await disk(sb)).activeMonthId, B, 'next moves from ALFA to BETA');
  await sb.eval(`document.getElementById('btnNextMonth').click(); 1`);
  await sb.pump(2); await sleep(400);
  p.equal((await disk(sb)).activeMonthId, B, 'DISK: next on the last month does not move');
  p.ok((await sb.writeCount()).writes >= 1, 'the one real move persisted', { writes: (await sb.writeCount()).writes });
});

test('month.rename: there is no rename control anywhere in the UI', async (sb, p) => {
  const antes = await disk(sb);
  const superficie = await sb.eval(`(() => {
    const controles = [...document.querySelectorAll('button, a[href], input, [contenteditable=true]')];
    const sospechosos = controles.filter(el => {
      const t = ((el.textContent || '') + ' ' + (el.title || '') + ' ' +
                 (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
      return /renombr|editar periodo|editar mes|cambiar nombre/.test(t);
    }).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
                    texto: (el.textContent || '').trim().slice(0, 40), title: el.title || null }));
    const pills = [...document.querySelectorAll('.month-pill-btn')];
    return { totalControles: controles.length, sospechosos, pills: pills.length,
             pillsEditable: pills.filter(m => m.isContentEditable).length };
  })()`);
  p.note('Neither js/store.js nor js/app.js has a renameMonth method. addNewMonth derives the id from '
    + 'the nombre, and nothing rewrites an existing nombre afterwards.');
  p.equal(superficie.sospechosos.length, 0,
    'PROVEN ABSENT: no control anywhere is labelled as renaming a month', superficie);
  p.equal(superficie.pillsEditable, 0, 'PROVEN ABSENT: month pills are not contenteditable');
  p.equal(antes.meses[B].nombre, 'PRUEBA-BETA 2026', 'DISK: the nombre is unchanged');
  p.inconclusive('month rename cannot be exercised through the UI',
    'The capability does not exist at all: no store method, no control, no contenteditable node. '
    + 'There is nothing to click, so a rename test would be a test of nothing.');
});

test('month.delete: deleteMonth has no UI control and its guard alert is unreachable', async (sb, p) => {
  const antes = await disk(sb);
  const superficie = await sb.eval(`(() => {
    const controles = [...document.querySelectorAll('button, a[href], [role=button]')];
    const sospechosos = controles.filter(el => {
      const t = ((el.textContent || '') + ' ' + (el.title || '') + ' ' +
                 (el.getAttribute('aria-label') || '')).toLowerCase();
      return /eliminar mes|borrar mes|eliminar periodo|borrar periodo|quitar mes/.test(t);
    }).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
                    texto: (el.textContent || '').trim().slice(0, 40) }));
    return { totalControles: controles.length, sospechosos,
             pillsConBorrar: document.querySelectorAll('.month-pill-btn button, .month-pill-btn .btn-danger').length };
  })()`);
  p.note('store.js:759 deleteMonth exists and has ZERO callers. Its guard '
    + 'alert("Debes mantener al menos un mes en el sistema.") can therefore never be shown.');
  p.equal(superficie.sospechosos.length, 0,
    'PROVEN ABSENT: no control anywhere is labelled as deleting a month', superficie);
  p.equal(superficie.pillsConBorrar, 0, 'PROVEN ABSENT: the month pills contain no nested button');
  p.equal(antes.mesesOrden.length, 2, 'DISK: the month list is unchanged');
  p.inconclusive('month delete cannot be exercised through the UI',
    'No control calls deleteMonth. Exercising it would require a direct store call, which this suite '
    + 'refuses to substitute for UI evidence. Product consequence: the app lets you create periods '
    + 'forever and never remove one, and the "keep at least one month" guard is untestable dead code.');
});

/* =====================================================================
 * T2d - MODAL PATHS and NOTES
 * ===================================================================== */

group('baseline', 'Modales: cancelar, Escape, overlay. Notas: autoguardado.');

test('modal.cancel-button: closes the sheet and leaves the data untouched', async (sb, p) => {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await escribirConTeclado(sb, '#budgetConcepto', 'PRUEBA-CRUD NO DEBE GUARDARSE');
  await escribirValor(sb, '#budgetMonto', '999.99');
  const cancel = await sb.eval(`(() => {
    const b = document.querySelector('#modalAddBudget button.btn-close-sheet-btn');
    if (!b) return { ok: false, motivo: 'no hay boton btn-close-sheet-btn' };
    b.click();
    return { ok: true, texto: b.textContent };
  })()`);
  p.ok(cancel.ok, 'the real Cancel button was clicked', cancel);
  await sb.pump(2); await sleep(400);
  p.ok(!(await modalAbierto(sb, 'modalAddBudget')), 'the sheet closed');
  const d = await disk(sb);
  p.equal(todasListas(mesDe(d, A)).some(i => i.concepto === 'PRUEBA-CRUD NO DEBE GUARDARSE'), false,
    'DISK: the typed expense was NOT persisted');
  p.equal(JSON.stringify(d), antesDisco, 'DISK: the whole persisted document is byte-identical');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

test('modal.escape: a REAL Escape key press closes the sheet and persists nothing', async (sb, p) => {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await escribirConTeclado(sb, '#budgetConcepto', 'PRUEBA-CRUD ESC NO DEBE GUARDARSE');
  await escribirValor(sb, '#budgetMonto', '888.88');
  p.ok(await modalAbierto(sb, 'modalAddBudget'), 'precondition: the sheet is open');
  await pulsarEscape(sb);
  const despues = await sb.eval(MODALES_ACTIVOS);
  p.ok(despues.indexOf('modalAddBudget') < 0,
    'OBSERVED: the real CDP Escape key event closed the sheet', { modales: despues });
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: the persisted document is byte-identical');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

test('modal.overlay-click: a REAL mouse click on the backdrop closes the sheet', async (sb, p) => {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnHeaderAddBudget').click(); 1`);
  await sleep(200);
  await escribirConTeclado(sb, '#budgetConcepto', 'PRUEBA-CRUD OVERLAY NO DEBE GUARDARSE');
  await escribirValor(sb, '#budgetMonto', '777.77');
  const hit = await clicEnOverlay(sb, 'modalAddBudget');
  p.ok(hit.ok, 'found a viewport point where elementFromPoint IS the overlay, outside the sheet', hit);
  if (hit.ok) {
    p.equal(hit.hitId, 'modalAddBudget', 'the real click target was the modal overlay itself', hit);
    p.ok(!(await modalAbierto(sb, 'modalAddBudget')), 'OBSERVED: the backdrop click closed the sheet');
  }
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: the persisted document is byte-identical');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

test('modal.edit-cancel: cancelling an edit discards the typed changes', async (sb, p) => {
  const ITEM = 'i-prueba-alfa-2026-sf1';
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-edit-expense'));
  await sb.pump(2); await sleep(300);
  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRUD EDIT CANCELADA');
  await escribirValor(sb, '#editExpenseMonto', '4321.00');
  const clicked = await sb.eval(`(() => {
    const b = document.querySelector('#modalEditExpense button.btn-close-sheet-btn');
    if (!b) return 0; b.click(); return 1;
  })()`);
  p.equal(clicked, 1, 'the real Cancel button of the edit sheet was clicked');
  await sb.pump(2); await sleep(350);
  p.ok(!(await modalAbierto(sb, 'modalEditExpense')), 'the edit sheet closed');
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: byte-identical, the edit was discarded');
  p.ok((await textoFilaGasto(sb, 'PRUEBA-ALFA Internet')) !== null,
    'UI: the row still shows the ORIGINAL concepto');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

test('modal.close-button-x: the header X also discards an in-progress edit', async (sb, p) => {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(PULSAR_EN_GASTO('PRUEBA-ALFA Internet', '.btn-edit-expense'));
  await sb.pump(2); await sleep(300);
  await escribirConTeclado(sb, '#editExpenseConcepto', 'PRUEBA-CRUD X CANCELADA');
  const clicked = await sb.eval(`(() => {
    const b = document.querySelector('#modalEditExpense .btn-close-sheet');
    if (!b) return 0; b.click(); return 1;
  })()`);
  p.equal(clicked, 1, 'the header X of the edit sheet was clicked');
  await sb.pump(2); await sleep(300);
  p.ok(!(await modalAbierto(sb, 'modalEditExpense')), 'the sheet closed');
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: byte-identical');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

test('modal.role-picker-is-not-escapable: cannot be exercised in this harness', async (sb, p) => {
  /* Recorded honestly rather than faked. openRoleSelectModal() is a closure
   * inside the DOMContentLoaded listener and is not reachable from the page; in
   * this sandbox the picker never opens naturally, because the harness pre-seeds
   * the tab's role choice AND the stub session resolves as admin before the 60 ms
   * timer fires. Forcing it open by hand would test the harness, not the product.
   * What IS observable from outside is the shape the ESC handler depends on. */
  const nodo = await sb.eval(`(() => {
    const m = document.getElementById('modalSessionRoleSelect');
    if (!m) return { existe: false };
    return { existe: true, clases: m.className, tieneSheet: !!m.querySelector('.modal-sheet'),
             esModalOverlay: m.classList.contains('modal-overlay'),
             abierto: m.classList.contains('active') };
  })()`);
  p.ok(nodo.existe, 'the role picker node exists in the document', nodo);
  p.ok(nodo.esModalOverlay, 'it carries .modal-overlay, the exact class app.js:1633 filters on');
  p.equal(nodo.abierto, false, 'it is not open during a normal admin session, as expected');
  p.equal((await sb.writeCount()).writes, 0, 'reading the DOM changed nothing');
  p.inconclusive('Escape-on-role-picker cannot be exercised end to end',
    'openRoleSelectModal() is a closure inside the DOMContentLoaded listener, not reachable from the '
    + 'page, and in this sandbox the picker never opens naturally (the role choice is pre-seeded and '
    + 'the stub session resolves admin first). Driving it would mean re-implementing the modal, which '
    + 'would test the harness instead of the product.');
});

test('notes.autosave: typing in the notes sheet persists after the debounce', async (sb, p) => {
  const NUEVO = 'PRUEBA-CRUD notas con acentos: ñ á é í óú — 2026';
  await sb.eval(`document.getElementById('btnOpenNotesModal').click(); 1`);
  await sb.pump(1); await sleep(350);
  p.ok(await modalAbierto(sb, 'modalMonthNotes'), 'the real notes button opens the sheet');
  p.equal(await sb.eval(`document.getElementById('monthNotesTextarea').value`),
    'PRUEBA-ALFA notas de prueba', 'the textarea is prefilled with the stored notas');
  p.equal(await sb.eval(`document.getElementById('modalNotesSubtitle').textContent`),
    'Recordatorios y observaciones de PRUEBA-ALFA 2026', 'the subtitle names the active month');

  await escribirConTeclado(sb, '#monthNotesTextarea', NUEVO);
  p.ok((await sb.eval(`document.getElementById('notesFeedback').textContent`)).indexOf('Guardando') >= 0,
    'UI: the feedback label shows the debounced save in flight',
    { feedback: await sb.eval(`document.getElementById('notesFeedback').textContent`) });
  p.equal((await disk(sb)).meses[A].notas, 'PRUEBA-ALFA notas de prueba',
    'DISK: not persisted yet - the save is debounced, not immediate');

  await sleep(1000);
  const d = await disk(sb); const mo = await mem(sb);
  p.equal(d.meses[A].notas, NUEVO, 'DISK: the notes were persisted after ~400 ms, accents intact');
  p.equal(mo.meses[A].notas, NUEVO, 'MEMORY: the notes are in the store');
  p.ok((await sb.eval(`document.getElementById('notesFeedback').textContent`)).indexOf('Guardado') >= 0,
    'UI: the feedback label confirms the save',
    { feedback: await sb.eval(`document.getElementById('notesFeedback').textContent`) });
  p.equal((await sb.writeCount()).writes, 1, 'exactly one persisted write for one debounced save');
  p.equal(await sb.eval(`document.getElementById('btnOpenNotesModal').className.indexOf('has-notes') >= 0`), true,
    'UI: the notes button keeps its has-notes marker');
});

test('notes.close-without-typing: opening and closing the sheet is inert', async (sb, p) => {
  const antesDisco = JSON.stringify(await disk(sb));
  await sb.eval(`document.getElementById('btnOpenNotesModal').click(); 1`);
  await sb.pump(1); await sleep(300);
  await sb.eval(`(() => { const b = document.querySelector('#modalMonthNotes button.btn-close-sheet-btn'); b.click(); return 1 })()`);
  await sb.pump(2); await sleep(700);
  p.ok(!(await modalAbierto(sb, 'modalMonthNotes')), 'the sheet closed');
  p.equal(JSON.stringify(await disk(sb)), antesDisco, 'DISK: byte-identical, open+close writes nothing');
  p.equal((await sb.writeCount()).writes, 0, 'no write at all');
});

/* =====================================================================
 * EXECUTION
 * ===================================================================== */

async function ejecutar() {
  const solo = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
  const resultados = [];
  const red = [];
  let fallosInfra = 0;

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
        a.adminButtonsVisible + '/' + a.adminButtonsTotal + ', label=' + JSON.stringify(a.authModeLabel));
    } catch (e) {
      console.error('  !! NOT ADMIN, every result in this group would be meaningless: ' + e.message);
      fallosInfra++;
      const cierre = await sb.close();
      for (const t of g.tests) {
        resultados.push({ group: g.title, name: t.name, verdict: 'INCONCLUSIVE', fixture: g.fixture,
          observation: 'the admin gate failed, so no edit control was reachable: ' + e.message,
          checks: [], gaps: [], notes: [], network: 'NOT RUN', profileDeleted: cierre.removed });
      }
      continue;
    }

    for (const t of g.tests) {
      const p = new Probe(t.name);
      let thrown = null;
      const netAntes = sb.requests.length;
      /* Fresh dialog budget per test, otherwise a dialog raised by the previous
       * test makes "no dialog was raised" assertions fail for the wrong reason. */
      ctx.dialogs.length = 0;
      ctx.dialogPolicy = 'accept';

      try {
        /* Re-navigate: the document-start injection re-seeds localStorage from
         * the fixture, so no test can inherit state from the previous one. */
        await sb.reload(9000);
        await sb.assertAdmin();
        await sb.pump(3);
        await sleep(900);          /* let store.load()'s async tail settle */
        await sb.markBootBaseline();
        await sb.pump(2);
        await sleep(500);

        await t.fn(sb, p);
      } catch (e) {
        thrown = e;
        p.gaps.push({ label: 'the test body threw', why: String(e && e.message || e) });
      }

      /* MANDATORY on EVERY test, pass or fail. */
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
  const reportPath = path.join(dir, 'crud-suite.report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    suite: 'crud-suite', generatedAt: new Date().toISOString(), storageKey: STORAGE_KEY,
    network: red, results: resultados,
  }, null, 2), 'utf8');

  console.log('\n' + '='.repeat(78));
  console.log('T2 crud-suite summary');
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
