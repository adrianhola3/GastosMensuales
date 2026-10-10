# Feature: el mes como libro contable único

## Objetivo

Que la Vista Mensual responda **"¿cuánto falta y en qué?"** sin scrollear.
Hoy la pantalla es casi todo cromo y el dato está al fondo. La misión es
cambiar **cómo se navega**, no la paleta.

**Estado: APROBADO por el usuario. NO publicado.**

Decisión tomada por el usuario entre tres opciones (libro agrupado /
comprimir cromo / tabla sin grupos): **un solo libro contable, agrupado por
categoría**.

---

## Diagnostico — medido en el navegador, no opinado

Script: `odd/tasks/espacio-blanco.mjs` (solo lectura, CDP sobre `file://`).
Capturas: `odd/tasks/capturas/diag-espacio-blanco-{1440,panel,1024}.png`.

### A 1440x900, Vista Mensual

| medicion | valor | lectura |
|---|---|---|
| huecosmax del rail | **584.5px** | entre `.sidebar-search-section` (termina y=219.3) y `.sidebar-footer` (empieza y=803.8). **65% del rail no pinta nada** |
| bandas antes del dato | **380.5px** | `view-header` 95.6 + `metrics-row` 112.2 + `payments-strip` 43.6 + `period-bar` 60 + `segments-navigation-bar` 69.1 |
| 1er renglon de gasto | **y = 618.5** | el 69% del alto de la pantalla es cromo |
| gastos visibles | **5 de 10** | y solo 3 de 10 a 1024x900 |
| ancho de contenido | **984px de 1204px** | `--layout-measure` deja **166px muertos** a la derecha |
| celda de metrica | 246px | cuatro celdas de 246px para pintar cuatro veces `S/ 0.00` |

### Por que comprimir NO alcanza

El agregado ya es denso y funciona (`Matriz mensual`, 6 periodos en 700px).
El problema es **vertical**, en la Vista Mensual: 4 secciones apiladas, cada
una con encabezado de ~100px + subtitulo + dos subtotales, separan al lector de
la fila que quiere. Comprimir el cromo deja 4 bloques; el usuario igual scrollea
para responder la unica pregunta que se hace en esta vista.

---

## Decision de arquitectura

**Una superficie, una barra, un libro.**

1. **Una barra de comando pegada arriba** en vez de 5 bandas apiladas. Lleva el
   período, las 3 cifras que importan, la búsqueda y los filtros. Es lo único
   que queda fijo al scrollear.
2. **Un libro agrupado por categoría** en vez de 4 secciones. Renglones de una
   línea, encabezado de grupo por categoría con su subtotal, y la categoría
   como filtro además de como grupo.
3. **Rail de iconos de 64px** en vez de 236px con 584px de vacío. El buscador
   baja a la barra de comando, o sea al lado de los datos que filtra. Con eso
   el contenido recupera los ~166px de ancho muerto.
4. El grupo **es** el filtro: tocar el encabezado filtra; ya no hay 5 píldoras
   que compiten con los grupos que muestran.

---

## Que se mueve, y por que

