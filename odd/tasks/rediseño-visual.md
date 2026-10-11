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
- `movil-320.png` · `movil-390.png` · `movil-768.png` y sus `-filas`, de la
  segunda ronda. La variante `-filas` es la útil: arriba el concepto queda bajo
  el pliegue y no se lee.

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

---

# Segunda ronda: el teléfono

El rediseño se hizo y se verificó a 1440. Después se abrió una ronda sola para
**≤640px**, que es donde la app se usa de verdad: el padre mira el celular.
Dos problemas, medidos, y ninguna línea de JavaScript.

## 1. La banda de secciones era un muro

**Era:** cinco entradas en una rejilla de dos por renglón. Medido, **201px de
alto** —el 24% de una pantalla de 844— antes de la barra superior, antes de la
cifra protagonista y antes del primer gasto. La primera fila del libro caía en
**y=617**: en la primera pantalla entraba una fila y un fragmento de la segunda.

**Ahora:** una franja horizontal de **47px**, una línea, scrolleable. El 7% de
la pantalla. La primera fila sube a **y=463**.

**Por qué no se esconde — y esto es lo importante.** Escondida, la navegación
de categoría desaparecería entera del teléfono: no habría forma de apagar una
sección ni de volver a encender una apagada, y `renderActiveSegments` escribe
el estado con `style.display` inline sobre `.ledger-group`. Un filtro sin dónde
re-encenderse es un filtro que no se puede usar.

**Por qué una línea y no una tarjeta de dos renglones.** El subtotal **sale**:
es el mismo dato que el encabezado del grupo, a 20px, doce píxeles más abajo en
la misma pantalla. En un teléfono el mismo número dos veces, una encima de la
otra, es exactamente el muro que se está desarmando.

**Sobre el renglón scrolleable.** La objeción de la ronda anterior —"dejar
Extras fuera de la vista es reintroducir el defecto"— era contra un renglón que
salía CORTADO sin señal. Uno scrolleable corta al medio, se ve que sigue, y el
libro de abajo nombra las cuatro secciones con su propio encabezado. Que a 320
no entren las cinco es aceptable; que no se vea dónde acaba, no.

## 2. El importe le comía la columna al concepto

**El diagnóstico está en el comentario de `css/libro.css` y va repetido acá
porque es la idea de la ronda:** el problema no era que la fila fuera angosta,
era que la columna del importe era `auto`, y `auto` en una retícula significa
"lo que el contenido mida, sin techo". El detalle `Real S/ x (S/ y)` llegó a
medir 165px y estaba tomando la mitad del ancho útil **por ser la más
subordinada de las tres**.

**La regla: el importe deja de ser una caja y pasa a ser sus dos renglones
sueltos.** `pintarImporteFila` escribe la cifra y el detalle con `innerHTML` en
el mismo nodo, y partirlo necesitaría JavaScript. `display: contents` no parte
el nodo, lo **disuelve**: sus dos `<div>` dejan de ser sus hijos y pasan a ser
ítems de la retícula de la fila, cada uno en su celda. Un nodo, dos lugares,
cero lógica.

Medido con la fixture `baseline`:

| | Antes | Después |
|---|---|---|
| Concepto a 320px | 122px | **173px** |
| Concepto a 390px | 192px | **243px** |
| Caso real (4 dígitos, estimado ≠ real) a 320px | **83px, 6 de 6 truncados** | entra entero |
| Botones editar/borrar | 22×22 | **36×36** |
| Scroll horizontal a 320/390 | — | ninguno |

El caso de la última fila es el que importa: con cifras de tres dígitos el
problema se ve, pero con un presupuesto de verdad —cuatro dígitos y estimado
distinto del real— el concepto quedaba en 83px de 305 y **ningún nombre de
gasto entra en 83px**.

El feed de movimientos tenía el mismo hambre y nadie lo miraba: `.tx-right` es
un `flex` de importe más dos botones, 154px medidos. Pasa a dos renglones —el
dato arriba, el control abajo— y el concepto sube de 87px a **257px** a 320.

