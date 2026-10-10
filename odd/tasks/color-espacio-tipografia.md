# Feature: color con sentido, espacio, limpieza y tipografia

**Estado: ENTREGADA.** 6 rondas de mirar-ajustar. Evidencia en
`odd/tasks/capturas/color-r6.report.json`, `contraste-r6.txt` y las capturas
`color-{light,dark}-{1440,largo,panel-1440,panel-largo,pagado}.png` mas
`color-w1024-{mes,panel}.png`.

Archivos tocados: `css/styles.css`, `index.html`, `js/app.js`. **No se toco**
`js/store.js`, `js/supabase-store.js` ni `js/charts.js`. **No se publico nada.**

Herramientas nuevas, todas en `odd/tasks/`: `color-probe.mjs` (sonda CDP),
`tinte.mjs` (punto de mezcla y dE), `font-metrics.mjs` (metricas de la fuente),
`tabla-contraste.mjs` (genera las tablas de §CONTRASTE desde el JSON),
`breakpoints.mjs` (1024/833), `store-snapshot.mjs` (verificar que la sonda no
persistio nada).

---

## T1 Color con significado (NO decorativo)

La skill prohibe el color decorativo y el neon. El usuario pide color. La
conciliacion: **el color vuelve donde significa algo, y en ningun otro lado.**

### 1. Los acentos de categoria vuelven como superficie tenida - CON SU TECHO

Los 4 acentos ya vivian en el filete superior de cada seccion: un pixel de
color. El usuario tenia razon: eso no es distincion.

Se derivan con `color-mix()` desde el token del acento. **Una sola fuente de
verdad: no hay un hex escrito a mano para ningun tinte.**

| token | declaracion | resultado en claro |
|---|---|---|
| `--cat-servicios-wash` | `color-mix(in srgb, var(--cat-servicios) 12%, var(--bg-surface))` | `rgb(234, 238, 240)` |
| `--cat-personales-wash` | `color-mix(in srgb, var(--cat-personales) 12%, var(--bg-surface))` | `rgb(239, 236, 243)` |
| `--cat-movimientos-wash` | `color-mix(in srgb, var(--cat-movimientos) 12%, var(--bg-surface))` | `rgb(233, 238, 236)` |
| `--cat-extras-wash` | `color-mix(in srgb, var(--cat-extras) 12%, var(--bg-surface))` | `rgb(239, 237, 233)` |

En oscuro los MISMOS cuatro tokens dan `rgb(31,35,41)`, `rgb(33,33,41)`,
`rgb(30,36,38)`, `rgb(37,36,37)`: no estan repetidos en `.theme-dark` porque
`color-mix()` se sustituye en tiempo de valor computado, no al declararse.
Verificado en el navegador con la clase puesta y quitada.

**El punto de mezcla es 12% y es un TECHO, no una preferencia.** Barrido con
`tinte.mjs`; el primer texto que se cae de AA define el limite:

| %mix | texto mas flojo | veredicto |
|---|---|---|
| 6 | 4.90:1 `.status-pagado` 12px | OK |
| 8 | 4.77:1 | OK |
| 10 | 4.65:1 | OK |
| **12** | **4.53:1** | **OK - elegido** |
| 14 | 4.40:1 | FALLA |
| 16 | 4.29:1 | FALLA |

En oscuro el techo es 16%, pero el valor tiene que servir para los dos temas:
manda el mas bajo.

### EL LIMITE HONESTO: la superficie tenida NO distingue las cuatro entre si

El ratio de WCAG no sirve para esta pregunta: solo ve luminancia, y los cuatro
acentos estan calibrados a proposito a la misma luminancia WCAG (0.146) para que
se lean como familia. Diluidos con la misma superficie al mismo porcentaje salen
cuatro tintes de igual luminancia, y el ratio los reporta a **1.000:1 al 6% y al
24%**. Ese 1.000 no dice "son el mismo color": dice que la metrica no ve el hue.

Medido en **OKLab** (el espacio de CSS Color 4; escala de dE segun
bottosson.github.io/posts/oklab: <0.02 invisible, ~0.03 apenas perceptible,
~0.10 visible de plano, ~0.30 claramente distinta):

| a 12% | valor | lectura |
|---|---|---|
| dE del tinte contra la superficie | **0.0536** | visible de plano -> el tema claro dejo de ser un vacio blanco |
| dE del par MAS CERCANO (servicios/movimientos) | **0.0070** | por debajo del umbral de visibilidad |

Subir el porcentaje no lo arregla: a 24% el par mas cercano sigue en dE 0.014.
La unica forma de separarlos seria abrir los hues al doble de lo que estan, y
eso es el arcoiris que la skill rechaza.

**ASI QUE LA SUPERFICIE TENIDA HACE DOS COSAS, NO TRES:** (1) saca el vacio blanco
del tema claro, (2) convierte cada seccion en una zona con color propio. **NO**
es lo que dice cual de las cuatro es cual. Eso lo dicen el titulo de la seccion,
su icono y el tick de 2px del encabezado, que es donde el acento vive a plena
saturacion; y en el Consolidado, los tres acentos a plena saturacion estan en el
anillo de distribucion y en los tres encabezados de columna de la matriz.

