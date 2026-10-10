# Feature: rediseño completo desde cero de la Web de Gastos Mensuales

## Objetivo

Reconstruir el diseño de toda la aplicacion desde cero con el sistema visual de
`apple-web-design`, conservando **todas** las funcionalidades actuales. El
usuario da libertad total para cambiar estructura, markup y CSS, con una unica
condicion dura: **tiene que funcionar**.

## Direccion de diseño (la idea central)

El diseño anterior eran **4 tarjetas flotantes en un grid 2x2**. Eso obliga a
que las tarjetas hermanas midan lo mismo, y de ahi viene el problema del aire que
no se puede eliminar.

Apple no usa esa estructura. Usa **una superficie continua con secciones
separadas por filetes horizontales**, sin cajas y sin grid de columnas. Al
abandonar el grid, el desbalance de alturas desaparece por construccion.

Sobre esa base:
1. Tipografia como sistema: cifras protagonistas con `font-variant-numeric:
   tabular-nums`, etiquetas chico y gris, una sola escala tipografica.
2. Color significa ESTADO o ACCION. Nunca identidad repetida. Un acento por
   categoria, desaturado, usado una sola vez por seccion.
3. El rail lateral pasa a ser un rail: icono + etiqueta, un solo acento para el
   estado activo.
4. Estados vacios Apple's: una linea, centricos, silenciosos.
5. Hairline como unico divisor. Cero `box-shadow` decorativo. Cero pills salvo
   en controles segmentados.
6. Movimiento solo `transform`/`opacity`, respondiendo a `pointerdown`, sin
   bloquear input.

## Funcionalidades a preservar (inventariar antes de tocar nada)

- Auth con Supabase, GitHub OAuth, RLS. Dos roles: Lector y Administrador.
- Vista Mensual y vista Consolidada.
- Navegacion por mes (pildoras), selector de periodo.
- 4 categorias: Servicios, Personales, Movimientos, Extras.
- Gastos fijos y variables, con rango sugerido.
- Presupuesto de gastos, balance neto, porcentaje pagado.
- Estados de pago por gasto.
- Movimientos: ingresos, gastos y abonos.
- Notas.
- Graficos (donut y barras) en Consolidado.
- Buscador.
- Drawer/modal de edicion.
- Permisos de administrador (toggle de modo).

## Restricciones

1. **`js/store.js`, `js/config.js`, `js/supabase-store.js` NO se tocan.** Son la
   capa de datos y la que hoy funciona.
2. `js/app.js` se puede reescribir, pero si se cambia un id o clase hay que
   actualizar el binding en el mismo cambio. El snapshot del contrato DOM sirve
   para detectar perdida accidental, no para congelar la estructura.
3. Nada de SF Pro ni webfonts de Apple.
4. Sin emoji. Iconos SVG lineales monocromos con `currentColor`.
5. Sin gradientes en titulos, sin glow, sin Liquid Glass en la capa de contenido.
6. Se conserva el tema oscuro y el mono para cifras.

---

# PARTE 1 — R1: inventario funcional del estado ANTERIOR

Herramienta: `odd/tasks/capturas/r1-inventory.json` + capturas
`r1-baseline-mes.png` y `r1-baseline-consolidado.png`.

**Metodo de no-escritura:** antes de cualquier interaccion se congelo
`window.gastosRemoto.guardar`, `.iniciarSesion`, `.salirDeSesion` e
`.iniciarSesionConGithub` con contadores. Durante todo el recorrido se
registraron **15 intentos de escritura, 0 llegados a la red** (`Network` no
registró ni un 4xx). Se pudo navegar, cambiar de mes, cambiar de vista, buscar,
filtrar y abrir/cerrar drawers sin escribir nada en Supabase.

| # | Funcionalidad | Estado verificado en el navegador (ANTES) | Evidencia |
|---|---|---|---|
| 1 | Supabase configurado | OK — `gastosRemoto.estaConfigurado() === true` | — |
| 2 | Modal de rol al entrar | OK — abre solo a los 60 ms, `.active`, 2 pasos | `modalRoleSelect.activo: true` |
| 3 | Rol Lector / Administrador | OK — `body.read-only-mode`, etiqueta "Solo Lectura" | — |
| 4 | Permisos (`.admin-action-btn`) | OK — 18 botones, 0 visibles con Lector, 18 al quitar `read-only-mode` | — |
| 5 | RLS | OK (capa de red) — GET `/rest/v1/gastos` 200; escritura bloqueada por anon sobre `file://` | — |
| 6 | Vista Mensual | OK — `#viewMes.active` | — |
| 7 | Vista Consolidada | OK — `#viewPanel.active` con `#viewMes` inactiva | — |
| 8 | Navegacion por mes (pildoras) | OK — 6 periodos, 1 activa; click en la 2ª cambia a Septiembre y re-renderiza | — |
| 9 | Selector de periodo (flechas) | OK — siguiente → Octubre, anterior → Septiembre | — |
| 10 | 4 categorias | OK — 4 `[data-segment-card]`, 10 filas de gasto | — |
| 11 | Gastos fijos y variables | OK — listas `#listServiciosFijos`/`Variables`/`#listPersonales*` con filas | — |
| 12 | Rango sugerido | OK — 2 filas con "Rango: 20-40" / "10-80" | — |
| 13 | Presupuesto | OK — `S/ 616.34`, "0 de 9 gastos pagados" | — |
| 14 | Balance neto | OK — `S/ 0.00` con color por signo y etiqueta | — |
| 15 | % pagado | OK — `0.0% Pagado (0 de 9)` + barra | — |
| 16 | Cobertura | OK — "Cobertura: 0.0%", `#monthAbonoPercentLabel` | — |
| 17 | Estado de pago por gasto | OK — 9 `.btn-status-toggle`, todas `<button>` | — |
| 18 | Movimientos (ingresos/gastos/abonos) | OK (estado vacío) — 0 movimientos en todos los periodos del dataset | — |
| 19 | Filtros del feed | OK — los 3 filtros conmutan (Todos/Ingresos/Gastos) | — |
| 20 | Notas | OK — modal abre con el subtitulo del periodo | — |
| 21 | Graficos | OK — donut y barras pintados (27 637 y 10 209 px) | — |
| 22 | Matriz multimes | OK — 6 filas × 9 columnas + pie | — |
| 23 | Buscador | OK — "9 resultados encontrados", limpiar restaura | — |
| 24 | Drawer/modal de edicion | OK — 8 modales abren y cierran con todos sus campos | — |
| 25 | Pago variable con monto real | OK — abre con título, presupuestado y rango | — |
| 26 | Toggle de administrador | OK — abre login con correo, contraseña y GitHub OAuth | — |

