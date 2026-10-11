# Rediseño visual — "El estado de cuenta"

## Concepto

Dejar de ser un panel de tarjetas y convertir la web en **un estado de cuenta bien compuesto**: un documento que se lee de un tirón y responde, antes que nada, a la pregunta que hace la persona que mira — *"¿cuánto falta por cubrir?"*.

No es una app deulares. Es un documento financial. Eso decide todo lo demás.

## A quién le sirve

- **Quien carga** (tú): necesita eficiencia — agregar, editar, ver de un vistazo cuántos gastos hay.
- **Quien mira** (tu papá): necesita **legibilidad y una sola respuesta evidente**. Sin ccompetition de cifras, sin conceptas que decodificar.

Las dos necesidades se resuelven con jerarquía: una cifra protagonista, todo lo demás de apoyo.

## Las reglas

1. **Una sola cifra protagonista: "Falta".** Es la pregunta. Las otras tres la acompaña, no compite con ella.
2. **El color significa algo.** Verde = cubierto. Ocre = pendiente. Oxblood = exceso. Nunca decorativo. Si un color no codifica estado, es tinta.
3. **Papel cálido, no gris frío.** Los grises de aplicación se sienten técnicos; un fondo con temperatura se siente como papel.
4. **Sin emojis, sin sombras difusas, sin degradados, sin rounded-docker.** Nada de eso pertenece a un estado de cuenta.
5. **Una sola familia tipográfica.** Se differentiate por escala, peso y tracking, no por mezclar familias.

## Tipografía

**IBM Plex Sans variable** (`@fontsource-variable/ibm-plex-sans`, 45 KB, mismo peso que la Inter que se reemplaza).

Por qué esta y no otra: Inter es la tipografía que hace que una interfaz parezca genérica — es la que usa prácticamente todo producto generado. IBM Plex Sans fue dibujada para claridad en información compleja: x-alta, cifras con peso real, y una `a` y una `g` con carácter que la hacen reconocible. Es tipografía de dato, no de landing.

- Todas las cifras de dinero: `font-variant-numeric: tabular-nums`. Es funcional: sin eso las columnas bailan al cambiar el valor y el ojo no puede compararlas.
- Escala: se mantiene el ritmo del `--text-zoom-factor` que ya existe, para no romper la accesibilidad de tamaño que hoy permite agrandar todo.

## Color

Definido en tokens para que el tema siga siendo un solo lugar.

| Token | Valor | Para qué |
|---|---|---|
| `--paper` | `#FBFAF7` | Fondo general. Bone cálido, no gris. |
| `--surface` | `#FFFFFF` | La superficie de contenido. |
| `--sunk` | `#F4F2ED` | Filas alternas, campos, zonas de apoyo. |
| `--ink` | `#1C1B19` | Texto principal. Negro con temperatura, no puro. |
| `--ink-2` | `#56534C` | Texto secundario. |
| `--ink-3` | `#8A867D` | Etiquetas y metadatos. |
| `--rule` | `rgba(28,27,25,.11)` | Hairline estándar. |
| `--rule-2` | `rgba(28,27,25,.20)` | Hairline de énfasis. |
| `--settled` | `#2F6B4F` | Cubierto. Verde profundo, desaturado. |
| `--settled-wash` | `#EDF3EE` | Fondo de estado cubierto. |
| `--pending` | `#8A5A1B` | Falta. Ocre cálido. |
| `--pending-wash` | `#FAF1E2` | Fondo de estado pendiente. |
| `--over` | `#9B3B2E` | Exceso o déficit. Oxblood. |
| `--over-wash` | `#FBEDEA` | Fondo de exceso. |

El **botón primario es tinta, no color**: negro sobre papel, como el encabezado de una factura bien compuesta.

## Estructura de la vista mensual

De arriba hacia abajo, en este orden y con esta jerarquía:

1. **Barra superior.** Marca a la izquierda. Mes activo y navegación a la derecha. Fondo papel, sin borde inferior fuerte.
2. **Bloque de estado.** La cifra protagonista:
   - `FALTA` en versalitas pequeñas, arriba.
   - La cifra, grande, en cifras tabulares.
   - Debajo, una barra de avance de una sola línea con los dos extremos rotulados: cubierto a la izquierda, estimado total a la derecha.
   - Una línea de apoyo: "1 de 10 gastos cubiertos".
