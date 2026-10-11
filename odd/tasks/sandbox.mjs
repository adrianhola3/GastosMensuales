/* sandbox.mjs - Isolated test harness for the admin CRUD suite.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `js/config.js` holds REAL Supabase credentials and `js/app.js:109` derives the
 * role from a REAL Supabase session:
 *
 *     const sesion = obtenerSesion();
 *     let isAdmin = sesion.rol === 'admin';
 *
 * The `?admin=true` shortcut was removed on purpose (app.js:106-107), so there is
 * NO local way to reach admin without signing into the real database. Signing in
 * for a test would write into the user's actual finances. That is not a test, it
 * is an accident with steps.
 *
 * So: a throwaway browser profile + a stubbed `window.gastosRemoto` that claims a
 * session WITHOUT touching the network. The real database is never contacted.
 *
 * TRAPS THIS FILE IS WRITTEN AGAINST (all verified on this machine)
 * ----------------------------------------------------------------
 * 1. `js/supabase-store.js` (loaded at index.html:882, BEFORE app.js at 885)
 *    assigns `window.gastosRemoto = {...}` at parse time. A plain
 *    `addScriptToEvaluateOnNewDocument` stub is therefore OVERWRITTEN before
 *    app.js ever reads it. Fixed with an accessor property: the real file still
 *    runs (so its parse errors and console.warn surface) but its assignment is
 *    captured instead of applied.
 * 2. `Input.dispatchKeyEvent` does not deliver keyboard in an isolated window on
 *    the real site (it does on `file://` in some builds). For ESC logic, dispatch
 *    a SYNTHETIC `KeyboardEvent` on `window` - both keydown listeners
 *    (app.js:1077 and app.js:1621) are bound to `window`.
 * 3. A silent probe is NOT evidence of a defect. Separate transport from logic
 *    before reporting a bug.
 * 4. `Network.setCacheDisabled` BEFORE navigating, or CSS/JS comes from the
 *    profile cache and the previous run's state is measured.
 * 5. `Page.captureScreenshot` WITHOUT `captureBeyondViewport`: `position: sticky`
 *    renders in a false position and a layout bug fakes itself. A throwaway
 *    capture is also the cheapest way to force a frame (the only thing that
 *    advances rAF / transition clocks).
 * 6. `Target.closeTarget` in `finally`, always.
 *
 * USAGE
 * -----
 *   import { launchSandbox } from './sandbox.mjs';
 *   const sb = await launchSandbox({ fixture: 'baseline' });
 *   try {
 *     await sb.assertAdmin();       // hard: throws if not admin, or if the stub is wrong
 *     await sb.markBootBaseline();  // the app writes once at boot; freeze it out of the count
 *     // ...drive the UI...
 *     await sb.assertNoWrites();    // READ-ONLY tests only: any store write fails
 *     await sb.assertNetworkClean();// ALL tests: nothing reached a Supabase host
 *   } finally { await sb.close(); } // kills the browser, deletes the throwaway profile
 *
 * For MUTATING tests (create/edit/delete) `assertNoWrites()` is expected to FAIL -
 * that is the app working. Use `assertNetworkClean()` on its own there: it proves
 * the write stayed inside the throwaway profile. `noWriteProof()` bundles both and
 * is meant for read-only / teardown checks.
 *
 * Run this file directly for a self-test:  node odd\tasks\sandbox.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const APP_URL =
  'file:///C:/Users/User/Desktop/Web%20de%20Gastos%20Mensuales/index.html';

/* The real persisted key. NOTE: it is NOT `finanzas*` - the only `finanzas*` key
 * in the app is `finanzas_session_role_chosen`, which lives in sessionStorage
 * (app.js:113) and only records the user's UI choice. The task brief assumed
 * `finanzas*` for localStorage; that assumption is wrong. See report. */
export const STORAGE_KEY = 'control_gastos_mensuales_db_v1';   // store.js:5
export const SESSION_ROLE_KEY = 'finanzas_session_role_chosen'; // app.js:113

const TEMP_ROOT = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(), 'Temp', 'opencode'
);

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
];

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error(
    'No browser found. Looked in:\n  ' + BROWSER_CANDIDATES.join('\n  ')
  );
}

function freePort(start) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryNext = () => {
      if (port > start + 60) return reject(new Error('no free debug port in range'));
      const srv = net.createServer();
      srv.once('error', () => { port++; tryNext(); });
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    tryNext();
  });
}

function httpJson(p, port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p }, res => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) {
          reject(new Error('invalid JSON from ' + p + ': ' + d.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout on ' + p)));
  });
}

/* ---------- CDP client (pattern reused verbatim from cdp.mjs) ----------
 * `sessionId` lives on the instance and is sent by EVERY command by default, so
 * helper methods that call `this.send` internally do not lose it. A Proxy with
 * `v.bind(t)` does NOT work: `t` is the raw object and the internal `this.send`
 * would go out without a sessionId, which lands on the browser target and answers
 * "'Runtime.evaluate' wasn't found".
 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.sessionId = null;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error
          ? reject(new Error(msg.error.message + ' ' + JSON.stringify(msg.error)))
          : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  on(fn) { this.listeners.push(fn); }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout on ' + method));
        }
      }, 45000);
    });
  }
  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise, allowUnsafeEvalBlockedByCSP: false
    });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error('page exception: ' + (e.exception?.description || e.text));
    }
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

/* =====================================================================
 * FIXTURES - synthetic only. No user figure is ever copied.
 *
 * Shape verified against store.js:
 *   STORAGE_KEY                     store.js:5
 *   getDefaultData() envelope        store.js:83-89
 *   per-month container              store.js:65-81
 *   budget item  {id,concepto,monto,tipo,rango,estado}   store.js:515-522
 *   movement      {id,fecha,concepto,flujo,categoria,retornable,estado,monto}
 *                                       store.js:636-645
 *   sanear() tolerance               store.js:214-271
 *
 * Every fixture is pre-sanear-clean on purpose: `leerLocal()` re-persists when
 * `sanear()` reports a change (store.js:117-119), and that write happens BEFORE
 * any of our counters are installed if we get the order wrong. A clean seed keeps
 * boot writes at 0 so any later write is unambiguously a test's fault.
 * ===================================================================== */

