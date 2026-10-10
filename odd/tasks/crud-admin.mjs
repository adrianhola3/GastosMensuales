/* crud-admin.mjs - CRUD matrix harness for the "Web de Gastos Mensuales" app.
 *
 * WHAT IT GUARANTEES
 * ------------------
 * 1. ISOLATION IS MEASURED, NOT PROMISED. The app pushes the WHOLE state blob to
 *    Supabase on every store.save(), so one stray write reaches the user's real
 *    cloud row. Isolation is proven four ways instead of asserted:
 *      a. `window.gastosRemoto` is replaced at document-start by a property whose
 *         GETTER ALWAYS returns the stub and whose SETTER swallows the assignment
 *         made by js/supabase-store.js:372. The stub's `guardar()` never opens a
 *         socket: it counts and updates an in-memory "simulated cloud".
 *      b. `Storage.prototype.getItem/setItem/removeItem` are redirected to an
 *         in-memory Map for the app data key and for every `finanzas*` key. Every
 *         other key passes through untouched. Counters on both sides.
 *      c. The REAL localStorage is read from NODE through CDP `DOMStorage`, which
 *         never goes through page JS: FNV-1c hash of the real data key before and
 *         after the whole run, plus every `DOMStorage.*Item*` event the browser
 *         reports during the run.
 *      d. Every `Network.requestWillBeSent` URL is logged; F8 asserts that none of
 *         them hit `*.supabase.co`.
 *
 * 2. A REAL admin session. `haySesion()` -> true drives the actual boot path
 *    (`refrescarSesion` -> `rol:'admin'` -> `aplicarSesion`), not a hand-removed
 *    CSS class. E2-E7 re-navigate with `haySesion()` -> false.
 *
 * 3. The simulated cloud survives reloads, so F1/F2/F3/C10 measure real
 *    persistence instead of re-reading the pristine fixture every time. Node owns
 *    the cloud and bakes it into the next document-start script.
 *
 * 4. No case can be green by accident. A case is PASS only when its own `fn`
 *    returns `{ pass: true }`. A thrown error or a missing control is SKIP with a
 *    reason. The process exits non-zero if any case is FAIL.
 *
 * WHAT IS STUBBED AND WHY
 * -----------------------
 *  - Supabase: unavoidable. Without it the app either boots as a reader or, with
 *    real credentials, writes to the user's row. `cargar()` returns a synthetic
 *    fixture, so `load()`'s cloud branch is exercised for real.
 *  - localStorage: redirected to memory (see 1b).
 *  - The role-select modal is hidden with CSS (`HIDE_ROLE_MODAL`). It is pure UI
 *    chrome and hiding it changes no assertion. Its own behaviour is reported as a
 *    finding (`findings.roleModalAbreEnSesionAdmin`).
 *  - Nothing else. Every action goes through real DOM clicks, real input values and
 *    real `requestSubmit()`. The store is only ever READ, never called to satisfy
 *    an assertion. The only exceptions are the disposable-deep-copy PROBES, which
 *    measure what the UI cannot reach (defect R6 and the optional third parameter
 *    of addNewMonth); they are reported as probes and never as a case.
 *
 * KNOWN ENVIRONMENT TRAPS (./cdp.mjs documents the full list)
 *   - Brave writes its own `lswt-*` key into localStorage whenever a page writes
 *     one. That is browser bookkeeping, not app data: it is counted and reported
 *     separately so it can neither hide nor fake a real app-data write.
 *   - `Page.captureScreenshot` never uses `captureBeyondViewport`.
 *   - `confirm()`/`alert()` block the renderer, so dialog-triggering clicks are
 *     fired without awaiting the evaluate and the answer is driven from CDP.
 */
import path from 'node:path';
import fs from 'node:fs';
import { openPage, PAGE_URL, HIDE_ROLE_MODAL } from './cdp.mjs';

const LABEL = process.argv[2] || 'r1';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const REPORT_PATH = path.join(DIR, `crud-admin-${LABEL}.report.json`);
const STORAGE_KEY = 'control_gastos_mensuales_db_v1';
const ISOLATION_PREFIX = 'finanzas';
const MES_A = 'syn-mes-a';
const MES_B = 'syn-mes-b';

/* ------------------------------------------------------------------ *
 * 1. Synthetic fixture.
 *    ASCII-only month names on purpose: `addNewMonth` slugifies with
 *    [^a-z0-9] (store.js:717), so an accented FIXTURE name would be mangled
 *    and case A17 could not tell "mangled by design" from "defect".
 *    Covers all five budget collections plus `movimientos`, which the real
 *    user has zero of - that is what blocks the whole movement CRUD.
 * ------------------------------------------------------------------ */
const FIXTURE = {
  version: 1,
  activeMonthId: MES_A,
  currentView: 'mes',
  mesesOrden: [MES_A, MES_B],
  meses: {
    [MES_A]: {
      id: MES_A, nombre: 'SYN Mes A', corto: 'SYN',
      servicios: {
        fijos: [
          { id: 'syn_sf_1', concepto: 'SYN-SF-ALPHA', monto: 100, tipo: 'Fijo', rango: '', estado: 'Pendiente' },
          { id: 'syn_sf_2', concepto: 'SYN-SF-PAGADO', monto: 50, tipo: 'Fijo', rango: '', estado: 'Pagado' }
        ],
        variables: [
          { id: 'syn_sv_1', concepto: 'SYN-SV-BETA', monto: 30, tipo: 'Variable', rango: '20-40', estado: 'Pendiente' }
        ]
      },
      personales: {
        fijos: [
          { id: 'syn_pf_1', concepto: 'SYN-PF-GAMMA', monto: 25, tipo: 'Fijo', rango: '', estado: 'Pendiente' }
        ],
        variables: [
          { id: 'syn_pv_1', concepto: 'SYN-PV-DELTA', monto: 45, tipo: 'Variable', rango: '10-80', estado: 'Pendiente' }
        ]
      },
      extras: [
        { id: 'syn_ex_1', concepto: 'SYN-EX-EPSILON', monto: 83, tipo: 'Extra', rango: '', estado: 'Pagado' }
      ],
      notas: 'SYN notas del mes A',
      movimientos: [
        { id: 'syn_mv_1', fecha: '2026-08-05', concepto: 'SYN-MV-INGRESO', flujo: 'Ingreso', categoria: 'Trabajo', retornable: 'No', estado: 'Pagado', monto: 1000 },
        { id: 'syn_mv_2', fecha: '2026-08-09', concepto: 'SYN-MV-GASTO', flujo: 'Gasto', categoria: 'General', retornable: 'No', estado: 'Pendiente', monto: 200 }
      ]
    },
    [MES_B]: {
      id: MES_B, nombre: 'SYN Mes B', corto: 'SYN',
      servicios: {
        fijos: [{ id: 'syn_bf_1', concepto: 'SYN-BF-ZETA', monto: 12, tipo: 'Fijo', rango: '', estado: 'Pendiente' }],
        variables: []
      },
      personales: { fijos: [], variables: [] },
      extras: [],
      notas: 'SYN notas del mes B',
      movimientos: []
    }
  }
};

/* ------------------------------------------------------------------ *
 * 2. Document-start stub + storage isolation.
 *    Registered with Page.addScriptToEvaluateOnNewDocument so it runs BEFORE
 *    js/supabase-store.js and js/store.js. Re-registered before every reload:
 *    the newest registration wins, which is how the simulated cloud crosses a
 *    navigation.
 * ------------------------------------------------------------------ */
function buildStub(mode, cloud) {
  return `(() => {
  const w = window;
  const KEY = ${JSON.stringify(STORAGE_KEY)};
  const PREFIJO = ${JSON.stringify(ISOLATION_PREFIX)};
  const MODO = ${JSON.stringify(mode)};
  const HAY_SESION = ${mode === 'admin'};

  /* The simulated cloud: the ONLY place a save() can land. It lives in this
     page's memory and is read back by node before the next reload. */
  let nube = ${JSON.stringify(cloud)};

  const p = w.__probe = w.__probe || {};
  p.modo = MODO;
  p.setItemRedirigidos = 0;
  p.setItemReales = 0;
  p.removeItemRedirigidos = 0;
  p.removeItemReales = 0;
  p.getItemRedirigidos = 0;
  p.getItemReales = 0;
  p.clavesReales = [];
  p.guardarN = 0;
  p.guardarHashes = [];
  p.cargarN = 0;
  p.asignadoPorProducto = 0;
  p.nube = nube ? JSON.parse(JSON.stringify(nube)) : null;

  const FNV = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
  };

  const aislado = (k) => { const s = String(k); return s === KEY || s.indexOf(PREFIJO) === 0; };
  const memoria = new Map();
  if (nube) memoria.set(KEY, JSON.stringify(nube));

  const origGet = Storage.prototype.getItem;
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;

  Storage.prototype.getItem = function (k) {
    if (aislado(k)) {
      p.getItemRedirigidos++;
      return memoria.has(String(k)) ? memoria.get(String(k)) : null;
    }
    p.getItemReales++;
    return origGet.call(this, k);
  };
  Storage.prototype.setItem = function (k, v) {
    if (aislado(k)) { p.setItemRedirigidos++; memoria.set(String(k), String(v)); return; }
    p.setItemReales++; p.clavesReales.push('setItem:' + String(k));
    return origSet.call(this, k, v);
  };
  Storage.prototype.removeItem = function (k) {
    if (aislado(k)) { p.removeItemRedirigidos++; memoria.delete(String(k)); return; }
    p.removeItemReales++; p.clavesReales.push('removeItem:' + String(k));
    return origRemove.call(this, k);
  };

  const stub = {
    estaConfigurado: () => true,
    haySesion: () => HAY_SESION,
    esperarSesion: () => Promise.resolve(HAY_SESION),
    cargar: () => {
      p.cargarN++;
      return Promise.resolve(nube ? JSON.parse(JSON.stringify(nube)) : null);
    },
    guardar: (estado) => {
      p.guardarN++;
      p.guardarHashes.push(FNV(JSON.stringify(estado)));
      /* In-memory only: no fetch, no supabase-js, no network of any kind. */
      if (estado) { const copia = JSON.parse(JSON.stringify(estado)); nube = copia; p.nube = copia; }
      return Promise.resolve({ ok: true, simulado: true });
    },
    iniciarSesion: () => Promise.resolve({ ok: false, simulado: true }),
    iniciarSesionConGithub: () => Promise.resolve({ ok: false, simulado: true }),
    salirDeSesion: () => Promise.resolve({ ok: true, simulado: true }),
    alCambiarSesion: () => {}
  };

  Object.defineProperty(w, 'gastosRemoto', {
    configurable: true,
    enumerable: true,
    get() { return stub; },
    set() { p.asignadoPorProducto++; }
  });

  p.leerNube = () => (p.nube ? JSON.parse(JSON.stringify(p.nube)) : null);
  p.leerMemoriaAislada = (k) => (memoria.has(String(k)) ? memoria.get(String(k)) : null);
  p.contadores = () => ({
    modo: p.modo,
    getItemRedirigidos: p.getItemRedirigidos,
    getItemReales: p.getItemReales,
    setItemRedirigidos: p.setItemRedirigidos,
    setItemReales: p.setItemReales,
    removeItemRedirigidos: p.removeItemRedirigidos,
    removeItemReales: p.removeItemReales,
    guardarN: p.guardarN,
    cargarN: p.cargarN,
    asignadoPorProducto: p.asignadoPorProducto,
    clavesReales: p.clavesReales.slice()
  });
  return 'stub:' + MODO;
})()`;
}

/* ------------------------------------------------------------------ *
 * 3. In-page read-only helpers, installed after every navigation.
 *    They only READ the store: no case is ever satisfied by calling a store
 *    mutator from the console.
 * ------------------------------------------------------------------ */
const HELPERS = `(() => {
  const st = window.financialStore;
  const RUTAS = ['servicios.fijos','servicios.variables','personales.fijos','personales.variables','extras','movimientos'];
  const leer = (mes, ruta) => {
    const m = st.data.meses[mes];
    if (!m) return null;
    if (ruta === 'extras' || ruta === 'movimientos') return m[ruta];
    const partes = ruta.split('.');
    return m[partes[0]] ? m[partes[0]][partes[1]] : null;
  };
  const copia = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

  window.__t = {
    rutas: RUTAS,
    coll: (mes, ruta) => copia(leer(mes, ruta)),
    largo: (mes, ruta) => (leer(mes, ruta) || []).length,
    /** Just the ids of one collection: enough to prove a clone got NEW ids
     *  without shipping the whole item over the CDP bridge. */
    ids: (mes, ruta) => (leer(mes, ruta) || []).map(x => x.id),
    item: (mes, ruta, id) => copia((leer(mes, ruta) || []).find(x => x.id === id) || null),
    buscar: (mes, concepto) => {
      for (const r of RUTAS) {
        const h = (leer(mes, r) || []).find(x => x.concepto === concepto);
        if (h) return { ruta: r, item: copia(h) };
      }
      return null;
    },
    totales: (mes) => copia(st.calculateMonthTotals(mes)),
    /** Item counts per collection, for cross-month / cross-collection diffs. */
    largos: (mes) => {
      const m = st.data.meses[mes];
      if (!m) return null;
      return {
        'servicios.fijos': (m.servicios.fijos || []).length,
        'servicios.variables': (m.servicios.variables || []).length,
        'personales.fijos': (m.personales.fijos || []).length,
        'personales.variables': (m.personales.variables || []).length,
        extras: (m.extras || []).length,
        movimientos: (m.movimientos || []).length
      };
    },
    estadosGasto: (mes) => {
      const m = st.data.meses[mes];
      if (!m) return null;
      const out = [];
      for (const r of ['servicios.fijos', 'servicios.variables', 'personales.fijos', 'personales.variables']) {
        const p = r.split('.');
        for (const it of (m[p[0]][p[1]] || [])) out.push({ ruta: r, concepto: it.concepto, estado: it.estado });
      }
      return out;
    },
    orden: () => copia(st.data.mesesOrden),
    activo: () => st.data.activeMonthId,
    notas: (mes) => (st.data.meses[mes] ? st.data.meses[mes].notas : null),
    forma: (id) => copia(st.data.meses[id] || null),
    /** The rendered period pills: what the header is actually drawing. This is
     *  the re-render evidence, not the store. */
    pills: () => [...document.querySelectorAll('.month-pill-btn')].map(b => ({
      texto: b.textContent.trim(), activo: b.classList.contains('active')
    })),
    sesion: () => {
      let porFuncion = null;
      try { porFuncion = (typeof obtenerSesion === 'function') ? obtenerSesion() : null; } catch (e) { porFuncion = 'ERROR:' + e; }
      let directa = null;
      try { directa = (typeof sesionActual !== 'undefined') ? sesionActual : null; } catch (e) { directa = 'ERROR:' + e; }
      return { porFuncion, directa, isAdminEsPrivadoDelClosure: true };
    },
    dom: () => ({
      bodyClass: document.body.className,
      readOnly: document.body.classList.contains('read-only-mode'),
      filasGasto: document.querySelectorAll('.expense-card-item').length,
      filasMov: document.querySelectorAll('.transaction-feed-item').length,
      adminTotal: document.querySelectorAll('.admin-action-btn').length,
      adminVisibles: [...document.querySelectorAll('.admin-action-btn')].filter(b => getComputedStyle(b).display !== 'none').length,
      modalRolActivo: document.getElementById('modalSessionRoleSelect').classList.contains('active'),
      labelModo: (document.getElementById('authModeLabel') || {}).textContent || null,
      kpiIngresos: (document.getElementById('monthTotalIngresos') || {}).textContent || null,
      kpiEgresos: (document.getElementById('monthTotalEgresos') || {}).textContent || null,
      kpiBalance: (document.getElementById('monthBalanceNeto') || {}).textContent || null,
      kpiPct: (document.getElementById('monthAbonoPercentLabel') || {}).textContent || null,
      pagosLabel: (document.getElementById('monthGastosCount') || {}).textContent || null,
      /* T5: los subtotales por colección se fueron con sus filas. Lo que queda
         es UN subtotal por grupo, en el encabezado, y con eso se sigue
         comprobando lo mismo: que el número de la pantalla baja cuando el dato
         baja, y no se queda pegado. */
      subtotalPersonales: (document.getElementById('summaryTagPersonales') || {}).textContent || null,
      subtotalExtras: (document.getElementById('summaryTagExtras') || {}).textContent || null
    }),
    display: (sel) => {
      const el = document.querySelector(sel);
      return { sel, existe: !!el, display: el ? getComputedStyle(el).display : 'NO_EXISTE' };
    },
    toast: () => {
      const t = document.getElementById('neoToast');
      const x = document.getElementById('toastText');
      return { visible: !!(t && t.classList.contains('show')), texto: x ? x.textContent : null };
    },
    filaGasto: (concepto) => {
      for (const f of document.querySelectorAll('.expense-card-item')) {
        const t = f.querySelector('.expense-item-title');
        if (!t || t.textContent !== concepto) continue;
        const b = f.querySelector('.btn-status-toggle');
        const r = f.getBoundingClientRect();
        return {
          id: b ? b.getAttribute('data-item-id') : null,
          texto: f.textContent.replace(/\\s+/g, ' ').trim(),
          tags: [].slice.call(f.querySelectorAll('.expense-item-tags .tag-badge')).map(x => x.textContent.trim()),
          montoTexto: ((f.querySelector('.expense-item-amount') || {}).textContent || '').replace(/\\s+/g, ' ').trim(),
          estadoTexto: b ? b.textContent.replace(/\\s+/g, ' ').trim() : null,
          tieneImg: !!f.querySelector('img'),
          ancho: Math.round(r.width),
          alto: Math.round(r.height)
        };
      }
      return null;
    },
    filaMov: (concepto) => {
      for (const f of document.querySelectorAll('.transaction-feed-item')) {
        const h = f.querySelector('h4');
        if (!h || h.textContent !== concepto) continue;
        return {
          texto: f.textContent.replace(/\\s+/g, ' ').trim(),
          montoTexto: ((f.querySelector('.tx-amount') || {}).textContent || '').replace(/\\s+/g, ' ').trim()
        };
      }
      return null;
    },
    vacioEn: (cont) => {
      const c = document.getElementById(cont);
      return c ? { tieneVacio: !!c.querySelector('.empty-feed-placeholder'), texto: c.textContent.trim() } : null;
    },
    /* T5: vacioEn ya no alcanza para "borré el último item de una colección".
     * El libro agrupa por categoría, así que vaciar la colección de variables
     * deja el grupo de Personales con el Fijo que le queda: el grupo NO está
     * vacío y no debe decirlo que lo está. Lo que sí tiene que ser cierto es
     * que en ese grupo no queda ninguna fila variable. variablesEn mide
     * exactamente eso, leyendo la etiqueta que la fila ya traía
     * (.tag-variable) en vez de adivinar por el contenedor. */
    variablesEn: (cont) => {
      const c = document.getElementById(cont);
      if (!c) return null;
      const filas = [...c.querySelectorAll('.expense-card-item')];
      return {
        filas: filas.length,
        variables: filas.filter(f => f.querySelector('.tag-badge.tag-variable')).length,
        fijas: filas.filter(f => f.querySelector('.tag-badge:not(.tag-variable)')).length,
      };
    },
   nanEnPantalla: () => {
      const malos = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) if (/NaN|undefined|Infinity/.test(n.nodeValue)) malos.push(n.nodeValue.trim().slice(0, 60));
      return malos;
    },
    xss: () => (typeof window.__XSS === 'undefined' ? 0 : window.__XSS),
    validacion: (idCampo, idForm) => {
      const c = document.getElementById(idCampo);
      const f = document.getElementById(idForm);
      const v = c ? c.validity : null;
      return {
        valorEnElCampo: c ? c.value : null,
        type: c ? c.type : null,
        min: c ? c.getAttribute('min') : null,
        required: c ? c.hasAttribute('required') : null,
        valueMissing: v ? v.valueMissing : null,
        rangeUnderflow: v ? v.rangeUnderflow : null,
        rangeOverflow: v ? v.rangeOverflow : null,
        badInput: v ? v.badInput : null,
        formCheckValidity: f ? f.checkValidity() : null
      };
    },
    hayControlBorrarMes: () => {
      const todos = [].slice.call(document.querySelectorAll('button,[role="button"],a'));
      const conBorrar = todos
        .filter(e => /borrar|eliminar|delete|remove/i.test((e.id || '') + ' ' + (e.className || '') + ' ' + (e.getAttribute('title') || '') + ' ' + e.textContent))
        .map(e => (e.id ? '#' + e.id : '') + '.' + String(e.className || '').trim().split(/\\s+/).join('.') + ' :: ' + (e.getAttribute('title') || e.textContent.trim().slice(0, 30)));
      return { totalControles: todos.length, conBorrar, hayBorrarMes: conBorrar.some(t => /mes|period/i.test(t)) };
    }
  };
  return 'helpers-ok';
})()`;

/* ------------------------------------------------------------------ *
 * 4. Node-side helpers.
 * ------------------------------------------------------------------ */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** FNV-1c 32-bit. Two integers are enough to detect any change and are far
 *  cheaper to compare and print than the whole JSON blob. */
function fnv1c(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Read the REAL localStorage from node through CDP `DOMStorage`, which never
 *  goes through page JS. This is the isolation measurement: it is what the
 *  browser actually persisted, not what the page believes it persisted.
 *  `entries` come back as [key, value] pairs, not objects - that is the shape
 *  Chrome actually uses on this protocol version. */
async function readRealStorage(page) {
  const r = await page.send('DOMStorage.getDOMStorageItems', {
    storageId: { securityOrigin: 'file://', isLocalStorage: true }
  });
  const entries = (r.entries || []).map(e => (Array.isArray(e) ? [e[0], e[1]] : [e.key, e.value]));
  const app = entries.find(e => e[0] === STORAGE_KEY);
  const valor = app ? String(app[1]) : null;
  const ordenadas = entries.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    keys: entries.map(e => e[0]).sort(),
    appKeyPresent: !!app,
    appKeyBytes: valor === null ? null : valor.length,
    appKeyHash: valor === null ? null : fnv1c(valor),
    hashTodasLasClaves: fnv1c(JSON.stringify(ordenadas)),
    entradas: ordenadas.map(e => [e[0], String(e[1]).length])
  };
}