3. **Cifras de apoyo.** Estimado, Real y Balance, en una fila de tres, con etiqueta pequeña y cifra tabular. Son apoyo, no protagonistas: menos tamaño que la cifra hero.
4. **El libro.** Filas agrupadas por categoría. Cada fila:
   - Concepto a la izquierda, en peso medio.
   - Estado a la derecha como marca breve y su cifra.
   - La fila alterna un `--sunk` muy suave para guiar la lectura vertical sin Heavy.
   - Fila cubierta: tinta secundaria en el concepto, marca verde discreta. Fila pendiente: tinta normal, marca ocre.
5. **Acciones de administración.** Visibles pero nunca dominantes. Botón secundario con borde, nunca sólido, salvo la acción principal de un formulario.

## Vista consolidado

Mantiene la idea actual — dos gráficos y una matriz — pero con los mismos tokens. La matriz usa cifras tabulares y reglas horizontales, no cebra oscuro. Los gráficos usan la misma paleta semántica; la dona pasa a **realizado**, no planificado, porque es lo que le interesa a quien mira.

## Qué NO cambia

- Toda la lógica, los IDs y los flujos. `app.js` sigue hablando con los mismos nodos. El rediseño es de presentación: CSS y, solo donde haga falta estructural, `index.html`.
- El arnés de pruebas y sus expectations geométricas.
- El modelo de datos de la Fase 1: estimado, real, cubierto, falta.

## Regla para el que implemente

**No tocar `js/`.** Si al maquetar aparece que falta un nodo en `index.html`, se agrega. Si aparece que hace falta lógica, **se anota y se reporta**: la presentación no inventa comportamiento.

Cada bloque de CSS nuevo se acompaña de un comentario que diga **qué problema resuelve**, no qué reglas tiene. Un CSS que solo describe selectores no sirve para el siguiente que lo lea.

---

# Qué se implementó

Ronda cerrada. Todo lo de arriba está en la pantalla. Lo que sigue es lo que
**se cambió de verdad**, con la medida que lo decidió cuando hubo medida.

## Cómo quedó organizada la CSS

`css/styles.css` pasó de **4.273 líneas en un archivo** a **un mapa de ocho
archivos**, encadenados con `@import`. El mapa es el índice y el orden de la
cascada:

| Archivo | Qué resuelve |
|---|---|
| `css/styles.css` | Solo el `@import` y por qué. Ninguna regla: `@import` es legal únicamente antes de la primera, y un `:root` arriba haría que el navegador los ignorara **en silencio**. |
| `css/tokens.css` | El único lugar con color, medida y tipografía. Primero en la cascada. |
| `css/base.css` | Reset en `:where()`, fondo, foco, iconos, estados vacíos. |
| `css/layout.css` | Las tres columnas, el rail, la barra superior, los dos breakpoints. |
| `css/estado-mes.css` | El bloque de estado y el buscador. |
| `css/libro.css` | Grupos, filas y feed de movimientos. |
| `css/consolidado.css` | Vista multimes: cifras, matriz, gráficos. |
| `css/controles.css` | Botones y formularios. |
| `css/modales.css` | Sheets, avisos, permisos. |

**El precio, dicho:** `@import` descarga en serie y hay ocho idas en vez de una.
Con ocho archivos y red local es invisible; con una hoja sola de 180 KB también
lo era. Lo que no era invisible es el costo de mantenimiento.

**Herramientas nuevas** (las tres son de esta ronda y se quedan):

- `odd/tasks/diseno.mjs` — capturas en 1440 y 390 de la vista, el consolidado
  y un modal, más un bloque de medidas. **Valida el balance de llaves de las
  ocho hojas antes de capturar**, porque una llave de más no da error: el
  navegador cierra el bloque sobrante y se come todo lo que venía después.
  Durante esta ronda Passó exactamente eso y costó una ronda de capturas
  durante las cuales las reglas del `@media` no se aplicaban.
- `odd/tasks/reglas.mjs` — 35 comprobaciones mecánicas: cero sombras, cero
  degradados, cero emojis, cero selectores de etiqueta desnudos, una sola
  familia, tokens literales para `charts.js`, el color del estado donde
  corresponde, y que el rediseño no haya costado altura.