function item(id, concepto, monto, tipo, estado, rango) {
  const o = { id, concepto, monto, tipo, estado };
  if (rango !== undefined) o.rango = rango;
  return o;
}

function mov(id, fecha, concepto, flujo, categoria, retornable, estado, monto) {
  return { id, fecha, concepto, flujo, categoria, retornable, estado, monto };
}

function month(id, nombre, corto, extras, movimientos, notas) {
  return {
    id, nombre, corto,
    servicios: {
      fijos: [
        item('i-' + id + '-sf1', 'PRUEBA-ALFA Internet', 111.11, 'Fijo', 'Pendiente'),
        item('i-' + id + '-sf2', 'PRUEBA-ALFA Celular', 222.22, 'Fijo', 'Pagado'),
      ],
      variables: [
        item('i-' + id + '-sv1', 'PRUEBA-ALFA Limpieza', 333.33, 'Variable', 'Pendiente', '100-400'),
      ],
    },
    personales: {
      fijos: [item('i-' + id + '-pf1', 'PRUEBA-ALFA Gimnasio', 444.44, 'Fijo', 'Pendiente')],
      variables: [
        item('i-' + id + '-pv1', 'PRUEBA-ALFA Cremas', 555.55, 'Variable', 'Pendiente', '10-99'),
      ],
    },
    extras: extras,
    notas: notas === undefined ? 'PRUEBA-ALFA notas de prueba' : notas,
    movimientos: movimientos
  };
}

function envelope(activeMonthId, mesesOrden, meses) {
  return {
    version: 1,
    activeMonthId,
    currentView: 'mes',
    mesesOrden,
    meses,
  };
}

/* Two months: `prueba-alfa-2026` is fully populated, `prueba-beta-2026` has
 * expenses but ZERO movements - the exact gap the user reported (#156 item 1). */
function baseline() {
  const alfa = month(
    'prueba-alfa-2026', 'PRUEBA-ALFA 2026', 'PRUEBA-ALFA',
    [item('i-prueba-alfa-2026-ex1', 'PRUEBA-ALFA Extra', 666.66, 'Extra', 'Pagado')],
    [
      mov('m-prueba-alfa-2026-1', '2026-08-01', 'PRUEBA-ALFA Sueldo', 'Ingreso', 'Ingreso', 'No', 'Pagado', 1111.11),
      mov('m-prueba-alfa-2026-2', '2026-08-05', 'PRUEBA-ALFA Alquiler', 'Gasto', 'Vivienda', 'No', 'Pendiente', 222.22),
      mov('m-prueba-alfa-2026-3', '2026-08-09', 'PRUEBA-ALFA Venta', 'Ingreso', 'Extra', 'Si', 'Pendiente', 333.33),
    ]
  );
  const beta = month(
    'prueba-beta-2026', 'PRUEBA-BETA 2026', 'PRUEBA-BETA',
    [item('i-prueba-beta-2026-ex1', 'PRUEBA-BETA Extra', 777.77, 'Extra', 'Pendiente')],
    []   // <- zero movements
  );
  return envelope('prueba-alfa-2026', ['prueba-alfa-2026', 'prueba-beta-2026'], {
    'prueba-alfa-2026': alfa,
    'prueba-beta-2026': beta,
  });
}

/* Same shape, but the ACTIVE month has zero movements. */
function sinMovimientos() {
  const data = baseline();
  data.meses['prueba-alfa-2026'].movimientos = [];
  return data;
}

/* The ACTIVE month has zero expenses in all five lists, but has movements. */
function sinGastos() {
  const data = baseline();
  const m = data.meses['prueba-alfa-2026'];
  m.servicios.fijos = [];
  m.servicios.variables = [];
  m.personales.fijos = [];
  m.personales.variables = [];
  m.extras = [];
  return data;
}

/* Single-month dataset: covers "delete the only month". */
function unSoloMes() {
  const data = baseline();
  const alfa = data.meses['prueba-alfa-2026'];
  return envelope('prueba-alfa-2026', ['prueba-alfa-2026'], {
    'prueba-alfa-2026': alfa,
  });
}

/* ADDED beyond the brief: a month with zero expenses AND zero movements.
 * Needed by T3 for "delete the last element" / "delete the only month".
 * `month()` always fills the four budget lists, so this one is built from
 * scratch rather than from month() - otherwise it would arrive with 5 expenses
 * and the "empty" case would silently not be empty. */
function mesVacio() {
  return envelope('prueba-alfa-2026', ['prueba-alfa-2026'], {
    'prueba-alfa-2026': {
      id: 'prueba-alfa-2026', nombre: 'PRUEBA-ALFA 2026', corto: 'PRUEBA-ALFA',
      servicios: { fijos: [], variables: [] },
      personales: { fijos: [], variables: [] },
      extras: [], notas: 'PRUEBA-ALFA mes sin gastos ni movimientos', movimientos: [],
    },
  });
}

/* 24 periods, one populated: this is the ONLY way to check that the rail scales,
 * and T3 measured it by hand. "A hand" meant: open the app, add 22 months by
 * hand, and look. That measurement cannot be re-run by anyone else, and a
 * layout invariant that cannot be re-run is a memory, not a check.
 *
 * The months are named "Periodo de prueba N 2028" on purpose: `mesesOrden` stores
 * the free text the person typed, so this is the shape that actually breaks a
 * list that assumes "Month Year" — the long names are the hard case, not a
 * shortcut. */
