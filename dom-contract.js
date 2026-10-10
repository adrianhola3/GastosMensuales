#!/usr/bin/env node
/**
 * dom-contract.js - Extract the DOM contract that js/app.js depends on.
 *
 *   node dom-contract.js <app.js> <salida.txt> [--diff <snapshot.txt>]
 *
 * Sources scanned (this is the point the previous extractor missed):
 *   1. getElementById('x')
 *   2. querySelector/querySelectorAll('...')  -> #id and .class inside the selector
 *   3. classList.add/remove/toggle/contains('x')
 *   4. className = '...'
 *   5. getAttribute('data-x')
 *   6. class="..." inside template literals   <-- where app.js rewrites the DOM
 *   7. classList.toggle(cond, 'x') second arg
 *
 * `${...}` interpolations are reported separately as <interpolated> so a dynamic
 * expression is never mistaken for a literal id/class.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , src, out, ...rest] = process.argv;
if (!src) { console.error('uso: node dom-contract.js <app.js> <salida.txt>'); process.exit(1); }
const code = readFileSync(src, 'utf8');

const ids = new Set(), classes = new Set(), attrs = new Set();
const add = (set, v) => { if (v && !/[\s'"`$]/.test(v)) set.add(v); };

// 1. getElementById
for (const m of code.matchAll(/getElementById\(\s*['"`]([^'"`$]+)['"`]\s*\)/g)) add(ids, m[1]);

// 2. querySelector(All) -> extract #id and .class from the selector string
for (const m of code.matchAll(/querySelector(?:All)?\(\s*['"`]([^'"`]*)['"`]/g)) {
  for (const t of m[1].matchAll(/([#.])[\w-]+/g)) {
    if (t[1] === '#') add(ids, t[0].slice(1));
    else add(classes, t[0].slice(1));
  }
}

// 3. classList.<method>('x')
for (const m of code.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*['"`]([^'"`$]+)['"`]/g)) add(classes, m[1]);

// 4. className = 'a b c'
for (const m of code.matchAll(/className\s*=\s*['"`]([^'"`$]*)['"`]/g))
  for (const c of m[1].split(/\s+/)) add(classes, c);

// 5. getAttribute('data-x')
for (const m of code.matchAll(/getAttribute\(\s*['"`]([^'"`$]+)['"`]/g)) add(attrs, m[1]);

// 6. class="..." anywhere (index.html-style markup inside templates).
//    El valor puede llevar interpolaciones (`${cond ? 'a' : 'b'}`): se captura
//    hasta la comilla de cierre y despues se descartan los tokens con ${}.
for (const m of code.matchAll(/\bclass=\\?["']([^"'<>]*?)["']/g)) {
  const literal = m[1].replace(/\$\{[\s\S]*$/, '');
  for (const c of literal.split(/\s+/)) {
    if (c && !/[${}]/.test(c)) classes.add(c);
  }
}

// 7. data-* attributes appearing in markup or selectors
for (const m of code.matchAll(/\bdata-[a-z-]+/g)) add(attrs, m[0]);

const has = /\$\{|<%|\+\s*[a-zA-Z_$]/;
const filterDynamic = s => [...s].filter(v => !has.test(v)).sort();
const IDS = filterDynamic(ids), CLS = filterDynamic(classes), ATT = [...attrs].sort();

const lines = [
  '# Snapshot del contrato DOM',
  `# Generado con: node dom-contract.js ${src} ${out || ''}`,
  '# Origen: solo js/app.js. Comandos cubiertos: getElementById, querySelector(All),',
  '# classList.*, className =, getAttribute, y class="..." de las plantillas innerHTML.',
  '',
  `[IDS] count=${IDS.length}`,
  ...IDS,
  '',
  `[CLASSES] count=${CLS.length}`,
  ...CLS,
  '',
  `[ATRIBUTOS] count=${ATT.length}`,
  ...ATT,
  '',
  `[TOTAL] ids=${IDS.length} classes=${CLS.length} atributos=${ATT.length} suma=${IDS.length + CLS.length + ATT.length}`,
  '',
];

if (out) writeFileSync(out, lines.join('\n'));
console.log(lines.slice(4).join('\n').trim());

// --diff
const di = rest.indexOf('--diff');
if (di >= 0 && rest[di + 1]) {
  const snap = readFileSync(rest[di + 1], 'utf8');
  const parse = txt => {
    const acc = {}; let cur = null;
    for (const l of txt.split(/\r?\n/)) {
      const h = l.match(/^\[(IDS|CLASSES|ATRIBUTOS)\] count=(\d+)/);
      if (h) { cur = h[1]; acc[cur] = []; continue; }
      if (/^\[TOTAL\]/.test(l)) { cur = null; continue; }
      if (cur && l.trim()) acc[cur].push(l.trim());
    }
    return acc;
  };
  const a = parse(snap), b = { IDS, CLASSES: CLS, ATRIBUTOS: ATT };
  let lost = 0, added = 0;
  for (const k of ['IDS', 'CLASSES', 'ATRIBUTOS']) {
    const A = a[k] || [], B = b[k] || [];
    const gone = A.filter(x => !B.includes(x));
    const newOnes = B.filter(x => !A.includes(x));
    lost += gone.length; added += newOnes.length;
    console.log(`\n[${k}] antes=${A.length} ahora=${B.length} perdidos=${gone.length} nuevos=${newOnes.length}`);
    if (gone.length) console.log('  PERDIDOS: ' + gone.join(', '));
    if (newOnes.length) console.log('  NUEVOS:   ' + newOnes.join(', '));
  }
  console.log(`\nCONTRATO DOM: ${lost} perdidos, ${added} nuevos`);
}