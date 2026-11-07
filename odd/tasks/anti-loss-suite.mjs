/**
 * anti-loss-suite.mjs - Verificacion headless del blindaje contra perdida de datos.
 *
 * Cubre las tres reglas pedidas:
 *   R1. El estado remoto NO pisa el local cuando hay cambios sin subir.
 *   R2. (UI) Modo Proteccion: banner + alta deshabilitada. Se verifica estatico
 *       en app.js/index.html; el ciclo real offline->online se prueba con el
 *       arnes de navegador en odd/tasks/crud-suite.mjs.
 *   R3. Snapshot automatico rotativo bajo gastos_auto_backup_<ts>, maximo 5.
 *   R3b. Boton de descarga del JSON conectado a exportJSON().
 *
 * Corre en Node con un contexto `vm` y dobles minimos, igual que
 * store-fix-suite.mjs: no necesita navegador.
 *
 * Uso: node odd/tasks/anti-loss-suite.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_STORE = readFileSync(join(RAIZ, 'js', 'store.js'), 'utf8');
const SRC_APP = readFileSync(join(RAIZ, 'js', 'app.js'), 'utf8');
const SRC_HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8');

const CLAVE = 'control_gastos_mensuales_db_v1';
const PREFIJO_BACKUP = 'gastos_auto_backup_';
const CLAVE_PENDIENTE = 'gastos_pendiente_sync';

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

/** localStorage de mentira con `length` y `key(i)`, que es lo que usa la purga. */
function crearAlmacen(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: k => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: k => { delete datos[k]; },
    key: i => Object.keys(datos)[i] || null,
    get length() { return Object.keys(datos).length; },
    claves: () => Object.keys(datos)
  };
}

/** Estado de ejemplo con un mes completo. `nombre` lo distingue en los asertos. */
function estadoDeEjemplo(nombre) {
  const id = 'mes-' + nombre;
  return {
    version: 1,
    activeMonthId: id,
    currentView: 'mes',
    mesesOrden: [id],
    meses: {
      [id]: {
        id,
        nombre,
        corto: nombre,
        servicios: { fijos: [], variables: [] },
        personales: { fijos: [], variables: [] },
        extras: [],
        notas: '',
        movimientos: []
      }
    }
  };
}

/**
 * Doble de window.gastosRemoto.
 * `fallaGuardar` simula que Supabase no responde: `guardar` resuelve false,
 * exactamente como el modulo real cuando el upsert falla.
 */
function crearRemoto({ valor = null, fallaGuardar = false } = {}) {
  const estado = {
    valor: valor ? JSON.parse(JSON.stringify(valor)) : null,
    fallaGuardar,
    guardados: 0,
    cargas: 0
  };
  return {
    estado,
    estaConfigurado: () => true,
    cargar: async () => {
      estado.cargas++;
      return estado.valor ? JSON.parse(JSON.stringify(estado.valor)) : null;
    },
    guardar: async nuevo => {
      estado.guardados++;
      if (estado.fallaGuardar) return false;
      estado.valor = JSON.parse(JSON.stringify(nuevo));
      return true;
    },
    estadoRed: () => (estado.fallaGuardar ? 'sin-conexion' : 'en-linea')
  };
}

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
  return { store: ventana.financialStore, ventana, almacen };
}

function snapshotsDe(almacen) {
  return almacen.claves().filter(k => k.indexOf(PREFIJO_BACKUP) === 0).sort();
}

// ---------------------------------------------------------------------------

console.log('\nR1a - aplicarEstadoRemoto() no pisa un cambio local sin subir');
{
  const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(estadoDeEjemplo('local')) });
  const remoto = crearRemoto({ valor: estadoDeEjemplo('remoto') });
  const { store } = crearTienda({ remoto, almacen });

  store.hayCambiosSinSubir = true;
  store.ultimoGuardadoTs = 0;
  const aplico = store.aplicarEstadoRemoto(estadoDeEjemplo('remoto'));

  check('aplicarEstadoRemoto devuelve false', aplico === false, String(aplico));
  check('el estado local sigue intacto',
    store.data.mesesOrden[0] === 'mes-local',
    JSON.stringify(store.data.mesesOrden));
}

