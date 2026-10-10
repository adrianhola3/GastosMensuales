/* Corrida de verificacion del tema claro.
 *
 *   node odd\tasks\tema-claro.mjs <etiqueta>
 *
 * Abre su propia ventana en Brave por CDP, mide y cierra SIEMPRE el target.
 * No publica nada y no toca sync_github.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, targetCount, PAGE_URL } from './cdp.mjs';
import { PROBES } from './probes.mjs';

const LABEL = process.argv[2] || 'r1';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');
const OUT = path.join(DIR, `tema-${LABEL}.report.json`);

/* Focus ring audit: the controls named in the brief plus the rest of the rail. */
const FOCUS_IDS = [
  'commandSearchInput', 'btnCommandClearSearch', 'btnNavMes', 'btnNavPanel',
  'btnToggleAuthMode', 'btnPrevMonth', 'btnNextMonth', 'btnOpenNotesModal',
  'btnHeaderAddIncome', 'btnHeaderAddBudget', 'btnOpenNewMonthModal',
];

/* Foco con element.focus() de verdad, leyendo el getComputedStyle EN ESE MOMENTO.
 *
 * Chrome decide `:focus-visible` con una heurística: un <button> enfocado por
 * script NO matchea salvo que el navegador esté en "modalidad teclado". Por eso
 * antes de cada focus() se manda una tecla Shift real por Input.dispatchKeyEvent:
 * eso pone al navegador en modalidad teclado y el anillo aparece si la regla CSS
 * existe. Sin ese Shift el resultado "sin anillo" sería un falso positivo del
 * metodo, no un defecto de la hoja. */
