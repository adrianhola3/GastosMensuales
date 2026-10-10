/* Sonda de medicion para la feature color-espacio-tipografia.
 *
 * Reusa `cdp.mjs`, que ya esta escrito contra las trampas reales de este
 * entorno (target sin background, cache desactivada, captura solo del viewport,
 * Target.closeTarget en finally).
 *
 * Lo que mide, y por qué cada cosa:
 *   - CONTRASTE: resuelve el `color` COMPUTADO de cada elemento con texto y
 *     compone el fondo REAL subiendo por los ancestros e ignorando los alpha 0.
 *     `rgba(0,0,0,0)` parsea como [0,0,0]: sin el filtro de alpha reporta
 *     cientos de fallos falsos.
 *   - ESPACIO: alto del rail y cuanto de el ocupa el contenido, separaciones
 *     verticales entre secciones, y cuantas filas de gasto entran en 900px.
 *   - TIPOGRAFIA: familia computada, y el ancho de una muestra de texto con la
 *     familia nueva y con la de respaldo, que es lo que define el salto de
 *     layout al hacer el swap.
 *   - CLS: PerformanceObserver de layout-shift durante la carga, con la cache
 *     desactivada para que la fuente venga de la red y no del disco.
 */
import fs from 'node:fs';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const HIDE_EXTRA = `
  (() => {
    const s = document.createElement('style');
    s.id = 'probe-hide-extra';
    s.textContent = '#sidebarBackdrop{display:none !important}';
    document.head.appendChild(s);
    return true;
  })()
`;

/* ------------------------------------------------------------------ */
/* Instrumentacion de CLS: se instala ANTES de navegar                */
/* ------------------------------------------------------------------ */
const CLS_PROBE = `
  (() => {
    window.__cls = { value: 0, entries: [] };
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls.value += e.value;
          window.__cls.entries.push({
            value: Number(e.value.toFixed(5)),
            t: Math.round(e.startTime),
            sources: (e.sources || []).map(s => ({
              node: s.node ? (s.node.nodeName + '.' + (s.node.className || '')) : '?',
              prev: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
              cur: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (err) { window.__cls.error = String(err); }
    return true;
  })()
`;

/* ------------------------------------------------------------------ */
/* Funciones que se ejecutan dentro de la pagina                       */
/* ------------------------------------------------------------------ */

