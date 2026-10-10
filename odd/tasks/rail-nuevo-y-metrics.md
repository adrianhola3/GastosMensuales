# Feature: rail lateral nuevo y Metrics

## Objetivo

Rediseñar el panel lateral (rail) desde cero y mover los datos que están
adentro hacia donde corresponde. El usuario delego el criterio: "dámelo como
mejor veas".

**Estado: HECHO y verificado en el navegador. NO publicado.**

---

## Diagnostico del rail anterior (verificado, no opinado)

Medido con CDP sobre `file://` a 1440x900, antes de tocar nada
(`odd/tasks/capturas/s0-antes.png`, `s0-antes.report.json`):

1. **Mezclaba cinco semanticas con el mismo peso visual**: navegacion,
   buscador, selector de periodo, un bloque de datos ("Resumen del mes"),
   indicador de estado y toggle de modo.
2. **"Resumen del mes" eran DATOS, no navegacion.** `.sidebar-metrics-section`
   media **527.3px** de alto y contenia **13 elementos con datos**.
3. **La lista de 6 meses con scroll propio era un dropdown disfrazado.**
   `#monthPillsContainer` media **224.5px** de alto con `max-height: 240px`,
   y duplicaba el mes que el topbar ya muestra.
4. **El bloque de marca repetia lo que el topbar ya dice.**
5. **El rail scrollea internamente**: `.sidebar-scroll` con
   **`scrollHeight` 1019 contra `clientHeight` 692** — **327px de contenido
   inalcanzable**.
6. `#btnToggleAuthMode` quedaba al borde: `top` 840.4 contra un viewport de
   900, a 24px del borde.

## Decision de arquitectura

Separar navegacion de contenido:

- **El rail es navegacion y nada mas**: marca, las dos vistas, buscador, y un
  pie con estado y modo. **Sin scroll interno.**
- **Los datos van al contenido.** "Resumen del mes" es ahora una **fila de
  metricas** arriba de todo en Vista Mensual, justo debajo del titulo, mas una
  **tira de pagos** que responde "¿cuanto falta?".
- **El periodo deja de ser lista en el rail.** El topbar conserva el mes. Los
  6 meses pasan a un **selector horizontal compacto** en el contenido, misma
  funcion y mismo estado activo. "Nuevo mes" viaja con el.

---

# QUE SE MOVIO, Y POR QUE

| de | a | por que |
|---|---|---|
| `#monthTotalIngresos` `.metric-card-number` (24px, en el rail) | `#monthTotalIngresos` `.metric-cell-value` (28px, celda 1 de `.metrics-row`) | Es un dato, no navegacion. Y es la SUMA de las 4 cifras de seccion, asi que tiene que pesar MAS que ellas: la escala quedo 32 titular / 28 total del mes / 24 total de categoria / 17 titulo / 13 nota |
| `#monthTotalEgresos` | celda 2 de `.metrics-row` | idem |
| `#monthBalanceNeto` + `#monthBalanceStatusLabel` | celda 3 | idem, y es **la unica celda con color**: app.js le escribe el color inline segun el signo |
| `#monthAbonoPercentLabel` | celda 4 (Cobertura) | idem |
| `#monthIngresosCount`, `#monthGastosCount` | `.metric-cell-note` de las celdas 1 y 2 | son el detalle de esas dos cifras |
| `#btnHeaderAddIncome` ("Abono"), `#btnHeaderAddBudget` ("Gasto") | `.metric-cell-action`, pegados a su cifra | un boton al pie de una columna de navegacion esta dos contextos mas lejos del dato que modifica. Antes `justify-content: space-between` los dejaba pegados al filete y se leian como rotulo de la columna SIGUIENTE |
| `#paidTextInfo`, `#pendingSummaryLabel`, `#paidBarFill`, `#paidPercentBadge` | `.payments-strip`, una linea de 43.6px | los "pagos" son una pregunta distinta de los 4 totales: cuanto falta. Antes eran un panel de 212.6px en el rail |
| `#monthPillsContainer` + `.month-pill-btn` | `.period-bar` / `.period-track`, **horizontal** | 224.5px verticales para 6 periodos es un dropdown. En horizontal entran enteros en 984px |
| `#btnPrevMonth` / `#btnNextMonth` | `.period-arrow`, a los extremos del riel | son controles del selector, no del rail |
| `#btnOpenNewMonthModal` | `.period-new`, a la derecha del riel | **no es navegacion ni meta de sesion**: es gestion de periodos. Va con el selector |
| `.sidebar-scroll` | **eliminado** | era el scroller que ocultaba 327px |
| `.sidebar-section-label`, `.sidebar-nav-arrows`, `.mini-nav-arrow`, `.sidebar-metric-card`, `.metric-card-*`, `.sidebar-progress-*`, `.mini-chip`, `.btn-sidebar-quick-action`, `.sidebar-month-pills-list`, `.text-emerald/-rose/-cyan`, `.sticky-track`, `.paid-bar-fill`, `.progress-*` | **eliminados del CSS** | 0 referencias en `js/`: verificado con grep sobre `app.js`, `charts.js`, `store.js`. Eran reglas del rail que ya no existe |

