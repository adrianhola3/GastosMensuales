# Feature: endurecer el rediseño para que cumpla las Hard Rules de apple-web-design

## Objetivo

Hacer que la Web de Gastos Mensuales se lea como apple.com y no como un dashboard
oscuro genérico, cumpliendo de verdad las Hard Rules de la skill
`apple-web-design`. El rediseño anterior (tokens, tipografia, tema oscuro) ya esta
aplicado y publicado; esta feature cierra lo que falto.

## Problema

El rediseño anterior aplico la ESTRUCTURA de la skill pero no sus HARD RULES.
Medido sobre el estado actual:

- **11 emoji distintos, 13 usos en `index.html` y 13 en `js/app.js`.** La skill
  los rechaza por nombre: "Reject AI slop: gradient headlines, decorative icons,
  neon glow, emoji icons".
- **27 colores hex distintos** en `css/styles.css`, con verde, sky, azul, violeta,
  rosa, cyan, ambar y rose saturados. Eso es neon, no la paleta medida de apple.com.
- **`prefers-reduced-motion`: 2 reglas contra 65 transiciones.** La skill marca
  `prefers-reduced-motion` como correcto (34 reglas en apple.com).

Por eso el sitio sigue sintiendose "salida de IA" aunque la tipografia y los
tokens ya esten bien.

## Decision tomada por el usuario

**Un acento por categoria, desaturado.** Se conserva el codigo de color por
categoria porque cumple funcion de reconocimiento rapido, pero se baja la
saturacion para que deje de gritar. No se va a monocromo ni a un unico azul.

Se conserva ademas la identidad oscura "Neo-Fintech Obsidian" y el mono para
cifras, decisiones ya tomadas y aceptadas en la feature anterior.

## Alcance

- `index.html`: sacar los 13 emoji.
- `js/app.js`: sacar los 13 emoji, **solo dentro de cadenas de plantilla**.
- `css/styles.css`: redefinir la paleta a 4 acentos desaturados + neutros,
  cubrir `prefers-reduced-motion`, y revisar los radios.

## Fuera de alcance

- Cambiar la arquitectura, agregar funcionalidad o migrar a un framework.
- Tocar la logica de negocio, Supabase o la persistencia.
- Reemplazar el tema oscuro por claro.
- Publicar sin que el usuario lo pida explicitamente.

## Restricciones duras

1. **NO renombrar ni un solo ID ni clase.** `js/app.js` (1506 lineas) ata eventos
   al DOM. Un renombre rompe la app en silencio.
2. **En `js/app.js` solo se tocan caracteres emoji dentro de cadenas.** Ni una
   linea de logica, selectores, listeners, calculos ni comparaciones.
3. Nada de SF Pro ni webfonts de Apple. Solo `system-ui, -apple-system, sans-serif`.
4. Nada de gradientes en titulos, ni glow, ni Liquid Glass en la capa de contenido.
5. Animar solo `transform` y `opacity`.

## Tareas

- [x] P1 Inventario exacto de los 26 emoji y de que elemento representa cada uno.
- [x] P2 Snapshot del contrato DOM (IDs y clases referenciados desde `js/app.js`).
- [x] P3 Quitar emoji de `index.html`.
- [x] P4 Quitar emoji de `js/app.js` (solo cadenas).
- [x] P5 Redefinir paleta: 4 acentos desaturados + neutros, en `css/styles.css`.
- [x] P6 `prefers-reduced-motion` que cubra las transiciones.
- [x] P7 Revisar radios: un `border-radius` grande no es un squircle.
- [x] P8 Verificar: contrato DOM intacto, sin overflow, sin errores de consola.
- [ ] P9 Dry-run y publicacion, solo con pedido explicito del usuario.

## P1 Inventario de los glifos (83 ocurrencias, 27 distintos, 2 archivos)

Medición real: `index.html` 44 ocurrencias / 23 distintos; `js/app.js` 39
ocurrencias / 15 distintos. El conteo de "26 emoji" de la seccion Problema
era una subestimacion: no contaba flechas ni simbolos.

| Glifo | U+ | Donde | Destino |
|---|---|---|---|
| Cerrar panel, limpiar busqueda, 6 cerrar-sheet | `2705` | HTML 34, 63, 671, 731, 774, 823, 843, 878 | SVG inline (accion del boton) |
| Lupa del buscador | `1F50D` | HTML 54 | SVG inline |
| Chevrones de mes anterior / siguiente | `25C0` `25B6` | HTML 76, 77 | SVG inline |
| Chevron de acordeon (x4) | `25BC` | HTML 288, 345, 403, 445 | SVG inline |
| Subir / bajar en botones de accion | `2191` `2193` | HTML 95, 108, 415, 418 | borrado: el texto ya dice la accion |
| Intercambio en titulo de metrica | `21C4` | HTML 121, 497 | borrado |
| Reloj de pendiente | `23F3` | HTML 138, 710 | borrado |
| Subida de cobertura | `1F4C8` | HTML 139 | borrado |
| Candado de modo lectura | `1F512` | HTML 153 | vacio + `:empty` -> `display:none` |
| Calendario de periodo | `1F5D3` | HTML 177 | borrado: el badge ya dice el mes |
| Mano del aviso de categorias | `1F446` | HTML 272 | elemento eliminado |
| Flecha deIr/ver disponibilidad | `2192` | HTML 622, 637 | borrado |
| Ojo / cetro de tarjeta de rol | `1F441` `1F451` | HTML 614, 629 | vacio + `:empty` |
| Construccion "en desarrollo" | `1F6A7` | HTML 646, 886 | vacio + `:empty` |
| Volver | `2190` | HTML 659 | borrado |
| Tilde de pagado / confirmado | `2713` | HTML 137, 711, 808, 932 | borrado / vacio |
| Bolso de pago variable | `1F4B0` | HTML 770 | vacio + `:empty` |
| Bombilla de pista | `1F4A1` | HTML 802, 861 | borrado: la pista ya es texto secundario |
| Iconos del feed (papelera, tilde, reloj) | `1F5D1` `2713` `23F3` | app.js 674, 663, 640, 661, 743 | payload de toast vacio |
| Puntos y chevron de pildora de mes | `25CF` `203A` | app.js 378 | vacio: `.month-pill-btn.active` ya marca el activo |
| Punto de "tiene notas" | `25CF` | app.js 456, 1142 | punto dibujado en CSS (`border-radius: 50%`) |
| Sentido del movimiento en el feed | `2191` `2193` | app.js 716 | SVG inline (informacion real) |
| Emoji del feed vacio | `1F4B8` | app.js 700 | `<div>` decorativo eliminado |
| Calendario y flecha de la matriz | `1F5D3` `2192` | app.js 780, 781 | borrado |
| Info de borde de mes | `2139` | app.js 1079, 1089 | payload de toast vacio |
| Tilde de guardado automatico | `2713` | app.js 1132 | borrado: el texto ya dice "Guardado" |
| Confeti de mes creado | `1F389` | app.js 1407 | payload de toast vacio |