const PROBE_FN = `
window.__probe = (() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };

  const parseColor = (str) => {
    if (!str) return null;
    const s = String(str).trim();
    let m = s.match(/^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s]+\\/?([\\d.%]+))?\\s*\\)$/i);
    if (m) return [ +m[1], +m[2], +m[3], m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4])/100 : parseFloat(m[4])) ];
    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
      if (h.length === 6) h += 'ff';
      if (h.length !== 8) return null;
      return [ parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)/255 ];
    }
    // color(srgb ...) no debería aparecer en getComputedStyle, pero por si acaso
    m = s.match(/^color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\s*\\)$/i);
    if (m) return [ +m[1]*255, +m[2]*255, +m[3]*255, m[4]===undefined?1:+m[4] ];
    /* Chrome devuelve OKLAB, no sRGB, para un color INTERPOLADO. Aparece cuando
     * se lee getComputedStyle en mitad de una transicion: el valor interpolado
     * no tiene un color sRGB fijo que devolver. Antes de saber esto, un
     * parseColor que no lo conociera devolvia null y la fila se descartaba en
     * silencio — que es peor que un numero feo, porque parece que no hay nada.
     * Se convierte a sRGB con la matriz inversa de OKLab. */
    m = s.match(/^oklab\\(\\s*([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)(?:\\s*\\/\\s*([\\d.]+))?\\s*\\)$/i);
    if (m) {
      const L = +m[1], A = +m[2], B = +m[3], al = m[4] === undefined ? 1 : +m[4];
      const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
      const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
      const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
      const l = l_*l_*l_, mm = m_*m_*m_, ss = s_*s_*s_;
      const lin = [
        +4.0767416621*l - 3.3077115913*mm + 0.2309699292*ss,
        -1.2684380046*l + 2.6097574011*mm - 0.3413193965*ss,
        -0.0041960863*l - 0.7034186147*mm + 1.7076147010*ss,
      ];
      const enc = lin.map(v => {
        v = v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(Math.max(v,0), 1/2.4) - 0.055;
        return Math.min(255, Math.max(0, v*255));
      });
      return [enc[0], enc[1], enc[2], al];
    }
    return null;
  };

  const over = (fg, bg) => {
    const a = fg[3];
    return [ fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1 ];
  };

  const lum = (c) => {
    const f = v => { v /= 255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]);
  };

  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  };

  // Fondo REAL: sube por los ancestros componiendo los background-color con
  // alpha. Los alpha 0 NO son negro: se saltan.
  const realBg = (el) => {
    let stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const bc = parseColor(cs.backgroundColor);
      if (bc && bc[3] > 0) {
        stack.push(bc);
        if (bc[3] >= 1) break;
      }
      node = node.parentElement;
    }
    let base = [255,255,255,1];
    if (document.documentElement.classList.contains('theme-dark')) base = [10,11,14,1];
    let acc = base;
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // oculto por un ancestro con display:none ya se cubre arriba; falta el clipping
    let p = el.parentElement;
    while (p && p.nodeType === 1) {
      const pcs = getComputedStyle(p);
      if (pcs.display === 'none') return false;
      p = p.parentElement;
    }
    return true;
  };

  const ownText = (el) => {
    let out = '';
    for (const n of el.childNodes) if (n.nodeType === 3) out += n.nodeValue;
    return out.trim();
  };

  // ---- contraste de todo texto visible ----
  const contrast = () => {
    const rows = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      const txt = t.nodeValue.trim();
      if (!txt) continue;
      const el = t.parentElement;
      if (!el) continue;
      if (el.closest('#modalSessionRoleSelect')) continue;
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const fgRaw = parseColor(cs.color);
      if (!fgRaw) continue;
      const bg = realBg(el);
      const fg = fgRaw[3] < 1 ? over(fgRaw, bg) : fgRaw;
      const px = parseFloat(cs.fontSize);
      const w = parseInt(cs.fontWeight, 10) || 400;
      const isLarge = px >= 24 || (px >= 18.66 && w >= 700);
      const min = isLarge ? 3 : 4.5;
      const r = ratio(fg, bg);
      const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
      const key = cs.color + '|' + [bg[0],bg[1],bg[2]].join(',') + '|' + px + '|' + w;
      const path = (() => {
        const bits = [];
        let n = el;
        while (n && n.nodeType === 1 && bits.length < 5) {
          bits.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
          n = n.parentElement;
        }
        return bits.join('>');
      })();
      rows.push({
        path, sel, sample: txt.slice(0, 40),
        fg: 'rgb(' + fg.slice(0,3).map(Math.round).join(', ') + ')',
        fgRaw: cs.color,
        bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')',
        bgRaw: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')',
        px, w, min, ratio: Number(r.toFixed(2)),
        pass: r >= min - 0.005,
        large: isLarge,
      });
      seen.add(key);
    }
    return rows;
  };

  // ---- acentos no textuales leidos del elemento real ----
  /* ---- acentos no textuales y superficies teñidas ----
   *
   * Son dos cosas DISTINTAS y con mínimos DISTINTOS, y confundirlas produce
   * cientos de falsos positivos:
   *
   *   - INDICADOR: algo que hay que poder VER para entender la interfaz (el tick
   *     de 2px, el anillo de foco, el relleno de una barra de progreso). WCAG
   *     1.4.11 le pide 3:1 contra el fondo. Se cumple conzo.
   *   - SUPERFICIE: un tinte de fondo. NO tiene mínimo de contraste: por
   *     definición tiene que ser casi igual a la superficie, y si se acercara al
   *     3:1 dejaría de ser un tinte. Lo que se mide es si se DISTINGUE, y eso no
   *     es un ratio de WCAG sino un ΔE en OKLab — lo mide odd/tasks/tinte.mjs.
   *
   * El texto que va ENCIMA de esas superficies sí tiene mínimo, y ese lo mide
   * contrast(), componiendo el alpha. */
  const accents = () => {
    const out = [];
    const probe = (label, sel, tipo) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (!visible(el)) return;
        const cs = getComputedStyle(el);
        const c = parseColor(cs.backgroundColor);
        if (!c || c[3] === 0) return;
        const bg = realBg(el.parentElement || el);
        const fg = c[3] < 1 ? over(c, bg) : c;
        out.push({
          label: label + (document.querySelectorAll(sel).length > 1 ? '#' + (i+1) : ''),
          sel, tipo,
          value: cs.backgroundColor,
          bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')',
          ratio: Number(ratio(fg, bg).toFixed(2)),
          min: tipo === 'indicador' ? 3 : null,
        });
      });
    };
    probe('cat-tick', '.cat-tick', 'indicador');
    probe('cat-wash', '[data-segment-card][data-accent]', 'superficie');
    probe('state-pagado', '.status-pagado', 'superficie');
    probe('state-pendiente', '.status-pendiente', 'superficie');
    probe('matrix-th-servicios', '.matrix-table th:nth-child(2)', 'superficie');
    probe('matrix-th-personales', '.matrix-table th:nth-child(3)', 'superficie');
    probe('matrix-th-extras', '.matrix-table th:nth-child(4)', 'superficie');
    probe('progress-fill', '.matrix-progress-fill', 'indicador');
    probe('payments-fill', '.payments-fill', 'indicador');
    probe('payments-fill', '.payments-fill', 'indicador');
    probe('cat-tick-estructural', '.matrix-section .cat-tick', 'indicador');
    // El anillo de foco se mide aparte, contra las DOS superficies donde
    // aparece: el canvas del rail y la superficie del contenido.
    const ring = getComputedStyle(document.documentElement).getPropertyValue('--focus-ring').trim();
    const c = parseColor(ring);
    if (c) {
      const rail = document.querySelector('.app-sidebar');
      const cont = document.querySelector('.main-content');
      for (const [nombre, el] of [['rail', rail], ['contenido', cont]]) {
        if (!el) continue;
        const bg = realBg(el);
        out.push({ label: 'focus-ring sobre ' + nombre, sel: '--focus-ring', tipo: 'indicador', value: ring, bg: 'rgb(' + bg.slice(0,3).map(Math.round).join(', ') + ')', ratio: Number(ratio(c, bg).toFixed(2)), min: 3 });
      }
    }
    return out;
  };

  /* charts.js arma el ctx.font con el token crudo: '12px ' + readToken('--font-body').
     Si el parser de canvas rechaza la pila, ctx.font conserva el valor previo y
     el texto del grafico no se dibuja. Este check lee el valor de vuelta. */
  const canvasFontCheck = () => {
    const cs = getComputedStyle(document.documentElement);
    const fam = cs.getPropertyValue('--font-body').trim();
    const mono = cs.getPropertyValue('--font-mono').trim();
    const c = document.createElement('canvas').getContext('2d');
    const pruebas = [];
    for (const v of ['12px ' + fam, '600 20px ' + mono, '11px ' + fam, '400 12px ' + fam]) {
      c.font = '10px serif';
      const antes = c.font;
      c.font = v;
      pruebas.push({ pedido: v, leido: c.font, acepto: c.font !== antes && c.font !== '10px serif' });
    }
    return pruebas;
  };

  // ---- tokens leidos tal cual (para ver color-mix crudo) ----
  const tokens = () => {
    const cs = getComputedStyle(document.documentElement);
    const names = ['--cat-servicios','--cat-personales','--cat-movimientos','--cat-extras','--cat-matrix',
      '--cat-servicios-wash','--cat-personales-wash','--cat-movimientos-wash','--cat-extras-wash',
      '--state-pagado-wash','--state-pendiente-wash','--font-body','--font-display','--bg-surface','--bg-inset'];
    const out = {};
    for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) out[n] = v; }
    return out;
  };

  /* ---- espacio ---- */
  /* focus() desplaza el elemento enfocado a la vista, y en esta pagina el
     scroll vive en un contenedor, no en window: despues de auditar el foco,
     getBoundingClientRect de las filas queda en coordenadas de viewport
     desplazado y la cuenta de "filas que entran en 900px" da un numero sin
     sentido (midio 9/9 con la ultima fila en y=168). Se devuelve el scroll a
     cero antes de medir. */
  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (/auto|scroll/.test(cs.overflowY) && el.scrollTop) el.scrollTop = 0;
    });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
    return { win: window.scrollY };
  };

  const space = () => {
    const rail = document.querySelector('.app-sidebar');
    const railKids = rail ? [...rail.children].filter(visible).map(c => ({ cls: c.className, ...r(c) })) : [];
    const footer = document.querySelector('.sidebar-footer');
    const search = document.querySelector('.ledger-toolbar');
    const gapSearchToFooter = (search && footer) ? Math.round(footer.getBoundingClientRect().top - search.getBoundingClientRect().bottom) : null;

    // T5: las cuatro `.content-card-box` son los cuatro `.ledger-group` del
    // libro. Lo que se mide es el mismo reparto —alto del grupo, aire de arriba y
    // de abajo, tinte de superficie— con los nombres que existen ahora.
    const cards = [...document.querySelectorAll('#viewMes .ledger-group')].filter(visible);
    const cardInfo = cards.map(c => {
      const b = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        seg: c.dataset.segmentCard, accent: c.dataset.accent,
        h: Math.round(b.height),
        padTop: cs.paddingTop, padBottom: cs.paddingBottom,
        bg: cs.backgroundColor,
        headH: Math.round((c.querySelector('.ledger-group-head')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
        bodyH: Math.round((c.querySelector('.ledger-group-body')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
      };
    });

    // separaciones verticales entre bloques de la vista mensual. T1 dejó de
    // haber cinco bandas: ahora hay una barra con tres renglones. T5 dejó de
    // existir .segments-workspace-container: el libro es #ledgerBody.
    const blocks = ['.ledger-toolbar','.ledger-strip','.ledger-row-nav','#ledgerBody'];
    const blockInfo = blocks.map(s => { const el = document.querySelector(s); return el && visible(el) ? { s, ...r(el) } : { s, box: null }; });
    const gaps = [];
    for (let i = 0; i < blockInfo.length - 1; i++) {
      const a = blockInfo[i], b = blockInfo[i+1];
      if (a.h && b.h) gaps.push({ from: a.s, to: b.s, gap: b.y - (a.y + a.h) });
    }

    // cuantas filas de gasto entran en 900px de alto
    const rows = [...document.querySelectorAll('#viewMes .expense-card-item')].filter(visible);
    const rowsInFold = rows.filter(el => el.getBoundingClientRect().bottom <= 900).length;
    const lastVisible = rows.filter(el => el.getBoundingClientRect().bottom <= 900).slice(-1)[0];
    const content = document.querySelector('.main-content');
    const contentH = content ? Math.round(content.getBoundingClientRect().height) : null;
    const scrollH = content ? content.scrollHeight : null;

    // area del grafico de barras en estado vacio
    const trendCanvas = document.getElementById('chartTrendBar');
    const trendSection = trendCanvas ? trendCanvas.closest('.chart-section') : null;
    const chartInfo = {
      trendSectionClass: trendSection ? trendSection.className : null,
      trendCanvasBox: trendCanvas ? r(trendCanvas.parentElement) : null,
      donutCanvasBox: (() => { const c = document.getElementById('chartCategoryDonut'); return c ? r(c.parentElement) : null; })(),
    };

    return {
      railBox: r(rail), railKids, gapSearchToFooter,
      railContentH: railKids.length ? railKids[railKids.length-1].y + railKids[railKids.length-1].h - railKids[0].y : null,
      railScroll: rail ? { scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight } : null,
      cardInfo, gaps, rowsTotal: rows.length, rowsInFold,
      lastRowBottom: lastVisible ? Math.round(lastVisible.getBoundingClientRect().bottom) : null,
      contentH, scrollH, chartInfo,
      blockInfo,
    };
  };

  // ---- tipografia ----
  const typo = () => {
    const bodyCs = getComputedStyle(document.body);
    const cs2 = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };

    // Muestra de texto: mide el ancho con la familia activa y con una pila de
    // respaldo fija. La diferencia de ancho es lo que produce el salto al swap.
    const sample = 'Servicios del hogar S/ 12,345.67 Consolidado multimes';
    const measure = (family, size, weight) => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = (weight||400) + ' ' + (size||16) + 'px ' + family;
      return c.measureText(sample).width;
    };
    const active = bodyCs.fontFamily;
    const fallbackStack = '"Segoe UI", Tahoma, Verdana, sans-serif';
    const monoStack = bodyCs.fontFamily;

    // altura de linea real de una linea de texto
    const probeLine = document.createElement('span');
    probeLine.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:' + active + ';font-size:15px;font-weight:400';
    probeLine.textContent = sample;
    document.body.appendChild(probeLine);
    const lineBoxActive = probeLine.getBoundingClientRect().height;
    probeLine.style.fontFamily = fallbackStack;
    const lineBoxFallback = probeLine.getBoundingClientRect().height;
    probeLine.remove();

    // altura de bloque de la fila de metricas y de la seccion, que es donde un
    // cambio de fuente se ve como salto
    const metricVal = document.querySelector('.ledger-cell-value');
    const secFig = document.querySelector('.ledger-group-subtotal');
    const rowH = document.querySelector('.expense-card-item');

    return {
      bodyFontFamily: active,
      bodyFontSize: bodyCs.fontSize,
      bodyLineHeight: bodyCs.lineHeight,
      viewHeadingFont: cs2('.view-heading', 'fontFamily'),
      viewHeadingSize: cs2('.view-heading', 'fontSize'),
      viewHeadingWeight: cs2('.view-heading', 'fontWeight'),
      monoFont: cs2('.font-mono', 'fontFamily'),
      searchInputFont: cs2('.command-search-input', 'fontFamily'),
      sampleWidthActive: Number(measure(active).toFixed(2)),
      sampleWidthFallback: Number(measure(fallbackStack).toFixed(2)),
      // Contraste de ancho CONTRA EL RESPALDO REAL: si Inter esta cargada, el
      // delta con 'Inter Fallback' dice si el size-adjust esta bien calibrado.
      sampleWidthInterFallback: (function () {
        const c = document.createElement('canvas').getContext('2d');
        c.font = '16px "Inter Fallback"';
        return Number(c.measureText(sample).width.toFixed(2));
      })(),
      sampleWidthOldStack: Number(measure('system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif').toFixed(2)),
      widthRatio: Number((measure(active) / measure(fallbackStack)).toFixed(4)),
      lineBoxActive: Number(lineBoxActive.toFixed(2)),
      lineBoxFallback: Number(lineBoxFallback.toFixed(2)),
      metricCellValueBox: metricVal ? r(metricVal) : null,
      sectionFigureBox: secFig ? r(secFig) : null,
      expenseRowBox: rowH ? r(rowH) : null,
      fontsLoaded: (document.fonts ? Array.from(document.fonts).map(f => f.family + ' ' + f.weight + ' ' + f.style + ' [' + f.status + ']') : []),
      interAvailable: (document.fonts ? document.fonts.check('16px Inter') : null),
      interFallbackAvailable: (document.fonts ? document.fonts.check('16px "Inter Fallback"') : null),
    };
  };

  // ---- foco real ----
  // Con file:// no hay sesion de Supabase, asi que la app abre en modo Lector y
  // la clase body.read-only-mode oculta todos los .admin-action-btn. Sin quitar
  // la clase el paso no audita NADA de los controles de edicion, que son
  // justamente los que hay que auditar. Se saca antes de enfocar y se devuelve.
  const focusAudit = () => {
    const eraSoloLectura = document.body.classList.contains('read-only-mode');
    document.body.classList.remove('read-only-mode');
    const targets = ['#commandSearchInput', '#btnNavMes', '#btnNavPanel', '#btnPrevMonth', '#btnNextMonth',
      '#monthPillsContainer .month-pill-btn', '.segment-pill-btn', '#btnOpenNotesModal',
      '.ledger-action', '#btnHeaderAddIncome', '#btnHeaderAddBudget', '#btnOpenNewMonthModal',
      '#btnCommandClearSearch', '.feed-filter-pill'];
    const out = [];
    const leerAnillo = (node, etiqueta) => {
      const pcs = getComputedStyle(node);
      if (pcs.outlineStyle !== 'none' && parseFloat(pcs.outlineWidth) > 0) {
        return { el: etiqueta, outline: pcs.outline, offset: pcs.outlineOffset, color: pcs.outlineColor };
      }
      return null;
    };
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (!el || !visible(el)) { out.push({ sel, skip: true, motivo: 'no existe o invisible' }); continue; }
      el.focus();
      const focused = document.activeElement === el;
      const cs = getComputedStyle(el);
      // el anillo puede estar en el elemento o en un ancestro con :focus-within
      let ringOwner = leerAnillo(el, el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''));
      let p = el.parentElement;
      while (!ringOwner && p) {
        ringOwner = leerAnillo(p, p.tagName.toLowerCase() + (p.id ? '#' + p.id : '')
          + (typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\\s+/)[0] : ''));
        p = p.parentElement;
      }
      out.push({ sel, focused, ring: ringOwner, borderColor: cs.borderColor });
    }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    if (eraSoloLectura) document.body.classList.add('read-only-mode');
    return out;
  };

  // ---- estado PAGADO real: se alterna una fila con el binding de app.js ----
  // Con los datos actuales las nueve filas estan en Pendiente, asi que
  // '.status-pagado' no existe en el DOM y su contraste no se puede medir.
  // Clickear el boton de estado es ademas la prueba de que el binding de app.js
  // sigue vivo: el escribe 'className' y 'textContent' ahi.
  const paidStateAudit = () => {
    const btn = document.querySelector('#viewMes .expense-card-item .btn-status-toggle');
    if (!btn) return { error: 'no hay filas de gasto' };

    /* CUIDADO CON EL EFECTO SECUNDARIO: el handler de app.js llama a
       store.toggleBudgetItemStatus(), que llama a store.save(), que ESCRIBE en
       localStorage. Un probe que hace clic sin mas le cambia un gasto al
       usuario de verdad. Antes de clickear se congela save() con un contador y
       se sustituye toggleBudgetItemStatus por una version que devuelve el
       estado nuevo sin persistir. La mutacion del DOM —que es lo que hay que
       medir— sigue ocurriendo igual, porque la reescritura de className y
       textContent la hace app.js, no el store. Al terminar se restauran las dos
       funciones originales. */
    const store = window.financialStore;
    const congelar = store && !store.__congeladoPorProbe;
    if (congelar) {
      store.__congeladoPorProbe = true;
      store.__saveOriginal = store.save.bind(store);
      store.__toggleOriginal = store.toggleBudgetItemStatus.bind(store);
      window.__probe.__writes = 0;
      store.save = function () { window.__probe.__writes++; return true; };
      store.toggleBudgetItemStatus = function (monthId, itemId) {
        const m = store.getMonth(monthId);
        if (!m) return 'Pendiente';
        const todas = [].concat(m.servicios && m.servicios.fijos || [], m.servicios && m.servicios.variables || [],
          m.personales && m.personales.fijos || [], m.personales && m.personales.variables || [], m.extras || []);
        const it = todas.find(x => x.id === itemId);
        if (!it) return 'Pendiente';
        it.estado = it.estado === 'Pagado' ? 'Pendiente' : 'Pagado';
        return it.estado;
      };
    }

    const leer = () => ({ clase: btn.className, texto: btn.textContent.trim() });
    const antes = leer();
    btn.click();
    const despues = leer();
    const seccion = btn.closest('.ledger-group');
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
    const out = {
      antes, despues,
      cambioClase: antes.clase !== despues.clase,
      cambioTexto: antes.texto !== despues.texto,
      seccionTinte: seccion ? getComputedStyle(seccion).backgroundColor : null,
      /* Los cuatro textos que deben seguir diciendo cosas DISTINTAS: si alguno
         se repite, la duplicacion que se elimino en T4 volvio. */
      pagosStrip: txt('paidTextInfo'),
      pendiente: txt('pendingSummaryLabel'),
      pctBadge: txt('paidPercentBadge'),
      notaGastos: txt('monthGastosCount'),
      totalEgresos: txt('monthTotalEgresos'),
      balance: txt('monthBalanceNeto'),
      /* T5: la cifra de Servicios ya no es una fila de subtotal al pie del
       * grupo: es el total DEL GRUPO, en su encabezado. */
      subTotalServicios: txt('summaryTagServicios'),
      /* DELIBERADAMENTE NO SE LEEN AQUÍ LOS COLORES COMPUTADOS.
       * .btn-status-toggle tiene "transition: 160ms" sobre color y
       * background-color. Leer getComputedStyle en el mismo tick del click
       * devuelve el valor INICIAL de la transición: se midió rgb(91,95,103), que
       * es el color de "Pendiente", sobre un fondo en oklab — que es como Chrome
       * representa un color interpolado. Los colores se leen en la fase 2,
       * paidColors(), despues del pump. */
    };

    if (congelar) {
      out.writesBloqueadas = window.__probe.__writes;
      store.save = store.__saveOriginal;
      store.toggleBudgetItemStatus = store.__toggleOriginal;
      store.__congeladoPorProbe = false;
    }
    return out;
  };

  /* ---- fase 2: los colores del estado pagado, ya con la transicion terminada ----
     Se llama DESPUES de un pump y una espera, que es lo que hace avanzar el reloj
     de animaciones del compositor. Antes de eso el valor devuelto es el viejo. */
  const paidColors = () => {
    const salida = [];
    for (const el of document.querySelectorAll('#viewMes .expense-card-item .btn-status-toggle')) {
      const cs = getComputedStyle(el);
      const padre = el.closest('.ledger-group');
      const seccion = padre ? getComputedStyle(padre).backgroundColor : null;
      salida.push({
        clase: el.className,
        texto: el.textContent.trim(),
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        tinteSeccion: seccion,
        /* Si el navegador devuelve oklab, la transicion NO ha terminado. */
        transicionTerminada: !/^oklab/.test(cs.backgroundColor) && !/^oklab/.test(cs.color),
      });
      if (salida.length >= 3) break;
    }
    return salida;
  };

  // ---- overflow por ancho ----
  const overflow = () => {
    const de = document.documentElement;
    const bad = [];
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.closest('#modalSessionRoleSelect')) return;
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      if (b.right > window.innerWidth + 1 || b.left < -1) {
        // los elementos con overflow-x auto proprio no son overflow de pagina
        let p = el, scrollable = false;
        while (p && p !== document.body) { const pcs = getComputedStyle(p); if (/auto|scroll|hidden/.test(pcs.overflowX)) { scrollable = true; break; } p = p.parentElement; }
        if (!scrollable) bad.push({ sel: el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):''), left: Math.round(b.left), right: Math.round(b.right) });
      }
    });
    return {
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      innerW: window.innerWidth,
      bodyScrollW: document.body.scrollWidth,
      hScroll: de.scrollWidth > de.clientWidth,
      offenders: bad.slice(0, 20),
    };
  };

  // ---- conteo de rail: 0 cifras, 0 meses (regla dura del proyecto) ----
  const railAudit = () => {
    const rail = document.querySelector('.app-sidebar');
    if (!rail) return null;
    const t = (rail.innerText || '').trim();
    const moneyTokens = t.match(/S\\/\\s*[\\d,]+[.\\d]*/g) || [];
    const percTokens = t.match(/\\d+([.,]\\d+)?\\s*%/g) || [];
    const monthLike = t.match(/\\b(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\\b/gi) || [];
    const ids = [...rail.querySelectorAll('[id]')].map(e => e.id);
    const classes = [...new Set([...rail.querySelectorAll('[class]')].flatMap(e => String(e.className).trim().split(/\\s+/)))].sort();
    return {
      text: t,
      textLen: t.length,
      moneyTokens, percTokens, monthLike,
      monthPillCount: rail.querySelectorAll('.month-pill-btn').length,
      figureCount: rail.querySelectorAll('.font-mono, .metric-main-value, .ledger-group-subtotal').length,
      ids, classes,
      scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight,
      overflows: rail.scrollHeight > rail.clientHeight,
    };
  };

  // ---- limpieza: markup muerto y duplicados ----
  const cleanupAudit = () => {
    const empties = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!el.children.length && !ownText(el)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none') empties.push({ sel: el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).join('.'):'') });
      }
    });
    const uiIconImg = [...document.querySelectorAll('.ui-icon-img')].map(el => {
      const cs = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), display: cs.display, svgDisplay: el.querySelector('.ui-icon-svg') ? getComputedStyle(el.querySelector('.ui-icon-svg')).display : null };
    });
    // texto duplicado en pantalla: los nodos con el mismo texto exacto
    const textCounts = {};
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const s = t.nodeValue.trim();
      if (!s || s.length < 3) continue;
      const el = t.parentElement;
      if (!el || !visible(el) || el.closest('#modalSessionRoleSelect')) continue;
      (textCounts[s] = textCounts[s] || []).push(el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/)[0]:''));
    }
    const dupes = Object.entries(textCounts).filter(([k,v]) => v.length > 1).map(([k,v]) => ({ text: k, where: v }));
    return { emptiesHidden: empties, uiIconImgSample: uiIconImg.slice(0,4), uiIconImgCount: uiIconImg.length, dupes: dupes.slice(0,25) };
  };

  return { contrast, accents, canvasFontCheck, tokens, resetScroll, space, typo, focusAudit, paidStateAudit, paidColors, overflow, railAudit, cleanupAudit };
})();
`;