**Lo que la R1 dejó como línea base y el rediseño tenía que cambiar:**

| Sintoma | Medición en el diseño anterior |
|---|---|
| Retícula de cajas | `.segments-workspace-container` = `display: grid`, 2 columnas de 521.5px, `gap: 32px` |
| Alturas de hermanas forzosamente iguales | Servicios 657px / Personales 657px · Movimientos 230px / Extras 230px |
| Aire muerto medido | iteration previa: 174px + 103px **fuera** de la caja hermana |
| Cajas | 7 `.content-card-box`, 3 `.sidebar-metric-card`, 3 `.hero-metric-card`, 2 de gráficos |
| Chips | 20 `chip`/`tag`/`badge`/`pill` |
| Emoji | 0 (ya resueltos en la iteracion previa) |
| Iconos | 25 `svg.ui-glyph` + 17 `svg.ui-icon-svg` (13 visibles) |
| Saturate en el chrome | `backdrop-filter: saturate(1.8) blur(20px)` en topbar y overlay |

---

# PARTE 2 — R2: contrato DOM

`node dom-contract.js js/app.js <salida>` — la herramienta se escribio de cero
porque la que se mencionaba en el doc anterior no estaba en el repo.

Extracto 7 fuentes, y la 7 es la que el extractor anterior no miraba:

1. `getElementById('x')`
2. `querySelector(All)('...')` → `#id` y `.class` del selector
3. `classList.add|remove|toggle|contains('x')`
4. `className = 'a b c'`
5. `getAttribute('data-x')`
6. **`class="..."` dentro de plantillas `innerHTML`** ← donde `app.js` reescribe el DOM
7. `data-*` en markup o selectores

Las interpolaciones `${...}` se descartan y se reportan aparte, para que una
expresión dinámica nunca se tome por un id literal.

**Baseline antes de tocar nada** (contra el snapshot viejo, que estaba
desactualizado desde la iteración 2):

```
[IDS]       antes=126  ahora=124  perdidos=2   ${escaparHTML(item.id)}, ${escaparHTML(r.monthId)}
[CLASSES]   antes=57   ahora=56   perdidos=1   activeId
[ATRIBUTOS] antes=3    ahora=5    nuevos=2     data-item-id, data-month-id
```

Los 3 "perdidos" son **falsos positivos del extractor viejo**, confirmados a
mano: los dos `${escaparHTML(...)}` son interpolaciones de
`data-item-id="..."`, y `activeId` es la variable de `app.js:372`, no una clase.
`data-item-id` y `data-month-id` sí existen de verdad en las plantillas.

Baseline real para esta feature: **124 ids / 56 clases / 5 atributos**.

---

# PARTE 3 — R3 a R6: el rediseño

## Archivos y líneas

| archivo | antes | después | qué |
|---|---|---|---|
| `index.html` | 941 | **784** | superficie continua, rail, modales sin estilos inline |
| `css/styles.css` | 3117 | **2297** | hoja nueva desde cero: tokens + 20 secciones |
| `js/app.js` | 1513 | **1521** | 4 ediciones coordinadas, +1 clase nueva de markup |
| `js/charts.js` | 263 | **323** | paleta por tokens, notas de estado vacío |
| `dom-contract.js` | no existía | **114** | extractor del contrato, con `--diff` |
| `js/store.js` · `js/config.js` · `js/supabase-store.js` | — | **sin tocar** | restricción 1 |
| `sync_github.js` | — | **sin tocar** | no se ejecutó |

## El cambio estructural

`.segments-workspace-container` pasó de `display: grid` con 2 columnas a
**`display: block`**. Cuatro `.content-card-box` apilados, cada uno con
`border-top: 1px solid var(--hairline)`, sin fondo y sin radio. El aire que no
se podía eliminar dejó de existir porque ya no hay nada que igualar.

