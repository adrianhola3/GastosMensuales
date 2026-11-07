#!/usr/bin/env node
/**
 * provision-supabase.mjs
 * ---------------------------------------------------------------------------
 * Deja la nube funcionando de punta a punta, sin entrar al panel.
 *
 * QUE HACE
 *   1. Crea el proyecto en Supabase (Management API).
 *   2. Espera a que la base este sana.
 *   3. Corre sql/00-esquema.sql y sql/01-seguridad.sql.
 *   4. Crea el usuario administrador con app_metadata.role = 'admin' y una
 *      contrasena nueva, aleatoria.
 *   5. Desactiva el registro publico por correo.
 *   6. Escribe js/config.js con la URL y la publishable key reales.
 *   7. Verifica de verdad: lectura anonima permitida, escritura anonima
 *      rechazada, escritura del administrador aceptada.
 *
 * QUE NECESITA
 *   Un Personal Access Token de Supabase en `.supabase_token`
 *   (Dashboard > Account > Access Tokens > Generate new token). El archivo esta
 *   en .gitignore y el token nunca se imprime.
 *
 * POR QUE EN FASES
 *   Crear un proyecto tarda entre uno y tres minutos. Un solo comando que haga
 *   todo se pasa del limite de 120 s del shell. Cada fase es re-ejecutable y el
 *   estado vive en `.provision-state.json`, asi que un corte no pierde nada.
 *
 * USO
 *   node tools/provision-supabase.mjs status
 *   node tools/provision-supabase.mjs init   [--org <slug>] [--region sa-east-1]
 *   node tools/provision-supabase.mjs adopt  --ref <ref> [--email <correo>]
 *   node tools/provision-supabase.mjs wait
 *   node tools/provision-supabase.mjs apply  [--email <correo>]
 *   node tools/provision-supabase.mjs verify
 *   node tools/provision-supabase.mjs all      (init + wait + apply + verify)
 *
 * INIT O ADOPT
 *   `init` crea un proyecto nuevo. `adopt` toma uno que ya existe: el plan Free
 *   tiene un tope de proyectos, y un proyecto pausado por inactividad se puede
 *   restaurar en vez de crear otro. Las dos fases dejan el mismo estado en
 *   disco, asi que wait/apply/verify no cambian.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Las rutas y la base de la API se pueden redirigir por entorno. Sirve para
// probar el flujo completo contra un servidor falso, sin tocar una cuenta real.
const TOKEN_FILE = process.env.SUPABASE_TOKEN_FILE || join(RAIZ, '.supabase_token');
const STATE_FILE = process.env.SUPABASE_STATE_FILE || join(RAIZ, '.provision-state.json');
const CONFIG_FILE = process.env.GASTOS_CONFIG_FILE || join(RAIZ, 'js', 'config.js');
const ESQUEMA_SQL = join(RAIZ, 'sql', '00-esquema.sql');
const SEGURIDAD_SQL = join(RAIZ, 'sql', '01-seguridad.sql');

const API = process.env.SUPABASE_API_BASE || 'https://api.supabase.com';
const NOMBRE_PROYECTO = 'gastos-mensuales';
const REGION_POR_DEFECTO = 'sa-east-1';
const ESPERA_POR_FASE_MS = 85000;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const fase = args[0] || 'status';

function bandera(nombre, porDefecto = null) {
  const i = args.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  const valor = args[i + 1];
  return valor && !valor.startsWith('--') ? valor : true;
}

function log(msg) {
  // Solo ASCII: la consola de esta maquina no renderiza otra cosa (A-003).
  console.log(msg);
}

function morir(msg, codigo = 1) {
  console.error(`FALLO: ${msg}`);
  process.exit(codigo);
}

function leerToken() {
  if (!existsSync(TOKEN_FILE)) {
    morir(
      `no existe ${TOKEN_FILE}.\n` +
      '  Crea un token en https://supabase.com/dashboard/account/tokens\n' +
      '  y guardalo con:  Set-Content -NoNewline .supabase_token "sbp_..."'
    );
  }
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!token) morir('el archivo .supabase_token esta vacio');
  if (!/^sbp_/.test(token)) {
    morir('el token no empieza con sbp_. Un access token de Supabase empieza asi.');
  }
  return token;
}

function leerEstado() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    morir(`el estado guardado esta corrupto: ${e.message}`);
  }
}

function guardarEstado(estado) {
  writeFileSync(STATE_FILE, JSON.stringify(estado, null, 2), 'utf8');
}

function nuevoSecreto(bytes = 24) {
  // Sin caracteres que rompan URLs, JSON o el portapapeles.
  return randomBytes(bytes).toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 32);
}

async function api(ruta, opciones = {}) {
  const token = leerToken();
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    }
  });
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
  if (!res.ok) {
    const detalle = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const err = new Error(`${opciones.method || 'GET'} ${ruta} -> ${res.status}: ${String(detalle).slice(0, 400)}`);
    err.status = res.status;
    err.cuerpo = cuerpo;
    throw err;
  }
  return cuerpo;
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Fase: init
// ---------------------------------------------------------------------------

async function init() {
  const estado = leerEstado();
  if (estado && estado.ref) {
    log(`Ya hay un proyecto registrado: ${estado.ref} (${estado.name}). Nada que crear.`);
    return estado;
  }

  let orgSlug = bandera('org');
  if (!orgSlug) {
    const orgs = await api('/v1/organizations');
    const lista = Array.isArray(orgs) ? orgs : [];
    if (lista.length === 0) {
      morir('la cuenta no tiene ninguna organizacion. Crea una en el panel y volve a correr init.');
    }
    if (lista.length > 1) {
      log('Hay mas de una organizacion. Eleji una con --org <slug>:');
      for (const o of lista) log(`  ${o.slug}  ${o.name || ''}`);
      morir('falta --org');
    }
    orgSlug = lista[0].slug;
    log(`Organizacion: ${orgSlug}`);
  }

  const region = bandera('region', REGION_POR_DEFECTO);
  const dbPass = nuevoSecreto(24);

  log(`Creando proyecto "${NOMBRE_PROYECTO}" en ${region}...`);
  const creado = await api('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: NOMBRE_PROYECTO,
      organization_slug: orgSlug,
      db_pass: dbPass,
      region
    })
  });

  const ref = creado.ref || creado.id;
  if (!ref) morir(`la respuesta no trae ref: ${JSON.stringify(creado).slice(0, 300)}`);

  const nuevo = {
    ref,
    name: NOMBRE_PROYECTO,
    region,
    organization: orgSlug,
    dbPass,
    adminEmail: bandera('email', null),
    adminPassword: null,
    anonKey: null,
    serviceKey: null,
    url: `https://${ref}.supabase.co`,
    creado: new Date().toISOString(),
    aplicado: null
  };
  guardarEstado(nuevo);
  log(`Proyecto creado: ${ref}`);
  log(`URL: https://${ref}.supabase.co`);
  log('Siguiente paso:  node tools/provision-supabase.mjs wait');
  return nuevo;
}

// ---------------------------------------------------------------------------
// Fase: adopt
// ---------------------------------------------------------------------------
//
// Para cuando el proyecto YA existe (por ejemplo, quedo pausado por inactividad
// y se restauro desde el panel o con POST /restore). Crear uno nuevo no siempre
// es una opcion: el plan Free tiene un tope de proyectos. Adoptar toma el
// proyecto tal como esta y escribe el mismo estado que produciria init, asi que
// wait, apply y verify siguen funcionando sin cambios.

async function adopt() {
  const ref = bandera('ref');
  if (!ref || ref === true) morir('falta --ref <ref> del proyecto a adoptar');

  const proyecto = await api(`/v1/projects/${ref}`);
  if (!proyecto || !proyecto.ref) morir(`no pude leer el proyecto ${ref}`);

  const nuevo = {
    ref: proyecto.ref,
    name: proyecto.name || NOMBRE_PROYECTO,
    region: proyecto.region || null,
    organization: proyecto.organization_slug || proyecto.organization_id || null,
    // La contrasena de la base no se puede recuperar: se genero al crear el
    // proyecto y no la tenemos. No hace falta para este flujo, que opera con la
    // Management API y la service key.
    dbPass: null,
    adminEmail: bandera('email', null),
    adminPassword: null,
    anonKey: null,
    serviceKey: null,
    url: `https://${ref}.supabase.co`,
    creado: proyecto.created_at || new Date().toISOString(),
    aplicado: null,
    adoptado: true
  };
  guardarEstado(nuevo);

  log(`Proyecto adoptado: ${ref} (${nuevo.name})`);
  log(`  estado actual: ${proyecto.status}`);
  log(`  URL: ${nuevo.url}`);
  if (proyecto.status !== 'ACTIVE_HEALTHY') {
    log('  Todavia no esta sano: si esta INACTIVE, restaura con POST /restore.');
    log('  Despues:  node tools/provision-supabase.mjs wait');
  } else {
    log('Siguiente paso:  node tools/provision-supabase.mjs apply --email <correo>');
  }
  return nuevo;
}

// ---------------------------------------------------------------------------
// Fase: wait
// ---------------------------------------------------------------------------

async function wait() {
  const estado = leerEstado();
  if (!estado || !estado.ref) morir('no hay proyecto. Corre init primero.');

  const limite = Date.now() + ESPERA_POR_FASE_MS;
  let ultimo = null;

  while (Date.now() < limite) {
    const proyecto = await api(`/v1/projects/${estado.ref}`);
    ultimo = proyecto.status;
    log(`estado: ${ultimo}`);
    if (ultimo === 'ACTIVE_HEALTHY' || ultimo === 'ACTIVE') {
      log('La base esta lista.');
      return estado;
    }
    if (ultimo === 'INIT_FAILED' || ultimo === 'PAUSED') {
      morir(`el proyecto quedo en ${ultimo}. Revisalo en el panel.`);
    }
    await dormir(5000);
  }

  log(`Todavia no. Ultimo estado: ${ultimo}.`);
  log('No es un error: volve a correr  node tools/provision-supabase.mjs wait');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Fase: apply
// ---------------------------------------------------------------------------

async function obtenerClaves(estado) {
  if (estado.anonKey && estado.serviceKey) return estado;

  const claves = await api(`/v1/projects/${estado.ref}/api-keys?reveal=true`);
  const lista = Array.isArray(claves) ? claves : (claves.keys || []);

  // Proyectos nuevos devuelven publishable/secret; los viejos, anon/service_role.
  const buscar = (patrones) => lista.find(k => {
    const etiqueta = `${k.type || ''} ${k.name || ''} ${k.id || ''}`.toLowerCase();
    return patrones.some(p => etiqueta.includes(p));
  });

  const pub = buscar(['publishable', 'anon']);
  const sec = buscar(['secret', 'service_role', 'service']);

  if (!pub || !sec) {
    const formas = lista.map(k => `${k.type || '?'}/${k.name || '?'}`).join(', ');
    morir(`no encontre las dos claves. Lo que devolvio la API: ${formas || 'nada'}`);
  }

  estado.anonKey = pub.api_key || pub.api_key_value || pub.key;
  estado.serviceKey = sec.api_key || sec.api_key_value || sec.key;
  if (!estado.anonKey || !estado.serviceKey) morir('las claves vinieron vacias');
  guardarEstado(estado);
  log('Claves obtenidas (publishable + secret).');
  return estado;
}

async function correrSql(estado, archivo, etiqueta) {
  const query = readFileSync(archivo, 'utf8');
  log(`Aplicando ${etiqueta}...`);
  await api(`/v1/projects/${estado.ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  log(`  ${etiqueta}: OK`);
}

async function crearAdmin(estado) {
  const email = estado.adminEmail || bandera('email');
  if (!email) {
    morir('falta el correo del administrador. Corre apply con --email <correo>.');
  }
  const password = estado.adminPassword || nuevoSecreto(18);
  const url = estado.url || `https://${estado.ref}.supabase.co`;
  const cabeceras = {
    apikey: estado.serviceKey,
    Authorization: `Bearer ${estado.serviceKey}`,
    'Content-Type': 'application/json'
  };

  log(`Creando administrador ${email}...`);
  let res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'admin' }
    })
  });
  let cuerpo = await res.json().catch(() => null);

  if (!res.ok) {
    // Ya existe: se actualiza la contrasena y se asegura el rol.
    const lista = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: cabeceras });
    const pagina = await lista.json().catch(() => null);
    const usuarios = pagina?.users || [];
    const existente = usuarios.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!existente) {
      morir(`no pude crear ni encontrar el usuario: ${JSON.stringify(cuerpo).slice(0, 300)}`);
    }
    log(`  ya existia (${existente.id}): actualizo rol y contrasena`);
    res = await fetch(`${url}/auth/v1/admin/users/${existente.id}`, {
      method: 'PUT',
      headers: cabeceras,
      body: JSON.stringify({
        password,
        email_confirm: true,
        app_metadata: { ...(existente.app_metadata || {}), role: 'admin' }
      })
    });
    cuerpo = await res.json().catch(() => null);
    if (!res.ok) morir(`no pude actualizar el usuario: ${JSON.stringify(cuerpo).slice(0, 300)}`);
  }

  estado.adminEmail = email;
  estado.adminPassword = password;
  guardarEstado(estado);
  log('  administrador listo (rol admin en app_metadata).');
  return estado;
}

async function cerrarRegistro(estado) {
  log('Desactivando el registro publico por correo...');
  await api(`/v1/projects/${estado.ref}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({ disable_signup: true })
  });
  log('  registro cerrado: solo existen las cuentas creadas a mano.');
}

function escribirConfig(estado) {
  if (!existsSync(CONFIG_FILE)) morir(`no encuentro ${CONFIG_FILE}`);
  let texto = readFileSync(CONFIG_FILE, 'utf8');

  // Las tres sustituciones van ancladas a lineas de configuracion (indentadas,
  // terminadas en coma) y no a "la primera aparicion del texto". El comentario
  // de cabecera de config.js menciona `modoLocal: false` en prosa, y un
  // replace suelto golpeaba ESA aparicion: el archivo decia "actualizado" y la
  // linea real seguia en true.
  const antes = texto;
  texto = texto.replace(/^(\s*)modoLocal:\s*(true|false)\s*,\s*$/m, '$1modoLocal: false,');
  texto = texto.replace(/^(\s*)supabaseUrl:\s*'[^']*'\s*,\s*$/m, `$1supabaseUrl: '${estado.url}',`);
  texto = texto.replace(/^(\s*)supabaseAnonKey:\s*'[^']*'\s*,?\s*$/m, `$1supabaseAnonKey: '${estado.anonKey}'`);

  if (texto === antes) {
    morir('no cambie nada en config.js: el formato no es el esperado. Revisalo a mano.');
  }

  writeFileSync(CONFIG_FILE, texto, 'utf8');

  // Se relee del disco y se comprueba el EFECTO, no la intencion.
  const escrito = readFileSync(CONFIG_FILE, 'utf8');
  const fallos = [];
  if (!/^\s*modoLocal:\s*false\s*,\s*$/m.test(escrito)) fallos.push('modoLocal no quedo en false');
  if (!new RegExp(`^\\s*supabaseUrl:\\s*'${estado.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*,?\\s*$`, 'm').test(escrito)) {
    fallos.push('supabaseUrl no quedo escrito');
  }
  if (!escrito.includes(estado.anonKey)) fallos.push('supabaseAnonKey no quedo escrito');
  if (fallos.length) morir(`config.js quedo mal: ${fallos.join('; ')}`);

  log(`config.js actualizado y verificado: modoLocal false, URL ${estado.url}`);
}

async function apply() {
  const estado = leerEstado();
  if (!estado || !estado.ref) morir('no hay proyecto. Corre init y wait primero.');
  if (!estado.adminEmail && !bandera('email')) {
    morir('falta el correo del administrador. Corre:  apply --email <correo>');
  }

  const conClaves = await obtenerClaves(estado);
  await correrSql(conClaves, ESQUEMA_SQL, '00-esquema.sql');
  await correrSql(conClaves, SEGURIDAD_SQL, '01-seguridad.sql');
  const conAdmin = await crearAdmin(conClaves);
  await cerrarRegistro(conAdmin);
  escribirConfig(conAdmin);

  conAdmin.aplicado = new Date().toISOString();
  guardarEstado(conAdmin);

  log('');
  log('=== CREDENCIALES DEL ADMINISTRADOR (se muestran una sola vez) ===');
  log(`  correo:     ${conAdmin.adminEmail}`);
  log(`  contrasena: ${conAdmin.adminPassword}`);
  log('  Guardalas en tu gestor de contrasenas. Tambien quedaron en');
  log(`  ${STATE_FILE} (ignorado por git).`);
  log('');
  log('Siguiente paso:  node tools/provision-supabase.mjs verify');
  return conAdmin;
}

// ---------------------------------------------------------------------------
// Fase: verify
// ---------------------------------------------------------------------------

async function verify() {
  const estado = leerEstado();
  if (!estado || !estado.ref) morir('no hay proyecto que verificar.');
  if (!estado.anonKey) morir('faltan claves: corre apply primero.');

  const url = estado.url || `https://${estado.ref}.supabase.co`;
  const resultados = [];

  // 1. Lectura anonima: la politica publica la permite.
  let res = await fetch(`${url}/rest/v1/gastos?select=id&limit=1`, {
    headers: { apikey: estado.anonKey, Authorization: `Bearer ${estado.anonKey}` }
  });
  resultados.push(['lectura anonima (debe funcionar)', res.status, res.ok]);

  // 2. Escritura anonima: RLS tiene que rechazarla.
  res = await fetch(`${url}/rest/v1/gastos`, {
    method: 'POST',
    headers: {
      apikey: estado.anonKey,
      Authorization: `Bearer ${estado.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ id: 999999999, data: { prueba: true } })
  });
  resultados.push(['escritura anonima (debe rechazarse)', res.status, res.status >= 400]);

  // 3. Login del administrador.
  res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: estado.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: estado.adminEmail, password: estado.adminPassword })
  });
  const sesion = await res.json().catch(() => null);
  const token = sesion?.access_token || null;
  resultados.push(['login del administrador', res.status, !!token]);

  // 4. El token tiene que traer el rol.
  const rol = sesion?.user?.app_metadata?.role || null;
  resultados.push(['rol en app_metadata', rol, rol === 'admin']);

  // 5. Escritura autenticada: tiene que aceptarla.
  if (token) {
    res = await fetch(`${url}/rest/v1/gastos`, {
      method: 'POST',
      headers: {
        apikey: estado.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ id: 999999999, data: { prueba: true } })
    });
    resultados.push(['escritura del administrador (debe funcionar)', res.status, res.ok]);

    // 6. ACTUALIZACION autenticada. Esta comprobacion falta en la version
    //    anterior y es la que importa: el trigger de `updated_at` es BEFORE
    //    UPDATE, asi que un INSERT puede pasar mientras todo UPDATE falla. El
    //    sintoma real era la app sin poder guardar, tapado por un console.warn.
    res = await fetch(`${url}/rest/v1/gastos?id=eq.999999999`, {
      method: 'PATCH',
      headers: {
        apikey: estado.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ data: { prueba: false } })
    });
    resultados.push(['actualizacion del administrador (debe funcionar)', res.status, res.ok]);

    // Limpieza: no dejar la fila de prueba.
    await fetch(`${url}/rest/v1/gastos?id=eq.999999999`, {
      method: 'DELETE',
      headers: { apikey: estado.anonKey, Authorization: `Bearer ${token}` }
    });
  }

  // 6. Registro publico cerrado.
  res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: estado.anonKey } });
  const ajustes = await res.json().catch(() => null);
  resultados.push(['registro publico desactivado', ajustes?.disable_signup, ajustes?.disable_signup === true]);

  log('');
  log('=== VERIFICACION ===');
  let fallos = 0;
  for (const [nombre, valor, ok] of resultados) {
    if (!ok) fallos++;
    log(`  ${ok ? 'OK  ' : 'MAL '} ${nombre} -> ${valor}`);
  }
  log('');
  if (fallos === 0) {
    log('Todo verde. La nube esta operativa y solo el administrador escribe.');
  } else {
    log(`${fallos} comprobacion(es) fallaron. Revisa arriba: no des por bueno el resultado.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fase: status
// ---------------------------------------------------------------------------

function status() {
  const estado = leerEstado();
  if (!estado) {
    log('Sin proyecto aprovisionado. Empeza con:  node tools/provision-supabase.mjs init');
    return;
  }
  log('=== ESTADO DEL APROVISIONAMIENTO ===');
  log(`  ref:        ${estado.ref}`);
  log(`  url:        ${estado.url}`);
  log(`  region:     ${estado.region}`);
  log(`  org:        ${estado.organization}`);
  log(`  creado:     ${estado.creado}`);
  log(`  aplicado:   ${estado.aplicado || 'todavia no'}`);
  log(`  admin:      ${estado.adminEmail || 'sin definir'}`);
  log(`  claves:     ${estado.anonKey ? 'obtenidas' : 'pendientes'}`);
}

// ---------------------------------------------------------------------------

async function all() {
  await init();
  await wait();
  await apply();
  await verify();
}

const fases = { init, adopt, wait, apply, verify, status, all };

if (!fases[fase]) {
  morir(`fase desconocida: ${fase}. Usa: ${Object.keys(fases).join(' | ')}`);
}

try {
  await fases[fase]();
} catch (e) {
  morir(e.message);
}