- `odd/tasks/fuente-metricas.mjs` — mide IBM Plex Sans contra la pila de
  respaldo (`size-adjust` 102.49 %, `ascent-override` 102.5 %, `descent-override`
  27.5 %), verifica que sus dígitos son tabulares **por defecto** (480 px los
  tres, a 100 px) y comprueba que `@import` resuelve con `file://`.
- `odd/tasks/contraste-diseno.mjs` — 19 pares de texto con el fondo real
  compuesto y el umbral de WCAG decidido por tamaño y peso.

`odd/tasks/font-metrics.mjs` se eliminó: medía Inter, que esta ronda dejó de
usar. `fuente-metricas.mjs` hace lo mismo para la fuente actual.

## Los cinco problemas, uno por uno

### 1. La fila de KPIs

**Era:** cinco celdas del mismo tamaño y ninguna protagonista. Peor: la celda
"Pendiente" recibía **dos renglones** de app.js —"Cubierto S/ 888.88" y
"Falta S/ 1,444.43"— y el apilado la descuadraba: medido, esa celda medía
204 px de ancho con dos renglones de 20 px mientras las otras medían una línea.

**Ahora:** una sola cifra protagonista y es **"Falta"**, en ocre, a 48 px. Debajo,
la barra de avance con sus dos extremos rotulados —"Cubierto" en verde a la
izquierda, "Estimado S/ 2.333,31" a la derecha—. Debajo, una línea que dice en
palabras lo que la barra ya dibujó, y a la derecha las tres cifras de apoyo:
**Real, Ingresos y Balance**.

**La solución técnica de los dos renglones, y es la parte interesante:**
`app.js:670-672` escribe `#pendingSummaryLabel` con `innerHTML` y pone el
**rótulo pegado a la cifra dentro del mismo nodo de texto**. La presentación no
puede partir un nodo de texto sin escribir JavaScript, y no se toca `js/`.

Lo que sí se puede es tratar el nodo como lo que es —un contenedor con dos
renglones— y darle `display: contents`. Sus dos `<div>` dejan de ser sus hijos y
pasan a ser ítems de la retícula del bloque, donde cada uno cae en una celda
distinta: **"Falta" arriba, "Cubierto" en el extremo izquierdo de la barra**. Un
nodo, dos lugares, cero lógica nueva.

### 2. El Balance duplicado

**Era:** `#topbarBalanceValue` en la barra y `#monthBalanceNeto` en la fila de
cifras, con el mismo número en los dos sitios.

**Ahora:** se queda **uno**, el del bloque de estado, que es donde están las
otras cifras y donde se comparan. El nodo de la barra se eliminó del HTML; la
escritura de `app.js` ya venía detrás de un `if (elTopbarBalance)` desde antes
del rediseño, así que la línea deja de encontrar el elemento y sigue.

### 3. El ruido en el medio de la fila

**Era:** medido, `.expense-item-tags` estaba con `justify-content: center`
dentro de la primera columna de la fila, que mide todo el ancho sobrante. "Fijo"
o "Variable Rango: 100-400" flotaban en el aire a mitad de camino entre el
concepto y el importe, con ~300 px de hueco detrás.

**Ahora:** `justify-content: flex-start`, sin fondo, sin borde y sin radio, pegado
a su concepto. El estado pasó de píldora a **marca breve**: una regla de 2 px con
la palabra al lado, porque el fondo de una píldora repetida diez veces es un
bloque de color que no codifica nada nuevo. Y la fila alterna un `--sunk` muy
suave para guiar la lectura vertical.

El concepto de una fila **cubierta** baja a tinta secundaria, con
`:has(.status-pagado)` — la fila no tiene atributo de estado y agregarlo sería
tocar `js/`. Con eso la fila entera se ve terminada y la marca pasa a ser la
confirmación en vez del aviso.

### 4. La barra lateral

**Rail 236 → 196 px. Columna de secciones 168 → 152 px.** La marca, el nombre del
período y las dos flechas entran enteros en 196 px, que es lo más angosto que
permite que un nombre escrito a mano por la persona —"Periodo de prueba 11
2028"— no se recorte.

El contenido **no ganó** ancho con esto: pasó de 1.189 px a 1.077 px, porque la
columna de secciones pasó de ser una banda horizontal de 97 px a ser una
columna. Ver más abajo cómo se compensó.

### 5. Los colores por categoría

**Era:** los cuatro grupos teñían la superficie con cuatro wash distintos y
teñían nombre, ícono y subtotal con cuatro acentos. Cuatro colores para cuatro
categorías que el lector ya distingue por su rótulo.