### Dos nodos que se eliminaron de verdad (y por que NO es perdida)

| id | por que se fue | por que no rompe |
|---|---|---|
| `#paidSummaryLabel` | decia "Pagado: **S/ 0.00**", el mismo importe que ya decia `#paidTextInfo` ("Gastos Pagados: **S/ 0.00** de S/ 616.34"). Era la tercera vez que el mismo numero aparecia en pantalla | `app.js:525` lo escribe detrás de `if (elPaidSummaryLabel)`. El binding se deja intacto |
| `#coverageTextInfo` | decia "Cobertura: **0.0%**", que es exactamente `totals.porcentajeAvance`, **el mismo valor** que la cifra de la celda 4. Verificado: `app.js:429` y `app.js:537` leen la misma variable | `app.js:535` lo escribe detrás de `if (elCoverageTextInfo)`. El binding se deja intacto |

Los dos siguen estando en el contrato DOM (el extractor lee `app.js`, no el
HTML), asi que el diff contractual da **0 perdidos**. Lo que cambio es que ya
no hay nodo. **La informacion no se perdio: la cobertura es el titular de la
celda 4 y el importe pagado es el titular de la tira.**

### Cambios coordinados en `js/app.js` (3 lineas utiles)

1. `renderMonthPills` saco el `<span>` vacio que la plantilla emitted al lado
   del nombre del mes.
2. `scrollIntoView` paso a `{ block: 'nearest', inline: 'center' }`: el eje
   cambio de vertical a horizontal, y con `block` solo el periodo activo
   podia quedar fuera de la tira cuando hay muchos meses.
3. `aria-pressed` en cada `.month-pill-btn`. El selector paso a `role="group"`
   (antes decia `tablist` sin un solo `role="tab"`, que es ARIA invalido), y
   un grupo de botones conmutables necesita `aria-pressed` para que el estado
   activo sea legible sin ver el color.

---

# ARCHIVOS Y LINEAS

| archivo | antes | despues | que |
|---|---|---|---|
| `index.html` | 784 | **800** | rail reescrito (4 bloques), fila de metricas, tira de pagos, barra de periodo |
| `css/styles.css` | 2302 | **2468** | §6 RAIL reescrito (472-870), §8.1 metricas (876-973), §8.2 pagos (975-1036), §8.3 periodo (1038-1120), token `--text-metrics`, responsive, press lists, contraste |
| `js/app.js` | 1520 | **1526** | `renderMonthPills`: 3 cambios coordinados con el selector horizontal |
| `js/store.js` · `js/config.js` · `js/supabase-store.js` · `js/charts.js` | — | **sin tocar** | restriccion 1 |
| `sync_github.js` | — | **sin tocar** | no se ejecuto |
| `.gitignore` | 4 | **5** | `.codegraph/` (indice local, no va al repo) |
| `odd/tasks/dom-contract-snapshot.txt` | 124/60/5 | **124/60/5** | regenerado. 0 perdidos, 0 nuevos |

---

# TAREAS

- [x] Q1 Snapshot del contrato DOM y geometria del rail antes de tocar nada.
- [x] Q2 Rail nuevo: marca, vistas, buscador, pie con estado y modo.
- [x] Q3 Mover "Resumen del mes" a una fila de metricas en el contenido.
- [x] Q4 Mover los 6 meses a un selector horizontal compacto en el contenido.
- [x] Q5 Verificar que el rail no scrollea y que nada quedo fuera de alcance.
- [x] Q6 Recorrer TODAS las funcionalidades y capturar cada vista.

---

# GEOMETRIA DEL RAIL: ANTES Y DESPUES

Medido con `getBoundingClientRect` a 1440x900.