console.log('\nR1b - un guardado que falla deja marca y protege lo local');
{
  const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(estadoDeEjemplo('local')) });
  const remoto = crearRemoto({ valor: estadoDeEjemplo('remoto'), fallaGuardar: true });
  const { store } = crearTienda({ remoto, almacen });
  await store.pendienteCarga;

  const local = estadoDeEjemplo('local-editado');
  local.meses['mes-local-editado'].notas = 'cambio que no debe perderse';
  await store.save(local);

  check('save() reporta que la nube no confirmo', store.hayCambiosSinSubir === true);
  check('la marca persistente quedo escrita', almacen.getItem(CLAVE_PENDIENTE) !== null,
    JSON.stringify(almacen.claves()));

  store.ultimoGuardadoTs = 0;
  const aplico = store.aplicarEstadoRemoto(estadoDeEjemplo('remoto'));
  check('el remoto viejo no pisa la edicion local', aplico === false);
  check('la edicion local sobrevive',
    store.data.meses['mes-local-editado'] &&
    store.data.meses['mes-local-editado'].notas === 'cambio que no debe perderse',
    JSON.stringify(store.data.mesesOrden));
}

console.log('\nR1c - una sesion anterior con subida fallida tampoco se pisa');
{
  // La marca persistida es lo unico que sabe que lo local nunca llego arriba.
  const almacen = crearAlmacen({
    [CLAVE]: JSON.stringify(estadoDeEjemplo('local')),
    [CLAVE_PENDIENTE]: String(Date.now())
  });
  const remoto = crearRemoto({ valor: estadoDeEjemplo('remoto'), fallaGuardar: true });
  const { store } = crearTienda({ remoto, almacen });
  await store.pendienteCarga;

  check('la tienda arranca marcada como pendiente', store.hayCambiosSinSubir === true);
  check('el estado local gana sobre el remoto viejo',
    store.data.mesesOrden[0] === 'mes-local',
    JSON.stringify(store.data.mesesOrden));
  check('el reintento de subida ocurrio', remoto.estado.guardados >= 1,
    JSON.stringify(remoto.estado));
  check('la marca sigue viva tras el reintento fallido',
    almacen.getItem(CLAVE_PENDIENTE) !== null);
}

console.log('\nR1d - cuando la nube vuelve, lo pendiente sube y se libera la sincronizacion');
{
  const almacen = crearAlmacen({
    [CLAVE]: JSON.stringify(estadoDeEjemplo('local')),
    [CLAVE_PENDIENTE]: String(Date.now())
  });
  const remoto = crearRemoto({ valor: estadoDeEjemplo('remoto'), fallaGuardar: false });
  const { store } = crearTienda({ remoto, almacen });
  await store.pendienteCarga;

  check('el local manda tambien al arrancar', store.data.mesesOrden[0] === 'mes-local');
  check('la subida confirmo y limpio la marca', store.hayCambiosSinSubir === false);
  check('la marca persistente desaparecio', almacen.getItem(CLAVE_PENDIENTE) === null);
  check('la nube quedo con el estado local',
    remoto.estado.valor && remoto.estado.valor.mesesOrden[0] === 'mes-local',
    JSON.stringify(remoto.estado.valor && remoto.estado.valor.mesesOrden));

  // Recien ahora un cambio remoto legitimo puede aplicarse.
  store.ultimoGuardadoTs = 0;
  const aplico = store.aplicarEstadoRemoto(estadoDeEjemplo('remoto'));
  check('sin pendientes, el remoto si se aplica', aplico === true);
  check('el estado aplicado es el remoto',
    store.data.mesesOrden[0] === 'mes-remoto',
    JSON.stringify(store.data.mesesOrden));
}

