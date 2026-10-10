/* Arneses CDP para verificar la web de gastos.
 *
 * Se escribe contra las trampas reales de este entorno, no contra la doc de
 * CDP:
 *
 *  - `Target.createTarget` SIN `background: true`. Brave descarta esos targets
 *    con "No target with given id found" y el socket queda colgado.
 *  - El `http.get` a 127.0.0.1:9222 va SIN `headers: { Host: 'localhost' }`:
 *    Brave devuelve entonces el `webSocketDebuggerUrl` sin puerto y falla.
 *  - `Network.setCacheDisabled` ANTES de navegar. Sin eso el CSS servido desde
 *    disco puede venir de la cache del perfil y se mide el tema anterior.
 *  - `Page.captureScreenshot` SIN `captureBeyondViewport`: los `position: sticky`
 *    se renderizan en posicion falsa y el bug parece de layout.
 *  - La pagina scrollea en un contenedor, no en `window`: `scrollTo` no la
 *    mueve, por eso hay una pasada aparte con `height: 2600`.
 *  - `Target.closeTarget` SIEMPRE en `finally`.
 *
 * ------------------------------------------------------------------
 * AVISO QUE ESTA EN EL ARNES PORQUE SE ROMPIO MAS DE UNA VEZ
 * ------------------------------------------------------------------
 * `openPage` se conecta al BRAVE DEL USUARIO (127.0.0.1:9222) y abre una
 * ventana REAL Y VISIBLE con el `<title>` de la pagina. Al usuario le aparecen
 * ventanas "Control de Gastos & Presupuesto" en el Alt+Tab.
 *
 * El `finally` las cierra, y por eso la salida limpia no fuga. Las que quedan
 * son de corridas MATADAS antes de llegar al `finally`: timeout del agente,
 * Ctrl+C, o una excepcion lanzada fuera del try. Un `finally` protege contra la
 * salida que ya funciona; no puede proteger contra un proceso que no llega a
 * ejecutarlo.
 *
 * REGLAS PARA NO VOLVER A DEJAR VENTANAS:
 *   1. Nada de correr estos arneses con un timeout que los mate. Si un script
 *      tarda mas de lo que esperabas, eso se arreglasehaciendo que el script
 *      dure menos, no matandolo.
 *   2. Al terminar cualquier tanda, correr el barrido:
 *          node odd\tasks\cerrar-ventanas.mjs --cerrar
 *      Es idempotente y no toca ninguna pestana que no sea de esta web.
 *   3. Para instrumentar y medir, preferi `sandbox.mjs` (`launchSandbox`): ese
 *      LANZA SU PROPIO navegador, con perfil throwaway y `--headless=new`, y no
 *      abre ninguna ventana. Para crear, editar y borrar en el DOM real, los
 *      tests usan `sandbox.mjs` justamente por esto.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = 9222;
export const PAGE_URL = 'file:///C:/Users/User/Desktop/Web%20de%20Gastos%20Mensuales/index.html';

function httpJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: p }, res => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('JSON invalido de ' + p + ': ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout en ' + p)); });
  });
}

/* ---------- cliente WebSocket del protocolo ----------
 * `sessionId` vive en la instancia y lo manda TODO comando por defecto, para que
 * los metodos que llaman a `this.send` desde adentro (eval, focus, shot) no lo
 * pierdan. Los comandos de nivel navegador pasan `null` explicito.
 * Un Proxy con `v.bind(t)` NO sirve: `t` es el objeto crudo y el `this.send`
 * interno se iría sin sessionId, que es como el comando llega al target del
 * navegador y responde "'Runtime.evaluate' wasn't found".
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
        msg.error ? reject(new Error(msg.error.message + ' ' + JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  on(fn) { this.listeners.push(fn); }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    /* sessionId va en el nivel superior del mensaje, NO dentro de params: es lo
     * que exige el modo plano de Target.attachToTarget. */
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('timeout CDP en ' + method));
        }
      }, 45000);
    });
  }
  /* evaluate con returnByValue y errores de excepcion como rechazo */
  async eval(expression, { awaitPromise = false } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise, allowUnsafeEvalBlockedByCSP: false
    });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error('excepcion en la pagina: ' + (e.exception?.description || e.text));
    }
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* ya cerrado */ } }
}

