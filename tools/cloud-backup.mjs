/**
 * cloud-backup.mjs
 * -----------------------------------------------------------------------------
 * Extrae el estado completo de la base de datos de Gastos Mensuales en Supabase
 * y lo preserva versionado en el repositorio (carpeta backups/).
 * 
 * Se ejecuta automáticamente vía GitHub Actions todas las noches a las 05:00 UTC (00:00 Perú).
 * También resetea el contador de 7 días de inactividad de Supabase (Keep-Alive).
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SUPABASE_URL = 'https://bgcgmofroibrxthvdlil.supabase.co/rest/v1/gastos?select=*';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnY2dtb2Zyb2licnh0aHZkbGlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzAxNjIsImV4cCI6MjEwNjQwNjE2Mn0.utBPVyah8BSXV9Nntioh6W8tpUmSii7JiOMNY5z7aG8';

const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const HISTORY_DIR = path.join(BACKUPS_DIR, 'history');
const MAX_HISTORY_DAYS = 30;

function fetchSupabaseData() {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'User-Agent': 'GitHub-Actions-CloudBackup/1.0'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Error al parsear JSON: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout al consultar Supabase (15s)'));
    });

    req.end();
  });
}

async function runBackup() {
  console.log('Iniciando extracción de respaldo desde Supabase...');
  const rows = await fetchSupabaseData();

  if (!Array.isArray(rows) || rows.length === 0 || !rows[0].data) {
    throw new Error('Estructura de datos inválida recibida de Supabase');
  }

  const payload = rows[0].data;
  const updatedAt = rows[0].updated_at || new Date().toISOString();
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  const backupMeta = {
    exported_at: new Date().toISOString(),
    source_updated_at: updatedAt,
    version: payload.version || 1,
    months_count: payload.meses ? Object.keys(payload.meses).length : 0,
    data: payload
  };

  const formattedJson = JSON.stringify(backupMeta, null, 2);

  // 1. Guardar última versión
  const latestPath = path.join(BACKUPS_DIR, 'gastos_latest.json');
  fs.writeFileSync(latestPath, formattedJson, 'utf-8');
  console.log(`✅ Guardado: ${latestPath}`);

  // 2. Guardar snapshot histórico del día
  const historyPath = path.join(HISTORY_DIR, `gastos_backup_${dateStr}.json`);
  fs.writeFileSync(historyPath, formattedJson, 'utf-8');
  console.log(`✅ Snapshot diario guardado: ${historyPath}`);

  // 3. Poda rotativa de historial (mantener últimos 30 días)
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith('gastos_backup_') && f.endsWith('.json'))
    .sort();

  while (files.length > MAX_HISTORY_DAYS) {
    const oldest = files.shift();
    const oldestPath = path.join(HISTORY_DIR, oldest);
    fs.unlinkSync(oldestPath);
    console.log(`🧹 Podado histórico antiguo: ${oldest}`);
  }

  console.log('Respaldo en la nube completado exitosamente.');
}

runBackup().catch(err => {
  console.error('❌ Error en cloud-backup:', err);
  process.exit(1);
});