| medicion | ANTES | DESPUES |
|---|---|---|
| caja del rail | x0 y0 w236 h900 | x0 y0 w236 h900 |
| scroller interno | `.sidebar-scroll` y90.2 h691.6 | **ninguno** |
| `scrollHeight` / `clientHeight` del rail | `.sidebar-scroll` **1019 / 692** (327px ocultos) | `#appSidebar` **900 / 900** — `overflow-y: hidden`, 0 scrollers internos |
| bloques del rail | 5 (`brand` 90.2 · vistas 75.2 · buscador · periodo 264.5 · resumen 527.3 · `footer` 118.3) | **4**: `brand` 50.2 (y16) · `sidebar-nav` 77.2 (y66.2) · buscador 56 (y143.3) · `footer` 96.3 (y803.8) |
| contenido del rail | 1019px (con scroll) | **199.3px** de contenido, pie anclado al borde inferior |
| `#btnToggleAuthMode` | y840.4 → bottom 876 (24px del borde) | **y850.4 → bottom 884**, dentro de pantalla, con 573px de aire por encima |
| solape rail / contenido | 0 | **0** |
| cifras dentro del rail | **13** (`monthTotalIngresos`, `monthTotalEgresos`, `monthBalanceNeto`, `monthBalanceStatusLabel`, `monthIngresosCount`, `monthGastosCount`, `monthAbonoPercentLabel`, `paidTextInfo`, `paidPercentBadge`, `paidBarFill`, `paidSummaryLabel`, `pendingSummaryLabel`, `coverageTextInfo`) | **0**. Lo unico con digitos es `#searchResultsCountText`, que es el contador del buscador y esta en `display:none` |
| meses dentro del rail | 6, en 224.5px verticales | **0**. Los 6 viven en `.period-track`, `scrollWidth === clientWidth` (751px): no scrollean |
| alto del documento | 2307px | **2523px** (+216px: es el precio honesto de mover 527px de datos fuera del rail y ponerlos arriba) |

---

# LAS 3 RONDAS, CON LOS 9 CRITERIOS

Capturas en `odd/tasks/capturas/`: `s0-antes.png`, `r1-*`, `r2-A-*`, `r2-B-*`,
`r3-*`, `FINAL-*`, `ab-1/2/3-*`.

## Ronda 1 — el rail ya es navegacion. QUE FALLA:

Mirando `r1-mes-1440.png`:
1. **La cifra de seccion (32px) pesaba MAS que el total del mes (28px).** Un
   padre no puede pesar menos que su parte: el ojo Bajaba a "S/ 417.80" antes
   que a "S/ 699.34". → fijada en 24px.
2. **Tres filetes horizontales en 128px** (arriba de metricas, entre metricas y
   pagos, abajo de pagos). Leia como tabla con cuadricula, no como superficie.
   → se下去 el de abajo: la banda se abre.
3. **"Abono" y "Gasto" al borde de la celda**, pegados al filete, se leian
   como rotulo de la columna siguiente. → `flex-start`.

## Ronda 2 — A/B del pie del rail, con capturas de las dos variantes

| variante | captura | veredicto |
|---|---|---|
| A: pie anclado al borde inferior (`margin-top: auto`) | `r2-A-admin.png` | **SE QUEDA.** El filete del pie se lee como borde del panel |
| B: pie justo despues del buscador | `r2-B-admin.png` | Rechazada. El filete entre buscador y estado se lee como error |

Tambien en ronda 2: `.period-track` paso de `flex: 1 1 auto` a `flex: 0 1 auto`
(sobraba 235px de aire entre "Enero 2027" y "Nuevo mes", que se leia como
"hay mas meses" sin haberlos) y el carril de pagos se acoto de estirado
(350px medidos) a 180px, porque estirado competia con los textos y se leia
como un filete mas de la banda.

## Ronda 3 — dos FALLA de foco, uno real

`WALK`/`WALK2` encontraron que **`#sidebarSearchInput` no tenia anillo**:
`outline-style: none` con `outline-width: 3px`, contra `solid 2px
rgb(0, 136, 255)` de los otros 3 controles del rail. El anillo se movio a la
CAJA (`.sidebar-search-box:focus-within`), que es adonde corresponde: `outline`
sigue la forma real del control y no desplaza el layout. Verificado con Tab
real: `solid 2px rgb(0, 136, 255)`, `:focus-within` en `true`.

## Ronda 4 — A/B del vacio del rail (ab-1 / ab-2 / ab-3), y las capturas finales

| variante | veredicto |
|---|---|
| ab-1: `--bg-canvas` + filete (lo actual) | **SE QUEDA** |
| ab-2: rail a `--bg-surface`, superficie continua | Rechazada. Los dos fondos difieren en un 2% medido: el vacio sigue tan vacio y se pierde la separacion de profundidad |
| ab-3: ademas sin `border-right` | Rechazada. La columna desaparece: los items del rail flotan sin contenedor y el filete del pie queda en un stub |

## Los 9 criterios, con las 3 rondas

