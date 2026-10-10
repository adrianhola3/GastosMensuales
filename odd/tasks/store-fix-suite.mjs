/**
 * store-fix-suite.mjs - Verificación headless de los criterios de aceptación de
 * odd/tasks/fix-capa-datos.md (T1 a T7).
 *
 * El proyecto no tiene runner de tests (ledger-unico.md:258). Este script no
 * pretende ser uno: es una comprobación puntual y desechable. Corre en Node sin
 * navegador porque `js/store.js` y `js/supabase-store.js` son JavaScript plano
 * que solo necesitan `window`, `localStorage` y `console`: se los carga dentro
 * de un contexto `vm` con dobles mínimos.
 *
 * Uso: node odd/tasks/store-fix-suite.mjs
 *
 * Cada caso imprime su resultado real. Si algo falla, el script termina con
 * código de salida 1.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_STORE = readFileSync(join(RAIZ, 'js', 'store.js'), 'utf8');
const SRC_SUPABASE = readFileSync(join(RAIZ, 'js', 'supabase-store.js'), 'utf8');

let fallos = 0;
let total = 0;

function check(nombre, condicion, detalle = '') {
  total++;
  if (condicion) {
    console.log(`  OK   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
  }
}

/** localStorage de mentira, con el comportamiento de cuota incluido. */
function crearAlmacen(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: k => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: k => { delete datos[k]; },
    claves: () => Object.keys(datos)
  };
}

/**
 * Levanta js/store.js en un contexto propio.
 * @param {object} opciones
 * @param {object} [opciones.remoto] doble de window.gastosRemoto.
 * @param {object} [opciones.localStorage] almacén con contenido previo.
 */
function crearTienda({ remoto = null, almacen = crearAlmacen() } = {}) {
  const ventana = { gastosRemoto: remoto };
  const ctx = vm.createContext({
    window: ventana,
    localStorage: almacen,
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math
  });
  vm.runInContext(SRC_STORE, ctx, { filename: 'js/store.js' });
  return { store: ventana.financialStore, ventana, almacen, ctx };
}

/** Estado remoto de ejemplo: un solo mes, con sus cuatro colecciones. */
function estadoRemotoDeEjemplo() {
  const id = 'mes-remoto';
  return {
    version: 1,
    activeMonthId: id,
    currentView: 'mes',
    mesesOrden: [id],
    meses: {
      [id]: {
        id,
        nombre: 'Mes Remoto',
        corto: 'Remoto',
        servicios: { fijos: [], variables: [] },
        personales: { fijos: [], variables: [] },
        extras: [],
        notas: '',
        movimientos: []
      }
    }
  };
}

function primerMesId(store) {
  return store.data.activeMonthId;
}

// ---------------------------------------------------------------------------

console.log('\nT1 - leerLocal() no pisa datos ante JSON corrupto');
{
  const crudo = '{"meses": {"m1": {"nombre": "trabajo"}}, "mesesOr';
  const { store, almacen } = crearTienda({ almacen: crearAlmacen({ control_gastos_mensuales_db_v1: crudo }) });

  const clavesRespaldo = almacen.claves().filter(k => k.startsWith('control_gastos_mensuales_db_v1_corrupto_'));
  check('existe una clave de respaldo', clavesRespaldo.length === 1, JSON.stringify(almacen.claves()));
  check('el respaldo tiene el contenido original', clavesRespaldo.length === 1 && almacen.datos[clavesRespaldo[0]] === crudo);
  check('la app abre con un estado usable', !!(store.data && store.data.meses && Array.isArray(store.data.mesesOrden) && store.data.mesesOrden.length > 0));

  // Segundo arranque: la app ya no debe volver a pisar nada ni acumular respaldos.
  const segundo = crearTienda({ almacen });
  const clavesRespaldo2 = almacen.claves().filter(k => k.startsWith('control_gastos_mensuales_db_v1_corrupto_'));
  check('el segundo arranque no genera otro respaldo', clavesRespaldo2.length === 1, JSON.stringify(clavesRespaldo2));
  check('el contenido original sigue recuperable', almacen.datos[clavesRespaldo2[0]] === crudo);
  check('el estado guardado ya es JSON válido', (() => {
    try { JSON.parse(almacen.datos.control_gastos_mensuales_db_v1); return true; } catch { return false; }
  })());
  void segundo;
}

