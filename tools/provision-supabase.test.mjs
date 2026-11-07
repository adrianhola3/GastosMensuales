#!/usr/bin/env node
/**
 * provision-supabase.test.mjs
 * ---------------------------------------------------------------------------
 * Prueba del aprovisionador contra un Supabase FALSO en localhost.
 *
 * QUE COMPRUEBA
 *   Que las cuatro fases (init, wait, apply, verify) corran de punta a punta y
 *   que los pedidos tengan la forma correcta: dos migraciones, claves pedidas
 *   con reveal, usuario creado con app_metadata.role, registro publico cerrado,
 *   config.js escrito SOLO con la publishable key, y verify probando tanto la
 *   escritura anonima (rechazada) como la autenticada (aceptada).
 *
 * QUE NO TOCA
 *   Ni la nube, ni la cuenta, ni el js/config.js real: trabaja sobre copias en
 *   el directorio temporal.
 *
 * USO
 *   node tools/provision-supabase.test.mjs
 *
 * NOTA SOBRE EL DISENO
 *   El servidor falso vive en este mismo proceso, por eso los hijos se lanzan
 *   con spawn asincrono. Con execFileSync el event loop queda bloqueado y el
 *   servidor nunca llega a responder: el hijo se cuelga esperando.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(RAIZ, 'tools', 'provision-supabase.mjs');
const DIR = join(tmpdir(), 'provision-test');
if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const TOKEN = join(DIR, '.supabase_token');
const STATE = join(DIR, 'state.json');
const CONFIG = join(DIR, 'config.js');
writeFileSync(TOKEN, 'sbp_fake_token_para_pruebas', 'utf8');
copyFileSync(join(RAIZ, 'js', 'config.js'), CONFIG);

const llamadas = [];
const ADMIN_TOKEN = 'TOKEN_ADMIN_VALIDO';

function cuerpo(req) {
  return new Promise(res => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => res(d));
  });
}

const servidor = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const auth = req.headers.authorization || '';
  const body = await cuerpo(req);
  llamadas.push({ method: req.method, path: p, auth: auth.slice(0, 30), body: body.slice(0, 120) });

  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  // --- Management API ---
  if (p === '/v1/organizations') return json(200, [{ slug: 'mockorg', name: 'Mock Org' }]);
  if (p === '/v1/projects' && req.method === 'POST') {
    const b = JSON.parse(body || '{}');
    if (!b.db_pass || !b.name || !b.organization_slug) return json(400, { message: 'faltan campos' });
    return json(201, { ref: 'mockref', status: 'COMING_UP' });
  }
  if (p === '/v1/projects/mockref') return json(200, { ref: 'mockref', status: 'ACTIVE_HEALTHY' });
  if (p === '/v1/projects/mockref/api-keys') {
    if (u.searchParams.get('reveal') !== 'true') return json(400, { message: 'falta reveal' });
    return json(200, [
      { type: 'publishable', name: 'default', api_key: 'sb_publishable_MOCK' },
      { type: 'secret', name: 'default', api_key: 'sb_secret_MOCK' }
    ]);
  }
  if (p === '/v1/projects/mockref/database/query' && req.method === 'POST') {
    const b = JSON.parse(body || '{}');
    if (!b.query) return json(400, { message: 'falta query' });
    return json(201, []);
  }
  if (p === '/v1/projects/mockref/config/auth' && req.method === 'PATCH') {
    const b = JSON.parse(body || '{}');
    if (b.disable_signup !== true) return json(400, { message: 'esperaba disable_signup true' });
    return json(200, { disable_signup: true });
  }

  // --- Auth API ---
  if (p === '/auth/v1/admin/users' && req.method === 'POST') {
    const b = JSON.parse(body || '{}');
    if (!b.email || !b.password) return json(400, { message: 'faltan datos' });
    if (b.app_metadata?.role !== 'admin') return json(400, { message: 'falta app_metadata.role' });
    return json(201, { id: 'user-1', email: b.email, app_metadata: b.app_metadata });
  }
  if (p === '/auth/v1/admin/users' && req.method === 'GET') return json(200, { users: [] });
  if (p === '/auth/v1/token') {
    const b = JSON.parse(body || '{}');
    if (!b.email || !b.password) return json(400, { message: 'faltan datos' });
    return json(200, { access_token: ADMIN_TOKEN, user: { app_metadata: { role: 'admin' } } });
  }
  if (p === '/auth/v1/settings') return json(200, { disable_signup: true, external: { email: true } });

  // --- REST ---
  if (p === '/rest/v1/gastos' && req.method === 'GET') {
    if (!req.headers.apikey) return json(401, { message: 'falta apikey' });
    return json(200, []);
  }
  if (p === '/rest/v1/gastos' && req.method === 'POST') {
    if (auth.includes(ADMIN_TOKEN)) { res.writeHead(201); return res.end(); }
    return json(401, { message: 'RLS: escritura anonima rechazada' });
  }
  if (p === '/rest/v1/gastos' && req.method === 'DELETE') { res.writeHead(204); return res.end(); }

  return json(404, { message: `ruta no simulada: ${req.method} ${p}` });
});

await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;
const base = `http://127.0.0.1:${puerto}`;

const env = {
  ...process.env,
  SUPABASE_TOKEN_FILE: TOKEN,
  SUPABASE_STATE_FILE: STATE,
  GASTOS_CONFIG_FILE: CONFIG,
  SUPABASE_API_BASE: base
};

function correr(fase, extra = []) {
  return new Promise(resolve => {
    const hijo = spawn(process.execPath, [SCRIPT, fase, ...extra], { env, cwd: RAIZ });
    let out = '';
    hijo.stdout.on('data', d => out += d);
    hijo.stderr.on('data', d => out += d);
    hijo.on('close', code => resolve({ ok: code === 0, out, code }));
  });
}

const resultados = [];
const check = (nombre, cond, detalle = '') => resultados.push({ nombre, ok: !!cond, detalle });

// 1. init
let r = await correr('init', ['--org', 'mockorg', '--email', 'admin@ejemplo.com']);
check('init sale con codigo 0', r.code === 0, r.out.trim().split('\n').slice(-2).join(' | '));
if (r.code !== 0) {
  console.log('\n--- SALIDA CRUDA DE init ---\n' + r.out + '\n--- FIN ---');
  servidor.close();
  process.exit(1);
}
let estado = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
check('init guarda el ref del proyecto', estado?.ref === 'mockref', estado?.ref);
check('init genera una contrasena de base', typeof estado?.dbPass === 'string' && estado.dbPass.length >= 16);

// El mock vive en localhost: se apunta ahi para que apply y verify lo usen.
estado.url = base;
writeFileSync(STATE, JSON.stringify(estado, null, 2), 'utf8');

// 2. wait
r = await correr('wait');
check('wait detecta ACTIVE_HEALTHY y termina', r.code === 0, r.out.trim().split('\n').slice(-1)[0]);

// 3. apply
r = await correr('apply');
check('apply sale con codigo 0', r.code === 0, r.out.trim().split('\n').slice(-1)[0]);

const consultas = llamadas.filter(l => l.path === '/v1/projects/mockref/database/query');
check('apply corre las DOS migraciones', consultas.length === 2, `consultas=${consultas.length}`);

const claves = llamadas.filter(l => l.path === '/v1/projects/mockref/api-keys');
check('pide las claves con reveal=true', claves.length === 1);

const usuario = llamadas.filter(l => l.path === '/auth/v1/admin/users' && l.method === 'POST');
check('crea el usuario administrador', usuario.length === 1);

const cierre = llamadas.filter(l => l.path === '/v1/projects/mockref/config/auth' && l.method === 'PATCH');
check('desactiva el registro publico', cierre.length === 1);

const configTexto = readFileSync(CONFIG, 'utf8');
check('config.js queda con modoLocal false', /modoLocal:\s*false/.test(configTexto));
check('config.js queda con la URL del proyecto', configTexto.includes(`supabaseUrl: '${base}'`));
check('config.js queda con la publishable key', configTexto.includes('sb_publishable_MOCK'));
check('config.js NO queda con la secret key', !configTexto.includes('sb_secret_MOCK'));

estado = JSON.parse(readFileSync(STATE, 'utf8'));
check('guarda la contrasena del admin', typeof estado.adminPassword === 'string' && estado.adminPassword.length >= 12);
check('marca la fecha de aplicacion', typeof estado.aplicado === 'string');

// 4. verify
r = await correr('verify');
check('verify sale con codigo 0 (todo verde)', r.code === 0, r.out.trim().split('\n').slice(-1)[0]);

const verificacion = llamadas.filter(l => l.path === '/rest/v1/gastos' && l.method === 'POST');
check('verify prueba escritura anonima Y autenticada', verificacion.length === 2, `post=${verificacion.length}`);
const limpieza = llamadas.filter(l => l.path === '/rest/v1/gastos' && l.method === 'DELETE');
check('verify limpia la fila de prueba', limpieza.length === 1);
check('el token no se imprime en la salida', !r.out.includes('sbp_fake_token_para_pruebas'));

servidor.close();

console.log('\n=== RESULTADO DEL BANCO DE PRUEBAS ===');
let fallos = 0;
for (const x of resultados) {
  if (!x.ok) fallos++;
  console.log(`  ${x.ok ? 'OK  ' : 'MAL '} ${x.nombre}${x.detalle ? '  [' + String(x.detalle).slice(0, 90) + ']' : ''}`);
}
console.log(`\n${resultados.length - fallos}/${resultados.length} comprobaciones OK`);
process.exit(fallos === 0 ? 0 : 1);