console.log('\nR3 - snapshot automatico rotativo');
{
  const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(estadoDeEjemplo('local')) });
  const remoto = crearRemoto({ valor: null });
  const { store } = crearTienda({ remoto, almacen });
  await store.pendienteCarga;

  const iniciales = snapshotsDe(almacen);
  check('un arranque sin escrituras no gasta un slot', iniciales.length === 0,
    JSON.stringify(almacen.claves()));

  for (let i = 0; i < 9; i++) {
    const e = estadoDeEjemplo('paso-' + i);
    e.meses['mes-paso-' + i].notas = 'contenido ' + i;
    await store.save(e);
  }

  const tras = snapshotsDe(almacen);
  check('nunca hay mas de 5 snapshots', tras.length <= 5, JSON.stringify(tras));
  check('el historial no quedo vacio', tras.length >= 1, JSON.stringify(tras));

  const ultima = tras[tras.length - 1];
  const contenido = JSON.parse(almacen.datos[ultima]);
  check('el snapshot mas nuevo tiene el ultimo estado',
    contenido.mesesOrden[0] === 'mes-paso-8',
    JSON.stringify(contenido.mesesOrden));
  check('cada snapshot es JSON valido y completo',
    tras.every(k => {
      try {
        const p = JSON.parse(almacen.datos[k]);
        return !!(p.meses && Array.isArray(p.mesesOrden));
      } catch (e) { return false; }
    }));

  const antes = snapshotsDe(almacen).length;
  await store.save(store.data);
  check('un guardado sin cambios no gasta un slot', snapshotsDe(almacen).length === antes,
    JSON.stringify(snapshotsDe(almacen)));
}

console.log('\nR3 - un guardado fallido NO rota el historial de copias sanas');
{
  const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(estadoDeEjemplo('local')) });
  const remoto = crearRemoto({ valor: null, fallaGuardar: true });
  const { store } = crearTienda({ remoto, almacen });
  await store.pendienteCarga;

  const antes = snapshotsDe(almacen).length;
  const e = estadoDeEjemplo('offline');
  await store.save(e);
  const despues = snapshotsDe(almacen).length;

  check('la copia local se escribio igual',
    JSON.parse(almacen.datos[CLAVE]).mesesOrden[0] === 'mes-offline');
  check('no se creo un snapshot de un guardado no confirmado',
    despues === antes, JSON.stringify({ antes, despues }));
}

console.log('\nR2/R3b - superficie de interfaz (estatico)');
{
  check('index.html tiene el banner de proteccion',
    /id="bannerProteccion"/.test(SRC_HTML));
  check('el texto del banner es el pedido',
    SRC_HTML.indexOf('Sin conexi') !== -1 &&
    SRC_HTML.indexOf('n con la nube. Edici') !== -1 &&
    SRC_HTML.indexOf('n bloqueada para proteger tus datos.') !== -1);
  check('app.js consulta navigator.onLine', /navigator\.onLine === false/.test(SRC_APP));
  check('app.js consulta el estado real de la nube',
    /estadoRed\(\) === 'sin-conexion'/.test(SRC_APP));
  check('app.js deshabilita los controles de alta',
    /el\.disabled = true/.test(SRC_APP) && /SELECTORES_ALTA/.test(SRC_APP));
  check('app.js reacciona a online y offline',
    /addEventListener\('online'/.test(SRC_APP) && /addEventListener\('offline'/.test(SRC_APP));
  check('el gate de escritura respeta el modo proteccion',
    /if \(proteccion\.activo\)/.test(SRC_APP));
  check('index.html tiene el boton de descarga',
    /id="btnDescargarCopiaJSON"/.test(SRC_HTML));
  check('el boton llama a exportJSON()', /store\.exportJSON\(\)/.test(SRC_APP));
}

// ---------------------------------------------------------------------------

console.log(`\n${total - fallos}/${total} comprobaciones OK.`);
if (fallos > 0) {
  console.log(`${fallos} fallo(s).`);
  process.exit(1);
}