No se subio el tinte mas alla de 12% para disimular esto.

### Donde se aplica el tinte, y donde NO

- **Si:** las 4 secciones de categoria de la Vista Mensual
  (`.content-card-box[data-accent='servicios|personales|movimientos|extras']`).
- **No:** `matrix`, `trend` y `categories`. Son contenedores, no categorias -la
  propia hoja lo decia desde antes- y un tinte neutro gris sobre una tabla de
  nueve columnas se lee como tabla deshabilitada, y sobre un lienzo como fondo
  de demostracion.
- **Si, en la matriz:** los tres `th` de categoria
  (`.matrix-table th:nth-child(2|3|4)`), solo la fila de encabezado. Son los
  MISMOS tres datos que el anillo ya pinta con esos tokens, asi que el ojo aprende
  la correspondencia una vez y la reutiliza en las tres vistas. Solo el encabezado
  y no las celdas: tenir las 6 filas de una columna convierte la tabla en rayas de
  color y compite con el unico color por fila que la app acepta, que es el signo
  del balance neto.

### Sigue siendo una superficie continua, no una reticula de tarjetas

Sin `border-radius`, sin `box-shadow`, sin margen. El tinte llega de borde a
borde de la medida de contenido y lo separa de la siguiente seccion el mismo
filete de 1px que ya estaba. `box-shadow` decorativos en toda la hoja: **1**, el
del drawer a <=1024px, que es sombra de capa flotante.

### 2. Los estados recuperan color: pagado y pendiente por tono

Antes los dos eran niveles de la misma rampa gris: la unica diferencia era el peso
y la posicion en una columna. Con diez filas eso obliga a leer la columna.

| token | declaracion | claro | oscuro |
|---|---|---|---|
| `--state-pagado-wash` | `color-mix(in srgb, var(--text-emerald) 12%, transparent)` | alpha 0.12 | alpha 0.12 |
| `--state-pendiente-wash` | `color-mix(in srgb, var(--text-muted) 10%, transparent)` | alpha 0.10 | alpha 0.10 |
| `--text-pagado` | hex, **nuevo** | `#1c6d49` | `#98c6b1` |

Mezclan contra `transparent`, no contra la superficie: los botones van ENCIMA de
una seccion tenida, y una mezcla contra el blanco produciria un agujero del color
de la base en vez de un tinte que se apoya sobre lo que haya debajo.

Con moderacion: pendiente es un tinte **neutro**, no rojo. Pendiente no es un
error y no se pinta como error.

**`--text-pagado` existe porque `--text-emerald` no servia, y esta medido:**
`--text-emerald` esta calibrado para superficies blancas (5.30:1 sobre blanco),
pero el boton "Pagado" vive sobre el tinte de seccion con el tinte de estado
encima. Medido con ese fondo real compuesto:

```
--text-emerald #1f7a52 sobre rgb(210, 224, 221) = 3.89:1   FALLA (min 4.5)
```

Y bajar el tinte de estado no lo arregla: con el tinte de estado al 0% el mismo
texto da 4.53:1, o sea que el margen para cualquier tinte verde encima es casi
cero. La salida es un verde mas oscuro **del mismo hue**, solo para este estado,
elegido por busqueda de luminancia con objetivo 4.6:1 (margen, no raspado),
escalando los tres canales juntos para no mover el hue:

```
factor 89.6% de #1f7a52 -> #1c6d49
#1c6d49 sobre los cuatro fondos reales: 4.60 / 4.60 / 4.61 / 4.61 :1
```

Medido en el navegador despues: **4.62:1**. `--text-emerald` NO se toco, porque
app.js lo escribe en `#monthBalanceNeto` y en los balances de la matriz y del
Consolidado, y esos si viven sobre la superficie blanca.

El hover usa su propio tinte derivado del mismo color de estado, porque
`--bg-raised` es opaco y taparia el tinte.

### 3. Lo que NO vuelve

Cero emoji. Cero `glow`. Cero gradientes en titulos. **Cero chip de color por
fila**: lo que se tenie es el boton de estado, que es un ESTADO, no la categoria
de la fila. El acento de accion `--accent-primary` #0088ff se queda unico: es el
del estado activo y el foco, y no se repartio.

### 4. La regla sobre `color-mix()` se acoto, no se prohibio

La hoja de antes decia "esta hoja NO usa color-mix() en NINGUN token", por una
razon real: `getPropertyValue('--x')` sobre un token con `color-mix()` devuelve
la CADENA LITERAL, y comparar eso contra un color medido da falsos positivos.

La regla nueva protege lo que hay que proteger en vez de prohibir la herramienta:

- **NINGUN token que `js/charts.js` lee puede ser `color-mix()`.** Ese archivo
  pinta sobre un `<canvas>`, que no resuelve `var()` ni `color-mix()`, y lee con
  `readToken()` los tokens de categoria para el anillo y los de estado para las
  barras. Si `--cat-servicios` fuera una mezcla, la serie se dibujaria INVISIBLE.
  Verificado: los cuatro `--cat-*` y los `--accent-*` siguen siendo hex planos, y
  el anillo se sigue pintando con datos reales (`S/ 3,781.04` en el centro).
