# Rail de secciones — segunda columna de navegación

## Objetivo

Que Servicios / Personales / Movimientos / Extras se naveguen desde una columna
izquierda persistente, con su conteo y su subtotal a la vista, y que cada sección
tenga su botón de alta en esa columna. Eliminar el scroll largo para llegar a
información y hacer que el alta de gastos sea igual de evidente en las cuatro
secciones.

## Problema (medido, 1440x900, fixture `baseline`)

| Medida | Valor | Lectura |
| --- | --- | --- |
| Rail `.app-sidebar` | 236px | ancho correcto, pero con **520px de aire muerto** entre y=150 y y=670 |
| `.sidebar-periods` | `flex: 1 1 auto` | crece para rellenar; con 2 períodos deja ~400px de aire DENTRO de la lista |
| `huecoRail` (métrica de #198) | 0.1 | **medición correcta, conclusión equivocada**: el bloque crece, así que el hueco entre bloques es 0, pero el aire sigue ahí y se ve |
| Contenido | `mainScrollHeight` 912 vs `clientHeight` 912 | con el fixture chico no scrollea; con datos reales (varios períodos + más gastos) sí |
| Chips de sección | `.ledger-chips` en la barra, `margin-left:auto` | ocupan 400px+ de ancho horizontal para 5 elementos |
| Alta de Extras | `.btn-quick-add-extra` existe y funciona | `fondo transparente`, `color: --text-secondary`, `borde hairline` — se lee como texto, no como botón |

### Por qué "no hay forma de añadir en Extras" (el bug reportado)

Medido en navegador, modo Administrador:

1. El botón **existe**, es visible, mide 74x29.1px, y el flujo completo funciona:
   click → `#modalAddBudget` activo con `budgetSection=extras`, campo de tipo
   oculto → submit → `store.addBudgetItem` empuja en `month.extras` → la fila se
   renderiza y el conteo del grupo pasa a 2.
2. En modo **Solo Lectura** —que es como arranca la app, porque
   `sesionActual` nace en `{rol:'lector'}` (app.js:25) y el modal de rol pide
   elegir— pasa esto:

   ```
   altaServicios: none   altaPersonales: none   altaExtras: none
   altaGastoHeader: none  altaIngresoHeader: none
   nuevoMes: none        nota: none             toggleFila: none
   ```

   Los diez controles de escritura están ocultos. No es un bug de Extras: es
   que **no hay ningún botón de alta visible sin sesión de administrador**.

La causa raíz del perceptions es doble: botón invisible por diseño Y ausente
por rol. El arreglo de esta feature no cambia el modelo de permisos — eso es
una decisión de producto aparte— pero **hace que el alta esté en la navegación
en vez de al final de una página**, que es lo que el usuario pidió.

## Por qué el diseño elegido

**Los chips de la barra BECAMAN la columna.** No se agrega una columna con
vocabulario nuevo: los cinco `.segment-pill-btn` (`data-segment`) se mueven al
rail de secciones. Consecuencias:

- `renderActiveSegments` (app.js:1038) y `toggleSegment` siguen funcionando sin
  tocar una línea: leen `data-segment` y `data-segment-card`.
- `adversarial-suite.mjs:1339` exige `botones.length >= 5` y busca
  `[data-segment="all"]`: los cinco siguen existiendo, ahora en el rail.
- La barra pierde su segundo renglón: 2 capas de control pasan a 1 banda +
  columna.

**Cada entrada de la columna hace tres trabajos**, y por eso gana el ancho:

1. **Filtrar** — comportamiento actual, sin cambios.
2. **Navegar** — `scrollIntoView` al grupo, para que el clic vaya al dato y no
   solo lo esconda.
3. **Informar** — conteo de filas y subtotal del grupo, que antes solo se veían
   al scrollear hasta el encabezado del grupo.

**Y lleva su propio botón de alta**, uno por sección. El de Extras deja de ser
el último "Añadir" de una página larga y pasa a ser un control de la columna de
navegación, a la misma altura y con el mismo tamaño que los otros tres.

### Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Segunda columna con items nuevos, dejando los chips | duplica el vocabulario: dos controles para la misma decisión. La hoja ya sufrió eso con `.content-card-box` (memoria #198) |
| Meter el índice de secciones en los 520px de aire del rail actual | costo cero de ancho, pero no es "una segunda columna": se mezclaría con la línea de tiempo y las dos listas compiten por el mismo eje vertical |
| Sección única a la vez (ocultar las otras tres) | rompe `empty.segment-filters` (adversarial-suite.mjs:1335) y le quita a la persona la vista de las cuatro cifras a la vez |
| Poner el buscador en la columna | un filtro tiene que estar al lado del dato que filtra, y #198 ya bajó el buscador del rail por eso |

## Alcance autorizado

- `index.html` — mover `.ledger-chips` a un `<nav class="section-rail">` nuevo
  dentro del área principal; los botones de alta pasan a la columna.
- `css/styles.css` — reglas de la columna; centrar las celdas de la tira de
  cifras; alinear las etiquetas de fila.
- `js/app.js` — `scrollIntoView` al activar una sección; actualizar conteo y
  subtotal en las entradas de la columna después de cada render.
- **NO** se cambia el modelo de permisos ni `exigirAdmin()`.
- **NO** se rompen los ids que las suites leen (ver abajo).

## Contrato que no se rompe

| Selector / id | Quién lo lee | Regla |
| --- | --- | --- |
| `.segment-pill-btn`, `data-segment` | app.js `renderActiveSegments`; adversarial-suite:1336,1339 | los 5 siguen, ahora en el rail |
| `[data-segment="all"]` | adversarial-suite:1364 | sigue existiendo |
| `data-segment-card` | app.js filtra por él | intacto |
| `.btn-quick-add-service/-personal/-extra` | crud-admin.mjs:1012,1076,1095 | los tres siguen en el DOM y abren el modal |
| `#btnHeaderAddBudget`, `#btnQuickActionIncome`, `#btnQuickActionExpense` | crud-admin.mjs:2512 | intactos |
| `body.read-only-mode .admin-action-btn{display:none!important}` | styles.css:3220 | se replica literal |
| `.expense-card-item` = 4 hijos | styles.css:101 | no cambiar columnas de fila |
| breakpoint del drawer 1024px | app.js lo compara en 4 lugares | no mover |
| breakpoint de la columna de secciones 1440px (T7) | `diag-breakpoint.mjs` | no bajar sin repetir el barrido: 1398 es el punto de corte real de la tira |

## Tareas

- [x] **T1 — Instrumento y línea base.** `odd/tasks/diag-extras.mjs` (alta de
      Extras end-to-end, geometría, desalineación) y `odd/tasks/shot.mjs`
      (captura + desalineación vertical). Base: `antes-nav.png`.
- [ ] **T2 — `section-rail` en el HTML.** Mover los 5 `.segment-pill-btn` al
      nuevo `<nav>`; cada entrada lleva icono, nombre, conteo
      (`[data-rail-count]`) y subtotal (`[data-rail-total]`), más un botón de
      alta con `admin-action-btn`. Actualizar los comentarios del proyecto que
      describen la barra.
- [ ] **T3 — CSS de la columna.** `.app-layout` a 3 columnas; `.section-rail`
      sticky con `min-height:0`; accent de la entrada activa; los tokens
      `--rail-width` / `--drawer-width` intactos; drawer de 1024px sin cambios.
- [ ] **T4 — `js/app.js`.** `activarSeccion()` con `scrollIntoView`;
      `sincronizarRailSecciones()` escribe conteo y subtotal después de cada
      render; los botones de alta de la columna abren el modal con su sección.
- [ ] **T5 — Centrado.** Celdas de la tira de cifras centradas; subtotales de
      grupo alineados; aviso de estado vacío centrado. Solo donde el bloque ya
      se declara centrado o donde el renglón queda ragged.
- [ ] **T6 — Verificación.** `crud-suite.mjs`, `adversarial-suite.mjs`,
      `recorrido.mjs`, `diag-extras.mjs` antes/después + `despues-nav.png`.

## Criterios de aceptación

1. Los 5 `.segment-pill-btn` viven en el rail y el filtro multi-selección sigue
   funcionando igual.
2. Activar una sección la trae a la vista (`scrollIntoView`), no solo la filtra.
3. Cada entrada muestra el conteo real de filas y el subtotal real del grupo, y
   se actualizan al agregar, editar, borrar, cambiar de mes o filtrar.
4. Los cuatro botones de alta son visualmente equivalentes entre sí.
5. Ninguna de las 4 secciones queda sin forma de añadir.
6. La tira de cifras queda centrada dentro de su celda.
7. `mainScrollHeight` del fixture `periodos24` no crece al agregar la columna.
   **CUMPLIDO, tras T6b, Y DE NUEVO IMPORTA POR T7.** Con la columna a 200px
   crecía 59px (867 → 926) y la barra se partía en dos renglones. A 168px con
   las acciones abajo y la pista en 32px: 867px, barra 125.9px, tira en una fila
   con 25.2px de holgura. Ver "Lo que este doc decía mal", punto 4.
   **OJO: ese 25.2px era 41.2px y el instrumento que lo midió contaba un gap de
   más.** Ver punto 5.
8. `crud-suite.mjs` y `adversarial-suite.mjs` no pierden ningún PASS.
9. **La barra de comando está en un renglón en todo el rango de escritorio.**
   No lo pedía el doc y es el criterio que T7 teve que inventar: el criterio 7
   medía UN ancho (1440) y el defecto era un RANGO (1025-1423). Cumplido para
   1255-1920; por debajo de 1255 la tira se sigue partiendo, y por qué está
   medido y es aritmética, no un descuido — ver T7 y punto 5.

## Estrategia de entrega

Feature en una rama, un commit por unidad de trabajo. Presupuesto de revisión:
400 líneas. El T2+T3 se cuentan juntos porque el HTML sin el CSS no se puede
mirar. Si el total pasa las 400 líneas, se divide en dos PRs encadenados.

## Progreso

- [x] **T1** — `diag-extras.mjs` y `shot.mjs`. Base: `antes-nav.png`,
      `capturas/diag-antes.txt`, `capturas/shot-antes.txt`.
- [x] **T2** — `<nav class="section-rail">` entre el rail y el contenido
      (index.html:223-314). Los 5 `.segment-pill-btn` con ícono, nombre,
      `[data-rail-count]` y `[data-rail-total]`; los 5 botones de alta
      `.rail-add-btn` salidos del encabezado de los cuatro grupos.
- [x] **T3** — `--section-rail-width: 200px` (styles.css:641-642), retícula de
      3 columnas (§5), §9b completo para la columna, §13 y §18 actualizados,
      y los dos behavioros del breakpoint de 1024px.
- [x] **T4** — `activarSeccion()` (app.js) con `scrollMarginTop` medido en el
      clic, y `sincronizarRailSecciones()` llamada desde
      `sincronizarEncabezadosDeGrupo()` **y** desde el final de
      `renderMonthView()`.
- [x] **T5** — tira de cifras, `.ledger-paid-line`, `.ledger-balance-line`,
      `.expense-item-tags` y `.empty-segments-notice`. De 86 nodos
      desalineados a 77, con las cuatro categorías pedidas resueltas (la tabla
      completa en "Evidencia de verificación").
- [x] **T6** — ver abajo.
- [x] **T6b — Corrección de la barra partida.** `.ledger-actions` al renglón del
      buscador, `--section-rail-width` a 168px, `.payments-track` a 32px. La
      barra vuelve a 125.9px y `mainScrollHeight` a 867px, que es lo que pedía
      el criterio 7 y lo que T2-T5 no habían logrado. Instrumentos nuevos:
      `diag-strip2.mjs` (ancho de la celda "Pagado"), `diag-strip3.mjs` y
      `diag-strip4.mjs` (barrido columna × pista), `diag-railfit.mjs` (ancho
      final, celda por celda, y desborde de la columna). Captura:
      `corregido-nav.png`.
- [x] **T7 — El breakpoint de la columna de secciones: 1024px → 1440px.** El
      defecto que T2-T6 no podían ver: se ajustó un ancho y no se midió el
      rango. La columna de 168px vivía en 1025-1423 y en casi todo ese rango la
      barra estaba partida en dos renglones (185.2px, "Balance" solo abajo). El
      usuario tiene un monitor de 1366x768. §19 se parte en dos: **§19a** (1440px,
      la columna baja de eje a banda horizontal) y **§19b** (1024px, el drawer,
      congelado por las 4 comparaciones de `app.js`). Instrumento nuevo:
      `diag-breakpoint.mjs`, que recorre 16 anchos y no dos puntos. Capturas:
      `breakpoint-1440.png`, `breakpoint-1366.png`, `breakpoint-1024.png`.

## Lo que este doc decía mal

Cuatro cosas, medidas. Las tres primeras son del diagnóstico; la cuarta es un
criterio de aceptación que resultó falso.

### 1. El aire muerto del rail NO cambió, y no iba a cambiar

El doc dice que el rail "dejaba **520px de aire muerto** entre y=150 y y=670" y
que la columna lo resolvería. **Medido: son 491.3px, no 520, y siguen siendo
491.3px después de la columna.** El air sigue entre la última píldora de
período (`bottom: 267.3`) y el bloque de administración (`y: 758.6`), porque
`.sidebar-periods` es `flex: 1 1 auto`: el bloque CRECE, el pie se ancla al
borde y el hueco entre bloques da 0. El doc ya lo decía en otra parte —"el
bloque crece, así que el hueco entre bloques es 0, pero el aire sigue ahí y se
ve"— y aun así carga la columna como si lo eliminara.

Lo que la columna hace no es rellenar ese aire: es **dejar de exigir que se lo
atraviese** para leer una cifra. Las dos cosas quedan, y eso hay que decirlo.

### 2. `.ledger-chips` no ocupaba 400px+: ocupaba 110px

El doc dice que los chips "ocupaban 400px+ de ancho horizontal para 5
elementos". Medido antes del cambio: los cinco `.segment-pill-btn` juntos
median 110.1px de ancho (el más ancho, "Movimientos", 76px). Los 400px+ eran
una estimación al ojo de la captura, no una medida. La banda de 125.9px era
correcta; lo que sobraba en esa fila no eran los chips.

### 3. Los cuatro botones de alta NO eran iguales entre sí

El doc propose "el que se ve debe ser el de la columna: eliminá el que estaba
en el encabezado del grupo". Correcto como decisión, pero la premisa —que los
cuatro botones de alta quedaran visualmente iguales solo por estar juntos— no
se cumple sola: `.btn-quick-add-service/-personal/-extra` declaraban
`background: transparent` + `color: var(--text-secondary)` + `border-color:
var(--hairline)` y `font-weight: 400`, mientras que `#btnQuickActionIncome` y
`#btnQuickActionExpense` heredaban `.btn` (fondo `--bg-inset`, texto
`--text-main`). Medido: los tres "Añadir" eran `rgba(0,0,0,0)` sobre
`rgb(91,95,103)` con borde `rgba(29,29,31,0.12)`; los dos de Movimientos eran
`rgb(242,242,245)` sobre `rgb(29,29,31)`. Una sola clase `.rail-add-btn` para
los cinco, no cuatro reglas.

### 4. El criterio 7 era falso, y el arreglo que se propuso también

El criterio pide que no crezca. Medido, con `periodos24`:

| | antes | columna a 200px | columna a 168px |
| --- | --- | --- | --- |
| `mainScrollHeight` | 867px | 926px | **867px** |
| `mainClientHeight` | 867px | 926px | **867px** |
| barra de comando | 125.9px | 185.2px | **125.9px** |
| ancho del contenido | 1189px | 989px | 1021px |

La causa era aritmética, no un defecto de la columna: con 236px de rail, 200px
de columna y padding de 48px, la columna del contenido daba 989px y las cinco
celdas de la tira necesitan 1049.8px interiores. Faltaban 141.8px y **no
salían de aire**: las cinco celdas tienen `sobra = 0` (`diag-strip2.mjs`), el
ancho es dato, no relleno. Con `flex-wrap` en la base de `.ledger-strip` la
tira se partía, "Balance" bajaba a un segundo renglón y quedaban 59.3px de
scroll vertical — el mismo defecto que la columna de secciones había costado,
pagado otra vez.

Este doc proponía como salida bajar `--section-rail-width` a ~144px, y Tilaba
"Movimientos". **Era la respuesta a la pregunta equivocada.** El ancho no lo
decidía la columna: lo decidían dos piezas que no estaban haciendo su trabajo
en la tira.

#### 4a. El ancho de la tira lo fija la celda "Pagado", y por su TERCERA línea

`diag-strip2.mjs` la desmenuza:

```
celda "Pagado"          261.9px   <- contra 124.5px de las otras y 184.3px de "Balance"
  "2 de 6 gastos pagados"  129.6px
  pista                    32px
  "38.1% Pagado"           84.4px
  2 gaps de 8px            16px
```

La celda "Pagado" **no** es ancha por su importe (`S/ 888.88` mide 101.9px).
Es ancha por la fila que dibuja la fracción, y dentro de esa fila el ancho lo
pone el **texto**, no la barra. Las otras cuatro celdas miden 124.5px o
184.3px y ninguna tiene un píxel de sobrante: con 20px de cuerpo, el importe
`S/ 12,345.67` mide 164px y la celda se ajusta a lo que mide. El ancho de la
tira es dato, y se puede tocar —no hay aire que regalar.

Por eso dos cambios en la celda y no uno en la columna:

- **`.payments-track` de 72px a 32px.** Es la pieza más cara y menos
  informativa: una barra de 2px de alto que representa una fracción cuyos dos
  operandos ya están escritos a sus lados ("2 de 6 …" y "38.1% Pagado"). A
  32px sigue leyéndose como proporción y libera 40px. El argumento de por qué
  es `flex: 0 0 32px` y no `0 1 32px` sigue siendo el de siempre — con
  `flex-shrink: 1` Chrome la aplasta a 16px — y sólo cambia el número.

  Y con 72px + columna de 168 la tira necesita 1089.8px contra 1021px
  disponibles: se parte igual. Los 40px no son cosméticos, son los que
  compran la única línea.
- **`.ledger-actions` ("Abono"/"Gasto") al renglón del buscador.** No por
  aritmética: `.ledger-strip` es una tira de **cinco cifras comparables entre
  sí**, y "Abono"/"Gasto" no son cifras — no tienen etiqueta ni importe y su
  ancho (110.1px) lo decide el texto más largo. Estaban ahí porque en la
  versión anterior la banda mezclaba todo. Ahora la barra tiene dos renglones
  con dos trabajos distintos: el de arriba **lee** el mes, el de abajo **actúa**
  sobre el mes y **encuentra** en él. Buscador y botones de alta son las dos
  cosas que se piden juntas ("buscar tal cosa" + "cargar un gasto").

#### 4b. El barrido: por qué 168px y no "el número más grande que entre"

`diag-strip4.mjs` recorre columna × pista y descarta todo lo que quede por
debajo de 24px de holgura. Sólo hay **una** combinación robusta en 30:

```
columna 168px + pista 32px -> holgura 25.2px, barra 125.9px, scrollH 867
```

A 176 la holgura cae a 17.2px; a 184 a 9.2; a 192 a 1.2. Un número de 0.2px
o 1.2px de holgura no es una configuración, es una coincidencia: el día que una
cifra mida dos píxeles más, la barra se parte sola sin que nada avise. 168 + 32
es lo único que deja aire de verdad.

Con 168 **no se recorta ningún nombre**: el barrido midió `.rail-entry-name` y
`.ledger-cell-label` con `scrollWidth > clientWidth` sobre las 30 filas de la
matriz y no encontró ninguno. "Movimientos" con su conteo mide 118px a 13px.
La alternativa de este doc —144px— sí recortaba, y por eso la corrección real
no fue angostar más sino sacar las dos piezas que sobraban de la tira.

#### 4c. Un defecto que NO era del ancho: el padding de los botones de la columna

Con la columna a 168, el botón "Gasto" de la entrada "Movimientos" se salía
**18px** del borde derecho (`diag-railhdr.mjs`). El nombre de la sección no se
recortaba —el barrido lo decía— pero el botón sí.

La causa no era el ancho: era que la regla `.rail-add-btn` declara
`padding: 0 var(--space-1)` (8px) y **nunca aplicó**. Los cinco botones llevan
también `.btn.btn-sm` en el HTML, y `.btn-sm` está declarado en §13, después de
§9b; a igual especificidad gana el último, así que el padding real era el de
`.btn-sm` — `var(--space-2)`, 16px — y el comentario de §9b que decía que
`.rail-add-btn` "gana por peso de cascada porque se declara después" estaba
dicho al revés.

Consecuencia medida: los dos botones de Movimientos piden 174px en una columna
de 168. Con 16px de padding, `144px` que quedan se reparten en 81.3 y 70.7 —
**y no iguales**, porque `flex: 1 1 0` reparte el ancho *libre*, no el total, y
" Ingreso" necesita más que "Gasto". El comentario de `.rail-entry-adds` que
promete que "los dos miden lo mismo" tampoco era cierto.

Arreglo: `padding: 0 var(--space-1)` pasó a `.section-rail .rail-add-btn`, un
selector más específico que `.btn-sm` y que al mismo tiempo ata la regla al
lugar donde vive el componente. Con 8px los dos miden 65.3 y 59.7 —todavía
distintos, por lo mismo— y el renglón queda en `-9px`: entra con aire y sin
scroll horizontal. Se comprobó en toda la matriz 200/184/176/168/160/152/144:
`recortados: []`, `scrollX: 0`, y desborde del rail **cero** a 200, 184, 176 y
168. A 152 y 144 vuelve a aparecer (+2px y +10px) —que es exactamente el
recorte de nombres que este doc ya sabía que existía más abajo— así que 168
sigue siendo el piso, no el techo.

Este no lo pedía el barrido y no lo introduce la corrección de la barra: es un
defecto de cascada que venía de T2-T3 y que sólo se ve al medir. Queda anotado
porque el mismo patrón se va a repetir con el próximo componente que herede
`.btn-sm` dentro de una columna angosta.

### 5. El doc ajustó UN ancho y el defecto era un RANGO (T7)

Éste es el grande, y es el que costó dos veces: una vez por la decisión y otra
por el instrumento que la midió.

**El rango.** Todo T2-T6 se calibró contra 1440x900 porque es el ancho de diseño
y el de todas las capturas. Nadie preguntó qué pasaba **debajo**. Con la
columna de 168px, la tira de cifras (que necesita **883.8px** interiores)
entra en un renglón sólo hasta ~1398px de ventana; de 1398 para abajo se parte
en dos renglones y "Balance" cae a una segunda fila:

| ventana | main | disponible | necesario | holgura | filas | barra | altoDoc |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | 1021 | 925 | 883.8 | **+41.2** | 1 | 125.9 | 915 |
| 1439 | 1020 | 924 | 883.8 | +40.2 | 1 | 125.9 | 915 |
| 1400 | 981 | 885 | 883.8 | **+1.2** | 1 | 125.9 | 915 |
| 1366 | 947 | 851 | 883.8 | −32.8 | **2** | **185.2** | 974 |
| 1280 | 861 | 765 | 883.8 | −118.8 | 2 | 185.2 | 974 |
| 1200 | 781 | 685 | 883.8 | −198.8 | 2 | 185.2 | 974 |
| 1025 | 606 | 510 | 883.8 | −373.8 | 2 | 204.8 | 993 |
| 1024 | 1009 | 945 | 883.8 | +61.2 | 1 | 125.9 | 1011 |

Y +1.2px a 1400 no es aire: es una coincidencia. El día que una cifra mida un
píxel más, la barra se parte sola y no hay nada que avise. Este doc ya lo dijo
de 168+32 ("0.2px de holgura no es una configuración, es una coincidencia"), y
no lo aplicó al ancho de la ventana.

**El instrumento, que era peor que el rango.** `diag-deform.mjs` —el que produjo
el diagnóstico— tenía dos errores de aritmética, y por eso su salida no podía
sostener la conclusión que se le pedía:

| línea | qué dice | qué pasa |
| --- | --- | --- |
| 34 | `const filas = tops.size` | `tops` es `[...new Set(...)]`, un **array**: `.size` es `undefined` y `.length` es lo que cuenta los renglones. Por eso la tabla de salida **no tiene columna `filas`** y su sección "EL LÍMITE EXACTO" no podía decir nada. |
| 48 | `columnGap * celdas.length` | cinco celdas dejan **cuatro** separaciones, no cinco. Infla el ancho necesario en un gap entero (16px). |

Con el gap corregido, la holgura de 1440 no es 25.2px sino **41.2px**, y 1400 no
está "a −14.8px" sino a **+1.2px**: con el número viejo, el mismo ancho
reportedo como roto y como entero al mismo tiempo. El punto de corte real es
1398, no 1424.

`diag-breakpoint.mjs` corrige las dos y además mide lo que faltaba: renglones de
la tira, `scrollWidth - clientWidth`, recorte de `.rail-entry-name` /
`.ledger-cell-label`, desborde de bloques y alto del documento, en 16 anchos.

**Lo que NO se arregla angostando la columna.** Para que la tira entrara a 1280
con tres columnas haría falta una columna de **−48.2px**. No existe: las cinco
celdas tienen `sobra = 0`. La solución no era un número de ancho, era **dónde
ocurre la transición**.

**Y el tope real, que es aritmética y no una decisión.** Con el drawer de 1024px
congelado y el rail de 236px en flujo hasta ahí, la columna del contenido nunca
puede pasar de `ventana − 251 − 96`. Para 24px de aire hace falta `main` de
1003.8px, o sea **ventana ≥ 1255**. Por eso 1200, 1100 y 1025 siguen partiéndose
después de T7 y no hay arreglo sin tocar el rail o el padding: son 236px que la
columna de tiempo se come en una ventana que no llega. La banda arregla
1366 y 1280 —los anchos de escritorio comunes— y no puede arreglar eso.

## Evidencia de verificación

1440x900, Chrome headless, `odd/tasks/sandbox.mjs`. Las medicciones de T7 están
en "T7 — El breakpoint de la columna de secciones, 1440px", más abajo.

### Suites

| suite | antes | después (T2-T5) | tras la corrección de T6 | tras T7 |
| --- | --- | --- | --- | --- |
| `crud-suite.mjs` | 27 PASS / 3 FAIL / 4 INCON | 27 PASS / **3 FAIL** / 4 INCON | 27 PASS / **3 FAIL** / 4 INCON | 27 PASS / **3 FAIL** / 4 INCON |
| `adversarial-suite.mjs` | 27 PASS / 0 FAIL / 4 INCON | 27 PASS / 0 FAIL / 4 INCON | 27 PASS / 0 FAIL / 4 INCON | 27 PASS / 0 FAIL / 4 INCON |
| `crud-admin.mjs` | (sin línea base medida) | 62 PASS / 0 FAIL / 0 SKIP | 62 PASS / 0 FAIL / 0 SKIP | 62 PASS / 0 FAIL / 0 SKIP |

Ningún PASS perdido, ningún FAIL nuevo, ni antes ni después de la corrección.

Los 3 FAIL de `crud-suite` son exactamente los 3 preexistentes:
`expense.edit.whitespace-concepto`, `month.create.clone`, `month.delete`.
Ningún PASS perdido en ninguna suite.

### Geometría

`app-layout`: `236px 1189px` → `236px 168px 1021px`. Ancho de la columna de
secciones: 168px (era 200px antes de la corrección de T6). Celda "Pagado":
301.9px → **261.9px**. Pista: 72px → **32px**. Renglón del buscador: 37px, con
"Abono"/"Gasto" adentro. Tira en **1** fila, holgura 25.2px, barra 125.9px,
`mainScrollHeight` 867, sin scroll horizontal. Aire muerto del rail:
491.3px → 491.3px (ver punto 1).

### Desalineación horizontal (`diag-extras.mjs`, 97 → 103 nodos)

86 → 77 nodos a más de 6px del centro del padre. Por categoría:

| categoría | antes | después |
| --- | --- | --- |
| tira de cifras | 12 | **6** |
| etiquetas de fila (`.tag-badge`) | 9 | **4** |
| encabezado de grupo | 8 | **4** |
| navegación (chips → columna) | 5 | 14 |
| otros | 9 | **5** |
| título de fila — justifiable, no se toca | 7 | 7 |
| importe de fila — a la derecha, no se toca | 7 | 7 |
| feed de movimientos | 9 | 9 |
| estado de fila | 7 | 7 |
| acciones de la barra | 2 | 2 |
| rail y topbar | 11 | 12 |

La fila de navegación sube de 5 a 14 porque la columna tiene 14 nodos de texto
propios (5 rótulos, 4 subtotales, 5 botones) y antes los chips eran 5. No es
un retroceso: son 5 controles que ahora también informan y además tienen su
botón de alta. Los "otros" que bajan de 9 a 5 son los `.btn-quick-add-*` que
dejaban de estar en el encabezado de grupo.

Los 6 que quedan de la tira son `#monthGastosCount` (86.2px) y
`#paidPercentBadge` (108.5px) dentro de `.ledger-paid-line`, y
`#monthBalanceNeto` (41.2px) y `#monthBalanceStatusLabel` (54.9px) dentro de
`.ledger-balance-line`: la métrica mide "centro de este texto vs centro del
renglón", y en un renglón de tres piezas —base, carril, resultado— eso NO puede
dar cero sin destruir la lectura de la fracción. Medido aparte: el renglón
completo mide 301.9px dentro de una celda de 301.9px, **desvío 0**, y las cinco
celdas tienen desvío 0. Es decir: la tira está centrada; la métrica sigue
listando las piezas porque son piezas, no renglones.

### Desalineación vertical (`shot.mjs`)

0 de 93 → 0 de 99 nodos. Sin cambio, como debía.

### Lo que se verificó a mano y no cubre ninguna suite

- La columna y el encabezado dicen lo mismo en los 4 casos: sin filtro, con
  buscador (`"1 de 3"`, `"0 de 2"` idénticos en los dos lados), con el filtro
  del feed (`"2 de 3"`), y tras agregar desde la columna.
- El alta desde la columna abre el modal con la sección ya elegida
  (`budgetSection === 'personales'`), y escribir + enviar actualiza conteo,
  subtotal y filas.
- `activarSeccion()`: con la página de 1613px y 15 filas de Extras, apagar las
  tres primeras deja Extras en `y=233.2`, debajo de la barra (`bottom:
  233.2`), dentro del viewport.
- Los cinco botones de alta son idénticos: `background: rgb(242,242,245)`,
  `color: rgb(29,29,31)`, `font-weight: 600`, `height: 26px`.
- A 1024px, 833px y 640px: las cinco entradas visibles, los cinco botones de
  alta visibles, `documentElement.scrollWidth === clientWidth` (sin scroll
  horizontal) y el drawer del rail sigue en 236px `position: fixed`.
- El renglón del buscador mide 37px con y sin "Abono"/"Gasto"
  (`diag-railrow.mjs`), en Administrador y en Solo Lectura: los 110.1px de las
  acciones entran en el aire que ya estaba y la barra no crece en ningún rol.
- La tira entra en una línea a **1440** y a **1024**; a 1280 se parte en dos
  (`diag-responsive.mjs`, `filasTira: 2`, barra 185.2px). Eso **no** es una
  regresión de esta corrección, medido con `diag-1280.mjs`:

  | a 1280 | filas | barra | `mainScrollHeight` |
  | --- | --- | --- | --- |
  | 200px + pista 72px + acciones en la tira (T2-T5) | 2 | 185.2px | 926px |
  | 200px + pista 32px + acciones abajo | 2 | 185.2px | 926px |
  | 168px + pista 32px + acciones abajo (T6b) | 2 | 185.2px | 926px |

  Idéntico en las tres. A 1280 la columna del contenido da 861px contra los
  1049.8px que la tira necesita: no entra en ningún ancho de columna que se
  pueda usar sin recortar nombres. A 833, 640, 480 y 375 se parte por lo
  mismo, y es lo que la propia hoja declara preferible. Sin scroll horizontal
  en ninguno de los siete anchos, y con cero recortes de nombre y cero
  desbordes de botón de alta en todos ellos.

  ### ESTE PÁRRAFO QUEDÓ MAL Y T7 LO CAMBIÓ

  Lo de arriba estaba bien **con la columna puesta** y por eso era
  inescapable: a 1280 la columna se comía 168px y el contenido daba 861px. La
  conclusión que el doc sacaba —"no entra en ningún ancho de columna que se
  pueda usar"— era correcta y la respuesta igual estaba equivocada, porque
  el ancho de la columna no era la variable que había que mover: era **dónde
  la columna deja de existir**.

  Lo que faltaba era la segunda mitad de la frase: a 1280 la tira no entra
  **con la columna**, y sí entra **sin la columna**, porque sin la columna el
  contenido da 1029px contra 883.8px necesarios. T7 baja la columna a banda
  horizontal en 1440px y a 1280 la barra tiene **1 renglón, 125.9px y +49.2px
  de holgura**. Las dos mitades eran ciertas y el doc sólo había medido una.

  Y el mismo razonamiento deja escrita la regla que faltó: una pieza que no
  entra NO se arregla siempre angostándola. A veces se arregla dejando de
  estar presente en el eje en el que no cabe.

## T7 — El breakpoint de la columna de secciones, 1440px

### Qué se cambió

`css/styles.css`, §19 partido en dos bloques. Antes: un `@media (max-width:
1024px)` que hacía dos cosas distintas con un mismo número.

| | antes | después |
| --- | --- | --- |
| `.section-rail` y sus reglas de banda | en el bloque de 1024 | **§19a, `@media (max-width: 1440px)`** |
| `.app-layout` | `minmax(0,1fr)` en 1024 | 2 columnas en §19a, 1 columna en §19b |
| drawer de `.app-sidebar` | bloque de 1024 | §19b, **1024px, sin cambios** |
| `.app-sidebar` en la retícula | — | `grid-row: 1 / 3` en §19a |

Las reglas de la columna están **sólo** en §19a. Si quedaran también en §19b,
ganarían o perderían contra las de §19a según el orden y el resultado sería un
comportamiento distinto en 1025-1440 que en ≤1024 — el bug entero, en otra
forma—. Por eso §19b no tiene ni una regla de `.section-rail` que no sea el
reset de `grid-column`/`grid-row`.

Dos reglas de la retícula que la banda necesita y que no son obvias:

- **`.app-sidebar { grid-row: 1 / 3 }`.** Sin esto la banda pagaba 900px de
  alto: la fila 1 se dimensiona al ítem más alto, que es el rail con
  `height: 100vh`, y el documento pasaba de 915px a **1815px** en 1440. Al
  cruzar las dos filas, los 100vh caen sobre banda + contenido y no inflan
  ninguna: vuelve a 1011px.
- **`.section-rail` y `.app-main-area` con `grid-column`/`grid-row`
  explícitos.** El orden en el DOM es sidebar, section-rail, app-main-area, y
  el reparto automático los pondría en (1,1), (1,2) y (2,1) — con el
  contenido debajo del rail en vez de al lado. A ≤1024 se deshacen.

### Los cuatro números

| | valor |
| --- | --- |
| breakpoint de la columna de secciones | **1440px** (`@media (max-width: 1440px)`) |
| holgura de la tira, lado 3 columnas (1441px, el más estrecho que las tiene) | **+42.2px** |
| holgura de la tira, lado banda (1440px, el más ancho que las tiene) | **+209.2px** |
| holgura de la banda en el peor caso de datos medido (1366px) | **+135.2px** |

El mínimo que dejaría 24px del lado de las tres columnas es 1423. Se usa 1440
porque es el ancho de referencia del proyecto y porque bajar a 1423 no compra
nada: del lado de la banda sobran +209.2px.

### Barrido completo (16 anchos, `diag-breakpoint.mjs`)

| ventana | filas | disponible | necesario | holgura | scrollX | altoDoc | modo | barra |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1920 | 1 | 1224 | 883.8 | +340.2 | 0 | 915 | columna | 125.9 |
| 1600 | 1 | 1085 | 883.8 | +201.2 | 0 | 915 | columna | 125.9 |
| 1520 | 1 | 1005 | 883.8 | +121.2 | 0 | 915 | columna | 125.9 |
| 1440 | 1 | 1093 | 883.8 | +209.2 | 0 | 1011 | banda | 125.9 |
| 1439 | 1 | 1092 | 883.8 | +208.2 | 0 | 1011 | banda | 125.9 |
| 1400 | 1 | 1053 | 883.8 | +169.2 | 0 | 1011 | banda | 125.9 |
| **1366** | **1** | 1019 | 883.8 | **+135.2** | 0 | 1011 | banda | 125.9 |
| 1280 | 1 | 933 | 883.8 | +49.2 | 0 | 1011 | banda | 125.9 |
| 1200 | 2 | 853 | 883.8 | −30.8 | 0 | 1070 | banda | 185.2 |
| 1100 | 2 | 753 | 883.8 | −130.8 | 0 | 1070 | banda | 185.2 |
| 1025 | 2 | 678 | 883.8 | −205.8 | 0 | 1090 | banda | 204.8 |
| 1024 | 1 | 945 | 883.8 | +61.2 | 0 | 1011 | banda | 125.9 |
| 900 | 2 | 821 | 883.8 | −62.8 | 0 | 1062 | banda | 177.2 |
| 768 | 2 | 689 | 804.7 | −115.7 | 0 | 1090 | banda | 204.3 |
| 640 | 2 | 577 | 804.7 | −227.7 | 0 | 1301 | banda | 223.9 |
| 480 | 3 | 417 | 804.7 | −387.7 | 0 | 1436 | banda | 271.5 |

Cero texto recortado, cero bloques desbordados y `scrollWidth - clientWidth = 0`
en los dieciséis. Idéntico con la ventana en 768px de alto (el monitor del
usuario): como la barra de scroll vertical está presente en los dos casos, los
anchos no se mueven.

**Rango con la barra en un renglón: 1255-1920.** Antes de T7 era 1398-1920 en
los anchos de escritorio, con 1366, 1280, 1200, 1100 y 1025 rotos.

### La página desplegada

`https://adrianhola3.github.io/GastosMensuales/` medida con el mismo
instrumento. **Sin** la hoja nueva, los 16 anchos coinciden celda por celda con
la línea base local — el bug está vivo y el arnés es fiel: 1366 da 2 renglones,
185.2px y `altoDoc` 974.

Para medir el arreglo **sin redesplegar** hay que servir la hoja local en la
petición que la página real hace (`Fetch.fulfillRequest` sobre `*styles.css*`),
y con eso los 16 anchos vuelven a coincidir celda por celda con la tabla de
arriba. Un `<style>` inyectado **no sirve**: una media query no suma
especificidad, así que antes del `<link>` de la app las reglas nuevas pierden
contra la base de tres columnas, y después pierden contra el bloque de 1024 ya
desplegado (medido: `main` de 1009px a 773px en 1024, y la banda desbordando
732px dentro de 649px a 900).

### Lo que T7 NO arregla, y no puede

**1200, 1100 y 1025 siguen con la barra partida.** Es aritmética, no un descuido:
con el drawer de 1024px congelado y el rail de 236px en flujo hasta ahí, la
columna del contenido nunca pasa de `ventana − 251 − 96`. Para 24px de aire
hace falta 1255px de ventana. Cerrar ese rango exige tocar el rail o el padding
de `.main-content`, y ninguna de las dos cosas se pidió.

**La columna de 168px no aparece en 1366, 1280 ni 1440.** Es el precio de que
la barra no se parta, y es el mismo precio en cualquier solución: mientras la
columna exista, el contenido pierde 168px y la tira deja de entrar. Las
pantallas donde sí se ve la columna son 1512, 1536, 1600, 1728 y 1920. Si eso
no alcanza, la respuesta no es un número más bajo —que devuelve la barra
partida— sino la que este doc ya descartó dos veces: bajar la columna de 168px.

### Peor caso de datos

Los 883.8px son el ancho de la tira con la fixture `baseline`. Inflando los
textos de las cinco celdas al máximo que la propia hoja declara
(`S/ 12,345.67`, punto 4a) la tira necesita **976.5px**:

| | fixture | +importes | +conteos |
| --- | --- | --- | --- |
| 1440px | 883.8 / **+209.2** | 964.2 / +128.8 | 976.5 / **+116.5** |
| 1366px | 883.8 / +135.2 | 964.2 / +54.8 | 976.5 / **+42.5** |

En banda la barra aguanta los dos casos con aire. En columna **no**: a 1441px
con importes al máximo sería −50.5px y se partiría. O sea que la columna sólo es
robusta con la fixture de prueba; con importes de cinco dígitos necesita
ventana ≥ 1516. Antes de T7 eso era cierto en todo el rango de escritorio; ahora
sólo en 1441-1515, y la banda cubre el resto.