async function focoReal(s, ids) {
  const out = [];
  for (const id of ids) {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await s.page.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: 16, key: 'Shift', code: 'ShiftLeft', modifiers: 8 });
    }
    const r = await s.page.eval(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      if (!el) return { id: ${JSON.stringify(id)}, falta: true };
      /* Un control puede estar oculto por un ANCESTRO (en Consolidado lo están
       * la banda de métricas y el selector de períodos, que viven en la Vista
       * Mensual). focus() no hace nada sobre un subárbol no renderizado y el
       * "sin anillo" sería un falso positivo del método. */
      let oculto = null;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') { oculto = n.id ? '#' + n.id : String(n.className).trim().split(/\\s+/)[0]; break; }
      }
      if (oculto) return { id: el.id, oculto: true, razon: 'ancestro ' + oculto };
      el.focus();
      const enfocado = document.activeElement === el;
      const cs = getComputedStyle(el);
      let caja = el, anillo = null, portador = null, off = null;
      while (caja && caja !== document.body) {
        const s2 = getComputedStyle(caja);
        if (s2.outlineStyle !== 'none' && parseFloat(s2.outlineWidth) > 0) {
          anillo = s2.outlineStyle + ' ' + s2.outlineWidth + ' ' + s2.outlineColor;
          portador = caja.id ? '#' + caja.id : String(caja.className).trim().split(/\\s+/)[0];
          off = s2.outlineOffset; break;
        }
        caja = caja.parentElement;
      }
      const r = { id: el.id, tag: el.tagName.toLowerCase(), enfocado,
        outlinePropio: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
        focusVisible: el.matches(':focus-visible'),
        anillo: anillo || 'NINGUNO', portador, offset: off };
      el.blur();
      return r;
    })()`);
    out.push(r);
  }
  return out;
}

async function boot(s) {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await s.page.eval(PROBES);
  /* El modal de rol queda oculto pero la app sigue en Lector. Se saca para poder
     medir los permisos de administrador sin abrir el login. */
  await s.page.eval(`document.body.classList.remove('read-only-mode');
    (function(){const m=document.getElementById('modalSessionRoleSelect'); if(m) m.classList.remove('active');})();
    'ok'`);
  await new Promise(r => setTimeout(r, 500));
}

async function medirTema(s, tema) {
  await s.setTheme(tema === 'oscuro' ? 'theme-dark' : null);
  const r = {};
  r.contraste = await s.page.eval('window.__audit.contraste()');
  r.acentos = await s.page.eval('window.__audit.acentos()');
  r.foco = await focoReal(s, FOCUS_IDS);
  r.rail = await s.page.eval('window.__audit.rail()');
  r.overflow = await s.page.eval('window.__audit.overflow()');
  r.canvas = await s.page.eval('window.__audit.canvas()');
  r.movimiento = await s.page.eval('window.__audit.movimiento()');
  r.claseHtml = await s.page.eval('document.documentElement.className || "(vacia)"');
  r.bodyBg = await s.page.eval("getComputedStyle(document.body).backgroundColor");
  r.consoleErrors = [...s.consoleErrors];
  r.exceptions = [...s.exceptions];
  r.fallosRed = [...s.failedRequests];
  return r;
}

const main = async () => {
  const s = await openPage({ width: 1440, height: 900 });
  const rep = { etiqueta: LABEL, url: PAGE_URL, cuando: new Date().toISOString() };
  try {
    await boot(s);

    /* --- TEMA CLARO: el tema por defecto. Se mide en Consolidado porque es la
       vista con los dos lienzos: hay que probarlos pintados y legibles. --- */
    await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 1200));
    rep.claro = await medirTema(s, 'claro');
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-consolidado.png`));

    /* Los dos lienzos en claro, con la vista ya estable. */
    rep.lienzosClaroConsolidado = await s.page.eval('window.__audit.canvas()');

    await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 900));
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-mes.png`));
    rep.claroMes = await medirTema(s, 'claro');

    /* --- Ancho: sin overflow horizontal, en CLARO --- */
    rep.anchos = {};
    for (const w of [1440, 1280, 1024]) {
      await s.resize(w, 900);
      rep.anchos[w] = await s.page.eval('window.__audit.overflow()');
      if (w !== 1440) await s.shot(path.join(DIR, `tema-${LABEL}-claro-mes-${w}.png`));
    }

    /* Drawer del rail a 1024, en claro: es el unico box-shadow de la hoja. */
    await s.resize(1024, 900);
    await s.page.eval("(function(){const b=document.querySelector('.btn-hamburger'); if(b) b.click(); return 'ok';})()");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 800));
    rep.drawer1024 = await s.page.eval('window.__audit.rail()');
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-drawer-1024.png`));
    /* Cerrar el drawer tiene que cerrar TAMBIÉN el velo: si solo se saca la clase
       del rail, `#sidebarBackdrop` sigue visible y las capturas siguientes salen
       con doble velo (rgb de fondo ~(64,64,64) en vez de (128,128,128)). */
    await s.page.eval("(function(){const a=document.querySelector('#appSidebar'); if(a) a.classList.remove('sidebar-open'); const b=document.getElementById('sidebarBackdrop'); if(b) b.classList.remove('visible','active','is-visible','show'); document.body.classList.remove('sidebar-open'); return 'ok';})()");
    await s.pump(3);
    rep.velosTrasCerrarDrawer = await s.page.eval(`(() => {
      const v = [];
      for (const el of document.querySelectorAll('.modal-overlay, .sidebar-backdrop')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0) v.push(el.id + ' ' + cs.backgroundColor + ' op=' + cs.opacity);
      }
      return v; })()`);
    await s.resize(1440, 900);

    /* --- Modales en claro: el boton filled y el texto de estado de notas --- */
    await s.page.eval("document.querySelector('#btnOpenNotesModal').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 800));
    rep.modalNotas = await s.page.eval('window.__audit.contraste()');
    rep.modalNotasBotones = await s.page.eval(`(() => [...document.querySelectorAll('.modal-overlay.active .btn-primary')]
      .map(b => { const cs = getComputedStyle(b);
        return { texto: b.textContent.trim(), fondo: cs.backgroundColor, etiqueta: cs.color,
          px: parseFloat(cs.fontSize),
          ratio: Math.round(window.__audit.ratio(window.__audit.parse(cs.color),
            window.__audit.parse(cs.backgroundColor)) * 100) / 100 }; }))()`);
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-modal-notas.png`));
    await s.page.eval("(function(){const m=document.getElementById('modalMonthNotes'); if(m) m.classList.remove('active'); return 'ok';})()");
    await s.pump(3);

    await s.page.eval("document.querySelector('#btnToggleAuthMode').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 800));
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-modal-acceso.png`));
    await s.page.eval(`(function(){
      for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active');
      return 'ok'; })()`);
    await s.pump(3);

    /* --- Zona baja de Consolidado: los dos lienzos a la vista --- */
    await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 1200));
    await s.resize(1440, 2600);
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-consolidado-graficos.png`));
    rep.lienzosClaroGraficos = await s.page.eval('window.__audit.canvas()');
    await s.resize(1440, 900);

/* Foco con teclas Tab reales. Va en VISTA MENSUAL y no en Consolidado: en
       Consolidado la mitad de los controles no existe y el recorrido termina en
       4, que es un numero que parece un total sin serlo. */
    await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 900));
    await s.page.eval("document.activeElement && document.activeElement.blur(); 'ok'");
    rep.focoTeclado = [];
    for (let i = 0; i < 45; i++) {
      await s.page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await s.page.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      const st = await s.page.eval(`(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        let caja = el, anillo = null, off = null;
        while (caja && caja !== document.body) {
          const s2 = getComputedStyle(caja);
          if (s2.outlineStyle !== 'none' && parseFloat(s2.outlineWidth) > 0) {
            anillo = s2.outlineStyle + ' ' + s2.outlineWidth + ' ' + s2.outlineColor; off = s2.outlineOffset; break;
          }
          caja = caja.parentElement;
        }
        return { tag: el.tagName.toLowerCase(), id: el.id || null,
          clase: (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/)[0] || null,
          focusVisible: el.matches(':focus-visible'), anillo: anillo || 'NINGUNO', offset: off };
      })()`);
      if (!st) break;
      rep.focoTeclado.push(st);
    }

/* Escrituras a Supabase: contador */
    rep.escrituras = await s.page.eval('JSON.stringify(window.__probe)');

    /* --- TEMA OSCURO: la variante previa tiene que seguir igual --- */
    await s.page.eval("document.querySelector('#btnNavMes').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 900));
    rep.oscuro = await medirTema(s, 'oscuro');
    await s.shot(path.join(DIR, `tema-${LABEL}-oscuro-mes.png`));
    await s.page.eval("document.querySelector('#btnNavPanel').click(); 'ok'");
    await s.pump(4);
    await new Promise(r => setTimeout(r, 1400));
    rep.oscuroConsolidado = await s.page.eval('window.__audit.canvas()');
    await s.shot(path.join(DIR, `tema-${LABEL}-oscuro-consolidado.png`));
    await s.setTheme(null);
  } finally {
    await s.close();
  }
  /* Se cuenta DESPUES de cerrar: dentro del try el target propio sigue abierto y
   * el numero seria 1 siempre. */
  rep.pestanasAlTerminar = await targetCount();

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rep, null, 2));

  /* --- Informe por consola --- */
  const resumen = (nombre, r) => {
    const bajos = r.contraste.filter(x => !x.cumple);
    const minimo = r.contraste.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    console.log('');
    console.log('=== TEMA ' + nombre + ' (clase html="' + r.claseHtml + '", body bg ' + r.bodyBg + ') ===');
    console.log('pares de texto medidos: ' + r.contraste.length + '   fallos AA: ' + bajos.length);
    console.log('mas bajo: ' + minimo.ratio + ':1  [' + minimo.sel + '] "' + minimo.texto + '"  ' +
      minimo.fg + ' sobre ' + minimo.bg + '  (' + minimo.px + 'px, min ' + minimo.min + ')');
    for (const b of bajos) {
      console.log('   FALLA ' + b.sel + ' "' + b.texto + '" ' + b.fg + ' sobre ' + b.bg +
        ' = ' + b.ratio + ':1 (min ' + b.min + ')');
    }
    console.log('acentos categorias: ' + r.acentos.categorias.map(c => (c.falta ? c.sel + ' FALTA' : c.sel.replace(/.*cat-tick/, '') + ' ' + c.color + ' ' + c.ratio + ':1')).join('  '));
    console.log('rail: ' + JSON.stringify(r.rail));
    console.log('overflow: ' + JSON.stringify(r.anchos || r.overflow));
console.log('canvas: ' + JSON.stringify(r.canvas));
    console.log('foco (element.focus real): ' + r.foco.map(f => f.id + '=' + (f.anillo || 'NINGUNO') + (f.focusVisible ? '' : ' [sin :focus-visible]') + (f.oculto ? ' [oculto]' : '')).join('  '));
    console.log('console.error=' + r.consoleErrors.length + ' excepciones=' + r.exceptions.length +
      ' red>=400=' + r.fallosRed.length);
    if (r.consoleErrors.length) console.log('  errores: ' + r.consoleErrors.join(' | '));
    if (r.exceptions.length) console.log('  excepciones: ' + r.exceptions.join(' | '));
    if (r.fallosRed.length) console.log('  red: ' + r.fallosRed.join(' | '));
  };
  resumen('CLARO (nuevo, Consolidado)', rep.claro);
  resumen('CLARO (nuevo, Vista Mensual)', rep.claroMes);
  resumen('OSCURO (preservado, Vista Mensual)', rep.oscuro);
  console.log('');
  console.log('lienzos claro (consolidado): ' + JSON.stringify(rep.lienzosClaroConsolidado));
  console.log('lienzos claro (graficos a la vista): ' + JSON.stringify(rep.lienzosClaroGraficos));
  console.log('lienzos oscuro: ' + JSON.stringify(rep.oscuroConsolidado));
  const mn = rep.modalNotas.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const mf = rep.modalNotas.filter(x => !x.cumple);
  console.log('modal de notas en claro: ' + rep.modalNotas.length + ' pares, fallos ' + mf.length +
    ', mas bajo ' + mn.ratio + ':1 [' + mn.sel + '] "' + mn.texto + '"');
  for (const b of mf) console.log('   FALLA ' + b.sel + ' "' + b.texto + '" ' + b.fg + ' sobre ' + b.bg + ' = ' + b.ratio);
  console.log('');
  console.log('foco con Tab real: ' + rep.focoTeclado.length + ' controles, sin anillo: ' +
    rep.focoTeclado.filter(f => f.anillo === 'NINGUNO').length);
  for (const f of rep.focoTeclado.filter(f => f.anillo === 'NINGUNO')) {
    console.log('   SIN ANILLO: ' + f.tag + '#' + f.id + '.' + f.clase + ' focusVisible=' + f.focusVisible);
  }
  console.log('anchos: ' + Object.entries(rep.anchos).map(([w, o]) =>
    w + ': ' + o.docScrollW + '/' + o.docClientW + (o.desborda ? ' DESBORDA' : ' ok')).join('   '));
  console.log('escrituras interceptadas: ' + rep.escrituras);
  console.log('pestanas al terminar: ' + JSON.stringify(rep.pestanasAlTerminar));
  console.log('reporte: ' + OUT);
};

main().catch(e => { console.error('FALLO: ' + e.message); process.exit(1); });