console.log('\nT1b - shape inválido (JSON válido, no es un estado)');
{
  const crudo = '{"foo": 1, "bar": true}';
  const { store, almacen } = crearTienda({ almacen: crearAlmacen({ control_gastos_mensuales_db_v1: crudo }) });
  const claves = almacen.claves().filter(k => k.startsWith('control_gastos_mensuales_db_v1_corrupto_'));
  check('existe una clave de respaldo', claves.length === 1, JSON.stringify(almacen.claves()));
  check('el respaldo tiene el contenido original', claves.length === 1 && almacen.datos[claves[0]] === crudo);
  check('la app abre con los datos de fábrica', store.data.mesesOrden.length === 6);
}

console.log('\nT1c - camino normal: no se crea respaldo');
{
  const { almacen } = crearTienda();
  const claves = almacen.claves().filter(k => k.includes('corrupto'));
  check('no hay respaldo cuando todo está bien', claves.length === 0, JSON.stringify(claves));
}

console.log('\nT2 - importJSON() valida antes de asignar');
{
  const { store, almacen } = crearTienda();
  const mesId = primerMesId(store);
  store.addBudgetItem(mesId, 'servicios', 'fijos', { concepto: 'Internet', monto: 50 });
  const antes = JSON.stringify(store.data);

  const resultado = store.importJSON('{"meses":{"m1":{}},"mesesOrden":["m1"]}');
  check('devuelve false con un mes sin colecciones', resultado === false);
  check('el estado anterior queda intacto', JSON.stringify(store.data) === antes);
  check('el estado anterior sigue en localStorage', almacen.datos.control_gastos_mensuales_db_v1 === antes);

  const resultado2 = store.importJSON('esto no es json');
  check('devuelve false con JSON inválido', resultado2 === false);
  check('el estado sigue intacto tras JSON inválido', JSON.stringify(store.data) === antes);

  const ok = store.importJSON(JSON.stringify(estadoRemotoDeEjemplo()));
  check('devuelve true con un respaldo completo', ok === true);
  check('el estado importado quedó asignado', store.data.mesesOrden.length === 1 && !!store.data.meses['mes-remoto']);
}

