/* Snapshot del estado de gastos en localStorage.

 * `store.toggleBudgetItemStatus()` llama a `save()`, que escribe en
 * localStorage. Un probe que hace clic en un botón de estado PERSISTE un cambio
 * real en los datos del usuario. Esto sirve para ver qué hay ahora y para
 * comparar antes y después de una tanda.
 *
 * Uso:
 *   node odd\tasks\store-snapshot.mjs            -> imprime el estado actual
 *   node odd\tasks\store-snapshot.mjs guardar    -> guarda en odd\tasks\capturas\store-<fecha>.json
 *   node odd\tasks\store-snapshot.mjs restaurar <archivo>
 */
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from './cdp.mjs';

const [, , accion, archivo] = process.argv;
const CAPTURAS = 'odd/tasks/capturas';
fs.mkdirSync(CAPTURAS, { recursive: true });

const page = await openPage({ width: 1440, height: 900 });
let salida;
try {
  await page.goto('file:///C:/Users/User/Desktop/Web%20de%20Gastos%20Mensuales/index.html', 6000);
  salida = await page.page.eval(`(() => {
    const claves = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      claves[k] = localStorage.getItem(k);
    }
    const store = window.financialStore;
    const meses = store && store.getAllMonthsList ? store.getAllMonthsList() : [];
    const detalle = meses.map(m => {
      const mes = store.getMonth(m.id) || {};
      const items = [
        ...(mes.servicios?.fijos || []), ...(mes.servicios?.variables || []),
        ...(mes.personales?.fijos || []), ...(mes.personales?.variables || []),
        ...(mes.extras || []),
      ];
      return {
        mes: m.nombre,
        pagado: items.filter(x => x.estado === 'Pagado').length,
        pendiente: items.filter(x => x.estado !== 'Pagado').length,
        total: items.length,
        ids: items.map(x => x.id + '=' + x.estado).sort(),
      };
    });
    return { claves, meses: detalle };
  })()`);
} finally {
  await page.close();
}

const sello = new Date().toISOString().replace(/[:.]/g, '-');
if (accion === 'guardar') {
  const f = path.join(CAPTURAS, 'store-' + sello + '.json');
  fs.writeFileSync(f, JSON.stringify(salida, null, 1));
  console.log('guardado en ' + f);
} else if (accion === 'restaurar') {
  if (!archivo) throw new Error('hace falta el archivo a restaurar');
  const prev = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  await (async () => {
    const p2 = await openPage({ width: 1440, height: 900 });
    try {
      await p2.goto('file:///C:/Users/User/Desktop/Web%20de%20Gastos%20Mensuales/index.html', 6000);
      await p2.page.eval(`(() => {
        const prev = ${JSON.stringify(prev.claves)};
        for (const k of Object.keys(prev)) localStorage.setItem(k, prev[k]);
        const ahora = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ahora[k] = localStorage.getItem(k); }
        return Object.keys(ahora).length === Object.keys(prev).length;
      })()`);
    } finally { await p2.close(); }
  })();
  console.log('restaurado desde ' + archivo);
} else {
  console.log(JSON.stringify(salida.meses, null, 1));
  console.log('\nclaves en localStorage: ' + Object.keys(salida.claves).map(k => k + ' (' + salida.claves[k].length + ' bytes)').join(', '));
}