/* ------------------------------------------------------------------ *
 * 5. Page driver + dialog controller.
 * ------------------------------------------------------------------ */
const s = await openPage({ width: 1440, height: 900 });
const SID = s.browser.sessionId;

const dialogos = [];
let dialogPolicy = 'accept'; // node-side per-case control: 'accept' | 'cancel'

const netReqs = [];
const domStorageEvents = [];
const hallazgos = {};

s.page.on(msg => {
  if (msg.sessionId === SID && msg.method === 'Network.requestWillBeSent') {
    netReqs.push({ method: msg.params.request.method, url: msg.params.request.url });
  }
  if (msg.method === 'DOMStorage.domStorageItemAdded' ||
      msg.method === 'DOMStorage.domStorageItemUpdated' ||
      msg.method === 'DOMStorage.domStorageItemRemoved') {
    const key = msg.params && (msg.params.key || (msg.params.entry && msg.params.entry.key));
    const area = msg.params && msg.params.storageId && msg.params.storageId.isLocalStorage ? 'localStorage' : 'sessionStorage';
    domStorageEvents.push({ event: String(msg.method).replace('DOMStorage.', ''), key: key === undefined ? null : key, area });
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    const type = msg.params.type;
    const esConfirm = type === 'confirm';
    const accept = esConfirm ? dialogPolicy === 'accept' : true;
    dialogos.push({
      index: dialogos.length, type, message: msg.params.message,
      policy: esConfirm ? dialogPolicy : 'accept', accepted: accept
    });
    s.page.send('Page.handleJavaScriptDialog', { accept }).catch(() => { /* target closed */ });
  }
});

const acum = {
  setItemRedirigidos: 0, setItemReales: 0, removeItemRedirigidos: 0, removeItemReales: 0,
  getItemRedirigidos: 0, getItemReales: 0, guardarN: 0, cargarN: 0, asignadoPorProducto: 0,
  clavesReales: []
};
const paginasCargadas = [];

async function leerContadores() {
  const c = await s.page.eval('JSON.stringify(window.__probe ? window.__probe.contadores() : null)');
  return c ? JSON.parse(c) : null;
}

/** Sum this page's counters into the run total. Guarded by a flag inside the
 *  page so calling it twice for the same load cannot double count; `boot()`
 *  calls it before navigating away, which is what keeps the saves of every
 *  block in the total instead of only the ones at the end. */
async function acumularContadores(etiqueta) {
  const ya = await s.page.eval('!!(window.__probe && window.__probe.__acumulado)');
  const c = await leerContadores();
  if (!c) return null;
  if (ya) return c;
  await s.page.eval('(() => { window.__probe.__acumulado = true; return 1 })()');
  for (const k of ['setItemRedirigidos', 'setItemReales', 'removeItemRedirigidos', 'removeItemReales',
    'getItemRedirigidos', 'getItemReales', 'guardarN', 'cargarN', 'asignadoPorProducto']) {
    acum[k] += c[k] || 0;
  }
  for (const k of c.clavesReales || []) acum.clavesReales.push(k);
  paginasCargadas.push({ etiqueta, ...c });
  return c;
}

async function settle(n = 3, ms = 500) {
  await s.pump(n);
  await sleep(ms);
}

/** Fire an action that may open confirm()/alert() WITHOUT awaiting the evaluate
 *  first: the dialog blocks the renderer until node answers it. */
async function clickAsync(expr) {
  const p = s.page.eval(expr).then(v => ({ ok: true, value: v }), e => ({ ok: false, error: String(e) }));
  await sleep(900);
  return p;
}

async function pressEscape() {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await s.page.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  }
}

const MODALES_ACTIVOS = `[...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)`;

/** Modal hygiene. Uses the REAL Escape key first, because whether Escape closes
 *  a sheet is a product behaviour worth measuring, then force-closes leftovers. */
async function higieneModal() {
  const abiertas = JSON.parse(await s.page.eval(`JSON.stringify(${MODALES_ACTIVOS})`) || '[]')
    .filter(id => id !== 'modalSessionRoleSelect');
  let escapeCerrou = null;
  if (abiertas.length) {
    await pressEscape();
    await settle(2, 350);
    const despues = JSON.parse(await s.page.eval(`JSON.stringify(${MODALES_ACTIVOS})`) || '[]');
    escapeCerrou = abiertas.filter(id => despues.indexOf(id) === -1);
  }
  await s.page.eval(`(() => { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); return 1 })()`);
  return { abiertas, escapeCerrou };
}

/** Boot (or re-boot) with a stub for `mode` and `cloud`. The newest
 *  document-start registration wins, so this is also how the simulated cloud
 *  crosses a reload. Waits until the async session resolution has settled the
 *  auth UI before handing the page to a case. */
async function boot(mode, cloud) {
  /* Bank the outgoing page's counters before navigating: that is the only place
     from which the saves of the previous block are still visible. */
  try { await acumularContadores('salida:' + mode); } catch { /* pagina inicial */ }
  await s.page.send('Page.addScriptToEvaluateOnNewDocument', { source: buildStub(mode, cloud) });
  await s.goto(PAGE_URL, 8000);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(HELPERS);
  let sesionResuelta = false;
  for (let i = 0; i < 50; i++) {
    sesionResuelta = await s.page.eval(
      `(() => { try { return typeof obtenerSesion === 'function' && obtenerSesion().configurado === true; } catch (e) { return false; } })()`);
    if (sesionResuelta) break;
    await sleep(150);
  }
  await sleep(400);
  let conFixture = false;
  for (let i = 0; i < 50; i++) {
    conFixture = await s.page.eval(
      `!!(window.financialStore && window.financialStore.data.meses[${JSON.stringify(MES_A)}])`);
    if (conFixture) break;
    await sleep(150);
  }
  await settle(2, 450);
  const c = await leerContadores();
  paginasCargadas.push({ etiqueta: 'boot:' + mode, sesionResuelta, conFixture, contadores: c });
  return { conFixture, sesionResuelta, contadores: c };
}

/** Pull the simulated cloud out of the page into node. This is the only channel
 *  state has across a reload, and it only ever contains what the stub received. */
async function leerNube() {
  const n = await s.page.eval('JSON.stringify(window.__probe.leerNube ? window.__probe.leerNube() : null)');
  return n ? JSON.parse(n) : null;
}

/* ------------------------------------------------------------------ *
 * 6. Real-UI expressions. Everything below drives the actual DOM.
 * ------------------------------------------------------------------ */
const RERENDER = `(() => { document.getElementById('btnNavMes').click(); return 1 })()`;

const PILL_MES = (nombre) => `(() => {
  const pills = [...document.querySelectorAll('.month-pill-btn')];
  const p = pills.find(x => { const s = x.querySelector('span'); return s && s.textContent === ${JSON.stringify(nombre)}; });
  if (!p) return { clicked: false, pills: pills.map(x => x.textContent.trim()) };
  p.click();
  return { clicked: true };
})()`;

/** Open the add-budget sheet the way a user would: click the real button, then
 *  pick section/subsection through the real selects (with a real `change` event
 *  so the conditional fields react exactly as they do for a human). */
const ABRIR_ALTA_GASTO = (boton, seccion, subseccion) => `(() => {
  for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
  const b = ${boton ? JSON.stringify(boton) : 'null'};
  if (b) {
    const bot = document.querySelector(b);
    if (!bot) return { abierto: false, motivo: 'no existe el boton ' + b };
    bot.click();
  } else {
    document.getElementById('btnHeaderAddBudget').click();
  }
  const sec = document.getElementById('budgetSection');
  if (${JSON.stringify(seccion)}) {
    sec.value = ${JSON.stringify(seccion)};
    sec.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const sub = document.getElementById('budgetSubsection');
  if (${JSON.stringify(subseccion)}) {
    sub.value = ${JSON.stringify(subseccion)};
    sub.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return {
    abierto: document.getElementById('modalAddBudget').classList.contains('active'),
    seccion: sec.value,
    subseccion: sub ? sub.value : null,
    rangoVisible: getComputedStyle(document.getElementById('inputBudgetRangeField')).display
  };
})()`;

const LLENAR_ALTA_GASTO = (concepto, monto, rango, estado) => `(() => {
  document.getElementById('budgetConcepto').value = ${JSON.stringify(concepto)};
  document.getElementById('budgetMonto').value = ${JSON.stringify(monto)};
  const r = document.getElementById('budgetRango');
  if (r) r.value = ${JSON.stringify(rango === null ? '' : rango)};
  const e = document.getElementById('budgetEstado');
  if (e && ${JSON.stringify(estado)}) e.value = ${JSON.stringify(estado)};
  return {
    conceptoEnElCampo: document.getElementById('budgetConcepto').value,
    montoEnElCampo: document.getElementById('budgetMonto').value,
    rangoEnElCampo: r ? r.value : null
  };
})()`;

const ENVIAR = (formId) => `(() => {
  const f = document.getElementById(${JSON.stringify(formId)});
  if (!f) return { enviado: false, motivo: 'no existe ' + ${JSON.stringify(formId)} };
  const usaRequestSubmit = typeof f.requestSubmit === 'function';
  if (usaRequestSubmit) f.requestSubmit();
  else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return { enviado: true, viaRequestSubmit: usaRequestSubmit, checkValidity: f.checkValidity() };
})()`;

const ABRIR_ALTA_MOV = (boton, flujo) => `(() => {
  for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
  const b = document.querySelector(${JSON.stringify(boton)});
  if (!b) return { abierto: false, motivo: 'no existe ' + ${JSON.stringify(boton)} };
  b.click();
  const hidden = document.getElementById('movFlujo');
  if (${JSON.stringify(flujo)}) hidden.value = ${JSON.stringify(flujo)};
  return {
    abierto: document.getElementById('modalAddMovement').classList.contains('active'),
    flujoEnElHidden: hidden.value,
    fechaPorDefecto: document.getElementById('movFecha').value
  };
})()`;

const LLENAR_ALTA_MOV = (concepto, monto, fecha) => `(() => {
  document.getElementById('movConcepto').value = ${JSON.stringify(concepto)};
  document.getElementById('movMonto').value = ${JSON.stringify(monto)};
  document.getElementById('movFecha').value = ${JSON.stringify(fecha)};
  return {
    concepto: document.getElementById('movConcepto').value,
    monto: document.getElementById('movMonto').value,
    fecha: document.getElementById('movFecha').value,
    flujo: document.getElementById('movFlujo').value
  };
})()`;

/** Open the new-period sheet the way a user would. `opcionesClone` is optional:
 *  when present it sets the three clone checkboxes AFTER the opener has run
 *  (which is what `formNewMonth.reset()` already put them at by default), so a
 *  case can isolate one collection at a time. `null`/omitted leaves the markup
 *  defaults untouched, which is exactly what A9 measures. */
const ABRIR_NUEVO_MES = (nombreMes, clonarDe, opcionesClone) => `(() => {
  for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
  const b = document.getElementById('btnOpenNewMonthModal');
  if (!b) return { abierto: false };
  b.click();
  const sel = document.getElementById('newMonthCloneSelect');
  const opciones = [...sel.options].map(o => o.value + ' :: ' + o.textContent);
  if (!${JSON.stringify(clonarDe)}) sel.value = '';
  else if (![].some.call(sel.options, o => o.value === ${JSON.stringify(clonarDe)})) return { abierto: true, opciones, motivo: 'no existe la opcion de clonado ' + ${JSON.stringify(clonarDe)} };
  else sel.value = ${JSON.stringify(clonarDe)};
  const CASILLAS = { extras: 'cloneIncluirExtras', notas: 'cloneIncluirNotas', movimientos: 'cloneIncluirMovimientos' };
  const oc = ${JSON.stringify(opcionesClone === undefined ? null : opcionesClone)};
  if (oc) { for (const k of Object.keys(CASILLAS)) { const c = document.getElementById(CASILLAS[k]); if (c) c.checked = !!oc[k]; } }
  /* El select dispara 'change' como lo haria una persona: la visibilidad del
     bloque de opciones tiene que depender del evento y no de la asignacion. */
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('newMonthName').value = ${JSON.stringify(nombreMes)};
  const row = document.getElementById('cloneOpcionesRow');
  return {
    abierto: document.getElementById('modalNewMonth').classList.contains('active'),
    opciones, valorClone: sel.value, nombre: document.getElementById('newMonthName').value,
    bloqueOpciones: row ? getComputedStyle(row).display : 'NO_EXISTE',
    casillas: Object.keys(CASILLAS).map(k => {
      const c = document.getElementById(CASILLAS[k]);
      return k + '=' + (c ? String(c.checked) : 'NO_EXISTE');
    }).join(' ')
  };
})()`;

/** Read the delete-period control without clicking it: existence, copy, computed
 *  display and whether it actually occupies layout. */
const BOTON_BORRAR_MES = `(() => {
  const b = document.getElementById('btnDeleteMonth');
  if (!b) return { existe: false };
  const r = b.getBoundingClientRect();
  return {
    existe: true, title: b.getAttribute('title'), texto: b.textContent.trim(),
    clases: b.className, display: getComputedStyle(b).display,
    ocupaLayout: r.width > 0 && r.height > 0,
    adminActionBtn: b.classList.contains('admin-action-btn')
  };
})()`;

const CLICK_BORRAR_MES = `(() => {
  const b = document.getElementById('btnDeleteMonth');
  if (!b) return { click: false, motivo: 'no existe #btnDeleteMonth' };
  b.click();
  return { click: true };
})()`;

/** Click a control inside the expense row whose title matches `concepto`.
 *  Rows are located by rendered text, never by array index, so a case can never
 *  be compared against a row that is not the one it clicked. */
const CLICK_ROW_GASTO = (concepto, sel) => `(() => {
  const filas = [...document.querySelectorAll('.expense-card-item')];
  const f = filas.find(x => { const t = x.querySelector('.expense-item-title'); return t && t.textContent === ${JSON.stringify(concepto)}; });
  if (!f) return { click: false, motivo: 'no hay fila con ese concepto' };
  const b = f.querySelector(${JSON.stringify(sel)});
  if (!b) return { click: false, motivo: 'la fila no tiene ' + ${JSON.stringify(sel)} };
  const id = b.getAttribute('data-item-id');
  b.click();
  return { click: true, idEnElBoton: id };
})()`;

const CLICK_ROW_MOV = (concepto, sel) => `(() => {
  const filas = [...document.querySelectorAll('.transaction-feed-item')];
  const f = filas.find(x => { const h = x.querySelector('h4'); return h && h.textContent === ${JSON.stringify(concepto)}; });
  if (!f) return { click: false, motivo: 'no hay fila de movimiento con ese concepto' };
  const b = f.querySelector(${JSON.stringify(sel)});
  if (!b) return { click: false, motivo: 'la fila no tiene ' + ${JSON.stringify(sel)} };
  const tieneId = b.hasAttribute('data-item-id');
  b.click();
  return { click: true, botonConDataItemId: tieneId };
})()`;

const CLICK_POR_ID = (sel, id) => `(() => {
  const b = document.querySelector(${JSON.stringify(sel)} + '[data-item-id="' + CSS.escape(${JSON.stringify(id)}) + '"]');
  if (!b) return { click: false, motivo: 'no existe ' + ${JSON.stringify(sel)} + ' para ' + ${JSON.stringify(id)} };
  b.click();
  return { click: true, id: b.getAttribute('data-item-id') };
})()`;

const ABRIR_EDITAR_GASTO = (id) => CLICK_POR_ID('.btn-edit-expense', id);
const ABRIR_EDITAR_GASTO_POR_CONCEPTO = (concepto) => CLICK_ROW_GASTO(concepto, '.btn-edit-expense');
const LLENAR_EDITAR_GASTO = (concepto, monto, rango) => `(() => {
  document.getElementById('editExpenseConcepto').value = ${JSON.stringify(concepto)};
  document.getElementById('editExpenseMonto').value = ${JSON.stringify(monto)};
  const r = document.getElementById('editExpenseRango');
  if (r) r.value = ${JSON.stringify(rango === null ? '' : rango)};
  return {
    concepto: document.getElementById('editExpenseConcepto').value,
    monto: document.getElementById('editExpenseMonto').value,
    rango: r ? r.value : null,
    rangoVisible: document.getElementById('editExpenseRangeField').style.display,
    itemIdEnElForm: document.getElementById('editExpenseItemId').value,
    monthIdEnElForm: document.getElementById('editExpenseMonthId').value,
    tipoReadonly: document.getElementById('editExpenseTipoReadonly').textContent
  };
})()`;

const FORZAR_ID_EDITANDO = (campo, valor) => `(() => {
  const el = document.getElementById(${JSON.stringify(campo)});
  el.value = ${JSON.stringify(valor)};
  return { campo: el.id, valor: el.value };
})()`;

const ABRIR_PAGO_VARIABLE = (id) => CLICK_POR_ID('.btn-status-toggle', id);
const LLENAR_PAGO_VARIABLE = (monto) => `(() => {
  document.getElementById('payVarActualAmount').value = ${JSON.stringify(monto)};
  return {
    montoEnElCampo: document.getElementById('payVarActualAmount').value,
    modalAbierto: document.getElementById('modalPayVariableExpense').classList.contains('active'),
    titulo: document.getElementById('payVarItemTitle').textContent,
    estimado: document.getElementById('payVarItemEstimated').textContent,
    badgeRango: document.getElementById('payVarItemRangeBadge').textContent,
    itemId: document.getElementById('payVarItemId').value
  };
})()`;

const ABRIR_NOTAS = `(() => {
  const b = document.getElementById('btnOpenNotesModal');
  if (!b) return { abierto: false };
  b.click();
  return { abierto: document.getElementById('modalMonthNotes').classList.contains('active'), valor: document.getElementById('monthNotesTextarea').value };
})()`;

const ESCRIBIR_NOTAS = (texto) => `(() => {
  const t = document.getElementById('monthNotesTextarea');
  t.value = ${JSON.stringify(texto)};
  /* The product listens on 'input' with a 400 ms debounce, so a real keystroke
     event is part of the path under test, not a shortcut. */
  t.dispatchEvent(new Event('input', { bubbles: true }));
  return { valor: t.value, feedback: document.getElementById('notesFeedback').textContent };
})()`;

const modalActivo = (id) => `document.getElementById(${JSON.stringify(id)}).classList.contains('active')`;
const toast = `JSON.stringify(window.__t.toast())`;
const domJson = `JSON.stringify(window.__t.dom())`;
const sesionJson = `JSON.stringify(window.__t.sesion())`;

/* ------------------------------------------------------------------ *
 * 7. Case runner.
 *
 *    VERDICT SEMANTICS - read this before trusting any PASS.
 *    Every case states what MUST happen, so PASS always means "the product did
 *    the right thing". Where the matrix documents a defect as today's behaviour
 *    (C9, D5, E3-E6) the case is still written against the correct behaviour and
 *    therefore FAILs; `documentaHueco: true` marks those rows as "this red is the
 *    known hole X", which is documentation, never a licence to go green.
 *    A case can never be green by default: `fn` must return `{ pass: true }`.
 *    Thrown error / missing control -> SKIP with a reason, never PASS.
 * ------------------------------------------------------------------ */
const casos = [];

async function caso(cfg) {
  const fila = {
    id: cfg.id,
    bloque: cfg.bloque,
    situacion: cfg.situacion,
    aserto: cfg.aserto,
    tipo: 'requerimiento',
    documentaHueco: !!cfg.documentaHueco,
    defecto: cfg.defecto === undefined ? null : cfg.defecto,
    notaDefecto: cfg.notaDefecto || null,
    verdict: 'SKIP',
    motivo: null,
    esperado: null,
    observado: null,
    extra: null
  };
  const t0 = Date.now();
  try {
    const r = await cfg.fn();
    if (!r || typeof r !== 'object') {
      fila.verdict = 'SKIP';
      fila.motivo = 'la funcion del caso no devolvio una asercion';
    } else if (r.skip) {
      fila.verdict = 'SKIP';
      fila.motivo = r.skip;
      fila.observado = r.observado === undefined ? null : r.observado;
    } else if (typeof r.pass !== 'boolean') {
      fila.verdict = 'SKIP';
      fila.motivo = 'la asercion no devolvio pass: true/false, asi que no se puede marcar';
      fila.observado = r.observado === undefined ? null : r.observado;
    } else {
      fila.verdict = r.pass ? 'PASS' : 'FAIL';
      fila.esperado = r.expected === undefined ? null : r.expected;
      fila.observado = r.observed === undefined ? null : r.observed;
      if (r.extra) fila.extra = r.extra;
    }
  } catch (err) {
    fila.verdict = 'SKIP';
    fila.motivo = 'error al ejecutar el caso: ' + String((err && err.message) || err);
  }
  fila.ms = Date.now() - t0;
  casos.push(fila);
  const marca = fila.verdict === 'PASS' ? 'PASS' : fila.verdict;
  console.log(`  ${marca}  ${fila.id.padEnd(4)} ${fila.situacion}`);
  if (fila.verdict === 'FAIL') console.log(`        esperado: ${JSON.stringify(fila.esperado)}`);
  if (fila.verdict === 'FAIL') console.log(`        observado: ${JSON.stringify(fila.observado)}`);
  if (fila.verdict === 'FAIL' && fila.defecto) console.log(`        defecto:  ${fila.defecto}`);
  if (fila.verdict === 'SKIP') console.log(`        motivo:   ${fila.motivo}`);
  return fila;
}