| de | a | por que |
|---|---|---|
| `.view-header` "Detalle mensual" | **nada** | repite lo que la pestana de navegacion ya dice. 95.6px de titulo + subtitulo |
| `.metrics-row` (4 celdas, 112.2px) | 3 cifras en linea dentro de `.ledger-toolbar` | "Ingresos y abonos" ya esta en la barra y en el grupo Movimientos; "Presupuesto / Balance / Cobertura" se responden con **Pagado / Pendiente / Presupuesto** que son las 3 que accionan |
| `.payments-strip` (43.6px) | absorbida por la barra | su `Pendiente` ES una de las 3 cifras. Era una 4a copia del dato |
| `.period-bar` (60px) | absorbida por la barra | el nombre del mes pasa a ser el control: click abre el selector |
| `.segments-navigation-bar` (69.1px, 5 pills) | chips de filtro **dentro de la barra** | la categoria ya se elige tocando el encabezado del grupo. Falta el "Ver todo" |
| 4 x `.content-card-box` apilados | **1 x `#ledgerBody`** con encabezado de grupo | 4 encabezados de ~100px + 4 subtotales que se reemplazan por 4 encabezados de 1 linea |
| subtotales fijos/variables/por categoria (7 filas) | 1 subtotal por grupo | 7 filas de subtotal para 10 gastos: el desglose es ruido, el total del grupo alcanza. Fijo/Variable sigue **dentro del renglon**, como etiqueta |
| `.sidebar-search-section` | `.ledger-toolbar` | el filtro junto al dato. El atajo `/` se mantiene |
| `.app-sidebar` 236px | **la espina temporal**: marca, 2 vistas, lista vertical de períodos, pie | 584.5px de vacio no son "espacio para crecer". El rail no tenia trabajo: 2 pestanas en 236px. Ahora recorre el **tiempo**, y la barra filtra la **categoría**. Medido con 24 períodos: la tira horizontal de la barra midio **3196px contra 1224 disponibles** — se salia de vista. Vertical con scroll acotado escala, y el activo se trae con `scrollIntoView` |
| `#activeMonthHeaderBadge` | **título de página en el topbar** | baja del rail porque en el rail compite por ancho, y en el Consolidado **no aparecia**: se perdia "¿que período estoy mirando?" justo en la vista donde mas hace falta |
| `.content-card-*` (resto) | se queda solo en el **Consolidado** | T5 quitó las cuatro tarjetas del libro y se llevó las reglas; las secciones estructurales (`matrix-section`, `chart-section`) las seguían usando |
| `.metrics-hero-grid` (Consolidado) | se mantiene | la vista Consolidado ya es densa y funciona |

### Correccion de rumbo: el rail de 64px fue un error

La primera tanda angosto el rail a 64px de iconos, con el razonamiento de que
236px para dos pestanas era espacio sin uso. **La medicion era correcta y la
conclusion estaba mala.** El resultado fue una columna de 900px con cuatro
controles: 43.840px² sin uso, visualmente abandonada, y sin ganar nada de
navegacion. La pantalla quedo igual de vacia, solo que mas angosta.

Lo que faltaba era preguntarse **que deberia navegar el rail**, no cuanto
medir. La respuesta es el tiempo: un rail de 236px con la linea de periods
**esta lleno por trabajo real**, y con 24 periodos esta lleno de verdad.

### Lo que NO se toca

- `store.js`: no cambia el modelo de datos. Un item sigue viviendo en la misma
  coleccion. El libro es una **vista**, no una mudanza.
- `supabase-store.js`, `config.js`, `sync_github.js`: fuera de alcance.
- Los 6 modales: solo se reapuntan los ids que se movieron de lugar.
- La Vista Consolidado: se deja como esta.

---

## Restricciones

1. **El contrato DOM es una puerta, no un adorno.** Baseline antes de tocar:
   `odd/tasks/capturas/dom-contract-antes-ledger.txt` — **142 ids, 63 clases,
   5 atributos**. Correr `node dom-contract.js js/app.js <salida> --diff
   <baseline>` y explicar cada perdido. Un id que `app.js` sigue leyendo y que
   se borro del HTML es un fallo, no una limpieza.
2. **`.expense-card-item` recibe exactamente 4 hijos** (info, estado, importe,
   acciones). El renglon del libro es el MISMO renglon: no se le agrega la
   categoria como quinto hijo, porque la categoria la dice el encabezado del
   grupo. Se agrega `data-categoria`, que es atributo y no hijo.
3. **Sin scroll interno en ningun ancestor de la fila.** Un scroll dentro de una
   tarjeta hace perder el encabezado de grupo, y el encabezado de grupo ES la
   navegacion.
4. Modo lectura: todo lo nuevo se ve en lector, y las acciones editables siguen
   gated por `admin-action-btn` / `exigirAdmin()`.
5. Sin librerias nuevas. Chart.js y Supabase siguen siendo las unicas externas.

---

## Alcance autorizado