| # | Criterio | R1 | R2 | R3 (final) |
|---|---|---|---|---|
| a | ¿El rail scrollea internamente? | **NO** — `scrollHeight 900 === clientHeight 900`, 0 scrollers internos | NO | **NO** |
| b | ¿Queda alguna cifra de datos dentro del rail? | **NO** — 0 | NO | **NO** — 0 (solo el contador del buscador, en `display:none`) |
| c | ¿Queda el selector de 6 meses dentro del rail? | **NO** — 0 | NO | **NO** — 0, y los 6 no scrollean (751 === 751) |
| d | ¿La fila de metricas responde "¿como voy?" antes de leer una fila de gasto? | **NO** — la cifra de seccion (32px) pesaba mas que el total del mes (28px) | NO | **SI** — `.metrics-row` top 199.6 contra `.expense-card-item` top 683.5, y la escala es descendente |
| e | ¿El estado activo del rail se distingue sin gritar? | **SI** | SI | **SI** — activo `rgb(241,242,244)` + peso 600 + regla de 2px; inactivo `rgb(169,175,189)` + peso 400 + `::before` transparente |
| f | ¿La marca se lee en una linea y no repite lo del topbar? | **SI** — 1 linea, 117.2px de ancho con `scrollWidth` 117 (cero recorte); topbar dice "Agosto 2026" | SI | **SI** — igual a 1440 y a 1024, y tambien dentro del drawer |
| g | ¿El pie (estado + modo) se lee como meta, no como navegacion? | **PARCIAL** — la A/B de r2 todavia no estaba decidida | **SI** — variante A | **SI** — 2 renglones de 12px grises, `border-top` de 1px, anclado al borde inferior, `#btnToggleAuthMode` 16px del borde |
| h | ¿A 1024 sigue funcionando? | **SI** | SI | **SI** — rail a drawer (x=0, w236, bottom 900, toggle dentro), `.metrics-row` a 2x2 sin recorte de cifras, `.period-track` sin scroll |
| i | ¿Se lee apple.com? | **Parcial** | Parcial | **Parcial, y honesto** — ver abajo |

### Criterio i sin autoengaño

**El rail ahora sí es un rail de apple.com**: corto, escaneable, sin scroll,
con filete como único divisor, marca en una línea, indicador de activo sobrio
(regla de 2px + peso, no un bloque de color), iconos SVG lineales de 1.5px con
`currentColor`, pie desemphasizado yMetadata, cero cajas y cero pills en la
navegacion.

**Lo que sigue sin leerse como apple.com, y no sale de CSS:**

1. **Un panel de gastos no es una landing de apple.com.** apple.com vende con
   fotografia de producto a escala gigante y copy muy corto; aca hay 9 filas
   de gastos con 4 columnas cada una. La estructura es la correcta; la
   direccion de arte no existe.
2. **La banda de metricas es un patron de panel, no de apple.com.** Cuatro
   cifras alineadas con filetes verticales es un KPI row de herramienta
   financiera. apple.com mostraria el precio como un titular suelto.
3. **Las 5 capsulas de categoria** son un control segmentado honesto, pero
   apple.com expresaria eso como una tira de navegacion local, no como
   capsulas.
4. **El tema es oscuro.** apple.com es claro casi en su totalidad.
5. **El rail deja 573px de vacio** entre el buscador y el pie. Es el punto mas
   flojo y se intento arreglar por dos vías (ab-2, ab-3) sin exito honesto. Se
   eligio el vacio porque un rail corto con el meta al pie es el patron
   establecido, y porque el rail tiene que seguir siendo una columna de 900px
   para que el drawer del breakpoint de 1024 funcione igual.

---

# RECORRIDO FUNCIONAL (30 comprobaciones, todas OK)

Metodo: `gastosRemoto.guardar` / `.iniciarSesion` / `.salirDeSesion` /
`.iniciarSesionConGithub` congelados con contadores ANTES de cualquier
interaccion. Reporte: `odd/tasks/capturas/FINAL.report.json`.

