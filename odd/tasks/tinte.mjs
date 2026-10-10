/* Calculadora del punto de mezcla de los tintes de categoría.
 *
 * Responde tres preguntas que una captura no contesta:
 *
 *  1. ¿CUÁNTO TINTE SE PUEDE PONER sin romper AA? El techo lo pone el texto más
 *     flojo que cae sobre la superficie teñida: `--text-muted` de 11px, que en
 *     blanco mide 5.50:1. Se barre el porcentaje y se para en el primer fallo.
 *
 *  2. ¿SE DISTINGUEN LAS CUATRO CATEGORÍAS ENTRE SÍ? Esto es lo que el usuario
 *     pidió de verdad ("no hay distinción de colores"), y NO es lo mismo que
 *     distinguirse del blanco. Con 8% los cuatro tintes medían 1.01:1 entre sí:
 *     cuatro colores que en pantalla son el mismo. Se mide el par MÁS CERCANO.
 *
 *  3. ¿CÓMO LE QUEDA EL TINTE A CADA FAMILIA DE TEXTO que realmente aparece
 *     encima? No es una comprobación teórica: la lista sale de los selectores
 *     que la sonda encontró en pantalla.
 *
 * Todo en sRGB con la misma aritmética de WCAG que usa la sonda del navegador
 * (`odd/tasks/color-probe.mjs`), para que los dos digan lo mismo.
 */

const hex = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgbStr = (c) => `rgb(${c.map(Math.round).join(', ')})`;
const mix = (a, b, p) => a.map((v, i) => v * (p / 100) + b[i] * (1 - p / 100));
/* Composición alfa REAL de un tinte `color-mix(<color> P%, transparent)`:
   el color entra con alfa P/100 y se MEZCLA sobre lo que haya debajo.
   OJO: no es `mix(color, negro, P%)` — dilution y composición alfa son cosas
   distintas, y confundirlas dio un 4.53:1 optimista donde el navegador midió
   3.89:1. Se comprobó contra el navegador: con 12% de #1f7a52 sobre el tinte de
   servicios rgb(234,238,240) esta función da rgb(210,224,221), que es
   exactamente el valor que devolvió `getComputedStyle`. */
const alphaOver = (fg, p, bg) => fg.map((v, i) => (v * p) / 100 + bg[i] * (1 - p / 100));
const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/* --- PERCEPCIÓN: POR QUÉ EL RATIO DE WCAG NO SIRVE PARA DISTINGUIR CATEGORÍAS
 *
 * Los cuatro acentos están calibrados A PROPÓSITO a la misma luminancia WCAG
 * (0.146), y eso es lo que hace que se lean como familia en lugar de arcoíris.
 * La consecuencia directa es que mezclar los cuatro con la misma superficie al
 * mismo porcentaje produce cuatro tintes de luminancia IGUAL, y el ratio de
 * WCAG —que solo mira la luminancia— los reporta a 1.000:1 siempre, al 6% y al
 * 24%. Ese 1.000 no dice "son el mismo color": dice "esta métrica no ve el hue".
 *
 * Para la pregunta que el usuario está haciendo ("no hay distinción de colores")
 * hay que medir en un espacio perceptual. Se usa OKLab: es perceptualmente
 * uniforme, es el que usa CSS Color 4, y su deltaey es directamente
 * interpretable como "cuánto se nota el cambio de color".
 *
 * Escala de referencia de ΔE OKLab (JONY HEISSER, "OKLab: color conversion for
 * CSS", una de las fuentes de la especificación CSS Color 4):
 *     < 0.02  diferencia invisible, ni buscando
 *     ~ 0.03  apenas perceptible
 *     ~ 0.10  diferencia visible de plano
 *     ~ 0.30  diferencia fuerte, dos colores claramente distintos
 *   SOURCE: https://bottosson.github.io/posts/oklab/
 */
const srgbToLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const oklab = (c) => {
  const r = srgbToLinear(c[0]), g = srgbToLinear(c[1]), b = srgbToLinear(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};
const deltaE = (a, b) => {
  const A = oklab(a), B = oklab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};

/* ---- los dos temas, tal como están en css/styles.css ---- */
const TEMAS = {
  claro: {
    surface: hex('#ffffff'),
    cats: {
      servicios: hex('#506e82'),
      personales: hex('#786197'),
      movimientos: hex('#4a745d'),
      extras: hex('#7c6849'),
    },
    texto: {
      main: hex('#1d1d1f'),
      secondary: hex('#5b5f67'),
      muted: hex('#656972'),
      emerald: hex('#1f7a52'),
    },
  },
  oscuro: {
    surface: hex('#0f1015'),
    cats: {
      servicios: hex('#93acbd'),
      personales: hex('#a99bbf'),
      movimientos: hex('#8fb7a3'),
      extras: hex('#c3b398'),
    },
    texto: {
      main: hex('#f1f2f4'),
      secondary: hex('#a9afbd'),
      muted: hex('#8c93a1'),
      emerald: hex('#98c6b1'),
    },
  },
};

/* Texto que la sonda encontró REALMENTE encima de una sección teñida.
   `px` importa: WCAG pide 4.5:1 hasta 24px y 3:1 después. */
const SOBRE_TINTE = [
  { sel: '.expense-item-amount', tok: 'main', px: 15, nota: 'importe de la fila' },
  /* T5: el título del grupo, su cifra y su conteo son lo que quedó sobre el
   * tinte. Se fueron el subtotal de colección, la descripción de la sección y
   * el subhead fijo/variable: eran las tres cosas que T5 quitó del libro, y
   * dejarlas en la tabla haría que esta sonda midiera contraste de nodos que ya
   * no existen. */
  { sel: '.ledger-group-name', tok: 'main', px: 17, nota: 'titulo de grupo' },
  { sel: '.ledger-group-subtotal', tok: 'main', px: 20, nota: 'cifra del grupo' },
  { sel: '.ledger-group-count', tok: 'muted', px: 13, nota: 'conteo de filas' },
  { sel: '.feed-filter-pill', tok: 'secondary', px: 13, nota: 'filtro del feed' },
  { sel: '.empty-feed-placeholder', tok: 'muted', px: 14, nota: 'estado vacio' },
  { sel: '.btn-status-toggle.status-pendiente', tok: 'secondary', px: 12, nota: 'estado pendiente' },
  { sel: '.tag-badge', tok: 'muted', px: 11, nota: 'etiqueta Fijo/Variable' },
  { sel: '.btn-status-toggle.status-pagado', tok: 'emerald', px: 12, nota: 'estado pagado' },
];

const NOMBRES = ['servicios', 'personales', 'movimientos', 'extras'];
const PCTS = [6, 8, 10, 12, 14, 16, 18, 20, 24];

for (const [nombreTema, T] of Object.entries(TEMAS)) {
  console.log('\n' + '='.repeat(78));
  console.log('TEMA ' + nombreTema.toUpperCase() + '   superficie ' + rgbStr(T.surface));
  console.log('='.repeat(78));

  console.log('\n--- 1 y 2: TEÑO, DIFERENCIA CON LA SUPERFICIE Y ENTRE LAS CUATRO ---');
  console.log('%mix | ' + NOMBRES.map(n => n.slice(0, 9).padEnd(10)).join('') + ' | dE vs super | dE PAR MAS CERCANO | WCAG par | texto mas flojo');
  for (const p of PCTS) {
    const w = {};
    for (const n of NOMBRES) w[n] = mix(T.cats[n], T.surface, p);

    let peorPar = { r: Infinity, a: '', b: '' };
    for (let i = 0; i < NOMBRES.length; i++) {
      for (let j = i + 1; j < NOMBRES.length; j++) {
        const r = deltaE(w[NOMBRES[i]], w[NOMBRES[j]]);
        if (r < peorPar.r) peorPar = { r, a: NOMBRES[i], b: NOMBRES[j] };
      }
    }

    let flojo = { r: Infinity };
    for (const item of SOBRE_TINTE) {
      const min = item.px >= 24 ? 3 : 4.5;
      for (const n of NOMBRES) {
        const r = ratio(T.texto[item.tok], w[n]);
        if (r < flojo.r) flojo = { r, n, sel: item.sel, px: item.px, min };
      }
    }

    // El fondo REAL del boton de estado es el tinte de estado compuesto SOBRE el
    // tinte de categoria, no el tinte de categoria solo. Se compone aqui con
    // composicion alfa de verdad para no medir un fondo que no existe.
    const PCT_WASH = 12;
    const realPagado = NOMBRES.map(n => alphaOver(T.texto.emerald, PCT_WASH, w[n]));
    let flojoReal = Infinity, selReal = '';
    for (const item of SOBRE_TINTE) {
      if (item.tok !== 'emerald') continue;
      for (const bg of realPagado) {
        const r = ratio(T.texto.emerald, bg);
        if (r < flojoReal) { flojoReal = r; selReal = item.sel; }
      }
    }
    if (flojoReal < flojo.r) flojo = { r: flojoReal, sel: selReal + ' (FONDO REAL)', px: 12, min: 4.5 };

    const dESuper = Math.min(...NOMBRES.map(n => deltaE(w[n], T.surface)));
    const wCagPar = ratio(w[peorPar.a], w[peorPar.b]);
    const ok = flojo.r >= flojo.min;
    console.log(
      String(p).padStart(4) + '  | ' +
      NOMBRES.map(n => rgbStr(w[n]).replace(/rgb\(|\)/g, '').padEnd(10)).join('') +
      ' | ' + dESuper.toFixed(4).padStart(9) + '  | ' +
      peorPar.r.toFixed(4) + ' (' + peorPar.a.slice(0, 4) + '/' + peorPar.b.slice(0, 4) + ')' +
      ' | ' + wCagPar.toFixed(3) +
      ' | ' + flojo.r.toFixed(2) + ' ' + flojo.sel + ' ' + flojo.px + 'px min' + flojo.min +
      (ok ? '  OK' : '  <<< FALLA')
    );
  }

  console.log('\n--- 3: CADA FAMILIA DE TEXTO SOBRE EL TINTE, al % elegido ---');
  const elegido = Number(process.argv[2] || 12);
  console.log('punto de mezcla = ' + elegido + '%');
  const w = {};
  for (const n of NOMBRES) w[n] = mix(T.cats[n], T.surface, elegido);
  const filas = [];
  for (const item of SOBRE_TINTE) {
    const min = item.px >= 24 ? 3 : 4.5;
    const porCat = NOMBRES.map(n => ratio(T.texto[item.tok], w[n]));
    const peor = Math.min(...porCat);
    filas.push({
      selector: item.sel, px: item.px, min,
      token: '--text-' + item.tok,
      ...Object.fromEntries(NOMBRES.map((n, i) => [n, porCat[i].toFixed(2)])),
      mas_bajo: peor.toFixed(2),
      veredicto: peor >= min - 0.005 ? 'SI' : 'NO',
      nota: item.nota,
    });
  }
  console.table(filas);

  console.log('\n--- 4: el tick de 2px (indicador no textual, minimo 3:1) sobre su tinte ---');
  for (const n of NOMBRES) {
    const r = ratio(T.cats[n], w[n]);
    console.log('  ' + n.padEnd(12) + ' acento ' + rgbStr(T.cats[n]) + ' sobre tinte ' + rgbStr(w[n]) + ' = ' + r.toFixed(2) + ':1  ' + (r >= 3 ? 'OK' : 'FALLA'));
  }

  /* ---- 5: EL VERDE DE "PAGADO" NECESITA SU PROPIO TOKEN ----
   *
   * `--text-emerald` esta calibrado para superficies BLANCAS: sobre blanco mide
   * 5.30:1. Pero el boton "Pagado" no vive sobre blanco, vive sobre el tinte de
   * seccion (12% de acento) con un tinte de estado verde encima. El navegador
   * midio 3.89:1 ahi, por debajo del 4.5:1 que exige la consigna para texto
   * normal de 12px.
   *
   * Y no hay arreglo bajando el tinte de estado: con el verde al 0% ya se mide
   * 4.53:1, o sea que el margen para cualquier tinte verde encima es
   * practicamente cero. La unica salida es un verde MAS OSCURO, del mismo hue,
   * solo para este estado.
   *
   * Se busca el punto exacto: el verde de mayor luminosidad que todavia da
   * 4.6:1 (un margen, no un raspado) contra el PEOR fondo real posible, que es
   * el tinte de estado al 12% sobre la categoria cuyo tinte queda mas oscuro. */
  console.log('\n--- 5: TOKEN --text-pagado, verde del mismo hue para el estado pagado ---');
  const peorFondo = (() => {
    let peor = null;
    for (const n of NOMBRES) {
      const bg = alphaOver(T.texto.emerald, Number(process.argv[3] || 12), w[n]);
      if (!peor || lum(bg) < lum(peor.bg)) peor = { n, bg };
    }
    return peor;
  })();
  const objetivo = 4.6;
  // Se recorre el verde de partida hacia el negro en pasos de 0.2 y se queda con
  // el primero que llega al objetivo. Es una busqueda por luminancia, no un
  // hex inventado: el hue se mantiene porque los tres canales se escalan juntos.
  const base = T.texto.emerald;
  let sol = null;
  for (let k = 100; k >= 40; k -= 0.2) {
    const cand = base.map(v => v * k / 100);
    if (ratio(cand, peorFondo.bg) >= objetivo) { sol = { k, cand }; break; }
  }
  const aHex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  if (sol) {
    console.log('  verde base de la familia  ' + rgbStr(base) + '  (--text-emerald del tema)');
    console.log('  peor fondo real posible   ' + rgbStr(peorFondo.bg) + '  (categoria ' + peorFondo.n + ', tinte de estado ' + (process.argv[3] || 12) + '%)');
    console.log('  factor sobre el base      ' + sol.k.toFixed(1) + '%');
    console.log('  --> --text-pagado: ' + aHex(sol.cand) + '  = ' + rgbStr(sol.cand));
    console.log('  contraste contra el peor fondo: ' + ratio(sol.cand, peorFondo.bg).toFixed(2) + ':1   (objetivo ' + objetivo + ':1)');
    console.log('  y contra los cuatro fondos:');
    for (const n of NOMBRES) {
      const bg = alphaOver(T.texto.emerald, Number(process.argv[3] || 12), w[n]);
      const r = ratio(sol.cand, bg);
      console.log('    ' + n.padEnd(12) + rgbStr(bg) + '  ' + r.toFixed(2) + ':1  ' + (r >= 4.5 ? 'OK' : 'FALLA'));
    }
  }
}