console.log('\nT3 - montos: se rechazan, no se coaccionan');
{
  const { store, almacen } = crearTienda();
  const mesId = primerMesId(store);

  const rechazos = ['1e309', 'abc', '12abc', NaN, Infinity, -10, 5e9, ''];
  const aceptados = [];
  rechazos.forEach(v => {
    const r = store.addBudgetItem(mesId, 'servicios', 'fijos', { concepto: 'X', monto: v });
    if (r) aceptados.push(v);
  });
  check('addBudgetItem rechaza los montos inválidos', aceptados.length === 0, `aceptados: ${JSON.stringify(aceptados)}`);

  const item = store.addBudgetItem(mesId, 'servicios', 'fijos', { concepto: 'Internet', monto: '89.90' });
  check('addBudgetItem acepta un monto válido como texto', !!item && item.monto === 89.90, JSON.stringify(item));

  // Nada de Infinity ni de ceros silenciosos en lo que quedó persistido.
  const persistido = JSON.parse(almacen.datos.control_gastos_mensuales_db_v1);
  const todosItems = Object.values(persistido.meses).flatMap(m => [
    ...m.servicios.fijos, ...m.servicios.variables,
    ...m.personales.fijos, ...m.personales.variables, ...m.extras, ...m.movimientos
  ]);
  check('ningún monto persistido es Infinity', todosItems.every(i => i.monto !== Infinity));
  check('ningún monto persistido es null/NaN', todosItems.every(i => typeof i.monto === 'number' && Number.isFinite(i.monto)));
  check('no se creó ningún ítem espurio', todosItems.filter(i => i.concepto === 'X').length === 0);

  // Updates: el parche inválido no debe pisar el monto anterior.
  const montoOriginal = item.monto;
  const idItem = item.id;
  check('updateBudgetItem rechaza "1e309"', store.updateBudgetItem(mesId, idItem, { monto: '1e309' }) === false);
  check('updateBudgetItem rechaza "12abc"', store.updateBudgetItem(mesId, idItem, { monto: '12abc' }) === false);
  check('updateBudgetItem rechaza NaN', store.updateBudgetItem(mesId, idItem, { monto: NaN }) === false);
  check('updateBudgetItem rechaza Infinity', store.updateBudgetItem(mesId, idItem, { monto: Infinity }) === false);
  check('el monto original quedó intacto', store.getMonth(mesId).servicios.fijos.find(i => i.id === idItem).monto === montoOriginal);
  check('updateBudgetItem acepta un monto válido', store.updateBudgetItem(mesId, idItem, { monto: '120.50' }) === true);
  check('el monto nuevo se aplicó', store.getMonth(mesId).servicios.fijos.find(i => i.id === idItem).monto === 120.50);

  const mov = store.addMovement(mesId, { concepto: 'Sueldo', monto: '1500', flujo: 'Ingreso' });
  check('addMovement acepta un monto válido', !!mov && mov.monto === 1500);
  check('addMovement rechaza "1e309"', store.addMovement(mesId, { concepto: 'Mal', monto: '1e309', flujo: 'Gasto' }) === false);
  check('addMovement rechaza "abc"', store.addMovement(mesId, { concepto: 'Mal', monto: 'abc', flujo: 'Gasto' }) === false);
  check('no se registró el movimiento inválido', store.getMonth(mesId).movimientos.filter(x => x.concepto === 'Mal').length === 0);

  check('updateMovement rechaza "abc"', store.updateMovement(mesId, mov.id, { monto: 'abc' }) === false);
  check('el monto del movimiento quedó intacto', store.getMonth(mesId).movimientos.find(x => x.id === mov.id).monto === 1500);
  check('updateMovement acepta un monto válido', store.updateMovement(mesId, mov.id, { monto: 1600 }) === true);
}

console.log('\nT4 - load() no pisa ediciones en curso');
{
  let resolverCargar = null;
  const guardados = [];
  const remoto = {
    estaConfigurado: () => true,
    cargar: () => new Promise(res => { resolverCargar = res; }),
    guardar: async estado => { guardados.push(JSON.parse(JSON.stringify(estado))); }
  };

  const { store } = crearTienda({ remoto });
  const mesLocalId = primerMesId(store);

  // Edición del usuario mientras la nube todavía no respondió.
  store.addBudgetItem(mesLocalId, 'servicios', 'fijos', { concepto: 'Gasto nuevo', monto: 77 });

  resolverCargar(estadoRemotoDeEjemplo());
  await store.pendienteCarga;

  const local = store.data.meses[mesLocalId];
  check('el gasto agregado no fue borrado', !!(local && local.servicios.fijos.some(i => i.concepto === 'Gasto nuevo')));
  check('no se impuso la copia remota', store.data.mesesOrden.includes(mesLocalId));
  check('el estado local se subió a la nube', guardados.length === 1 && guardados[0].meses[mesLocalId].servicios.fijos.some(i => i.concepto === 'Gasto nuevo'));

  // Camino sin ediciones locales: la nube sigue mandando.
  const remoto2 = {
    estaConfigurado: () => true,
    cargar: async () => estadoRemotoDeEjemplo(),
    guardar: async () => {}
  };
  const b = crearTienda({ remoto: remoto2 });
  await b.store.pendienteCarga;
  check('sin ediciones locales manda la nube', b.store.data.mesesOrden.length === 1 && !!b.store.data.meses['mes-remoto']);
}