- **Todo token que la sonda mide como fondo se compone con
  `background-color` COMPUTADO**, nunca con el token crudo. El navegador resuelve
  `color-mix()` a `color(srgb ...)` al calcular el estilo, asi que el valor
  computado SI es un color.

---

## T2 Tipografia

### Inter, y por que NO SF Pro

SF Pro esta **prohibido**, y no es una preferencia: developer.apple.com/fonts dice
"You may not embed the Apple Font ... create, develop, display or otherwise
distribute any documentation, artwork, **website content** or any other work
product". La licencia autoriza mockups de interfaces de iOS/macOS/tvOS, no sitios
web. apple.com se sirve su propia SF Pro con 45 declaraciones `@font-face`, y un
sitio de terceros no puede ([tokens §2], [V]).

Inter es open source (SIL OFL 1.1), esta disenada para interfaces, NO es una
fuente de Apple y es la pila de texto profesional estandar. Reemplaza a Segoe UI,
que era lo que resolvia `system-ui` en Windows: una tipografia de sistema de
escritorio en una app que se lee como producto.

### De donde se carga

```
https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files/inter-latin-wght-normal.woff2
https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files/inter-latin-ext-wght-normal.woff2
```

**Version pineada.** Tres motivos, los tres medidos:

- sin build ni bundler: es la unica forma de tener una webfont en HTML/CSS plano;
- jsDelivr es **inmutable** para una version pineada, asi que si el archivo no
  desaparece el 404 es imposible. Eso importa porque el requisito es "0 404", y
  un `preload` a una URL de fonts.gstatic.com sin versionar seria justo ese riesgo;
- `woff2` variable: un archivo cubre los cuatro pesos que la hoja usa
  (400, 500, 600, 700). Cuatro archivos estaticos serian cuatro requests.

Se declara con `unicode-range`, asi que el navegador descarga SOLO el subconjunto
que la pagina usa. El `latin` (U+0000-00FF) alcanza para todo espanol: n a e i o u
u, la tilde, ¿ y ¡ van ahi dentro. El `latin-ext` queda declarado y no se descarga
si no hace falta. **Cero `preload`**: el `@font-face` con `font-display: swap` ya
dispara la descarga en el primer layout.

### La pila de respaldo

```css
--font-display: 'Inter', 'Inter Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
--font-body:    'Inter', 'Inter Fallback', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
--font-mono:    ui-monospace, SFMono-Regular, 'Cascadia Mono', 'Segoe UI Mono', Menlo, Consolas, 'Liberation Mono', monospace;
```

**El MONO SE CONSERVA PARA LAS CIFRAS.** Alinear importes en un panel financiero
con `tabular-nums` es necesidad FUNCIONAL, no decoracion: sin eso las columnas de
cifras bailan al cambiar de valor. No se le cambia la familia ni se le aplica
`size-adjust`.

### El tema oscuro tambien usa Inter

La pila vive en un token de `:root` y `html.theme-dark` solo pisa colores, asi que
Inter entra en los dos temas sin una regla duplicada. Verificado: familia
computada = `Inter, "Inter Fallback", system-ui, ...` con la clase puesta Y
quitada.

### CLS por fuente: MEDIDO, y la tecnica que lo evita

`font-display: swap` hace que el texto se dibuje en el respaldo y despues se
cambie. Inter es **7.4% mas ancha** que Segoe UI, asi que sin mas ese swap
reorganiza cada renglon. La solucion es una `@font-face` de respaldo con las
cuatro metricas ajustadas. Los cuatro numeros NO son estimates: estan medidos en
el navegador con `TextMetrics.fontBoundingBoxAscent` / `fontBoundingBoxDescent`
del archivo real de Inter contra la pila anterior (`font-metrics.mjs`), a 1000px
de referencia:

| peso | ancho Inter | ancho Segoe UI | size-adjust | ascent | descent |
|---|---|---|---|---|---|
| 400 | 71697.27 | 66222.66 | 108.27% | 969 | 241 |
| 500 | 72443.97 | 67958.98 | 106.60% | 969 | 241 |
| 600 | 73186.27 | 67958.98 | 107.69% | 969 | 241 |
| 700 | 73925.15 | 70423.83 | 104.97% | 969 | 241 |

Ponderado por el uso real de la hoja (45% 400, 10% 500, 30% 600, 15% 700):

```
size-adjust       107.43%
ascent-override    96.90%   (969/1000)
descent-override   24.10%   (241/1000)
line-gap-override   0%
```

Verificacion en el navegador, con la fuente servida por la red y la cache
desactivada por CDP:

```
delta de ancho Inter contra el respaldo calibrado = 0.18%
CLS de la carga = 0.00017 (claro) / 0.00019 (oscuro)
```