| # | Funcionalidad | Resultado | Dato verificado |
|---|---|---|---|
| 1a | Vista Mensual + estado activo del rail | **OK** | `viewMes.active`, `btnNavMes.active`, tick `rgb(148,163,184)`, peso 600 |
| 1b | Vista Consolidado + estado activo del rail | **OK** | `viewPanel.active`, peso 600, matriz 6 filas x 9 columnas |
| 2 | Buscador | **OK** | "1 resultado encontrado" -> 1 fila; limpiar -> 9 filas; `#btnClearSidebarSearch` y el feedback pasan a `flex` |
| 3a | Los 6 periodos | **OK** | 6, 1 activa. Agosto 2026 \| Septiembre 2026 \| Octubre 2026 \| Noviembre 2026 \| Diciembre 2026 \| Enero 2027 |
| 3b | Periodo activo coherente con el topbar | **OK** | selector = topbar = "Septiembre 2026", 1 regla de acento, `aria-pressed="true"` |
| 3c | Click en un periodo | **OK** | indice 1 -> 1, 9 filas re-renderizadas |
| 3d | Flechas anterior / siguiente | **OK** | indice 1 -> 2 "Octubre 2026" -> 1 "Septiembre 2026" |
| 4a | Las 4 categorias con sus totales | **OK** | servicios `S/ 417.80` (6 filas, 3 subtotales) · personales `S/ 198.54` (3f, 3s) · movimientos `0 movs` (0f, 0s) · extras `S/ 0.00` (0f, 1s) |
| 4b | Un acento por categoria | **OK** | 4 ticks distintos: `rgb(147,172,189)` / `rgb(169,155,191)` / `rgb(143,183,163)` / `rgb(195,179,152)` |
| 5a | Presupuesto, balance, cobertura, pagos | **OK** | `S/ 616.34` · `0 de 9 gastos pagados` · `S/ 0.00` "Equilibrado" · `0.0%` · "Gastos Pagados: S/ 0.00 de S/ 616.34" · "Pendiente: S/ 616.34" · "0.0% Pagado (0 de 9)" · barra 0% |
| 5b | Acento SOLO en la cifra de estado | **OK** | `#monthBalanceNeto` `rgb(157,184,198)` vs `#monthTotalIngresos` `rgb(241,242,244)` |
| 5c | Ingresos y abonos | **OK** | `S/ 0.00` + "0 abonos registrados" |
| 6 | Movimientos: ingresos, gastos, abonos | **OK (estado vacio)** | feed con 1 nodo, "Sin movimientos registrados.", los 3 filtros conmutan. El dataset tiene 0 movimientos en los 6 periodos: se verifico el **estado vacio**, NO filas con datos |
| 7 | Notas | **OK** | abre con "Recordatorios y observaciones de Septiembre 2026", cierra |
| 8a | Grafico de barras | **OK** | lienzo 984x120, **3363 px pintados**. `is-empty` (1 seccion): sin datos no inventa escala |
| 8b | Grafico donut | **OK** | lienzo 420x280, **25932 px pintados** |
| 9a | Estado de conexion | **OK** | "En linea", `conn-badge conn-online`, punto `rgb(169,175,189)` |
| 9b | Modo Lector / Administrador | **OK** | Lector: `read-only-mode`, "Solo Lectura", 17/17 `.admin-action-btn` ocultos. Administrador: 17/17 visibles, y los tres que se movieron siguen en su lugar — `Nuevo mes` 95.8px, `Abono` 43.7px, `Gasto` 38.5px. El modal de acceso abre |
| 10 | Modales de edicion | **OK** | 7 de 7 abren y cierran: 3 de gasto presupuestado (servicios/personales/extras), ingreso rapido, gasto rapido, nuevo mes (7 opciones de clonado), notas |
| 11 | Selector de segmentos | **OK** | "Extras" apaga la tarjeta (`display: none`), "Ver todo" reactiva las 4 |
| 12 | Acordeon de seccion | **OK** | alto 619.4 -> 0 -> 619.4 |
| 13 | Anillo de foco visible | **OK** | 28 controles con `Tab` real via `Input.dispatchKeyEvent`, **0 sin anillo**, los 28 con `:focus-visible: true` |

## Que NO se perdio — recorrido explicito de la lista pedida

- **Vista Mensual y Consolidado, con estado activo.** OK (1a, 1b).
- **Buscador.** OK (2).
- **Navegacion de mes: los 6 periodos, el activo, anterior y siguiente.** OK (3a-3d).
- **Las 4 categorias con sus totales.** OK (4a, 4b).
- **Presupuesto, balance, cobertura, pagos.** OK (5a, 5b, 5c).
- **Movimientos (ingresos, gastos, abonos).** OK en estado vacio (6). Sin datos reales que ver: limitacion del dataset, no del codigo.
- **Notas.** OK (7).
- **Graficos (donut y barras) en Consolidado.** OK (8a, 8b).
- **Estado de conexion y toggle de modo (Lector / Administrador).** OK (9a, 9b).

---

# VERIFICACION FINAL

## Consola y red

| vista | `console.error` | excepciones | red 4xx/5xx |
|---|---|---|---|
| Vista Mensual 1440 | **0** | **0** | ver nota |
| Vista Consolidado 1440 | **0** | **0** | ver nota |
| Drawer a 1024 | **0** | **0** | 0 |
| Recorrido funcional completo | **0** | **0** | 1 a 6 x `401` |

**Sobre los 401:** todos son `https://...supabase.co/rest/v1/gastos?on_conflict=id`,
que es el refresh contra Supabase con origen `null` de `file://`. **No es una
regresion de esta feature: el baseline `s0-antes.report.json`, corrido antes de
tocar un solo archivo, ya reportaba 1.** Es la razon por la que la app abre
`#modalSessionRoleSelect` y cae a los datos locales. No se toco `supabase-store.js`.

