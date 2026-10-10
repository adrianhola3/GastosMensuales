/* CASO MANUAL — Fase 1, estimado y real separados.
 *
 * El caso que el plan exige: un gasto FIJO con estimado 80 se paga a 95, y al
 * terminar el estimado tiene que seguir siendo 80, con la diferencia visible.
 *
 * Todo pasa por la interfaz real: se abre el sheet de edicion, se escribe el
 * estimado, se guarda; despues se pulsa el chip de estado de la fila, que abre
 * el modal de pago, se escribe el importe real y se confirma. No se escribe
 * nunca directo en el store: el store se usa solo para LEER el resultado.
 */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CONCEPTO = 'PRUEBA-MANUAL Fijo';
const p = await openPage({ width: 1440, height: 900 });
const out = { pasos: [], ok: true };

/* El modo administrador SOLO se alcanza con una sesión real (`esperarSesion()`
 * -> `{rol:'admin'}`); abrir la app pelada deja el cuerpo en `read-only-mode` y
 * `exigirAdmin()` rechaza cada escritura. Se instala el mismo stub que usa
 * `sandbox.mjs`, con trampa en `window.gastosRemoto` para que
 * `supabase-store.js` no lo pise al cargarse. CERO red: `guardar` y `cargar`
 * son no-ops locales, así que la nube no se toca. */
const STUB = `(() => {
  var oyentes = [];
  var stub = {
    estaConfigurado: function () { return true; },
    esperarSesion: function () { return Promise.resolve(true); },
    haySesion: function () { return true; },
    alCambiarSesion: function (cb) { if (typeof cb === 'function') oyentes.push(cb); },
    cargar: function () { return Promise.resolve(null); },
    guardar: function () { return Promise.resolve(); },
    iniciarSesion: function () { return Promise.resolve({ ok: false }); },
    iniciarSesionConGithub: function () { return Promise.resolve({ ok: false }); },
    salirDeSesion: function () { return Promise.resolve(); },
    _traducirError: function () { return '[fase1-manual]'; }
  };
  try { sessionStorage.setItem('finanzas_session_role_chosen', 'admin'); } catch (e) {}
  Object.defineProperty(window, 'gastosRemoto', {
    configurable: true, enumerable: true,
    get: function () { return stub; }, set: function () {}
  });
  return 'stub';
})()`;

function paso(nombre, condicion, detalle) {
  out.pasos.push({ nombre, ok: !!condicion, detalle: detalle === undefined ? null : detalle });
  if (!condicion) out.ok = false;
  console.log(`${condicion ? 'OK  ' : 'FALLA'} ${nombre}${detalle !== undefined ? '  ' + JSON.stringify(detalle) : ''}`);
}