/* ---------- sesion sobre un target propio ---------- */
export async function openPage({ width = 1440, height = 900 } = {}) {
  const ver = await httpJson('/json/version');
  const wsUrl = ver.webSocketDebuggerUrl;
  if (!wsUrl || !/:\d+\//.test(wsUrl)) throw new Error('webSocketDebuggerUrl sin puerto: ' + wsUrl);

  const browserWs = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    browserWs.addEventListener('open', res, { once: true });
    browserWs.addEventListener('error', () => rej(new Error('no se pudo abrir el socket del navegador')), { once: true });
  });
  const browser = new Cdp(browserWs);

  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await browser.send('Target.closeTarget', { targetId }); } catch { /* ya cerrado */ }
    browser.close();
  };

  try {
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true }, null);
    browser.sessionId = sessionId;
    const page = browser;
    const consoleErrors = [];
    const exceptions = [];
    const failedRequests = [];
    page.on(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
      }
      if (msg.method === 'Network.responseReceived') {
        const st = msg.params.response.status;
        if (st >= 400) failedRequests.push(st + ' ' + msg.params.response.url);
      }
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    /* La ventana propia tiene que estar delante y enfocada. Sin esto el compositor
     * no produce frames: Chart.js (que dibuja en requestAnimationFrame) queda sin
     * pintar y `getComputedStyle` devuelve el VALOR VIEJO de cualquier transición
     * en curso. Se ve en la captura igual: dos cifras quedan del color del tema
     * anterior. */
    try { await page.send('Page.bringToFront'); } catch { /* ya estaba delante */ }
    try { await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* no soportado */ }

    /* Una captura DESCARTA es la forma barata de forzar un frame: es lo único
     * que hace avanzar el reloj de animaciones y de transiciones. */
    const pump = async (n = 3) => {
      for (let i = 0; i < n; i++) {
        await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      }
    };

    return {
      page, browser, targetId, close, pump,
      consoleErrors, exceptions, failedRequests,
      async goto(url = PAGE_URL, waitMs = 7000) {
        await page.send('Page.navigate', { url });
        await new Promise(r => setTimeout(r, waitMs));
      },
async resize(w, h) {
        await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await pump(2);
        await new Promise(r => setTimeout(r, 500));
      },
      async shot(file) {
        // SOLO del viewport: con captureBeyondViewport los sticky se renderizan
        // en posicion falsa y ademas Chart.js se fotografia a medio repintar.
        const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        return file;
      },
      async setTheme(cls) {
        await page.eval(`(() => {
          document.documentElement.classList.remove('theme-dark');
          ${cls ? `document.documentElement.classList.add('${cls}');` : ''}
          return document.documentElement.className;
        })()`);
        /* pump ANTES de volver a renderizar: la transición de color del tema
         * anterior tiene que terminar antes de que Chart.js lea los tokens, o
         * los lienzos se pintan con los colores viejos. */
        await pump(3);
        await new Promise(r => setTimeout(r, 500));
        await page.eval(`(typeof window.renderGlobalCharts === 'function' ? window.renderGlobalCharts() : null);
          'ok'`);
        await pump(3);
        await new Promise(r => setTimeout(r, 900));
      },
    };
  } catch (err) {
    await close();
    throw err;
  }
}

/* ---------- estilo que oculta el modal de rol ----------
 * Con `file://` el origin es `null`, el refresh_token de Supabase falla y la app
 * abre `#modalSessionRoleSelect`. Los datos SI cargan (caen a localStorage), asi
 * que se oculta el modal en vez de tocar el codigo. */
export const HIDE_ROLE_MODAL = `
  (() => {
    const s = document.createElement('style');
    s.id = 'probe-hide-role';
    s.textContent = '#modalSessionRoleSelect{display:none !important}';
    document.head.appendChild(s);
    return true;
  })()
`;

/* Congela la escritura a Supabase con contadores ANTES de cualquier interaccion.
 * El recorrido funcional abre y cierra drawers, cambia de mes y busca: nada de
 * eso deberia escribir, y si escribiera hay que saberlo. */
export const FREEZE_WRITES = `
  (() => {
    window.__probe = window.__probe || {};
    const p = window.__probe;
    p.guardar = 0; p.iniciarSesion = 0; p.salirDeSesion = 0; p.github = 0;
    const g = window.gastosRemoto;
    if (!g) return 'sin gastosRemoto';
    if (!g.__congelado) {
      g.__congelado = true;
      for (const [k, campo] of [['guardar','guardar'],['iniciarSesion','iniciarSesion'],
                               ['salirDeSesion','salirDeSesion'],['iniciarSesionConGithub','github']]) {
        const orig = g[k];
        if (typeof orig !== 'function') continue;
        g[k] = function () { p[campo]++; return Promise.resolve({ ok: false, congelado: true }); };
      }
    }
    return 'congelado';
  })()
`;

export async function targetCount() {
  const list = await httpJson('/json/list');
  return {
    total: list.length,
    mios: list.filter(t => t.url === 'about:blank' || t.url.startsWith('file:///C:/Users/User/Desktop/Web%20de%20Gastos')).length,
  };
}