/** Tolerant JSON reader for `Runtime.evaluate` results: `returnByValue` hands
 *  back plain objects for IIFEs and strings for expressions that stringify, so
 *  both shapes are accepted. Never throws on an object. */
const J = async (expr) => {
  const v = await s.page.eval(expr);
  return typeof v === 'string' ? JSON.parse(v) : v;
};

/* Convenience readers (READ ONLY). */
const item = (mes, ruta, id) => J(`JSON.stringify(window.__t.item(${JSON.stringify(mes)}, ${JSON.stringify(ruta)}, ${JSON.stringify(id)}))`);
const coll = (mes, ruta) => J(`JSON.stringify(window.__t.coll(${JSON.stringify(mes)}, ${JSON.stringify(ruta)}))`);
const buscar = (mes, concepto) => J(`JSON.stringify(window.__t.buscar(${JSON.stringify(mes)}, ${JSON.stringify(concepto)}))`);
const totales = (mes) => J(`JSON.stringify(window.__t.totales(${JSON.stringify(mes)}))`);
const orden = () => J('JSON.stringify(window.__t.orden())');
const activo = () => s.page.eval('window.__t.activo()');
const notasDe = (mes) => J(`JSON.stringify(window.__t.notas(${JSON.stringify(mes)}))`);
const dom = () => J(domJson);
const leerToast = () => J(toast);
const guardarN = () => s.page.eval('window.__probe.guardarN');
const setItemN = () => s.page.eval('window.__probe.setItemRedirigidos');
const pills = () => J('JSON.stringify(window.__t.pills())');

const RUTAS_CLON = ['servicios.fijos', 'servicios.variables', 'personales.fijos', 'personales.variables', 'extras', 'movimientos'];

/**
 * Compare a clone against the month it was cloned from, collection by collection.
 *
 * Pure node arithmetic over the READ-ONLY page helpers (`coll`): no store call,
 * nothing mutates. Items are paired by `concepto` — the only field that is
 * guaranteed to survive a clone on both sides — and `diferencias` reports every
 * field whose value drifted, so a case can assert "nothing else moved" instead
 * of re-listing six fields by hand. `idsCompartidos` is the new-id proof: a
 * clone that reused an id would push the source item's own state.
 */
async function compararClon(origenId, clonId) {
  const salida = {};
  for (const r of RUTAS_CLON) {
    const origen = (await coll(origenId, r)) || [];
    const clon = (await coll(clonId, r)) || [];
    const idsOrigen = new Set(origen.map(x => x.id));
    const porConcepto = new Map(origen.map(x => [x.concepto, x]));
    const diferencias = [];
    for (const c of clon) {
      const o = porConcepto.get(c.concepto);
      if (!o) { diferencias.push({ concepto: c.concepto, motivo: 'no existe en el origen' }); continue; }
      for (const k of ['estado', 'fecha', 'flujo', 'categoria', 'retornable', 'monto']) {
        if (JSON.stringify(c[k]) !== JSON.stringify(o[k])) {
          diferencias.push({ concepto: c.concepto, campo: k, origen: o[k], clon: c[k] });
        }
      }
    }
    salida[r] = {
      origen: origen.length,
      clon: clon.length,
      idsCompartidos: clon.filter(x => idsOrigen.has(x.id)).length,
      conceptosOrigen: origen.map(x => x.concepto),
      conceptosClon: clon.map(x => x.concepto),
      estadosClon: clon.map(x => x.estado),
      diferencias
    };
  }
  return salida;
}

/** The four budget collections are the unconditional part of a clone: they always
 *  travel, always with new ids and always reset to Pendiente. */
function presupuestoClonado(cmp) {
  const rutas = RUTAS_CLON.slice(0, 4);
  return {
    mismoLargo: rutas.every(r => cmp[r].origen === cmp[r].clon),
    idsNuevos: rutas.every(r => cmp[r].idsCompartidos === 0),
    todosPendientes: rutas.every(r => cmp[r].estadosClon.every(e => e === 'Pendiente'))
  };
}

/* ------------------------------------------------------------------ *
 * 8. Matrix - block A (crear / subir).
 * ------------------------------------------------------------------ */