**El compromiso, dicho de una:** `size-adjust` tambien escala el tamaño DIBUJADO.
Si Inter no llegara a cargar, el usuario veria Segoe UI un 7.4% mas grande. Es el
intercambio estandar de esta tecnica y es preferible al otro: la alternativa es
aceptar que el texto se reacomode al cargar.

### El riesgo que si se verifico: `ctx.font` de charts.js

`charts.js` arma el `ctx.font` con el token CRUDO: `'12px ' + readToken('--font-body')`.
Un `<canvas>` no resuelve `var()` ni comillas como la hoja, y si el parser
rechazara la pila, `ctx.font` conservaria el valor previo y **el texto del grafico
no se dibujaria**. Medido con las 4 formas que charts.js usa:

| pedido | leido de vuelta | acepto |
|---|---|---|
| `12px 'Inter', 'Inter Fallback', system-ui, ...` | `12px Inter, "Inter Fallback", system-ui, ...` | SI |
| `600 20px ui-monospace, SFMono-Regular, ...` | `600 20px ui-monospace, SFMono-Regular, ...` | SI |
| `11px 'Inter', 'Inter Fallback', ...` | `11px Inter, "Inter Fallback", ...` | SI |
| `400 12px 'Inter', 'Inter Fallback', ...` | `12px Inter, "Inter Fallback", ...` | SI |

4/4. Y el anillo se sigue pintando con datos reales.

---

## T3 Aprovechar el espacio

### El aire vertical, que era el problema real

Medido antes: **solo 3 de las 9 filas de gasto entran en 900px**. Cuatro secciones
con 48px de padding arriba y abajo = 384px de aire antes de leer un solo gasto, y
80px entre el titulo de cada seccion y su primera fila.

| selector | antes | ahora | por que |
|---|---|---|---|
| `.content-card-box` `padding-block` | 48px | **32px** | x4 secciones = 128px recuperados |
| `.accordion-collapsible-body` `padding-top` | 32px | **16px** | estaba entre el titulo y la primera fila |
| `.category-subhead` `margin-top` | 32px | **16px** | cada grupo de la seccion |
| `.segments-navigation-bar` `padding-bottom` | 40px | **24px** | barra de categorias |
| `.view-header` `padding-bottom` | 40px | **32px** | |
| `.chart-section` `padding-bottom` | 40px | **32px** | |
| `.empty-feed-placeholder` `padding` | 32px | **16px** | 78px de aire alrededor de UNA linea -> 46px |

Resultado, medido a 1440x900: **5 de 9 filas** entran, la ultima con el borde
inferior en y=882. Alturas de seccion: servicios 759 -> 677, personales 601 -> 519,
movimientos 301 -> **221**, extras 322 -> **242**.

### La banda de KPIs: se verifico y NO estaba bien

