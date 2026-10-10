/* Verificacion de la edicion para el perfil administrador.
 *
 * OBJETIVO: demostrar que editar un gasto y editar un movimiento funcionan SIN
 * que se escriba un solo byte de los datos del usuario.
 *
 * COMO SE CONGELA, Y POR QUE ANTES DE CARGAR LA PAGINA:
 *
 *  1. `Page.addScriptToEvaluateOnNewDocument` corre antes de CUALQUIER script de
 *     la pagina. Ahi se parchea `Storage.prototype.setItem`, que es el mismo
 *     prototipo de localStorage y de sessionStorage: un solo parche tapa a las
 *     dos. Se cuentan y NO SE ESCRIBEN ni la clave de datos
 *     (`control_gastos_mensuales_db_v1`) ni las que empiezan con "finanzas"
 *     (la eleccion de rol de la pestana).
 *  2. El MISMO script define un setter sobre `window.gastosRemoto`. Como
 *     supabase-store.js asigna ese objeto cuando carga, el setter corre antes de
 *     que exista y le cuelga contadores a `guardar`, `iniciarSesion`,
 *     `salirDeSesion` e `iniciarSesionConGithub`. Si se dejara pasar la
 *     escritura inicial de la app, se caeria justo lo que hay que preservar.
 *  3. Despues de cargar, `store.save` se reemplaza por un contador y los dos
 *     mutadores que se prueban se envuelven para que corran la LOGICA REAL
 *     sobre una COPIA profunda descartable: el store vivo nunca se muta.
 *
 * SOBRE LOS MOVIMIENTOS: el estado real del usuario tiene CERO movimientos en
 * todos los meses, asi que no hay fila de movimiento que poder clickear. Para
 * probar el camino completo se SIEMBRA un movimiento sintetico SOLO EN MEMORIA y
 * se pide el redibujado con `store.notificar()`, que dispara el `switchView`
 * que app.js ya tiene registrado. `notificar()` no llama a `save`. Al final se
 * devuelve la memoria al estado original y se comprueba con un hash.
 * La garantia de que esto no toca los datos del usuario es doble: `setItem`
 * esta interceptado y `save` es un contador. El estado en memoria no puede
 * persistir; ademas la ventana se cierra al terminar.
 *
 * El snapshot (localStorage, memoria y contadores) se saca ANTES y DESPUES de
 * todo. Si difiere, el script lo dice con el diff y NO intenta arreglarlo:
 * restaurar tambien seria escribir.
 */
import path from 'node:path';
import fs from 'node:fs';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';
import { PROBES } from './probes.mjs';

const LABEL = process.argv[2] || 'r1';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const STORAGE_KEY = 'control_gastos_mensuales_db_v1';
const CSS_PATH = path.join(process.cwd(), 'css', 'styles.css');

/* ---------- congelamiento, inyectado ANTES de que corra la pagina ---------- */
const FREEZE_AT_START = `
(() => {
  const w = window;
  w.__probe = w.__probe || {};
  const p = w.__probe;
  p.setItem = p.setItem || {};
  p.remoto = p.remoto || {};
  p.llamadas = p.llamadas || {};
  p.storeSave = 0;
  p.congeladoEn = 'document-start';

  const conteo = (bolsa, k) => { bolsa[k] = (bolsa[k] || 0) + 1; };

  /* localStorage y sessionStorage comparten prototipo: este parche tapa a los
     dos. Las claves de datos y las que empiezan con "finanzas" se cuentan y NO
     SE ESCRIBEN. Cualquier otra clave pasa de largo. */
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    const key = String(k);
    if (key === ${JSON.stringify(STORAGE_KEY)} || key.indexOf('finanzas') === 0) {
      conteo(p.setItem, key);
      return;
    }
    return origSet.call(this, k, v);
  };
  p.setItemParcheado = typeof origSet === 'function';

  /* gastosRemoto todavia no existe: se congela en el momento de crearse. */
  let remoto;
  Object.defineProperty(w, 'gastosRemoto', {
    configurable: true,
    get() { return remoto; },
    set(v) {
      if (v && typeof v === 'object' && !v.__congelado) {
        v.__congelado = true;
        for (const k of ['guardar','iniciarSesion','salirDeSesion','iniciarSesionConGithub']) {
          const orig = v[k];
          if (typeof orig !== 'function') continue;
          v[k] = function () { conteo(p.remoto, k); return Promise.resolve({ ok: false, congelado: true }); };
        }
      }
      remoto = v;
    }
  });

  p.leer = function () {
    return { setItem: Object.assign({}, p.setItem), remoto: Object.assign({}, p.remoto),
             storeSave: p.storeSave };
  };
  return 'congelado-en-document-start';
})()
`;

