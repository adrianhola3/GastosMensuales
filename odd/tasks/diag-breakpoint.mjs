/* diag-breakpoint.mjs - El RANGO COMPLETO, no dos puntos.
 *
 * POR QUE ESTE ARCHIVO EXISTE
 * --------------------------
 * El bug que esta tanda arregla se produjo por medir UN ancho y ajustar a ese
 * ancho. `--section-rail-width` se calibro para que la tira de cinco cifras
 * entrara justa a 1440px, y nadie recorrio el rango de abajo. Resultado: la
 * columna vive en 1025-1423 y ahi la tira se parte en dos renglones. El usuario
 * tiene un monitor de 1366x768 y esta exactamente en la zona rota.
 *
 * "A 1280 se parte" no decide nada. "De que ancho a que ancho se parte" si.
 *
 * LO QUE MIDE, EN CADA ANCHO
 *   filas       renglones de la tira de cifras (1 mientras se pueda)
 *   holgura     disponible - necesario, en px (>= 24 para que sea aire y no
 *               coincidencia)
 *   scrollX     documentElement.scrollWidth - clientWidth (tiene que ser 0)
 *   recorte     `.rail-entry-name` / `.ledger-cell-label` con scrollWidth >
 *               clientWidth, o sea texto que no entra en su caja
 *   desborde    bloques que se salen de su propia caja
 *   altoDoc     documentElement.scrollHeight (para ver si reintrodujimos
 *               scroll vertical)
 *   modo        'columna' | 'banda' — lee flex-direction de la lista, no el
 *               ancho, porque el ancho es el mismo numero en los dos ejes y
 *               por eso el bug no se ve mirando el ancho
 *
 * USO
 *   node odd\tasks\diag-breakpoint.mjs                  local, 900 de alto
 *   node odd\tasks\diag-breakpoint.mjs --h 768          local, 768 (el monitor del usuario)
 *   node odd\tasks\diag-breakpoint.mjs --url <url>      pagina desplegada
*   node odd\tasks\diag-breakpoint.mjs --hoja          desplegada con la hoja
 *                                                     local puesta en su lugar
 *                                                     (Fetch.fulfillRequest),
 *                                                     que es como se verifica el
 *                                                     arreglo sin redesplegar
 *   node odd\tasks\diag-breakpoint.mjs --capturas     además de medir, guarda
 *                                                     una captura por ancho en
 *                                                     la lista de abajo
 */
import { launchSandbox } from './sandbox.mjs';
import fs from 'node:fs';
import path from 'node:path';

const DEPLOY = 'https://adrianhola3.github.io/GastosMensuales/';

/* Los 17 anchos del encargo. El par 1440/1439 está porque 1440 es el ancho de
 * diseño del proyecto y 1439 el primero que queda abajo: entre los dos está la
 * transición, y una transición que solo se midió de un lado es la mitad del
 * bug. */
const ANCHOS = [1920, 1600, 1520, 1440, 1439, 1400, 1366, 1280, 1200, 1100, 1025, 1024, 900, 768, 640, 480];

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const URL = opt('--url') || null;
const H = Number(opt('--h') || 900);
const INYECTAR = flag('--inyectar') || flag('--hoja');
const CAPTURAS = flag('--capturas');
/* 1440 es el ancho de diseño y el borde de la transición; 1366 es el monitor
 * del usuario, que es donde se veía la deformación; 1024 es donde el drawer
 * entra y donde la columna de secciones dejó de ser columna antes de esta
 * corrección. */
const CAPTURAR_EN = [1440, 1366, 1024];
const DIR_CAPTURAS = path.join('odd', 'tasks', 'capturas');