La consigna pedia verificar que seguia bien. **No estaba bien.** Era una reticula
de dos columnas (`minmax(0,1fr) auto`, `column-gap: 32px`): etiqueta a la izquierda
y cifra a la derecha. A 1440 la celda da 360px menos 24px de aire = 336px, y la
cifra de 40px mono mide ~150px, o sea que **la columna de la etiqueta se quedaba
en 154px**. Medido: los tres pies de nota envolvian a dos lineas ("Todos los
abonos / confirmados", "Ingresos menos / gastos realizados") y la etiqueta
"Ingresos acumulados" rozaba su propia cifra.

La salida es **apilar**, que ademas hace que el Consolidado lea con el mismo ritmo
que la Vista Mensual: etiqueta arriba, cifra en el medio, nota abajo. La cifra de
40px conserva su lugar de numero mas grande de la app y ahora tiene los 336px
enteros: "S/ 3,781.04" entra sin apretarse. Verificado a 1024 tambien (315px por
celda, sin partirse).

### El rail: 584px de aire, y la respuesta honesta

Medido antes: **604px** de hueco entre el buscador y el pie. Despues: **584px**.

La consigna era "aprovechar mas el espacio" y hay una respuesta facil que seria
**incorrecta**: llenar el rail de cifras. El rail es navegacion, y esas 13 cifras
se sacaron de ahi porque eran datos en el lugar equivocado; volver a ponerlas las
saca de `.metrics-row` y de `.payments-strip`, que es exactamente la duplicacion
que §8.1 y §8.2 acaban de resolver. Tampoco cabe una lista de resultados de
busqueda sin invadir la parte funcional (T5).

Lo que si se hizo, y es lo que el espacio permite sin romper la regla: **los tres
controles reales del rail crecen.**

| control | antes | ahora |
|---|---|---|
| `.sidebar-nav-tab` (cada vista) | 37px | **41px** |
| `.sidebar-search-box` | 32px | **36px** |
| `.sidebar-search-section` `padding-top` | 24px | **32px** |

Son 29px de objetivo tactil mas grande y mejor separados: un uso real del espacio,
no un relleno.

Los ~584px que quedan son **aire deliberado** y se reportan como tal: el pie esta
anclado abajo con `margin-top: auto` y los tres grupos arriba, asi que el hueco es
una decision de composicion (navegacion arriba, estado de sesion abajo) y no un
sobrante. La forma honesta de medirlo:

- `scrollHeight` del rail = **900**, `clientHeight` = **900**: cero scroll
  interno, ni con veinte anos de datos.
- **0 cifras, 0 meses, 0 "S/", 0 "%"** dentro del rail, verificado sobre
  `innerText` en los dos temas.

### El grafico de barras vacio: NO se toco, y por que

`charts.js` ya marca la seccion con `is-empty` y la hoja baja el lienzo a 120px.
Medido: el lienzo mide **984x120** en estado vacio, y el resto del hueco de la
seccion es el encabezado. No se invento contenido ni se toco la altura, porque con
datos reales no se puede juzgar y el estado vacio ya esta resuelto por el codigo
existente.

---

## T4 Limpieza: que se elimino y por que

Cada baja se verifico con grep sobre `app.js`, `charts.js` y `store.js`, y con una
fase de sonda que enumera en el navegador todo nodo vacio oculto.

### Markup muerto con `display: none`

| baja | justificacion | verificacion |
|---|---|---|
| 3 x `<div class="metric-icon-box"></div>` (`index.html`) | Contenedor que existia solo para alojar algo que ya no estaba. Los tres eran SIEMPRE vacios: nada en JS los escribe. | grep: `metric-icon-box` solo aparecia en `index.html` (3x) y en la hoja. **No esta en el contrato DOM.** Se fue tambien la regla `.metric-icon-box:empty`. |
| 2 x `<div class="role-card-icon"></div>` (`index.html`) | Idem, y con la regla `.role-card-icon { display: none }` INCONDICIONAL: nunca se vieron. | grep: `role-card-icon` solo en `index.html` (2x) y en la hoja. **No esta en el contrato DOM.** |
| 2 reglas `.modal-glyph:empty` | `.modal-glyph` **no existe en ningun lado del HTML**. Selector muerto, cero elementos. | grep: 0 occurrences en `index.html`. |
| `.btn-status-toggle.status-pendiente::before { content: ''; display: none }` | Pseudo-elemento que se creaba para no mostrarse. | grep: 1 sola declaracion, sin consumidores. |

### Bindings de JS que escribian a nodos que ya no existen

Los cuatro estaban detras de `if (elX)`, asi que nunca llego a escribir nada. Se elimino
el binding, no solo el nodo, para no dejar codigo muerto:

| baja | justificacion |
|---|---|
| write a `#paidSummaryLabel` | El nodo no existe en `index.html`. Ademas su texto ("Pagado: S/ X") era el mismo importe que `#paidTextInfo` decia. |
| write a `#coverageTextInfo` | El nodo no existe. Su texto ("Cobertura: Z%") era exactamente `totals.porcentajeAvance`, la misma variable que lee la celda 4 de `.metrics-row`. |
| write a `#grandTotalAmount` | El nodo no existe. El total del mes vive en `#monthTotalEgresos`, celda 2 de `.metrics-row`. |
| binding de `#btnRestoreAllSegments` | El nodo no existe. `toggleSegment('all')` sigue viva y reachable desde la pildora "Ver todo". |

### Datos duplicados: la tira de pagos contra la fila de metricas

Habia solapamiento real y **visible en la captura**. Antes la tira decia:

```
Gastos Pagados: S/ 0.00 de S/ 616.34   |  Pendiente: S/ 616.34  |  [carril]  |  0.0% Pagado (0 de 9)
```

y 40px mas arriba la celda 2 de `.metrics-row` decia `S/ 616.34` y
`0 de 9 gastos pagados`. Dos duplicaciones, cada una a 40px de su original.

| baja | justificacion | verificacion funcional |
|---|---|---|
| el `" de <strong>totalEgresos</strong>"` de `#paidTextInfo` | Es el mismo `totalEgresos` que la celda 2 ya muestra con 28px de cifra. | Con una fila alternada a Pagado: tira = `Gastos Pagados: S/ 89.90`, celda = `S/ 616.34`. Distintos. |
| el `" (3 de 9)"` de `#paidPercentBadge` | Es el mismo `pagadosCount de totalItemsPresupuesto` que la nota de esa celda ya escribe. | Con una fila pagada: badge = `14.6% Pagado`, nota = `1 de 9 gastos pagados`. Distintos. |

Lo que queda en la tira —importe pagado, pendiente, carril y porcentaje— **no esta
en ninguna otra parte**, verificado sobre los siete textos de la banda.

### Etiquetas que repiten lo que el numero ya dice

| baja | justificacion |
|---|---|
| `'Equilibrado (S/ 0.00)'` -> `'Equilibrado'` (2 lugares de `app.js`) | La celda de arriba ya muestra `S/ 0.00` en 28px; el parentesis repetia ese mismo numero en 12px justo debajo. La etiqueta dice el estado, el numero dice la cifra. |

### Lo que se investigo y SE DEJO (con la razon)

- **`.ui-icon-img`** se suspiciono gancho muerto. **Medido: NO lo es.** Esta
  declarado DESPUES de `.ui-icon-svg` en la hoja, asi que su
  `display: inline-flex` le gana al `inline-block` de `.ui-icon-svg`: en los 13
  SVG de la pagina el `display` computado es `flex`. Es lo que alinea el glifo
  dentro de su caja. Sacar la clase cambiaria el render de los 13 iconos.
- **`#toastIcon` y `#authModeIcon`** se ocultan con `:empty`, pero **se quedan**:
  `app.js` les escribe `textContent` en cada `showToast` y en `updateAuthModeUI`.
  Si el nodo no estuviera, el write lanzaria.
- **`getElementById('x') || getElementById('y')`** (`summaryTagFlujo`,
  `badgeSegFlujo`, `budgetSubsectionField`, `kpiGlobalEgresos`): el segundo id no
  existe en el HTML. Son aliases defensivos y el primero SI existe; se dejan
  como convention del proyecto, no son la clase de baja que pedia la consigna.
- **`#topbarBalanceValue`** repite `#monthBalanceNeto`. Se dejo a proposito: es el
  unico balance que sobrevive al scroll, porque la banda de metricas esta arriba
  de todo y se va de la vista. No es duplicacion en vista.
- **`.main-subtotal`** ("Total servicios del hogar") repite el valor de la figura
  del encabezado (`#summaryTagServicios`). Se dejo: el filete que cierra el grupo
  es un ritmo de lectura, no un error, y la consigna no pedia tocar subtotales.

### Contrato DOM

Regenerado con `node dom-contract.js js/app.js odd\tasks/dom-contract-snapshot.txt`:
**124 -> 120 ids**, 60 clases (sin cambio), 5 atributos. Los 4 ids que se fueron
son exactamente los cuatro bindings muertos de arriba. `node --check` en `app.js`
despues de cada cambio.

---

## Verificacion

| requisito | resultado |
|---|---|
| Contraste AA de TODO texto nuevo y de las superficies tenidas | **0 fallos** en 331 pares de texto por tema. Claro min **4.62:1**, oscuro min **5.04:1** |
| 0 `console.error` | **0** en los dos temas, en Vista Mensual y Consolidado |
| 0 excepciones | **0** |
| 0 404 | **0**. Lo unico que falla en red es un **401** de Supabase al abrir desde `file://` (origin `null`, el token de sesion se rechaza). Es el comportamiento PREEXISTENTE de abrir la app desde el disco, esta documentado en `cdp.mjs`, y no es un recurso roto |
| Sin overflow a 1440 / 1280 / 1024 | **Cero scroll horizontal** en los tres, en los dos temas |
| Rail 900/900, 0 cifras, 0 meses | **900/900**, 0 figuras, 0 meses, 0 `S/`, 0 `%` |
| `.theme-dark` funcionando y con buen contraste | Si. 331 pares, 0 fallos, min 5.04:1. Capturas de los dos temas |
| Foco visible con `element.focus()` real y `getComputedStyle` en ese momento | **13 de 13 controles con anillo `rgb(0,136,255) solid 2px`**, 0 sin anillo. Incluye los de edicion, que antes no se auditaban porque con `file://` la app abre en modo Lector y `body.read-only-mode` los oculta: la sonda saca la clase, audita y la devuelve |
| Indicadores no textuales (3:1) | ticks de categoria **4.54-4.61:1** en claro, **6.19-7.57:1** en oscuro. `focus-ring` **3.23:1** sobre el canvas del rail (el caso mas flojo) y 3.52:1 sobre el contenido. Minibarra 3.15:1 |
| `node --check` en los JS tocados | `app.js` OK. `charts.js` OK sin tocar |
| Capturas de claro y oscuro | `color-light-*.png`, `color-dark-*.png`, mas `color-w1024-*.png` |
| La sonda noPersistio nada | `store-snapshot.mjs` antes y despues de las 6 pasadas: **identico**. La sonda congela `store.save()` y sustituye `toggleBudgetItemStatus` antes de clickear, porque `save()` escribe en localStorage |
| No se publico nada | `sync_github.js` no se invoco, ni con `--dry-run` |

### Trampas que mordieron en esta tanda, y como se resolvieron

1. **Backtick en un comentario dentro del template literal de Node** cierra el
   template y rompe el archivo, con un error que apunta a la linea del comentario
   y no a la del template. Mordio **3 veces**. Resuelto con una guarda explicita
   en `color-probe.mjs` que lista las lineas offending y sale con codigo 1.
2. **Leer `getComputedStyle` en el mismo tick de un click** devuelve el valor
   INICIAL de la transicion. Midio `rgb(91,95,103)` —el color de "Pendiente"—
   sobre un fondo en `oklab(...)`, que es como Chrome representa un color
   interpolado. La sonda ahora separa el click de la lectura de color, y
   `parseColor` tambien entiende `oklab()`, que antes devolvia `null` y
   descartaba la fila en silencio.
3. **`focus()` desplaza el elemento enfocado**, y en esta pagina el scroll vive
   en un contenedor, no en `window`: despues de auditar el foco, la cuenta de
   "filas que entran en 900px" daba 9/9 con la ultima fila en y=168. Se devuelve
   el scroll a cero antes de medir espacio.
4. **`focus()` sobre todo es mas de lo que parece**: con `file://` no hay sesion
   de Supabase, la app abre en modo Lector y `body.read-only-mode` oculta los
   `.admin-action-btn`. Sin quitar la clase, la auditoria de foco no auditaba
   NINGUN control de edicion.
5. **`set -Encoding UTF8` en PowerShell 5.1 mete BOM** y el `node -e` de control
   de encoding lo detecta. Se quito de los tres archivos tocados con Node, para
   respetar la convencion del proyecto (sin BOM).
6. **Un `color-mix()` mal compuesto da un numero optimista**: diluir con negro
   NO es lo mismo que componer con alfa. La primera version de `tinte.mjs` dio
   4.53:1 donde el navegador midio 3.89:1. Corregido y verificado contra
   `getComputedStyle`: la funcion nueva reproduce `rgb(210,224,221)` exacto.

---

## Las 3+ rondas, con los 7 criterios

### Ronda 1 — despues de la primera tanda de cambios

| | veredicto |
|---|---|
| a) ¿Se distinguen las 4 categorias por color sin gritar? | **NO.** El tinte de 8% es visible contra el blanco pero las cuatro tintes entre si dan **1.000:1** de ratio WCAG. |
| b) ¿El estado pagado/pendiente se lee por tono? | **No medible.** Los 9 gastos estan en Pendiente, asi que `.status-pagado` no existe en el DOM. |
| c) ¿Queda algun color que no sea acento, estado o accion? | **NO.** |
| d) ¿La tipografia nueva se ve profesional y el layout no salta? | **SI.** Inter cargada, delta de ancho contra el respaldo calibrado **0.18%**, CLS 0.00157 (la baseline era 0.00307), `ctx.font` 4/4. |
| e) ¿Aprovecha mejor el espacio? | **SI.** 3 -> 5 filas en 900px. |
| f) ¿Queda algo que no sirva? | **SI:** el aire de los estados vacios (78px alrededor de una linea), y `.metric-cell-action` sin auditar por el modo Lector. |
| g) ¿apple.com o no? | Tipografia y filetes si. El modo claro seguia siendo un vacio blanco. |