```
antes:  [ Servicios 657px ][ Personales 657px ]   <- grid obliga a igualar
        [ Movim.   230px ][ Extras      230px ]
después: Servicios 759px
        Personales 601px
        Movimientos 301px
        Extras 290px                                   <- cada una a su alto natural
```

Los gráficos tenían la misma retícula de 2 columnas con el problema de las
hermanas (un punto que quedó abierto en la iteración 2). También se apilaron.

## Sistema visual aplicado

**1. Tipografía como sistema.** Escala de 11 pasos (11px a 40px). Medido con
`getComputedStyle`:

| elemento | tamaño / peso | familia | `tabular-nums` |
|---|---|---|---|
| Cifra de sección (`#summaryTag*`) | **32px / 600** | mono | sí |
| Cifra KPI del consolidado | **40px / 600** | mono | sí |
| Cifra del rail | 24px / 600 | mono | sí |
| Titular de vista | 32px / 600 | system-ui | — |
| Título de sección | 17px / 600 | system-ui | — |
| Importe de fila | 15px / 600 | mono | sí |
| Concepto de fila | 15px / 600 | system-ui | — |
| Subtotal | 13px / 400 | system-ui | sí |
| Total de grupo (`main-subtotal`) | 15px / 600 → cifra 17px | — | sí |
| Etiqueta / descripción | 13px / 400 muted | system-ui | — |

**2. Color = estado o acción.** Los 4 acentos de categoría aparecen
**una vez por sección**, en un tick de 2px a la izquierda del título
(`[data-accent] .cat-tick`). Cuatro colores, cuatro secciones, cero repeticiones.
Los acentos de estado (verde/rojo/cian) solo donde el dato cambia de signo: el
balance del rail, el balance de la matriz, el balance del topbar.

Sonda de color en el navegador: **22 colores computados distintos en toda la
página, 0 fuera de la paleta de tokens**. Los dos únicos valores que no salen de
un token son los scrims negros del overlay y del backdrop, y están en la lista
permitidos a propósito: no son identidad, son el velo que separa la capa
flotante del contenido.

> **Trampa de método que hubo que corregir:** la primera versión de esa sonda
> comparaba el string crudo del token contra el color computado. Un token
> declarado como hex llega a `getComputedStyle` como `rgb(r, g, b)`, así que la
> comparación daba **22 falsos positivos** y la conclusión "hay colores sueltos"
> era inventada. Con los tokens normalizados a `rgb()` el resultado es 0. Lo
> mismo pasó con `getPropertyValue` en la iteración previa: la forma de la
> cadena importa y hay que resolverla antes de comparar.