Intentos de escritura a Supabase durante el recorrido: **8 a 16 por corrida,
TODOS interceptados por el congelamiento.** 0 llegaron a la red de escritura.

## Overflow horizontal

| ancho | `scrollWidth` | `clientWidth` | `innerWidth` | overflow |
|---|---|---|---|---|
| 1440 | 1425 | 1425 | 1440 | **NO** |
| 1280 | 1265 | 1265 | 1280 | **NO** |
| 1024 | 1009 | 1009 | 1024 | **NO** |

## Geometria exigida

```
document.querySelector('#appSidebar').scrollHeight <= clientHeight
  -> 900 <= 900        OK
overflow-y del rail: hidden            scrollers internos: 0
solape rail / contenido: 0 px
#btnToggleAuthMode: y 850.4 -> bottom 884, dentro de pantalla: true
.rail-vs-main solape con getBoundingClientRect: 0.0
```

## Contraste (WCAG AA, medido con el color computado y el fondo REAL del elemento)

20 pares nuevos. **0 fallos.**

| par | px | ratio | minimo |
|---|---|---|---|
| `.metric-cell-value` | 28 | 16.96 | 3 |
| `#monthBalanceNeto` (el unico con acento) | 28 | 9.14 | 3 |
| `.payments-lead` / `.payments-fact` / `.payments-lead strong` | 12 | 8.64 / 8.64 / 16.96 | 4.5 |
| `.metric-cell-label` / `.metric-cell-note` / `.metric-cell-action` | 11-12 | 6.16 | 4.5 |
| `.month-pill-btn` / `.month-pill-btn.active` | 14 | 6.16 / 16.96 | 4.5 |
| `.brand-title` / `.brand-sub` | 15 / 12 | 17.57 / 6.38 | 4.5 |
| `.conn-badge` / `.mode-badge` | 12 | 8.95 / 6.38 | 4.5 |
| `.period-arrow` / `.period-new` | 14 / 13 | 8.64 / 8.64 | 4.5 |
| `.accordion-summary-tag` | 24 | 16.96 | 3 |
| `.search-shortcut-badge` (el mas bajo) | 11 | 5.73 | 4.5 |

## `prefers-reduced-motion` (con `Emulation.setEmulatedMedia`, leyendo `getComputedStyle`)

```
transitionDuration en .sidebar-nav-tab      1e-05s
transitionDuration en .sidebar-search-input 1e-05s
transitionDuration en .neo-toast            1e-05s
animationDuration  en .modal-sheet          1e-05s
animationDuration  en .neo-toast            1e-05s
@keyframes card-anim-in / out / sheet-in / modal-shake   1e-05s los cuatro
transform del press (.sidebar-nav-tab:active)  none  -> cae a opacity
```

## Conteos de la hoja (sobre `css/styles.css`, porque `document.styleSheets[].cssRules` es ilegible sobre `file://`)

| metrica | valor | nota |
|---|---|---|
| `border:` (shorthand) | **13** | los 13 en controles. Bajó de 14: se fue el borde de `.mode-badge` |
| `border-*: 1px solid` (filetes) | **19** | el unico divisor. Subió de 15: los 4 filetes verticales de `.metrics-row` |
| `box-shadow` | **1** | el drawer abierto a <=1024px. Cero decorativo |
| usos de `--radius-pill` | **9** | 5 categorias + 3 filtros del feed + toast, y los carriles de 2px que usan el radio como remate. **Los meses NO son pill** |
| `transition: all` | **0** | de 23 declaraciones `transition` |
| `@keyframes` | **4** | `card-anim-in`, `card-anim-out`, `sheet-in`, `modal-shake` |
| `@media (prefers-reduced-motion)` | **1** | bloque unico con alcance `*` |
| `@media (prefers-color-scheme)` | **0** | apple.com tambien tiene 0 |
| `text-transform: uppercase` | **0** | — |
| `color-mix()` | **0** | — |
| `@font-face` | **0** | SF Pro tiene licencia prohibida para contenido web |
| `linear-gradient` | **2** | los dos del triangulo del `<select>`. No es degradado de color |
| emoji en el DOM | **0** | — |
| `<img>` | **0** | los 8 JPG de `assets/icons/` siguen en disco y `sync_github.js` no se toco |
| SVG | **37 de 37 lineales** | `fill: none`, `stroke` = color heredado, `stroke-width: 1.5px`, hijos con el mismo stroke |
| elementos scrolleando | **0** | `.period-track` `scrollWidth === clientWidth` |

## Contrato DOM: diff final