### Ronda 2 — tinte a 12%, dos correcciones de sonda

| | veredicto |
|---|---|
| a) ¿Se distinguen las 4 categorias? | **Parcialmente.** El tinte ya se ve de plano (dE 0.0536 contra la superficie) pero el par mas cercano sigue en dE 0.0070. Se-documento como limite. |
| b) ¿El estado se lee por tono? | **SI en pantalla, NO en medicion.** El binding de `app.js` funciona (`cambioClase` y `cambioTexto` en true) y los siete textos de la banda quedan distintos. Pero aparecio un **FALLO DE AA REAL**: `.status-pagado` a **3.89:1**. |
| c) ¿Color fuera de lugar? | **NO.** |
| d) ¿Tipografia profesional y sin salto? | **SI.** |
| e) ¿Mejor espacio? | **SI.** |
| f) ¿Algo que no sirva? | **SI:** la banda de KPIs del Consolidado tiene las tres notas partidas en dos lineas. Se Midio y se Arreglo en esta ronda. |
| g) ¿apple.com o no? | El KPI partido es justo lo que apple.com no hace. |

### Ronda 3 — `--text-pagado`, KPI apilado, sonda corregida

| | veredicto |
|---|---|
| a) ¿Se distinguen las 4 categorias? | **Igual que ronda 2, y con el limite documentado.** |
| b) ¿El estado se lee por tono y pasa AA? | **SI.** Se creo `--text-pagado` #1c6d49 por busqueda de luminancia. **4.62:1** en claro, **6.47:1** en oscuro. |
| c) ¿Color fuera de lugar? | **NO.** |
| d) ¿Tipografia y layout? | **SI.** CLS 0.00019 / 0.00008. |
| e) ¿Mejor espacio? | **SI**, y el KPI apilado ademas destino los tres pies de nota que envolvian. |
| f) ¿Algo que no sirva? | **NO** en la lista de pendientes. La ronda 4 encontro el aire de los estados vacios mirando una captura larga. |
| g) ¿apple.com o no? | Si. La banda de KPI ahora lee con el mismo ritmo que la Vista Mensual. |