## Lo que esta ronda NO compró

**El conteo de filas completas en pantalla no mejoró: 3 antes, 3 después.** Y no
hay lectura favorable: la ganancia vertical de la ronda es **cero**.

La banda le devolvió 154px a la primera fila —de y=617 a y=463, así que la
primera pantalla le da 381px de libro en vez de 227— pero la fila pasó de 72px
a 90px de alto por los 36px de los botones y el renglón del detalle, y son 18px
por fila. Comprobado contra `movil.report.json` a 320px: filas completas en
y=463/552/656, la cuarta arranca en 792 y se sale. Antes: 617/688/762, las tres
completas también.

**Lo que sí compró la ronda es el ancho del concepto**, que es el defecto que la
motivó. La altura se la comió el objetivo táctil de 36px.

Está anotado en las dos hojas. Si alguna vez hay que recuperar filas, el precio
está en `libro.css` y no en `layout.css`: **la banda ya dio todo lo que tenía.**

## Verificación

```
node --check (los 5 js)        → los 5 parsean
node odd\tasks\crud-suite.mjs   → PASS 27 · FAIL 3 · INCONCLUSIVE 4   idéntico a HEAD
node odd\tasks\store-fix-suite.mjs → 75/75 OK                          idéntico a HEAD
node odd\tasks\adversarial-suite.mjs → PASS 27 · FAIL 0 · INCONCLUSIVE 4  idéntico a HEAD
node odd\tasks\reglas.mjs       → 35 cumplen, 0 no cumplen
node odd\tasks\contraste-diseno.mjs → 19 pares AA, 0 no cumplen
```

Los 3 FAIL de `crud-suite` son los mismos preexistentes de siempre, uno por
uno: `expense.edit.whitespace-concepto`, `month.create.clone`, `month.delete`.
**Ninguno nuevo.** Cero requests a Supabase en las tres suites.

**Herramienta nueva: `odd/tasks/movil.mjs`.** Mide y captura a 320/390/768,
valida el balance de llaves de las nueve hojas antes de capturar y espera la
fuente. Las otras rondas dejaron su arnés versionado; esta iba a medirse con un
guion de usar y tirar, y las capturas `movil-*.png` no tenían de dónde salir.
Eso no se repite: una captura sin guion es una captura que nadie puede
re-verificar.

## El arnés dejó de ser un parteperiodista

La primera versión de `movil.mjs` imprimía medidas y escribía el informe. Eso
es un parte, no una prueba: **si mañana alguien revierte el `display: contents`,
el comando sale con exit 0 y nadie se entera.** La revisión nativa lo marcó y
tenía razón.

Ahora tiene **114 aserciones** y tres estados de salida:

| Código | Qué significa |
|---|---|
| `0` | todo cumple |
| `1` | alguna aserción de layout en rojo, **o** el CSS desbalanceado, **o** la página tiró una excepción |
| `2` | infraestructura rota: ni PASS ni FAIL. El navegador no arrancó, la fuente de CDN no cargó, la fixture no renderizó, o el ancho no tiene invariantes declarados |

El `2` existe por un motivo puntual: **afirmar sobre cero filas es un PASS
mentiroso.** Si la fixture no renderiza, la respuesta honesta es "no pude
medir", no "todo bien".

### La fixture que faltaba

El arnés sembraba siempre `baseline`, de tres dígitos. Pero **el defecto que
motivó el `display: contents` no existe con tres dígitos**: necesita cuatro, y
estimado distinto del real, que es cuando el detalle llega a 158px.

Se agregó `produccion4digitos` a `sandbox.mjs`. No es una variante de `baseline`
sino una fixture nueva, porque nueve suites viejas asumen los importes
`111.11 … 777.77` de `baseline` y cambiarlos rompería medidas ajenas.