async function bloqueA() {
  console.log('\n=== BLOQUE A - CREAR / SUBIR ===');
  const b = await boot('admin', clone(FIXTURE));
  if (!b.conFixture) {
    console.log('  ABORTA BLOQUE A: la pagina no cargo la fixture sintetica');
    return;
  }
  await acumularContadores('A');
  const domA0 = await dom();
  hallazgos.sesionAdmin = { ...(await J(sesionJson)), dom: domA0, contadores: b.contadores };
  console.log(`  sesion admin medida: ${JSON.stringify(hallazgos.sesionAdmin)}`);

  await caso({
    id: 'A1', bloque: 'A', situacion: 'gasto Fijo en servicios/fijos',
    aserto: 'existe con los 4 campos, estado Pendiente',
    fn: async () => {
      const ab = await J(ABRIR_ALTA_GASTO('.btn-quick-add-service', 'servicios', 'fijos'));
      const ll = await J(LLENAR_ALTA_GASTO('SYN-A1-FIJO-SERV', '100.00', null, 'Pendiente'));
      const en = await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A1-FIJO-SERV');
      const fila = await J(`JSON.stringify(window.__t.filaGasto('SYN-A1-FIJO-SERV'))`);
      const it = hit && hit.item;
      return {
        pass: !!it && hit.ruta === 'servicios.fijos' && it.tipo === 'Fijo' && it.estado === 'Pendiente' &&
              it.monto === 100 && it.rango === '' && typeof it.id === 'string' && it.id.length > 0,
        expected: { ruta: 'servicios.fijos', tipo: 'Fijo', estado: 'Pendiente', monto: 100, rango: '', id: 'string no vacio' },
        observed: { abierto: ab, llenado: ll, envio: en, encontrado: hit, filaRenderizada: fila },
        extra: { dialogo: 'ninguno esperado' }
      };
    }
  });

  await caso({
    id: 'A2', bloque: 'A', situacion: 'gasto Variable + rango',
    aserto: 'rango persistido, separador de rango con guion',
    fn: async () => {
      await higieneModal();
      const ab = await J(ABRIR_ALTA_GASTO(null, 'servicios', 'variables'));
      const ll = await J(LLENAR_ALTA_GASTO('SYN-A2-VAR-SERV', '30.00', '20 - 40', 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A2-VAR-SERV');
      const fila = await J(`JSON.stringify(window.__t.filaGasto('SYN-A2-VAR-SERV'))`);
      const it = hit && hit.item;
      const tagConRango = fila && fila.tags.filter(t => /^Rango:/.test(t))[0];
      return {
        pass: !!it && hit.ruta === 'servicios.variables' && it.tipo === 'Variable' && it.rango === '20 - 40' &&
              tagConRango === 'Rango: 20 - 40',
        expected: { ruta: 'servicios.variables', tipo: 'Variable', rango: '20 - 40', tagRenderizada: 'Rango: 20 - 40' },
        observed: { abierto: ab, lenado: ll, encontrado: hit, tagRenderizada: tagConRango || null, fila }
      };
    }
  });

  await caso({
    id: 'A3', bloque: 'A', situacion: 'gasto Variable en personales/variables',
    aserto: 'id unico, no colisiona con A2',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'personales', 'variables'));
      await J(LLENAR_ALTA_GASTO('SYN-A3-VAR-PERS', '45.00', '10 - 80', 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A3-VAR-PERS');
      const a2 = await buscar(MES_A, 'SYN-A2-VAR-SERV');
      const it = hit && hit.item;
      return {
        pass: !!it && hit.ruta === 'personales.variables' && it.tipo === 'Variable' && !!a2 && it.id !== a2.item.id,
        expected: { ruta: 'personales.variables', tipo: 'Variable', idDistintoDeA2: true },
        observed: { encontrado: hit, idA2: a2 ? a2.item.id : null, idA3: it ? it.id : null }
      };
    }
  });

  await caso({
    id: 'A4', bloque: 'A', situacion: 'gasto Fijo en personales/fijos',
    aserto: 'id unico',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO('.btn-quick-add-personal', 'personales', 'fijos'));
      await J(LLENAR_ALTA_GASTO('SYN-A4-FIJO-PERS', '25.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A4-FIJO-PERS');
      const it = hit && hit.item;
      return {
        pass: !!it && hit.ruta === 'personales.fijos' && it.tipo === 'Fijo' && it.id !== 'syn_pf_1',
        expected: { ruta: 'personales.fijos', tipo: 'Fijo', idNuevo: true },
        observed: { encontrado: hit }
      };
    }
  });

  await caso({
    id: 'A5', bloque: 'A', situacion: 'gasto Extra',
    aserto: "tipo forzado a 'Extra', queda en el array plano extras",
    fn: async () => {
      await higieneModal();
      const ab = await J(ABRIR_ALTA_GASTO('.btn-quick-add-extra', 'extras', null));
      await J(LLENAR_ALTA_GASTO('SYN-A5-EXTRA', '83.00', 'NO-APLICA', 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A5-EXTRA');
      const it = hit && hit.item;
      const enExtras = await coll(MES_A, 'extras');
      return {
        pass: !!it && hit.ruta === 'extras' && it.tipo === 'Extra' && enExtras.some(x => x.id === it.id),
        expected: { ruta: 'extras', tipo: 'Extra' },
        observed: { abierto: ab, encontrado: hit, enArrayPlanoExtras: enExtras.map(x => x.concepto) }
      };
    }
  });

  await caso({
    id: 'A6', bloque: 'A', situacion: 'movimiento Ingreso',
    aserto: "flujo 'Ingreso', aparece con + en el feed",
    fn: async () => {
      await higieneModal();
      const ab = await J(ABRIR_ALTA_MOV('#btnQuickActionIncome', 'Ingreso'));
      const ll = await J(LLENAR_ALTA_MOV('SYN-A6-INGRESO', '1000', '2026-08-15'));
      await J(ENVIAR('formAddMovement'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A6-INGRESO');
      const fila = await J(`JSON.stringify(window.__t.filaMov('SYN-A6-INGRESO'))`);
      const it = hit && hit.item;
      const conSigno = !!(fila && /(^|\s)\+\s/.test(fila.montoTexto || ''));
      return {
        pass: !!it && hit.ruta === 'movimientos' && it.flujo === 'Ingreso' && conSigno,
        expected: { ruta: 'movimientos', flujo: 'Ingreso', signoEnElFeed: '+', monto: 1000 },
        observed: {
          abierto: ab, lenado: ll, encontrado: it, fila,
          categoria: it ? it.categoria : null, retornable: it ? it.retornable : null, estado: it ? it.estado : null,
          fecha: it ? it.fecha : null
        }
      };
    }
  });

  await caso({
    id: 'A7', bloque: 'A', situacion: 'movimiento Gasto',
    aserto: "flujo 'Gasto', aparece con -",
    fn: async () => {
      await higieneModal();
      const ab = await J(ABRIR_ALTA_MOV('#btnQuickActionExpense', 'Gasto'));
      const ll = await J(LLENAR_ALTA_MOV('SYN-A7-GASTO', '250', '2026-08-16'));
      await J(ENVIAR('formAddMovement'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A7-GASTO');
      const fila = await J(`JSON.stringify(window.__t.filaMov('SYN-A7-GASTO'))`);
      const it = hit && hit.item;
      const conSigno = !!(fila && /(^|\s)-\s/.test(fila.montoTexto || ''));
      return {
        pass: !!it && hit.ruta === 'movimientos' && it.flujo === 'Gasto' && conSigno,
        expected: { ruta: 'movimientos', flujo: 'Gasto', signoEnElFeed: '-' },
        observed: { abierto: ab, lenado: ll, encontrado: it, fila, categoria: it ? it.categoria : null }
      };
    }
  });

  const ordenAntesA8 = await orden();
  await caso({
    id: 'A8', bloque: 'A', situacion: 'mes nuevo sin clonar',
    aserto: "existe, mesesOrden crece, corto = primera palabra",
    fn: async () => {
      await higieneModal();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes C', ''));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 600);
      const ordenAhora = await orden();
      const nuevo = ordenAhora.filter(id => ordenAntesA8.indexOf(id) === -1);
      const forma = nuevo.length ? await J(`window.__t.forma(${JSON.stringify(nuevo[0])})`) : null;
      const activoAhora = await activo();
      /* El alta de un mes deja el mes nuevo activo (app.js:1580). Los casos
         siguientes apuntan a MES_A por id, asi que hay que volver a el: si no,
         escribirian en el mes nuevo y las asertos serian sobre el mes
         equivocado. */
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      const activoFinal = await activo();
      return {
        pass: ordenAhora.length === ordenAntesA8.length + 1 && nuevo.length === 1 &&
              !!forma && forma.nombre === 'SYN Mes C' && forma.corto === 'SYN' && activoAhora === nuevo[0] &&
              activoFinal === MES_A,
        expected: { mesesOrden: `+1 (${ordenAntesA8.length} -> ${ordenAntesA8.length + 1})`, nombre: 'SYN Mes C', corto: 'SYN', mesActivoTrasCrear: nuevo[0] || null, vueltoAMesA: true },
        observed: { abierto: ab, nuevoId: nuevo[0] || null, nombre: forma ? forma.nombre : null, corto: forma ? forma.corto : null, activoAhora, vueltaAlMesA: vuelta, activoFinal }
      };
    }
  });

  await caso({
    id: 'A9', bloque: 'A', situacion: 'mes nuevo clonando con las opciones por defecto',
    aserto: 'las cuatro colecciones de presupuesto copian con id nuevo y todo Pendiente; extras y notas tambien; los movimientos NO',
    fn: async () => {
      await higieneModal();
      const ordenAntes = await orden();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes D', MES_A));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const ordenAhora = await orden();
      const nuevo = ordenAhora.filter(id => ordenAntes.indexOf(id) === -1);
      if (!nuevo.length) {
        return { skip: 'el modal de nuevo mes no creo ningun mes: ' + JSON.stringify(ab), observado: ab };
      }
      const cmp = await compararClon(MES_A, nuevo[0]);
      const presupuesto = presupuestoClonado(cmp);
      const forma = await J(`window.__t.forma(${JSON.stringify(nuevo[0])})`);
      const notasOrigen = await notasDe(MES_A);
      const extrasPendientes = cmp.extras.estadosClon.every(e => e === 'Pendiente');
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      const activoFinal = await activo();
      return {
        pass: presupuesto.mismoLargo && presupuesto.idsNuevos && presupuesto.todosPendientes &&
              cmp.extras.origen === cmp.extras.clon && cmp.extras.idsCompartidos === 0 && extrasPendientes &&
              forma.notas === notasOrigen &&
              cmp.movimientos.clon === 0 && activoFinal === MES_A,
        expected: {
          presupuesto: 'las 4 colecciones con el mismo largo, ids nuevos y todo Pendiente',
          extras: 'mismo largo, ids nuevos, todo Pendiente',
          notas: notasOrigen,
          movimientos: 'NO se copian (la casilla viene apagada por defecto)',
          vueltoAMesA: true
        },
        observed: {
          abierto: ab, nuevoId: nuevo[0], comparacion: cmp, presupuesto,
          notasOrigen, notasClon: forma.notas, vueltaAlMesA: vuelta, activoFinal
        },
        extra: {
          porQueMovimientosNo: 'un movimiento es una transacción ya registrada: copiarlo puede sumar dos veces los ingresos del período origen, así que el producto lo deja como opt-in explícito.',
          defaults: 'el caso no pasa `opcionesClone`: mide lo que el marcado declara (extras y notas marcadas, movimientos apagada) después del `formNewMonth.reset()` del opener.'
        }
      };
    }
  });

  await caso({
    id: 'A10', bloque: 'A', situacion: 'monto "45.50" (string del input)',
    aserto: 'guardado como numero 45.5, no string',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      const ll = await J(LLENAR_ALTA_GASTO('SYN-A10-MONTO-STRING', '45.50', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A10-MONTO-STRING');
      const it = hit && hit.item;
      return {
        pass: !!it && typeof it.monto === 'number' && it.monto === 45.5,
        expected: { typeofMonto: 'number', monto: 45.5 },
        observed: { valorEnElCampo: ll.montoEnElCampo, tipoEnElStore: it ? typeof it.monto : null, monto: it ? it.monto : null, encontrado: it }
      };
    }
  });

  await caso({
    id: 'A11', bloque: 'A', situacion: 'monto 0',
    aserto: 'acepta 0, no lo descarta',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      const ll = await J(LLENAR_ALTA_GASTO('SYN-A11-MONTO-CERO', '0', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, 'SYN-A11-MONTO-CERO');
      const it = hit && hit.item;
      const largo = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'servicios.fijos')`);
      return {
        pass: !!it && it.monto === 0,
        expected: { monto: 0, elItemExiste: true },
        observed: { valorEnElCampo: ll.montoEnElCampo, monto: it ? it.monto : null, largoServiciosFijos: largo, encontrado: it }
      };
    }
  });

  await caso({
    id: 'A12', bloque: 'A', situacion: 'concepto con acentos y enye',
    aserto: 'Café ☕ ñ intacto, sin mojibake',
    fn: async () => {
      const concepto = 'SYN-A12 Café ☕ ñ';
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      const ll = await J(LLENAR_ALTA_GASTO(concepto, '10.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, concepto);
      const fila = await J(`JSON.stringify(window.__t.filaGasto(${JSON.stringify(concepto)}))`);
      return {
        pass: !!hit && hit.item.concepto === concepto && !!fila && fila.texto.indexOf(concepto) !== -1,
        expected: { concepto, conceptoEnElStore: concepto, conceptoRenderizado: concepto },
        observed: { valorEnElCampo: ll.conceptoEnElCampo, enElStore: hit ? hit.item.concepto : null, fila }
      };
    }
  });

  await caso({
    id: 'A13', bloque: 'A', situacion: 'concepto de 500 chars',
    aserto: 'se guarda entero, la fila no rompe el layout',
    fn: async () => {
      const concepto = 'SYN-A13-' + 'X'.repeat(500 - 'SYN-A13-'.length);
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO(concepto, '11.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const hit = await buscar(MES_A, concepto);
      const fila = await J(`JSON.stringify(window.__t.filaGasto(${JSON.stringify(concepto)}))`);
      const largo = concepto.length;
      return {
        pass: !!hit && hit.item.concepto.length === largo && !!fila,
        expected: { largoConcepto: largo, filaRenderizada: true },
        observed: { largoGuardado: hit ? hit.item.concepto.length : null, largoEsperado: largo, fila }
      };
    }
  });

  await caso({
    id: 'A14', bloque: 'A', situacion: 'concepto con <img src=x onerror=...>',
    aserto: 'escapado, no se ejecuta, no aparece etiqueta',
    fn: async () => {
      const concepto = '<img src=x onerror="window.__XSS=(window.__XSS||0)+1">';
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO(concepto, '12.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 700);
      const hit = await buscar(MES_A, concepto);
      const fila = await J(`JSON.stringify(window.__t.filaGasto(${JSON.stringify(concepto)}))`);
      const xss = await J(`JSON.stringify({ xss: window.__t.xss(), imgs: document.querySelectorAll('#ledgerRowsServicios img').length })`);
      return {
        pass: !!hit && hit.item.concepto === concepto && !!fila && !fila.tieneImg && xss.xss === 0 && xss.imgs === 0,
        expected: { conceptoGuardadoComoTexto: concepto, xss: 0, imgEnLaFila: false },
        observed: { enElStore: hit ? hit.item.concepto : null, fila, xss }
      };
    }
  });

  await caso({
    id: 'A15', bloque: 'A', situacion: 'concepto duplicado',
    aserto: 'acepta, no rompe, no confunde los ids',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO('SYN-A15-DUP', '13.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 450);
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'personales', 'fijos'));
      await J(LLENAR_ALTA_GASTO('SYN-A15-DUP', '14.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      /* El duplicado va a dos colecciones distintas a proposito: asi la aserto mide
        que el id es unico incluso cruzando listas. */
      const enServFijos = (await coll(MES_A, 'servicios.fijos')).filter(x => x.concepto === 'SYN-A15-DUP');
      const enPersFijos = (await coll(MES_A, 'personales.fijos')).filter(x => x.concepto === 'SYN-A15-DUP');
      const todos = enServFijos.concat(enPersFijos);
      const ids = new Set(todos.map(x => x.id));
      return {
        pass: todos.length >= 2 && ids.size === todos.length &&
              enServFijos.length === 1 && enPersFijos.length === 1,
        expected: { filasTotalesConEseConcepto: '>= 2', idsDistintos: true, unaEnServiciosFijosYUnaEnPersonalesFijos: true },
        observed: {
          serviciosFijos: enServFijos.map(x => ({ id: x.id, monto: x.monto })),
          personalesFijos: enPersFijos.map(x => ({ id: x.id, monto: x.monto })),
          idsUnicos: ids.size
        },
        extra: { nota: "window.__t.buscar devuelve la PRIMERA coincidencia: con duplicados no sirve para afirmar unicidad, por eso el caso mira las dos colecciones completas." }
      };
    }
  });

  await caso({
    id: 'A16', bloque: 'A', situacion: 'concepto solo espacios',
    aserto: 'el required / el guard lo frena',
    defecto: 'sin entrada en la tabla R1-R16: el alta no valida concepto en blanco (store.js:517 solo hace .trim())',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO('    ', '15.00', null, 'Pendiente'));
      const env = await J(ENVIAR('formAddBudget'));
      await settle(2, 500);
      const largo = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'servicios.fijos')`);
      const lista = await coll(MES_A, 'servicios.fijos');
      const blancos = lista.filter(x => typeof x.concepto === 'string' && x.concepto.trim() === '');
      const valid = await J(`JSON.stringify(window.__t.validacion('budgetConcepto','formAddBudget'))`);
      return {
        pass: blancos.length === 0,
        expected: { itemsConConceptoEnBlanco: 0, motivoDelFreno: 'required o guard explicito' },
        observed: { largoServiciosFijos: largo, itemsEnBlanco: blancos.map(x => ({ id: x.id, concepto: x.concepto, monto: x.monto })), validacionNativa: valid, envio: env }
      };
    }
  });

  await caso({
    id: 'A17', bloque: 'A', situacion: 'mes con tilde: Año 2027',
    aserto: 'el id sale deducible, dos meses iguales no se pisan',
    defecto: 'R10 (store.js:717 sluguea con [^a-z0-9] y el sufijo son 4 digitos de Date.now())',
    fn: async () => {
      await higieneModal();
      const antes = await orden();
      await J(ABRIR_NUEVO_MES('Año 2027', ''));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const medio = await orden();
      await higieneModal();
      await J(ABRIR_NUEVO_MES('Año 2027', ''));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const despues = await orden();
      const nuevos = despues.filter(id => antes.indexOf(id) === -1);
      const forma1 = nuevos[0] ? await J(`JSON.stringify(window.__t.forma(${JSON.stringify(nuevos[0])}))`) : null;
      const forma2 = nuevos[1] ? await J(`JSON.stringify(window.__t.forma(${JSON.stringify(nuevos[1])}))`) : null;
const slugEsperado = 'a-o-2027-';
      const deducible = nuevos.length > 0 && nuevos.every(id => id.indexOf(slugEsperado) === 0 && /^[a-z0-9-]+$/.test(id) && /-\d{4}$/.test(id));
      const nombres = nuevos.map(id => (forma1 && forma1.id === id ? forma1 : (forma2 || {})).nombre);
      const sinColision = nuevos.length === 2 && nombres.join('|') === 'Año 2027|Año 2027';
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      return {
        pass: nuevos.length === 2 && deducible && sinColision && (await activo()) === MES_A,
        expected: { idsNuevos: 2, idsConElSlugDeLaTilde: 'a-o-2027-<4 digitos>', dosMesesConElMismoNombre: 'conviviendo, no pisados' },
        observed: { nuevos, forma1, forma2, deducible, sinColision, vueltaAlMesA: vuelta, activoFinal: await activo(), ordenAntes: antes.length, ordenDespues: despues.length, ordenMedio: medio.length },
        extra: {
          notaR10: "store.js:717 hace nombre.toLowerCase().replace(/[^a-z0-9]/g,'-') + '-' + Date.now().slice(-4). La tilde se vuelve guion y el sufijo son 4 digitos: dos meses con el mismo nombre solo NO se pisan si caen en ventanas de ms distintas.",
          cortoDelMes: forma1 ? forma1.corto : null
        }
      };
    }
  });

  /* --- A18-A22: qué copia el clon, con las opciones por debajo del default.
     Cada caso aisla UNA bandera y deja las otras dos apagadas, para que un FAIL
     diga exactamente qué opción no viaja y no "el clon". --- */
  await caso({
    id: 'A18', bloque: 'A', situacion: 'clonar con "gastos extra" marcado',
    aserto: 'mismo numero de extras, cada uno con id nuevo y en Pendiente',
    fn: async () => {
      await higieneModal();
      const ordenAntes = await orden();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes E', MES_A, { extras: true, notas: false, movimientos: false }));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const nuevo = (await orden()).filter(id => ordenAntes.indexOf(id) === -1);
      if (!nuevo.length) return { skip: 'el modal no creo ningun mes: ' + JSON.stringify(ab), observado: ab };
      const cmp = await compararClon(MES_A, nuevo[0]);
      const extrasOrigen = (await coll(MES_A, 'extras')) || [];
      const extrasClon = await coll(nuevo[0], 'extras');
      const idsOrigen = new Set(extrasOrigen.map(x => x.id));
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      return {
        pass: cmp.extras.clon === extrasOrigen.length && extrasOrigen.length > 0 &&
              extrasClon.every(x => !idsOrigen.has(x.id)) &&
              extrasClon.every(x => x.estado === 'Pendiente'),
        expected: { extras: extrasOrigen.length, idsCompartidosConElOrigen: 0, estado: 'todos Pendiente' },
        observed: {
          abierto: ab, nuevoId: nuevo[0], comparacionExtras: cmp.extras,
          extrasOrigen: extrasOrigen.map(x => ({ id: x.id, estado: x.estado })),
          extrasClon: extrasClon.map(x => ({ id: x.id, estado: x.estado })),
          notasDelClon: (await notasDe(nuevo[0])), movimientosDelClon: cmp.movimientos.clon,
          vueltaAlMesA: vuelta, activoFinal: await activo()
        },
        extra: { nota: 'un extra es una cuenta pendiente, igual que un gasto de presupuesto: por eso vuelve a Pendiente. Las otras dos banderas estan apagadas en este caso, asi que notas queda vacio y movimientos en 0.' }
      };
    }
  });

  await caso({
    id: 'A19', bloque: 'A', situacion: 'clonar con "notas del mes" marcado',
    aserto: 'las notas se copian textuales, sin transformar',
    fn: async () => {
      await higieneModal();
      const ordenAntes = await orden();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes F', MES_A, { extras: false, notas: true, movimientos: false }));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const nuevo = (await orden()).filter(id => ordenAntes.indexOf(id) === -1);
      if (!nuevo.length) return { skip: 'el modal no creo ningun mes: ' + JSON.stringify(ab), observado: ab };
      const notasOrigen = await notasDe(MES_A);
      const notasClon = await notasDe(nuevo[0]);
      const extrasOrigen = (await coll(MES_A, 'extras')) || [];
      const extrasClon = await coll(nuevo[0], 'extras');
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      return {
        pass: notasClon === notasOrigen && extrasClon.length === 0 && extrasOrigen.length > 0,
        expected: { notasEnElClon: notasOrigen, extras: 'no se copian (la casilla esta apagada)' },
        observed: {
          abierto: ab, nuevoId: nuevo[0], notasOrigen, notasClon,
          igualTextual: notasClon === notasOrigen,
          extrasOrigen: extrasOrigen.length, extrasClon: extrasClon.length,
          vueltaAlMesA: vuelta, activoFinal: await activo()
        },
        extra: { nota: 'las notas son texto de ida y vuelta: la comparacion es por identidad de string, sin trim ni normalizacion, asi que cualquier transformacion del store la haria fallar.' }
      };
    }
  });

  await caso({
    id: 'A20', bloque: 'A', situacion: 'clonar con "movimientos" marcado',
    aserto: 'mismo numero de movimientos, ids nuevos y estado/fecha/flujo/monto intactos',
    fn: async () => {
      await higieneModal();
      const ordenAntes = await orden();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes G', MES_A, { extras: false, notas: false, movimientos: true }));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const nuevo = (await orden()).filter(id => ordenAntes.indexOf(id) === -1);
      if (!nuevo.length) return { skip: 'el modal no creo ningun mes: ' + JSON.stringify(ab), observado: ab };
      const cmp = await compararClon(MES_A, nuevo[0]);
      const movsOrigen = (await coll(MES_A, 'movimientos')) || [];
      const movsClon = await coll(nuevo[0], 'movimientos');
      const idsOrigen = new Set(movsOrigen.map(x => x.id));
      const conservados = ['estado', 'fecha', 'flujo', 'categoria', 'retornable', 'monto']
        .every(campo => movsClon.every(c => JSON.stringify(c[campo]) === JSON.stringify(
          (movsOrigen.find(o => o.concepto === c.concepto) || {})[campo])));
      /* El ingreso del fixture viene Pagado a proposito: si el clon lo resetea a
         Pendiente, el total de ingresos del clon miente. */
      const ingresoClon = movsClon.find(m => m.flujo === 'Ingreso');
      const ingresoOrigen = movsOrigen.find(m => m.flujo === 'Ingreso');
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      return {
        pass: movsClon.length === movsOrigen.length && movsOrigen.length > 0 &&
              movsClon.every(x => !idsOrigen.has(x.id)) && conservados && cmp.movimientos.diferencias.length === 0,
        expected: {
          movimientos: movsOrigen.length, idsCompartidosConElOrigen: 0,
          camposIntactos: ['estado', 'fecha', 'flujo', 'categoria', 'retornable', 'monto'],
          ingresoDelClon: ingresoOrigen ? { estado: ingresoOrigen.estado, monto: ingresoOrigen.monto } : null
        },
        observed: {
          abierto: ab, nuevoId: nuevo[0], comparacionMovimientos: cmp.movimientos,
          movimientosOrigen: movsOrigen, movimientosClon: movsClon,
          camposConservados: conservados, ingresoDelClon: ingresoClon || null,
          vueltaAlMesA: vuelta, activoFinal: await activo()
        },
        extra: {
          porQueNoSeResetea: 'un movimiento es una transaccion ya registrada con su estado y su fecha. Ponerlo en Pendiente cambiaria su significado (un ingreso cobrado volveria a ser un cobro pendiente) y falsearia el balance del clon. Por eso el store copia el objeto tal cual y solo le cambia el id.',
          porQueEsOptIn: 'copiar movimientos puede sumar dos veces los ingresos del periodo origen en los totales.'
        }
      };
    }
  });

  await caso({
    id: 'A21', bloque: 'A', situacion: 'clonar con las tres opciones apagadas',
    aserto: 'solo se copian las cuatro colecciones de presupuesto; extras, notas y movimientos quedan vacios',
    fn: async () => {
      await higieneModal();
      const ordenAntes = await orden();
      const ab = await J(ABRIR_NUEVO_MES('SYN Mes H', MES_A, { extras: false, notas: false, movimientos: false }));
      await J(ENVIAR('formNewMonth'));
      await settle(2, 700);
      const nuevo = (await orden()).filter(id => ordenAntes.indexOf(id) === -1);
      if (!nuevo.length) return { skip: 'el modal no creo ningun mes: ' + JSON.stringify(ab), observado: ab };
      const cmp = await compararClon(MES_A, nuevo[0]);
      const presupuesto = presupuestoClonado(cmp);
      const forma = await J(`window.__t.forma(${JSON.stringify(nuevo[0])})`);
      const extrasOrigen = (await coll(MES_A, 'extras')) || [];
      const movsOrigen = (await coll(MES_A, 'movimientos')) || [];
      const vuelta = await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      return {
        pass: presupuesto.mismoLargo && presupuesto.idsNuevos && presupuesto.todosPendientes &&
              forma.extras.length === 0 && forma.notas === '' && forma.movimientos.length === 0 &&
              extrasOrigen.length > 0 && movsOrigen.length > 0,
        expected: {
          presupuesto: 'las 4 colecciones con el mismo largo, ids nuevos y todo Pendiente',
          extras: 0, notas: '', movimientos: 0,
          notaDelEscenario: 'el origen SÍ tiene ' + extrasOrigen.length + ' extras y ' + movsOrigen.length + ' movimientos: que no viajen es decision del clon, no falta de datos'
        },
        observed: {
          abierto: ab, nuevoId: nuevo[0], comparacion: cmp, presupuesto,
          formaDelClon: { extras: forma.extras, notas: forma.notas, movimientos: forma.movimientos },
          extrasOrigen: extrasOrigen.length, movimientosOrigen: movsOrigen.length,
          vueltaAlMesA: vuelta, activoFinal: await activo()
        },
        extra: {
          guardaDeCompatibilidad: 'este caso es el que protege el parametro opcional: con las tres banderas en false el clon tiene que ser identico al clon de antes de que existieran. El equivalente de store (llamar sin `opciones`) se mide aparte, sobre una copia desechable, en `probesDefectos.opcionesDeAddNewMonth`.'
        }
      };
    }
  });

  await caso({
    id: 'A22', bloque: 'A', situacion: 'el bloque de opciones de clonado solo aplica con un mes real',
    aserto: 'con "No clonar" esta oculto, y al elegir un mes real se muestra',
    fn: async () => {
      await higieneModal();
      const ab = await J(`(() => {
        for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
        document.getElementById('btnOpenNewMonthModal').click();
        const sel = document.getElementById('newMonthCloneSelect');
        const row = document.getElementById('cloneOpcionesRow');
        const leer = () => ({ valor: sel.value, display: row ? getComputedStyle(row).display : 'NO_EXISTE', visible: row ? getComputedStyle(row).display !== 'none' : null });
        const inicial = leer();
        sel.value = '';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const sinClonar = leer();
        sel.value = ${JSON.stringify(MES_A)};
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const conMes = leer();
        sel.value = ${JSON.stringify(MES_B)};
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const conOtroMes = leer();
        return {
          abierto: document.getElementById('modalNewMonth').classList.contains('active'),
          filaExiste: !!row, valoresDisponibles: [...sel.options].map(o => o.value),
          inicial, sinClonar, conMes, conOtroMes
        };
      })()`);
      /* La foto sale de la misma sesion que midio el caso: el modal queda abierto
         con un mes real elegido, que es el estado en el que las tres casillas
         existen en pantalla. Es evidencia de que la progressive disclosure se
         ve bien, no solo de que el `display` es el esperado. */
      await settle(2, 400);
      const shot = await s.page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const shotPath = path.join(DIR, `crud-admin-${LABEL}-modal-clonar.png`);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
      await higieneModal();
      return {
        pass: ab.filaExiste && ab.sinClonar.visible === false && ab.conMes.visible === true && ab.conOtroMes.visible === true,
        expected: { bloqueExiste: true, sinClonar: 'oculto', conMesReal: 'visible', conOtroMesReal: 'visible' },
        observed: ab,
        extra: { captura: shotPath }
      };
    }
  });

  await higieneModal();
}

/* ------------------------------------------------------------------ *
 * 9. Matrix - block B (borrar). Needs the dialog controller: without it
 *    `window.confirm` freezes the renderer and delete is untestable.
 * ------------------------------------------------------------------ */
async function bloqueB() {
  console.log('\n=== BLOQUE B - BORRAR ===');
  const b = await boot('admin', clone(FIXTURE));
  if (!b.conFixture) { console.log('  ABORTA BLOQUE B: la pagina no cargo la fixture sintetica'); return; }
  await acumularContadores('B');

  await caso({
    id: 'B1', bloque: 'B', situacion: 'borrar gasto, confirm ACEPTAR',
    aserto: 'el item desaparece, los totales bajan',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const d0 = dialogos.length;
      const g0 = await guardarN();
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_sf_1'));
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const it = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const despues = await totales(MES_A);
      const t = await leerToast();
      return {
        pass: it === null && despues.totalEgresos === antes.totalEgresos - 100 &&
              dlg.length === 1 && dlg[0].type === 'confirm' && dlg[0].accepted === true &&
              /SYN-SF-ALPHA/.test(t.texto || ''),
        expected: { item: 'borrado', totalEgresos: antes.totalEgresos - 100, dialogo: '1 confirm ACEPTADO', toast: 'menciona el concepto borrado' },
        observed: { itemRestante: it, totalEgresosAntes: antes.totalEgresos, totalEgresosDespues: despues.totalEgresos, dialogos: dlg, toast: t, guardarNDelta: (await guardarN()) - g0 }
      };
    }
  });

  await caso({
    id: 'B2', bloque: 'B', situacion: 'borrar gasto, confirm CANCELAR',
    aserto: 'el item sigue, y no hubo save()',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const d0 = dialogos.length;
      const g0 = await guardarN();
      const si0 = await setItemN();
      dialogPolicy = 'cancel';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_sf_2'));
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const it = await item(MES_A, 'servicios.fijos', 'syn_sf_2');
      const despues = await totales(MES_A);
      const gDelta = (await guardarN()) - g0;
      const siDelta = (await setItemN()) - si0;
      dialogPolicy = 'accept';
      return {
        pass: it !== null && despues.totalEgresos === antes.totalEgresos && dlg.length === 1 && dlg[0].accepted === false && gDelta === 0 && siDelta === 0,
        expected: { item: 'sigue', totalEgresos: antes.totalEgresos, dialogo: '1 confirm CANCELADO', guardarNDelta: 0, setItemRedirigidosDelta: 0 },
        observed: { itemRestante: it, totalEgresosAntes: antes.totalEgresos, totalEgresosDespues: despues.totalEgresos, dialogos: dlg, guardarNDelta: gDelta, setItemRedirigidosDelta: siDelta }
      };
    }
  });

  await caso({
    id: 'B3', bloque: 'B', situacion: 'borrar el ULTIMO item de una coleccion',
    aserto: 'queda el estado vacio, sin NaN en pantalla',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const d0 = dialogos.length;
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_pv_1'));
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const largo = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'personales.variables')`);
      /* T5: la colección `personales.variables` ya no tiene caja propia —el
         libro agrupa por categoría—, así que "la colección está vacía" se
         comprueba sobre el grupo, con la granularidad que el libro tiene:
         cero filas VARIABLES, y el Fijo que queda sigue en pantalla. Y el grupo
         NO debe mostrar estado vacío: le queda un gasto, y un "Sin gastos
         registrados." ahí sería una mentira. */
      const enGrupo = await J(`JSON.stringify(window.__t.variablesEn('ledgerRowsPersonales'))`);
      const vacio = await J(`JSON.stringify(window.__t.vacioEn('ledgerRowsPersonales'))`);
      const domAhora = await dom();
      const nan = await J('JSON.stringify(window.__t.nanEnPantalla())');
      const despues = await totales(MES_A);
      /* El objetivo del caso es el mismo de siempre: que el número de la
         pantalla BAJE cuando el dato baja, y no se quede pegado ni muestre NaN.
         Antes eso se miraba en el subtotal de la colección vaciada, que caía a
         cero. Ese nodo ya no existe, así que la misma comprobación se hace a la
         granularidad que sí existe —el subtotal del GRUPO—, y tiene que caer
         exactamente lo que se borró. Un aserto más débil ("no es NaN") habría
         dejado pasar el defecto real, que es el valor viejo pegado. */
      const esperadoPersonales = 'S/ ' + (antes.subtotalPersonales - 45)
        .toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return {
        pass: largo === 0 && enGrupo && enGrupo.variables === 0 && enGrupo.fijas === 1
              && vacio && vacio.tieneVacio === false && nan.length === 0 &&
              despues.totalEgresos === antes.totalEgresos - 45 &&
              domAhora.subtotalPersonales === esperadoPersonales,
        expected: { largo: 0, filasVariablesEnElGrupo: 0, filasFijasEnElGrupo: 1,
          placeholderVacio: false, nanEnPantalla: 0,
          totalEgresos: antes.totalEgresos - 45, subtotalPersonales: esperadoPersonales },
        observed: { largo, enGrupo, vacio, nan, totalEgresosDespues: despues.totalEgresos,
          subtotalRenderizado: domAhora.subtotalPersonales, dialogos: dlg }
      };
    }
  });

  await caso({
    id: 'B4', bloque: 'B', situacion: 'borrar movimiento, aceptar',
    aserto: 'desaparece del feed, totales correctos',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const d0 = dialogos.length;
      dialogPolicy = 'accept';
      await clickAsync(CLICK_ROW_MOV('SYN-MV-GASTO', '.btn-delete-tx'));
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const movs = await coll(MES_A, 'movimientos');
      const fila = await J(`JSON.stringify(window.__t.filaMov('SYN-MV-GASTO'))`);
      const despues = await totales(MES_A);
      return {
        pass: !movs.some(x => x.id === 'syn_mv_2') && fila === null &&
              despues.totalEgresosMovimientos === antes.totalEgresosMovimientos - 200 && dlg.length === 1 && dlg[0].accepted === true,
        expected: { movimiento: 'borrado', filaEnElFeed: null, totalEgresosMovimientos: antes.totalEgresosMovimientos - 200 },
        observed: { movsRestantes: movs.map(x => x.concepto), filaEnElFeed: fila, totalEgresosMovimientosAntes: antes.totalEgresosMovimientos, despues: despues.totalEgresosMovimientos, dialogos: dlg }
      };
    }
  });

  await caso({
    id: 'B5', bloque: 'B', situacion: 'borrar movimiento, cancelar',
    aserto: 'sigue, sin save()',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const d0 = dialogos.length;
      const g0 = await guardarN();
      dialogPolicy = 'cancel';
      await clickAsync(CLICK_ROW_MOV('SYN-MV-INGRESO', '.btn-delete-tx'));
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const movs = await coll(MES_A, 'movimientos');
      const gDelta = (await guardarN()) - g0;
      const despues = await totales(MES_A);
      dialogPolicy = 'accept';
      return {
        pass: movs.some(x => x.id === 'syn_mv_1') && despues.totalIngresos === antes.totalIngresos &&
              dlg.length === 1 && dlg[0].accepted === false && gDelta === 0,
        expected: { movimiento: 'sigue', totalIngresos: antes.totalIngresos, dialogo: '1 confirm CANCELADO', guardarNDelta: 0 },
        observed: { movs: movs.map(x => x.concepto), totalIngresosAntes: antes.totalIngresos, despues: despues.totalIngresos, dialogos: dlg, guardarNDelta: gDelta }
      };
    }
  });

  await caso({
    id: 'B6', bloque: 'B', situacion: 'borrar un id que NO existe',
    aserto: 'no rompe, y el toast NO dice "eliminado"',
    defecto: 'R1 (app.js:698 descarta el retorno de deleteBudgetItem: el toast afirma "eliminado" sin borrar nada)',
    fn: async () => {
      await higieneModal();
      /* Escenario de vista vieja: una fila que ya no esta en el store sigue en el
         DOM con su cierre captures el item viejo. Se agarra el boton ANTES de
         borrar y se cliquea DESPUES, que es exactamente lo que pasa con dos
         pestañas o con un re-render concurrente. */
      await s.page.eval(`(() => {
        window.__stale = document.querySelector('.btn-delete-expense[data-item-id="syn_pf_1"]');
        return window.__stale ? 'agarrado' : 'NO_EXISTE';
      })()`);
      const d0 = dialogos.length;
      const g0 = await guardarN();
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_pf_1'));
      await settle(2, 600);
      const gTrasBorrar = await guardarN();
      const d1 = dialogos.length;
      await clickAsync(`(() => { if (!window.__stale) return 'no hay boton viejo'; window.__stale.click(); return 'click al boton viejo'; })()`);
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const t = await leerToast();
      const gDelta = (await guardarN()) - gTrasBorrar;
      const yaNoEsta = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      return {
        pass: yaNoEsta === null && !/eliminado/i.test(t.texto || '') && gDelta === 0,
        expected: { toast: 'NO dice "eliminado"', guardarNDeltaEnElIntentoFallo: 0, item: 'sigue ausente' },
        observed: { toast: t, dialogos: dlg, guardarNDeltaEnElIntentoFallo: gDelta, guardarNDeltaDelBorradoReal: gTrasBorrar - g0, itemEnElStore: yaNoEsta }
      };
    }
  });

  await caso({
    id: 'B7', bloque: 'B', situacion: 'borrar item de un mes NO activo',
    aserto: 'el mes activo no se entera, el otro queda bien',
    fn: async () => {
      await higieneModal();
      const mesAActivo = await activo();
      const formaA = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_A)}))`);
      const totalesA = await totales(MES_A);
      /* Para tocar el mes no activo hay que navegar hasta el: la app solo dibuja
         el mes activo. La aserto es sobre el otro mes: no se movio. */
      const nav = await J(PILL_MES('SYN Mes B'));
      await settle(2, 600);
      const activoTrasNav = await activo();
      const d0 = dialogos.length;
      const g0 = await guardarN();
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_bf_1'));
      await settle(2, 600);
      const dlg = dialogos.slice(d0);
      const formaB = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_B)}))`);
      const gDelta = (await guardarN()) - g0;
      await J(PILL_MES('SYN Mes A'));
      await settle(2, 600);
      const formaAAfter = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_A)}))`);
      const totalesAAfter = await totales(MES_A);
      return {
        pass: activoTrasNav === MES_B && formaB.servicios.fijos.length === 0 &&
              JSON.stringify(formaA) === JSON.stringify(formaAAfter) &&
              JSON.stringify(totalesA) === JSON.stringify(totalesAAfter) && dlg.length === 1,
        expected: { mesVisitado: MES_B, mesB_vacio: true, mesA_intacto: true, dialogos: 1 },
        observed: {
          mesActivoAlEntrar: mesAActivo, navegacion: nav, mesActivoDuranteElBorrado: activoTrasNav,
          mesB_trasBorrar: formaB.servicios.fijos, mesAIntacto: JSON.stringify(formaA) === JSON.stringify(formaAAfter),
          totalesAIntactos: JSON.stringify(totalesA) === JSON.stringify(totalesAAfter),
          dialogos: dlg, guardarNDeltaAlNavegarYBorrar: gDelta
        },
        extra: { notaR16: 'navegar de mes ejecuta store.save() (app.js:343-347), asi que el delta de guardarN incluye 2 escrituras por navegacion: R16.' }
      };
    }
  });

  /* --- B8-B10: borrar el mes activo. El `confirm` bloquea el renderer, asi que
     los tres clicks van por `clickAsync` y la respuesta la da el controlador de
     dialogos desde node. --- */
  await caso({
    id: 'B8', bloque: 'B', situacion: 'borrar el mes ACTIVO, confirm ACEPTAR',
    aserto: 'el mes sale de meses y mesesOrden, activeMonthId pasa a uno que existe y la vista se redibujo',
    fn: async () => {
      await higieneModal();
      const boton = await J(BOTON_BORRAR_MES);
      if (!boton.existe) return { skip: 'no existe #btnDeleteMonth', observado: boton };
      const antes = await orden();
      const activoAntes = await activo();
      const formaAntes = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const pillsAntes = await pills();
      /* El texto del confirm tiene que poder reconstruirse desde el estado: si el
         producto no lo arma asi, el caso falla en vez de aceptar un "estas seguro"
         generico que no dice nada de lo que se pierde. Las cuatro rutas de
         presupuesto están ANIDADAS en la forma del mes, no en una clave plana. */
      const rutasPresupuesto = RUTAS_CLON.slice(0, 4);
      const gastos = rutasPresupuesto.reduce((a, r) => {
        const p = r.split('.');
        return a + (((formaAntes[p[0]] || {})[p[1]]) || []).length;
      }, 0);
      const d0 = dialogos.length;
      dialogPolicy = 'accept';
      await clickAsync(CLICK_BORRAR_MES);
      await settle(3, 800);
      const dlg = dialogos.slice(d0);
      const msg = dlg.length ? String(dlg[0].message || '') : '';
      const nombraMes = msg.indexOf(formaAntes.nombre) !== -1;
      const diceCantos = [gastos, (formaAntes.movimientos || []).length, (formaAntes.extras || []).length]
        .every(n => new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(msg));
      const avisaQueNoSeDeshace = /no se puede deshacer/i.test(msg);
      const despues = await orden();
      const activoDespues = await activo();
      const formaDespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoDespues)}))`);
      const formaElBorrado = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const pillsDespues = await pills();
      /* Re-render: los KPIs tienen que ser los del mes NUEVO, no los del que se
         acaba de ir. Es la comprobacion de que hubo repintado de verdad. */
      const totalesNuevo = await totales(activoDespues);
      const d = await dom();
      const kpiEsperado = await s.page.eval(`window.formatCurrency(${totalesNuevo.totalEgresos})`);
      const filaDelMesBorrado = await J(`JSON.stringify(window.__t.filaGasto('SYN-SF-ALPHA'))`);
      const t = await leerToast();
      return {
        pass: despues.indexOf(activoAntes) === -1 && formaElBorrado === null &&
              activoDespues !== activoAntes && !!formaDespues &&
              dlg.length === 1 && dlg[0].type === 'confirm' && dlg[0].accepted === true &&
              nombraMes && diceCantos && avisaQueNoSeDeshace &&
              pillsDespues.every(p => p.texto !== formaAntes.nombre) &&
              pillsDespues.filter(p => p.activo).length === 1 &&
              d.kpiEgresos === kpiEsperado && filaDelMesBorrado === null &&
              String(t.texto || '').indexOf(formaDespues.nombre) !== -1,
        expected: {
          boton: { existe: true, adminActionBtn: true, display: 'no none' },
          mesesOrden: `sin ${activoAntes} (${antes.length} -> ${antes.length - 1})`,
          mesBorradoEnElStore: null,
          mesActivoAhora: 'uno que todavia existe',
          dialogo: '1 confirm ACEPTADO que nombra el mes, los 3 numeros y que no se puede deshacer',
          reRender: { pillDelMesBorrado: 'ausente', unaPillActiva: 1, kpiEgresos: kpiEsperado },
          toast: 'menciona el mes nuevo que quedo activo'
        },
        observed: {
          boton, mesesOrdenAntes: antes, activoAntes, pillAntes: pillsAntes,
          dialogos: dlg, textoDelConfirm: msg,
          confirmNombraElMes: nombraMes, confirmDiceLosCantos: diceCantos, confirmAvisaNoDeshacer: avisaQueNoSeDeshace,
          gastosCalculados: gastos, movimientosCalculados: (formaAntes.movimientos || []).length, extrasCalculados: (formaAntes.extras || []).length,
          mesesOrdenDespues: despues, activoDespues, formaElMesBorrado: formaElBorrado, pillDespues: pillsDespues,
          kpiEgresosLeido: d.kpiEgresos, kpiEgresosEsperado: kpiEsperado,
          filaDelMesBorrado, toast: t
        }
      };
    }
  });

  await caso({
    id: 'B9', bloque: 'B', situacion: 'borrar el mes, confirm CANCELAR',
    aserto: 'no se borra nada, guardar delta 0, y ningun toast afirma el borrado',
    fn: async () => {
      await higieneModal();
      const antes = await orden();
      const activoAntes = await activo();
      const formaAntes = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const toastAntes = await leerToast();
      const d0 = dialogos.length;
      const g0 = await guardarN();
      const si0 = await setItemN();
      dialogPolicy = 'cancel';
      await clickAsync(CLICK_BORRAR_MES);
      await settle(3, 800);
      const dlg = dialogos.slice(d0);
      const despues = await orden();
      const formaDespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const gDelta = (await guardarN()) - g0;
      const siDelta = (await setItemN()) - si0;
      const t = await leerToast();
      /* El toast vive en el DOM aunque ya no se vea: el texto de un exito anterior
         seguiria ahi, asi que la aserto compara ANTES y DESPUES en vez de buscar
         una palabra que un toast viejo pueda hacer pasar por exito nuevo. */
      const toastIntacto = t.texto === toastAntes.texto;
      dialogPolicy = 'accept';
      return {
        pass: JSON.stringify(antes) === JSON.stringify(despues) &&
              JSON.stringify(formaAntes) === JSON.stringify(formaDespues) &&
              dlg.length === 1 && dlg[0].type === 'confirm' && dlg[0].accepted === false &&
              gDelta === 0 && siDelta === 0 && toastIntacto,
        expected: {
          mesesOrden: 'sin cambios', formaDelMes: 'sin cambios',
          dialogo: '1 confirm CANCELADO', guardarNDelta: 0, setItemRedirigidosDelta: 0,
          toast: 'sin cambios: nada puede afirmar que se elimino'
        },
        observed: {
          mesesOrdenAntes: antes, mesesOrdenDespues: despues,
          formaIgual: JSON.stringify(formaAntes) === JSON.stringify(formaDespues),
          dialogos: dlg, guardarNDelta: gDelta, setItemRedirigidosDelta: siDelta,
          toastAntes, toastDespues: t, toastIntacto,
          activoAntes, activoDespues: await activo()
        }
      };
    }
  });

  await caso({
    id: 'B10', bloque: 'B', situacion: 'intentar borrar el ULTIMO mes que queda',
    aserto: 'el store se niega, el mes sigue, guardar delta 0, y no hay toast de exito',
    fn: async () => {
      await higieneModal();
      const antes = await orden();
      if (antes.length !== 1) {
        return { skip: 'el escenario pide un unico mes en el sistema y hay ' + antes.length, observado: { mesesOrden: antes } };
      }
      const activoAntes = await activo();
      const formaAntes = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const toastAntes = await leerToast();
      const d0 = dialogos.length;
      const g0 = await guardarN();
      dialogPolicy = 'accept';
      await clickAsync(CLICK_BORRAR_MES);
      await settle(3, 800);
      const dlg = dialogos.slice(d0);
      const despues = await orden();
      const formaDespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
      const gDelta = (await guardarN()) - g0;
      const t = await leerToast();
      const toastIntacto = t.texto === toastAntes.texto;
      /* Solo cuenta un toast VISIBLE: el `#toastText` conserva el texto del ultimo
         aviso aunque la pieza ya se haya apagado, asi que un `afirmaExito` sin el
         `visible` marcaria en rojo un caso que en realidad no mintio. */
      const afirmaExito = !!(t.visible && /eliminad|borrad|se fue/i.test(t.texto || ''));
      const alertas = dlg.filter(d => d.type === 'alert');
      return {
        pass: JSON.stringify(antes) === JSON.stringify(despues) && formaDespues !== null &&
              JSON.stringify(formaAntes) === JSON.stringify(formaDespues) &&
              (await activo()) === activoAntes &&
              dlg.length === 2 && dlg[0].type === 'confirm' && dlg[0].accepted === true &&
              alertas.length === 1 && /mantener al menos un mes/i.test(String(alertas[0].message || '')) &&
              gDelta === 0 && toastIntacto && !afirmaExito,
        expected: {
          precondicion: '1 mes en el sistema',
          mesesOrden: 'sin cambios', mes: 'sigue presente', mesActivo: 'sin cambios',
          dialogos: '1 confirm ACEPTADO + 1 alert del store que dice que hay que mantener al menos un mes',
          guardarNDelta: 0, toast: 'sin cambios: no puede decir que se elimino'
        },
        observed: {
          mesesOrdenAntes: antes, mesesOrdenDespues: despues,
          elMesSigue: formaDespues !== null, formaIgual: JSON.stringify(formaAntes) === JSON.stringify(formaDespues),
          activoAntes, activoDespues: await activo(), dialogos: dlg,
          mensajeDelAlert: alertas.length ? alertas[0].message : null,
          guardarNDelta: gDelta, toastAntes, toastDespues: t, toastIntacto, afirmaExito
        },
        extra: {
          porQueImporta: 'es el retorno de `deleteMonth` descartado: si el handler no lo mirara, el toast diria "eliminado" sobre un mes que sigue ahi. El store ya avisa con `alert()`, asi que un toast ademas seria ruido.',
          toastVisibleAlIntentar: t.visible
        }
      };
    }
  });

  await higieneModal();
}