### Ronda 4 — aire de estados vacios, y una correccion de sonda seria

Mirando la captura larga aparecio que el filtro + UNA linea de texto ocupaban
146px. Se bajo el padding del estado vacio de 32 a 16.

Ademas se detecto que **el clic de la sonda estaba persistiendo un cambio real en
los datos del usuario** (`store.toggleBudgetItemStatus` -> `store.save()` ->
localStorage). Se congelo `save()` con un contador y se sustituyo el toggle por
una version sin persistir. Verificado con `store-snapshot.mjs`: store identico
antes y despues.

| | veredicto |
|---|---|
| a) ¿4 categorias? | Igual, con el limite documentado. |
| b) ¿Estado por tono y AA? | **SI.** |
| c) ¿Color fuera de lugar? | **NO.** |
| d) ¿Tipografia y layout? | **SI.** |
| e) ¿Mejor espacio? | **SI.** Movimientos 253 -> 221px, Extras 274 -> 242px. |
| f) ¿Algo que no sirva? | **NO.** |
| g) ¿apple.com o no? | Si. |

### Ronda 5 — verificacion completa

Sin cambios de diseno. Se corrigio la lectura de color del estado pagado (se
media en mitad de la transicion) y se confirmo el contrato DOM.

### Ronda 6 — entrega