function periodos24() {
  const data = baseline();
  const orden = ['prueba-alfa-2026'];
  const meses = { 'prueba-alfa-2026': data.meses['prueba-alfa-2026'] };
  for (let i = 1; i < 24; i++) {
    const id = 'prueba-periodo-' + i + '-2028';
    meses[id] = month(id, 'Periodo de prueba ' + i + ' 2028', 'Periodo ' + i,
      [], [], 'PRUEBA periodo ' + i);
    orden.push(id);
  }
  return envelope('prueba-alfa-2026', orden, meses);
}

const BUILDERS = {
  baseline, sinMovimientos, sinGastos, unSoloMes, mesVacio, periodos24,
};

export const FIXTURE_NAMES = Object.keys(BUILDERS);

export function buildFixture(name = 'baseline') {
  const b = BUILDERS[name];
  if (!b) {
    throw new Error('unknown fixture "' + name + '". Known: ' + FIXTURE_NAMES.join(', '));
  }
  return JSON.parse(JSON.stringify(b())); // fresh deep clone every call
}

/* =====================================================================
 * INJECTED SCRIPT - runs before ANY page script, every navigation.
 * Serialized from a function so it stays lint-clean and readable.
 * ===================================================================== */

function injectedSource(payload) {
  if (payload.stubMode === 'plain') return injectedPlainSource(payload);
  const stubFactory = new Function('payload', `
    'use strict';
    var S = {
      /* counters */
      bootWrites: 0, writes: 0, byKey: {},
      remoteCargar: 0, remoteGuardar: 0, remoteLogin: 0,
      remoteGithub: 0, remoteSalir: 0,
      /* network tripwires */
      netAttempts: 0, netBlockedUrls: [],
      /* write log: every counted setItem with the top stack frames, so the
       * harness can NAME the call site instead of guessing. */
      writeLog: [],
      /* contract introspection */
      realRemoto: null, realRemotoKeys: null, trapHeld: null,
      fixtureKey: payload.storageKey,
      stub: null
    };
    window.__sandbox = S;

    /* ---- 1. Network tripwire (defense in depth) ------------------
     * Even if some code path reached fetch/XHR directly instead of going
     * through window.gastosRemoto, not one byte leaves the machine.
     * The host is derived from the page's own config at runtime and NEVER
     * reported back to Node, so no credential or project URL leaks. */
    var supabaseHost = '';
    try {
      var cfg = window.GASTOS_CONFIG || {};
      if (cfg.supabaseUrl) supabaseHost = new URL(cfg.supabaseUrl).host;
    } catch (e) { /* no config: nothing to guard */ }

    function isSupabase(url) {
      if (!url) return false;
      var u = String(url);
      if (supabaseHost && u.indexOf(supabaseHost) !== -1) return true;
      return /supabase\\.(co|in)\\b/i.test(u);
    }

    var nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function (input) {
        var url = (typeof input === 'string') ? input : (input && input.url);
        if (isSupabase(url)) {
          S.netAttempts++;
          S.netBlockedUrls.push('fetch');
          return Promise.reject(new Error('[sandbox] supabase fetch blocked by harness'));
        }
        return nativeFetch.apply(this, arguments);
      };
    }
    var nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isSupabase(url)) {
        S.netAttempts++;
        S.netBlockedUrls.push('xhr');
        throw new Error('[sandbox] supabase XHR blocked by harness');
      }
      return nativeOpen.apply(this, arguments);
    };

    /* ---- 2. Seed localStorage BEFORE store.js parses --------------
     * store.js:837 does \`new FinancialStore()\` at top level, whose
     * constructor calls leerLocal() synchronously. */
    try {
      localStorage.setItem(payload.storageKey, payload.fixtureJson);
      localStorage.setItem(S.fixtureKey + '__sandbox_marker', payload.fixtureJson.length);
    } catch (e) { S.seedError = String(e); }

    /* The role picker: app.js:231 opens #modalSessionRoleSelect after 60 ms when
     * this key is absent. That key can only RESTRICT (setRoleReadOnly at app.js:190
     * compares against 'lector'), never grant. Admin comes solely from
     * refrescarSesion() -> our esperarSesion(). Seeding 'admin' only avoids the
     * modal flash. */
    try { sessionStorage.setItem(payload.roleKey, 'admin'); } catch (e) { /* ignore */ }

    /* ---- 3. setItem counter, installed AFTER the seed -------------
     * So seed writes are not counted, and every write the app does is. */
    var nativeSetItem = Storage.prototype.setItem;
    S.resetCounters = function () {
      S.writes = 0; S.byKey = {}; S.writeLog = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        S.byKey[k] = 0;
      }
    };
    /* Freeze the post-boot counts AND reset, so everything counted from here on is
     * attributable to a test. The app writes once at boot by itself
     * (app.js:1656 switchView -> store.save()); that is app behaviour, not a leak,
     * and it is kept in bootWriteLog instead of being hidden or faked away. */
    S.markBootBaseline = function () {
      S.bootBaseline = S.writes;
      S.bootWriteLog = S.writeLog.slice();
      S.bootByKey = JSON.parse(JSON.stringify(S.byKey));
      S.bootDataLength = window.financialStore
        ? JSON.stringify(window.financialStore.data).length : null;
      S.resetCounters();
      return S.bootBaseline;
    };
    Storage.prototype.setItem = function (k, v) {
      if (typeof k === 'string' && (k.indexOf('finanzas') === 0 || k === S.fixtureKey)) {
        S.writes++;
        S.byKey[k] = (S.byKey[k] || 0) + 1;
        S.lastWriteKey = k;
        S.lastWriteLength = String(v).length;
        if (S.writeLog.length < 60) {
          var st = '';
          try { st = String(new Error().stack || '').split('\\n').slice(1, 7).join(' | '); }
          catch (e) { st = 'stack unavailable: ' + e; }
          S.writeLog.push({ key: k, len: String(v).length, stack: st });
        }
      }
      return nativeSetItem.call(this, k, v);
    };

    /* ---- 4. window.gastosRemoto, held by an accessor trap ----------
     * TRAP 1: index.html loads js/supabase-store.js at line 882, BEFORE
     * js/app.js at 885, and supabase-store.js:372 assigns
     * \`window.gastosRemoto = {...}\` while it parses. A plain assignment from
     * the injected script would be overwritten before app.js ever reads it.
     * With a setter we let the real file run (parse errors and console.warn
     * still surface) but keep our stub. */
    var listeners = [];
    var stub = {
      estaConfigurado: function () { return true; },
      /* THE decisive call. esperarSesion()/haySesion() say THERE IS a
       * session, but that alone no longer grants anything: app.js reads the
       * role from obtenerRol(). This stub has to answer that too, otherwise
       * the app falls back to 'lector', the admin gate fails, and every test
       * in the suite reports INCONCLUSIVE because it could not find a single
       * edit control to exercise. */
      obtenerRol: function () { return 'admin'; },
      esperarSesion: function () { return Promise.resolve(true); },
      haySesion: function () { return true; },
      alCambiarSesion: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
      /* null => store.js:150 hayFilaRemota=false => the store takes the LOCAL
       * fixture as source of truth (store.js:169) and then attempts the
       * migration upload (store.js:172). That upload is exactly the write that
       * must never reach the network, so this path is the one worth exercising. */
      cargar: function () { S.remoteCargar++; return Promise.resolve(null); },
      guardar: function (estado) {
        S.remoteGuardar++;
        S.lastGuardarLength = estado ? JSON.stringify(estado).length : 0;
        return Promise.resolve();               /* ZERO network */
      },
      iniciarSesion: function () {
        S.remoteLogin++;
        return Promise.resolve({ ok: false, error: '[sandbox] real login is FORBIDDEN' });
      },
      iniciarSesionConGithub: function () {
        S.remoteGithub++;
        return Promise.resolve({ ok: false, error: '[sandbox] github login is FORBIDDEN' });
      },
      salirDeSesion: function () {
        S.remoteSalir++;
        listeners.forEach(function (cb) { try { cb(false); } catch (e) {} });
        return Promise.resolve();
      },
      _traducirError: function () { return '[sandbox]'; }
    };
    S.stub = stub;
    S.fireSessionChange = function (hay) {
      listeners.forEach(function (cb) { try { cb(!!hay); } catch (e) {} });
    };
    Object.defineProperty(window, 'gastosRemoto', {
      configurable: true,
      enumerable: true,
      get: function () { return stub; },
      set: function (v) {
        /* Swallowed on purpose. */
        S.realRemoto = v;
        try { S.realRemotoKeys = Object.keys(v || {}).sort(); } catch (e) {}
      }
    });

    /* app.js:1667 captured \`const remoto = window.gastosRemoto\` at boot. If our
     * trap failed, that constant is the REAL object and the mismatch between the
     * two is how we detect it - see assertStubShape(). */
    S.trapHeld = true;
  `);
  return '(' + stubFactory.toString() + ')(' + JSON.stringify(payload) + ');';
}