```
[IDS]       antes=124  ahora=124  perdidos=0  nuevos=0
[CLASSES]   antes=60   ahora=60   perdidos=0  nuevos=0
[ATRIBUTOS] antes=5    ahora=5    perdidos=0  nuevos=0
```

**0 perdidos.** Se movieron ids y clases de lugar, pero ninguno cambio de
nombre, asi que ningun binding quedo huerfano. Los dos ids que sí perdieron su
nodo (`#paidSummaryLabel`, `#coverageTextInfo`) siguen en el contrato porque el
extractor lee `app.js`, donde los bindings quedan intactos y toleran `null`.

## Pestanas del usuario

`/json/list` al terminar: **23 targets, 0 de tipo `file://` o `about:blank`.**
Todos los targets propios cerrados con `Target.closeTarget` en `finally`. Las
pestanas del usuario siguen intactas (WhatsApp, el sitio publicado, dos de
apple.com, un login universitario, YouTube). Nunca se uso
`Browser.setWindowBounds`. `Page.bringToFront` solo se aplico al target propio
creado con `newWindow: true`, y hizo falta: sin el, Chrome frena el
`requestAnimationFrame` y los lienzos de Chart.js se miden a cero pintados.

---

# TOKENS DE `apple-com-tokens.md` USADOS

`references/apple-com-tokens.md` §5 es la unica fuente primaria de espaciado que
existe, y es minima: publica **16px** y **10px**. No hay una escala vertical.

| token | valor | seccion | procedencia |
|---|---|---|---|
| `--space-tight` | 4px | §5 | **[NV]** no esta en el archivo |
| `--space-1` | 8px | §5 | **[NV]** no esta en el archivo |
| `--space-10` | 10px | §5 | **[V]** §5 `button-space-between` |
| `--space-2` | 16px | §5 | **[V]** §5 `padding-top` del localnav / `menucta-space-after` |
| `--space-3` | 24px | §5 | **[NV]** no esta en el archivo |
| `--space-4` | 32px | §5 | **[NV]** no esta en el archivo |
| `--space-5` | 40px | §5 | **[NV]** no esta en el archivo |
| `--space-6` | 48px | §5 | **[NV]** no esta en el archivo |
| `--space-7` | 72px | §5 | **[NV]** no esta en el archivo |

**7 de 9 pasos son [NV].** Los no verificados son multiplos de 8 alrededor del
par verificado y coherentes con el, pero no se presentan como oficiales.

Del mismo archivo, y si verificados:

| token | valor | seccion |
|---|---|---|
| `--radius-xs` / `--radius-sm` / `--radius-md` | 5px / 6px / 10px | §4 |
| `--radius-pill` | 980px | §4, la capsula |
| `--material-backdrop-filter` | `blur(20px)` | §3, **sin** `saturate()` |
| tracking de display | `-0.02em` | §2 (`-1.2px / 80px ≈ -0.015em` medido) |
| ratio de leading de display | 1.05 | §2 |
| `--focus-ring` | `#0088ff` | §7, systemBlue vigente de la HIG |

**`[NV]` y agregados en esta feature:**

- `--text-metrics: 1.75rem` (28px). **Es una decision de ancho, no de gusto:**
  son 4 celdas sobre 1080px de medida = 222px utiles por cifra. A 32px mono,
  "S/ 12,345.67" (13 caracteres) mide 230px y NO entra; a 28px mide 202px y
  entra con 20px de margen. Es el paso mas grande que cumple, y por eso no se
  forzo la escala existente.
- `--rail-width: 236px`. **[NV]**, heredado de la ronda anterior. No hay ancho
  de rail publicado por apple.com.
- Todos los colores. La HIG publica colores de plataforma y advierte que
  "fluctuan entre releases"; aqui se verificaron solo por contraste medido.

---

# DECISIONES QUE NO ESTABAN ESPECIFICADAS

1. **`--text-metrics` de 28px como paso propio**, en vez de forzar `--text-3xl`
   o `--text-2xl`. Motivo medido en el punto 1 del bloque de tokens.
2. **La cifra de seccion bajo de 32px a 24px.** Nadie lo pidio. Es lo que hace
   que la fila de metricas responda la pregunta antes que el detalle: un padre
   no puede pesar menos que su parte.
3. **"Abono" y "Gasto" viajan pegados a su cifra**, no en el rail. Un boton al
   pie de una columna de navegacion esta dos contextos mas lejos del dato que
   modifica.
4. **"Nuevo mes" se fue con el selector de periodos.** Es gestion de
   periodos: ni navegacion ni meta de sesion. Y su `admin-action-btn` hace que
   el filete que lo separa del riel desaparezca solo en modo Lector.
5. **El pie anclado al borde inferior con `margin-top: auto`**, no pegado al
   buscador. Decidido por A/B con capturas (`r2-A` vs `r2-B`), no por gusto.