Total en DOM tras el cambio: **0**. En `css/styles.css` solo quedan flechas `→`
de prosa en comentarios, que documentan la modificación.

## P5 Paleta: decision de color

Se conservan los hues por categoría (152 verde, 205 azul, 262 violeta, 38 ambar)
y se baja saturación. Regla de construcción: **misma luminosidad y mismo croma
bajo en los cuatro acentos**, para que se lean como una familia.

| Token | Antes (saturación) | Ahora | Contraste vs `--bg-card` |
|---|---|---|---|
| `--accent-emerald` | `#10b981` (0.99) | `#74b496` (0.62) | 8.16:1 |
| `--text-emerald` | `#34d399` (0.95) | derivado 72% | 9.58:1 |
| `--accent-rose` | `#f43f5e` (0.95) | `#bc767d` (0.64) | 5.64:1 |
| `--text-rose` | `#fb7185` (0.83) | derivado 72% | 7.53:1 |
| `--accent-cyan` | `#06b6d4` (1.00) | `#76a0b2` (0.59) | 6.97:1 |
| `--text-cyan` | `#22d3ee` (0.98) | derivado 72% | 8.68:1 |
| `--cat-servicios` | `#38bdf8` (0.96) | `#93acbd` (0.43) | 8.31:1 |
| `--cat-personales` | `#c084fc` (0.76) | `#a99bbf` (0.37) | 7.61:1 |
| `--cat-movimientos` | `#34d399` (0.95) | `#8fb7a3` (0.42) | 8.87:1 |
| `--cat-extras` | `#fbbf24` (0.98) | `#c3b398` (0.42) | 9.57:1 |

`--text-muted` sube de `hsl(220,10%,50%)` a `hsl(220,10%,62%)`: el anterior daba
4.34:1 contra `--bg-card` y NO alcanzaba el mínimo WCAG AA de 4.5:1.

Cada matiz declara **un** hex. La variante de texto y los tres velos salen por
`color-mix()` del mismo base, asi que no pueden existir dos "verdes" distintos.
Eso baja el conteo de hex de 27 a 23 y elimina 14 `rgba()` sueltos.

## Verificacion

- Comparar el conjunto de IDs/clases referenciados en `js/app.js` contra el
  snapshot de P2: debe ser identico.
- Renderizar el sitio por CDP en ventana propia, capturar pantalla, y medir
  overflow horizontal y errores de consola.
- `node sync_github.js --dry-run` antes de cualquier publicacion.

### Evidencia (2026-10-02)

Contrato DOM, regenerado desde el `js/app.js` ya editado y comparado con
`dom-contract-snapshot.txt` (generado ANTES de editar):

```
[IDS]       antes=126  despues=126   eliminados=0  agregados=0
[CLASSES]   antes=55   despues=56    eliminados=0  agregados=1 -> ui-glyph
[ATRIBUTOS] antes=3    despues=3     eliminados=0  agregados=0
CONTRATO DOM INTACTO: 0 ids eliminados, 0 clases eliminadas, 0 atributos eliminados.
```

`ui-glyph` es una clase NUEVA para los SVG inline. No se renombro nada.

Conteos finales:

- emoji en `index.html`: **0** (44 antes) · emoji en `js/app.js`: **0** (39 antes)
- hex distintos en `css/styles.css`: **23** (27 antes), 25 ocurrencias contando
  las 2 de prosa en comentarios
- `border-radius` fuera del sistema: **0** (antes: un `4px` suelto)
- `prefers-reduced-motion`: cubre las 36 declaraciones `transition` reales y los
  6 `@keyframes`, con `transition-delay` y `animation-delay` incluidos
- lineas escritas: `index.html` 40, `js/app.js` 32, `css/styles.css` 202 → **274**
  (presupuesto de la feature: ~400, sin exceder)

Navegador (CDP, target propio en segundo plano, 1440x900, `file://`):

- `document.title` = "Control de Gastos & Presupuesto"
- `document.documentElement.scrollWidth` 1434 <= `innerWidth` 1440 → **sin overflow**
- emoji en `document.body.innerText`: 0 · `svg.ui-glyph` en el DOM: 25
- `color-mix()` soportado y **resuelto**: `--text-emerald` computa a
  `color(srgb 0.595451 0.777255 0.694745)` = `#98c6b1`, el valor previsto
- contenedores de glifo vacios colapsados: `#toastIcon`, `#authModeIcon`,
  `.modal-glyph`, `.metric-icon-box`, `.role-card-icon` → `display: none`
- `.search-box-icon` sigue `block` a proposito: contiene la lupa SVG, y `:empty`
  no cuenta elementos
- consola: **0 excepciones no capturadas**. Un `401` de red, intermitente
  (2 de 6 corridas), del endpoint de **auth** de Supabase: probado en directo
  desde la pagina, `POST /auth/v1/token?grant_type=refresh_token` responde
  `400 "Refresh token is not valid"` mientras `GET /rest/v1/gastos` responde
  `200`. Es consecuencia de abrir por `file://` (origin `null`), no de este
  cambio. No aparece en el sitio publicado por https.