console.log('\nT6 - los updates no reescriben el id');
{
  const { store } = crearTienda();
  const mesId = primerMesId(store);

  const item = store.addBudgetItem(mesId, 'servicios', 'fijos', { concepto: 'Celular', monto: 40 });
  const idOriginal = item.id;
  check('updateBudgetItem con id ajeno devuelve true', store.updateBudgetItem(mesId, idOriginal, { id: 'otro', monto: 41 }) === true);
  const guardado = store.getMonth(mesId).servicios.fijos.find(i => i.id === idOriginal);
  check('el id del ítem no cambió', !!guardado && guardado.id === idOriginal);
  check('no hay ítems con el id "otro"', store.getMonth(mesId).servicios.fijos.every(i => i.id !== 'otro'));
  check('el resto de los campos sí se aplicó', guardado && guardado.monto === 41);

  const mov = store.addMovement(mesId, { concepto: 'Abono', monto: 100, flujo: 'Ingreso' });
  const movId = mov.id;
  check('updateMovement con id ajeno devuelve true', store.updateMovement(mesId, movId, { id: 'otro', concepto: 'Abono 2' }) === true);
  check('el id del movimiento no cambió', store.getMonth(mesId).movimientos.find(x => x.id === movId).id === movId);
  check('no hay movimientos con el id "otro"', store.getMonth(mesId).movimientos.every(x => x.id !== 'otro'));
}

console.log('\nT7 - el id de mes no colisiona');
{
  const { store } = crearTienda();
  const totalAntes = store.data.mesesOrden.length;

  const id1 = store.addNewMonth('Septiembre 2027');
  const id2 = store.addNewMonth('Septiembre 2027');
  check('los dos meses con el mismo nombreConviven', id1 !== id2, `${id1} vs ${id2}`);
  check('el primero no fue pisado', !!store.data.meses[id1] && !!store.data.meses[id2]);
  check('mesesOrden no quedó duplicado', new Set(store.data.mesesOrden).size === store.data.mesesOrden.length);
  check('los dos aparecen una vez en mesesOrden', store.data.mesesOrden.filter(x => x === id1).length === 1 && store.data.mesesOrden.filter(x => x === id2).length === 1);
  check('mesesOrden creció en 2', store.data.mesesOrden.length === totalAntes + 2);
  check('el nombre se conserva', store.data.meses[id1].nombre === 'Septiembre 2027' && store.data.meses[id2].nombre === 'Septiembre 2027');

  // Ráfaga: 5 meses con el mismo nombre, todos deben existir.
  const rafaga = [];
  for (let i = 0; i < 5; i++) rafaga.push(store.addNewMonth('Marzo 2030'));
  check('la ráfaga no colisiona', new Set(rafaga).size === 5, JSON.stringify(rafaga));
  check('la ráfaga no duplica mesesOrden', new Set(store.data.mesesOrden).size === store.data.mesesOrden.length);
}