/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const outFile = args[0] || 'odd/tasks/capturas/color-r0.report.json';
const themes = args[1] ? args[1].split(',') : ['light', 'dark'];
const widths = args[2] ? args[2].split(',').map(Number) : [1440, 1280, 1024];

/* ---------- el código que corre dentro de la pagina ----------
 *
 * PROBE_FN es un template literal de Node. Un backtick en cualquier comentario
 * de este bloque lo cierra y rompe el archivo entero, con un error que apunta a
 * la línea del comentario y no al del template: se pierde tiempo. Pasa tres
 * veces en esta tanda. La guarda de abajo lo convierte en un error obvio.
 */
const _probeInterno = PROBE_FN.slice(PROBE_FN.indexOf('\n') + 1, PROBE_FN.lastIndexOf('\n'));
if (_probeInterno.includes('`')) {
  console.error('PROBE_FN tiene un backtick dentro del bloque de la pagina.');
  console.error('Cada uno de estos abre/cierra el template literal de Node:');
  _probeInterno.split('\n').forEach((l, i) => { if (l.includes('`')) console.error('  linea ' + (i + 1) + ': ' + l.trim()); });
  process.exit(1);
}

const report = { generado: new Date().toISOString(), widths, temas: {} };
let problems = [];

const page = await openPage({ width: 1440, height: 900 });
try {
  // PerformanceObserver antes de navegar: si se instala despues, `buffered`
  // no alcanza y el CLS de la carga se pierde.
  // `openPage` devuelve `{ page, ... }` donde `page` es el cliente CDP crudo:
  // los metodos de alto nivel (`eval`, `goto`, `shot`) viven en el envoltorio.
  const cdp = page.page;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: CLS_PROBE });

  for (const theme of themes) {
    await page.goto(PAGE_URL, 7000);
    await cdp.eval(HIDE_ROLE_MODAL);
    await cdp.eval(HIDE_EXTRA);
    await page.pump(3);
    await new Promise(r => setTimeout(r, 600));

    if (theme === 'dark') {
      await page.setTheme('theme-dark');
    } else {
      await cdp.eval(`(() => { document.documentElement.classList.remove('theme-dark'); return document.documentElement.className; })()`);
      await page.pump(3);
      await new Promise(r => setTimeout(r, 800));
    }

    // installing probe helpers
    await cdp.eval(PROBE_FN);

    const t = {};
    t.contrast = await cdp.eval(`window.__probe.contrast()`);
    t.accents = await cdp.eval(`window.__probe.accents()`);
    t.canvasFont = await cdp.eval(`window.__probe.canvasFontCheck()`);
    t.tokens = await cdp.eval(`window.__probe.tokens()`);
    t.typo = await cdp.eval(`window.__probe.typo()`);
    t.focus = await cdp.eval(`window.__probe.focusAudit()`);
    // Se alterna una fila a PAGADO y se vuelven a medir acentos y contraste con
    // ese estado presente en el DOM.
    t.paid = await cdp.eval(`window.__probe.paidStateAudit()`);
    await cdp.eval(`window.__probe.pump === undefined`);
    await page.pump(2);
    await new Promise(r => setTimeout(r, 500));
    t.accentsConPagado = await cdp.eval(`window.__probe.accents()`);
    t.contrastConPagado = await cdp.eval(`window.__probe.contrast()`);
    t.paidColores = await cdp.eval(`window.__probe.paidColors()`);
    await page.shot(`odd/tasks/capturas/color-${theme}-pagado.png`);
    t.rail = await cdp.eval(`window.__probe.railAudit()`);
    t.cleanup = await cdp.eval(`window.__probe.cleanupAudit()`);
    t.cls = await cdp.eval(`window.__cls || null`);

    // vista mensual a 1440, con el scroll devuelto a cero
    await cdp.eval(`window.__probe.resetScroll()`);
    await page.pump(2);
    await new Promise(r => setTimeout(r, 400));
    t.space1440 = await cdp.eval(`window.__probe.space()`);
    t.overflow = {};
    for (const w of widths) {
      await page.resize(w, 900);
      t.overflow['w' + w] = await cdp.eval(`window.__probe.overflow()`);
    }
    await page.resize(1440, 900);

    // capturas: viewport unicamente
    await page.shot(`odd/tasks/capturas/color-${theme}-1440.png`);
    await page.resize(1440, 2600);
    await page.shot(`odd/tasks/capturas/color-${theme}-largo.png`);
    await page.resize(1440, 900);

    // Consolidado
    await cdp.eval(`(() => { document.getElementById('btnNavPanel').click(); return 'ok'; })()`);
    await page.pump(3);
    await new Promise(r => setTimeout(r, 1800));
    await cdp.eval(`window.__probe.resetScroll()`);
    await page.pump(2);
    await new Promise(r => setTimeout(r, 400));
    t.contrastPanel = await cdp.eval(`window.__probe.contrast()`);
    t.spacePanel = await cdp.eval(`window.__probe.space()`);
    await page.shot(`odd/tasks/capturas/color-${theme}-panel-1440.png`);
    await page.resize(1440, 2600);
    await page.shot(`odd/tasks/capturas/color-${theme}-panel-largo.png`);
    await page.resize(1440, 900);

    t.consola = { errors: page.consoleErrors.slice(), excepciones: page.exceptions.slice(), fallos: page.failedRequests.slice() };
    report.temas[theme] = t;

    // resumen de problemas
    for (const r of t.contrast) if (!r.pass) problems.push({ theme, vista: 'mes', ...r });
    for (const r of t.contrastConPagado) if (!r.pass) problems.push({ theme, vista: 'mes-con-pagado', ...r });
    for (const r of t.contrastPanel) if (!r.pass) problems.push({ theme, vista: 'panel', ...r });
    // Solo los INDICADORES tienen minimo 3:1. Los tintes de superficie no lo
    // tienen por definicion: se miden con ΔE en `odd/tasks/tinte.mjs`.
    for (const r of t.accents) if (r.min === 3 && r.ratio < 3) problems.push({ theme, tipo: 'no-textual', ...r });
    for (const r of t.accentsConPagado) if (r.min === 3 && r.ratio < 3) problems.push({ theme, tipo: 'no-textual-con-pagado', ...r });
    for (const [k, v] of Object.entries(t.overflow)) if (v.hScroll) problems.push({ theme, tipo: 'overflow-horizontal', ancho: k, ...v });
    if (t.consola.errors.length) problems.push({ theme, tipo: 'console.error', n: t.consola.errors });
    if (t.consola.excepciones.length) problems.push({ theme, tipo: 'excepcion', n: t.consola.excepciones });
    if (t.consola.fallos.length) problems.push({ theme, tipo: '404+', n: t.consola.fallos });
    if (t.rail && t.rail.overflows) problems.push({ theme, tipo: 'rail-scroll', ...t.rail });
    if (t.rail && (t.rail.moneyTokens.length || t.rail.percTokens.length || t.rail.monthPillCount)) problems.push({ theme, tipo: 'rail-con-datos', money: t.rail.moneyTokens, pct: t.rail.percTokens, meses: t.rail.monthPillCount });
  }
} finally {
  await page.close();
}