/* ---------- snapshot: persistente + memoria, con hash para comparar ---------- */
const SNAPSHOT = `(() => {
  const clave = ${JSON.stringify(STORAGE_KEY)};
  let crudo = null;
  try { crudo = localStorage.getItem(clave); } catch (e) { crudo = 'ERROR:' + e; }

  const resumen = (data) => {
    if (!data || !data.meses) return { error: 'sin data.meses' };
    const porColeccion = {};
    let totGastos = 0, totEgresos = 0, totPagados = 0, totMovs = 0;
    const col = (arr, nombre) => {
      let c = 0, s = 0; const est = {};
      for (const i of (arr || [])) {
        c++; s += Number(i.monto) || 0;
        if (i.estado === 'Pagado') totPagados++;
        const e = i.estado || 'Pendiente';
        est[e] = (est[e] || 0) + 1;
      }
      totGastos += c; totEgresos += s;
      porColeccion[nombre] = { cantidad: c, porEstado: est, sumaMonto: Math.round(s * 100) / 100 };
    };
    for (const id of data.mesesOrden || []) {
      const m = data.meses[id]; if (!m) continue;
      col(m.servicios && m.servicios.fijos, id + '/servicios/fijos');
      col(m.servicios && m.servicios.variables, id + '/servicios/variables');
      col(m.personales && m.personales.fijos, id + '/personales/fijos');
      col(m.personales && m.personales.variables, id + '/personales/variables');
      col(m.extras, id + '/extras');
      const movs = m.movimientos || [];
      totMovs += movs.length;
      porColeccion[id + '/MOVIMIENTOS'] = { cantidad: movs.length };
    }
    return { totalGastos: totGastos, totalPagados: totPagados, totalPendientes: totGastos - totPagados,
             totalEgresos: Math.round(totEgresos * 100) / 100, totalMovimientos: totMovs,
             meses: (data.mesesOrden || []).length, activeMonthId: data.activeMonthId,
             porColeccion };
  };

  /* FNV-1c de 32 bits: dos enteros alcanzan para detectar cualquier cambio y
     es mucho mas corto de comparar/imprimir que el JSON entero. */
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
  };

  let local = null;
  try { local = crudo ? JSON.parse(crudo) : null; } catch (e) { local = null; }
  const memoria = window.financialStore ? window.financialStore.data : null;
  return {
    bytesLocales: crudo === null ? null : crudo.length,
    hashLocales: crudo === null ? null : hash(crudo),
    hashMemoria: memoria ? hash(JSON.stringify(memoria)) : null,
    resumenLocal: local ? resumen(local) : null,
    resumenMemoria: memoria ? resumen(memoria) : null,
  };
})()`;

/* Version compacta para la consola: totales + el mes activo. */
const SNAPSHOT_CORTA = `(() => {
  const s = window.__snap;
  if (!s) return null;
  const act = s.resumenLocal && s.resumenLocal.activeMonthId;
  const filtrar = (r) => {
    if (!r) return null;
    const porColeccion = {};
    for (const k of Object.keys(r.porColeccion)) if (k.indexOf(act) === 0) porColeccion[k] = r.porColeccion[k];
    return { totalGastos: r.totalGastos, totalPagados: r.totalPagados, totalPendientes: r.totalPendientes,
             totalEgresos: r.totalEgresos, totalMovimientos: r.totalMovimientos, meses: r.meses,
             activeMonthId: r.activeMonthId, mesActivo: porColeccion };
  };
  return { bytesLocales: s.bytesLocales, hashLocales: s.hashLocales, hashMemoria: s.hashMemoria,
           local: filtrar(s.resumenLocal), memoria: filtrar(s.resumenMemoria) };
})()`;

/* ---------- helpers de medicion ---------- */

/* SNAPSHOT ya es una expresion IIFE lista para ejecutar. */
const ASIGNAR_SNAPSHOT = `window.__snap = ${SNAPSHOT}; 'ok'`;

/* Item real del mes activo. Se puede pedir uno de tipo Variable para ejercitar el
   campo de rango, que en un Fijo queda oculto. */
const ITEM_REAL = (tipo) => `(() => {
  const st = window.financialStore;
  const mid = st.data.activeMonthId;
  const m = st.data.meses[mid];
  const colls = [['servicios','fijos',m.servicios.fijos],['servicios','variables',m.servicios.variables],
                 ['personales','fijos',m.personales.fijos],['personales','variables',m.personales.variables],
                 ['extras','extra',m.extras]];
  let item = null, seccion = null;
  const querer = ${tipo ? JSON.stringify(tipo) : 'null'};
  for (const [sec, sub, coll] of colls) {
    if (querer && (coll[0] || {}).tipo !== querer) continue;
    const hit = coll.find(x => x.estado === 'Pendiente') || coll[0];
    if (hit) { item = hit; seccion = sec + '/' + sub; break; }
  }
  return { monthId: mid, seccion, item: item ? JSON.parse(JSON.stringify(item)) : null };
})()`;

const VALORES_MODAL = (idModal, campos) => `(() => {
  const raiz = document.getElementById(${JSON.stringify(idModal)});
  const out = { modalExiste: !!raiz, activo: raiz ? raiz.classList.contains('active') : null };
  ${campos.map(c => `  out[${JSON.stringify(c)}] = (function () {
    const e = document.getElementById(${JSON.stringify(c)});
    if (!e) return 'FALTA ELEMENTO';
    return ('value' in e) ? e.value : e.textContent;
  })();`).join('\n')}
  return out;
})()`;

const CAMPOS_GASTO = ['editExpenseMonthId','editExpenseItemId','editExpenseConcepto','editExpenseMonto','editExpenseTipoReadonly','editExpenseRango'];
const CAMPOS_MOV = ['editMovementMonthId','editMovementId','editMovementConcepto','editMovementMonto','editMovementFecha','editMovementFlujoReadonly'];

const CONTRASTE_EN_MODAL = `(idModal => {
  const raiz = document.getElementById(idModal);
  if (!raiz) return { falta: true };
  const out = [];
  const walk = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT, {
    acceptNode: el => {
      if (!window.__audit.__visible(el)) return NodeFilter.FILTER_REJECT;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim().length) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_SKIP;
    }
  });
  let el;
  while ((el = walk.nextNode())) {
    const cs = getComputedStyle(el);
    const fg0 = window.__audit.parse(cs.color); if (!fg0) continue;
    const bg = window.__audit.bgOf(el);
    const fg = fg0[3] < 1 ? bg.rgb.map((b, i) => Math.round(fg0[i] * fg0[3] + b * (1 - fg0[3]))) : fg0.slice(0, 3);
    const px = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const grande = px >= 24 || (px >= 18.66 && weight >= 700);
    const min = grande ? 3 : 4.5;
    const ratio = Math.round(window.__audit.ratio(fg, bg.rgb) * 100) / 100;
    out.push({
      sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
           (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
      texto: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
      fg: 'rgb(' + fg.map(Math.round).join(', ') + ')', bg: 'rgb(' + bg.rgb.join(', ') + ')',
      px, weight, min, ratio, cumple: ratio >= min,
    });
  }
  return out;
})`;