**Ahora:** no hay color de categoría. Hay un filete entre grupos, un rótulo que
los nombra y una marca de sección en tinta. Verificado en el navegador: los
cuatro grupos miden `rgba(0,0,0,0)`, o sea el mismo fondo.

## Lo demás que cambió

- **Tipografía**: IBM Plex Sans variable (`@fontsource-variable/ibm-plex-sans@5.3.0`,
  45.712 bytes, el mismo orden que la Inter que se reemplaza), con respaldo de
  métricas calibradas. **Una sola familia en los tres roles**: `--font-display`,
  `--font-body` y `--font-mono` son la misma pila. Lo que alinea las columnas
  es `font-variant-numeric: tabular-nums`, que es una propiedad de cifras y no
  una familia distinta.
- **`--text-zoom-factor`**: existía pero solo multiplicaba el espaciado, y nada
  lo escribía. Ahora **cada peldaño de la escala de texto** es
  `calc(<rem> * var(--text-zoom-factor))`, así que subirlo agranda tipografía y
  aire juntos.
- **Tema oscuro**: eliminado. `html.theme-dark` no lo activaba nadie —ni el JS ni
  un toggle— y eran ~70 líneas de una paleta calibrada para otra superficie.
- **Sombras, degradados y emojis**: cero, comprobado sobre el **estilo
  computado** de todos los nodos de la página, no leyendo la hoja.
- **Botón primario en tinta**, no en color: compite con los tres colores que sí
  codifican estado.
- **Foco en tinta**: un anillo de teclado no codifica estado.
- **`<select>` sin flecha propia**: la anterior la armaba con dos
  `linear-gradient`, y el plan no usa degradados. Se usa la nativa.
- **Consolidado**: las tres tarjetas verde/cian/ámbarLostienen su propia familia
  de color; ahora comparten paleta, tipografía y radios con el libro. La matriz
  usa reglas horizontales en vez de cebra.

## Verificación

Los cuatro comandos, con su salida literal:

```
node --check js\app.js  js\store.js  js\charts.js  js\config.js  js\supabase-store.js
→ los 5 parsean

node odd\tasks\crud-suite.mjs
→ PASS : 27   FAIL : 3   INCONCLUSIVE : 4   total : 34
  assertNetworkClean() ran on 34/34 tests; Supabase requests: 0

node odd\tasks\store-fix-suite.mjs
→ 75/75 comprobaciones OK.

node odd\tasks\adversarial-suite.mjs
→ PASS : 27   FAIL : 0   INCONCLUSIVE : 4   total : 31
  assertNetworkClean() ran on 31/31 tests; Supabase requests: 0
```

**Los 3 FAIL de `crud-suite` son los mismos de antes, uno por uno**, comparado
contra el report de `HEAD`:

```
expense.edit.whitespace-concepto: DEFECT - Save does nothing, silently
month.create.clone: recurrent expenses copied, fresh ids, all reset to Pendiente
month.delete: deleteMonth has no UI control and its guard alert is unreachable
→ 3 de 3 idénticos. Ninguno nuevo.
```

**Ningún test geométrico se rompió.** Las tres expectativas que sí miden forma
—`.expense-item-title` con `nowrap`/`hidden`/`ellipsis`, la fila de 500
caracteres recortada sin scroll horizontal, y `.modal-overlay` como `position:
fixed` que gana el hit-test— se siguen cumpliendo, y están en
`adversarial-suite` (PASS 27, FAIL 0).

Extras: `odd\tasks\reglas.mjs` → **35 reglas cumplen, 0 no cumplen**.
`odd\tasks\contraste-diseno.mjs` → **19 pares cumplen AA, 0 no cumplen**, el
peor a 5.63:1.

### Capturas

En `odd\tasks/capturas/`, leídas y corregidas a lo largo de la ronda:

- `diseno-1440.png` · `diseno-panel-1440.png` · `diseno-modal-1440.png`
- `diseno-390.png` · `diseno-panel-390.png` · `diseno-modal-390.png`

## Lo que NO costó alto, y cómo se comprobó

El rediseño agrega un bloque de estado nuevo y más alto que la tira de cinco
celdas. La pregunta no es si se ve bien: es **cuántas filas de gasto entran en
la pantalla**. Se midió antes y después, a 1440×900 con la fixture `baseline`:

| | Antes | Después |
|---|---|---|
| Primera fila de gasto | y = 315 | **y = 282** |
| Filas completas por pantalla | 12 | **13** |
| Alto del documento | 1.080 px | **938 px** |

Las dos cosas que lowehacieron: el `padding` vertical de la fila bajó de 8 px a
6 px —4 px por fila son 56 px en catorce gastos— y el renglón de apoyo se
respetó el hecho de que **la barra tiene que cruzar el ancho entero**. La
primera versión de esta ronda lo apiló todo y la primera fila cayó a y=360, que
era peor que antes del rediseño. Está anotado en `css/estado-mes.css` con las dos
medidas, para que nadie lo "simplifique" de nuevo.

---

# Qué quedó pendiente

Ordenado por lo que cuesta. Los cuatro primeros **requieren tocar `js/`, que
esta ronda tenía prohibido**.

### 1. "FALTA" en versalitas arriba de una cifra desnuda

El plan pide la etiqueta pequeña arriba y la cifra sola abajo. Se renderiza
`Falta S/ 1,444.43` en un renglón, con la palabra al tamaño de la cifra.

**Por qué:** `app.js:670-672` pone el rótulo y el número en el mismo nodo de
texto. Partirlo requiere dos nodos en `app.js`, no una regla de estilo.
La versión actual usa `word-spacing` para abrir el hueco y se lee como una
cabecera, pero no es lo que el plan dice.

### 2. La dona a REALIZADO, no planificado

El plan lo pide en la sección "Vista consolidado". Vive en `js/charts.js:298-300`,
que lee `--cat-servicios`, `--cat-personales` y `--cat-extras` para pintar los
tres arcos.

**Lo que se hizo mientras tanto:** los tres tokens son ahora **una rampa de
tinta** —`#1C1B19`, `#56534C`, `#8A867D`—, no los acentos arbitrarios
azul/violeta/verde de antes. Es la respuesta estándar a "un valor, N partes" y
no inventa una identidad cromática: la porción más grande es la más oscura. Pero
sigue siendo **planificado**, y eso es un defecto del dato, no de la paleta.

### 3. El tipo de movimiento en el feed va en color

`app.js:1063` escribe verde o rojo en "Ingreso"/"Gasto" con un `style` inline.
En el libro, el color es estado de cobertura y esas dos palabras no lo son: son
el signo de un flujo. El signo del importe ya lo dice.

Es coherente con la regla del plan ("verde = a favor, oxblood = déficit") en el
sentido de que codifica signo, pero **en el feed el rojo no significa déficit**,
significa "salió plata". Queda anotado, no corregido.

### 4. Las barras de los gráficos están muy pesadas

Chart.js las dibuja con relleno sólido al 100 % y sin borde. `charts.js` los
controla. Con la paleta nueva los colores son los correctos
(`--accent-emerald` → `--settled`, `--accent-rose` → `--over`), pero un bloque
de 726×110 px de verde sólido en un estado de cuenta es un bloque de color, no
un dato. Necesita `barThickness`, `borderRadius` o un `--sunk` de fondo.

### 5. El aire vertical del rail

Con dos períodos cargados, el rail deja ~500 px de columna sin uso debajo de la
última píldora. Con 24 la lista scrollea sola y no hay aire.

**Lo que se hizo:** el ancho, que sí sobraba, bajó 40 px. **Lo que no se hizo:**
llenar el hueco. Poner algo ahí sería contenido inventado para tapar una
condición que se resuelve sola con más datos. Queda dicho, no resuelto.

### 6. Una corrección al plan que hay que conocer

El plan asigna `--ink-3` (`#8A867D`) a "etiquetas y metadatos". **Medido sobre
blanco da 3.63:1**, y WCAG AA pide 4.5:1 para texto normal. Tres pares fallaban
(etiquetas de 11 px y la línea de apoyo de 12 px).

El **valor del token no se tocó** —es correcto para lo que sí es, un indicador
no textual, que necesita 3:1 y pasa con margen—. Lo que se corrigió es para qué
se usa: las etiquetas de texto usan `--ink-2` (7.67:1), y `--ink-3` quedó solo
para el tick de sección y el relleno de la barra de la matriz.

Si en algún momento se quiere un tercer nivel de texto, el mismo tono escalado
un 88 % da **`#79766E`**, que mide 4.53:1 y conserva el hue.