/* DIAGNOSTIC ONLY - `stubMode: 'plain'`.
 * This is the naive harness the trap exists to fix: a plain assignment before
 * navigation. It is kept so the counterfactual can be RUN, not just asserted in a
 * comment: with this mode, js/supabase-store.js overwrites the stub at parse time,
 * assertStubShape() fails loudly, and admin mode is never reached. If someone
 * later "simplifies" the harness back to a plain assignment, this is the test that
 * catches it. Never use it to run CRUD. */
function injectedPlainSource(payload) {
  const factory = new Function('payload', `
    'use strict';
    var S = {
      bootWrites: 0, writes: 0, byKey: {}, writeLog: [],
      remoteCargar: 0, remoteGuardar: 0, remoteLogin: 0,
      remoteGithub: 0, remoteSalir: 0,
      netAttempts: 0, netBlockedUrls: [],
      realRemoto: null, realRemotoKeys: null, trapHeld: false,
      fixtureKey: payload.storageKey, stub: null
    };
    window.__sandbox = S;
    try {
      localStorage.setItem(payload.storageKey, payload.fixtureJson);
      localStorage.setItem(S.fixtureKey + '__sandbox_marker', payload.fixtureJson.length);
    } catch (e) { S.seedError = String(e); }
    try { sessionStorage.setItem(payload.roleKey, 'admin'); } catch (e) {}
    var nativeSetItem = Storage.prototype.setItem;
    S.resetCounters = function () { S.writes = 0; S.byKey = {}; S.writeLog = []; };
    S.markBootBaseline = function () {
      S.bootBaseline = S.writes; S.bootWriteLog = S.writeLog.slice();
      S.bootByKey = JSON.parse(JSON.stringify(S.byKey));
      S.bootDataLength = window.financialStore
        ? JSON.stringify(window.financialStore.data).length : null;
      S.resetCounters(); return S.bootBaseline;
    };
    Storage.prototype.setItem = function (k, v) {
      if (typeof k === 'string' && (k.indexOf('finanzas') === 0 || k === S.fixtureKey)) {
        S.writes++; S.byKey[k] = (S.byKey[k] || 0) + 1;
        S.lastWriteKey = k; S.lastWriteLength = String(v).length;
        if (S.writeLog.length < 60) {
          var st = '';
          try { st = String(new Error().stack || '').split('\\n').slice(1, 7).join(' | '); }
          catch (e) { st = 'stack unavailable: ' + e; }
          S.writeLog.push({ key: k, len: String(v).length, stack: st });
        }
      }
      return nativeSetItem.call(this, k, v);
    };
    var listeners = [];
    var stub = {
      estaConfigurado: function () { return true; },
      /* El rol se lee por acá, no desde haySesion(). Ver la nota del otro stub. */
      obtenerRol: function () { return 'admin'; },
      esperarSesion: function () { return Promise.resolve(true); },
      haySesion: function () { return true; },
      alCambiarSesion: function (cb) { if (typeof cb === 'function') listeners.push(cb); },
      cargar: function () { S.remoteCargar++; return Promise.resolve(null); },
      guardar: function (e) { S.remoteGuardar++; return Promise.resolve(); },
      iniciarSesion: function () { S.remoteLogin++;
        return Promise.resolve({ ok: false, error: 'FORBIDDEN' }); },
      iniciarSesionConGithub: function () { S.remoteGithub++;
        return Promise.resolve({ ok: false, error: 'FORBIDDEN' }); },
      salirDeSesion: function () { S.remoteSalir++; return Promise.resolve(); },
      _traducirError: function () { return '[sandbox]'; }
    };
    S.stub = stub;
    S.fireSessionChange = function (hay) {
      listeners.forEach(function (cb) { try { cb(!!hay); } catch (e) {} });
    };
    /* THE BUG THIS MODE REPRODUCES: a plain assignment. js/supabase-store.js
     * runs later (index.html:882) and replaces it wholesale. */
    window.gastosRemoto = stub;
  `);
  return '(' + factory.toString() + ')(' + JSON.stringify(payload) + ');';
}