const BOTONES_FILA = `(() => {
  const info = (sel) => {
    const b = document.querySelector(sel);
    if (!b) return { falta: true };
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return { clases: b.className, esAdmin: b.classList.contains('admin-action-btn'),
             display: cs.display, opacity: cs.opacity, w: Math.round(r.width),
             glifo: !!b.querySelector('svg.ui-glyph'), title: b.title,
             glifoPath: (b.querySelector('svg.ui-glyph path') || {}).getAttribute
                        ? b.querySelector('svg.ui-glyph path').getAttribute('d') : null };
  };
  return {
    bodyClass: document.body.className,
    gastoEditar: info('.expense-card-item .btn-edit-expense'),
    gastoEliminar: info('.expense-card-item .btn-delete-expense'),
    movEditar: info('.transaction-feed-item .btn-edit-tx'),
    movEliminar: info('.transaction-feed-item .btn-delete-tx'),
    glifosDistintos: (function () {
      const e = document.querySelector('.expense-card-item .btn-edit-expense path');
      const d = document.querySelector('.expense-card-item .btn-delete-expense path');
      return !!(e && d && e.getAttribute('d') !== d.getAttribute('d'));
    })(),
  };
})()`;

const FOCO_REAL = (id) => `(() => {
  const el = document.getElementById(${JSON.stringify(id)});
  if (!el) return { falta: true };
  el.focus();
  const cs = getComputedStyle(el);
  let caja = el, anillo = null, portador = null;
  while (caja && caja !== document.body) {
    const s = getComputedStyle(caja);
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) {
      anillo = s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor;
      portador = caja.id ? '#' + caja.id : String(caja.className).trim().split(/\\s+/)[0];
      break;
    }
    caja = caja.parentElement;
  }
  return { enfocado: document.activeElement === el, focus: el.matches(':focus'),
           focusVisible: el.matches(':focus-visible'), borde: cs.borderColor,
           anillo: anillo || 'NINGUNO', portador: portador, valor: el.value };
})()`;

const MODALES_ACTIVOS = `[...document.querySelectorAll('.modal-overlay.active')].map(m => m.id)`;

