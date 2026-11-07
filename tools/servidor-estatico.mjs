#!/usr/bin/env node
/**
 * servidor-estatico.mjs - Sirve el proyecto para probarlo en el navegador.
 *
 * La app no tiene build: son archivos planos. Pero abrir `index.html` con
 * `file://` rompe los modulos y las peticiones a Supabase por CORS, asi que hace
 * falta un origen http real. Este servidor es eso y nada mas: no hay logica de
 * negocio aca.
 *
 * Uso:
 *   node tools/servidor-estatico.mjs [--puerto 8787]
 *
 * Se sirve la raiz del repositorio, calculada desde la ubicacion del script, no
 * desde el directorio de trabajo: correrlo desde otra carpeta no cambia que se
 * sirve.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

const argumentos = process.argv.slice(2);
const indice = argumentos.indexOf('--puerto');
const PUERTO = Number(indice >= 0 ? argumentos[indice + 1] : process.env.PUERTO || 8787);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let ruta = decodeURIComponent(url.pathname);
    if (ruta === '/') ruta = '/index.html';

    const destino = normalize(join(RAIZ, ruta));
    // Impide salir de la raiz con ../ o rutas absolutas.
    if (destino !== RAIZ && !destino.startsWith(RAIZ + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Fuera de la raiz servida.');
    }

    const datos = await readFile(destino);
    res.writeHead(200, {
      'content-type': TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
      // Sin cache: al probar, un archivo viejo en cache miente sobre el estado real.
      'cache-control': 'no-store'
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado.');
  }
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`Sirviendo ${RAIZ}`);
  console.log(`http://127.0.0.1:${PUERTO}/`);
});
