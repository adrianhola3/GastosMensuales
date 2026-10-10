/**
 * SYNC_GITHUB.JS - Script de sincronización autónoma con GitHub API
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const REPO_OWNER = 'adrianhola3';
const REPO_NAME = 'GastosMensuales';
const BRANCH = 'main';

// --dry-run: informa que haria sin escribir nada en GitHub.
const DRY_RUN = process.argv.includes('--dry-run');
const messageArg = process.argv.slice(2).find(a => a !== '--dry-run');

// Leer token desde archivo local
let TOKEN = '';
try {
  TOKEN = fs.readFileSync(path.join(__dirname, '.github_token'), 'utf8').trim();
} catch (e) {
  console.error('Error: No se encontró el archivo .github_token');
  process.exit(1);
}

const commitMessage = messageArg || 'Actualización automática de interfaz y lógica financiera';

/**
 * SHA de un blob git, tal como lo calcula GitHub: sha1("blob " + tamaño + "\0" + contenido).
 * Permite comparar contra el campo `sha` de la API sin depender de base64, que
 * viene partido en lineas de 60 caracteres y se trunca en archivos grandes.
 */
function gitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

// Lista de archivos a sincronizar
// El orden replica el que carga index.html: config y supabase-store existen antes
// que store, asi que un despliegue parcial no rompe la app.
const FILES_TO_SYNC = [
  'README.md',
  'index.html',
  'favicon.svg',
  'css/styles.css',
  'js/config.js',
  'js/supabase-store.js',
  'js/store.js',
  'js/charts.js',
  'js/app.js',
  'assets/icons/servicios.jpg',
  'assets/icons/personales.jpg',
  'assets/icons/movimientos.jpg',
  'assets/icons/extras.jpg',
  'assets/icons/vertodo.jpg',
  'assets/icons/notas.jpg',
  'assets/icons/calendario.jpg',
  'assets/icons/analitica.jpg'
];

function githubRequest(method, apiPath, bodyData = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: method,
      headers: {
        'User-Agent': 'NodeJS-GitHub-Sync',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } else if (res.statusCode === 404) {
          resolve({ status: 404, body: null });
        } else {
          reject(new Error(`GitHub API error (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function syncFile(relPath) {
  const localFilePath = path.join(__dirname, relPath);
  if (!fs.existsSync(localFilePath)) {
    console.log(`[SALTADO] Archivo no existe localmente: ${relPath}`);
    return 'omitido';
  }

  const contentBuffer = fs.readFileSync(localFilePath);
  const contentBase64 = contentBuffer.toString('base64');
  const localSha = gitBlobSha(contentBuffer);

  // 1. Consultar el estado remoto del archivo
  // 404 = no existe todavia -> es un archivo nuevo.
  // Cualquier otro fallo (401, 403, 5xx) se reporta en vez de tragarselo:
  // antes un catch vacio los ocultaba y el script{subia a ciegas sin `sha`,
  // lo que GitHub rechaza con 422.
  let remoteSha = null;
  let esNuevo = false;
  try {
    const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${relPath}?ref=${BRANCH}`);
    if (res.status === 200 && res.body && res.body.sha) {
      remoteSha = res.body.sha;
    } else if (res.status === 404) {
      esNuevo = true;
    }
  } catch (e) {
    console.error(`[ERROR] no se pudo consultar ${relPath}: ${e.message}`);
    return 'error';
  }

  // 2. Comparar por SHA de blob, no por base64. Es exacto y no depende de
  //    como GitHub envuelva el contenido.
  if (!esNuevo && remoteSha === localSha) {
    console.log(`[AL DÍA] ${relPath}`);
    return 'alDia';
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] ${esNuevo ? 'crearia' : 'actualizaria'} ${relPath} (sha ${localSha.slice(0, 7)})`);
    return 'escrito';
  }

  // 3. Subir o actualizar
  const payload = {
    message: `${commitMessage} (${relPath})`,
    content: contentBase64,
    branch: BRANCH
  };
  if (remoteSha) {
    payload.sha = remoteSha;
  }

  const putRes = await githubRequest('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${relPath}`, payload);
  if (putRes.status === 200 || putRes.status === 201) {
    console.log(`[SUBIDO] ${relPath}`);
    return 'escrito';
  }
  console.error(`[ERROR] ${relPath}: HTTP ${putRes.status}`);
  return 'error';
}

async function run() {
  console.log(`=== Sincronizando con https://github.com/${REPO_OWNER}/${REPO_NAME} ===`);
  if (DRY_RUN) {
    console.log('=== MODO DRY-RUN: no se escribira nada en GitHub ===');
  }
  const resumen = { alDia: 0, escritos: 0, omitidos: 0, errores: 0 };
  for (const f of FILES_TO_SYNC) {
    try {
      const r = await syncFile(f);
      if (r === 'alDia') resumen.alDia++;
      else if (r === 'escrito') resumen.escritos++;
      else if (r === 'omitido') resumen.omitidos++;
    } catch (err) {
      console.error(`[ERROR] en ${f}:`, err.message);
      resumen.errores++;
    }
  }
  console.log('=== Resumen ===');
  const col = (etiqueta) => etiqueta.padEnd(11, ' ');
  console.log(`    ${col('al dia')}  : ${resumen.alDia}`);
  console.log(`    ${col(DRY_RUN ? 'a escribir' : 'escritos')}  : ${resumen.escritos}`);
  console.log(`    ${col('omitidos')}  : ${resumen.omitidos}  (no existen en local)`);
  console.log(`    ${col('errores')}  : ${resumen.errores}`);
  console.log('=== Sincronización finalizada ===');
}

run();