report.problemas = problems;
fs.mkdirSync('odd/tasks/capturas', { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));

/* --------- resumen legible por consola --------- */
const fmt = (rows, n = 40) => {
  const groups = {};
  for (const r of rows) {
    const k = [r.ratio, r.min, r.px + 'px', r.fg, r.bg].join('|');
    (groups[k] = groups[k] || { ratio: r.ratio, min: r.min, px: r.px, fg: r.fg, bg: r.bg, n: 0, fail: 0, sel: r.sel, sample: r.sample, large: r.large }).n++;
    if (!r.pass) groups[k].fail++;
  }
  return Object.values(groups).sort((a, b) => a.ratio - b.ratio);
};
for (const theme of themes) {
  const t = report.temas[theme];
  if (!t) continue;
  console.log('\n================ TEMA ' + theme.toUpperCase() + ' ================');
  console.log('tipografia:', JSON.stringify(t.typo.bodyFontFamily));
  console.log('Inter cargada:', t.typo.interAvailable, '| fallback:', t.typo.interFallbackAvailable);
  console.log('ancho muestra Inter / InterFallback / pila vieja:', t.typo.sampleWidthActive, '/', t.typo.sampleWidthInterFallback, '/', t.typo.sampleWidthOldStack);
  console.log('delta Inter vs fallback calibrado:', (t.typo.sampleWidthActive && t.typo.sampleWidthInterFallback ? ((t.typo.sampleWidthActive / t.typo.sampleWidthInterFallback - 1) * 100).toFixed(2) + '%' : 'n/d'));
  console.log('CLS:', t.cls ? t.cls.value : 'n/d');
  console.log('--- ctx.font de charts.js ---');
  console.table(t.canvasFont);
  console.log('--- tokens (raw, color-mix se ve LITERAL aqui) ---');
  console.log(JSON.stringify(t.tokens, null, 1));
  console.log('--- contraste VISTA MENSUAL (ordenado por ratio) ---');
  console.table(fmt(t.contrast).slice(0, 22));
  console.log('--- contraste CONSOLIDADO ---');
  console.table(fmt(t.contrastPanel).slice(0, 14));
  console.log('--- acentos no textuales (min 3) y superficies teñidas (sin minimo) ---');
  console.table(t.accents);
  console.log('--- acentos con una fila en PAGADO ---');
  console.table(t.accentsConPagado.filter(a => a.label.startsWith('state') || a.label.startsWith('cat-tick')));
  console.log('--- estado pagado: binding de app.js y textos que NO deben repetirse ---');
  console.log(JSON.stringify(t.paid, null, 1));
  console.log('colores del estado pagado, ya sin transicion:');
  console.table(t.paidColores);
  console.log('--- foco ---');
  console.table(t.focus.map(f => ({ sel: f.sel, focused: f.focused, ring: f.ring ? f.ring.outline : (f.skip ? 'skip' : 'NINGUNO') })));
  console.log('--- overflow ---');
  for (const [k, v] of Object.entries(t.overflow)) console.log(k, 'scrollH=' + v.hScroll, v.hScroll ? JSON.stringify(v.offenders.slice(0,5)) : '');
  console.log('--- rail ---');
  console.log('scrollH/clientH', t.rail.scrollHeight + '/' + t.rail.clientHeight, 'figuras', t.rail.figureCount, 'meses', t.rail.monthPillCount, 'S/', t.rail.moneyTokens.length, '%', t.rail.percTokens.length);
  console.log('--- espacio ---');
  console.log('railKids', JSON.stringify(t.space1440.railKids));
  console.log('gap buscador->pie', t.space1440.gapSearchToFooter);
  console.log('gaps', JSON.stringify(t.space1440.gaps));
  console.log('cards', JSON.stringify(t.space1440.cardInfo));
  console.log('filas en 900px:', t.space1440.rowsInFold, '/', t.space1440.rowsTotal, '| ultima fila bottom', t.space1440.lastRowBottom);
  console.log('graficos', JSON.stringify(t.space1440.chartInfo));
  console.log('--- consola ---', JSON.stringify(t.consola));
  console.log('--- espacio PANEL ---');
  console.log('graficos mes:', JSON.stringify(t.space1440.chartInfo));
  console.log('graficos panel:', JSON.stringify(t.spacePanel.chartInfo));
  console.log('cards panel:', JSON.stringify(t.spacePanel.cardInfo));
  console.log('--- limpieza ---', JSON.stringify(t.cleanup.emptiesHidden), 'uiIconImg', t.cleanup.uiIconImgCount);
  console.log('--- dupes texto en pantalla ---');
  console.log(JSON.stringify(t.cleanup.dupes, null, 1));
}
console.log('\n================ PROBLEMAS: ' + problems.length + ' ================');
console.log(JSON.stringify(problems.slice(0, 30), null, 1));
console.log('\nreporte: ' + outFile);