Sin cambios de diseno. Se aggregaron: limpieza de BOM, la regla de `color-mix()`
acotada en §CONTRASTE, el bloque de numeros de contraste regenerado desde el JSON,
y la verificacion de 1024 y 833 con captura.

| | veredicto final |
|---|---|
| a) ¿Se distinguen las 4 categorias por color sin gritar? | **PARCIAL, y con limite medido.** Se distinguen **entre si** a ojo en la captura (azul, violeta, verde, calido) pero **NO** por metrica: dE 0.0070 entre el par mas cercano. La superficie teñida agrupo y saco el vacio blanco; la identidad la llevan el titulo, el icono, el tick, y en el Consolidado el anillo y los tres `th`. Ver la seccion "EL LIMITE HONESTO". |
| b) ¿El estado pagado/pendiente se lee por tono? | **SI.** Verde resolvido contra neutro abierto, 4.62:1 / 6.47:1. Y el binding de `app.js` verificado clickeando de verdad. |
| c) ¿Queda algun color que no sea acento de seccion, estado o accion? | **NO.** Repasado el conjunto: `--accent-primary` #0088ff solo en activo y foco; los `--cat-*` solo en tick, superficie de su seccion y su `th` de matriz; `--text-emerald`/`rose`/`cyan` solo donde el dato cambia de signo; los tintes de estado solo en los dos estados. |
| d) ¿La tipografia nueva se ve profesional y el layout no salta? | **SI.** Delta 0.18% contra el respaldo calibrado, CLS 0.00017/0.00019, `ctx.font` 4/4, mono intacto, oscuro verificado. |
| e) ¿Aprovecha mejor el espacio que antes? | **SI, en el contenido.** 3 -> 5 filas en 900px, 384px de aire de seccion menos, estados vacios 78 -> 46px, KPI sin texto partido. **NO en el rail**: 604 -> 584px, porque llenarlo de datos seria devolver la duplicacion que T4 acaba de eliminar. Los tres controles reales del rail crecen 29px. |
| f) ¿Queda algo que no sirva? | **Tres cosas, y las tres son decisiones, no descuidos:** (1) los ~584px del rail, con su justificacion; (2) la zona de arriba de la Vista Mensual (metricas, periodo, categorias) sigue sin tintar, porque no tiene significado de categoria que teñir y hacerlo seria color decorativo; (3) `.main-subtotal` repite la figura del encabezado, y se dejo por el ritmo del filete que cierra el grupo. |
| g) ¿apple.com o no? | **Mas que antes, no igual.** Tiene lo que apple.com tiene: superficie continua con filetes como unico divisor, cero caja, cero sombra decorativa, cero emoji, tracking negativo en display, transiciones solo de `transform`/`opacity`, `prefers-reduced-motion` y **cero `prefers-color-scheme`**. No tiene su direccion de arte, y esta app no la va a tener nunca: apple.com es un sitio de marketing con fotografia a escala gigante y copy muy corto; esto es un panel financiero. El color devuelto es sobrio y semantico, no el tono de campana de una landing. |

---

## Que se decidio sin que fuera especificado

1. **`--text-pagado` como token nuevo en vez de oscurecer `--text-emerald`.**
   Oscurecer el global habria cambiado el balance del mes y los de la matriz, que
   si viven sobre blanco y donde 5.30:1 ya era correcto. Un token con un solo uso
   es mas honesto que mover un token de siete.
2. **Tinte del estado de la banda de KPIs del Consolidado: ninguno.** Sus tres
   celdas son Ingresos / Balance / Cumplimiento, que no son categorias. El unico
   color que ya tienen es el del signo del balance, que es correcto.
3. **Los `th` de la matriz teñidos, pero no las celdas.** Era la unica forma de
   que el mapeo categoria-color se aprendiera una vez y se reutilizara en las
   tres vistas. Teñir las celdas habria hecho rayas de color.
4. **12% y no mas, aunque se vea mejor.** El techo lo pone AA, y romper AA a
   cambio de un matiz que no se ve igual es la operacion que esta hoja no hace.
5. **El rail se distribuye, no se llena.** Es lo que la consigna pedia y lo que la
   regla del proyecto prohibe a la vez. Se reporta el numero, no unasolution.
6. **Apilar la banda de KPIs en vez de reducir la cifra de 40px.** La cifra de 40px
   es el numero mas grande de la app por decision; el problema era que la celda no
   le daba lugar, no que la cifra fuera grande.
7. **Aparecen en `odd/tasks/` seis herramientas nuevas.** Ninguna es parte de la
   app: no se cargan desde `index.html` y no se sincronizan con
   `FILES_TO_SYNC`. Se quedan como evidencia reproducible.