/* PARA VERIFICAR EL ARREGLO SOBRE LA PAGINA DESPLEGADA SIN REDESPLEGAR
 *
 * No se inyecta un <style> aparte, y no es una preferencia: no se PUEDE.
 * Una media query NO suma especificidad, así que las reglas nuevas con el
 * mismo peso que las viejas deciden por orden de origen, y el archivo real
 * depende del orden de ORIGEN para que §19b (1024) gane a §19a (1440):
 *   · inyectando antes del <link> de la app, la base de 3 columnas le gana a
 *     §19a y no cambia NADA;
 *   · inyectando después, §19a le gana al bloque de 1024 ya desplegado, y en
 *     <=1024 los dos ítems en flujo se reparten entre las dos columnas:
 *     medido, `main` de 1009px a 773px en 1024 y la banda desbordando 732px
 *     dentro de 649px a 900.
 *
 * Lo que sí es fiel es responder la PETICIÓN de la hoja con la hoja local
 * (`Fetch.fulfillRequest` sobre `*styles.css*`): la página real con su HTML y
 * su JS, y la hoja nueva servida donde el navegador la pedía, con el mismo
 * orden de cascada que tendría un redespliegue. Es lo más cerca del despliegue
 * que se puede medir sin redesplegar.
 *
 * (`CSS.setStyleSheetText` se intentó antes y no sirve en este navegador:
 * `CSS.enable` responde pero `CSS.getDocument` devuelve -32601. No es un
 * problema del arnés.) */
async function aplicarCssLocal(sb) {
  const css = fs.readFileSync('css/styles.css', 'utf8');
  const cuerpo = Buffer.from(css).toString('base64');
  const estado = { atendidos: 0, urls: [], activo: false };
  sb.page.on(async (msg) => {
    if (msg.method !== 'Fetch.requestPaused') return;
    estado.atendidos++;
    estado.urls.push(msg.params.request.url);
    try {
      await sb.page.send('Fetch.fulfillRequest', {
        requestId: msg.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'text/css; charset=utf-8' },
          { name: 'Cache-Control', value: 'no-store' },
        ],
        body: cuerpo,
      });
    } catch {
      try {
        await sb.page.send('Fetch.failRequest',
          { requestId: msg.params.requestId, errorReason: 'Failed' });
      } catch { /* la peticion ya no existe */ }
    }
  });
  const activar = async () => {
    if (estado.activo) return;
    await sb.page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*styles.css*', requestStage: 'Request' }],
    });
    estado.activo = true;
  };
  await activar();
  await sb.reload();
  if (!estado.atendidos) throw new Error('ninguna peticion de styles.css fue interceptada: no se midio la hoja nueva');
  /* NO se desactiva: `sb.reload()` vuelve a pedir la hoja, y si el listener
   * estuviera ya fuera, cada recarga —incluidas las de la sección 5— volvería
   * a traer la hoja DESPLEGADA y se mediría el bug viejo. */
  sb.__hojaLocal = estado;
  return { atendidos: estado.atendidos, urls: estado.urls, bytes: css.length };
}