try {
  await p.page.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await p.goto(PAGE_URL, 3000);
  /* `openPage` reutiliza el perfil del navegador, así que la corrida anterior
     dejó el gasto pagado en localStorage y el caso no sería repetible. Se
     borra ANTES de recargar para que cada corrida parta del estado de fábrica. */
  await p.page.eval(`(function () {
    try { localStorage.removeItem('control_gastos_mensuales_db_v1'); } catch (e) {}
    return 'limpiado';
  })()`);
  await p.goto(PAGE_URL, 7000);
  await p.page.eval(HIDE_ROLE_MODAL);
  await p.pump(2);
  await sleep(600);

  const admin = await p.page.eval(`(() => ({
    readOnly: document.body.classList.contains('read-only-mode'),
    visibles: [...document.querySelectorAll('.admin-action-btn')]
      .filter(b => getComputedStyle(b).display !== 'none').length,
    total: document.querySelectorAll('.admin-action-btn').length
  }))()`);
  paso('la app abre en modo administrador', !admin.readOnly && admin.visibles > 0, admin);

  // --- 1. Alta del gasto fijo con estimado 80 ---
  await p.page.eval(`document.getElementById('btnHeaderAddBudget').click(); 'ok'`);
  await sleep(300);
  await p.page.eval(`(() => {
    document.getElementById('budgetConcepto').value = ${JSON.stringify(CONCEPTO)};
    document.getElementById('budgetMonto').value = '80';
    document.getElementById('formAddBudget')
      .querySelector('button[type="submit"]').click();
    return 'ok';
  })()`);
  await p.pump(2);
  await sleep(600);

  const tras = await p.page.eval(`(() => {
    const st = window.financialStore;
    const m = st.getActiveMonth();
    const listas = [...m.servicios.fijos, ...m.servicios.variables,
                    ...m.personales.fijos, ...m.personales.variables, ...m.extras];
    const it = listas.find(x => x.concepto === ${JSON.stringify(CONCEPTO)});
    const fila = [...document.querySelectorAll('.expense-card-item')]
      .find(f => (f.querySelector('.expense-item-title') || {}).textContent === ${JSON.stringify(CONCEPTO)});
    return {
      encontrado: !!it,
      id: it ? it.id : null,
      montoEstimado: it ? it.montoEstimado : null,
      montoReal: it ? it.montoReal : null,
      estado: it ? it.estado : null,
      montoViejo: it ? it.monto : null,
      importeEnFila: fila ? fila.querySelector('.expense-item-amount').textContent.trim() : null,
      chip: fila ? fila.querySelector('.btn-status-toggle').textContent.trim() : null
    };
  })()`);
  paso('el gasto se creó con estimado 80', tras.encontrado && tras.montoEstimado === 80, tras);
  paso('arranca sin monto real', tras.montoReal === null, tras);
  paso('la fila lo muestra como Pendiente', tras.chip === 'Pendiente', tras);

  // --- 2. Se paga a 95 por la interfaz ---
  const itemId = tras.id;
  await p.page.eval(`(() => {
    const f = [...document.querySelectorAll('.expense-card-item')]
      .find(x => (x.querySelector('.expense-item-title') || {}).textContent === ${JSON.stringify(CONCEPTO)});
    f.querySelector('.btn-status-toggle').click();
    return 'ok';
  })()`);
  await p.pump(2);
  await sleep(400);

  const modalAbierto = await p.page.eval(
    `!!document.querySelector('#modalPayVariableExpense.active')`);
  paso('pagar abre el modal de importe real', modalAbierto, { modalAbierto });

  const estimadoAVista = await p.page.eval(
    `document.getElementById('payVarItemEstimated').textContent.trim()`);
  paso('el estimado queda a la vista', /80\.00/.test(estimadoAVista), { estimadoAVista });

  const porDefecto = await p.page.eval(
    `document.getElementById('payVarActualAmount').value`);
  paso('el importe real arranca en el estimado', porDefecto === '80.00', { porDefecto });

  await p.page.eval(`(() => {
    const i = document.getElementById('payVarActualAmount');
    i.value = '95';
    document.getElementById('formPayVariableExpense')
      .querySelector('button[type="submit"]').click();
    return 'ok';
  })()`);
  await p.pump(2);
  await sleep(600);

  // --- 3. El veredicto ---
  const fin = await p.page.eval(`(() => {
    const st = window.financialStore;
    const m = st.getActiveMonth();
    const listas = [...m.servicios.fijos, ...m.servicios.variables,
                    ...m.personales.fijos, ...m.personales.variables, ...m.extras];
    const it = listas.find(x => x.id === ${JSON.stringify(itemId)});
    const fila = [...document.querySelectorAll('.expense-card-item')]
      .find(f => (f.querySelector('.expense-item-title') || {}).textContent === ${JSON.stringify(CONCEPTO)});
    const t = st.calculateMonthTotals(m.id);
    return {
      montoEstimado: it.montoEstimado,
      montoReal: it.montoReal,
      estado: it.estado,
      montoViejo: it.monto,
      cubierto: st.estaCubierto(it),
      importeEnFila: fila ? fila.querySelector('.expense-item-amount').textContent.trim() : null,
      chip: fila ? fila.querySelector('.btn-status-toggle').textContent.trim() : null,
      totalEstimado: t.totalEstimado,
      totalReal: t.totalReal,
      totalCubierto: t.totalCubierto,
      totalFaltante: t.totalFaltante,
      desvio: t.desvio,
      progresoCubierto: t.progresoCubierto,
      identidad: (t.totalCubierto + t.totalFaltante) === t.totalEstimado,
      barra: {
        estimado: document.getElementById('monthTotalEgresos').textContent.trim(),
        real: document.getElementById('paidTextInfo').textContent.trim(),
        cubiertoYFalta: document.getElementById('pendingSummaryLabel').textContent.trim()
      }
    };
  })()`);

  paso('el estimado SIGUE siendo 80', fin.montoEstimado === 80, fin);
  paso('el monto real es 95', fin.montoReal === 95, fin);
  paso('la diferencia es de 15', Math.abs((fin.montoReal - fin.montoEstimado) - 15) < 1e-9, fin);
  paso('ya no existe el campo `monto` viejo', fin.montoViejo === undefined, fin);
  paso('ya no existe el campo `estado`', fin.estado === undefined, fin);
  paso('está cubierto (montoReal !== null)', fin.cubierto === true, fin);
  paso('la fila muestra la diferencia', /80\.00/.test(fin.importeEnFila) && /95\.00/.test(fin.importeEnFila)
    && /15\.00/.test(fin.importeEnFila), { importeEnFila: fin.importeEnFila });
  paso('la fila lo marca Pagado', fin.chip === 'Pagado', { chip: fin.chip });
  paso('totalCubierto + totalFaltante === totalEstimado', fin.identidad, {
    cubierto: fin.totalCubierto, falta: fin.totalFaltante, estimado: fin.totalEstimado });
  paso('totalReal y totalCubierto NO son el mismo número', fin.totalReal !== fin.totalCubierto,
    { real: fin.totalReal, cubierto: fin.totalCubierto });

  console.log('\nbarra de cifras:');
  console.log('  Estimado         : ' + fin.barra.estimado);
  console.log('  Real             : ' + fin.barra.real);
  console.log('  Cubierto / Falta : ' + fin.barra.cubiertoYFalta);
  console.log(`  desvio=${fin.desvio}  progresoCubierto=${fin.progresoCubierto}`);

  const dir = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
  await p.shot(path.join(dir, 'fase1-manual-fijo-80-pagado-95.png'));
} finally {
  console.log('\n' + (out.ok ? 'CASO MANUAL: OK' : 'CASO MANUAL: FALLO'));
  await p.close();
  process.exit(out.ok ? 0 : 1);
}