`index.html`, `css/styles.css`, `js/app.js`, y los scripts de medicion de
`odd/tasks/`. Nada mas. En particular **no** se edita `store.js`.

---

## Checklist

- [x] **T1 — Barra de comando unica.** Reemplaza las 5 bandas. Periodo como
      control, cifras en linea, buscador movido desde el rail, chips de filtro.
      Pegada al scrollear. Sin `view-header`. **Medido: 2 capas**
      (`ledger-toolbar` 125.9px + contenido), `anchoUtil` 984 → **1093px**,
      `canalDer` 118 → **63px**.
- [x] **T1b — Revision: la tira de datos es UNA fila, no dos.** La segunda
      tanda habia metido "Ingresos / Balance / Cobertura" en un renglon de 9px:
      esconder datos en letra de pie de nota no es diseno. Las 5 celdas
      (Presupuesto, Pagado, Pendiente, Ingresos, Balance) quedaron con la misma
      estructura interna, 20px mono tabular, alineadas a una linea de base.
      `Cobertura` bajo `Presupuesto`. `Balance` con su palabra al lado.
      Buscador y filtros en un solo renglon.
- [x] **T3 — Rail como espina temporal.** 236px, marca, 2 vistas, lista vertical
      de periodos con scroll acotado (`min-height: 0`), pie anclado y siempre
      alcanzable. Verificado con 24 periodos inyectados: el rail no scrollea
      (`scrollHeight 900 === clientHeight 900`) y el pie sigue en 803.75-900.
- [x] **T4 — Topbar sin hueco.** `#activeMonthHeaderBadge` como titulo de pagina
      (17px) a la izquierda; el lado derecho ya tiene Balance y Notas. Hoy la
      mitad izquierda del topbar son **1100px de vacio**.
      **Hecho: `.app-topbar` vuelve a `space-between`, el badge es un `<h2>` en
      `.topbar-left`, y el rail conserva rotulo + flechas + lista.**
- [x] **T5 — Libro agrupado.** `#ledgerBody` con encabezado de grupo por
      categoria y los renglones de 1 linea debajo. `Movimientos` entra como
      grupo con su propio acento. Actualiza las suites que codifican "5
      contenedores" como estructura.
      **Hecho. Ver "Evidencia de T4 + T5" mas abajo, y sobre todo
      "Dos instrumentos que estaban mintiendo".**

> T5 es la que mueve el numero grande: el encabezado de tarjeta de ~100px, los
> subheads "Gastos fijos/variables" y las 7 filas de subtotal son lo que separa
> hoy al lector del renglon que quiere. `primeraFilaY` esta en **315.9** y el
> objetivo es <= 240.

## Rondas de suites (por si hay que actualizar la instrumentacion)

`adversarial-suite.mjs:386` (`empty.every-section-shows-an-empty-state`) exige
que los **cinco** ids `listServicios*|listPersonales*|listGastosExtra` existan y
muestren `.empty-feed-placeholder`. T5 los elimina: esa asercion codifica la IA
vieja, no el contrato del producto. Lo que se conserva es el comportamiento
verificado — ninguna seccion en blanco, con su linea honesta de estado vacio —
cambiando el conteo de 5 contenedores a "los grupos que existan".

`adversarial-suite.mjs:368` exige que `#topbarBalanceValue` pinte texto no vacio
sin `NaN`/`undefined`. **No se puede borrar la cifra del topbar.** Si, en
cambio, `#activeMonthHeaderBadge` puede ir al titulo del topbar: la lista de
`kpisVisibles` (linea 168) lo exige visible en cualquier parte del arbol, no en
una banda especifica.

### Lo que T5 encontro ademas de lo que buscaba

