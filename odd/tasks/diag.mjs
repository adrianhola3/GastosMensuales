/* Diagnostico puntual: por que algunos elementos quedan con el color del OTRO
 * tema, y por que los lienzos se leen como no pintados. */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, PAGE_URL } from './cdp.mjs';

const s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.send('Page.bringToFront').catch(() => {});

  const leer = async etiqueta => {
    const r = await s.page.eval(`(() => {
      const cs = getComputedStyle(document.documentElement);
      const toma = sel => {
        const el = document.querySelector(sel);
        if (!el) return sel + ' = NO EXISTE';
        return sel + ' -> color ' + getComputedStyle(el).color
          + ' | bg ' + getComputedStyle(el).backgroundColor
          + ' | transition ' + getComputedStyle(el).transitionDuration;
      };
      const lienzo = id => {
        const c = document.getElementById(id);
        if (!c) return id + ' = NO EXISTE';
        try {
          const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
          const set = new Set();
          for (let i = 0; i < d.length; i += 4) set.add(d[i]+','+d[i+1]+','+d[i+2]);
          return id + ' colores=' + set.size + ' primeros=' + [...set].slice(0,4).join(' | ');
        } catch (e) { return id + ' ERROR ' + e.message; }
      };
      return {
        clase: document.documentElement.className || '(vacia)',
        tokens: {
          surface: cs.getPropertyValue('--bg-surface').trim(),
          main: cs.getPropertyValue('--text-main').trim(),
          secondary: cs.getPropertyValue('--text-secondary').trim(),
          muted: cs.getPropertyValue('--text-muted').trim(),
          accent: cs.getPropertyValue('--accent-primary').trim(),
        },
        body: getComputedStyle(document.body).backgroundColor,
        canvasFocus: document.hasFocus(),
        els: [
          toma('.sidebar-nav-tab.active'),
          toma('.sidebar-nav-tab:not(.active)'),
          toma('#authModeLabel'),
          toma('.brand-title'),
          toma('.ledger-cell-label'),
          toma('.month-pill-btn.active'),
        ],
        lienzos: [lienzo('chartTrendBar'), lienzo('chartCategoryDonut')],
      };
    })()`);
    console.log('\n--- ' + etiqueta + ' ---');
    console.log('  clase html: "' + r.clase + '"   body bg: ' + r.body + '   document.hasFocus=' + r.canvasFocus);
    console.log('  tokens: ' + JSON.stringify(r.tokens));
    for (const e of r.els) console.log('  ' + e);
    for (const l of r.lienzos) console.log('  ' + l);
  };

  await leer('recien cargado (claro por defecto)');

  await s.page.eval("document.documentElement.classList.add('theme-dark'); 'ok'");
  await new Promise(r => setTimeout(r, 600));
  await leer('theme-dark + 600ms');

  await new Promise(r => setTimeout(r, 3000));
  await leer('theme-dark + 3.6s');

  await s.page.eval("document.documentElement.classList.remove('theme-dark'); 'ok'");
  await new Promise(r => setTimeout(r, 3000));
  await leer('sin clase + 3.6s');

  /* ¿Es la transicion? Se desactiva y se repite. */
  await s.page.eval(`(() => {
    const st = document.createElement('style');
    st.textContent = '*{transition:none !important}';
    document.head.appendChild(st);
    document.documentElement.classList.add('theme-dark');
    return 'ok';
  })()`);
  await new Promise(r => setTimeout(r, 800));
  await leer('theme-dark SIN transiciones');

  /* Canvas: con bringToFront y esperando. */
  await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
  await new Promise(r => setTimeout(r, 2500));
  await leer('consolidado, theme-dark sin transiciones');
  await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
  await new Promise(r => setTimeout(r, 1500));
  await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
  await new Promise(r => setTimeout(r, 2500));
  await leer('consolidado de nuevo');

  console.log('\nfin');
} finally {
  await s.close();
}