/* MIGRACION — Fase 1, D5 + D6.
 *
 * Comprueba en la app real, sobre el navegador y no sobre un mock:
 *   · que un estado escrito con el MODELO VIEJO (`monto` + `estado`) se convierta
 *     al nuevo SIN que ningun numero cambie de valor;
 *   · que un `Pagado` viejo deje estimado = real y un `Pendiente` deje real = null;
 *   · que la migracion sea IDEMPOTENTE: correrla otra vez no cambia nada, ni el
 *     objeto en memoria ni lo que queda escrito en localStorage.
 */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const p = await openPage({ width: 1440, height: 900 });
let ok = true;

function paso(nombre, condicion, detalle) {
  if (!condicion) ok = false;
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${nombre}${detalle !== undefined ? '  ' + JSON.stringify(detalle) : ''}`);
}

/* Escribe en localStorage el estado que la app tendria HOY, pero con la forma
 * del modelo viejo: un solo `monto` y un texto `estado`. Los movimientos se
 * dejan como estan, porque nunca tenian estimado (D8). */
const ENVEJECER = `(() => {
  const st = window.financialStore;
  const data = JSON.parse(JSON.stringify(st.data));
  data.mesesOrden.forEach(mid => {
    const m = data.meses[mid];
    if (!m) return;
    [...m.servicios.fijos, ...m.servicios.variables,
     ...m.personales.fijos, ...m.personales.variables, ...m.extras].forEach(it => {
      it.estado = (it.montoReal !== null && it.montoReal !== undefined) ? 'Pagado' : 'Pendiente';
      it.monto = it.montoEstimado;
      delete it.montoReal;
      delete it.montoEstimado;
    });
  });
  localStorage.setItem('control_gastos_mensuales_db_v1', JSON.stringify(data));
  return 'viejo escrito';
})()`;

/* Los numeros que hay que comparar antes y despues de la migracion. */
const FOTOGRAFIA = `(() => {
  const st = window.financialStore;
  const st2 = st.calculateMonthTotals(st.data.activeMonthId);
  const items = [];
  st.data.mesesOrden.forEach(mid => {
    const m = st.data.meses[mid];
    if (!m) return;
    [...m.servicios.fijos, ...m.servicios.variables,
     ...m.personales.fijos, ...m.personales.variables, ...m.extras].forEach(it => {
      items.push({ id: it.id, montoEstimado: it.montoEstimado, montoReal: it.montoReal,
                   montoViejo: it.monto, estadoViejo: it.estado });
    });
  });
  return {
    items,
    totalEstimado: st2.totalEstimado,
    totalCubierto: st2.totalCubierto,
    totalFaltante: st2.totalFaltante,
    totalReal: st2.totalReal,
    balanceNeto: st2.balanceNeto,
    crudo: JSON.stringify(st.data)
  };
})()`;

try {
  await p.page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){try{sessionStorage.setItem('finanzas_session_role_chosen','admin');}catch(e){}
      var o=[];Object.defineProperty(window,'gastosRemoto',{configurable:true,enumerable:true,
      get:function(){return{estaConfigurado:function(){return false;},esperarSesion:function(){return Promise.resolve(false);},
      haySesion:function(){return false;},alCambiarSesion:function(){},cargar:function(){return Promise.resolve(null);},
      guardar:function(){return Promise.resolve();},iniciarSesion:function(){},salirDeSesion:function(){}}};},
      set:function(){}});return 1})()` });
  await p.goto(PAGE_URL, 3000);
  await p.page.eval(`(function(){try{localStorage.removeItem('control_gastos_mensuales_db_v1');}catch(e){}return 1})()`);
  await p.goto(PAGE_URL, 7000);
  await p.page.eval(HIDE_ROLE_MODAL);
  await sleep(500);

  // 1. Estado en el modelo NUEVO, que es el punto de partida.
  const antes = await p.page.eval(FOTOGRAFIA);
  const movs = await p.page.eval(
    `JSON.stringify(window.financialStore.data.meses[window.financialStore.data.activeMonthId].movimientos)`);

  // 2. Se retrocede el almacenamiento al modelo VIEJO y se recarga.
  await p.page.eval(ENVEJECER);
  /* La forma vieja se comprueba ANTES de recargar: al cargar, `sanear()`
   * migra y `save()` reescribe localStorage, así que después de la recarga ya
   * no queda nada viejo que mirar — leerlo ahí probaría lo contrario. */
  const viejo = await p.page.eval(`(function(){
    const d = JSON.parse(localStorage.getItem('control_gastos_mensuales_db_v1'));
    const it = d.meses[d.activeMonthId].servicios.fijos[0];
    return { tieneEstado: 'estado' in it, tieneMonto: 'monto' in it,
             tieneEstimado: 'montoEstimado' in it };
  })()`);
  await p.goto(PAGE_URL, 7000);
  await p.page.eval(HIDE_ROLE_MODAL);
  await sleep(600);

  // 3. La migración corrió sola, al cargar, sin que nadie la pidiera.
  const despues = await p.page.eval(FOTOGRAFIA);

  paso('el estado viejo de partida tenía `monto` y `estado`',
    viejo.tieneMonto && viejo.tieneEstado && !viejo.tieneEstimado, viejo);
  paso('ya no queda ningún `monto` en el presupuesto',
    despues.items.every(i => i.montoViejo === undefined));
  paso('ya no queda ningún `estado` en el presupuesto',
    despues.items.every(i => i.estadoViejo === undefined));
  paso('ningún estimado cambió de valor',
    despues.items.every(i => i.montoEstimado === antes.items.find(a => a.id === i.id).montoEstimado));
  paso('cada montoReal es el viejo estimado si estaba pagado, o null',
    despues.items.every(i => i.montoReal === antes.items.find(a => a.id === i.id).montoReal));
  paso('totalEstimado no se movió', despues.totalEstimado === antes.totalEstimado,
    { antes: antes.totalEstimado, despues: despues.totalEstimado });
  paso('totalCubierto no se movió', despues.totalCubierto === antes.totalCubierto,
    { antes: antes.totalCubierto, despues: despues.totalCubierto });
  paso('totalReal no se movió', despues.totalReal === antes.totalReal,
    { antes: antes.totalReal, despues: despues.totalReal });
  paso('totalFaltante no se movió', despues.totalFaltante === antes.totalFaltante);
  paso('balanceNeto no se movió', despues.balanceNeto === antes.balanceNeto);
  paso('la identidad sigue cerrada',
    despues.totalCubierto + despues.totalFaltante === despues.totalEstimado);
  paso('los movimientos quedaron intactos (D8)',
    await p.page.eval(
      `JSON.stringify(window.financialStore.data.meses[window.financialStore.data.activeMonthId].movimientos)`)
      === movs);

  // 4. IDEMPOTENCIA: correr sanear() otra vez no puede cambiar un solo dígito.
  const segunda = await p.page.eval(`(function(){
    const st = window.financialStore;
    const antes = JSON.stringify(st.data);
    const huboCambios = st.sanear(st.data);
    return { huboCambios, igual: JSON.stringify(st.data) === antes };
  })()`);
  paso('sanear() de nuevo no reporta cambios', segunda.huboCambios === false, segunda);
  paso('sanear() de nuevo no altera el estado', segunda.igual === true);

  // 5. Y una recarga completa tampoco.
  //
  // Se comparan los DATOS, no el texto: el orden de las claves no es un dato y
  // una migración que reordena el objeto sigue siendo idempotente. La
  // comparación textual solo servía para delatar qué cambió de verdad.
  const crudoTrasMigrar = despues.crudo;
  await p.goto(PAGE_URL, 7000);
  await p.page.eval(HIDE_ROLE_MODAL);
  await sleep(600);
  const trasRecarga = await p.page.eval(FOTOGRAFIA);
  const diferencia = await p.page.eval(`(function(){
    var a = ${JSON.stringify(crudoTrasMigrar)}, b = ${JSON.stringify(trasRecarga.crudo)};
    function orden(x) {
      if (Array.isArray(x)) return x.map(orden);
      if (x && typeof x === 'object') {
        var o = {};
        Object.keys(x).sort().forEach(function (k) { o[k] = orden(x[k]); });
        return o;
      }
      return x;
    }
    return JSON.stringify(orden(JSON.parse(a))) === JSON.stringify(orden(JSON.parse(b))) ? null : 'difieren';
  })()`);
  paso('recargar la app no vuelve a tocar los datos', diferencia === null, { diferencia });

  const dir = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
  await p.shot(path.join(dir, 'fase1-migracion.png'));
} finally {
  console.log('\n' + (ok ? 'MIGRACION: OK' : 'MIGRACION: FALLO'));
  await p.close();
  process.exit(ok ? 0 : 1);
}