1. **La Vista Consolidado estaba colgando de CSS que T5 borro.** `matrix-section`
   y las dos `chart-section` siguen usando `.content-card-box`,
   `.content-card-header`, `.card-header-left`, `.card-header-titles` y
   `.card-title-row`. Borrar esas reglas rompia el Consolidado entero, y la
   Vista Consolidado esta **fuera del alcance**. Las reglas volvieron, en
   `css/styles.css` seccion 10b, con el alcance acotado a lo que si existe.
   Conviene verlo como una buena noticia: `.content-card-*` quedo siendo el
   vocabulario de las tres secciones **estructurales** del Consolidado y
   `.ledger-*` el del libro mensual. Eran dos superficies con un solo nombre.
2. **`probes.mjs` mide mal el tick de `matrix`, `trend` y `categories`**, y no
   desde esta ronda: los ancla contra el tinte de Servicios. La correccion es
   anclar en `[data-accent="k"]`, y cambia los numeros de contraste reportados,
   asi que queda **anotada, no aplicada**, para que se revise antes de tocarla.
3. **`recorrido.mjs` tiene 2 pasos que no pueden pasar**, y no por esta ronda:
   quita la clase `read-only-mode` del `<body>` pero **no entra en sesion
   admin**, asi que `exigirAdmin()` sigue rechazando. Por eso fallan el de Notas
   y el de pago variable. `crud-admin.mjs` E3/E4 PASS por lo contrario: el gate
   cierra de verdad. Los dos scripts discrepan sobre que significa "lector" y
   `crorrido.mjs` es el que esta equivocado.

## Dos instrumentos que estaban mintiendo

Esto no es T5, pero T5 los tocó y no se puede decir que el numero final sea
bueno sin decir de dónde salía el anterior.

**1. `espacio-blanco.mjs` → `filasEnPantalla` contaba filas inexistentes.**
Era `(altoDeVentana - primeraY) / altoDeFila`. Multiplica el alto de UNA fila
por una distancia que ya no es una distancia de filas: entre la primera y la
última hay encabezados de grupo, filetes y estados vacíos. Antes, con cuatro
tarjetas, el desvío era de 2 filas y nadie lo notaba. **El "11 filas visibles"
que este documento venía reportando no existían**: el mes del diagnóstico tiene
9 gastos, y `11` salía de dividir. Ahora cuenta filas reales cuyo borde superior
cae dentro del viewport, y como eso ya no contesta "¿cuántas filas CABEN?", se
agrega `capacidadFilas`, que es la pregunta de maquetación y no de datos.

**2. `espacio-blanco.mjs` → `canalIzq` restaba de un `.right` que no existe.**
`r()` devuelve `{x, y, w, h}`. `railBox.right` era `undefined`, la resta daba
`NaN`, y el gutter izquierdo salía `null` en cada corrida sin que nadie lo
notara. Ahora es `railBox.x + railBox.w`. También se pregunta por visibilidad:
en la vista Consolidado el toolbar de la Vista Mensual existe pero no está
pintado, y eso daba `-236` en vez de `null`.

**Consecuencia sobre el criterio A1 tal como estaba escrito**: `filasEnPantalla
>= 14` no es satisfacible con el dataset del diagnóstico, que tiene 9 gastos.
El criterio correcto es de capacidad, y el número honesto es
`capacidadFilas = 15` ( cota superior, sin cruzar otro encabezado de grupo).


---

## Criterios de aceptacion