const leer = () => `(() => {
  const d = document.documentElement;
  const strip = document.querySelector('.ledger-strip');
  const main = document.querySelector('.main-content');
  const celdas = [...strip.querySelectorAll('.ledger-cell')];
  const tops = [...new Set(celdas.map(c => Math.round(c.getBoundingClientRect().top)))];
  /* .length, NO .size: el spread de un Set devuelve un ARRAY. Es el mismo error
   * que tiene diag-deform.mjs:34, y por eso la columna "filas" de esa salida no
   * existe: daba undefined en todos los anchos y su seccion "EL LIMITE EXACTO"
   * no podia decir nada. Renglones contados, no medidos. */
  const filas = tops.length;

  /* Ancho que la tira NECESITA en una linea. Se mide con los renglones
   * internos en nowrap y las celdas en min-content: si el renglon ya se partio,
   * el navegador no esta usando el ancho que dice que necesita, y el numero
   * que sale es el de la fila partida, no el de la tira. */
  const g = [];
  for (const el of [strip, ...document.querySelectorAll('.ledger-paid-line, .ledger-balance-line')]) {
    g.push([el, el.style.flexWrap]); el.style.flexWrap = 'nowrap';
  }
  let necesario = 0;
  const partes = [];
  for (const c of celdas) {
    c.style.width = 'min-content';
    const w = c.getBoundingClientRect().width;
    partes.push({ rotulo: (c.querySelector('.ledger-cell-label') || {}).textContent || '?', w: +w.toFixed(1) });
    necesario += w;
    c.style.width = '';
  }
  /* 4 gaps, NO 5: cinco celdas en un flex dejan CUATRO separaciones. Sumar
   * columnGap * celdas.length (lo que hace diag-deform.mjs:48) infla el ancho
   * necesario en un gap entero, y con eso la holgura de 1440 sale 25.2px
   * cuando son 41.2px. No es cosmético: 16px es justo lo que separa "a 1400 la
   * tira entra" de "a 1400 la tira se parte", y el diagnostico anterior
   * reportaba las dos cosas al mismo tiempo. */
  necesario += (parseFloat(getComputedStyle(strip).columnGap) || 0) * (celdas.length - 1);
  for (const [el, v] of g) el.style.flexWrap = v;

  const mc = getComputedStyle(main);
  const disponible = main.clientWidth
    - (parseFloat(mc.paddingLeft) || 0) - (parseFloat(mc.paddingRight) || 0);

  const recorte = [...document.querySelectorAll(
      '.rail-entry-name, .ledger-cell-label, .rail-entry-total, .brand-title')]
    .filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
    .map(e => (e.className.split(' ')[0] || '?') + ':"' + e.textContent.trim().slice(0, 18) + '"');

  const desborde = [...document.querySelectorAll(
      '.ledger-strip, .section-rail, .section-rail-list, .app-sidebar, .app-main-area, .main-content, .app-layout')]
    .filter(e => e.scrollWidth > e.clientWidth + 2)
    .map(e => e.className.split(' ').slice(0,2).join('.') + ' ' + e.scrollWidth + '>' + e.clientWidth);

  const lista = document.querySelector('.section-rail-list');
  const sec = document.querySelector('.section-rail');
  const barra = document.querySelector('.ledger-toolbar');

  return {
    ventana: innerWidth,
    filas,
    disponible: +disponible.toFixed(1),
    necesario: +necesario.toFixed(1),
    holgura: +(disponible - necesario).toFixed(1),
    scrollX: d.scrollWidth - d.clientWidth,
    altoDoc: d.scrollHeight,
    recorte, desborde,
    modo: getComputedStyle(lista).flexDirection === 'row' ? 'banda' : 'columna',
    secW: +sec.getBoundingClientRect().width.toFixed(1),
    cols: getComputedStyle(document.querySelector('.app-layout')).gridTemplateColumns,
    mainW: +main.clientWidth.toFixed(1),
    sidebarPos: getComputedStyle(document.querySelector('.app-sidebar')).position,
    barra: barra ? +barra.getBoundingClientRect().height.toFixed(1) : null,
    partes,
  };
})()`;

const sb = await launchSandbox({ fixture: 'baseline', headless: true, url: URL || undefined });

