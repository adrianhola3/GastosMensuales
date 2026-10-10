/* Modales en claro: el boton filled, el velo, y el anillo de foco real.
 *
 * Los modales se abren y se CIERRAN. No se toca ningun campo de formulario ni se
 * envia el formulario: abrir un drawer no escribe nada.
 */
import path from 'node:path';
import fs from 'node:fs';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, PAGE_URL } from './cdp.mjs';
import { PROBES } from './probes.mjs';

const LABEL = process.argv[2] || 'r3';
const DIR = path.join(process.cwd(), 'odd', 'tasks', 'capturas');

const MEDIR_BTN = `(() => {
  const out = [];
  for (const b of document.querySelectorAll('.btn-primary')) {
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    if (r.width === 0 || cs.display === 'none') continue;
    out.push({
      id: b.id || null,
      texto: (b.textContent || '').trim().slice(0, 22),
      fondo: cs.backgroundColor,
      etiqueta: cs.color,
      px: parseFloat(cs.fontSize),
      peso: cs.fontWeight,
      ratio: Math.round(window.__audit.ratio(
        window.__audit.parse(cs.color), window.__audit.parse(cs.backgroundColor)) * 100) / 100,
    });
  }
  return out;
})()`;

const VELOS = `(() => {
  const v = [];
  for (const el of document.querySelectorAll('.modal-overlay, .sidebar-backdrop')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    v.push({ id: el.id, clase: String(el.className).trim().split(/\\s+/)[0],
      fondo: cs.backgroundColor, opacidad: cs.opacity,
      w: Math.round(r.width), h: Math.round(r.height) });
  }
  return v;
})()`;

const s = await openPage({ width: 1440, height: 900 });
const rep = {};
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await s.page.eval(PROBES);
  await s.page.eval(`(() => {
    /* El boton de lector del modal de rol tambien dispara un guardado de estado
       de sesion local, pero no toca Supabase: se deja el modal cerrado. */
    const m = document.getElementById('modalSessionRoleSelect');
    if (m) m.classList.remove('active');
    const sb = document.getElementById('sidebarBackdrop');
    if (sb) sb.classList.remove('visible', 'active', 'is-visible');
    document.body.classList.remove('sidebar-open', 'read-only-mode');
    return 'ok';
  })()`);
  await s.pump(3);

  const casos = [
    ['notas', "document.querySelector('#btnOpenNotesModal').click()", 'modalMonthNotes', '#btnCloseNotes'],
    ['acceso', "document.querySelector('#btnToggleAuthMode').click()", 'modalAdminAuth', '.modal-close-btn, .btn-close-sheet-btn'],
    ['pago-variable', "(function(){const b=document.querySelector('.expense-card-item .btn-status-toggle'); if(b) b.click();})()", 'modalPayVariableExpense', null],
    ['nuevo-mes', "document.querySelector('#btnOpenNewMonthModal').click()", 'modalNewMonth', '.btn-close-sheet-btn'],
  ];

  for (const [nombre, abrir, idModal, selCerrar] of casos) {
    await s.page.eval(`(function(){ for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active'); return 1; })()`);
    await s.pump(2);
    const estadoAntes = await s.page.eval(`(() => { const m = document.getElementById(${JSON.stringify(idModal)}); return m ? m.classList.contains('active') : 'no existe'; })()`);
    await s.page.eval(abrir + "; 'ok'");
    await s.pump(3);
    await new Promise(r => setTimeout(r, 900));
    const abierto = await s.page.eval(`(() => { const m = document.getElementById(${JSON.stringify(idModal)}); return m ? m.classList.contains('active') : 'no existe'; })()`);
    rep[nombre] = {
      idModal, estabaActivo: estadoAntes, ahoraActivo: abierto,
      velos: await s.page.eval(VELOS),
      botones: await s.page.eval(MEDIR_BTN),
      contraste: (await s.page.eval('window.__audit.contraste()')).filter(x => !x.cumple),
      pares: (await s.page.eval('window.__audit.contraste()')).length,
      minimo: (await s.page.eval('window.__audit.contraste()')).reduce((a, b) => (b.ratio < a.ratio ? b : a)),
    };
    await s.shot(path.join(DIR, `tema-${LABEL}-claro-modal-${nombre}.png`));
    /* Cierre: primero ESC real (comprueba el handler), despues el boton de
       cierre que corresponda. Ninguna de las dos acciones escribe. */
    for (const type of ['rawKeyDown', 'keyUp']) {
      await s.page.send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
    }
    await s.pump(3);
    await new Promise(r => setTimeout(r, 600));
    rep[nombre].trasEsc = await s.page.eval(`(() => { const m = document.getElementById(${JSON.stringify(idModal)}); return m ? m.classList.contains('active') : 'no existe'; })()`);
    if (selCerrar && rep[nombre].trasEsc === true) {
      await s.page.eval(`(function(){
        const m = document.getElementById(${JSON.stringify(idModal)});
        if (!m) return 'no existe';
        const b = m.querySelector(${JSON.stringify(selCerrar)});
        if (b) b.click();
        return b ? 'ok' : 'sin boton de cierre';
      })()`);
      await s.pump(3);
      await new Promise(r => setTimeout(r, 700));
    }
    rep[nombre].cerrado = await s.page.eval(`(() => { const m = document.getElementById(${JSON.stringify(idModal)}); return m ? m.classList.contains('active') : 'no existe'; })()`);
  }

  /* El boton filled, en la pagina principal, sin modal: se lee su color real. */
  await s.page.eval(`(function(){ for (const el of document.querySelectorAll('.modal-overlay')) el.classList.remove('active'); return 1; })()`);
  await s.pump(2);
  rep.velosAlCerrar = await s.page.eval(VELOS);
  rep.escrituras = await s.page.eval('JSON.stringify(window.__probe)');
  rep.consoleErrors = [...s.consoleErrors];
  rep.exceptions = [...s.exceptions];
} finally {
  await s.close();
}

fs.writeFileSync(path.join(DIR, `modales-${LABEL}.report.json`), JSON.stringify(rep, null, 2));
for (const [k, v] of Object.entries(rep)) {
  if (k === 'velosAlCerrar' || k === 'escrituras' || k === 'consoleErrors' || k === 'exceptions') {
    console.log(k + ': ' + JSON.stringify(v));
    continue;
  }
  console.log('');
  console.log('=== ' + k + ' (' + v.idModal + ') abierto=' + v.ahoraActivo + ' trasEsc=' + v.trasEsc + ' cerrado=' + v.cerrado + ' ===');
  console.log('  pares de texto: ' + v.pares + '   fallos AA: ' + v.contraste.length + (v.contraste.length ? ' -> ' + JSON.stringify(v.contraste) : ''));
  console.log('  mas bajo: ' + v.minimo.ratio + ':1 [' + v.minimo.sel + '] "' + v.minimo.texto + '" ' + v.minimo.fg + ' sobre ' + v.minimo.bg);
  console.log('  velos: ' + JSON.stringify(v.velos));
  console.log('  botones filled: ' + JSON.stringify(v.botones));
}