**3. Rail, no menú.** 236px, ícono + etiqueta, un único acento
(`--accent-primary` #94a3b8) en el `::before` del ítem activo y del mes activo.
Los meses son una **lista de filas**, no cápsulas: 0 de 6 con radio de cápsula.
Las cápsulas quedan solo en los controles segmentados: 8 de 8 (5 categorías +
3 filtros del feed).

**4. Hairline como único divisor.** 16 de 30 elementos de contenido con un
filete, **todos con exactamente 1 lado**, 0 con fondo, 0 con `box-shadow`.
Cajas solo en controles. `box-shadow` en toda la hoja: **1** (la del drawer
abierto a ≤1024px). El foco no usa `box-shadow`: usa `outline`.

**5. Estados vacíos de una línea.** Medido con los `getClientRects()` de un
`Range`, no dividiendo alto por line-height:

```
.empty-feed-placeholder  texto="Sin movimientos registrados."  lineasDeTexto=1
                         14px muted, text-align:center, icono=false, alto 85px (64 de padding)
```

**6. Materiales.** Superficie de contenido **sólida** (`--bg-surface`
#0f1015). Translúcido solo el chrome flotante: `.app-topbar` y `.modal-overlay`,
con `blur(20px)` y **sin `saturate()`** (verificado: `backdropFilter` de 8
elementos, ninguno contiene `saturate`).

**7. Movimiento.** 22 declaraciones `transition`, 0 `transition: all`, 4
`@keyframes`, todas animando solo `opacity` y `transform`. El press escala
0.97 en `:active`, que dispara en `pointerdown`. Ninguna animación infinita.

**8. Foco.** Verificado **con teclas Tab reales**, no con `element.focus()`:
22 de 22 controles con `outline: 2px solid rgb(0, 136, 255)` y
`outline-offset: 2px`, y los 22 con `:focus-visible` en `true`.

**9. Iconos.** Reusados los 25 `svg.ui-glyph` y los 13 `svg.ui-icon-svg`, 0
`<img>`, 0 emoji. Todos con `stroke-width: 1.5`, `fill: none`,
`currentColor`. **No se creó ningún icono nuevo**: las 8 geometrías de la
iteración 3 se reachuntaron tal cual.

**10. `prefers-reduced-motion`** con `Emulation.setEmulatedMedia`, leyendo
`getComputedStyle` (no el archivo):

```
transitionDuration                1e-05s
animationDuration                 1e-05s
@keyframes card-anim-in           1e-05s
@keyframes card-anim-out          1e-05s
@keyframes sheet-in (modal)       1e-05s
```

---

# PARTE 4 — R7: recorrido final de funcionalidades

Herramientas: `odd/tasks/capturas/r1-inventory.json` (el mismo script de R1,
corrido contra el diseño nuevo), `walk-cierre.mjs` y `walk-rol.mjs`.

| # | Funcionalidad | Resultado | Dato verificado |
|---|---|---|---|
| 1 | Supabase / GitHub OAuth / RLS | **OK** | `estaConfigurado()` true; `#btnAdminLoginGithub` presente; 0 fallos de red |
| 2 | Modal de rol obligatorio | **OK** | abre solo; el clic en el fondo y Escape **no** lo cierran; se sacude; cierra al elegir lector; toast "Ingresaste en Modo Solo Lectura" |
| 3 | Roles Lector / Administrador | **OK** | `read-only-mode` activo, 18 `.admin-action-btn` ocultos, 18 visibles al quitarlo |
| 4 | Vista Mensual | **OK** | `#viewMes.active`, 4 secciones, 10 filas de gasto |
| 5 | Vista Consolidada | **OK** | `#viewPanel.active`, 3 KPI, matriz 6×9, 2 gráficos pintados (3 363 y 26 009 px) |
| 6 | Navegacion por mes | **OK** | 6 periodos; click en la 2ª → "Septiembre 2026", 1 píldora activa, 9 filas re-renderizadas |
| 7 | Selector de periodo (flechas) | **OK** | siguiente → Octubre, anterior → Septiembre |
| 8 | 4 categorias | **OK** | Servicios / Personales / Movimientos / Extras, con título, descripción, cifra y subtotales |
| 9 | Gastos fijos y variables | **OK** | 3 subtotales por sección (fijos, variables, total) |
| 10 | Rango sugerido | **OK** | 2 filas con rango; el badge del modal muestra "Rango sugerido: 20-40" |
| 11 | Presupuesto | **OK** | `S/ 616.34` · "0 de 9 gastos pagados" |
| 12 | Balance neto | **OK** | `S/ 0.00`, color y etiqueta por signo |
| 13 | % pagado | **OK** | "0.0% Pagado (0 de 9)", barra 0% |
| 14 | Cobertura | **OK** | "Cobertura: 0.0%" |
| 15 | Estado de pago por gasto | **OK** | 9 `.btn-status-toggle`, todas `<button>` |
| 16 | Movimientos: ingresos, gastos, abonos | **OK** | feed + filtros conmutando. El dataset tiene 0 movimientos en los 6 periodos: se verificó el **estado vacío**, no filas con datos |
| 17 | Notas | **OK** | abre, subtítulo del periodo, cierra con "Listo", con la cruz y con clic en el fondo |
| 18 | Graficos | **OK** | barras y donut pintados; con datos vacíos muestran una línea de estado y ocultan el eje |
| 19 | Matriz multimes | **OK** | 6 filas × 9 columnas + pie; click en un mes vuelve a la vista mensual con ese periodo |
| 20 | Buscador | **OK** | "9 resultados encontrados"; limpiar restaura las 9 filas |
| 21 | Drawer / modal de edicion | **OK** | 8 modales abren y cierran: servicio, personal, extra, ingreso rápido, gasto rápido, abono, presupuesto, nuevo mes |
| 22 | Pago variable con monto real | **OK** | abre con concepto, presupuestado, rango y monto precargado (30.00) |
| 23 | Toggle de administrador | **OK** | abre el login con correo, contraseña, GitHub y mensaje de error |
| 24 | Cierre de drawers | **OK** | cruz, Cancelar, "Listo", clic en el fondo, botón X y backdrop |
| 25 | Drawer del rail a ≤1024 | **OK** | abre en x=0 con backdrop, ancho 236, pie visible; cierra con X y con el backdrop |
| 26 | Selector de segmentos | **OK** | apaga "Extras" (`display:none`, píldora inactiva) y "Ver todo" reactiva las 4 |
| 27 | Acordeón de sección | **OK** | colapsa y expande por el encabezado |

**Sin regresiones:** los valores numéricos del recorrido final son **idénticos** a los
de la R1. No cambió ni un cálculo.

---

# PARTE 5 — Las 3 rondas de mirar-ajustar, con los 8 criterios

Todas las capturas en `odd/tasks/capturas/`.

| # | Criterio | Ronda 1 (`r1`,`r2`) | Ronda 2 (`r3`,`r4`) | Ronda 3 (`r5`..`FINAL`) |
|---|---|---|---|---|
| a | ¿Sigue siendo un grid de cajas o es superficie continua? | **SÍ**, superficie continua: `display:block`, 0 cajas con fondo, 0 sombras | SÍ | **SÍ** |
| b | ¿La cifra de cada sección se lee primero? | **NO** — rail de 1189px partía la retícula en dos filas y las secciones medían 1056px de alto con las cifras apiladas | **SÍ** — 32px/600 mono contra 17px de título y 13px de descripción | **SÍ** |
| c | ¿Queda algún color que no sea acento de sección o estado? | **NO** — 0 colores fuera de la paleta de tokens | NO | NO |
| d | ¿Hay alguna caja con borde alrededor de contenido que no sea un control? | **NO** — 16/30 con filete de 1 lado, 0 con fondo, 0 con sombra | NO | NO |
| e | ¿Los estados vacíos son una línea silenciosa? | **PARCIAL** — el aviso de segmentos ya era una línea, pero el del feed ocupaba 121px para una frase | **SÍ** — 1 línea de texto, 85px de caja, sin ícono | SÍ |
| f | ¿El rail se lee como rail y no como menú cargado? | **SÍ** — 236px, ícono + etiqueta, un acento, meses como filas, pie siempre visible | SÍ | SÍ |
| g | ¿Se lee apple.com o "panel financiero"? | **Parcial** — la estructura estaba, el rail no: leía como panel | **Parcial** | **Parcial, y honesto** (ver abajo) |
| h | ¿El ojo detecta primero el total y después el detalle? | **NO** — el importe quedaba en el medio de la fila y "Pendiente" se leía como el dato de la derecha | **SÍ** — orden concepto · estado · importe · borrar: los importes cierran contra el borde de la superficie, los estados alinean en columna | SÍ |

### Qué se encontró mirando, no leyendo CSS

1. **El backdrop roto la retícula entera.** `#sidebarBackdrop` estaba dentro de
   `.app-layout` y solo tenía estilos dentro del `@media (max-width: 1024px)`.
   Fuera de ese breakpoint era un ítem de grid en flujo: se quedó con la
   primera columna de 236px y empujó el área principal a una segunda fila. El
   rail medía **1189px** y el contenido 236px. La captura lo delató al instante.
   Fix: el velo salió de `.app-layout` y tiene `position:fixed` en la base.
2. **El mes activo quedaba fuera del rail.** `max-height: 176px` en la lista de
   meses + el `scrollIntoView` que llama `app.js` al pintar la píldora activa:
   con 6 periodos, "Agosto 2026" se autoscrolleaba fuera de vista. Subió a
   240px.
3. **`cssRules` es ilegible sobre `file://`.** La primera ronda de conteos dio
   **0 borders, 0 box-shadows, 0 transiciones, 0 prefers-reduced-motion** y
   parecía que la hoja estaba vacía. Los conteos se hacen ahora sobre el
   archivo. El comentario dice por qué.
4. **`element.focus()` no activa `:focus-visible`.** El primer sondeo de foco
   dio `focusVisible: false` y `outlineStyle: none` en los 22 controles, y la
   conclusión fácil ("no hay anillo") era falsa. Con teclas `Tab` reales vía
   `Input.dispatchKeyEvent`: 22/22 con anillo.
5. **La matriz no entraba.** Con el `min-width: 130px` inline del `<td>` de
   progreso y padding horizontal de 16px, la tabla daba 999px contra 984px
   disponibles: la columna "Progreso" quedaba cortada. Bajó a padding de 8px y
   la celda pasó a una clase con `width: 84px`. Ahora entra exacta a 1440 y a
   1280, sin scroll interno.
6. **Un `%` suelto al lado de "Cumplimiento"** que, con la etiqueta al lado, se
   leía como error de tipeo. `metric-icon-box` queda vacío y `:empty` lo colapsa.
7. **280px de lienzo para una línea de texto.** Con la serie vacía, el gráfico
   de barras quedaba casi todo hueco. `charts.js` marca la sección y la hoja
   baja el lienzo a 120px.
8. **El eje de las barras inventaba una escala.** `beginAtZero` sobre datos
   todos-cero rotulaba "S/ 0.2", "S/ 0.4"... Con `display: false` y una línea de
   estado, deja de mentir.
9. **La sonda de color comparaba hex contra `rgb()`.** Dio 22 falsos positivos
   y, si se hubiera dejado así, el informe habría dicho que hay colores
   sueltos que en realidad no los hay. Normalizando los tokens a `rgb()`: 0
   fuera de la paleta de 22 colores computados. Dos sondas dando el veredicto
   equivocado en la misma sesión: la de `cssRules` y esta. La lección es la
   misma: **un cero en una sonda es tan sospechoso como un alto**.
10. **`captureBeyondViewport` rompe los canvas de Chart.js.** Las capturas del
    consolidado salieron con el anillo dibujado como un punto. No era un bug del
    diseño: al ampliar el viewport para abarcar la página entera, el
    `ResizeObserver` del gráfico se dispara a mitad de la captura y el lienzo se
    fotografia a medio repintar. Medido, no supuesto: los píxeles pintados del
    donut cambiaban con cada captura —8786 → 16519 → 20162 → 26062— hasta
    estabilizarse. **Con `captureBeyondViewport: false` el mismo gráfico da
    26009 px estables en las dos capturas.** Las capturas de las vistas con
    gráfico se toman solo del viewport, más una segunda con scroll; el resto
    sigue con captura completa. `FINAL-consolidado-graficos.png` es la prueba
    fiel.

---

# PARTE 6 — Verificación final

## Consola y red, por vista

| vista | `console.error` | excepciones no capturadas | warnings | red 4xx/5xx |
|---|---|---|---|---|
| Vista Mensual (1440) | **0** | **0** | **0** | **0** |
| Vista Consolidado (1440) | **0** | **0** | **0** | **0** |
| Drawer a 1024 | **0** | **0** | **0** | **0** |
| Modales (gasto, notas) | **0** | **0** | **0** | **0** |

Intentos de escritura a Supabase durante el recorrido: **2, interceptados por el
congelamiento del sonda. 0 llegaron a la red.**

## Overflow horizontal

| ancho | `scrollWidth` | `innerWidth` | ¿overflow? |
|---|---|---|---|
| 1440 | 1425 | 1440 | **NO** |
| 1280 | 1265 | 1280 | **NO** |
| 1024 | 1009 | 1024 | **NO** |

Matriz: `scrollWidth === clientWidth` a 1440 (984/984) y a 1280 (933/933). Ya no
necesita scroll interno en ninguna de las dos.

## Contraste medido (WCAG AA)

Resuelto a `rgb(r,g,b)` desde el color computado real y el fondo real del
elemento. Ningún token de texto usa `color-mix()`, así que no hay cadenas
literales que parsear mal.

| par de texto | fondo | ratio | mínimo | cumple |
|---|---|---|---|---|
| `.view-heading`, `.brand-title`, `.month-pill-btn` | superficie / canvas | 16.96 – 17.57 | 3 (≥24px) | **SÍ** |
| `.metric-main-value` (40px) | superficie | 16.96 | 3 | **SÍ** |
| `#summaryTagServicios` (32px) | superficie | 16.96 | 3 | **SÍ** |
| `.expense-item-title`, `.expense-item-amount` | superficie | 16.96 | 4.5 | **SÍ** |
| `.matrix-table tfoot td`, `.matrix-month-btn` | superficie | 16.96 | 4.5 | **SÍ** |
| `.subtotal-highlight-row span`, `.metric-label-title` | superficie | 8.64 | 4.5 | **SÍ** |
| `#btnToggleAuthMode` | canvas | 8.95 | 4.5 | **SÍ** |
| `.metric-card-number` (24px) | canvas | 10.35 | 3 | **SÍ** |
| `.sidebar-section-label`, `.metric-card-title`, `.metric-card-detail`, `.brand-sub`, `.mini-chip`, `.search-results-feedback` | canvas | 6.38 | 4.5 | **SÍ** |
| `.card-header-titles p`, `.tag-badge`, `.category-subhead`, `.metric-footer-info`, `.matrix-table th`, `.matrix-active-badge`, `.empty-feed-placeholder`, `.btn-status-toggle.status-pendiente`, `.kpi-mini-label` | superficie | 6.16 | 4.5 | **SÍ** |
| `.segment-count-badge` | cápsula | 5.73 | 4.5 | **SÍ** |
| `--focus-ring` #0088ff | superficie | **5.41** | 3 (indicador no textual) | **SÍ** |

**37 pares medidos. 0 fallos de AA.** El más bajo es `--text-muted` en 5.73:1.

## Conteos de la hoja

Método: conteo sobre `css/styles.css`, porque `document.styleSheets[].cssRules`
es ilegible sobre `file://`.

| métrica | valor | nota |
|---|---|---|
| `border:` (shorthand) | **14** | los 14 en controles: reset, botones, campos, caja de búsqueda, cápsulas, tarjeta de rol, hoja del modal, badge de modo |
| `border-*: 1px solid` (filetes) | **15** | el único divisor de la hoja |
| `box-shadow` | **1** | el drawer abierto a ≤1024px. Cero decorativo |
| usos de `--radius-pill` | **9** | todos en controles segmentados y en el toast |
| radios fuera del sistema | `1px` ×5, `50%` ×2 | el tick de acento y los puntos. Ningún radio grande |
| `padding`/`margin`/`gap` de 1px o 2px | **13** | 7 son `gap`/`margin-top` entre elementos de una misma etiqueta; los otros 6 son filetes de 1px contados aparte |
| `text-transform: uppercase` | **0** | — |
| `transition` | **22** | 0 de ellas `transition: all` |
| `@keyframes` | **4** | `card-anim-in`, `card-anim-out`, `sheet-in`, `modal-shake` |
| `@media (prefers-reduced-motion)` | **1** | bloque único con alcance `*`, verificado en el navegador |
| `@media (prefers-color-scheme)` | **0** | apple.com también tiene 0 |
| `color-mix()` | **0** | solo aparece en el comentario que explica por qué no se usa |
| `@font-face` | **0** | solo aparece en la prosa que explica por qué no |
| gradientes | **1** | el `background-image` del triángulo del `<select>`. No es degradado de color |
| emoji en el DOM | **0** | — |
| `<img>` | **0** | los 8 JPG siguen en disco, sin referencias |
| `backdrop-filter` | 8 elementos | topbar + 7 overlays. Ninguno con `saturate()` |

## `node --check`

```
app.js  OK
store.js  OK
config.js  OK
supabase-store.js  OK
charts.js  OK
dom-contract.js  OK
sync_github.js  OK
```

## Contrato DOM: diff final

```
[IDS]       antes=124  ahora=124  perdidos=0  nuevos=0
[CLASSES]   antes=56   ahora=60   perdidos=0  nuevos=4
[ATRIBUTOS] antes=5    ahora=5    perdidos=0  nuevos=0
```

**0 perdidos.** Las 4 clases nuevas son deliberadas y todas nacen con su
binding en el mismo cambio:

| clase nueva | dónde | por qué |
|---|---|---|
| `expense-item-state` | `app.js`, plantilla de fila de gasto | columna de estado de ancho fijo, para que los "Pendiente" alineen |
| `matrix-progress-cell` | `app.js`, celda de progreso | reemplaza el `min-width:130px` inline |
| `matrix-progress-track` | ídem | el carril de 2px, ahora con clase en vez de estilo inline |
| `matrix-progress-fill` | ídem | el relleno del carril |

Ids renombrados, los dos **deliberados**: `modalPayVarSubtitle` (un `<p>`) →
`modalPayVarTitle` (el `<h3>`), y `roleSelectTitle` /
`btnEnterAsReader` nuevos. Ninguno de los tres lo consulta `js/`: verificado con
grep sobre `app.js`, `charts.js` y `store.js`. `modal-glyph` (contenedor vacío
decorativo) se eliminó: no está en el contrato de `app.js`.

## Capturas

`odd/tasks/capturas/`

| archivo | qué |
|---|---|
| `r1-baseline-mes.png` · `r1-baseline-consolidado.png` | el diseño ANTERIOR, base de la comparación |
| `r1` … `r5` + sus `.report.json` | las rondas de ajuste, con la medición completa de cada una |
| `FINAL-mes-1440.png` | vista mensual |
| `FINAL-consolidado-1440.png` | consolidado, KPI + matriz |
| `FINAL-consolidado-graficos.png` | consolidado, sección de gráficos (captura fiel) |
| `FINAL-mes-1280.png` · `FINAL-mes-1024.png` | sin overflow horizontal |
| `FINAL-drawer-1024.png` | rail como drawer, con velo y pie visible |
| `FINAL-modal-gasto.png` · `FINAL-modal-notas.png` | drawers sobre la superficie nueva |
| `r1-inventory.json` | inventario R1 y el recorrido R7, con los mismos datos |

## Pestañas del usuario

`/json/list` al terminar: **26 targets, 0 de tipo `file://` o `about:blank`**.
Todos los targets propios cerrados. Las pestañas del usuario siguen ahí. Nunca
se usó `Browser.setWindowBounds`: no se tocó el tamaño de ninguna ventana.

---

# PARTE 7 — Valores tomados de `apple-com-tokens.md`

`references/apple-com-tokens.md` §5 es la única fuente primaria de espaciado que
existe, y es mínima: publica **16px** y **10px**. No hay una escala vertical.

| token | valor | procedencia |
|---|---|---|
| `--space-tight` | 4px | **[NV]** no está en el archivo |
| `--space-1` | 8px | **[NV]** no está en el archivo |
| `--space-10` | 10px | **[V]** §5 `button-space-between` |
| `--space-2` | 16px | **[V]** §5 `padding-top` del localnav / `menucta-space-after` |
| `--space-3` | 24px | **[NV]** no está en el archivo |
| `--space-4` | 32px | **[NV]** no está en el archivo |
| `--space-5` | 40px | **[NV]** no está en el archivo |
| `--space-6` | 48px | **[NV]** no está en el archivo |
| `--space-7` | 72px | **[NV]** no está en el archivo |

**7 de 9 pasos son [NV].** Es lo honesto: el archivo no publica una escala. Los
no verificados son múltiplos de 8 alrededor del par verificado y coherentes con
él, pero no se presentan como valores oficiales de Apple.

Del mismo archivo, y sí verificados:

| token | valor | sección |
|---|---|---|
| `--radius-xs` / `--radius-sm` / `--radius-md` | 5px / 6px / 10px | §4 |
| `--radius-pill` | 980px | §4, la cápsula |
| `--material-backdrop-filter` | `blur(20px)` | §3, **sin** `saturate()` |
| tracking de display | `-0.02em` | §2 (`-1.2px / 80px ≈ -0.015em` medido) |
| ratio de leading de display | 1.05 | §2 |
| `--focus-ring` | `#0088ff` | §7 systemBlue vigente (HIG) |

**[NV] y rechazados con motivo:** `--layout-measure: 1080px`. El
`max-width: 980px` de §1 es el de `#ac-localnav .ac-ln-content`, la navegación
local de una landing. La matriz de 9 columnas de cifras de esta app necesita
más: con 980px la columna "Progreso" quedaba cortada en la versión anterior.
Rechazar el valor medido está escrito en el CSS, con el motivo.

**[NV]:** `--rail-width: 236px` y todos los colores. La HIG publica colores de
plataforma, no de esta app, y advierte que "fluctúan entre releases"; se
verificaron solo por contraste medido.

---

# PARTE 8 — Decisiones que no estaban especificadas

1. **El tick de acento es vertical, de 2px × 24px.** La consigna pedía "un acento
   por sección, una sola vez" sin decir dónde. La descarté como filete de ancho
   completo (serían 4 líneas de color: identidad repetida) y como color de la
   cifra (la cifra es la protagonista y tiene que ser neutra). Queda como una
   marca junto al título.
2. **`--focus-ring` es `#0088ff`, no un tono de la paleta.** Es el único hue
   que no es de la paleta, y es ACCIÓN, que es lo que la propia consigna
   autoriza. Sale de la HIG publicada (§7) en vez de del gusto, y mide 5.41:1.
   Los selectores de foco viejos (`--border-focus`, `--border-hover`) se
   eliminaron: `--focus-ring` los reemplaza a todos.
3. **La sección es el filtro, no la cifra.** `#badgeSegServicios` y los otros
   siguen escribiendo importes, pero en 11px gris dentro de la cápsula, con la
   cifra de 32px de la sección 400px más abajo. Redundancia que se acepta
   conscientemente en vez de romper el contrato de `app.js`.
4. **El orden de la fila cambió a concepto · estado · importe · borrar.** La
   plantilla de `app.js` y las 4 columnas del CSS se movieron en el mismo
   cambio. El contrato DOM no obliga al orden, solo al número de hijos.
5. **El botón de borrar reserva su carril siempre, pero solo se ve al hover.**
   Así el bloque derecho de las 10 filas está alineado, no solo las 4 donde el
   puntero está.
6. **"Registrar ingreso" y "Registrar gasto" ya no son verde y rojo.** Los dos
   son idénticos salvo el texto. El mismo matiz ya está en el acento de la
   sección Movimientos; teñir los botones era la misma identidad por segunda
   vez, y el texto no deja lugar a duda.
7. **Los gráficos se apilaron.** Nadie lo pidió explícitamente, pero
   `.charts-grid-layout` era la otra retícula con hermanas de distinta altura: el
   punto que la iteración 2 dejó abierto.
8. **Con datos vacíos, el gráfico de barras oculta su leyenda y su eje.**
   Una leyenda de dos series sin barras es ruido, y un eje 0..1 rotulado es
   mentira. Queda una línea.
9. **La matriz conserva su filete por fila.** 9 columnas de cifras necesitan la
   línea para separar en horizontal. Solo se le sacó el fondo al encabezado.
10. **Se agregó `.sidebar-scroll`** como elemento nuevo en el rail. Es lo que
    garantiza que el pie —con `#btnToggleAuthMode`, la puerta del modo
    administrador— nunca quede fuera de pantalla. Era el bug de la iteración 2
    y no se repitió.
11. **`gap: 1px` entre filas de mes.** Parece una violaión de la escala, pero
    1px ahí es interlineado, no espaciado entre grupos. Se documentó en el CSS.
12. **Los rótulos de las categorías pasaron a sentence case** ("Servicios del
    hogar", "Movimientos del mes"). Sin especificación previa, la convención más
    neutra es dejar el texto como lo escribió quien lo escribió.

---

# PARTE 9 — Lo que NO quedó bien

1. **Criterio g, sin autoengaño: sigue sin leerse como apple.com.** La
   estructura ya es la correcta —superficie continua, filetes, tipografía como
   sistema, color con significado— pero apple.com vende con fotografía de
   producto a escala gigante y copy muy corto, y un panel de gastos no tiene
   ninguna de las dos cosas. Lo que se ganó fue **restricción**: se lee como una
   herramienta de lectura, no como un tablero. Lo que falta para apple.com es
   dirección de arte, y eso no sale de CSS.
2. **La página un poco más larga: 2307px contra 1774px.** Es el precio honesto
   de una superficie continua. En la versión de 2×2 el espacio se ahorraba
   comprimiendo, y ese comprimir *era* el aire muerto. No es una pérdida: es la
   misma altura con la mitad del hueco, y ahora las secciones miden lo que
   miden.
3. **La fila tiene 92px de estado y el importe a la derecha, con ~380px de aire
   entre el concepto y el estado.** A 1080px de medida es lo que hace una tabla
   ancha. Podría recortarse limitando la medida de las filas, pero entonces los
   importes no cerrarían contra la cifra de sección, que es lo que da unidad a
   la columna. Se eligió la alineación.
4. **La matriz no entra a menos de ~900px de ancho útil.** Es una tabla de 9
   columnas de cifras: no hay forma honesta de comprimirla sin romper la
   lectura. A 1440 y 1280 entra exacta; por debajo de eso scrollea adentro, sin
   tocar la página. Es un patrón normal de tabla, no un parche, pero es una
   limitación y no un logro.
5. **El feed de movimientos se verificó solo en estado vacío.** El dataset de
   este navegador tiene 0 movimientos en los 6 periodos (todos los ingresos
   están en 0). Los filtros conmutan y el render de filas con datos **no se
   vio en el navegador**. Es la única funcionalidad sin verificar visualmente
   con contenido real, y conviene decirlo en vez de darlo por comprobado.

---

## Tareas

- [x] R1 Inventario funcional del estado actual, verificado en el navegador.
- [x] R2 Snapshot del contrato DOM antes de tocar nada.
- [x] R3 Reconstruir `index.html` como superficie continua.
- [x] R4 Reconstruir `css/styles.css` con el sistema de tokens y la escala de espacio.
- [x] R5 Reconstruir las plantillas de `app.js` y sus bindings, coordinados.
- [x] R6 `js/charts.js`: paleta por tokens, sin literales.
- [x] R7 Verificar por recorrido: vistas, mes, buscador, drawer, roles, graficos.
- [ ] R8 Publicar, solo con pedido explicito del usuario. **NO HECHO.**

## Estado

**Nada publicado.** `sync_github.js` no se ejecutó, ni siquiera con `--dry-run`.
El sitio publicado en `adrianhola3.github.io/GastosMensuales/` sigue con el
diseño de las iteraciones 1 a 3.