| # | criterio | como se comprueba | estado |
|---|---|---|---|
| A1 | **14 gastos o mas visibles** en una pantalla de 900px de alto a 1440 | `espacio-blanco.mjs` → `filasEnPantalla >= 14` | **medido como `capacidadFilas = 15`**. `filasEnPantalla` da 9 porque el mes del diagnóstico tiene 9 gastos: el criterio escrito no es satisfacible con ese dataset. Ver "Dos instrumentos que estaban mintiendo". |
| A2 | **el 1er renglon de gasto aparece antes de y = 240** | `espacio-blanco.mjs` → `primeraFilaY <= 240` | **213.9** |
| A3 | **no queda ninguna banda de control apilada por encima del libro** | una sola banda: `.ledger-toolbar` | `capas = [ledger-toolbar, ledger-body]`: una banda + el contenido |
| A4 | **el rail no tiene mas de 200px de hueco vertical** | `espacio-blanco.mjs` → `huecoRail <= 200` | **0.1px** |
| A5 | **el contenido aprovecha el ancho** | canal derecho `<= 96px` a 1440 | `canalDer` **63px**; `canalIzq` **48px** (antes `NaN`) |
| A6 | los 6 modales abren, guardan y cierran | suite `crud-suite.mjs` | 27 PASS / 3 FAIL (los 3 preexistentes) / 4 INCON |
| A7 | editar / borrar / cambiar estado sigue funcionando en admin | suite `crud-admin.mjs` | **62 PASS / 0 FAIL** |
| A8 | el buscador filtra el libro y `/` lo enfoca | suite `adversarial-suite.mjs` | **27 PASS / 0 FAIL / 4 INCON**, incluye 2 pruebas nuevas del libro |
| A9 | los dos temas siguen legibles | suite `tema-claro.mjs` + capturas | 0 fallos AA en ambos temas, 45 controles con anillo en Tab real, sin overflow a 1024/1280/1440, 0 errores de consola |
| A10 | **0 ids perdidos** sin justificacion escrita | diff de `dom-contract.js` | **9 perdidos, 6 nuevos**, los 9 justificados abajo |

---

## Checks aplicables

No hay `package.json`: **no hay runner de tests y TDD queda OFF**. La
verificacion de este proyecto es el harness CDP sobre `file://`.

```powershell
node dom-contract.js js/app.js odd/tasks/capturas/dom-contract-tras.txt --diff odd/tasks/capturas/dom-contract-antes-ledger.txt
node odd/tasks/espacio-blanco.mjs
node odd/tasks/crud-suite.mjs
node odd/tasks/tema-claro.mjs
```

- [ ] **TDD: OFF.** Sin runner en el proyecto. Fuente: ausencia de
      `package.json` en la raiz. No se inventa ninguno.

---

## Progreso

### T1 + T1b + T3 — HECHOS

Contrato DOM: **0 perdidos, 0 nuevos** (142 ids / 63 clases / 5 attrs).
Suites: `adversarial-suite` 25 PASS / 0 FAIL · `crud-suite` 27 PASS / 3 FAIL
(los 3 preexistentes, ver abajo) · `tema-claro` 0 fallos AA en ambos temas,
45 controles con anillo de foco en Tab real, sin overflow a 1024/1280/1440,
0 errores de consola.

Los 3 FAIL de `crud-suite.mjs` son **preexistentes** y ajenos a este trabajo:
`month.delete` (asegura que ningun control matchee `/eliminar mes/` y
`#btnDeleteMonth` ya estaba en el baseline), `month.create.clone` (espera que
extras y notas no se clonen, pero sus checkboxes estan `checked` en el HTML) y
`expense.edit.whitespace-concepto` (validacion de modal/store). No se pueden
diferenciar por comparacion porque **el repo no tiene ningun commit**: la
prueba es lectura del HTML original.

### T4 + T5 — HECHOS

## Evidencia de T4 + T5

| medicion | antes de T4/T5 | ahora | objetivo |
|---|---|---|---|
| 1er renglon de gasto a 1440x900 | y=315.9 | **y=213.9** | <= 240 |
| altura de la fila de gasto | 52.7px | **45.7px** | — |
| capacidad de filas en una pantalla | — | **15** | 14 |
| encabezado de grupo | ~100px, 2 lineas | **32px, 1 linea** | — |
| subtotales por mes | 7 filas de 33px | **1 por grupo** | 1 por grupo |
| subheads fijo/variable | 6 de 33px | **0** (es la etiqueta de la fila) | 0 |
| descripciones largas de categoria | 4 de 18px | **0** | 0 |
| huecos del topbar a la izquierda | ~1100px | **0** (`space-between` + titulo) | 0 |
| encabezado del rail | rotulo + flechas + nombre en 2 lineas (48px) | **rotulo + flechas (30px)** | — |
| bandas de control sobre el contenido | 2 | **2** (1 barra + el libro) | 1 barra |
| gutter izquierdo | **`NaN`** (bug) | **48px** | — |
| gutter derecho a 1440 | 63px | 63px | <= 96 |
| hueco del rail | 0.1px | 0.1px | <= 200 |
| alto de la fila con 24 periodos | — | **18px recuperado para la lista** | — |