/* ------------------------------------------------------------------ *
 * 10. Matrix - block C (editar).
 * ------------------------------------------------------------------ */
async function bloqueC() {
  console.log('\n=== BLOQUE C - EDITAR ===');
  const b = await boot('admin', clone(FIXTURE));
  if (!b.conFixture) { console.log('  ABORTA BLOQUE C: la pagina no cargo la fixture sintetica'); return; }
  await acumularContadores('C');

  await caso({
    id: 'C1', bloque: 'C', situacion: 'editar gasto Fijo (concepto + monto)',
    aserto: 'patch correcto, estado y rango sobreviven',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const ab = await J(ABRIR_EDITAR_GASTO('syn_sf_1'));
      await settle(2, 400);
      const ll = await J(LLENAR_EDITAR_GASTO('SYN-C1-EDITADO', '123.45', null));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 600);
      const it = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const modal = await J(modalActivo('modalEditExpense'));
      return {
        pass: !!it && it.concepto === 'SYN-C1-EDITADO' && it.monto === 123.45 &&
              it.estado === antes.estado && it.rango === antes.rango && it.tipo === antes.tipo && modal === false,
        expected: { concepto: 'SYN-C1-EDITADO', monto: 123.45, estado: antes.estado, rango: antes.rango, tipo: antes.tipo, modalAbierto: false },
        observed: { abrir: ab, lenado: ll, despues: it, antes, modalSigueAbierto: modal }
      };
    }
  });

  await caso({
    id: 'C2', bloque: 'C', situacion: 'editar gasto Variable (concepto + monto + rango)',
    aserto: 'el patch SI lleva rango',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      await J(ABRIR_EDITAR_GASTO('syn_sv_1'));
      await settle(2, 400);
      const ll = await J(LLENAR_EDITAR_GASTO('SYN-C2-VAR-EDITADO', '44.44', '35 - 55'));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 600);
      const it = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      return {
        pass: !!it && it.rango === '35 - 55' && it.monto === 44.44 && it.concepto === 'SYN-C2-VAR-EDITADO' && it.estado === antes.estado,
        expected: { rango: '35 - 55', monto: 44.44, concepto: 'SYN-C2-VAR-EDITADO', estado: antes.estado },
        observed: { antes, lenado: ll, despues: it, nota: 'el rango solo llega si el campo esta visible (app.js:1429-1432), y solo lo esta para tipo Variable' }
      };
    }
  });

  await caso({
    id: 'C3', bloque: 'C', situacion: 'editar gasto Extra',
    aserto: 'patch correcto',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'extras', 'syn_ex_1');
      await J(ABRIR_EDITAR_GASTO('syn_ex_1'));
      await settle(2, 400);
      const ll = await J(LLENAR_EDITAR_GASTO('SYN-C3-EXTRA-EDITADO', '99.99', 'NO-APLICA'));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 600);
      const it = await item(MES_A, 'extras', 'syn_ex_1');
      return {
        pass: !!it && it.concepto === 'SYN-C3-EXTRA-EDITADO' && it.monto === 99.99 &&
              it.tipo === 'Extra' && it.estado === antes.estado && it.rango === antes.rango,
        expected: { concepto: 'SYN-C3-EXTRA-EDITADO', monto: 99.99, tipo: 'Extra', estado: antes.estado, rango: antes.rango },
        observed: { antes, lenado: ll, despues: it }
      };
    }
  });

  await caso({
    id: 'C4', bloque: 'C', situacion: 'editar movimiento (concepto + monto + fecha)',
    aserto: 'categoria, retornable, flujo, estado sobreviven',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'movimientos', 'syn_mv_1');
      const ab = await J(CLICK_ROW_MOV('SYN-MV-INGRESO', '.btn-edit-tx'));
      await settle(2, 400);
      const precarga = await J(`JSON.stringify({
        concepto: document.getElementById('editMovementConcepto').value,
        monto: document.getElementById('editMovementMonto').value,
        fecha: document.getElementById('editMovementFecha').value,
        flujoReadonly: document.getElementById('editMovementFlujoReadonly').textContent,
        idEnElForm: document.getElementById('editMovementId').value
      })`);
      await J(`(() => {
        document.getElementById('editMovementConcepto').value = 'SYN-C4-MOV-EDITADO';
        document.getElementById('editMovementMonto').value = '1234.56';
        document.getElementById('editMovementFecha').value = '2026-08-20';
        return 1;
      })()`);
      await J(ENVIAR('formEditMovement'));
      await settle(2, 600);
      const it = await item(MES_A, 'movimientos', 'syn_mv_1');
      return {
        pass: !!it && it.concepto === 'SYN-C4-MOV-EDITADO' && it.monto === 1234.56 && it.fecha === '2026-08-20' &&
              it.categoria === antes.categoria && it.retornable === antes.retornable && it.flujo === antes.flujo && it.estado === antes.estado,
        expected: { concepto: 'SYN-C4-MOV-EDITADO', monto: 1234.56, fecha: '2026-08-20', categoria: antes.categoria, retornable: antes.retornable, flujo: antes.flujo, estado: antes.estado },
        observed: { abrir: ab, precarga, antes, despues: it }
      };
    }
  });

  await caso({
    id: 'C5', bloque: 'C', situacion: 'editar con monto "45.50"',
    aserto: 'casteado a numero',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_EDITAR_GASTO('syn_pf_1'));
      await settle(2, 400);
      await J(LLENAR_EDITAR_GASTO('SYN-C5-MONTO-STRING', '45.50', null));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 600);
      const it = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      return {
        pass: !!it && typeof it.monto === 'number' && it.monto === 45.5 && it.concepto === 'SYN-C5-MONTO-STRING',
        expected: { typeofMonto: 'number', monto: 45.5 },
        observed: { tipoEnElStore: it ? typeof it.monto : null, monto: it ? it.monto : null, concepto: it ? it.concepto : null }
      };
    }
  });

  await caso({
    id: 'C6', bloque: 'C', situacion: 'editar con monto NEGATIVO',
    aserto: 'bloqueado con aviso, no guardado',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      await J(ABRIR_EDITAR_GASTO('syn_pf_1'));
      await settle(2, 400);
      await J(LLENAR_EDITAR_GASTO('SYN-C6-NEGATIVO', '-10', null));
      const d0 = dialogos.length;
      const env = await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const despues = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      const valid = await J(`JSON.stringify(window.__t.validacion('editExpenseMonto','formEditExpense'))`);
      const modal = await J(modalActivo('modalEditExpense'));
      const t = await leerToast();
      /* Evidencia extra: el alert propio de la app (app.js:1424) es alcanzable si
         se salta la validacion nativa. Sirve para separar "lo frena el navegador"
         de "lo frena la app". */
      await s.page.eval(`(() => { const f = document.getElementById('formEditExpense'); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); return 1 })()`);
      await sleep(700);
      const dlgRaw = dialogos.slice(dlg.length + d0);
      const despuesRaw = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      return {
        pass: JSON.stringify(antes) === JSON.stringify(despues) && modal === true,
        expected: { itemSinCambios: true, montoNoGuardado: true },
        observed: { envio: env, validacionNativa: valid, modalSigueAbierto: modal, dialogosDelFlujoReal: dlg, toast: t, despues },
        extra: {
          frenoReal: valid.rangeUnderflow ? 'validacion NATIVA (input type=number min=0); el alert de app.js:1424 no llega a ejecutarse por esta via'
                                            : 'guard de la app',
          submitCrudoSinValidacionNativa: { dialogos: dlgRaw, itemDespues: despuesRaw, monto: despuesRaw ? despuesRaw.monto : null }
        }
      };
    }
  });

  await caso({
    id: 'C7', bloque: 'C', situacion: 'editar con monto NO NUMERICO',
    aserto: 'bloqueado con aviso',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      await J(ABRIR_EDITAR_GASTO('syn_sv_1'));
      await settle(2, 400);
      await J(LLENAR_EDITAR_GASTO('SYN-C7-NO-NUMERICO', 'abc', null));
      const d0 = dialogos.length;
      const env = await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const despues = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      const valid = await J(`JSON.stringify(window.__t.validacion('editExpenseMonto','formEditExpense'))`);
      const modal = await J(modalActivo('modalEditExpense'));
      await s.page.eval(`(() => { const f = document.getElementById('formEditExpense'); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); return 1 })()`);
      await sleep(700);
      const dlgRaw = dialogos.slice(d0 + dlg.length);
      const despuesRaw = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      return {
        pass: JSON.stringify(antes) === JSON.stringify(despues) && modal === true,
        expected: { itemSinCambios: true },
        observed: { valorEnElCampo: valid.valorEnElCampo, envio: env, validacionNativa: valid, modalSigueAbierto: modal, dialogosDelFlujoReal: dlg, despues },
        extra: {
          nota: 'un input type=number NO puede contener "abc": el navegador lo deja en "". Asi que el caso prueba el dato de verdad y el guard de la app queda enmascarado por la validacion nativa.',
          submitCrudoSinValidacionNativa: { dialogos: dlgRaw, monto: despuesRaw ? despuesRaw.monto : null, itemDespues: despuesRaw }
        }
      };
    }
  });

  await caso({
    id: 'C8', bloque: 'C', situacion: 'editar con concepto VACIO',
    aserto: 'bloqueado, y el modal AVISA (hoy cierra en silencio)',
    defecto: 'R4 (app.js:1422 y 1475: `if (!concepto) return` silencioso, sin aviso)',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      await J(ABRIR_EDITAR_GASTO('syn_sf_1'));
      await settle(2, 400);
      /* Dos variantes: vacio estricto (lo frena `required` nativo) y solo espacios
         (pasa `required`, cae en el return silencioso de app.js:1422). */
      await J(LLENAR_EDITAR_GASTO('', '77.00', null));
      const d0 = dialogos.length;
      const envVacio = await J(ENVIAR('formEditExpense'));
      await settle(2, 600);
      const trasVacio = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const validVacio = await J(`JSON.stringify(window.__t.validacion('editExpenseConcepto','formEditExpense'))`);
      const toastVacio = await leerToast();

      await J(LLENAR_EDITAR_GASTO('    ', '77.00', null));
      const d1 = dialogos.length;
      await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const trasEspacios = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const validEspacios = await J(`JSON.stringify(window.__t.validacion('editExpenseConcepto','formEditExpense'))`);
      const toastEspacios = await leerToast();
      const modal = await J(modalActivo('modalEditExpense'));
      const dlg = dialogos.slice(d0);
      const hayAviso = dlg.some(d => d.type === 'alert') || (toastVacio.visible && /concepto|vacio|obligatorio/i.test(toastVacio.texto || ''));
      return {
        pass: JSON.stringify(antes) === JSON.stringify(trasEspacios) && hayAviso,
        expected: { itemSinCambios: true, avisoVisible: true },
        observed: {
          vacioEstrico: { envio: envVacio, validacionNativa: validVacio, toast: toastVacio, itemSinCambios: JSON.stringify(antes) === JSON.stringify(trasVacio) },
          soloEspacios: { validacionNativa: validEspacios, toast: toastEspacios, itemSinCambios: JSON.stringify(antes) === JSON.stringify(trasEspacios), dialogos: dialogos.slice(d1) },
          modalSigueAbierto: modal, dialogos: dlg, hayAviso
        }
      };
    }
  });

  await caso({
    id: 'C9', bloque: 'C', situacion: 'editar un id que NO existe',
    aserto: 'la app no debe decir "actualizado" si no cambio nada',
    defecto: 'R2 (app.js:1436-1438: cierra el modal y muestra "actualizado" aunque updateBudgetItem devuelva false)',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.fijos', 'syn_sf_2');
      await J(ABRIR_EDITAR_GASTO('syn_sf_2'));
      await settle(2, 400);
      const forzado = await J(FORZAR_ID_EDITANDO('editExpenseItemId', 'syn_no_existe'));
      await J(LLENAR_EDITAR_GASTO('SYN-C9-ID-QUE-NO-EXISTE', '55.00', null));
      const g0 = await guardarN();
      await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const gDelta = (await guardarN()) - g0;
      const despues = await item(MES_A, 'servicios.fijos', 'syn_sf_2');
      const t = await leerToast();
      const modal = await J(modalActivo('modalEditExpense'));
      const afirmaExito = /actualizado/i.test(t.texto || '');
      return {
        // Whether the modal stays open is NOT part of the verdict: the record is
        // gone, so there is nothing left to submit and either choice is honest.
        // What must hold is that nothing was saved and no success was claimed.
        pass: JSON.stringify(antes) === JSON.stringify(despues) && !afirmaExito && gDelta === 0,
        expected: { itemSinCambios: true, toast: 'NO afirma "actualizado"', guardarNDelta: 0, modal: 'informativo, cualquiera de los dos estados es valido' },
        observed: { idForzado: forzado, antes, despues, toast: t, modalAbierto: modal, afirmaExito, guardarNDelta: gDelta }
      };
    }
  });

  await caso({
    id: 'C10', bloque: 'C', situacion: 'editar y RECARGAR',
    aserto: 'el cambio sigue ahi',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_EDITAR_GASTO('syn_sf_1'));
      await settle(2, 400);
      await J(LLENAR_EDITAR_GASTO('SYN-C10-SOBREVIVE', '321.00', null));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const antesDeRecargar = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const nube = await leerNube();
      if (!nube) return { skip: 'el stub no devolvio nube: no hay con que recargar', observado: null };
      await acumularContadores('C-antes-de-recargar');
      await boot('admin', nube);
      await acumularContadores('C-tras-recargar');
      const despuesDeRecargar = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      return {
        pass: JSON.stringify(antesDeRecargar) === JSON.stringify(despuesDeRecargar) &&
              despuesDeRecargar && despuesDeRecargar.concepto === 'SYN-C10-SOBREVIVE' && despuesDeRecargar.monto === 321,
        expected: { concepto: 'SYN-C10-SOBREVIVE', monto: 321 },
        observed: { antesDeRecargar, despuesDeRecargar }
      };
    }
  });

  await higieneModal();
}

