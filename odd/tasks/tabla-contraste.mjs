/* Genera las tablas de contraste de §CONTRASTE a partir del reporte medido.
 *
 * El bloque de numeros al pie de css/styles.css se escribia a mano y quedo
 * desfasado en mas de una tanda. Esto lo escribe desde el JSON de la sonda, asi
 * que no puede quedar viejo sin que se note en el diff.
 *
 * Uso: node odd\tasks\tabla-contraste.mjs odd\tasks\capturas\color-r3.report.json
 */
import fs from 'node:fs';

const src = process.argv[2] || 'odd/tasks/capturas/color-r3.report.json';
const r = JSON.parse(fs.readFileSync(src, 'utf8'));

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function tabla(rows, { conFallo = true } = {}) {
  const g = new Map();
  for (const x of rows) {
    const k = [x.ratio, x.min, x.px, x.fg, x.bg].join('|');
    if (!g.has(k)) {
      g.set(k, { ratio: x.ratio, min: x.min, px: x.px, w: x.w, fg: x.fg, bg: x.bg, n: 0, fail: 0, sel: x.sel, large: x.large });
    }
    const e = g.get(k);
    e.n++;
    if (!x.pass) e.fail++;
  }
  const out = [...g.values()].sort((a, b) => a.ratio - b.ratio);
  const anchos = { ratio: 8, min: 4, px: 6, w: 4, fg: 20, bg: 20, n: 5, fail: 5 };
  const head = '  ' + lpad('ratio', anchos.ratio) + ' ' + lpad('min', anchos.min) + ' '
    + lpad('px', anchos.px) + ' ' + lpad('peso', anchos.w) + '  ' + pad('foreground', anchos.fg)
    + pad('fondo', anchos.bg) + lpad('pares', anchos.n) + lpad('fallos', anchos.fail);
  const lines = [head, '  ' + '-'.repeat(head.length - 2)];
  for (const e of out) {
    lines.push('  ' + lpad(e.ratio.toFixed(2) + ':1', anchos.ratio) + ' ' + lpad(e.min, anchos.min) + ' '
      + lpad(e.px + 'px', anchos.px) + ' ' + lpad(e.w, anchos.w) + '  ' + pad(e.fg, anchos.fg)
      + pad(e.bg, anchos.bg) + lpad(e.n, anchos.n) + lpad(e.fail, anchos.fail)
      + (e.ratio === out[0].ratio && conFallo ? '   <- el mas bajo' : ''));
  }
  return { texto: lines.join('\n'), min: out[0] };
}

console.log('REPORTE: ' + src);
console.log('generado: ' + r.generado);
for (const tema of Object.keys(r.temas)) {
  const t = r.temas[tema];
  const todos = [...t.contrast, ...t.contrastConPagado, ...t.contrastPanel];
  const distintos = new Set(todos.map(x => [x.fg, x.bg, x.px, x.min].join('|'))).size;
  const fallos = todos.filter(x => !x.pass).length;
  console.log('\n############ TEMA ' + tema.toUpperCase() + ' ############');
  console.log(`pares de texto: ${todos.length} | combinaciones distintas: ${distintos} | fallos de AA: ${fallos}`);
  const a = tabla(t.contrast.concat(t.contrastConPagado));
  console.log('\n--- VISTA MENSUAL (incluye el estado pagado) ---');
  console.log(a.texto);
  const b = tabla(t.contrastPanel);
  console.log('\n--- CONSOLIDADO ---');
  console.log(b.texto);
  console.log(`\nEL MAS BAJO DE TODO EL TEMA: ${a.min.ratio}:1  (${a.min.fg} sobre ${a.min.bg}, ${a.min.px}px, min ${a.min.min})  ${a.min.sel}`);

  console.log('\n--- INDICADORES NO TEXTUALES (minimo 3:1) ---');
  const ind = t.accents.filter(x => x.min === 3);
  const filas = ind.map(x => ({ indicador: x.label.replace(/#\d+$/, ''), valor: x.value, fondo: x.bg, ratio: x.ratio.toFixed(2), veredicto: x.ratio >= 3 ? 'OK' : 'FALLA' }));
  console.table([...new Map(filas.map(f => [f.indicador + f.fondo, f])).values()]);

  console.log('\n--- SUPERFICIES TEÑIDAS (sin minimo: se miden con dE, ver tinte.mjs) ---');
  const sup = t.accents.filter(x => x.tipo === 'superficie');
  console.table([...new Map(sup.map(f => [f.label.replace(/#\d+$/, '') + f.value, f])).values()]
    .map(x => ({ superficie: x.label.replace(/#\d+$/, ''), valor: x.value, padre: x.bg, ratio_contra_padre: x.ratio })));
}

console.log('\n############ PROBLEMAS DETECTADOS ############');
if (!r.problemas.length) console.log('  ninguno');
for (const p of r.problemas) console.log('  ' + JSON.stringify(p));