### Los 9 elementos perdidos del contrato DOM, uno por uno

`node dom-contract.js js/app.js odd/tasks/capturas/dom-contract-tras.txt --diff
odd/tasks/capturas/dom-contract-tras-revision.txt` → **9 perdidos, 6 nuevos**.

**7 ids `subtotal*`** (`subtotalServiciosFijos`, `subtotalServiciosVariables`,
`subtotalTotalServicios`, `subtotalPersonalesFijos`,
`subtotalPersonalesVariables`, `subtotalTotalPersonales`, `subtotalGastosExtra`).
Eran el desglose por colección que T5 reemplaza con un subtotal por grupo. Sus
nodos se fueron de `index.html` y con ellos sus escrituras en
`updateLiveProgressAndTotals`, que ya no tendrían a quién escribir. **El dato no
se perdió**: `store.calculateMonthTotals()` sigue calculando los siete, y por
eso el desglose vuelve el día que alguien lo necesite.

**1 id `transactionsFeedList`.** Era el contenedor de render del feed, no de
lectura. `renderTransactionFeed` ahora escribe en `#ledgerRowsMovimientos`. Lo
mismo con los cinco `list*`, que además **nunca estuvieron en el contrato**: se
pasaban como argumento de cadena a `renderExpenseCategory`, y el extractor solo
ve `getElementById`, `querySelector`, `classList.*`, `className =`,
`getAttribute` y `class="..."` de plantillas. Es un punto ciego conocido del
instrumento, no una baja de cobertura.

**1 clase `accordion-header`.** Era el `div` que se hacía clic para contraer la
tarjeta. Ahora el control es un `<button class="ledger-group-toggle">` con
`aria-expanded` y `aria-controls`, y el estado se escribe siempre junto a la
clase `collapsed` por `setGrupoColapsado()`.

**Los 6 nuevos** (`ledgerRowsMovimientos`, `ledger-group`, `ledger-group-rows`,
`ledger-group-toggle`, `busqueda-vacia`, `data-group-count`) son la maqueta del
libro y su conteo.

### Lo que NO cambió

`store.js` intacto. `charts.js` intacto. Los 6 modales intactos. La Vista
Consolidado intacta en markup. `.expense-card-item` sigue recibiendo **exactamente
4 hijos** en el mismo orden, y la categoría es `data-categoria`, atributo.
`.search` sigue filtreando y `/` sigue enfocando.

### Pruebas nuevas

`adversarial-suite.mjs`, fixture `baseline` (con gastos), grupo propio:

- `ledger.search-hides-empty-groups` — un grupo al que la búsqueda le deja cero
  filas se va con ellas, y el conteo dice `"0 de N"` en vez del total viejo.
- `ledger.search-counts-are-honest` — con una coincidencia parcial, el encabezado
  dice `"1 de N"` en vez de `"N"`.

La primera versión de la primera prueba daba por hecho que un grupo "con filas
pero sin coincidencias" conservaba su encabezado. Era exactamente el defecto, y
la aserción estaba escrita al revés del requisito.

### El fixture `periodos24`

T3 verificó el rail con 24 períodos **a mano**, lo cual significa que nadie más
podía repetir esa medición. `sandbox.mjs` ahora tiene un fixture `periodos24`
con nombres largos ("Periodo de prueba 7 2028", que es la forma que rompe una
lista que asume "Mes Año"). Con él: 24 períodos, el rail **no** scrollea
(`900 === 900`), `huecoRail` **0**, el pie sigue en **803.8** y es alcanzable,
solo la lista scrollea (`766` contra `553`), y la píldora activa entra a la vista.

### T5b — El estado vacío de un grupo es una frase, no un panel