**La fixture vieja no podía expresar el caso, y esa es la parte interesante.**
Los ayudantes `item()/mov()/month()` de `sandbox.mjs` emiten la forma
`{monto, estado}`, y el store la colapsa: si el estado es Pagado, `montoReal =
montoEstimado` y el detalle queda corto; si no, `montoReal = null` y queda un
solo renglón. El caso que importa necesita la forma nueva
`{montoEstimado, montoReal}` con los dos números puestos a mano.

### Lo que revealed la fixture nueva

En producción el concepto mide **167px a 320 y 237px a 390** —seis píxeles por
debajo de `baseline` (173 y 243). Ese margen es exactamente el defecto
funcionando: el importe de cuatro dígitos (82px) le cede seis píxeles a la
columna del concepto, y el concepto entra entero. El piso de la aserción está
en 159 y 229, calibrado contra esa corrida real, no contra una conjetura.

### Las aserciones que se prueban solas

Una aserción que nunca se vio fallar no es una aserción. Se mutó el CSS a mano
cinco veces y se comprobó que cada una prende su aserción y sale con `1`:

| Mutación | Aserción que prendió |
|---|---|
| `display: contents` → `block` | A3 + A2 (en producción, 6 de 6 truncadas) |
| quitar `grid-area: real` | A4 |
| botones 36px → 22px | A5 |
| borrar `.rail-entry-total { display: none }` | A6 + A8 |
| quitar `opacity: 1` | A13 |

**No quedó ningún agujero.** Y el tri-estado se probó por los dos lados: un
ancho sin invariantes da `2`, y una fixture sin filas da `2` con **cero**
aserciones de layout, no con un verde.

### Dos arreglos de paso

**El campo `culpables` de la medición estaba roto.** Marcaba como culpables a
las cinco entradas del riel en todas las corridas: miraba solo el `overflow-x`
del propio elemento, pero la banda está diseñada para scrollear de lado y su
contenedor recorta. La aserción de scroll horizontal fallaba siempre y no
tenía solución. Ahora sube por los ancestros. Es W1 en versión chica: un dato
que se reportaba mal y nadie miraba porque nadie afirmaba sobre él.

**El comentario de la banda volvió a mentir, por tercera vez.** Afirmaba
"832px con los botones de alta y 784px sin ellos". Ninguno de los dos números
era de un modo distinto: los dos son del mismo recorrido en admin. La
diferencia son los 32px de padding lateral, que Chrome cuenta dentro del
`scrollWidth` de una caja scrolleable. Corregido con la explicación, porque un
número solo no basta: sin el porqué, el próximo lo vuelve a interpretar mal.

## Una corrección que hubo que hacer

Los comentarios del CSS afirmaban un "antes" de 76px y 146px para el concepto.
**Esas cifras no existen.** No es que estuvieran desactualizadas: con esta
fixture son aritméticamente imposibles. Medido con un `Range` sobre el texto,
los seis conceptos necesitan entre 138 y 166px, así que en una caja de 76px se
truncan los seis, forzosamente; y forzando el ancho con `!important` a 146px se
truncan cinco, no dos. Las cifras reales del antes son 122px y 192px.

También se corregió la afirmación de que la primera fila subía a y=471 (son
463) y, sobre todo, la de "de 1 fila a 3": era la mezcla de dos verdades y una
falsa.

**El CSS estaba bien. Lo que mentía era el comentario.** Se corrigieron los
comentarios, no las reglas. Un número falso en un comentario es peor que un
número ausente: el que lo lea mañana toma decisiones sobre algo que nunca se
midió. Y corregir para pasar la revisión no es corregir: es engañar mejor.

**Y una tercera corrección, que la encontró la revisión nativa.** Al arreglar
lo anterior escribí que "ahora entra la primera fila entera y se ve un fragmento
de la segunda". También es falso: entran tres filas completas antes y tres
después. El revisor lo cazó cruzando el comentario contra `movil.report.json`,
que es justamente para lo que existe ese archivo.

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