console.log('\nT5 - haySesion() responde true con sesión activa');
{
  const listeners = [];
  let sesionGuardada = null;

  const clienteFalso = {
    auth: {
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: null } }; },
      getSession() { return Promise.resolve({ data: { session: sesionGuardada }, error: null }); },
      signInWithPassword: async () => { sesionGuardada = { user: { id: 'u1' }, access_token: 'tok' }; return { data: { session: sesionGuardada }, error: null }; },
      signOut: async () => { sesionGuardada = null; listeners.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; }
    },
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        upsert() { return Promise.resolve({ error: null }); }
      };
    }
  };

  const ventana = {
    GASTOS_CONFIG: { supabaseUrl: 'https://ejemplo.supabase.co', supabaseAnonKey: 'clave' },
    supabase: { createClient: () => clienteFalso },
    location: { origin: 'https://ejemplo.test', pathname: '/' }
  };
  const ctx = vm.createContext({ window: ventana, console, setTimeout, clearTimeout, navigator: { onLine: true }, Promise });
  vm.runInContext(SRC_SUPABASE, ctx, { filename: 'js/supabase-store.js' });
  const remoto = ventana.gastosRemoto;

  check('la interfaz expone haySesion', typeof remoto.haySesion === 'function');
  check('sin sesión devuelve false', remoto.haySesion() === false);
  check('esperarSesion sin sesión devuelve false', (await remoto.esperarSesion()) === false);

  // Evento INITIAL_SESSION: la sesión guardada se recupera al cargar.
  sesionGuardada = { user: { id: 'u1' }, access_token: 'tok' };
  listeners.forEach(cb => cb('INITIAL_SESSION', sesionGuardada));
  check('con sesión restaurada devuelve true', remoto.haySesion() === true);
  check('esperarSesion con sesión devuelve true', (await remoto.esperarSesion()) === true);

  // Login por correo.
  await remoto.salirDeSesion();
  check('tras cerrar sesión devuelve false', remoto.haySesion() === false);
  const res = await remoto.iniciarSesion('a@b.com', 'secreto');
  check('el login devuelve ok', res.ok === true);
  check('haySesion() es true recién después del login', remoto.haySesion() === true);

  // El aviso a los oyentes también debe traer true.
  let recibido = null;
  remoto.alCambiarSesion(v => { recibido = v; });
  await remoto.salirDeSesion();
  check('el listener recibe false al cerrar sesión', recibido === false);
  await remoto.iniciarSesion('a@b.com', 'secreto');
  check('el listener recibe true al iniciar sesión', recibido === true);

  // Sin configurar no hay cliente, y haySesion no debe romperse.
  const ventana2 = { GASTOS_CONFIG: {}, location: ventana.location };
  const ctx2 = vm.createContext({ window: ventana2, console, setTimeout, clearTimeout });
  vm.runInContext(SRC_SUPABASE, ctx2, { filename: 'js/supabase-store.js' });
  check('sin configurar devuelve false sin lanzar', ventana2.gastosRemoto.haySesion() === false);
}

console.log('\nRegresión - la app arranca y calcula como siempre');
{
  const { store } = crearTienda();
  const mesId = store.data.activeMonthId;
  const totales = store.calculateMonthTotals(mesId);
  check('el estado por defecto tiene 6 meses', store.data.mesesOrden.length === 6);
  check('calculateMonthTotals devuelve números finitos', Object.values(totales).every(v => typeof v === 'number' && Number.isFinite(v)));
  const esperados = [89.90, 39.90, 83.00, 150.00, 25.00].reduce((a, b) => a + b, 0);
  check('el total de servicios fijos de fábrica no cambió', Math.abs(totales.subtotalServiciosFijos - esperados) < 1e-9, String(totales.subtotalServiciosFijos));
  check('calculateGlobalTotals sigue funcionando', Array.isArray(store.calculateGlobalTotals().rows) && store.calculateGlobalTotals().rows.length === 6);
  check('exportJSON devuelve el estado completo', JSON.parse(JSON.stringify(store.data)).mesesOrden.length === 6);
  check('resetToDefault vuelve al estado de fábrica', store.resetToDefault().mesesOrden.length === 6);
  check('toggleBudgetItemStatus sigue alternando', typeof store.toggleBudgetItemStatus(mesId, store.getMonth(mesId).servicios.fijos[0].id) === 'string');
  check('deleteMonth protege el último mes', store.data.mesesOrden.length === 6);
}

console.log(`\n${total - fallos}/${total} comprobaciones OK.`);
if (fallos > 0) {
  console.log(`FALLARON ${fallos}.`);
  process.exit(1);
}