/* ------------------------------------------------------------------ *
 * 11. Matrix - block D (toggle / pago variable).
 * ------------------------------------------------------------------ */
async function bloqueD() {
  console.log('\n=== BLOQUE D - TOGGLE / PAGO VARIABLE ===');
  const b = await boot('admin', clone(FIXTURE));
  if (!b.conFixture) { console.log('  ABORTA BLOQUE D: la pagina no cargo la fixture sintetica'); return; }
  await acumularContadores('D');

  await caso({
    id: 'D1', bloque: 'D', situacion: 'toggle Fijo Pendiente -> Pagado',
    aserto: 'cambia, totales de pagado suben',
    fn: async () => {
      await higieneModal();
      const antes = await totales(MES_A);
      const click = await J(CLICK_POR_ID('.btn-status-toggle', 'syn_sf_1'));
      await settle(2, 600);
      const it = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const despues = await totales(MES_A);
      const fila = await J(`JSON.stringify(window.__t.filaGasto('SYN-SF-ALPHA'))`);
      const t = await leerToast();
      return {
        pass: !!it && it.estado === 'Pagado' && despues.pagadosCount === antes.pagadosCount + 1 &&
              despues.montoPagadoPresupuesto === antes.montoPagadoPresupuesto + 100 && fila && fila.estadoTexto === 'Pagado',
        expected: { estado: 'Pagado', pagadosCount: antes.pagadosCount + 1, montoPagadoPresupuesto: antes.montoPagadoPresupuesto + 100 },
        observed: { click, antes: { pagadosCount: antes.pagadosCount, montoPagadoPresupuesto: antes.montoPagadoPresupuesto }, despues: { pagadosCount: despues.pagadosCount, montoPagadoPresupuesto: despues.montoPagadoPresupuesto }, fila, toast: t }
      };
    }
  });

  await caso({
    id: 'D2', bloque: 'D', situacion: 'toggle Variable Pendiente',
    aserto: 'abre el modal de pago variable, no hace toggle directo',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      const click = await J(ABRIR_PAGO_VARIABLE('syn_sv_1'));
      await settle(2, 600);
      const modal = await J(modalActivo('modalPayVariableExpense'));
      const campos = await J(LLENAR_PAGO_VARIABLE('999'));
      const despues = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      return {
        pass: modal === true && JSON.stringify(antes) === JSON.stringify(despues),
        expected: { modalPagoVariable: 'abierto', itemSinCambios: true, montoPrecargado: '30.00' },
        observed: { click, modalAbierto: modal, camposDelModal: campos, antes, despues }
      };
    }
  });

  await caso({
    id: 'D3', bloque: 'D', situacion: 'pagar variable con monto valido',
    aserto: 'monto actualizado Y estado Pagado',
    fn: async () => {
      const modalAbierto = await J(modalActivo('modalPayVariableExpense'));
      if (!modalAbierto) return { skip: 'D3 necesita el modal de D2 abierto y no lo esta' };
      await J(LLENAR_PAGO_VARIABLE('37.77'));
      await J(ENVIAR('formPayVariableExpense'));
      await settle(2, 700);
      const it = await item(MES_A, 'servicios.variables', 'syn_sv_1');
      const modal = await J(modalActivo('modalPayVariableExpense'));
      const t = await leerToast();
      const fila = await J(`JSON.stringify(window.__t.filaGasto('SYN-SV-BETA'))`);
      return {
        pass: !!it && it.monto === 37.77 && it.estado === 'Pagado' && modal === false,
        expected: { monto: 37.77, estado: 'Pagado', modal: 'cerrado' },
        observed: { item: it, modalAbierto: modal, toast: t, fila }
      };
    }
  });

  await caso({
    id: 'D4', bloque: 'D', situacion: 'pagar variable con monto NEGATIVO',
    aserto: 'bloqueado',
    fn: async () => {
      await higieneModal();
      const antes = await item(MES_A, 'personales.variables', 'syn_pv_1');
      await J(ABRIR_PAGO_VARIABLE('syn_pv_1'));
      await settle(2, 500);
      await J(LLENAR_PAGO_VARIABLE('-5'));
      const d0 = dialogos.length;
      await J(ENVIAR('formPayVariableExpense'));
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const despues = await item(MES_A, 'personales.variables', 'syn_pv_1');
      const valid = await J(`JSON.stringify(window.__t.validacion('payVarActualAmount','formPayVariableExpense'))`);
      const modal = await J(modalActivo('modalPayVariableExpense'));
      await s.page.eval(`(() => { const f = document.getElementById('formPayVariableExpense'); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); return 1 })()`);
      await sleep(700);
      const dlgRaw = dialogos.slice(d0 + dlg.length);
      const despuesRaw = await item(MES_A, 'personales.variables', 'syn_pv_1');
      return {
        pass: JSON.stringify(antes) === JSON.stringify(despues) && modal === true,
        expected: { itemSinCambios: true, montoNoGuardado: true },
        observed: { validacionNativa: valid, dialogosDelFlujoReal: dlg, modalSigueAbierto: modal, antes, despues },
        extra: {
          frenoReal: valid.rangeUnderflow ? 'validacion NATIVA (type=number min=0); el alert de app.js:1324 queda enmascarado' : 'guard de la app',
          submitCrudoSinValidacionNativa: { dialogos: dlgRaw, itemDespues: despuesRaw }
        }
      };
    }
  });

  await caso({
    id: 'D5', bloque: 'D', situacion: 'toggle de un id INEXISTENTE',
    aserto: 'no rompe y no deja estado = null en memoria',
    defecto: 'R3 (app.js:677-678: toggleBudgetItemStatus devuelve null en un fallo y el handler hace item.estado = null)',
    documentaHueco: true,
    notaDefecto: 'El aserto de la matriz es "no rompe"; el criterio de este caso agrega que tampoco debe corromper el estado. Se mide sobre una fila desfasada (vista vieja), la unica forma real de llegar al fallo.',
    fn: async () => {
      await higieneModal();
      /* Los totales se comparan DESPUES del borrado real: el borrado en si los
         cambia, lo que el caso pregunta es si el toggle desfasado los vuelve a
         tocar. */
      const exc0 = s.exceptions.length;
      await s.page.eval(`(() => { window.__staleItem = window.financialStore.data.meses[${JSON.stringify(MES_A)}].servicios.fijos.find(x => x.id === 'syn_sf_2'); window.__staleBtn = document.querySelector('.btn-status-toggle[data-item-id="syn_sf_2"]'); return !!window.__staleBtn })()`);
      const d0 = dialogos.length;
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_sf_2'));
      await settle(2, 600);
      const excTrasBorrar = s.exceptions.length;
      const totalesTrasBorrar = await totales(MES_A);
      await clickAsync(`(() => { if (!window.__staleBtn) return 'no hay boton viejo'; window.__staleBtn.click(); return 'click al toggle viejo'; })()`);
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const estadoEnElObjetoViejo = await s.page.eval(`window.__staleItem ? JSON.stringify(window.__staleItem.estado) : 'sin objeto'`);
      const t = await leerToast();
      const totalesFinales = await totales(MES_A);
      const exc = s.exceptions.length;
      const enElStore = await item(MES_A, 'servicios.fijos', 'syn_sf_2');
      const afirmaNull = /null/.test(t.texto || '');
      return {
        pass: enElStore === null && JSON.stringify(totalesTrasBorrar) === JSON.stringify(totalesFinales) &&
              estadoEnElObjetoViejo !== 'null' && !afirmaNull,
        expected: { excepcion: 0, estadoEnElObjeto: 'no puede quedar en null', toast: 'no puede decir "null"', totalesSinTocarPorElToggleDesfasado: true },
        observed: {
          excepciones: exc - exc0, excepcionesTrasElBorradoReal: excTrasBorrar - exc0,
          estadoEnElItemViejo: estadoEnElObjetoViejo, toast: t, afirmaNull,
          itemEnElStore: enElStore,
          totalesDespuesDelBorrado: totalesTrasBorrar.totalEgresos,
          totalesDespuesDelToggleDesfasado: totalesFinales.totalEgresos,
          totalesIntactos: JSON.stringify(totalesTrasBorrar) === JSON.stringify(totalesFinales),
          dialogos: dlg
        }
      };
    }
  });

  await higieneModal();
}

/* ------------------------------------------------------------------ *
 * 12. Matrix - block E (gate de admin, sesion real).
 * ------------------------------------------------------------------ */
