/* fuente-metricas.mjs - Las tres cosas que hay que MEDIR antes de escribir
 * la hoja, y que decides el diseño. Ninguna se responde leyendo la fuente.
 *
 * 1. ¿FUNCIONA `@import` CON `file://`?
 *    La app se abre desde el disco (sandbox.mjs:69, `file:///...index.html`), y
 *    si `@import` no resolviera en ese origen, TODO el CSS se caería y no me
 *    enteraría hasta la primera captura. Se prueba con un archivo real, no con
 *    un theory.
 *
 * 2. ¿QUÉ size-adjust necesita el respaldo de IBM Plex Sans?
 *    Con `font-display: swap` el texto primero se dibuja en la familia de
 *    respaldo. Sin `size-adjust` calibrado, la página se reacomoda cuando llega
 *    la webfont: es CLS de fuente. Los cuatro números salen de
 *    `TextMetrics.fontBoundingBox*` del archivo real, igual que antes.
 *
 * 3. ¿TIENE IBM Plex SANS CIFRAS TABULARES?
 *    Todo el diseño de cifras depende de `tabular-nums`. IBM Plex Sans declara
 *    `tnum`, pero "declara" no es "responde": se mide dibujando "1111" y "0000"
 *    con y sin la característica y comparando el ancho. Si no respondiera,
 *    `font-variant-numeric` sería decorativo y las columnas bailarían.
 *
 *    node odd\tasks\fuente-metricas.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchSandbox } from './sandbox.mjs';

const ROOT = process.cwd();
const CSS_DIR = path.join(ROOT, 'css');
const FONT = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-wght-normal.woff2';
const FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/* ---- 1. La prueba de @import: un archivo real, con contenido real ---------- */
fs.writeFileSync(path.join(CSS_DIR, '_probe-import.css'),
  '.import-probe { color: rgb(1, 2, 3); }\n', 'utf8');
fs.writeFileSync(path.join(CSS_DIR, '_probe-entry.css'),
  `@import './_probe-import.css';\n.import-probe { font-weight: 700; }\n`, 'utf8');

