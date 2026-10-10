/* cerrar-ventanas.mjs - Barrer las ventanas que el arnes CDP deja abiertas.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Hay DOS arneses en este repo y se comportan distinto:
 *
 * · `sandbox.mjs` (launchSandbox) LANZA SU PROPIO navegador: perfil throwaway,
 *   `--headless=new`, y lo mata en `close()`. No aparece ninguna ventana. Es el
 *   que usan `crud-suite.mjs`, `adversarial-suite.mjs`, `shot.mjs` y los
 *   `diag-*.mjs`.
 *
 * · `cdp.mjs` (openPage) se CONECTA AL BRAVE DEL USUARIO, en 127.0.0.1:9222, y
 *   llama `Target.createTarget({ newWindow: true })`. Eso abre una ventana REAL
 *   y VISIBLE, con el `<title>` de la página: "Control de Gastos & Presupuesto".
 *   Lo usan `crud-admin.mjs`, `edicion-admin.mjs`, `recorrido.mjs`,
 *   `modales.mjs`, `tema-claro.mjs`, `color-probe.mjs` y otros.
 *
 * Esas ventanas se cierran en el `finally` de cada script. Las que se quedan son
 * de corridas que MATERON antes de llegar al `finally`: un timeout del agente, un
 * Ctrl+C, un script que tiró una excepcion fuera del try. Ese es el unico modo
 * de fuga, y por eso hace falta un barrido aparte: el `finally` protege contra
 * la salida limpia, que es la que nunca falla.
 *
 * USO
 * ---
 *   node odd\tasks\cerrar-ventanas.mjs          # solo informa
 *   node odd\tasks\cerrar-ventanas.mjs --cerrar # cierra lo que encuentre
 *
 * TRAMPA: el `targetId` se obtiene de `/json/list` y hay que cerrarlo con
 * `Target.closeTarget` sobre el socket del NAVEGADOR (`/json/version`), no sobre
 * el del target. Con el socket del target, `Target.closeTarget` no existe: es un
 * comando de dominio Browser.
 */
import http from 'node:http';

/* `WebSocket` GLOBAL de Node, no el paquete `ws`. Este repo no tiene
 * `node_modules` — `package.json` no existe y no hay build — y `cdp.mjs` ya
 * usa el global (`new WebSocket(wsUrl)`) desde Node 22. Importar `ws` rompía
 * con ERR_MODULE_NOT_FOUND en un repo que no puede instalar nada. */

const HOST = '127.0.0.1';
const PORT = 9222;

const CERRAR = process.argv.includes('--cerrar');

function httpJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: p }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('respuesta no JSON: ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
  });
}

/* Una ventana nuestra tiene el `url` de la app. No se mira el titulo: el
 * titulo depende de la pagina y una ventana de prueba puede estar en
 * `about:blank` todavia sin titled. El filtro es la URL, que es lo que el
 * arnes navega. */
const ES_NUESTRA = u =>
  /file:\/\/\/C:\/Users\/User\/Desktop\/Web%20de%20Gastos%20Mensuales/i.test(u || '') ||
  /Web de Gastos Mensuales/i.test(u || '') ||
  /localhost:\d+/i.test(u || '');

async function main() {
  let targets;
  try {
    targets = await httpJson('/json/list');
  } catch (e) {
    console.log('No hay ningun navegador escuchando en 127.0.0.1:' + PORT);
    console.log('  (' + e.message + ')');
    console.log('  No hay nada que barrer: las ventanas que quedan no son de este arnes.');
    return;
  }

  const mias = targets.filter(t => t.type === 'page' && ES_NUESTRA(t.url));

  console.log('Targets totales en el navegador: ' + targets.length);
  console.log('Targets de la web de gastos  : ' + mias.length);

  if (!mias.length) {
    console.log('\nNinguna ventana de la web de gastos abierta. No hay nada que cerrar.');
    return;
  }

  for (const t of mias) {
    console.log('\n  ' + (t.title || '(sin titulo)'));
    console.log('    url  : ' + t.url);
    console.log('    id   : ' + t.id);
  }

  if (!CERRAR) {
    console.log('\nPara cerrarlas:  node odd\\tasks\\cerrar-ventanas.mjs --cerrar');
    return;
  }

  /* El socket es el del NAVEGADOR. `/json/version` lo publica en
   * `webSocketDebuggerUrl`; `/json/list` publica el de cada target, y ese no
   * entiende comandos del dominio Browser. */
  const ver = await httpJson('/json/version');
  const wsUrl = ver.webSocketDebuggerUrl;
  if (!wsUrl) {
    console.error('\nEl navegador no publico webSocketDebuggerUrl. No se puede cerrar.');
    process.exit(1);
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const send = (method, params) => new Promise((res, rej) => {
    const mine = ++id;
    const on = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== mine) return;
      ws.removeEventListener('message', on);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id: mine, method, params: params || {} }));
    setTimeout(() => {
      ws.removeEventListener('message', on);
      rej(new Error('timeout en ' + method));
    }, 8000);
  });

  let ok = 0, fallo = 0;
  for (const t of mias) {
    try {
      await send('Target.closeTarget', { targetId: t.id });
      console.log('[CERRADA] ' + (t.title || t.id));
      ok++;
    } catch (e) {
      console.log('[ERROR]   ' + (t.title || t.id) + ' -> ' + e.message);
      fallo++;
    }
  }

  ws.close();
  console.log('\n=== Resumen ===');
  console.log('    cerradas : ' + ok);
  console.log('    errores  : ' + fallo);
  console.log('=== Barrido finalizado ===');
}

main().catch(e => { console.error('Fallo el barrido: ' + e.message); process.exit(1); });