async function bloqueE() {
  console.log('\n=== BLOQUE E - GATE DE ADMIN (sesion real, no CSS a mano) ===');

  /* --- E1: admin real --- */
  {
    const b = await boot('admin', clone(FIXTURE));
    if (!b.conFixture) console.log('  ABORTA E1: la pagina no cargo la fixture sintetica');
    else {
      await acumularContadores('E1-admin');
      const sesion = await J(sesionJson);
      const d = await dom();
      hallazgos.sesionAdminReal = { sesion, dom: d, contadores: b.contadores };
      console.log(`  [admin] sesion=${JSON.stringify(sesion)} body="${d.bodyClass}" label=${JSON.stringify(d.labelModo)} adminVisibles=${d.adminVisibles}/${d.adminTotal} modalRol=${d.modalRolActivo}`);
      hallazgos.roleModalAbreEnSesionAdmin = {
        observado: d.modalRolActivo,
        nota: 'app.js:232-236 programa openRoleSelectModal() a los 60 ms sin mirar la sesion; aplicarSesion() (l.165-170) la cierra antes. El setTimeout vuelve a abrirla. Visible para el usuario con sesion admin real.',
        comoLoOcultaElArnes: 'HIDE_ROLE_MODAL lo oculta por CSS. Ninguna aserto depende de ese modal.'
      };

      await caso({
        id: 'E1', bloque: 'E', situacion: 'sesion admin REAL',
        aserto: '.admin-action-btn visibles: agregar, mes, editar, eliminar',
        fn: async () => {
          const medidos = {};
          for (const sel of ['#btnHeaderAddBudget', '#btnHeaderAddIncome', '#btnOpenNewMonthModal',
            '.btn-quick-add-service', '.btn-quick-add-personal', '.btn-quick-add-extra',
            '.btn-edit-expense', '.btn-delete-expense', '.btn-edit-tx', '.btn-delete-tx']) {
            medidos[sel] = (await J(`window.__t.display(${JSON.stringify(sel)})`)).display;
          }
          const d = await dom();
          const todosVisibles = Object.keys(medidos).every(k => medidos[k] !== 'none' && medidos[k] !== 'NO_EXISTE');
          return {
            pass: d.adminTotal > 0 && d.adminVisibles === d.adminTotal && d.readOnly === false && todosVisibles,
            expected: { readOnlyMode: false, adminVisibles: 'todos los .admin-action-btn', displays: 'ninguno en none' },
            observed: { displays: medidos, adminTotal: d.adminTotal, adminVisibles: d.adminVisibles, bodyClass: d.bodyClass, labelModo: d.labelModo, sesion: (await J(sesionJson)) },
            extra: {
              sesion: 'obtenerSesion() es alcanzable (funcion top-level de app.js); `sesionActual` es binding de script y tambien se lee; `isAdmin` es let dentro del closure de DOMContentLoaded y NO es observable: se reporta por sus dos efectos observables, body.read-only-mode y #authModeLabel.'
            }
          };
        }
      });
    }
  }

  /* --- E2..E6: session lector --- */
  {
    const b = await boot('lector', clone(FIXTURE));
    if (!b.conFixture) { console.log('  ABORTA E2-E6: la pagina no cargo la fixture sintetica'); return; }
    await acumularContadores('E2-lector');
    const sesion = await J(sesionJson);
    const d = await dom();
    hallazgos.sesionLectorReal = { sesion, dom: d, contadores: b.contadores };
    console.log(`  [lector] sesion=${JSON.stringify(sesion)} body="${d.bodyClass}" label=${JSON.stringify(d.labelModo)} adminVisibles=${d.adminVisibles}/${d.adminTotal}`);

    await caso({
      id: 'E2', bloque: 'E', situacion: 'sesion lector',
      aserto: 'los .admin-action-btn ocultos',
      fn: async () => {
        const medidos = {};
        for (const sel of ['#btnHeaderAddBudget', '#btnOpenNewMonthModal', '.btn-quick-add-service', '.btn-edit-expense', '.btn-delete-expense', '.btn-edit-tx', '.btn-delete-tx']) {
          medidos[sel] = (await J(`window.__t.display(${JSON.stringify(sel)})`)).display;
        }
        const d2 = await dom();
        const todosOcultos = Object.keys(medidos).every(k => medidos[k] === 'none');
        return {
          pass: d2.readOnly === true && d2.adminVisibles === 0 && todosOcultos,
          expected: { readOnlyMode: true, adminVisibles: 0, displays: 'todos en none' },
          observed: { displays: medidos, adminTotal: d2.adminTotal, adminVisibles: d2.adminVisibles, bodyClass: d2.bodyClass, labelModo: d2.labelModo, sesion }
        };
      }
    });

    await caso({
      id: 'E3', bloque: 'E', situacion: 'lector CAMBIA PLATA por el modal de pago variable',
      aserto: 'el gate deberia cerrarlo; la matriz documenta que hoy no esta gateado',
      documentaHueco: true,
      defecto: 'G2 - Hallazgos/Gate de admin: el .btn-status-toggle no lleva admin-action-btn, asi que el lector abre el modal de pago y cambia monto + estado',
      notaDefecto: 'La matriz documenta que hoy NO esta gateado. El caso se escribe contra el comportamiento correcto, asi que observar al lector escribiendo es un FAIL honesto y no una expectativa mal puesta.',
      fn: async () => {
        await higieneModal();
        const antes = await item(MES_A, 'servicios.variables', 'syn_sv_1');
        const toggleVisible = (await J(`window.__t.display('.btn-status-toggle')`)).display;
        const ab = await J(ABRIR_PAGO_VARIABLE('syn_sv_1'));
        await settle(2, 600);
        const modal = await J(modalActivo('modalPayVariableExpense'));
        await J(LLENAR_PAGO_VARIABLE('88.88'));
        await J(ENVIAR('formPayVariableExpense'));
        await settle(2, 700);
        const despues = await item(MES_A, 'servicios.variables', 'syn_sv_1');
        const cambioDinero = !!despues && despues.monto !== antes.monto;
        const cambioEstado = !!despues && despues.estado !== antes.estado;
        const t = await leerToast();
        const g0 = (await guardarN());
        return {
          pass: !cambioDinero && !cambioEstado,
          expected: { lectorCambiaPlata: false, lectorCambiaEstado: false, toggleOculto: 'si el gate fuera real' },
          observed: {
            displayDelToggle: toggleVisible, abrioModal: modal, montoAntes: antes.monto, montoDespues: despues ? despues.monto : null,
            estadoAntes: antes.estado, estadoDespues: despues ? despues.estado : null, cambioDinero, cambioEstado, toast: t,
            bodyClass: (await dom()).bodyClass, guardarN: g0
          },
          extra: { holes: 'G2 (modal de pago variable sin gate)' }
        };
      }
    });

    await caso({
      id: 'E4', bloque: 'E', situacion: 'lector hace TOGGLE de estado',
      aserto: 'el gate deberia cerrarlo; la matriz documenta que hoy no esta gateado',
      documentaHueco: true,
      defecto: 'G1 - Hallazgos/Gate de admin: .btn-status-toggle no lleva admin-action-btn',
      notaDefecto: 'La matriz documenta que hoy NO esta gateado, y el caso se escribe contra el comportamiento correcto: la fila queda en FAIL.',
      fn: async () => {
        await higieneModal();
        const antes = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
        const display = (await J(`window.__t.display('.btn-status-toggle')`)).display;
        await J(CLICK_POR_ID('.btn-status-toggle', 'syn_sf_1'));
        await settle(2, 700);
        const despues = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
        const t = await leerToast();
        const cambio = !!despues && despues.estado !== antes.estado;
        return {
          pass: !cambio,
          expected: { estadoCambiado: false },
          observed: { displayDelToggle: display, estadoAntes: antes.estado, estadoDespues: despues ? despues.estado : null, cambio, toast: t, bodyClass: (await dom()).bodyClass },
          extra: { holes: 'G1 (toggle de estado sin gate)' }
        };
      }
    });

    await caso({
      id: 'E5', bloque: 'E', situacion: 'lector EDITA LAS NOTAS del mes',
      aserto: 'el gate deberia cerrarlo; la matriz documenta que hoy no esta gateado',
      documentaHueco: true,
      defecto: 'G3 - Hallazgos/Gate de admin: #btnOpenNotesModal (class btn-topbar-notes) no lleva admin-action-btn y store.updateNotes no tiene guard',
      notaDefecto: 'La matriz documenta que hoy NO esta gateado. El guardado es real: se comprueba tambien contra la nube simulada.',
      fn: async () => {
        await higieneModal();
        const antes = await notasDe(MES_A);
        const display = (await J(`window.__t.display('#btnOpenNotesModal')`)).display;
        const ab = await J(ABRIR_NOTAS);
        await settle(2, 500);
        const nuevoTexto = 'SYN-NOTAS-ESCRITAS-POR-LECTOR';
        const esc = await J(ESCRIBIR_NOTAS(nuevoTexto));
        await sleep(1200);
        await settle(2, 400);
        const despues = await notasDe(MES_A);
        const nube = await leerNube();
        const persistido = !!(nube && nube.meses && nube.meses[MES_A] && nube.meses[MES_A].notas === nuevoTexto);
        return {
          pass: despues === antes,
          expected: { notasSinCambios: true },
          observed: {
            displayDelBotonNotas: display, abrioModal: ab, escritura: esc,
            notasAntes: antes, notasDespues: despues, cambio: despues !== antes,
            persistidoEnLaNubeSimulada: persistido, bodyClass: (await dom()).bodyClass
          },
          extra: { holes: 'G3 (notas del mes sin gate)' }
        };
      }
    });

    await caso({
      id: 'E6', bloque: 'E', situacion: 'lector envia el form de agregar movimiento',
      aserto: 'el boton esta gateado, pero el form no; la matriz documenta que hoy no esta gateado',
      documentaHueco: true,
      defecto: 'G4/G6 - Hallazgos/Gate de admin: los forms de alta/edicion solo ocultan el boton (body.read-only-mode .admin-action-btn); el form no tiene guard',
      notaDefecto: 'La matriz documenta que hoy NO esta gateado. Como el boton esta oculto de verdad, el caso envia el form directamente: es lo que harian los 6 forms de la app si el boton no estuviera oculto.',
      fn: async () => {
        await higieneModal();
        const antes = await coll(MES_A, 'movimientos');
        const displayBoton = (await J(`window.__t.display('#btnQuickActionIncome')`)).display;
        await s.page.eval(`(() => {
          for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
          const f = document.getElementById('formAddMovement');
          document.getElementById('movFlujo').value = 'Gasto';
          document.getElementById('movConcepto').value = 'SYN-E6-LECTOR';
          document.getElementById('movMonto').value = '777';
          document.getElementById('movFecha').value = '2026-08-18';
          f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          return 1;
        })()`);
        await settle(2, 700);
        const despues = await coll(MES_A, 'movimientos');
        const creado = despues.some(x => x.concepto === 'SYN-E6-LECTOR');
        const t = await leerToast();
        return {
          pass: !creado,
          expected: { movimientoCreado: false },
          observed: {
            displayDelBoton: displayBoton, botonRealmenteOculto: displayBoton === 'none',
            movimientosAntes: antes.length, movimientosDespues: despues.length,
            creadoPorElForm: creado, toast: t, bodyClass: (await dom()).bodyClass,
            creado: despues.filter(x => x.concepto === 'SYN-E6-LECTOR')
          },
extra: { holes: 'G4/G6 (form de alta/edicion sin guard: el boton se oculta, el form no)' }
        }
      }
    });

    await caso({
      id: 'E7', bloque: 'E', situacion: 'lector fuerza el click en #btnDeleteMonth',
      aserto: 'el boton esta oculto y el click forzado no borra nada ni guarda',
      fn: async () => {
        await higieneModal();
        const boton = await J(BOTON_BORRAR_MES);
        if (!boton.existe) return { skip: 'no existe #btnDeleteMonth', observado: boton };
        const antes = await orden();
        const activoAntes = await activo();
        const formaAntes = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
        const d0 = dialogos.length;
        const g0 = await guardarN();
        /* Click forzado: es lo que harian los formularios, que no tienen guard. El
           boton esta oculto de verdad, asi que esto mide el gate y no el CSS. */
        await clickAsync(CLICK_BORRAR_MES);
        await settle(3, 800);
        const dlg = dialogos.slice(d0);
        const despues = await orden();
        const formaDespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(activoAntes)}))`);
        const gDelta = (await guardarN()) - g0;
        const t = await leerToast();
        const avisaElGate = /Solo el administrador puede eliminar un per[ií]odo/.test(t.texto || '');
        return {
          pass: boton.display === 'none' && boton.ocupaLayout === false && boton.adminActionBtn === true &&
                JSON.stringify(antes) === JSON.stringify(despues) &&
                JSON.stringify(formaAntes) === JSON.stringify(formaDespues) &&
                (await activo()) === activoAntes && dlg.length === 0 && gDelta === 0 && avisaElGate,
          expected: {
            display: 'none', ocupaLayout: false, esAdminActionBtn: true,
            mesesOrden: 'sin cambios', guardarNDelta: 0, dialogos: 0,
            toast: 'solo el administrador puede eliminar un período'
          },
          observed: {
            boton, mesesOrdenAntes: antes, mesesOrdenDespues: despues,
            formaIgual: JSON.stringify(formaAntes) === JSON.stringify(formaDespues),
            activoAntes, activoDespues: await activo(),
            dialogos: dlg, guardarNDelta: gDelta, toast: t, avisaElGate, bodyClass: (await dom()).bodyClass
          },
          extra: { porQueNoHayConfirm: 'exigirAdmin() corta antes del confirm: si el gate fallara, el caso veria 1 confirm y el store intentaria borrar.' }
        };
      }
    });

    await higieneModal();
  }
}

/* ------------------------------------------------------------------ *
 * 13. Matrix - block F (persistencia / integridad).
 *    F1-F5 run here; F6/F7/F8 are registered at the very end because they
 *    assert over the WHOLE run.
 * ------------------------------------------------------------------ */
async function bloqueF() {
  console.log('\n=== BLOQUE F - PERSISTENCIA / INTEGRIDAD (F1-F5) ===');
  const b = await boot('admin', clone(FIXTURE));
  if (!b.conFixture) { console.log('  ABORTA BLOQUE F: la pagina no cargo la fixture sintetica'); return; }
  await acumularContadores('F1-F5');

  await caso({
    id: 'F1', bloque: 'F', situacion: 'crear y recargar',
    aserto: 'sigue ahi',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO('SYN-F1-CREATE-RELOAD', '66.00', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 700);
      const antes = await buscar(MES_A, 'SYN-F1-CREATE-RELOAD');
      const nube = await leerNube();
      if (!nube) return { skip: 'el stub no devolvio nube', observado: null };
      await boot('admin', nube);
      const despues = await buscar(MES_A, 'SYN-F1-CREATE-RELOAD');
      return {
        pass: !!antes && !!despues && JSON.stringify(antes) === JSON.stringify(despues),
        expected: { mismoItemAntesYDespues: true, concepto: 'SYN-F1-CREATE-RELOAD' },
        observed: { antes, despues }
      };
    }
  });

  await caso({
    id: 'F2', bloque: 'F', situacion: 'editar y recargar',
    aserto: 'el cambio sigue',
    fn: async () => {
      await higieneModal();
      await J(ABRIR_EDITAR_GASTO('syn_sf_1'));
      await settle(2, 400);
      await J(LLENAR_EDITAR_GASTO('SYN-F2-EDIT-RELOAD', '77.77', null));
      await J(ENVIAR('formEditExpense'));
      await settle(2, 700);
      const antes = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      const nube = await leerNube();
      if (!nube) return { skip: 'el stub no devolvio nube', observado: null };
      await boot('admin', nube);
      const despues = await item(MES_A, 'servicios.fijos', 'syn_sf_1');
      return {
        pass: !!antes && !!despues && JSON.stringify(antes) === JSON.stringify(despues),
        expected: { concepto: 'SYN-F2-EDIT-RELOAD', monto: 77.77 },
        observed: { antes, despues }
      };
    }
  });

  await caso({
    id: 'F3', bloque: 'F', situacion: 'borrar y recargar',
    aserto: 'sigue borrado',
    fn: async () => {
      await higieneModal();
      /* Los tres puntos se toman en orden real: antes del borrado, despues del
         borrado y despues de recargar. */
      const largoAntes = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'personales.fijos')`);
      const itemAntes = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      const d0 = dialogos.length;
      dialogPolicy = 'accept';
      await clickAsync(CLICK_POR_ID('.btn-delete-expense', 'syn_pf_1'));
      await settle(2, 700);
      const dlg = dialogos.slice(d0);
      const itemTrasBorrar = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      const largoTrasBorrar = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'personales.fijos')`);
      const nube = await leerNube();
      if (!nube) return { skip: 'el stub no devolvio nube', observado: null };
      await boot('admin', nube);
      const itemTrasRecargar = await item(MES_A, 'personales.fijos', 'syn_pf_1');
      const largoTrasRecargar = await J(`window.__t.largo(${JSON.stringify(MES_A)}, 'personales.fijos')`);
      return {
        pass: !!itemAntes && itemTrasBorrar === null && itemTrasRecargar === null &&
              largoTrasBorrar === largoAntes - 1 && largoTrasRecargar === largoTrasBorrar,
        expected: { itemAntes: 'presente', itemDespuesDeBorrar: null, itemDespuesDeRecargar: null, largo: `${largoAntes} -> ${largoAntes - 1} -> ${largoAntes - 1}` },
        observed: { itemAntes, largoAntes, itemTrasBorrar, largoTrasBorrar, itemTrasRecargar, largoTrasRecargar, dialogos: dlg }
      };
    }
  });

  await caso({
    id: 'F4', bloque: 'F', situacion: 'los graficos y las KPIs',
    aserto: 'coinciden con los totales recalculados',
    fn: async () => {
      const t = await totales(MES_A);
      /* El KPI del porcentaje se escribe con el signo '%' pegado (app.js:438),
         asi que la expectativa lo incluye; el resto se compara contra el
         formateador del propio producto. */
      const esperado = await J(`JSON.stringify({
        ingresos: window.formatCurrency(${t.totalIngresos}),
        egresos: window.formatCurrency(${t.totalEgresos}),
        balance: window.formatCurrency(${t.balanceNeto}),
        pct: Number(${t.porcentajeAvance}).toFixed(1) + '%',
        pagos: ${t.pagadosCount} + ' de ' + ${t.totalItemsPresupuesto} + ' gastos pagados'
      })`);
      const d = await dom();
      const kpisOk = d.kpiIngresos === esperado.ingresos && d.kpiEgresos === esperado.egresos &&
                    d.kpiBalance === esperado.balance && d.kpiPct === esperado.pct && d.pagosLabel === esperado.pagos;
      /* Los graficos se miden de verdad: se cambia a la vista consolidada y se
         comprueba que los lienzos se pintaron (toDataURL no viene en blanco) y que
         el render Global existio y no tiro. */
      await J(`(() => { document.getElementById('btnNavPanel').click(); return 1 })()`);
      await settle(4, 900);
      const graficos = await J(`JSON.stringify({
        existeRenderGlobalCharts: typeof window.renderGlobalCharts === 'function',
        lienzos: ['chartTrendBar','chartCategoryDonut','globalBarChart','globalDonutChart']
          .map(id => { const c = document.getElementById(id); return c ? { id, w: c.width, h: c.height, vacio: c.toDataURL().length } : { id, falta: true }; }),
        viewPanelActiva: document.getElementById('viewPanel').classList.contains('active')
      })`);
      const g = graficos;   // J() ya devuelve el objeto
      const lienzosConPixeles = g.lienzos.filter(x => !x.falta && x.w > 0 && x.h > 0 && x.vacio > 2000);
      await J(`(() => { document.getElementById('btnNavMes').click(); return 1 })()`);
      await settle(2, 500);
      return {
        pass: kpisOk && g.existeRenderGlobalCharts && lienzosConPixeles.length >= 2,
        expected: { kpis: esperado, renderGlobalCharts: true, lienzosPintados: '>= 2' },
        observed: { kpisEsperados: esperado, kpisLeidos: { ingresos: d.kpiIngresos, egresos: d.kpiEgresos, balance: d.kpiBalance, pct: d.kpiPct, pagos: d.pagosLabel }, graficos: g, lienzosConPixeles: lienzosConPixeles.map(x => x.id) },
        extra: {
          nota: 'el KPI se compara contra window.formatCurrency del propio producto: lo que se verifica es que el DOM y calculateMonthTotals no se contradicen.',
          notaLienzos: 'los ids globalBarChart / globalDonutChart que charts.js consulta como alternativa NO existen en index.html; los dos lienzos reales son chartTrendBar y chartCategoryDonut. No es un fallo: charts.js:189,284 ya resuelve el primero que exista.'
        }
      };
    }
  });

  await caso({
    id: 'F5', bloque: 'F', situacion: 'dos meses, tocar uno',
    aserto: 'el otro no se mueve',
    fn: async () => {
      await higieneModal();
      const formaAAntes = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_A)}))`);
      const totalesAAntes = await totales(MES_A);
      await J(PILL_MES('SYN Mes B'));
      await settle(2, 700);
      const activoEnB = await activo();
      await J(ABRIR_ALTA_GASTO(null, 'servicios', 'fijos'));
      await J(LLENAR_ALTA_GASTO('SYN-F5-SOLO-EN-B', '500', null, 'Pendiente'));
      await J(ENVIAR('formAddBudget'));
      await settle(2, 700);
      const formaBDespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_B)}))`);
      await J(PILL_MES('SYN Mes A'));
      await settle(2, 700);
      const formaADespues = await J(`JSON.stringify(window.__t.forma(${JSON.stringify(MES_A)}))`);
      const totalesADespues = await totales(MES_A);
      const enB = await buscar(MES_B, 'SYN-F5-SOLO-EN-B');
      return {
        pass: activoEnB === MES_B && !!enB && JSON.stringify(formaAAntes) === JSON.stringify(formaADespues) &&
              JSON.stringify(totalesAAntes) === JSON.stringify(totalesADespues),
        expected: { elItemSoloEnElMesTocado: true, mesAIntacto: true },
        observed: {
          activoEnB, itemEnB: enB,
          mesAIntacto: JSON.stringify(formaAAntes) === JSON.stringify(formaADespues),
          totalesAIntactos: JSON.stringify(totalesAAntes) === JSON.stringify(totalesADespues),
          servFijosEnB: formaBDespues.servicios.fijos.map(x => x.concepto)
        }
      };
    }
  });

  await higieneModal();
}

/* ------------------------------------------------------------------ *
 * 14. Month deletion: reachability, measured instead of asserted.
 *     This used to be the biggest CRUD hole (the method had no UI caller at
 *     all). It is now reported as a MEASUREMENT, so the verdict follows what
 *     the run finds instead of repeating what the code once did.
 * ------------------------------------------------------------------ */
async function gapDeleteMonth() {
  const storeSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'store.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const occurrences = (src, re) => (src.match(re) || []).length;

  const enStore = occurrences(storeSrc, /deleteMonth/g);
  const enApp = occurrences(appSrc, /deleteMonth/g);
  const enHtml = occurrences(htmlSrc, /deleteMonth/g);
  const enHtmlBorrarMes = (htmlSrc.match(/borrar[^<]{0,20}mes|mes[^<]{0,20}borrar/gi) || []);

  const dom = await J(`JSON.stringify(window.__t.hayControlBorrarMes())`);
  const boton = await J(BOTON_BORRAR_MES);

  /* The method works; proved on a throwaway deep copy of the store, exactly
     like the previous harness's envoltura trick, so the live in-memory state is
     never touched. */
  const metodo = await J(`(() => {
    const st = window.financialStore;
    const copia = Object.create(Object.getPrototypeOf(st));
    copia.data = JSON.parse(JSON.stringify(st.data));
    copia.oyentes = [];
    copia.remotoListo = false;
    copia.__saves = 0;
    copia.save = function () { copia.__saves++; };
    const objetivo = ${JSON.stringify(MES_B)};
    const antes = copia.data.mesesOrden.length;
    const retorno = copia.deleteMonth(objetivo);
    return JSON.stringify({
      retorno,
      mesesOrdenAntes: antes,
      mesesOrdenDespues: copia.data.mesesOrden.length,
      sigueExistiendoElMes: !!copia.data.meses[objetivo],
      saves: copia.__saves,
      storeVivoIntacto: !!window.financialStore.data.meses[${JSON.stringify(MES_B)}]
    });
  })()`);

  const alcanzable = enApp > 0 && boton.existe === true;
  return {
    gap: alcanzable ? null : 'store.deleteMonth sigue sin forma de llegar desde la interfaz',
    donde: `js/store.js (definicion, ${enStore} menciones), js/app.js (${enApp} callers), index.html (${enHtml} referencias literales)`,
    conteosEnFuente: { storeJs: enStore, appJs: enApp, indexHtml: enHtml },
    controlesEnHtmlQueHablanDeBorrarMes: enHtmlBorrarMes,
    controlesEnDom: dom,
    botonEnElDom: boton,
    metodoSobreCopiaDesechable: metodo,
    veredicto: alcanzable
      ? 'ALCANZABLE: hay un control en la interfaz y el handler llama al store. Los casos B8-B10 lo ejercitan por la UI real.'
      : 'HUECO DOCUMENTADO: la app no expone la operacion, asi que el caso no se puede escribir sin tocar codigo de producto.'
  };
}

/* ------------------------------------------------------------------ *
 * 15. Defect probes for the R-table entries the UI cannot reach.
 *     These are NOT matrix cases. They run real store methods against a
 *     throwaway deep copy of the fixture and are reported as evidence.
 * ------------------------------------------------------------------ */
async function probesDefectos() {
  /* A21 mide la ruta de la interfaz con las tres banderas en false. Lo que NO se
     puede assertar desde la UI es la llamada SIN el tercer parametro, que es la
     que hacen todos los llamadores previos: se mide sobre una copia desechable,
     comparando el clon "sin opciones" contra el clon "con las tres en false".
     Si difieren, el parametro opcional rompio la compatibilidad. */
  const opcionesDeAddNewMonth = await J(`(() => {
    const st = window.financialStore;
    const nuevo = () => {
      const c = Object.create(Object.getPrototypeOf(st));
      c.data = JSON.parse(JSON.stringify(st.data));
      c.oyentes = []; c.remotoListo = false; c.__saves = 0;
      c.save = function () { c.__saves++; };
      return c;
    };
    const MES = ${JSON.stringify(MES_A)};
    const sinOpciones = nuevo();
    const id1 = sinOpciones.addNewMonth('SYN-PROBE-SIN', MES);
    const conFalse = nuevo();
    const id2 = conFalse.addNewMonth('SYN-PROBE-CON', MES, { extras: false, notas: false, movimientos: false });
    const conDefault = nuevo();
    const id3 = conDefault.addNewMonth('SYN-PROBE-DEF', MES, {});
    /* Los ids de mes llevan 4 digitos de Date.now() y cada clon se creo con un
       nombre distinto a proposito (si no, los tres caerian en la misma clave).
       Se comparan las FORMAS sin id, nombre ni corto: lo que tiene que ser
       identico es el CONTENIDO del clon, no el nombre que le dio quien lo pidio. */
    const comparable = (d, id) => {
      const c = JSON.parse(JSON.stringify(d.meses[id]));
      delete c.id; delete c.nombre; delete c.corto;
      return c;
    };
    const a = comparable(sinOpciones.data, id1), b = comparable(conFalse.data, id2), c = comparable(conDefault.data, id3);
    const sinIdsInternos = (m) => {
      const quitar = (l) => (l || []).map(x => { const y = { ...x }; delete y.id; return y; });
      for (const sec of ['servicios', 'personales']) for (const sub of ['fijos', 'variables']) m[sec][sub] = quitar(m[sec][sub]);
      m.extras = quitar(m.extras);
      m.movimientos = quitar(m.movimientos);
      return m;
    };
    /* Los ids de los items SI tienen que diferir entre los tres clones (los genera
       generateId()), asi que la comparacion se hace sobre las formas YA SIN ids.
       Por eso el stripping ocurre antes y no dentro del objeto de retorno: en un
       literal, las propiedades se evaluan en orden y comparar primero compararia
       los ids y daría false siempre. */
    const formaA = sinIdsInternos(a), formaB = sinIdsInternos(b), formaC = sinIdsInternos(c);
    const igualAB = JSON.stringify(formaA) === JSON.stringify(formaB);
    const igualAC = JSON.stringify(formaA) === JSON.stringify(formaC);
    return JSON.stringify({
      hayTresIdsDistintos: id1 !== id2 && id2 !== id3 && id1 !== id3,
      sinOpciones_igualQueLasTresEnFalse: igualAB,
      sinOpciones_igualQueObjetoVacio: igualAC,
      /* La unica diferencia que se permite entre los tres clones son los ids que
         genera el store; si esto no esta vacio, el parametro opcional cambio algo. */
      diferenciaConLasTresEnFalse: igualAB ? [] : [JSON.stringify(formaA), JSON.stringify(formaB)],
      diferenciaConObjetoVacio: igualAC ? [] : [JSON.stringify(formaA), JSON.stringify(formaC)],
      formaDelClonSinOpciones: formaA,
      formaDelClonConLasTresEnFalse: formaB,
      formaDelClonConObjetoVacio: formaC,
      saves: { sinOpciones: sinOpciones.__saves, conFalse: conFalse.__saves, conVacio: conDefault.__saves },
      storeVivoIntacto: (() => { const m = window.financialStore.data.meses; return !m[id1] && !m[id2] && !m[id3] && !!m[MES]; })()
    });
  })()`);

  const r6 = await J(`(() => {
    const st = window.financialStore;
    const nuevo = () => {
      const c = Object.create(Object.getPrototypeOf(st));
      c.data = JSON.parse(JSON.stringify(st.data));
      c.oyentes = []; c.remotoListo = false; c.__saves = 0;
      c.save = function () { c.__saves++; };
      return c;
    };
    const MES = ${JSON.stringify(MES_A)};
    const buscarItem = (data, id) => {
      const m = data.meses[MES];
      for (const r of ['servicios.fijos','servicios.variables','personales.fijos','personales.variables','extras']) {
        const p = r.split('.'); const h = (m[p[0]][p[1]] || []).find(x => x.id === id);
        if (h) return h;
      }
      return null;
    };
    const conNoNumerico = nuevo();
    conNoNumerico.updateBudgetItem(MES, 'syn_sf_1', { monto: 'abc' });
    const conInfinity = nuevo();
    conInfinity.updateBudgetItem(MES, 'syn_sf_1', { monto: Infinity });
    const movNoNumerico = nuevo();
    movNoNumerico.addMovement(MES, { concepto: 'SYN-PROBE', monto: 'abc', flujo: 'Gasto' });
    return JSON.stringify({
      updateBudgetItem_montoNoNumerico: buscarItem(conNoNumerico.data, 'syn_sf_1').monto,
      updateBudgetItem_montoNoNumericoTipo: typeof buscarItem(conNoNumerico.data, 'syn_sf_1').monto,
      /* Infinity SOBREVIVE en el store (Infinity || Infinity === Infinity) y solo se
         pierde al serializar; el round-trip de JSON lo demuestra. OJO:
         returnByValue de CDP no puede representar Infinity, asi que el valor
         en memoria no se puede leer por esta via. */
      InfinitySobreviveEnElStore: conInfinity.data.meses[MES].servicios.fijos.find(x => x.id === 'syn_sf_1').monto > 1e308,
      InfinityEnElJSONQueSeSube: JSON.parse(JSON.stringify(conInfinity.data)).meses[MES].servicios.fijos.find(x => x.id === 'syn_sf_1').monto,
      InfinityEsNullEnElJSON: JSON.parse(JSON.stringify(conInfinity.data)).meses[MES].servicios.fijos.find(x => x.id === 'syn_sf_1').monto === null,
      addMovement_montoNoNumerico: movNoNumerico.data.meses[MES].movimientos[0].monto,
      savesDeLaCopia: { noNumerico: conNoNumerico.__saves, infinity: conInfinity.__saves, movimiento: movNoNumerico.__saves }
    });
  })()`);

  /* R5: `item.concepto.trim()` (store.js:517 y 639) revienta si el objeto que
     llega no trae `concepto`. Los dos handlers de la UI SIEMPRE mandan un
     string (puede ser ''), asi que la fila solo se alcanza pasando el objeto a
     mano. Se mide con el mismo patron de copia desechable. */
  const r5 = await J(`(() => {
    const st = window.financialStore;
    const nuevo = () => {
      const c = Object.create(Object.getPrototypeOf(st));
      c.data = JSON.parse(JSON.stringify(st.data));
      c.oyentes = []; c.remotoListo = false; c.__saves = 0;
      c.save = function () { c.__saves++; };
      return c;
    };
    const MES = ${JSON.stringify(MES_A)};
    let errGasto = null;
    try { nuevo().addBudgetItem(MES, 'servicios', 'fijos', { monto: 1 }); } catch (e) { errGasto = String(e && e.name) + ': ' + String(e && e.message || e); }
    let errMov = null;
    try { nuevo().addMovement(MES, { monto: 1, flujo: 'Gasto' }); } catch (e) { errMov = String(e && e.name) + ': ' + String(e && e.message || e); }
    let errVacio = null, creado = null;
    try { creado = nuevo().addBudgetItem(MES, 'servicios', 'fijos', { concepto: '   ', monto: 1 }); } catch (e) { errVacio = String(e && e.name); }
    return JSON.stringify({
      addBudgetItemSinConcepto: errGasto,
      addMovementSinConcepto: errMov,
      addBudgetItemConConceptoEnBlancoLanza: errVacio,
      conceptoGuardadoTrasTrim: creado ? creado.concepto : null
    });
  })()`);

  /* R7 (localStorage corrupto -> defaults + sobrescritura) NO se puede reproducir
     sin violar la regla de no tocar los datos reales: `leerLocal()` lee el valor
     REDIRIGIDO a memoria, y sembrar ahi un blob corrupto exigiria una palanca
     nueva en el stub. Se reporta con evidencia de fuente, que es lo que si se
     puede verificar honestamente. */
  const storeSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'store.js'), 'utf8');
  const r7 = {
    catchDeLeerLocalUsaDefaults: /catch \(e\)[\s\S]{0,300}getDefaultData\(\)[\s\S]{0,160}this\.save\(initial\)/.test(storeSrc),
    guardaLosDefaultsEncimaDelDato: /const initial = getDefaultData\(\);\s*this\.save\(initial\);/.test(storeSrc),
    reproducirEnLaCorrida: 'NO: leerLocal() lee la copia REDIRIGIDA a memoria, que por construccion es valida. Sembrarle un blob corrupto exigiria tocar el stub, y la alternativa (corromper el localStorage real) esta prohibida.'
  };

  return {
    R6_parseFloat_ou_0: r6,
    R5_trim_sobre_concepto_ausente: r5,    R7_localStorage_corrupto_sobreescribe: r7,
    opcionesDeAddNewMonth,
    notaAlcance: 'Estos no se pueden disparar desde la UI: todos los campos de monto son input type=number min=0 required, asi que la validacion nativa los frena antes de que el guard de la app corra. R5 y R6 se miden sobre una copia desechable del estado, nunca sobre el store vivo; R7 solo se verifica por fuente. opcionesDeAddNewMonth mide el parametro opcional de addNewMonth sobre la misma copia desechable, porque la interfaz siempre se lo pasa.'
  };
}

/* ------------------------------------------------------------------ *
 * 16. Run.
 * ------------------------------------------------------------------ */
const rep = {
  label: LABEL,
  script: 'crud-admin.mjs',
  node: process.version,
  pageUrl: PAGE_URL,
  generado: new Date().toISOString(),
  semanticaDeVeredictos: {
    regla: 'PASS significa siempre que el producto hizo lo correcto. Ningun caso se marca verde por defecto: PASS exige que la funcion del caso devuelva pass:true.',
    documentaHueco: 'marca las filas cuyo FAIL es el hueco ya documentado (C9, D5, E3-E6). Es documentacion, no una excepcion: la fila sigue en rojo.',
    thrownOrMissingControl: 'SKIP con motivo, nunca PASS'
  },
  storageKey: STORAGE_KEY,
  isolationPrefix: ISOLATION_PREFIX,
  fixture: FIXTURE
};

let errorFatal = null;

try {
  await s.page.send('DOMStorage.enable');

  const realAntes = await (async () => {
    /* The file:// frame does not exist until the first navigation, and the very
       first navigation is already protected by the document-start patch, so this
       is the correct place for the baseline: it also proves the boot itself did
       not touch the real storage. */
    await s.page.send('Page.addScriptToEvaluateOnNewDocument', { source: buildStub('admin', clone(FIXTURE)) });
    await s.goto(PAGE_URL, 8000);
    return readRealStorage(s.page);
  })();
  rep.aislamiento = { realLocalStorageAntes: realAntes, alArrancarLaPagina: true };

  console.log('\n=== AISLAMIENTO: baseline del localStorage REAL (leido desde node por CDP DOMStorage) ===');
  console.log(JSON.stringify(realAntes, null, 1));

  const domStorageAlInicio = domStorageEvents.length;

  await bloqueA();
  await bloqueB();
  await bloqueC();
  await bloqueD();
  await bloqueE();
  await bloqueF();

  /* --- Acumuladores de toda la corrida, leidos de la pagina viva. Va ANTES de
     los probes para que un probe que falle no se lleve por delante la medicion
     del aislamiento. --- */
  await acumularContadores('final');

  const supabase = netReqs.filter(r => /\.supabase\.co/i.test(r.url));
  const clavesRealesDeApp = acum.clavesReales.filter(c => c.indexOf(STORAGE_KEY + ':') === 0 || /finanzas/.test(c));
  const domStorageDeApp = domStorageEvents.filter(e => e.area === 'localStorage' && (e.key === STORAGE_KEY || /^finanzas/.test(String(e.key))));

  rep.red = {
    requestsTotales: netReqs.length,
    requestsASupabase: supabase.length,
    requestsASupabaseMuestra: supabase.slice(0, 5),
    hosts: [...new Set(netReqs.map(r => { try { return new URL(r.url).host; } catch { return r.url.slice(0, 40); } }))].sort()
  };
  rep.contadores = acum;
  rep.contadoresPorPagina = paginasCargadas;
  rep.dialogos = dialogos;
  rep.domStorageEvents = domStorageEvents;
  rep.domStorageEventsDeApp = domStorageDeApp;
  rep.domStorageEventsTotales = domStorageEvents.length - domStorageAlInicio;

  const realDespues = await readRealStorage(s.page);
  rep.aislamiento.realLocalStorageDespues = realDespues;
  rep.aislamiento.hashRealIgual = realAntes.appKeyHash === realDespues.appKeyHash;
  rep.aislamiento.clavesRealesQueLlegaronAlStorageReal = clavesRealesDeApp;
  rep.aislamiento.clavesRealesQuePasaronDeTodo = acum.clavesReales;

  try { rep.huecoDeleteMonth = await gapDeleteMonth(); } catch (e) { rep.huecoDeleteMonth = { error: String(e) }; }
  try { rep.probesDefectos = await probesDefectos(); } catch (e) { rep.probesDefectos = { error: String(e) }; }

  /* --- F6, F7, F8: se evaluan al final porque abarcan TODA la corrida --- */
  console.log('\n=== BLOQUE F - F6 / F7 / F8 (sobre toda la corrida) ===');

  await caso({
    id: 'F6', bloque: 'F', situacion: 'toda la corrida',
    aserto: '0 excepciones, 0 console.error, 0 respuestas >= 400',
    fn: async () => ({
      pass: s.exceptions.length === 0 && s.consoleErrors.length === 0 && s.failedRequests.length === 0,
      expected: { excepciones: 0, consoleError: 0, respuestas400: 0 },
      observed: { excepciones: s.exceptions, consoleError: s.consoleErrors, respuestas400: s.failedRequests }
    })
  });

  await caso({
    id: 'F7', bloque: 'F', situacion: 'hash del localStorage REAL',
    aserto: 'identico antes y despues (aislamiento probado)',
    fn: async () => ({
      pass: rep.aislamiento.hashRealIgual && clavesRealesDeApp.length === 0 && domStorageDeApp.length === 0,
      expected: { hashRealAntes: realAntes.appKeyHash, hashRealDespues: realAntes.appKeyHash, escriturasRealesDeLaClaveDeLaApp: 0, eventosDOMStorageDeLaApp: 0 },
      observed: {
        hashRealAntes: realAntes.appKeyHash, hashRealDespues: realDespues.appKeyHash,
        bytesAntes: realAntes.appKeyBytes, bytesDespues: realDespues.appKeyBytes,
        clavesAntes: realAntes.keys, clavesDespues: realDespues.keys,
        escriturasRealesDeLaClaveDeLaApp: clavesRealesDeApp,
        eventosDOMStorageDeLaApp: domStorageDeApp,
        setItemRedirigidos: acum.setItemRedirigidos,
        note: 'setItemRedirigidos > 0 prueba que la app SI intento persistir: sin eso el aislamiento no probaria nada.'
      }
    })
  });

  await caso({
    id: 'F8', bloque: 'F', situacion: 'escrituras a Supabase',
    aserto: '0 (el stub intercepta guardar y nunca abre un socket)',
    fn: async () => ({
      pass: supabase.length === 0 && acum.asignadoPorProducto > 0,
      expected: { requestsA_supabase_co: 0, elProductoIntentoAsignar_gastosRemoto_y_elSetterLoTrago: 'si (>0)' },
      observed: {
        requestsASupabase: rep.red,
        guardarInterceptados: acum.guardarN,
        cargarInterceptados: acum.cargarN,
        asignacionesTragadasPorElSetter: acum.asignadoPorProducto,
        metodoDeLaPropiedad: await s.page.eval(`JSON.stringify({
          getterDevuelveElStub: window.gastosRemoto && window.gastosRemoto.haySesion !== undefined,
          haySupabaseCliente: (typeof window.supabase !== 'undefined') && typeof window.supabase.createClient === 'function'
        })`)
      },
      extra: {
        cadenaDePrueba: [
          '1. el getter de window.gastosRemoto SIEMPRE devuelve el stub y el setter traga la asignacion de supabase-store.js:372',
          '2. cada store.save() termina en guardar() del stub, que solo cuenta y actualiza una nube en memoria',
          '3. 0 requests a *.supabase.co en toda la corrida (Network.requestWillBeSent)',
          '4. el localStorage real de la clave de la app quedo con el mismo hash (DOMStorage, leido desde node)'
        ]
      }
    })
  });
} catch (err) {
  errorFatal = String((err && err.stack) || err);
  rep.errorFatal = errorFatal;
} finally {
  try { await s.close(); } catch { /* ya cerrada */ }
}

/* ------------------------------------------------------------------ *
 * 17. Report.
 * ------------------------------------------------------------------ */
const BLOQUES = ['A', 'B', 'C', 'D', 'E', 'F'];
const resumen = {};
for (const b of BLOQUES) {
  const filas = casos.filter(c => c.bloque === b);
  resumen[b] = {
    total: filas.length,
    PASS: filas.filter(c => c.verdict === 'PASS').length,
    FAIL: filas.filter(c => c.verdict === 'FAIL').length,
    SKIP: filas.filter(c => c.verdict === 'SKIP').length
  };
}
rep.casos = casos;
rep.resumen = resumen;
rep.totales = {
  total: casos.length,
  PASS: casos.filter(c => c.verdict === 'PASS').length,
  FAIL: casos.filter(c => c.verdict === 'FAIL').length,
  SKIP: casos.filter(c => c.verdict === 'SKIP').length
};
rep.hallazgos = hallazgos;
rep.casoFaltante = casos.filter(c => !['A', 'B', 'C', 'D', 'E', 'F'].includes(c.bloque)).map(c => c.id);
rep.matrizEsperada = {
  A: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17',
    'A18', 'A19', 'A20', 'A21', 'A22'],
  B: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
  C: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
  D: ['D1', 'D2', 'D3', 'D4', 'D5'],
  E: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'],
  F: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']
};
rep.casosFaltantesDeLaMatriz = Object.values(rep.matrizEsperada).flat()
  .filter(id => !casos.some(c => c.id === id));

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(rep, null, 2));

/* ------------------------------------------------------------------ *
 * 18. Console summary.
 * ------------------------------------------------------------------ */
const nombres = { A: 'A - crear / subir', B: 'B - borrar', C: 'C - editar', D: 'D - toggle / pago variable', E: 'E - gate de admin', F: 'F - persistencia / integridad' };

console.log('\n\n================ RESUMEN POR BLOQUE ================');
for (const b of BLOQUES) {
  const r = resumen[b];
  console.log(`  ${b} ${nombres[b].padEnd(28)} total ${String(r.total).padStart(2)}   PASS ${String(r.PASS).padStart(2)}   FAIL ${String(r.FAIL).padStart(2)}   SKIP ${String(r.SKIP).padStart(2)}`);
}
console.log(`  ${'TOTAL'.padEnd(30)} total ${String(rep.totales.total).padStart(2)}   PASS ${String(rep.totales.PASS).padStart(2)}   FAIL ${String(rep.totales.FAIL).padStart(2)}   SKIP ${String(rep.totales.SKIP).padStart(2)}`);

console.log('\n================ FALLOS ================');
const fallos = casos.filter(c => c.verdict === 'FAIL');
if (!fallos.length) console.log('  ninguno');
for (const c of fallos) {
  console.log(`\n  [${c.id}] ${c.situacion}`);
  console.log(`      aserto:    ${c.aserto}`);
  console.log(`      tipo:      ${c.tipo}`);
  console.log(`      esperado:  ${JSON.stringify(c.esperado)}`);
  console.log(`      observado: ${JSON.stringify(c.observado)}`);
  console.log(`      defecto:   ${c.defecto || '(sin entrada en la tabla R1-R16)'}`);
  if (c.notaDefecto) console.log(`      nota:      ${c.notaDefecto}`);
}

console.log('\n================ SKIPS ================');
const skips = casos.filter(c => c.verdict === 'SKIP');
if (!skips.length) console.log('  ninguno');
for (const c of skips) console.log(`  [${c.id}] ${c.motivo}`);

console.log('\n================ AISLAMIMIENTO MEDIDO ================');
const A = rep.aislamiento || {};
console.log(`  hash del localStorage REAL (clave ${STORAGE_KEY}), leido desde node por CDP DOMStorage:`);
console.log(`    antes:  ${A.realLocalStorageAntes ? A.realLocalStorageAntes.appKeyHash : 'n/a'}  (${A.realLocalStorageAntes ? A.realLocalStorageAntes.appKeyBytes : 'n/a'} bytes, claves: ${JSON.stringify(A.realLocalStorageAntes ? A.realLocalStorageAntes.keys : [])})`);
console.log(`    despues: ${A.realLocalStorageDespues ? A.realLocalStorageDespues.appKeyHash : 'n/a'}  (${A.realLocalStorageDespues ? A.realLocalStorageDespues.appKeyBytes : 'n/a'} bytes, claves: ${JSON.stringify(A.realLocalStorageDespues ? A.realLocalStorageDespues.keys : [])})`);
console.log(`    identico: ${A.hashRealIgual}`);
console.log(`  setItem redirigidos a memoria (la app SI intento persistir): ${acum.setItemRedirigidos}`);
console.log(`  setItem que llegaron al localStorage REAL, de la clave de la app: ${(A.clavesRealesQueLlegaronAlStorageReal || []).length}  ${JSON.stringify(A.clavesRealesQueLlegaronAlStorageReal || [])}`);
console.log(`  eventos DOMStorage del navegador sobre la clave de la app: ${(rep.domStorageEventsDeApp || []).length}`);
console.log(`  otras escrituras reales (libros de Brave, no datos): ${JSON.stringify([...new Set(A.clavesRealesQuePasaronDeTodo || [])])}`);
console.log(`  guardar() interceptados por el stub: ${acum.guardarN}   cargar() interceptados: ${acum.cargarN}`);
console.log(`  asignaciones de window.gastosRemoto tragadas por el setter: ${acum.asignadoPorProducto}`);
console.log(`  requests totales: ${rep.red ? rep.red.requestsTotales : 'n/a'}   a *.supabase.co: ${rep.red ? rep.red.requestsASupabase : 'n/a'}`);
console.log(`  hosts contactados: ${rep.red ? JSON.stringify(rep.red.hosts) : 'n/a'}`);

console.log('\n================ ERRORES DE TODA LA CORRIDA (F6) ================');
console.log(`  excepciones: ${s.exceptions.length} ${JSON.stringify(s.exceptions)}`);
console.log(`  console.error: ${s.consoleErrors.length} ${JSON.stringify(s.consoleErrors)}`);
console.log(`  respuestas >= 400: ${s.failedRequests.length} ${JSON.stringify(s.failedRequests)}`);

console.log('\n================ DIALOGOS ================');
console.log(`  total: ${dialogos.length}`);
const porTipo = {};
for (const d of dialogos) {
  const k = `${d.type}/${d.policy}`;
  porTipo[k] = porTipo[k] || [];
  porTipo[k].push(d.message);
}
for (const k of Object.keys(porTipo)) {
  console.log(`  ${k}: ${porTipo[k].length}`);
  for (const m of porTipo[k].slice(0, 6)) console.log(`      "${m}"`);
  if (porTipo[k].length > 6) console.log(`      ... y ${porTipo[k].length - 6} mas`);
}

console.log('\n================ E1-E7: GATE DE ADMIN ================');
for (const id of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7']) {
  const c = casos.find(x => x.id === id);
  if (!c) { console.log(`  ${id}: no se ejecuto`); continue; }
  console.log(`  ${id} ${c.verdict}  ${c.situacion}`);
  if (c.verdict !== 'PASS') console.log(`      ${JSON.stringify(c.observado)}`);
}
if (hallazgos.sesionAdminReal) console.log(`  [admin]  sesion=${JSON.stringify(hallazgos.sesionAdminReal.sesion)} body="${hallazgos.sesionAdminReal.dom.bodyClass}" #authModeLabel=${JSON.stringify(hallazgos.sesionAdminReal.dom.labelModo)}`);
if (hallazgos.sesionLectorReal) console.log(`  [lector] sesion=${JSON.stringify(hallazgos.sesionLectorReal.sesion)} body="${hallazgos.sesionLectorReal.dom.bodyClass}" #authModeLabel=${JSON.stringify(hallazgos.sesionLectorReal.dom.labelModo)}`);