try {
  await sb.assertAdmin();
  await sb.markBootBaseline();

  if (INYECTAR) {
    const r = await aplicarCssLocal(sb);
    console.log('\n[hoja desplegada servida desde css/styles.css local: ' + r.atendidos +
      ' peticion(es), ' + r.bytes + ' bytes]');
    for (const u of r.urls) console.log('  ' + u);
    console.log('  (la intercepcion queda activa: cada recarga vuelve a pedir la hoja y recibe la local)');
  }

  console.log('\n=== ' + (URL ? 'DESPLEGADA ' : 'LOCAL ') + '===');
  console.log('url: ' + (URL || 'file:///.../index.html') + (INYECTAR ? '  (+ hoja local en su lugar)' : ''));
  console.log('alto de ventana: ' + H + 'px\n');

const res = [];
  for (const w of ANCHOS) {
    await sb.resize(w, H);
    const r = await sb.eval(leer());
    res.push(r);
    if (CAPTURAS && CAPTURAR_EN.includes(w)) {
      const archivo = path.join(DIR_CAPTURAS, `breakpoint-${w}.png`);
      await sb.shot(archivo);
      r.captura = archivo;
    }
    const p = (n, k) => String(n).padStart(k);
    console.log(
      p(r.ventana, 5) + ' | ' + p(r.filas, 2) + ' | ' + p(r.disponible, 8) + ' ' +
      p(r.necesario, 7) + ' ' + p(r.holgura, 8) + ' | ' + p(r.scrollX, 3) + ' | ' +
      p(r.altoDoc, 5) + ' | ' + r.modo.padEnd(7) + ' | ' + p(r.secW, 4) + ' | ' +
      p(r.mainW, 5) + ' | ' + p(r.barra, 6) + ' | ' + p(r.recorte.length, 2) + ' ' +
      p(r.desborde.length, 2) + ' | ' + (r.recorte.join(',') || '-') +
      (r.desborde.length ? ' DESBORDE:' + r.desborde.join(',') : '')
    );
  }

  console.log('\n  ventana | filas holgura  barra   modo    (lectura)');
  for (const r of res) {
    const h = r.holgura;
    const veredicto = h >= 24 ? 'OK   aire' : (h >= 0 ? 'FINO <24px' : 'NEGATIVO, se parte');
    const f = r.filas === 1 ? '1' : r.filas + ' RENGLONES';
    console.log('  ' + String(r.ventana).padStart(7) + ' | ' + f.padStart(7) + ' ' +
      String(h).padStart(6) + '  ' + String(r.barra).padStart(6) + '  ' +
      r.modo.padEnd(7) + ' ' + veredicto);
  }

  const rotas = res.filter(r => r.filas > 1);
  console.log('\n=== 1. LA TIRA PARTIDA ===');
  console.log('  anchos con la tira en mas de un renglon: ' +
    (rotas.length ? rotas.map(r => r.ventana + (r.holgura >= 0 ? ' (holgura ' + r.holgura + ')' : '')).join(', ') : 'ninguno'));
  const fina = res.filter(r => r.filas === 1 && r.holgura < 24);
  console.log('  anchos en 1 renglon con menos de 24px de aire: ' +
    (fina.length ? fina.map(r => r.ventana + ' (' + r.holgura + 'px)').join(', ') : 'ninguno'));

const conScrollX = res.filter(r => r.scrollX !== 0);
  console.log('\n=== 2. SCROLL HORIZONTAL DEL DOCUMENTO ===');
  console.log('  ' + (conScrollX.length
    ? conScrollX.map(r => r.ventana + ': +' + r.scrollX + 'px').join(', ')
    : 'ninguno en los ' + res.length + ' anchos (scrollX = 0 en todos)'));

  if (CAPTURAS) {
    console.log('\n=== 2b. CAPTURAS ===');
    for (const r of res.filter(x => x.captura)) {
      console.log('  ' + r.ventana + 'px -> ' + r.captura +
        '  (' + r.modo + ', ' + r.filas + ' renglon/es de tira, holgura ' + r.holgura + 'px)');
    }
  }

  console.log('\n=== 3. RECORTE Y DESBORDE ===');
  const rec = res.filter(r => r.recorte.length);
  const des = res.filter(r => r.desborde.length);
  console.log('  texto recortado : ' + (rec.length
    ? rec.map(r => r.ventana + ': ' + r.recorte.join(',')).join(' | ') : 'ninguno'));
  console.log('  bloques desbordados: ' + (des.length
    ? des.map(r => r.ventana + ': ' + r.desborde.join(',')).join(' | ') : 'ninguno'));

  console.log('\n=== 4. LA TRANSICION, A AMBOS LADOS ===');
  const i1440 = res.findIndex(r => r.ventana === 1440);
  const i1439 = res.findIndex(r => r.ventana === 1439);
  if (i1440 >= 0 && i1439 >= 0) {
    const a = res[i1440], b = res[i1439];
    console.log('  3 columnas (ventana > breakpoint), el mas estrecho que todavia las tiene:');
    console.log('    ' + a.ventana + 'px -> ' + a.modo + ', holgura ' + a.holgura + 'px, barra ' + a.barra + 'px' +
      (a.holgura >= 24 ? '   >= 24 OK' : '   < 24 FALLA'));
    console.log('  banda (ventana <= breakpoint), el mas ancho que todavia la tiene:');
    console.log('    ' + b.ventana + 'px -> ' + b.modo + ', holgura ' + b.holgura + 'px, barra ' + b.barra + 'px' +
      (b.holgura >= 24 ? '   >= 24 OK' : '   < 24 FALLA'));
  }

  console.log('\n=== 5. LA TIRA EN SU PEOR CASO, NO EN SU CASO DE HOY ===');
  /* Los ~900px de la tira son el ancho de la fixture `baseline` con importes de
   * prueba. Si un importe real mide mas, toda la holgura de arriba es una cota
   * optimista y un "25.2px de aire" puede ser un "-3px" con los datos de otra
   * persona. Asi que se inflan los textos de las cinco celdas con lo mas ancho
   * que la propia hoja declara como maximo (`S/ 12,345.67`, doc 4a) y se vuelve
   * a medir. Se separa en dos porque son dos cosas distintas:
   *   (a) los IMPORTES: los cinco a S/ 12,345.67
   *   (b) mas los TEXTOS DE CONTEO: "12 de 24 gastos pagados", que es lo que
   *       hace ancha a la celda "Pagado" segun el doc 4a
   * Si la holgura aguanta (b), aguanta con cualquier dato de la persona. */
  const IMPORTES = {
    monthTotalEgresos: 'S/ 12,345.67',
    paidTextInfo: 'S/ 12,345.67',
    pendingSummaryLabel: 'S/ 12,345.67',
    monthTotalIngresos: 'S/ 12,345.67',
    monthBalanceNeto: 'S/ -12,345.67',
    monthBalanceStatusLabel: 'S/ -12,345.67',
  };
  const CONTEO = Object.assign({}, IMPORTES, {
    monthAbonoPercentLabel: '999.9%',
    monthGastosCount: '12 de 24 gastos pagados',
    paidPercentBadge: '38.1% Pagado',
    monthIngresosCount: '24 abonos registrados',
});
  console.log('  ' + 'ancho'.padEnd(7) + 'fixture     +importes   +conteos    (necesario / holgura de la tira)');
  for (const w of [1440, 1366, 1025, 900]) {
    const medir = async () => {
      await sb.resize(w, H);
      const b = await sb.eval(leer());
      const out = [b];
      for (const par of [IMPORTES, CONTEO]) {
        await sb.eval(`(() => {
          const p = ${JSON.stringify(par)};
          for (const [id, txt] of Object.entries(p)) {
            const e = document.getElementById(id); if (e) e.textContent = txt;
          }
          return true;
        })()`);
        await sb.pump(2);
        out.push(await sb.eval(leer()));
        await sb.reload();  /* los textos inflados son de la prueba, no del store */
      }
      return out;
    };
    const [b, a, c] = await medir();
    const f = x => String(x.necesario).padStart(7) + '/' + String(x.holgura).padStart(8);
    console.log('  ' + String(w).padStart(5) + 'px ' + f(b) + ' ' + f(a) + ' ' + f(c) +
      '   ' + b.modo + ' -> ' + c.modo + ', filas ' + b.filas + ' -> ' + c.filas);
  }
} finally {
  await sb.close();
}