/* =====================================================================
 * Browser launch
 * ===================================================================== */

export async function launchSandbox(options = {}) {
  const {
    fixture = 'baseline',
    url = APP_URL,
    width = 1440,
    height = 900,
    headless = true,          // default true: never puts a window on the user's screen
    readyTimeoutMs = 45000,
    startPort = 9333,
    /* 'trap' = accessor property, survives js/supabase-store.js (default, only
     * safe mode). 'plain' = naive assignment, kept as a diagnostic counterfactual;
     * assertStubShape() is EXPECTED TO FAIL in that mode. */
    stubMode = 'trap',
  } = options;

  const executable = findBrowser();
  const debugPort = await freePort(startPort);
  const profileDir = path.join(
    TEMP_ROOT, 'gastos-sandbox-' + process.pid + '-' + debugPort
  );
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    '--remote-debugging-port=' + debugPort,
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-sandbox',
    '--window-size=' + width + ',' + height,
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  const proc = spawn(executable, args, {
    stdio: 'ignore',
    windowsHide: true,
  });

  let closed = false;
  let browser = null;
  let targetId = null;
  let wsUrl = null;

  const killBrowser = () => {
    if (!proc.pid) return;
    try {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true });
    } catch { /* already gone */ }
  };

  const removeProfile = () => {
    for (let i = 0; i < 12; i++) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
        return true;
      } catch { /* file still locked, retry */ }
    }
    return false;
  };

  try {
    /* Wait for the debugging endpoint. */
    const deadline = Date.now() + readyTimeoutMs;
    let version = null;
    while (Date.now() < deadline) {
      try {
        version = await httpJson('/json/version', debugPort, 1500);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 250));
      }
    }
    if (!version) throw new Error('browser never exposed CDP on port ' + debugPort);
    wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl || !/:\d+\//.test(wsUrl)) {
      throw new Error('webSocketDebuggerUrl without a port: ' + wsUrl);
    }

    const browserWs = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      browserWs.addEventListener('open', res, { once: true });
      browserWs.addEventListener('error',
        () => rej(new Error('could not open the browser socket')), { once: true });
    });
    browser = new Cdp(browserWs);

    /* NOTE: no \`background: true\` - Brave discards such targets with
     * "No target with given id found" and leaves the socket hanging (cdp.mjs). */
    ({ targetId } = await browser.send('Target.createTarget',
      { url: 'about:blank', newWindow: !headless }));
    const { sessionId } = await browser.send('Target.attachToTarget',
      { targetId, flatten: true }, null);
    browser.sessionId = sessionId;
    const page = browser;

    const consoleErrors = [];
    const exceptions = [];
    const failedRequests = [];
    const requests = [];

    page.on(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || [])
          .map(a => a.value ?? a.description ?? a.type).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails?.exception?.description ||
          msg.params.exceptionDetails?.text);
      }
      if (msg.method === 'Network.responseReceived') {
        const st = msg.params.response.status;
        if (st >= 400) failedRequests.push(st + ' ' + msg.params.response.url);
      }
      if (msg.method === 'Network.requestWillBeSent') {
        requests.push({
          method: msg.params.request.method,
          url: msg.params.request.url,
          hasBody: !!msg.params.request.postData,
        });
      }
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    /* TRAP 4: before navigating, or assets come from the profile cache. */
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false });
    try { await page.send('Page.bringToFront'); } catch { /* already front */ }
    try { await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }); }
    catch { /* unsupported */ }

    const fixtureData = buildFixture(fixture);
    const payload = {
      storageKey: STORAGE_KEY,
      roleKey: SESSION_ROLE_KEY,
      fixtureJson: JSON.stringify(fixtureData),
      fixtureName: fixture,
      stubMode,
    };
    const source = injectedSource(payload);
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source });

    /* TRAP 5: a discarded capture is the cheapest way to force a frame. */
    const pump = async (n = 3) => {
      for (let i = 0; i < n; i++) {
        await page.send('Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false });
      }
    };

    const gotoAndWait = async (target, waitMs = 7000) => {
      await page.send('Page.navigate', { url: target });
      /* Wait for the admin gate to settle instead of guessing with a fixed sleep:
       * refrescarSesion() -> esperarSesion() -> aplicarSesion() is async. */
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const ready = await page.eval(`(() => {
          const b = document.body;
          return !!(b && window.__sandbox && window.financialStore &&
                    !b.classList.contains('read-only-mode'));
        })()`).catch(() => false);
        if (ready) break;
        await new Promise(r => setTimeout(r, 150));
      }
      await pump(2);
      await new Promise(r => setTimeout(r, 400));
    };

    const writeCount = async () => {
      const raw = await page.eval(`(() => {
        const s = window.__sandbox;
        return s ? { writes: s.writes, byKey: s.byKey, lastWriteKey: s.lastWriteKey,
                     lastWriteLength: s.lastWriteLength,
                     bootBaseline: s.bootBaseline === undefined ? null : s.bootBaseline,
                     bootByKey: s.bootByKey || null,
                     bootWriteLog: s.bootWriteLog || null,
                     bootDataLength: s.bootDataLength === undefined ? null : s.bootDataLength,
                     writeLog: s.writeLog } : null;
      })()`);
      return raw || { writes: null, byKey: {}, note: 'window.__sandbox missing' };
    };

    const sandbox = {
      /* --- handles --- */
      page, browser, proc, profileDir, debugPort, executable, headless,
      url, fixtureName: fixture, fixtureData,
      consoleErrors, exceptions, failedRequests, requests,

      /* --- navigation --- */
      goto: gotoAndWait,
      async reload(waitMs = 7000) { await gotoAndWait(url, waitMs); },
      pump,

      async resize(w, h) {
        await page.send('Emulation.setDeviceMetricsOverride',
          { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await pump(2);
        await new Promise(r => setTimeout(r, 500));
      },

      async shot(file) {
        const r = await page.send('Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        return file;
      },

      /* --- keyboard, TRAP 2 ---
       * Input.dispatchKeyEvent does NOT deliver keyboard in an isolated window on
       * the real site. Dispatch a synthetic KeyboardEvent instead. Both global
       * keydown listeners (app.js:1077, app.js:1621) are on window; the search
       * one (app.js:1057) is on commandSearchInput, so bubbling from the target
       * covers it too. */
      async dispatchKey(spec) {
        return page.eval(`(() => {
          const spec = ${JSON.stringify(spec)};
          const target = spec.targetSelector
            ? document.querySelector(spec.targetSelector)
            : window;
          if (!target) return { ok: false, reason: 'target not found: ' + spec.targetSelector };
          const init = {
            key: spec.key, code: spec.code || spec.key,
            keyCode: spec.keyCode || 0, which: spec.which || spec.keyCode || 0,
            bubbles: true, cancelable: true, composed: true,
            shiftKey: !!spec.shiftKey, ctrlKey: !!spec.ctrlKey, altKey: !!spec.altKey,
          };
          target.dispatchEvent(new KeyboardEvent(spec.type || 'keydown', init));
          return { ok: true, target: target === window ? 'window' : spec.targetSelector };
        })()`);
      },

      /* --- write counting (requirement 4) --- */
      writeCount,
      writeLog: () => page.eval(
        `({ current: ((window.__sandbox || {}).writeLog || []).slice(),
            boot: ((window.__sandbox || {}).bootWriteLog || null) })`),
      async markBootBaseline() {
        return page.eval('window.__sandbox.markBootBaseline()');
      },
      async resetWrites() {
        await page.eval('window.__sandbox.resetCounters(); true');
        return true;
      },

      /* window.financialStore IS reachable (store.js:837), so the snapshot is
       * real - not reconstructed. */
      dataLength: () => page.eval(
        `(window.financialStore ? JSON.stringify(window.financialStore.data).length : null)`),
      dataSnapshot: () => page.eval(
        `(window.financialStore ? JSON.stringify(window.financialStore.data) : null)`),
      data: () => page.eval(
        `(window.financialStore ? JSON.parse(JSON.stringify(window.financialStore.data)) : null)`),

      /* --- stub introspection --- */
      stubReport: () => page.eval(`(() => {
        const s = window.__sandbox;
        if (!s) return { present: false };
        const g = window.gastosRemoto;
        return {
          present: true,
          trapHeld: s.trapHeld,
          identityHolds: g === s.stub,
          realRemotoWasIntercepted: !!s.realRemoto,
          realRemotoKeys: s.realRemotoKeys,
          stubKeys: Object.keys(s.stub).sort(),
          realCalls: {
            cargar: s.remoteCargar, guardar: s.remoteGuardar,
            iniciarSesion: s.remoteLogin, iniciarSesionConGithub: s.remoteGithub,
            salirDeSesion: s.remoteSalir,
          },
          lastGuardarLength: s.lastGuardarLength === undefined
            ? null : s.lastGuardarLength,
          netAttempts: s.netAttempts,
          seedError: s.seedError || null,
          sessionRoleKey: sessionStorage.getItem('finanzas_session_role_chosen'),
          storageKeys: Object.keys(localStorage),
        };
      })()`),

      /* Observable proof of admin. `obtenerSesion()` is module-scope in app.js
       * and NOT reachable from the page, so we assert on what it PRODUCES:
       * read-only-mode removed and the admin controls actually laid out. */
      adminState: () => page.eval(`(() => {
        const btns = Array.from(document.querySelectorAll('.admin-action-btn'));
        const visible = btns.filter(b => {
          const cs = getComputedStyle(b);
          return cs.display !== 'none' && cs.visibility !== 'hidden' &&
                 b.getClientRects().length > 0;
        });
        const label = document.getElementById('authModeLabel');
        const badge = document.getElementById('btnToggleAuthMode');
        return {
          readOnlyMode: document.body.classList.contains('read-only-mode'),
          adminButtonsTotal: btns.length,
          adminButtonsVisible: visible.length,
          adminButtonIds: visible.map(b => b.id || b.className).slice(0, 20),
          authModeLabel: label ? label.textContent : null,
          badgeClass: badge ? badge.className : null,
          connBadge: (document.getElementById('indicadorConexion') || {}).className || null,
          roleModalOpen: (document.getElementById('modalSessionRoleSelect') || {})
            .classList.contains('active'),
          adminAuthModalOpen: (document.getElementById('modalAdminAuth') || {})
            .classList.contains('active'),
        };
      })()`),

      /* --- HARD ASSERTIONS --- */

      /* If the stub shape is wrong, every later result is meaningless. Fail loudly
       * and immediately rather than reporting a green run that proves nothing. */
      async assertStubShape() {
        const r = await sandbox.stubReport();
        const problems = [];
        if (!r.present) problems.push('window.__sandbox never installed (injection failed)');
        else {
          if (!r.trapHeld) problems.push('accessor trap not installed');
          if (!r.identityHolds) {
            problems.push('window.gastosRemoto !== the stub: js/supabase-store.js won the ' +
              'assignment race. Admin state would come from the real (unauthenticated) store.');
          }
          if (!r.realRemotoWasIntercepted) {
            /* Only meaningful when the trap IS installed: without a setter there
             * is nothing to capture the real assignment, so a null here says
             * nothing about script order. */
            if (r.trapHeld) {
              problems.push('the trap is installed but js/supabase-store.js never assigned ' +
                'window.gastosRemoto - script order changed and this harness is stale');
            } else {
              problems.push('no accessor trap: js/supabase-store.js (index.html:882, before ' +
                'app.js at 885) overwrites the stub at parse time. Use stubMode: "trap".');
            }
          }
          const required = ['estaConfigurado', 'esperarSesion', 'haySesion',
            'alCambiarSesion', 'cargar', 'guardar', 'salirDeSesion',
            'iniciarSesion', 'iniciarSesionConGithub'];
          const missing = required.filter(k => !r.stubKeys.includes(k));
          if (missing.length) problems.push('stub missing methods: ' + missing.join(', '));
          if (r.realCalls.iniciarSesion > 0 || r.realCalls.iniciarSesionConGithub > 0) {
            problems.push('a real login was attempted: ' + JSON.stringify(r.realCalls));
          }
        }
        if (problems.length) {
          throw new Error('SANDBOX STUB SHAPE INVALID:\\n  - ' + problems.join('\\n  - ') +
            '\\n\\nreport: ' + JSON.stringify(r, null, 1));
        }
        return r;
      },

      async assertAdmin() {
        await sandbox.assertStubShape();
        const a = await sandbox.adminState();
        if (a.readOnlyMode) {
          throw new Error('NOT ADMIN: body still has read-only-mode. ' +
            'The whole suite would audit zero edit controls. state=' + JSON.stringify(a));
        }
        if (a.adminButtonsTotal === 0) {
          throw new Error('NOT ADMIN: no .admin-action-btn found in the DOM at all - ' +
            'either the markup changed or the view did not render. state=' + JSON.stringify(a));
        }
        if (a.adminButtonsVisible !== a.adminButtonsTotal) {
          throw new Error('NOT ADMIN: only ' + a.adminButtonsVisible + ' of ' +
            a.adminButtonsTotal + ' .admin-action-btn are laid out. state=' + JSON.stringify(a));
        }
        if (a.authModeLabel !== 'Modo Administrador') {
          throw new Error('NOT ADMIN: authModeLabel is ' + JSON.stringify(a.authModeLabel) +
            ', expected "Modo Administrador". state=' + JSON.stringify(a));
        }
        return a;
      },

      async assertNoWrites(label = 'test') {
        const w = await sandbox.writeCount();
        if (typeof w.writes !== 'number') {
          throw new Error('cannot count writes: ' + JSON.stringify(w));
        }
        if (w.writes !== 0) {
          throw new Error('WRITE LEAK (' + label + '): ' + w.writes +
            ' setItem call(s) on finanzas*/store keys. byKey=' +
            JSON.stringify(w.byKey) + ' lastKey=' + w.lastWriteKey);
        }
        return w;
      },

      /* Proves nothing reached Supabase: no request the harness saw goes to a
       * Supabase host, and the fetch/XHR tripwire never fired. */
      async assertNetworkClean() {
        const inPage = await page.eval(
          '({ netAttempts: (window.__sandbox || {}).netAttempts || 0 })');
        const supa = requests.filter(r => /supabase\.(co|in)\b/i.test(r.url));
        if (supa.length) {
          throw new Error('NETWORK LEAK: ' + supa.length +
            ' request(s) reached a Supabase host: ' +
            supa.map(r => r.method).join(','));
        }
        if (inPage.netAttempts > 0) {
          throw new Error('NETWORK LEAK: the page tried ' + inPage.netAttempts +
            ' Supabase request(s); the tripwire blocked them. Requests would have ' +
            'escaped with a working connection.');
        }
        return { supabaseRequests: 0, tripwireAttempts: inPage.netAttempts, totalRequests: requests.length };
      },

      /* The no-write proof the doc asks for: data length before/after + write count
       * + network. Returns the evidence object so a report can print it verbatim.
       * NOTE: the app writes ONCE at boot by itself (app.js:1656 switchView ->
       * store.save()). That is the app's behaviour, not a leak, so the proof
       * separates bootBaseline from writes caused after markBootBaseline(). */
      async noWriteProof(label = 'run') {
        const before = await sandbox.dataLength();
        const r = await sandbox.assertNoWrites(label);
        const net = await sandbox.assertNetworkClean();
        const after = await sandbox.dataLength();
        return {
          label,
          dataLengthBefore: before,
          dataLengthAfter: after,
          dataLengthUnchanged: before === after,
          setItemCalls: r.writes,
          bootBaseline: r.bootBaseline,
          bootByKey: r.bootByKey,
          bootWriteLog: r.bootWriteLog || [],
          bootDataLength: r.bootDataLength,
          byKey: r.byKey,
          writeLog: r.writeLog || [],
          remoteGuardarCalls: (await sandbox.stubReport()).realCalls.guardar,
          network: net,
        };
      },

      async eval(expression, opts) { return page.eval(expression, opts); },

      async close() {
        if (closed) return;
        closed = true;
        try { if (browser && targetId) await browser.send('Target.closeTarget', { targetId }); }
        catch { /* already closed */ }
        if (browser) browser.close();
        killBrowser();
        /* give the browser a moment to release the profile before deleting it */
        await new Promise(r => setTimeout(r, 700));
        const removed = removeProfile();
        return { removed, profileDir, debugPort };
      },
    };

    /* Navigate for real: the injection runs on this navigation too. */
    await gotoAndWait(url, 9000);
    return sandbox;
  } catch (err) {
    killBrowser();
    await new Promise(r => setTimeout(r, 500));
    removeProfile();
    if (browser) browser.close();
    throw err;
  }
}

/* =====================================================================
 * SELF-TEST - `node odd\tasks\sandbox.mjs`
 * Proves the harness reaches admin, writes nothing, and touches no network.
 * ===================================================================== */
const isMain = (() => {
  try {
    return !!process.argv[1] &&
      path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (isMain) {
  const sb = await launchSandbox({ fixture: 'baseline' });
  let failed = false;
  try {
    /* Keep the app's own boot write, then freeze it as the baseline. Everything
     * after this point is attributable to a test. */
    const boot = await sb.writeCount();
    await sb.markBootBaseline();    const stub = await sb.assertStubShape();
    const admin = await sb.assertAdmin();
    const proof = await sb.noWriteProof('self-test');

    console.log('=== sandbox self-test ===');
    console.log('browser           :', path.basename(sb.executable), 'port', sb.debugPort);
    console.log('headless          :', sb.headless);
    console.log('profile (throwaway):', sb.profileDir);
    console.log('fixture           :', sb.fixtureName, '->', sb.fixtureData.mesesOrden.join(', '));
    console.log('');
    console.log('-- stub contract --');
    console.log('trapHeld              :', stub.trapHeld);
    console.log('identityHolds         :', stub.identityHolds);
    console.log('realRemotoIntercepted :', stub.realRemotoWasIntercepted);
    console.log('real gastosRemoto keys:', JSON.stringify(stub.realRemotoKeys));
    console.log('stub remote calls     :', JSON.stringify(stub.realCalls));
    console.log('localStorage keys     :', JSON.stringify(stub.storageKeys));
    console.log('');
    console.log('-- admin gate (observed) --');
    console.log('read-only-mode        :', admin.readOnlyMode, '(must be false)');
    console.log('authModeLabel         :', JSON.stringify(admin.authModeLabel));
    console.log('badgeClass            :', admin.badgeClass);
    console.log('connBadge             :', admin.connBadge);
    console.log('admin-action-btn      :', admin.adminButtonsVisible + '/' +
      admin.adminButtonsTotal, 'visible');
    console.log('admin button ids      :', JSON.stringify(admin.adminButtonIds));
    console.log('roleModalOpen         :', admin.roleModalOpen, '(must be false)');
    console.log('adminAuthModalOpen    :', admin.adminAuthModalOpen, '(must be false)');
    console.log('');
    console.log('-- the app writes on boot, on its own --');
    console.log('boot setItem calls     :', proof.bootBaseline, JSON.stringify(proof.bootByKey));
    (proof.bootWriteLog || []).forEach((w, i) => {
      console.log('  [' + i + '] key=' + w.key + ' bytes=' + w.len);
      console.log('       ' + w.stack);
    });
    console.log('');
    console.log('-- no-write proof (after boot baseline) --');
    console.log('dataLength before/after:', proof.dataLengthBefore, '/', proof.dataLengthAfter,
      proof.dataLengthUnchanged ? '(UNCHANGED)' : '(CHANGED!)');
    console.log('setItem calls          :', proof.setItemCalls, '(must be 0)');
    console.log('remote guardar calls   :', proof.remoteGuardarCalls,
      '(blocked in the stub, 0 bytes sent)');
    console.log('supabase requests      :', proof.network.supabaseRequests, '(must be 0)');
    console.log('fetch/XHR tripwire hits:', proof.network.tripwireAttempts, '(must be 0)');
    console.log('total page requests    :', proof.network.totalRequests);
    console.log('');
    console.log('console errors :', JSON.stringify(sb.consoleErrors));
    console.log('exceptions      :', JSON.stringify(sb.exceptions));
    console.log('failed requests :', JSON.stringify(sb.failedRequests));
  } catch (e) {
    failed = true;
    console.error('=== SELF-TEST FAILED ===');
    console.error(e.message);
    console.error('console errors :', JSON.stringify(sb.consoleErrors));
    console.error('exceptions      :', JSON.stringify(sb.exceptions));
  } finally {
    const cleanup = await sb.close();
    console.log('');
    console.log('profile deleted :', cleanup.removed, '->', cleanup.profileDir);
  }
  process.exit(failed ? 1 : 0);
}