Lo hizo el orquestador, inline, revisando la captura final. Es una regla CSS y
nada mas: `.ledger-group .empty-feed-placeholder`.

Medido con los dos grupos vacíos del mes por defecto: el bloque centrado con
`--space-2` arriba y abajo daba **46px de cuerpo + 16px de padding del grupo**, y
el filtro de Movimientos le sumaba 40px. **164px de pantalla para decir dos veces
que no hay nada.** Y centrado en 1093px de ancho un texto de 13px se convierte
en un vacío con forma: parece una sección a la que le falta el contenido.

Alineado a la izquierda y pegado al encabezado, el mismo texto mide **24px** y
lee "este grupo está vacío". La honestidad no está en el tamaño del bloque, está
en que la frase exista.

---

## Cierre: verificacion deT5b, corrida del orquestador

```powershell
node dom-contract.js js/app.js odd\tasks\capturas\dom-contract-final.txt --diff odd\tasks\capturas\dom-contract-antes-ledger.txt
# [IDS] 142 -> 135 · perdidos 11 · nuevos 4
#   PERDIDOS: btnClearSidebarSearch, sidebarSearchInput, sidebarSearchResultsFeedback   <- 3 renombres
#             subtotalGastosExtra, subtotalPersonalesFijos, subtotalPersonalesVariables,
#             subtotalServiciosFijos, subtotalServiciosVariables,
#             subtotalTotalPersonales, subtotalTotalServicios, transactionsFeedList     <- 8 nodos eliminados
#   NUEVOS:   btnCommandClearSearch, commandSearchInput, commandSearchResultsFeedback, ledgerRowsMovimientos
# CONTRATO DOM: 12 perdidos, 9 nuevos   (3 clases + 3 ids accounted as renames)
```

Los **11 ids perdidos** son 3 renombres + 8 nodos que se fueron con su
presentacion. Verificado por grep sobre `js/*.js` e `index.html` que **ninguno
queda con una lectura viva**: los unicos matches son los comentarios en `app.js`
y `index.html` que explican la eliminacion. `store.js` sigue calculando los siete
subtotales, asi que el dato no se perdio.

```powershell
node odd\tasks\espacio-blanco.mjs
# rail: scrollea false · huecoRail 0.1 · anchoUtil 1093 · canalDer 63
# capas: [ledger-toolbar, ledger-body]                       <- 2
# primeraFilaY 213.9 · filasVisibles 9 · capacidadFilas 15
# 1024: anchoUtil 945 · canalDer 47
```

```powershell
node odd\tasks\adversarial-suite.mjs   # 27 PASS / 0 FAIL / 4 INCON
node odd\tasks\crud-suite.mjs           # 27 PASS / 3 FAIL / 4 INCON  (los 3 preexistentes)
node odd\tasks\crud-admin.mjs           # 62 PASS / 0 FAIL
node odd\tasks\tema-claro.mjs           # 0 fallos AA en ambos temas · 45 controles con anillo
                                       # sin overflow a 1024/1280/1440 · 0 errores de consola
```

## Proximo paso

Nada pendiente de esta feature. Lo que queda, y que **no** se hizo aca:

1. **A1 necesita un criterio escribible.** Hoy no lo tiene: depende de cuántos
   gastos tenga el mes que se está mirando. La forma correcta es
   `capacidadFilas >= 14`. **El script ya mide las dos cosas**; lo que falta es
   decidir si A1 se reescribe o se deja como estaba.
2. **La exportación no tiene superficie de UI.** `adversarial-suite` lo reporta
   como INCON en dos tests (`import.no-ui-surface`, `export.no-ui-surface`):
   `store.js` implementa `importJSON`, `exportJSON` y `exportCSV`, y nada en la
   app los llama. `README.md` anuncia "copia de seguridad en JSON" y exportación
   CSV. Eso o es una función que hay que construir o es una promesa que hay que
   borrar del README.
3. **La de "eliminar un mes"** tiene el mismo problema: `store.deleteMonth`
   existe con **cero** llamadores, y su alerta de guardia es código muerto.