const sb = await launchSandbox({ fixture: 'baseline', width: 1440, height: 900 });
let out;
try {
  /* ---- 2 y 3. Métricas de la fuente, medidas sobre la página real ---------- */
  out = await sb.eval(`(async () => {
    const s = document.createElement('style');
    s.textContent = "@font-face{font-family:'Plex Medida';font-style:normal;font-weight:100 900;src:url('${FONT}') format('woff2-variations');}";
    document.head.appendChild(s);

    /* --- 1. ¿@import resuelve en file://? --- */
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/_probe-entry.css';
    document.head.appendChild(link);
    await new Promise(res => { link.onload = res; link.onerror = res; setTimeout(res, 2500); });
    const probe = document.createElement('div');
    probe.className = 'import-probe';
    document.body.appendChild(probe);
    /* OJO: link.sheet.cssRules NO se puede leer acá. Con file:// cada
       documento es un origen opaco y el navegador bloquea el acceso a las
       reglas de una hoja de otro archivo: tira SecurityError. La pregunta
       correcta NO es "cuántas reglas tiene la hoja" sino "¿se aplicó la regla
       importada?", y eso se responde con el estilo COMPUTADO de un elemento,
       que no tiene ninguna restricción de origen. */
    const pcs = getComputedStyle(probe);
    const importProbe = {
      color: pcs.color, fontWeight: pcs.fontWeight,
      resuelve: pcs.color === 'rgb(1, 2, 3)' && pcs.fontWeight === '700',
    };
    probe.remove(); link.remove();

    const cargadas = [];
    for (const w of [400, 500, 600, 700]) {
      try { await document.fonts.load(w + ' 100px "Plex Medida"', 'Servicios del hog S/ 12,345.67'); cargadas.push(w); }
      catch (e) { cargadas.push('ERR:' + w); }
    }
    await document.fonts.load('100px "Plex Medida"', 'ñáéíóú¿¡');
    await document.fonts.ready;

    const M = 1000;
    const textos = [
      'Servicios del hog S/ 12,345.67',
      'Detalle mensual Consolidado multimes',
      'Gastos Pagados Pendiente 0.0% Pagado',
      'Ingresos y abonos Presupuesto de gastos',
    ];
    const pesos = [400, 500, 600, 700];
    const ctx = document.createElement('canvas').getContext('2d');
    const medir = (fam, w) => {
      ctx.font = w + ' ' + M + 'px ' + fam;
      let ancho = 0; for (const t of textos) ancho += ctx.measureText(t).width;
      const mt = ctx.measureText('SxgHÁ');
      return { ancho: +ancho.toFixed(3), ascent: +mt.fontBoundingBoxAscent.toFixed(3),
               descent: +mt.fontBoundingBoxDescent.toFixed(3) };
    };
    const plex = {}, respaldo = {};
    for (const w of pesos) { plex[w] = medir('"Plex Medida"', w); respaldo[w] = medir('${FALLBACK}', w); }

    const pond = k => 0;   // (placeholder declarado y no usado: abajo se calcula)
    const calc = {};
    for (const w of pesos) calc[w] = {
      sizeAdjust: +(plex[w].ancho / respaldo[w].ancho * 100).toFixed(2),
      ascentOverride: +(plex[w].ascent / M * 100).toFixed(2),
      descentOverride: +(plex[w].descent / M * 100).toFixed(2),
      plexAncho: plex[w].ancho, respaldoAncho: respaldo[w].ancho,
    };
    const media = k => +([400,500,600,700].reduce((a,w) => a + calc[w][k], 0) / 4).toFixed(2);
    const mediaPonderada = k => +(
      calc[400][k]*0.45 + calc[500][k]*0.10 + calc[600][k]*0.30 + calc[700][k]*0.15).toFixed(2);

    /* --- 3. ¿tnum responde? Mismo texto, con y sin la característica. ---
       El canvas NO tiene conmutador para font-variant-numeric: ctx.font es
       la gramática de font CSS y no incluye variantes numéricas. La única
       forma honesta de medirlo es poner la fuente en un elemento real con la
       característica activa y leer el ancho renderizado. */
    const caja = document.createElement('span');
    caja.style.cssText = 'position:absolute;left:-9999px;font:600 100px "Plex Medida";white-space:pre;';
    document.body.appendChild(caja);
    const anchoDe = (texto, feat) => {
      caja.style.fontVariantNumeric = feat;
      caja.textContent = texto;
      return +caja.getBoundingClientRect().width.toFixed(2);
    };
    const tnum = {
      unos: { normal: anchoDe('11111111', 'normal'), tabular: anchoDe('11111111', 'tabular-nums') },
      ceros: { normal: anchoDe('00000000', 'normal'), tabular: anchoDe('00000000', 'tabular-nums') },
      nueves: { normal: anchoDe('99999999', 'normal'), tabular: anchoDe('99999999', 'tabular-nums') },
      mixto: { normal: anchoDe('S/ 12,345.67', 'normal'), tabular: anchoDe('S/ 12,345.67', 'tabular-nums') },
    };
    caja.remove();

    /* Lo que hace TABULAR no es que la característica cambie algo: es que todos
       los dígitos ocupen EXACTAMENTE el mismo avance. Se prueba con tres
       dígitos distintos y, además, que una cifra con los mismos caracteres no
       cambie de ancho al pedir la característica. Si el ancho ya es igual sin
       pedirlas, la fuente es tabular por defecto y tabular-nums es una red de
       seguridad, no el mecanismo. */
    const digitos = [tnum.unos.normal, tnum.ceros.normal, tnum.nueves.normal];
    const mismoAvance = Math.max(...digitos) - Math.min(...digitos) < 0.5;
    const caracteristicaNoOscila = Math.abs(tnum.unos.normal - tnum.unos.tabular) < 0.5;
    const anchoCifraReal = Math.abs(tnum.mixto.normal - tnum.mixto.tabular) < 0.5;

    return {
      importProbe,
      cargadas,
      plexDisponible: document.fonts.check('16px "Plex Medida"'),
      espanol: document.fonts.check('16px "Plex Medida"', 'ñáéíóú¿¡'),
      plex, respaldo, calc,
      derivados: { sizeAdjust: mediaPonderada('sizeAdjust'),
                   ascentOverride: mediaPonderada('ascentOverride'),
                   descentOverride: mediaPonderada('descentOverride'),
                   sizeAdjustSimple: media('sizeAdjust') },
      tnum,
      tnumSirve: mismoAvance && anchoCifraReal,
      tnumPorDefecto: mismoAvance && caracteristicaNoOscila,
      anchoPorDigito: digitos[0] / 8,
    };
  })()`, { awaitPromise: true });

  fs.unlinkSync(path.join(CSS_DIR, '_probe-import.css'));
  fs.unlinkSync(path.join(CSS_DIR, '_probe-entry.css'));
} finally {
  await sb.close();
}

console.log(JSON.stringify(out, null, 1));
console.log('\n--- @import sobre file:// ---');
console.log('resuelve :', out.importProbe.resuelve);
console.log('reglas   :', out.importProbe.hojaCargada);
console.log('\n--- respaldo de IBM Plex Sans ---');
console.log('size-adjust    :', out.derivados.sizeAdjust + '%  (simple ' + out.derivados.sizeAdjustSimple + '%)');
console.log('ascent-override:', out.derivados.ascentOverride + '%');
console.log('descent-override:', out.derivados.descentOverride + '%');
console.log('\n--- cifras tabulares ---');
console.log('mismo avance por digito:', out.tnumSirve, ' (ancho por digito: ' + out.anchoPorDigito + 'px a 100px)');
console.log('tabular por defecto   :', out.tnumPorDefecto,
  '— si es true, tabular-nums es la red de seguridad, no el mecanismo');
console.log(JSON.stringify(out.tnum));
console.log('\nfuente:', FONT);
console.log('fallos de red:', JSON.stringify(sb.failedRequests));
console.log('errores de consola:', JSON.stringify(sb.consoleErrors));