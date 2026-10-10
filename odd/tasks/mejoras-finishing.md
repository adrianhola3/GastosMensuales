# Feature: mejoras de finishing

## Objetivo

Aplicar las mejoras pendientes que son defectos o debilidades medibles, sin
tocar la direccion de diseño ya establecida.

## Tareas

- [ ] M1 Consolidado: la banda de 3 KPIs deja ~730px de aire por fila. Pasarla a
      celdas de 3, consistente con `.metrics-row` de Vista Mensual.
- [ ] M2 El donut tiene el hole vacio: mostrar el total de egresos en el centro.
- [ ] M3 Columna "Progreso" de la matriz: un 0% se lee como dato faltante. Mostrar
      una pista (track) hairline siempre visible.
- [ ] M4 Favicon: hoy `favicon.ico`, `manifest.json` y `apple-touch-icon.png` dan
      404 y la pestana muestra el icono generico. Crear el icono y declararlo.
- [ ] M5 `ESC` no cierra ninguno de los 4 modales. Verificar y arreglar.
- [ ] M6 Publicar y verificar en el sitio real.

## Por que cada una

**M1** En Vista Mensual los KPIs viven en 4 celdas con filete vertical. En
Consolidado son 3 filas que se estiran de_orilla a orilla: 1080px de ancho para
"Balance acumulado" y un numero. Es la misma idea mostrada de dos formas, y la
segunda desperdicia el ancho.

**M2** El donut es la unica grafica con un hole deliberadamente vacio. En una app
financiera el total es el dato, y pertenece al centro del anillo. Es el patron
que ya usan todas las graficas de donut con lectura rapida.

**M3** Una celda vacia no comunica 0%. Una pista hairline con el 0% a la izquierda
distingue "cero" de "sin dato".

**M4** Es un 404 real en consola de cada visita, y el icono de la pestana es el
generico del navegador. Un icono propio, con los mismos tokens, cierra las dos
cosas. Ojo: hay que **sumar el archivo a `FILES_TO_SYNC` de `sync_github.js`** o el
deploy lo ignora y el sitio publicado no lo tendra.

**M5** Cerrar un modal con ESC es la expectativa estandar de cualquier dialogo. Hoy
no cierra ninguno de los 4. Hay que verificar primero si es intencional: si hay
un modal de confirmacion con datos sin guardar, ESC no debe cerrar a la ligera.

## Restricciones

1. `js/store.js`, `js/config.js`, `js/supabase-store.js` NO se tocan.
2. Cada id o clase que se mueva o renombre actualiza su binding en el mismo
   cambio. Regenerar `odd\tasks\dom-contract-snapshot.txt`.
3. Tema claro por defecto, `.theme-dark` preservado. Cero `prefers-color-scheme`.
4. Contraste AA en todo texto nuevo que se agregue. Los colores del donut y de la
   pista salen de tokens.
5. Cero emoji. Sin `box-shadow` decorativo.
6. **NO publiques nada**: la publicacion la hago yo al final.
7. No borres los JPG de `assets/icons/` ni los saques de `FILES_TO_SYNC`.

## Verificacion

- 0 excepciones y 0 `console.error` en Vista Mensual y Consolidado.
- Cero 404 en consola: el favicon tiene que resolver.
- ESC cierra cada uno de los 4 modales, y NO cierra por descarte un dialogo con
  cambios sin guardar (verificar si existe).
- Contraste AA de todo texto nuevo, medido y resuelto a `rgb()`.
- Sin overflow a 1440, 1280, 1024.
- Rail 900/900, 0 cifras, 0 meses.
- Capturas SOLO del viewport, con `Network.setCacheDisabled { cacheDisabled: true }`.