## Iteración 2 (2026-10-02): ESTRUCTURA, no paleta

La iteración 1 quitó los emoji y bajó la saturación. **El sitio seguía sin verse
como apple.com.** La causa no era el color: era que cada elemento tenía caja.
Medido sobre el estado al terminar la iteración 1:

| Síntoma | Medición |
|---|---|
| Una caja alrededor de casi todo | 303 apariciones de `border` en `styles.css`, 39 de ellas `border: 1px` |
| Chips por todo | 54 elementos `chip`/`badge`/`pill` en `index.html` |
| Sin ritmo vertical | `padding`/`margin` de **1px y 2px**: once declaraciones. No era una escala, era relleno |
| El mismo chip 20 veces | 20 filas de gasto, cada una con chip "Pendiente" idéntico (fondo translúcido, borde, radio 980px) |
| Rotulado cada región | 6+ etiquetas en MAYÚSCULAS con `text-transform: uppercase` + tracking 0.08em |
| Color como identidad repetida | el color de categoría aparecía **5 veces** por categoría: filete del header, `h3`, `#summaryTag*`, `#badgeSeg*`, `--seg-accent` |

### Tareas de la iteración 2

- [x] P10 Snapshot del contrato DOM regenerado ANTES de editar (124 ids / 56 clases / 5 atributos).
- [x] P11 Escala vertical real de 9 pasos desde `apple-com-tokens.md`, con la procedencia de cada valor anotada. 0 declaraciones de 1px/2px.
- [x] P12 Eliminar la caja de cada fila de gasto y de cada fila del feed. `border` 303 → 137; `border: 1px` 39 → 11.
- [x] P13 Jerarquía tipográfica de 3 niveles por tarjeta, verificada con `getComputedStyle`: total 20px, título 15px, descripción 12px. Nuevo paso `--text-5xl` (40px) para la KPI hero.
- [x] P14 Matar el badge repetido: el estado de la fila lo dice la tipografía; el punto de color solo en hover.
- [x] P15 Bajar las mayúsculas: 0 declaraciones de `text-transform: uppercase` en la capa de contenido; rótulos en sentence case.
- [x] P16 Un acento por categoría, UNA vez: el filete superior de la tarjeta. De 5 apariciones a 1.
- [x] P17 Menos chrome en el sidebar: 3 tarjetas con filete de color → lista de definición sin caja. Sin tocar ids ni clases.
- [x] P18 Iconos JPEG bajados de saturación por CSS (`saturate(0.35)` + `opacity: 0.72`). Sin assets nuevos.
- [x] P19 **Desbloquear y arreglar `js/charts.js`**: lee los tokens, 0 literales de color. Ya no queda el gap de la iteración 1.
- [x] P20 Verificar mirando: 5 rondas de captura por CDP, no lectura de CSS.
- [ ] P21 Dry-run y publicación, solo con pedido explícito del usuario.

### Lo que hace que algo se vea Apple y no "dashboard"

Cinco reglas, cada una con la medición que la sostiene.

**1. La caja es el default en un dashboard; en Apple es la excepción.**
Medido: 10 filas de gasto con `border-bottom: 1px` cada una. Con 20 filas eso
es una tabla rayada, y el ojo lee la línea antes que el dato. Ahora: **0 lados de
borde en fila** (`rowBorderSides` 10 → 0, verificado con `getComputedStyle`).
El filete sobrevive solo arriba de `.category-subhead` y en el subtotal que cierra
la lista: los dos puntos donde de verdad separa un grupo de otro.

**2. El espacio vertical, siempre, y con escala.**
Once declaraciones con 1px o 2px no eran una escala. Ahora hay 9 pasos y cero
declaraciones de 1px/2px. El valor que más se nota no es un padding: es el
**gap entre tarjetas, de 16px a 32px**. Dos cajas a 16px se leen como una
superficie con líneas; a 32px se leen como dos objetos. Ese medio paso hace más
que cualquier cambio de color.

**3. El estado repetido 20 veces grita una sola vez.**
Diez botones idénticos con el mismo fondo, el mismo borde, el mismo radio y el
mismo texto. Repetir un badge no aumenta la información: la anula, y además
esconde lo accionable. El estado de una fila lo dice la tipografía (peso/color
sutil); el dato de "cuánto falta pagar" ya está en la barra de segmentos y en el
panel de progreso del sidebar, que es donde se lee de verdad.

**4. La jerarquía tipográfica separa; la caja no.**
Antes, en cada tarjeta, todo pesaba lo mismo: título 15px, total 12px en un
chip, descripción 12px. El ojo no tenía por dónde entrar. Ahora el contraste es
explícito y medido:

| Elemento | Antes | Ahora |
|---|---|---|
| Total de tarjeta | 12px en chip | **20px** mono/600, `--text-main` |
| Título de tarjeta | 15px/600 | 15px/600 |
| Descripción | 12px | 12px `--text-muted` |
| Titular de vista | 24px | **32px** |
| KPI hero | 30px | **40px** (paso nuevo) |
| Concepto de fila | 14px/500 | 14px/**600** |
| Cifra de fila | 14px | **15px** |

Y el contraste se conserva: total 16.68:1 contra el fondo real de la tarjeta,
descripción 6.51:1. **La jerarquía la da la escala, no el color.**

**5. El color es estado o acción, nunca identidad repetida.**
Cinco apariciones por categoría pasaron a una: el filete superior de la tarjeta.
Cuatro categorías, cuatro colores, cero repeticiones. En el feed, el círculo con
fondo teñido y borde por movimiento también se va: el sentido lo dan el chevron
y el signo de la cifra.

### Bug encontrado mirando, no leyendo CSS

El sidebar **se cortaba**. `scrollHeight` 1001px dentro de una ventana de 900px:
el footer (conexión, modo de acceso, nuevo mes) quedaba 101px por debajo del
borde y no se veía sin scrollear.

La causa era el padding vertical de 16px × 4 secciones más una lista de meses de
160px. Con 8px de padding vertical y `max-height: 128px` en la lista de meses,
`scrollHeight` baja a 900px y el footer entra entero (`clipped: false`).

Esto importa más de lo que parece: `#btnToggleAuthMode` es la puerta de entrada
al modo administrador. Si queda fuera de pantalla, el permiso existe pero no se
llega.

**La lección del método:** los conteos de CSS describen la hoja; los de
`getComputedStyle` describen lo que el usuario ve. Los dos divergen, y el segundo
es el que importa. "Sin overflow horizontal" era cierto en las dos rondas
mientras el footer no se veía.

### Trampas de CDP (no documentadas antes)

1. **`http.get` con `headers: { Host: 'localhost' }` rompe la URL del
   WebSocket.** Brave devuelve `ws://localhost/devtools/browser/<id>`: se pierde
   el puerto y el handshake falla con "ws error sin detalle", sin stack útil. La
   pista: `new WebSocket(url)` directo SÍ funciona, así que el problema es la
   URL, no el navegador. Sin sobreescribir `Host`, la URL trae `ws://127.0.0.1:9222/...`.
2. **`Target.createTarget` sin `background: true`.** Brave descarta los targets
   en segundo plano con "No target with given id found", y el fallo aparece en
   el *attach*, no en la creación.
3. **`await sleep(7000)` no es determinista.** El modal de login puede abrir
   después de los 7s. Hay que reinyectar el `<style>` que lo esconde después de
   cambiar de vista, o comprobar `.active` antes de capturar.
4. **`getPropertyValue` sobre un token derivado por `color-mix()` NO sirve para
   un `<canvas>`.** Devuelve la cadena literal `"color-mix(in srgb, #74b496 72%,
   #f4f5f7)"`, que Chart.js no parsea: la serie se dibuja invisible. Hay que
   apuntar a un token que sea **hex plano**. Error real de esta iteración: con
   `--text-emerald` el área bajo la curva era negra; con `--accent-emerald`
   dibujaba bien.
5. **La sonda de contraste tiene que distinguir dos formas de color.**
   `rgb(r, g, b)` con canales de 0 a 255, y `color(srgb 0.59 0.77 0.69)` que es
   la forma computada de un `color-mix()` en Chrome 154, con canales de 0 a 1.
   Sin esa distinción el contraste da 1.11:1 y parece un bug de color lo que es
   un bug de la sonda.

### Los 8 criterios, ronda por ronda

| # | Criterio | Ronda 1 | Ronda final |
|---|---|---|---|
| a | ¿Caja alrededor de cada fila de gasto? | NO (10 → 0 lados) | NO |
| b | ¿Los 20 badges "Pendiente" idénticos? | NO, pero 10 puntos rosa seguían gritando | NO, y el punto solo aparece en hover |
| c | ¿La cifra protagonista se lee primero? | SÍ (20px vs 15px vs 12px) | SÍ |
| d | ¿6+ etiquetas en MAYÚSCULAS? | NO (0) | NO (0) |
| e | ¿Color en cada fila? | NO | NO, y en la matriz el color bajó a la única celda cuyo estado cambia (balance) |
| f | ¿Donut con colores saturados hardcodeados? | NO, leía tokens | NO |
| g | ¿Espacio vertical real entre bloques? | SÍ (32px) | SÍ |
| h | ¿Se lee Apple o "dashboard"? | **Parcial**: sin cajas ni chips, pero la matriz seguía con 12 celdas de color repetido y el footer no se veía | **Mucho más cerca**: queda un dashboard sobrio, no el tablero de antes. Lo que impide leerlo como apple.com ya no es estructura |

### Verificación final

Contrato DOM, regenerado desde `js/app.js` ya editado y comparado contra el
snapshot de P2 (generado ANTES de editar) y contra una sonda propia:

```
[IDS]       antes=124  despues=124  eliminados=0  agregados=0
[CLASSES]   antes=56   despues=56   eliminados=0  agregados=0
[ATRIBUTOS] antes=5    despues=5    eliminados=0  agregados=0
CONTRATO DOM INTACTO: 0 ids eliminados, 0 clases eliminados, 0 atributos eliminados.
```

Contra el snapshot original (126 ids / 55 clases / 3 atributos), el comparador
reporta **0 perdidos reales** y filtra 3 falsos positivos del extractor previo:
`${escaparHTML(item.id)}` y `${escaparHTML(r.monthId)}` en `[IDS]` (son
interpolaciones de `data-item-id="..."`, no ids) y `activeId` en `[CLASSES]` (es
la variable de app.js:372, no una clase). Los "agregados" que aparecen
(`content-card-box`, `ui-glyph`, `data-item-id`, `data-month-id`) son reales y
ya estaban antes de esta iteración: son de la iteración 1.

Conteos finales:

| Métrica | Antes | Ahora |
|---|---|---|
| `border` en `styles.css` | 303 | **137** |
| `border: 1px` | 39 | **11** |
| declaraciones `border*` | 180 | **102** (42 son `border-radius`, que no dibujan caja) |
| `box-shadow` | 10 | **6** (3 de foco, 2 de capa flotante, 1 de drawer) |
| `class=` con chip/badge/pill en `index.html` | 54 | **50**, y de esos solo 3 llevan fondo o borde |
| `padding`/`margin`/`gap` de 1px o 2px | 11 | **0** |
| `text-transform: uppercase` | 5 | **0** |
| emoji/pictogramas en los 6 archivos | 0 | **0** |
| hex distintos en `styles.css` | 23 | 26 |
| `prefers-reduced-motion` | 3 reglas @media | 3 reglas @media, cubren las 36 `transition` y los 7 `@keyframes` |

Los 3 chips que conservan fondo o borde están justificados: el atajo de teclado
`/`, el mes activo de la lista, y el punto de "este mes tiene notas". Los demás
nombres sobreviven por contrato DOM, no por forma.

Navegador (CDP, target propio, 1440×900, `file://`):

- `document.title` = "Control de Gastos & Presupuesto"
- `scrollWidth` 1434 ≤ `innerWidth` 1440 → **sin overflow horizontal**
- **0 excepciones no capturadas**
- Consola: 1 warning de `[supabase-store]` y 1 `401` de red en `POST /rest/v1/gastos?on_conflict=id`. **No son consecuencia de este trabajo.** Probado contra el sitio publicado por https (que corre el código anterior): los mismos 401/400 aparecen, y una prueba directa desde la página confirma la causa: con `origin` `null` el `refresh_token` responde `400`, el `GET /rest/v1/gastos` responde `401` y el `upsert` responde `401 {"code":"42501","message":"new row violates row-level security policy"}`. Es la sesión anon sin token, consecuencia de abrir por `file://`. No aparece en el sitio publicado.
- Capturas en `odd/tasks/capturas/`: `r0-antes.png`, `r1.png`, `r1-panel.png`, `r2.png`, `r3.png`, `r3-panel.png`, `r4-panel.png`, `r5-panel.png`, `FINAL-mes.png`.
- Targets propios: todos cerrados. Verificado con `/json/list`: 0 targets con `file://` o `about:blank` vivos, y las 22 pestanas que el usuario tenía antes siguen ahí. La única diferencia es un service worker de WhatsApp que se re-registró solo.

### Valores tomados de `apple-com-tokens.md`

`references/apple-com-tokens.md` es, para espaciado, una fuente **muy pobre**: §5
publica 16px (`padding-top` del localnav, `menucta-space-after`) y 10px
(`button-space-between`). No hay una escala vertical publicada.

| Token | Valor | Procedencia |
|---|---|---|
| `--space-tight` | 4px | **[NV]** no está en el archivo |
| `--space-1` | 8px | **[NV]** no está en el archivo |
| `--space-2` | 16px | **[V]** §5 `padding-top` / `menucta-space-after` |
| `--space-3` | 24px | **[NV]** no está en el archivo |
| `--space-4` | 32px | **[NV]** no está en el archivo |
| `--space-5` | 40px | **[NV]** no está en el archivo |
| `--space-6` | 48px | **[NV]** no está en el archivo |
| `--space-7` | 72px | **[NV]** no está en el archivo |
| `--space-10` | 10px | **[V]** §5 `button-space-between` |

**7 de 9 pasos son [NV].** Es lo honesto: el archivo no publica una escala. Los
pasos no verificados son múltiplos de 8 alrededor del par verificado, coherentes
con él, pero no se presentan como valores oficiales de Apple.

Del mismo archivo, ya en la iteración 1 y vigente: `--radius-xs/sm/md/lg`
(5/6/10/10px, §4), `--radius-pill: 980px` (§4, la cápsula),
`--material-backdrop-filter: saturate(180%) blur(20px)` (§3), tracking negativo
en display (§2), `--font-display`/`--font-body` como stack legal (§2, porque SF
Pro tiene licencia prohibida para contenido web).

Los 4 acentos de categoría, los 3 semánticos y los 5 neutros de superficie
siguen siendo **[NV]**: la HIG publica colores de plataforma, no de esta app, y
el propio archivo advierte que «fluctúan entre releases». Se verificaron solo
por contraste con `getComputedStyle`.

### Decisiones que no estaban especificadas

1. **El punto de estado de la fila aparece solo en hover.** La directiva pedía
   «que el estado desaparezca del 90% de las filas». Con hover, desaparece del
100% en reposo y aparece justo cuando el estado pasa a ser accionable. Se
   corrigió en la ronda 2: con el punto siempre visible eran 10 puntos
   idénticos y el ojo iba a ellos en vez de a los conceptos.
2. **La barra de la matriz conserva su filete.** La directiva 1 pide filete solo
   para grupos; una tabla de 9 columnas de cifras es el caso donde la línea sí
   separa información en horizontal, y sin ella las columnas no se leen. Se
   quitó el fondo del encabezado, no el filete.
3. **Los tokens `--border-subtle/hover/focus` se renombraron a
   `--hairline/-strong/-focus`.** Ni `js/` ni `index.html` los leían. El nombre
   nuevo documenta la decisión y evita que la próxima iteración los vuelva a
   usar como si fueran "el borde por defecto".
4. **27 declaraciones `border: none` se reemplazaron por un reset de
   `button, input, select, textarea`.** El UA stylesheet de Chrome aplica
   `border: 2px outset` y `buttonface` a cada `<button>`: sin el reset,
   `.feed-filter-pill` se veía con un borde gris de 2px.
5. **`border-radius: 0` se eliminó (14 veces).** El UA no aplica radio a
   `button`, así que era ruido.
6. **Los rótulos de tarjeta pasaron a sentence case con la primera en mayúscula**
   («Servicios del hogar», no «Servicios del Hogar»). Apple's copy mixes, pero
   sin saber si el usuario prefiere otro criterio, la convención más neutra es
   dejar el texto como lo escribió quien escribió.
7. **`opacity: 0.72` en los iconos JPEG**, además de `saturate(0.35)`. A 20px un
   JPEG es borroso por naturaleza; bajarlo de opacidad hace que la falta de
   nitidez se lea como peso visual y no como defecto. La directiva 8 pedía
   saturación; esto es la misma decisión aplicada al segundo eje.
8. **El acento de los iconos de tarjeta es `--accent-primary`, no el color de
   categoría.** La minibarra dice «cuánto se pagó de este grupo», no «de qué
   categoría es». Si llevara el color de categoría, serían 5 repeticiones por
   categoría en vez de 1.
9. **`--text-5xl` (40px) es un paso nuevo.** Sin él, la KPI hero (30px) y el
   titular de vista (24px) quedaban a 1.25x y no se leía cuál era el titular.

### Lo que NO se hizo y por qué

- **No se ocultó el estado en las filas** (la directiva lo planteara como
  opción). El botón tiene que seguir siendo un `<button>`: `app.js` liga el
  click, reescribe `className` y `textContent`, y
  `body.read-only-mode .btn-status-toggle` depende de que sea un control. Ocultar
  el texto rompe el contrato o esconde un estado real.
- **No se tocó `js/store.js`, `js/config.js`, `js/supabase-store.js`.** Los tres
  conservan su código, incluidas sus advertencias de red que no son de este
  trabajo.
- **No se publicó nada.** `sync_github.js` sigue sin ejecutarse.
- **Criterio h, sin autoengaño:** se ve mucho mejor y ya no es un tablero de
  líneas, pero sigue siendo un panel financiero oscuro, no apple.com. Lo que le
  falta no es estructura: es que apple.com vende con fotografía de producto a
  escala gigante y con copy muy corto, y un panel de gastos no tiene ninguna de
  las dos cosas.

## Iteración 3 (2026-10-02): SVG inline y equilibrio de la retícula

Pasada quirúrgica. NO se rehizo el trabajo de las iteraciones 1 y 2 (borrado de
cajas por fila, jerarquía tipográfica, mayúsculas, acentos desaturados, 0 emoji).
Solo dos problemas, medidos sobre la captura renderizada.

### Problema 1: los 8 iconos de categoría eran JPG raster

`assets/icons/{analitica,calendario,notas,vertodo,servicios,personales,movimientos,extras}.jpg`
— 8 archivos de 398 KB a 525 KB, **3.8 MB en total**, usados como `<img>` a 20px
(píldoras de segmento, nav del sidebar, botón Notas) y a 32px (encabezados de
tarjeta). Medido en el navegador antes del cambio:

- Los 17 `<img>` presentes, los 17 visibles.
- Con `filter: saturate(0.35)` + `opacity: 0.72` (§19 del CSS) para apagar el
  croma. Advertencia de método: **un `filter` de CSS no cambia los canales que
  devuelve `getComputedStyle(...).color`**, así que una verificación de
  saturación hecha solo sobre `color` da 0 y no ve nada. Hay que leer la
  propiedad `filter`. Los 13 iconos visibles estaban teñidos por ella.

**Fix:** SVG en línea, 21 ocurrencias (17 en `index.html`, 4 en las plantillas
`innerHTML` de `js/app.js`). Mismo lenguaje visual que los 25 `svg.ui-glyph` que ya
existían: `viewBox="0 0 16 16"`, `fill: none`, `stroke: currentColor`,
`stroke-width: 1.5`, `stroke-linecap/linejoin: round`, `aria-hidden="true"`,
`focusable="false"`.

Los 8, con su geometría:

| icono | glifo | geometría |
|---|---|---|
| `analitica` | barras | `<path d="M2.25 13.25h11.5M4.25 13.25v-4M6.75 13.25v-6M9.25 13.25v-8.5M11.75 13.25v-2.75"/>` — 4 barras + base |
| `calendario` | calendario | `<rect x="2.5" y="3.5" width="11" height="10" rx="2"/>` + divisor y 2 dientes superiores |
| `notas` | nota con esquina doblada | contorno con corte diagonal arriba a la derecha + 2 renglones |
| `vertodo` | capas | rombo + 1 galón debajo |
| `servicios` | casa | cumbrera + cuerpo |
| `personales` | persona | `<circle cx="8" cy="5" r="2.25"/>` + arco de hombros |
| `movimientos` | transferencia | 2 flechas horizontales opuestas |
| `extras` | estrella | estrella de 5 puntas, radio externo 5.6 / interno 2.35, centro (8, 8.4) |

#### Los 8 se probaron ANTES de escribirlos, mirando

Se montó una hoja de prueba (`%TEMP%\opencode\glyph-probe.html`) con los 8 a 20px,
a 32px y en escala 5× sin suavizado (`image-rendering: pixelated`), y se capturó
por CDP **antes de tocar el proyecto**. De esa mirada salieron dos correcciones:

- **`notas` como cuaderno con lomo y renglones se emborronaba a 20px y se
  confundía con `calendario`** (los dos son un rectángulo con líneas adentro).
  Se probaron 4 candidatos. El ganador es la **nota con la esquina doblada**: la
  esquina cortada cambia la silueta, y con ella se distingue de `calendario` a
  simple vista. Se descartaron la burbuja de diálogo (más limpia, pero lee como
  "chat", no como "notas") y el rectángulo con 2 renglones (indistinguible de
  `calendario`).
- **`analitica` con 3 barras sueltas leía como `|||`.** Con 4 barras sobre una
  base la silueta es la de una gráfica.

**Los 8 se distinguen entre sí a simple vista: sí.** Verificado en la fila de
prueba a 20px y de nuevo en la captura final.

#### Cambios de CSS que acompañan al swap

- `.ui-icon-img` pierde `object-fit`, `image-rendering`, `filter` y `opacity`: los
  dos últimos existían **solo** para apagar el croma del JPEG. Sin raster no hay
  croma que apagar.
- Se elimina la regla `.brand-logo-box .ui-icon-img`, que solo hacía eso mismo
  (subir `saturate` a 0.5 y `opacity` a 0.92). Sin raster es código muerto.
- `.ui-icon-svg` es la clase nueva de presentación, y **no** fija `width`/`height`
  a propósito: el tamaño sigue viniendo de `.ui-icon-xs` / `.ui-icon-sm` /
  `.ui-icon-pill` / `.ui-icon-nav` / `.ui-icon-brand` / `.ui-icon-card`. Por eso
  **no** se reutilizó `.ui-glyph`, que sí fija `1em` y, al declararse más abajo
  en la hoja, le ganaría a las clases de tamaño (15px en vez de 20px).
- `.ui-icon-xs` / `.ui-icon-pill` / `.ui-icon-nav` / `.ui-icon-brand` /
  `.ui-icon-card` pierden su `border-radius`. No hacía nada sobre un `<img>`
  transparente y menos sobre un trazo.
- **`.ui-icon-img` se conserva como clase** aunque ya no exista ningún `<img>`
  con ella: el snapshot del contrato DOM la lista y sale de las plantillas de
  `app.js`. Restricción 1: se puede agregar, nunca quitar. Queda como gancho de
  maquetación, y el comentario del §19 lo dice explícito.

#### El color de los iconos: `currentColor`, no el acento de categoría

El brief daba dos opciones ("`currentColor` o el acento desaturado de su
categoría"). Se eligió **`currentColor`**, y hay una razón escrita en el CSS: la
iteración 2 verificó en el navegador que el color repetido por identidad (en 5
lugares por categoría) es exactamente lo que hacía que la interfaz se leyera como
un tablero. El acento de categoría sigue viviendo en **un solo lugar**: el filete
superior de la tarjeta (§7). Los iconos no lo repiten. Regla 5 preservada.

### Problema 2: desbalance del grid

Medido a 1440x900 ANTES, con `align-items: start` + `grid-auto-rows: max-content`:

| fila | tarjeta A | tarjeta B | aire muerto fuera de la tarjeta |
|---|---|---|---|
| 1 | Servicios 657px | Personales 483px | **174px** |
| 2 | Movimientos 294px | Extras 191px | **103px** |

El sobrante de cada fila caía **fuera** del borde de la tarjeta hermana, sobre el
fondo de la página: eso es lo que se leía como un agujero en la retícula.

Descomposición de los 294px de "Movimientos del Mes", medida bloque por bloque:

| bloque | alto | nota |
|---|---|---|
| `.content-card-header` | 73px | |
| `.quick-action-buttons-grid` | **32px** | los 2 botones hijos están en `display:none` (modo solo lectura) pero el contenedor **no** se va: 32px de puro padding muerto |
| `.filter-pills-bar` | 44px | |
| `.empty-feed-placeholder` | **141px** | 2 líneas de texto con 48px de padding vertical: el padding era más que el texto |

**Fix, tres cambios:**

1. `align-items: start` → `stretch`, y se quita `grid-auto-rows: max-content`.
   `align-content: start` se conserva: sin él, `stretch` en el eje de bloque
   repartiría las filas sobrantes cuando hay menos de 4 tarjetas activas
   (píldoras apagadas) y las separaría del encabezado de arriba.
2. `.empty-feed-placeholder`: `--space-6` (48px) → `--space-4` (32px). 141px → 109px.
3. `body.read-only-mode .quick-action-buttons-grid { display: none }`. Es el
   mismo patrón que `.modal-glyph:empty` de la §22: un contenedor que existe
   solo para alojar algo que ya no está tiene que irse con eso. `:empty` no
   sirve porque los botones siguen siendo hijos elemento, solo con
   `display: none`. Especificidad (0,2,1) contra (0,1,0): gana sin `!important`
   y también dentro del `@media (max-width: 768px)`.

Medido a 1440x900 DESPUÉS:

| fila | tarjeta A | tarjeta B | aire muerto fuera |
|---|---|---|---|
| 1 | Servicios 657px | Personales 657px | **0** |
| 2 | Movimientos 230px | Extras 230px | **0** |

`Movimientos del Mes` pasó de 294px a 230px.

### El saldo que queda adentro, dicho sin makeup

El aire no desapareció: **cambió de lugar**. Los 174px que estaban fuera de
"Personales" ahora están **dentro** de su tarjeta, abajo. Se lee como aire de la
propia tarjeta y no como un agujero en la retícula, que es el objetivo. Pero es
aire real y se ve.

La forma de resolverlo del todo — clavar la fila de total (`.main-subtotal`)
contra el borde inferior de la tarjeta — **no es posible en CSS acá**:
`js/app.js` lee y escribe `style.display` inline en `.content-card-box` (lo lee
antes de decidir, ~870-882), así que cualquier `display: flex` o `display: grid`
de hoja ahí se sobrescribe en silencio. Queda anotado en vez de meter un
`position: absolute` frágil o tocar la lógica que la restricción 3 prohíbe.

### Verificación de esta iteración

**Conteos**

| | antes | después |
|---|---|---|
| `<img src="assets/icons/` en `index.html` | 17 | **0** |
| `<img src="assets/icons/` en plantillas de `app.js` | 4 | **0** |
| `<img>` totales en `index.html` | 17 | **0** |
| `<img>` totales en plantillas de `app.js` | 4 | **0** |
| `svg.ui-glyph` (los 25 previos) | 25 | 25 |
| `svg.ui-icon-svg` (nuevos) | 0 | **17** |
| geometrías **distintas** entre los nuevos | — | **8** |
| `<img>` de `assets/icons/` **visibles** | 13 | **0** |

**Tamaño de los 8, medido en el navegador** (una sola caja por clase):

| clase | caja | n |
|---|---|---|
| `ui-icon-xs` | 18×18 | 1 |
| `ui-icon-pill` | 20×20 | 5 |
| `ui-icon-nav` | 20×20 | 2 |
| `ui-icon-brand` | 28×28 | 1 |
| `ui-icon-card` | 32×32 | 8 |

Los 17 usan `stroke-width: 1.5px` y `fill: none`, verificado por
`getComputedStyle` sin excepciones. Los 20px y los 32px se siguen respetando.

**Contrato DOM** — `node dom-contract.js js/app.js odd\tasks/dom-contract-snapshot.txt`.
Diff textual completo contra el snapshot anterior:

```
[CLASSES] count=55              <=      [CLASSES] count=57              =>
[TOTAL] suma=184                <=      [TOTAL] suma=186                =>
                                       ui-glyph                         =>
                                       ui-icon-svg                       =>
```

- **ids: 126 → 126. 0 eliminados, 0 agregados.**
- **atributos: 3 → 3. Sin cambios.**
- **clases: 0 eliminadas.** 2 agregadas: `ui-glyph` y `ui-icon-svg`.

**`ui-glyph` NO lo agregó esta iteración.** Se verificó con un experimento
controlado: se regeneró el contrato desde una copia de `app.js` con los 4
`<img>` de esta iteración revertidos a mano, y el resultado **también** traía
`ui-glyph` (56 clases). O sea: el snapshot que estaba en el repo **ya estaba
desactualizado** antes de que yo tocara nada — la iteración 2 agregó los
`svg.ui-glyph` a las plantillas de `app.js` y no regeneró el snapshot. Este
snapshot quedó regenerado (55 → 57) para que la próxima pasada parta de la
realidad.

**`node --check`**: OK en los 5 JS del encargo (`app.js`, `store.js`, `config.js`,
`supabase-store.js`, `charts.js`) y también en `sync_github.js`.

**Consola y red** a 1440x900, vista mensual:

- `document.documentElement.scrollWidth > window.innerWidth` → **false**
  (1434 vs 1440). También false a 1024px (1018 vs 1024) y en Consolidado.
- **0 excepciones no capturadas. 0 `console.error`.**
- Consola y red de la vista Consolidado: 2 entradas, **las dos esperables por
  `file://`** — `401` de `supabase.co/rest/v1/gastos` (el `refresh_token` falla
  con origin null) y el `warning` derivado
  `[supabase-store] No se pudo guardar en la nube: ... row-level security policy`.
  Ninguna es una regresión de esta iteración.

**Los JPG siguen en el repo y ya no los referencia nadie.** Después del cambio la
única referencia que queda en todo el proyecto es `sync_github.js:51-58`
(`FILES_TO_SYNC`), que es el manifiesto de deploy. **No se borraron** (decisión
del usuario) ni se tocó ese manifiesto: sacar los 8 de `FILES_TO_SYNC` haría que
desaparecieran del repo publicado en el próximo sync, que es una decisión de
deploy que no correspondía tomar acá.

### Archivos y líneas de esta iteración

| archivo | líneas | qué |
|---|---|---|
| `index.html` | 17 | 17 `<img>` → 17 `<svg>` inline (marca, 2 tabs de nav, botón Notas, 5 píldoras, 8 encabezados de tarjeta) |
| `js/app.js` | 455-457, 1148-1150 | 4 `<img>` → 4 `<svg>` en las 2 plantillas del botón Notas. Solo `innerHTML`. |
| `css/styles.css` | 2284-2300 | grid: `align-items: stretch`, sin `grid-auto-rows: max-content` |
| `css/styles.css` | 2334-2392 | §19 reescrito: `.ui-icon-img` neutral, `.ui-icon-svg` nueva, `border-radius` fuera |
| `css/styles.css` | 2185-2200 | `body.read-only-mode .quick-action-buttons-grid { display: none }` |
| `css/styles.css` | 2712-2725 | `.empty-feed-placeholder`: `--space-6` → `--space-4` |
| `odd/tasks/dom-contract-snapshot.txt` | regenerado | 55 → 57 clases |

No se tocó `js/store.js`, `js/config.js`, `js/supabase-store.js`, `js/charts.js`
ni `sync_github.js`. En `js/app.js`, nada de lógica: solo los dos `innerHTML`.

### Los 6 criterios de esta iteración, evaluados sobre la captura

| | criterio | veredicto |
|---|---|---|
| a | ¿Queda algún `<img>` de `assets/icons/` visible? | **NO** — 0 en el DOM, 0 visibles |
| b | ¿Los 8 iconos se leen a 20px sin verse como borrión? | **Sí** — verificado en hoja de prueba a 20px y otra vez en la captura final |
| c | ¿Queda algún elemento saturado que no sea acento o estado? | **NO** — 0 por canales de color computados y 0 por `filter` |
| d | ¿Las tarjetas hermanas de una fila tienen altura coherente? | **Sí** — 657/657 y 230/230 |
| e | ¿El estado vacío de Movimientos deja un vacío desproporcionado? | **NO** — placeholder 141px → 109px y el contenedor de acciones rápidas pasó de 32px muertos a 0 |
| f | ¿Los iconos se distinguen entre sí a simple vista? | **Sí** — 8 geometrías distintas, comprobadas en la fila de prueba a 20px |

### Fuera de alcance, observado y NO tocado

Dos cosas que encontré mirando y **no** toqué, porque no son de las dos que
assignaron y esta pasada era quirúrgica. Quedan dichas para que se decida:

1. **`.app-topbar` sigue con `backdrop-filter: saturate(1.8) blur(20px)`, y está
   visible a 1440x900.** Viene de `--material-backdrop-filter` (css:271), usado en
   `.app-topbar` (951-952) y en `.modal-overlay` (2456-2457). Es exactamente el
   efecto "Liquid Glass" que la restricción 4 prohíbe, y es **pre-existente de las
   iteraciones 1 y 2**, no algo que se haya agregado acá. Verificado con
   `getComputedStyle().backdropFilter` sobre elementos visibles.
   Nota de método: `backdrop-filter` **no** lo ve ni la verificación de `filter`
   ni la de color computado. Hay que leer esa propiedad aparte, como se leyó
   `filter` aparte para los JPG.
   Si se decide sacarlo, el cambio es una línea (el token `--material-backdrop-filter`
   y sus dos usos); no lo hice porque altera una superficie visual que nadie
   reportó y que la iteración 2 dejó así a propósito.
2. **`.charts-grid-layout` (las 2 tarjetas de gráficos de la vista Consolidado)
   también tiene tarjetas hermanas de alturas distintas.** No se tocó: es otra
   retícula, el brief nombró las 4 tarjetas de `.segments-workspace-container`, y
   los canvas de Chart.js tienen su propia lógica de resize.

### Capturas de esta iteración

`odd/tasks/capturas/`: `s0-antes`, `s1-despues`, `s2-verif`, `s3-consolidado`,
`s4-angosto` (1024px), `s5-dos-segmentos` (1 segmento activo, el caso donde
`align-content: start` evita que las filas se separen del encabezado). Cada una
tiene su `.report.json` con la geometría medida, la consola y el tráfico de red.

## Pronostico y entrega

Pronostico de lineas escritas: **~150 a 250** (la mayor parte son borrados de
emoji y redefinicion de tokens). Esta por debajo del presupuesto de ~400, asi que
no hace falta dividir en PRs encadenados.

Estrategia de entrega: `ask-on-risk`. Si el conteo real supera las ~400 lineas
escritas, parar y preguntar antes de commitear.

## Nota de seguridad

Los secretos (`.github_token`, `.github_oauth`, `.supabase_db_password`) estan
en texto plano y cubiertos por `.gitignore`. No leerlos, no mostrarlos, no
incluirlos en ningun candidato de review.