6. **El activo del selector de periodos lleva la regla DEBAJO.** En el rail
   iba a la izquierda porque era vertical; en una fila horizontal, arriba
   competiria con el titulo de la seccion que tiene justo encima.
7. **`role="group"` en vez de `role="tablist"`**, y `aria-pressed` en cada mes.
   El `tablist` anterior no tenia un solo `role="tab"`: era ARIA invalido que
   la ronda anterior dejo pasar.
8. **`aria-pressed` con `scrollIntoView({ inline: 'center' })`.** El eje cambio;
   `block: 'nearest'` solo alcanzaba en vertical.
9. **Dos ids eliminados de verdad** (`#paidSummaryLabel`,
   `#coverageTextInfo`), con el binding de `app.js` intacto. La consigna era no
   perder FUNCIONALIDAD, y las dos cadenas eran duplicados exactos verificados
   en `app.js`. Si la preferencia es no borrar ningun nodo, se pueden
   reincorporar: la hoja ya no tiene reglas para ellos.
10. **El carril de pagos a 180px y alineado a la derecha.** Estirado a lo que
    sobra (350px medidos) competia con los textos y se leia como un filete mas.
11. **La banda de metricas abre hacia abajo**: se surnio el `border-bottom` de
    `.payments-strip`. Tres filetes horizontales en 128px ya no leian como
    superficie continua.
12. **El rail conserva `--bg-canvas` y su `border-right`.** Probadas las dos
    alternativas (`ab-2`, `ab-3`) y rechazadas por medicion y por captura.
13. **`.period-track` oculta la barra de scroll.** Con 6 periodos no hay
    overflow y no se ve; con 24 hay que poder desplazarse, y los ⟵ ⟶ mas el
    deslizador son la pista. Una barra de 8px bajo una fila de 28px rompe la
    lectura de una linea.
14. **`.codegraph/` agregado al `.gitignore`.** El indice local no va al repo.

---

# LO QUE NO QUEDO BIEN

1. **573px de vacio en el rail.** Es lo mas flojo del resultado. Se intento
   absorber con dos vias (superficie continua, sin filete) y las dos se
   rechazaron a la vista. Se eligio el vacio porque el rail tiene que seguir
   siendo una columna de 900px para que el drawer de <=1024px sea el mismo
   elemento, y porque anclar el meta al borde inferior es el patron
   establecido. Si el rail midiera lo que su contenido, el drawer habria que
   rehacer aparte.
2. **Criterio i, parcial y honesto.** Ver el detalle arriba. El rail es de
   apple.com; la banda de metricas es de panel financiero, y la direccion de
   arte que le falta a apple.com no sale de CSS.
3. **La banda de metricas es una fila de 4 celdas, y 2 celdas llevan boton.**
   En modo Lector las acciones desaparecen y las celdas 1 y 2 quedan con la
   cifra sola; la alineacion no se mueve porque el boton va con `flex-start`.
   En modo Administrador las celdas 3 y 4 tienen menos contenido que 1 y 2.
   Se eligio la alineacion de las cifras sobre la simetria de las celdas.
4. **La cobertura y el importe pagado quedaron sin su duplicado, no sin su
   explicacion.** `#coverageTextInfo` decia "Cobertura: 0.0%" debajo de una
   cifra que ya decia "0.0%". Se fue el duplicado. Si en algun momento hace
   falta la frase, vuelve el nodo y hay que escribirle una regla.
5. **El feed de movimientos se sigue verificando solo en estado vacio.** El
   dataset de este navegador tiene 0 movimientos en los 6 periodos. Los
   filtros conmutan, pero el render de filas con datos **no se vio**. Es la
   unica funcionalidad sin verificar visualmente con contenido real, y no es
   culpa de esta feature.
6. **La banda de pagos suma 43.6px y el selector 60px antes de la primera
   categoria.** El documento paso de 2307px a 2523px. Es el precio de mover
   527px de datos fuera del rail y ponerlos arriba, donde se leen. No es una
   perdida: es la misma informacion en el lugar donde responde la pregunta.
7. **Los 401 a Supabase en `file://`.** No es una regresion (el baseline ya
   reportaba 1) y no se toco `supabase-store.js`. Con origen `null` no hay
   refresh_token, la app cae a los datos locales y por eso abre
   `#modalSessionRoleSelect`. Verificado con GitHub OAuth servido sobre
   `file://` no es posible: hace falta un origen http.

---

## Estado de publicacion

**NADA PUBLICADO.** `sync_github.js` no se ejecuto, ni siquiera con
`--dry-run`. El sitio publicado en `adrianhola3.github.io/GastosMensuales/`
sigue con el diseño de la ronda anterior.