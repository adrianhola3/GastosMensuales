/* Muestra final de la pagina rehecha.
 *
 * Solo lectura sobre la app: no escribe datos, no toca el store. Congela las
 * escrituras remotas antes de interactuar y abre un perfil desechable.
 *
 * El estado "administrador" se obtiene quitando `read-only-mode` del <body>, que
 * es EXACTAMENTE lo que hace el arnes verificado del proyecto
 * (`edicion-admin.mjs:448`): el unico gate de permisos del cliente es
 * `body.read-only-mode .admin-action-btn { display: none !important }`
 * (documentado en `odd/tasks/edicion-admin.md:19`). Con sesion real de Supabase
 * esos botones aparecen solos; aca se renderiza la superficie que el gate
 * esconde, sin inventarse una sesion.
 */
import path from 'node:path';
import { openPage, HIDE_ROLE_MODAL, FREEZE_WRITES, PAGE_URL } from './cdp.mjs';

const DIR = path.resolve('odd', 'tasks', 'capturas');
const A_ADMIN = `(() => { document.body.classList.remove('read-only-mode');
  const b = document.getElementById('authModeLabel');
  if (b) b.textContent = 'Administrador';
  return document.body.className; })()`;

const esperar = async (s, ms = 1400) => { await new Promise(r => setTimeout(r, ms)); await s.pump(3); };

const s = await openPage({ width: 1440, height: 900 });
try {
  await s.goto(PAGE_URL, 7500);
  await s.page.eval(HIDE_ROLE_MODAL);
  await s.page.eval(FREEZE_WRITES);
  await esperar(s, 1200);

  /* localStorage recuerda la ultima vista: se fuerza la mensual. */
  await s.page.eval(`document.getElementById('btnNavMes').click(); 'ok'`);
  await esperar(s);

  await s.shot(path.join(DIR, 'MOSTRAR-1-mes-1440-lector.png'));

  await s.page.eval(A_ADMIN);
  await esperar(s, 800);
  await s.shot(path.join(DIR, 'MOSTRAR-2-mes-1440-admin.png'));

  /* Con el puntero sobre una fila: las acciones de fila se revelan al hover, y
     una captura sin hover no muestra la superficie de edicion real. */
  await s.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 260, button: 'none' });
  await esperar(s, 700);
  await s.shot(path.join(DIR, 'MOSTRAR-2b-mes-1440-admin-hover.png'));
  await s.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1400, y: 880, button: 'none' });

  await s.setTheme('theme-dark');
  await esperar(s, 900);
  await s.shot(path.join(DIR, 'MOSTRAR-3-mes-1440-admin-oscuro.png'));

  await s.setTheme('');
  await esperar(s, 900);
  await s.page.eval(`document.getElementById('btnNavPanel').click(); 'ok'`);
  await esperar(s);
  await s.shot(path.join(DIR, 'MOSTRAR-4-consolidado-1440-admin.png'));

  /* 1280: mismo ancho que la captura "antes" de esta feature, para comparar. */
  await s.resize(1280, 860);
  await esperar(s, 800);
  await s.page.eval(`document.getElementById('btnNavMes').click(); 'ok'`);
  await esperar(s);
  await s.shot(path.join(DIR, 'MOSTRAR-5-mes-1280-admin.png'));

  /* 1024: el rail pasa a drawer. Se abre para que se vea el panel. */
  await s.resize(1024, 900);
  await esperar(s, 900);
  await s.page.eval(`document.getElementById('btnToggleMobileSidebar').click(); 'ok'`);
  await esperar(s, 900);
  await s.shot(path.join(DIR, 'MOSTRAR-6-drawer-1024.png'));
  await s.page.eval(`document.getElementById('btnCloseSidebar').click(); 'ok'`);
  await esperar(s, 900);
  await s.shot(path.join(DIR, 'MOSTRAR-7-mes-1024.png'));

  console.log('capturas listas en ' + DIR);
} finally {
  await s.close();
}