const CENTRO = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`;

/* Siembra un movimiento SOLO EN MEMORIA y pide el redibujado con notificar(),
   que dispara el switchView que app.js ya tiene registrado. No llama a save.
   Se guarda el estado original para devolverlo despues. */
const SEMBRAR_MOVIMIENTOS = `(() => {
  const st = window.financialStore;
  const p = window.__probe;
  if (!p.estadoOriginal) p.estadoOriginal = JSON.stringify(st.data);
  const mid = st.data.activeMonthId;
  const m = st.data.meses[mid];
  if (!Array.isArray(m.movimientos)) m.movimientos = [];
  m.movimientos.unshift(
    { id: 'sintetico_ingreso', fecha: '2026-09-05', concepto: 'Sueldo (sintetico)', flujo: 'Ingreso',
      categoria: 'General', retornable: 'No', estado: 'Pagado', monto: 2450.5 },
    { id: 'sintetico_gasto', fecha: '2026-09-08', concepto: 'Compra (sintetico)', flujo: 'Gasto',
      categoria: 'General', retornable: 'No', estado: 'Pendiente', monto: 320.75 });
  st.notificar();
  return JSON.stringify({ mes: mid, movimientos: m.movimientos.length });
})()`;

const RESTAURAR_MEMORIA = `(() => {
  const st = window.financialStore;
  const p = window.__probe;
  if (!p.estadoOriginal) return JSON.stringify({ restaurado: false, razon: 'no habia estado original' });
  st.data = JSON.parse(p.estadoOriginal);
  st.notificar();
  const igual = JSON.stringify(st.data) === p.estadoOriginal;
  return JSON.stringify({ restaurado: true, memoriaVuelveAlOriginal: igual,
                          movimientos: (st.data.meses[st.data.activeMonthId].movimientos || []).length });
})()`;

const s = await openPage({ width: 1440, height: 900 });
const rep = { label: LABEL, script: 'edicion-admin.mjs' };
const ABORTAR = [];

try {
  /* La regla del gate, leida del archivo: el CSSOM no es accesible con file://
     en Brave, asi que el texto sale de acá y el comportamiento de la regla se
     mide aparte en T2. */
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const mRegla = css.match(/body\.read-only-mode\s+\.admin-action-btn\s*\{[^}]*\}/);
  rep.reglaGateEnArchivo = mRegla ? mRegla[0].replace(/\s+/g, ' ') : 'NO ENCONTRADA EN css/styles.css';
  rep.prefersColorScheme = (css.match(/@media[^{]*prefers-color-scheme/g) || []).length;

  /* --- congelar ANTES de cargar --- */
  await s.page.send('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE_AT_START });
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(PROBES);
  await s.page.eval(`(() => {
    window.__audit.__visible = function (el) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return 'ok';
  })()`);

  rep.congelamiento = JSON.parse(await s.page.eval(`JSON.stringify({
    inyectadoEn: window.__probe.congeladoEn,
    setItemParcheado: window.__probe.setItemParcheado,
    hayRemoto: !!window.gastosRemoto,
    remotoCongelado: !!(window.gastosRemoto && window.gastosRemoto.__congelado),
    guardarEsContador: !!(window.gastosRemoto && window.gastosRemoto.guardar &&
      /congelado/.test(String(window.gastosRemoto.guardar.toString())))
  })`));

  /* --- store.save congelado + mutadores envueltos sobre copia descartable --- */
  rep.store = JSON.parse(await s.page.eval(`(() => {
    const st = window.financialStore;
    const p = window.__probe;
    if (!st.__congelado) {
      st.__congelado = true;
      st.save = function () { p.storeSave++; return Promise.resolve(); };
      const envoltura = (nombre) => {
        st[nombre] = function (monthId, id, patch) {
          p.llamadas[nombre] = p.llamadas[nombre] || [];
          const registro = { monthId, id, patch: JSON.parse(JSON.stringify(patch)) };
          p.llamadas[nombre].push(registro);
          const copia = Object.create(this.constructor.prototype);
          copia.data = JSON.parse(JSON.stringify(this.data));
          copia.remotoListo = false;
          copia.oyentes = [];
          copia.save = function () {};
          registro.retorno = copia[nombre](monthId, id, patch);
          registro.estadoEnCopia = JSON.stringify(window.__buscar(copia.data, monthId, id, nombre) || 'NO ENCONTRADO');
        };
      };
      envoltura('updateBudgetItem');
      envoltura('updateMovement');
    }
    const proto = Object.getPrototypeOf(st);
    return JSON.stringify({
      saveCongelado: true,
      updateBudgetItemOriginal: typeof proto.updateBudgetItem === 'function',
      updateMovementOriginal: typeof proto.updateMovement === 'function',
      updateMovementEnElPrototipo: /updateMovement/.test(String(proto.updateMovement || '')),
    });
  })()`));

  await s.page.eval(`(() => {
    window.__buscar = (data, monthId, id, metodo) => {
      const mm = data.meses[monthId];
      if (!mm) return null;
      const coll = metodo === 'updateMovement'
        ? (mm.movimientos || [])
        : [].concat(mm.servicios.fijos, mm.servicios.variables,
                    mm.personales.fijos, mm.personales.variables, mm.extras);
      return coll.find(x => x.id === id) || null;
    };
    const m = document.getElementById('modalSessionRoleSelect'); if (m) m.classList.remove('active');
    const sb = document.getElementById('sidebarBackdrop');
    if (sb) sb.classList.remove('visible', 'active', 'is-visible');
    return 'ok';
  })()`);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));

  /* ---------- SNAPSHOT ANTES ---------- */
  await s.page.eval(ASIGNAR_SNAPSHOT);
  rep.snapshotAntes = await s.page.eval(SNAPSHOT_CORTA);
  rep.contadoresAntes = JSON.parse(await s.page.eval(`JSON.stringify(window.__probe.leer())`));

  /* ============ T1: los botones existen y llevan la clase del gate ============ */
  rep.t1 = JSON.parse(await s.page.eval(`JSON.stringify({
    sesionReal: document.body.className,
    editExpense: document.querySelectorAll('.btn-edit-expense').length,
    deleteExpense: document.querySelectorAll('.btn-delete-expense').length,
    filasGasto: document.querySelectorAll('.expense-card-item').length,
    hijosPorFila: (function () {
      const f = document.querySelector('.expense-card-item');
      return f ? f.children.length : null;
    })(),
    colTemplate: getComputedStyle(document.querySelector('.expense-card-item')).gridTemplateColumns,
    movimientosEnEstado: (window.financialStore.data.meses[window.financialStore.data.activeMonthId].movimientos || []).length
  })`));
  rep.t1_medidoLector = await s.page.eval(BOTONES_FILA);

  /* ============ T2: paridad del gate con y sin read-only-mode ============ */
  /* No se falsea el rol ni se toca isAdmin: lo que se cambia es la clase CSS
     del body, que es lo UNICO que la regla mira. La prueba es que editar y
     eliminar se comportan IGUAL en los dos estados. */
  await s.page.eval(`(() => { document.body.classList.remove('read-only-mode'); return 1; })()`);
  await s.pump(3);
  rep.t2_sinReadOnly = await s.page.eval(BOTONES_FILA);
  await s.page.eval(`(() => { document.body.classList.add('read-only-mode'); return 1; })()`);
  await s.pump(3);
  rep.t2_conReadOnly = await s.page.eval(BOTONES_FILA);

  /* ============ T3: logica del store, AISLADA (fixtures propios) ============ */
  rep.t3_storeAislado = JSON.parse(await s.page.eval(`(() => {
    const st = window.financialStore;
    const S = st.constructor;
    const salida = {};
    const nuevo = () => {
      const t = Object.create(S.prototype);
      t.data = JSON.parse(JSON.stringify(st.data));
      t.remotoListo = false; t.oyentes = []; t.save = function () { t.__saveCalls = (t.__saveCalls || 0) + 1; };
      return t;
    };
    const mid = st.data.activeMonthId;
    /* El fixture va DENTRO de la copia. Tocar st.data aunque sea para
       deshacerlo ensucia el snapshot en memoria y esconde la señal real. */
    const t1 = nuevo();
    const fixture = { id: 'fixture_mov', fecha: '2026-09-05', concepto: 'Original', flujo: 'Ingreso',
      categoria: 'Trabajo', retornable: 'No', estado: 'Pagado', monto: 100 };
    if (!(t1.data.meses[mid].movimientos || []).length) t1.data.meses[mid].movimientos = [];
    t1.data.meses[mid].movimientos.push(fixture);
    const movId = fixture.id;
    const antes = JSON.stringify(window.__buscar(t1.data, mid, movId, 'updateMovement'));
    const r1 = t1.updateMovement(mid, movId, { concepto: 'EDITADO', monto: '55.5' });
    const despues = window.__buscar(t1.data, mid, movId, 'updateMovement');
    salida.updateMovement = {
      devolvio: r1, antes: antes, despues: JSON.stringify(despues),
      montoEsNumero: typeof despues.monto === 'number', monto: despues.monto,
      conservaNoEnviados: despues.flujo === fixture.flujo
                        && despues.categoria === fixture.categoria
                        && despues.estado === fixture.estado && despues.id === movId,
      llamoSave: t1.__saveCalls,
      movIdInexistente: t1.updateMovement(mid, 'no_existe', { concepto: 'x' }),
      mesInexistente: t1.updateMovement('mes_que_no_existe', movId, { concepto: 'x' }),
      sinGuardarElMonto: (function () {
        /* Otra copia, y otra vez con el fixture: una copia sin el movimiento
           daria null y la lectura del monto taparia el resultado real. */
        const t = nuevo();
        if (!(t.data.meses[mid].movimientos || []).length) t.data.meses[mid].movimientos = [];
        t.data.meses[mid].movimientos.push(JSON.parse(JSON.stringify(fixture)));
        t.updateMovement(mid, movId, { concepto: 'Solo texto' });
        const h = window.__buscar(t.data, mid, movId, 'updateMovement');
        return h ? h.monto : 'NO ENCONTRADO';
      })(),
    };

    let item = null;
    const m = t1.data.meses[mid];
    for (const coll of [m.servicios.fijos, m.servicios.variables, m.personales.fijos, m.personales.variables, m.extras])
      if (coll.length) { item = coll[0]; break; }
    const t2 = nuevo();
    const r2 = t2.updateBudgetItem(mid, item.id, { concepto: 'GASTO EDITADO', monto: '10.10' });
    const hit = window.__buscar(t2.data, mid, item.id, 'updateBudgetItem');
    salida.updateBudgetItem = {
      devolvio: r2, despues: JSON.stringify(hit),
      montoEsNumero: typeof hit.monto === 'number',
      conservaEstadoYRango: hit.estado === item.estado && hit.rango === item.rango,
      idInexistente: t2.updateBudgetItem(mid, 'no_existe', { concepto: 'x' }),
    };
    return JSON.stringify(salida, null, 1);
  })()`));

  /* ============ T4: modal de GASTO ============ */
  /* El item se toma del `data-item-id` del boton que se cliquea, no de una
     busqueda aparte en el store: si se busca por otro lado, el test puede
     compares un modal contra un item que no es el que se abrio, y el resultado
     verde no probaria nada. */
  rep.t4a_fijo = JSON.parse(await s.page.eval(`(() => {
    const st = window.financialStore;
    const btn = document.querySelector('.expense-card-item .btn-edit-expense');
    if (!btn) return JSON.stringify({ error: 'no hay boton de editar' });
    const id = btn.getAttribute('data-item-id');
    btn.click();
    const item = window.__buscar(st.data, st.data.activeMonthId, id, 'updateBudgetItem');
    return JSON.stringify({ filaId: id, itemEnStore: item ? JSON.parse(JSON.stringify(item)) : null });
  })()`));
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));
  rep.t4a_precarga = await s.page.eval(VALORES_MODAL('modalEditExpense', CAMPOS_GASTO));
  rep.t4a_rangoDisplay = await s.page.eval(
    `getComputedStyle(document.getElementById('editExpenseRangeField')).display`);
  rep.t4a_foco = await s.page.eval(FOCO_REAL('editExpenseConcepto'));
  rep.t4a_contraste = await s.page.eval(`${CONTRASTE_EN_MODAL}('modalEditExpense')`);
  await s.shot(path.join(DIR, `edit-admin-${LABEL}-modal-gasto.png`));
  /* La precarga se compara contra el store, campo por campo. */
  if (rep.t4a_fijo.itemEnStore) {
    const it = rep.t4a_fijo.itemEnStore, pc = rep.t4a_precarga;
    rep.t4a_comparacion = {
      idCoincide: pc.editExpenseItemId === it.id,
      mesCoincide: pc.editExpenseMonthId === rep.t4a_fijo.itemEnStore ? undefined : undefined,
      conceptoEsperado: it.concepto, conceptoCargado: pc.editExpenseConcepto,
      montoEsperado: Number(it.monto).toFixed(2), montoCargado: pc.editExpenseMonto,
      tipoEsperado: it.tipo || 'Fijo', tipoCargado: pc.editExpenseTipoReadonly,
      rangoEsperado: it.rango || '', rangoCargado: pc.editExpenseRango,
      rangoVisibleSoloSiVariable: rep.t4a_rangoDisplay === (it.tipo === 'Variable' ? 'block' : 'none'),
    };
    rep.t4a_comparacion.todoCoincide =
      rep.t4a_comparacion.idCoincide &&
      rep.t4a_comparacion.conceptoEsperado === rep.t4a_comparacion.conceptoCargado &&
      rep.t4a_comparacion.montoEsperado === rep.t4a_comparacion.montoCargado &&
      rep.t4a_comparacion.tipoEsperado === rep.t4a_comparacion.tipoCargado &&
      rep.t4a_comparacion.rangoEsperado === rep.t4a_comparacion.rangoCargado &&
      rep.t4a_comparacion.rangoVisibleSoloSiVariable;
  }

  rep.t4a_antesEsc = await s.page.eval(MODALES_ACTIVOS);
  for (const type of ['rawKeyDown', 'keyUp'])
    await s.page.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await s.pump(3);
  await new Promise(r => setTimeout(r, 600));
  rep.t4a_despuesEsc = await s.page.eval(MODALES_ACTIVOS);
  rep.t4a_sigueActivo = await s.page.eval(
    `document.getElementById('modalEditExpense').classList.contains('active')`);

  /* ============ T4b: el mismo modal con un Variable, que SI tiene rango ============ */
  rep.t4b_variable = JSON.parse(await s.page.eval(`(() => {
    const st = window.financialStore;
    const mid = st.data.activeMonthId;
    const m = st.data.meses[mid];
    let target = null;
    for (const coll of [m.servicios.variables, m.personales.variables])
      if (coll.length) { target = coll[0]; break; }
    if (!target) return JSON.stringify({ error: 'el mes activo no tiene variables' });
    const sel = '.expense-card-item .btn-edit-expense[data-item-id="' + CSS.escape(target.id) + '"]';
    const btn = document.querySelector(sel);
    if (!btn) return JSON.stringify({ error: 'la fila del variable no esta renderizada', id: target.id });
    for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
    btn.click();
    return JSON.stringify({ filaId: target.id, itemEnStore: JSON.parse(JSON.stringify(target)) });
  })()`));
  if (rep.t4b_variable.itemEnStore) {
    await s.pump(3);
    await new Promise(r => setTimeout(r, 700));
    rep.t4b_precarga = await s.page.eval(VALORES_MODAL('modalEditExpense', CAMPOS_GASTO));
    rep.t4b_rangoDisplay = await s.page.eval(
      `getComputedStyle(document.getElementById('editExpenseRangeField')).display`);
    rep.t4b_contraste = await s.page.eval(`${CONTRASTE_EN_MODAL}('modalEditExpense')`);
    await s.shot(path.join(DIR, `edit-admin-${LABEL}-modal-gasto-variable.png`));
    const it = rep.t4b_variable.itemEnStore, pc = rep.t4b_precarga;
    rep.t4b_comparacion = {
      tipoEsperado: it.tipo, tipoCargado: pc.editExpenseTipoReadonly,
      rangoEsperado: it.rango || '', rangoCargado: pc.editExpenseRango,
      rangoVisible: rep.t4b_rangoDisplay,
      conceptoEsperado: it.concepto, conceptoCargado: pc.editExpenseConcepto,
    };
    rep.t4b_comparacion.todoCoincide =
      rep.t4b_comparacion.tipoEsperado === rep.t4b_comparacion.tipoCargado &&
      rep.t4b_comparacion.rangoEsperado === rep.t4b_comparacion.rangoCargado &&
      rep.t4b_comparacion.rangoVisible === 'block' &&
      rep.t4b_comparacion.conceptoEsperado === rep.t4b_comparacion.conceptoCargado;
    /* y el parche de un Variable TIENE que llevar el rango */
    rep.t4b_llenado = JSON.parse(await s.page.eval(`(() => {
      const r = document.getElementById('editExpenseRango');
      const m = document.getElementById('editExpenseMonto');
      m.value = '44.44';
      if (r) r.value = '35 - 55';
      const f = document.getElementById('formEditExpense');
      f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true }));
      return JSON.stringify({ rangoEnviado: r ? r.value : null });
    })()`));
    await s.pump(3);
    await new Promise(r => setTimeout(r, 700));
    rep.t4b_patch = JSON.parse(await s.page.eval(
      `JSON.stringify((window.__probe.llamadas.updateBudgetItem || [])[0] || null)`));
  } else {
    ABORTAR.push('sin fila de variable para probar el rango: ' + rep.t4b_variable.error);
  }

  /* ============ T5: guardar GASTO (store congelado) ============ */
  rep.t5_abrir = JSON.parse(await s.page.eval(`(() => {
    for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
    const b = document.querySelector('.expense-card-item .btn-edit-expense');
    if (!b) return JSON.stringify({ error: 'no hay boton' });
    b.click();
    return JSON.stringify({ filaId: b.getAttribute('data-item-id') });
  })()`));
  await s.pump(2);
  await new Promise(r => setTimeout(r, 500));
  rep.t5_llenado = JSON.parse(await s.page.eval(`(() => {
    const c = document.getElementById('editExpenseConcepto');
    const m = document.getElementById('editExpenseMonto');
    const r = document.getElementById('editExpenseRango');
    const visible = getComputedStyle(document.getElementById('editExpenseRangeField')).display !== 'none';
    c.value = 'PRUEBA CONGELADA';
    m.value = '123.45';
    if (visible && r) r.value = '90 - 130';
    return JSON.stringify({ concepto: c.value, monto: m.value, campoRangoVisible: visible,
                            rango: visible && r ? r.value : null });
  })()`));
  rep.t5_envio = await s.page.eval(`(() => {
    const f = document.getElementById('formEditExpense');
    f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true }));
    return 'enviado';
  })()`);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));
  const todasGasto = JSON.parse(await s.page.eval(`JSON.stringify(window.__probe.llamadas.updateBudgetItem || [])`));
  rep.t5_patch = todasGasto[todasGasto.length - 1] || null;
  rep.t5_totalLlamadas = todasGasto.length;
  rep.t5_sigueActivo = await s.page.eval(
    `document.getElementById('modalEditExpense').classList.contains('active')`);

  /* ============ T6: modal de MOVIMIENTO (con fila sembrada en memoria) ============ */
  rep.t6_sembrar = JSON.parse(await s.page.eval(SEMBRAR_MOVIMIENTOS));
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));
  rep.t6_filas = JSON.parse(await s.page.eval(`JSON.stringify({
    filasMov: document.querySelectorAll('.transaction-feed-item').length,
    editTx: document.querySelectorAll('.btn-edit-tx').length,
    deleteTx: document.querySelectorAll('.btn-delete-tx').length
  })`));

  rep.t6_movReal = JSON.parse(await s.page.eval(`(() => {
    const st = window.financialStore;
    const mid = st.data.activeMonthId;
    const mov = (st.data.meses[mid].movimientos || [])[0] || null;
    return JSON.stringify({ monthId: mid, mov: mov, total: (st.data.meses[mid].movimientos || []).length });
  })()`));
  rep.t6_abrir = await s.page.eval(`(() => {
    const b = document.querySelector('.transaction-feed-item .btn-edit-tx');
    if (!b) return 'no hay boton';
    b.click(); return 'click';
  })()`);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));
  rep.t6_precarga = await s.page.eval(VALORES_MODAL('modalEditMovement', CAMPOS_MOV));
  rep.t6_foco = await s.page.eval(FOCO_REAL('editMovementConcepto'));
  rep.t6_contraste = await s.page.eval(`${CONTRASTE_EN_MODAL}('modalEditMovement')`);
  await s.shot(path.join(DIR, `edit-admin-${LABEL}-modal-movimiento.png`));

  rep.t6_antesEsc = await s.page.eval(MODALES_ACTIVOS);
  for (const type of ['rawKeyDown', 'keyUp'])
    await s.page.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
  await s.pump(3);
  await new Promise(r => setTimeout(r, 600));
  rep.t6_despuesEsc = await s.page.eval(MODALES_ACTIVOS);
  rep.t6_trasEsc = await s.page.eval(
    `document.getElementById('modalEditMovement').classList.contains('active')`);

  await s.page.eval(`document.querySelector('.transaction-feed-item .btn-edit-tx').click(); 'ok'`);
  await s.pump(2);
  await new Promise(r => setTimeout(r, 500));
  rep.t6_llenado = JSON.parse(await s.page.eval(`(() => {
    const c = document.getElementById('editMovementConcepto');
    const m = document.getElementById('editMovementMonto');
    const f = document.getElementById('editMovementFecha');
    c.value = 'MOVIMIENTO PRUEBA';
    m.value = '777.77';
    if (f) f.value = '2026-01-15';
    return JSON.stringify({ concepto: c.value, monto: m.value, fecha: f ? f.value : null });
  })()`));
  rep.t6_envio = await s.page.eval(`(() => {
    const f = document.getElementById('formEditMovement');
    f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true }));
    return 'enviado';
  })()`);
  await s.pump(3);
  await new Promise(r => setTimeout(r, 700));
  rep.t6_patch = JSON.parse(await s.page.eval(`JSON.stringify(window.__probe.llamadas.updateMovement || null)`));
  rep.t6_sigueActivo = await s.page.eval(
    `document.getElementById('modalEditMovement').classList.contains('active')`);

  /* ============ T7: hover REAL sobre las dos filas ============ */
  await s.page.eval(`(() => {
    document.body.classList.remove('read-only-mode');
    for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
    return 'ok';
  })()`);
  await s.pump(2);
  for (const [nombre, sel, archivo] of [
    ['gasto', '.expense-card-item', `fila-gasto`],
    ['movimiento', '.transaction-feed-item', `fila-movimiento`],
  ]) {
    const pos = await s.page.eval(CENTRO(sel));
    if (!pos) { ABORTAR.push('sin fila para hover: ' + nombre); continue; }
    await s.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, buttons: 0 });
    await s.pump(2);
    await new Promise(r => setTimeout(r, 500));
    rep['t7_' + nombre] = await s.page.eval(BOTONES_FILA);
    await s.shot(path.join(DIR, `edit-admin-${LABEL}-${archivo}.png`));
  }

  /* ============ T9: TEMA OSCURO preservado en los dos modales nuevos ============ */
  /* Se recorre en `.theme-dark` a proposito: la hoja lo declara como variante
     preservada, asi que el texto nuevo tiene que medir AA en los dos temas y no
     solo en el de por defecto. */
  rep.t9_temaAlAbrir = await s.page.eval(
    `document.documentElement.className || '(sin clases: tema claro por defecto)'`);
  await s.setTheme('theme-dark');
  for (const [nombre, selBtn, idModal, archivo] of [
    ['gasto', '.expense-card-item .btn-edit-expense', 'modalEditExpense', 'modal-gasto-oscuro'],
    ['movimiento', '.transaction-feed-item .btn-edit-tx', 'modalEditMovement', 'modal-movimiento-oscuro'],
  ]) {
    await s.page.eval(`(() => {
      for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
      const b = document.querySelector(${JSON.stringify(selBtn)});
      if (b) b.click();
      return 1;
    })()`);
    await s.pump(3);
    await new Promise(r => setTimeout(r, 800));
    rep['t9_' + nombre] = await s.page.eval(`${CONTRASTE_EN_MODAL}(${JSON.stringify(idModal)})`);
    rep['t9_' + nombre + '_raiz'] = await s.page.eval(
      `getComputedStyle(document.getElementById(${JSON.stringify(idModal)})).backgroundColor`);
    await s.shot(path.join(DIR, `edit-admin-${LABEL}-${archivo}.png`));
  }
  await s.setTheme('');
  rep.t9_temaAlVolver = await s.page.eval(
    `document.documentElement.className || '(vuelve a tema claro)'`);

  /* ============ devolver la memoria al estado original y comprobarlo ============ */
  rep.t8_restaurar = JSON.parse(await s.page.eval(RESTAURAR_MEMORIA));
  await s.pump(2);
  await new Promise(r => setTimeout(r, 500));

  /* ---------- SNAPSHOT DESPUES ---------- */
  await s.page.eval(ASIGNAR_SNAPSHOT);
  rep.snapshotDespues = await s.page.eval(SNAPSHOT_CORTA);
  rep.contadoresDespues = JSON.parse(await s.page.eval(`JSON.stringify(window.__probe.leer())`));
  rep.llamadas = JSON.parse(await s.page.eval(`JSON.stringify(window.__probe.llamadas)`));
  rep.consoleErrors = [...s.consoleErrors];
  rep.exceptions = [...s.exceptions];
  rep.failedRequests = [...s.failedRequests];
} catch (err) {
  rep.error = String((err && err.stack) || err);
  ABORTAR.push('excepcion en el recorrido: ' + rep.error);
} finally {
  await s.close();
}

/* ---------- veredicto del snapshot ---------- */
const A = rep.snapshotAntes, D = rep.snapshotDespues;
const diff = [];
if (A && D) {
  for (const k of ['bytesLocales', 'hashLocales', 'hashMemoria'])
    if (A[k] !== D[k]) diff.push(`  ${k}: ${A[k]} -> ${D[k]}`);
  for (const lado of ['local', 'memoria']) {
    const a = A[lado], b = D[lado];
    if (JSON.stringify(a) !== JSON.stringify(b))
      diff.push(`  ${lado}:\n    antes: ${JSON.stringify(a)}\n    ahora: ${JSON.stringify(b)}`);
  }
} else {
  diff.push('  NO HUBO SNAPSHOT COMPLETO: ' + (!A ? 'falta el de antes' : 'falta el de despues'));
}
rep.diffSnapshot = diff;
rep.snapshotIdentico = diff.length === 0;
rep.abortar = ABORTAR;

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, `edit-admin-${LABEL}.report.json`), JSON.stringify(rep, null, 2));

/* ---------- salida por consola ---------- */
const J = o => JSON.stringify(o, null, 1);
const fallos = (arr) => (arr || []).filter(x => !x.cumple);
const lineaContraste = c =>
  `    ${c.cumple ? 'ok   ' : 'FALLA'} ${String(c.ratio).padStart(6)}:1 (min ${c.min})  ${c.sel}  "${c.texto}"  ${c.fg} sobre ${c.bg}`;

console.log('=== REGLA DEL GATE (leida de css/styles.css) ===');
console.log(rep.reglaGateEnArchivo);
console.log('prefers-color-scheme en la hoja:', rep.prefersColorScheme);

console.log('\n=== CONGELAMIENTO ===');
console.log(J(rep.congelamiento));
console.log('store:', J(rep.store));

console.log('\n=== T1 BOTONES (sesion real de esta corrida) ===');
console.log(J(rep.t1));
console.log('medido:', J(rep.t1_medidoLector));

console.log('\n=== T2 PARIDAD DEL GATE ===');
console.log('SIN read-only-mode:'); console.log(J(rep.t2_sinReadOnly));
console.log('CON read-only-mode:'); console.log(J(rep.t2_conReadOnly));

console.log('\n=== T3 LOGICA DEL STORE AISLADA ===');
console.log(J(rep.t3_storeAislado));

console.log('\n=== T4a MODAL GASTO (primera fila, un Fijo) ===');
console.log('fila cliqueada:', J(rep.t4a_fijo));
console.log('valores cargados:', J(rep.t4a_precarga));
console.log('campo rango display:', rep.t4a_rangoDisplay);
console.log('COMPARACION CONTRA EL STORE:', J(rep.t4a_comparacion));
console.log('foco:', J(rep.t4a_foco));
console.log('ESC antes:', J(rep.t4a_antesEsc), '-> despues:', J(rep.t4a_despuesEsc),
            '| sigue activo =', rep.t4a_sigueActivo);
console.log('contraste: ' + (rep.t4a_contraste || []).length + ' pares, ' + fallos(rep.t4a_contraste).length + ' fallos AA');
for (const c of (rep.t4a_contraste || [])) console.log(lineaContraste(c));

console.log('\n=== T4b MODAL GASTO sobre un VARIABLE (con rango) ===');
console.log('fila cliqueada:', J(rep.t4b_variable));
console.log('valores cargados:', J(rep.t4b_precarga));
console.log('campo rango display:', rep.t4b_rangoDisplay);
console.log('COMPARACION CONTRA EL STORE:', J(rep.t4b_comparacion));
console.log('llenado:', J(rep.t4b_llenado));
console.log('patch (debe LLEVAR rango):', J(rep.t4b_patch));
console.log('contraste: ' + (rep.t4b_contraste || []).length + ' pares, ' + fallos(rep.t4b_contraste).length + ' fallos AA');
for (const c of (rep.t4b_contraste || [])) console.log(lineaContraste(c));

console.log('\n=== T5 PATCH DE GASTO (store congelado) ===');
console.log('abierto:', J(rep.t5_abrir), '| llenado:', J(rep.t5_llenado), '| envio:', rep.t5_envio);
console.log('patch:', J(rep.t5_patch));
console.log('llamadas totales a updateBudgetItem:', rep.t5_totalLlamadas);
console.log('modal sigue activo tras guardar:', rep.t5_sigueActivo);

console.log('\n=== T6 MODAL MOVIMIENTO ===');
console.log('sembrado:', J(rep.t6_sembrar), '| filas:', J(rep.t6_filas));
console.log('mov real:', J(rep.t6_movReal));
console.log('precarga:', J(rep.t6_precarga));
console.log('foco:', J(rep.t6_foco));
console.log('contraste: ' + (rep.t6_contraste || []).length + ' pares, ' + fallos(rep.t6_contraste).length + ' fallos AA');
for (const c of (rep.t6_contraste || [])) console.log(lineaContraste(c));
console.log('ESC antes:', J(rep.t6_antesEsc), '-> despues:', J(rep.t6_despuesEsc), '| sigue activo =', rep.t6_trasEsc);
console.log('llenado:', J(rep.t6_llenado), '| envio:', rep.t6_envio);
console.log('patch:', J(rep.t6_patch));
console.log('modal sigue activo tras guardar:', rep.t6_sigueActivo);

console.log('\n=== T7 HOVER REAL ===');
console.log('gasto:', J(rep.t7_gasto));
console.log('mov:  ', J(rep.t7_movimiento));

console.log('\n=== T8 RESTAURACION DE MEMORIA ===');
console.log(J(rep.t8_restaurar));

console.log('\n=== T9 TEMA OSCURO (variante preservada) ===');
console.log('tema al abrir la app:', JSON.stringify(rep.t9_temaAlAbrir));
console.log('tema al volver:', JSON.stringify(rep.t9_temaAlVolver));
for (const k of ['t9_gasto', 't9_movimiento']) {
  const arr = rep[k] || [];
  console.log(`${k}: velo ${JSON.stringify(rep[k + '_raiz'])} · ${arr.length} pares, ${fallos(arr).length} fallos AA`);
  for (const c of arr) console.log(lineaContraste(c));
}

console.log('\n=== SNAPSHOT ANTES ===');
console.log(J(A));
console.log('\n=== SNAPSHOT DESPUES ===');
console.log(J(D));
console.log('\n=== DIFF ===');
console.log(rep.snapshotIdentico ? 'IDENTICO: 0 diferencias' : diff.join('\n'));

console.log('\n=== CONTADORES DE ESCRITURA ===');
console.log('antes:  ', J(rep.contadoresAntes));
console.log('despues:', J(rep.contadoresDespues));
console.log('(contar > 0 significa que ALGUIEN intento escribir y fue bloqueado)');

console.log('\n=== ERRORES ===');
console.log('console.error:', J(rep.consoleErrors));
console.log('excepciones:', J(rep.exceptions));
console.log('respuestas >=400:', J(rep.failedRequests));
console.log('ABORTAR:', J(rep.abortar));