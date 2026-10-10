/* Funciones de medicion que se inyectan en la pagina.
 *
 * Se escriben aparte para poder versionarlas y para que el recorrido y la tabla
 * de contraste usen EXACTAMENTE el mismo criterio.
 *
 * TRAMPA QUE ESTE ARCHIVO EVITA: getComputedStyle(el).color ya viene resuelto a
 * "rgb(r, g, b)" o "rgba(r, g, b, a)", pero getPropertyValue('--x') sobre un
 * token declarado con color-mix() devuelve la CADENA LITERAL
 * ("color-mix(in srgb, ...)") y no un color. Comparar eso contra un color medido
 * da falsos positivos. Por eso el fondo se compone subiendo por los ancestros con
 * el background-color COMPUTADO de cada uno, que siempre es un color real, y
 * nunca leyendo el token crudo.
 */
export const PROBES = String.raw`
window.__audit = (function () {
  const srgb = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

  /* "rgb(1, 2, 3)" | "rgba(1, 2, 3, .5)" | "#0a0b0e" | "transparent" -> [r,g,b,a] */
  function parse(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    if (s === 'transparent') return [0, 0, 0, 0];
    let m;
    if ((m = s.match(/^rgba?\(([^)]+)\)$/))) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
      let h = m[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length === 6) h += 'ff';
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16),
              parseInt(h.slice(6,8),16) / 255];
    }
    return null;
  }
  const over = (fg, bg) => [0,1,2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])));

  /* Fondo real bajo el elemento: se sube por los ancestros componiendo alpha.
   * Se detiene en el primer fondo opaco. Si encuentra background-image (un
   * gradiente) lo reporta, porque ahi el color ya no es el fondo real. */
  function bgOf(el) {
    const capas = [];
    let gradiente = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') gradiente = cs.backgroundImage;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { capas.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i--) base = over(capas[i], base);
    return { rgb: base, gradiente, capas: capas.length };
  }

  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* Nodos con texto propio: un hijo de tipo texto con contenido no vacio.
   * Mirar textContent solo daria el texto de los descendientes y contaria
   * cada ancestro varias veces. */
  function tieneTextoPropio(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim().length) return true;
    }
    return false;
  }

  /* Recorre TODO texto visible de la pagina y mide el par real. */
  function contraste() {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: el => {
        if (!visible(el)) return NodeFilter.FILTER_REJECT;
        if (!tieneTextoPropio(el)) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let el;
    while ((el = walk.nextNode())) {
      const cs = getComputedStyle(el);
      const fg0 = parse(cs.color);
      if (!fg0) continue;
      const bg = bgOf(el);
      const fg = fg0[3] < 1 ? over(fg0, bg.rgb) : fg0.slice(0, 3);
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      /* WCAG 1.4.3: "large" >= 24px, o >= 18.66px con peso >= 700 */
      const grande = px >= 24 || (px >= 18.66 && weight >= 700);
      const min = grande ? 3 : 4.5;
      const r = ratio(fg, bg.rgb);
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);
      out.push({
        sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
             (el.className && typeof el.className === 'string'
               ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        texto: txt,
        fg: 'rgb(' + fg.map(Math.round).join(', ') + ')',
        bg: 'rgb(' + bg.rgb.join(', ') + ')',
        px, weight, min,
        ratio: Math.round(r * 100) / 100,
        cumple: r >= min,
        gradiente: bg.gradiente ? true : false,
      });
    }
    return out;
  }

  /* NO usa tokens: lee el color computado real de cada elemento marcado. Asi el
   * contraste de los acentos de categoria y de estado queda probado, no supuesto.
   * Para una marca (el tick de 2px) el color es el FONDO; para un texto es el
   * "color". Se decide por el alpha del fondo, no por adivinar. */
  function acentos() {
    const marca = el => {
      const cs = getComputedStyle(el);
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) return bg.slice(0, 3);
      const fg = parse(cs.color);
      return fg ? (fg[3] < 1 ? over(fg, [255, 255, 255]) : fg.slice(0, 3)) : null;
    };
    const medirMarca = (sel, bgSel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, falta: true };
      const c = marca(el);
      if (!c) return { sel, falta: true, razon: 'sin color computado' };
      const ref = bgSel ? bgOf(document.querySelector(bgSel)).rgb : bgOf(el).rgb;
      return {
        sel, esMarca: true,
        color: 'rgb(' + c.map(Math.round).join(', ') + ')',
        contra: 'rgb(' + ref.join(', ') + ')',
        ratio: Math.round(ratio(c, ref) * 100) / 100,
      };
    };
    const medirTexto = sel => {
      const el = document.querySelector(sel);
      if (!el) return { sel, falta: true };
      const cs = getComputedStyle(el);
      const c = marca(el);
      const bg = bgOf(el).rgb;
      return {
        sel, esMarca: false,
        color: 'rgb(' + c.map(Math.round).join(', ') + ')',
        contra: 'rgb(' + bg.join(', ') + ')',
        ratio: Math.round(ratio(c, bg) * 100) / 100,
        px: parseFloat(cs.fontSize), texto: (el.textContent || '').trim().slice(0, 24),
      };
    };
    const cat = [];
    for (const k of ['servicios', 'personales', 'movimientos', 'extras', 'matrix', 'trend', 'categories']) {
      /* T5: el tick de acento vive en el encabezado del grupo del libro, así que
       * la superficie de referencia pasa de .content-card-box a .ledger-group.
       * El VALOR medido no cambia: en ambos casos el ancla es el primer grupo
       * teñido de la vista mensual, que es Servicios.
       *
       * Y eso es un defecto que NO se arregla aquí, para que conste: para
       * matrix, trend y categories el tick se está comparando contra el tinte
       * de Servicios, que no es la superficie donde está pintado. La corrección
       * sería anclar en [data-accent="k"], y cambia los números reportados de
       * contraste —que es justo lo que hay que revisar antes de tocarlo—.
       * Queda fuera de T5 y anotado acá para que no se pierda. */
      cat.push(medirMarca('[data-accent="' + k + '"] .cat-tick', '.ledger-group'));
    }
    /* Los acentos de estado los escribe app.js como var(--text-emerald) inline
     * (app.js:424/427/430 y 550), asi que hay que leerlos del elemento. */
    const est = [
      medirTexto('#topbarBalanceValue'),
      medirTexto('#monthBalanceNeto'),
      medirTexto('.notes-smart-box > *:last-child'),
      medirMarca('.payments-fill', '.ledger-strip'),
      medirMarca('.matrix-progress-fill', '.matrix-section'),
      medirMarca('.month-pill-btn.active', '.period-track'),
    ].filter(x => !x.falta);
    return { categorias: cat, estado: est };
  }

  /* Foco: se enfoca DE VERDAD y se lee el getComputedStyle en ese momento.
   * :focus-visible no matchea un foco programatico en un <button> (comportamiento
   * del navegador, no del CSS), asi que el recorrido de teclado va aparte con Tab
   * real por Input.dispatchKeyEvent. */
  function foco(ids) {
    const out = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { out.push({ id, falta: true }); continue; }
      /* Un control con display:none (el boton de limpiar busqueda nace asi) no
       * es enfocable: focus() no hace nada y el resultado "sin anillo" seria un
       * falso positivo. Se reporta como oculto y se mide aparte. */
      const antes = getComputedStyle(el);
      if (antes.display === 'none' || antes.visibility === 'hidden') {
        out.push({ id, oculto: true, razon: 'display:' + antes.display });
        continue;
      }
      el.focus();
      const focused = document.activeElement === el;
      const cs = getComputedStyle(el);
      /* si el anillo esta en un ancestro con :focus-within, se busca hacia arriba */
      let caja = el, anillo = null, portador = null;
      while (caja && caja !== document.body) {
        const s = getComputedStyle(caja);
        if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) {
          anillo = s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor;
          portador = caja.id ? '#' + caja.id : String(caja.className).trim().split(/\s+/)[0];
          break;
        }
        caja = caja.parentElement;
      }
      out.push({
        id, enfocado: focused,
        outlinePropio: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
        focusVisible: el.matches(':focus-visible'),
        focus: el.matches(':focus'),
        anillo: anillo || 'NINGUNO',
        portador: portador,
        offset: anillo ? getComputedStyle(caja).outlineOffset : null,
      });
      el.blur();
    }
    return out;
  }

  /* Anillo con TECLAS TAB reales: es lo que un usuario de teclado hace de verdad. */
  function focoTeclado(max) {
    const vistos = [];
    const activos = [];
    document.body.focus();
    let n = 0;
    while (n < (max || 60)) {
      n++;
      const el = document.activeElement;
      if (!el || el === document.body) break;
      const cs = getComputedStyle(el);
      const key = el.tagName + '|' + (el.id || '') + '|' + (typeof el.className === 'string' ? el.className : '');
      if (!activos.includes(key)) {
        activos.push(key);
        let caja = el, anillo = null;
        while (caja && caja !== document.body) {
          const s = getComputedStyle(caja);
          if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) {
            anillo = s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor;
            break;
          }
          caja = caja.parentElement;
        }
        vistos.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          clase: (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0] || null,
          focusVisible: el.matches(':focus-visible'),
          anillo: anillo || 'NINGUNO',
        });
      }
    }
    return vistos;
  }

  /* Lienzo: cuenta de pixeles pintados y LISTA los colores que aparecen. Un
   * grafico que se dibuja invisible sobre claro tiene miles de pixeles no vacios
   * y sin embargo no se ve nada, asi que el conteo solo no alcanza: hay que ver
   * que colores hay y cuantos de cada uno. */
  function canvas() {
    const out = [];
    for (const c of document.querySelectorAll('canvas')) {
      if (!visible(c)) { out.push({ id: c.id, visible: false }); continue; }
      const r = c.getBoundingClientRect();
      const bg = bgOf(c).rgb.join(',');
      let pintados = 0, sampleados = 0;
      const cuenta = new Map();
      let error = null;
      try {
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 16) {
          sampleados++;
          const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
          cuenta.set(k, (cuenta.get(k) || 0) + 1);
          if (k !== bg) pintados++;
        }
      } catch (e) { error = String(e); }
      const colores = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, n]) => 'rgb(' + k.split(',').join(', ') + ') x' + n);
      out.push({
        id: c.id, visible: true,
        cssW: Math.round(r.width), cssH: Math.round(r.height),
        backing: c.width + 'x' + c.height,
        fondoSeccion: 'rgb(' + bg.split(',').join(', ') + ')',
        pintados, sampleados, error,
        coloresDistintos: cuenta.size,
        colores,
      });
    }
    return out;
  }

  /* Overflow horizontal: hay que medir el documento Y cualquier contenedor con
   * scroll propio, porque la pagina scrollea adentro. */
  function overflow() {
    const de = document.documentElement;
    const anchos = {
      innerWidth: window.innerWidth,
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      bodyScrollW: document.body.scrollWidth,
    };
    const culpables = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1) {
        culpables.push({
          sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
               (typeof el.className === 'string' && el.className
                 ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : ''),
          right: Math.round(r.right), width: Math.round(r.width),
        });
      }
    }
    return { ...anchos, desborda: de.scrollWidth > de.clientWidth + 1, culpables: culpables.slice(0, 12) };
  }

  /* Digitos y meses DENTRO del rail: el rail es navegacion y nada mas. */
  function rail() {
    const rail = document.querySelector('#appSidebar') || document.querySelector('.app-sidebar');
    if (!rail) return { falta: true };
    const texto = rail.innerText || '';
    const cs = getComputedStyle(rail);
    const scrollers = [...rail.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1;
    }).map(e => (e.id ? '#' + e.id : '.' + String(e.className).split(/\s+/)[0]) +
      ' ' + e.scrollHeight + '/' + e.clientHeight);
    return {
      scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight,
      cumple: rail.scrollHeight <= rail.clientHeight,
      overflowY: cs.overflowY,
      digitos: (texto.match(/\d/g) || []).length,
      meses: (rail.querySelectorAll('.month-pill-btn').length),
      scrollersInternos: scrollers,
    };
  }

  /* prefers-reduced-motion leido del navegador, no del archivo. */
  function movimiento() {
    const props = ['.sidebar-nav-tab', '.command-search-input', '.neo-toast', '.modal-sheet', '.expense-card-item'];
    const out = {};
    for (const s of props) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out[s] = { transition: cs.transitionDuration, animation: cs.animationDuration };
    }
    return out;
  }

  return { contraste, acentos, foco, focoTeclado, canvas, overflow, rail, movimiento, parse, ratio, lum, bgOf };
})();
'ok'
`;