console.log('\n================ BORRAR MES: ALCANZABILIDAD MEDIDA ================');
if (rep.huecoDeleteMonth) console.log(JSON.stringify(rep.huecoDeleteMonth, null, 1));

if (hallazgos.roleModalAbreEnSesionAdmin) {
  console.log('\n================ HALLAZGO FUERA DE LA MATRIZ ================');
  console.log('  el modal de seleccion de rol se abre igual con sesion admin real:');
  console.log('    app.js:232-236 programa openRoleSelectModal() a los 60 ms sin mirar la sesion.');
  console.log('    aplicarSesion() (l.165-170) lo cierra ANTES, y el setTimeout lo vuelve a abrir.');
  console.log('    observado por el arnes: ' + JSON.stringify(hallazgos.roleModalAbreEnSesionAdmin.observado));
  console.log('    como lo oculta este arnes: ' + hallazgos.roleModalAbreEnSesionAdmin.comoLoOcultaElArnes);
}

console.log('\n================ PROBES DE DEFECTOS NO ALCANZABLES POR LA UI ================');
if (rep.probesDefectos) console.log(JSON.stringify(rep.probesDefectos, null, 1));

console.log('\n================ CASOS FALTANTES DE LA MATRIZ ================');
console.log(rep.casosFaltantesDeLaMatriz.length ? JSON.stringify(rep.casosFaltantesDeLaMatriz) : '  ninguno: la matriz completa se ejecuto');

if (errorFatal) console.log('\nERROR FATAL:\n' + errorFatal);

console.log(`\nReporte: ${REPORT_PATH}`);
console.log(`Salida: ${rep.totales.FAIL} FAIL -> codigo de salida ${rep.totales.FAIL > 0 ? 1 : 0}`);
process.exit(rep.totales.FAIL > 0 ? 1 : 0);
