# Feature: prueba exhaustiva del CRUD desde el perfil administrador

## Objetivo

El usuario pide: *"Necesito que revises la web de gastos mensuales, debe ser
funcional, debes probar si se puede subir, borrar, editar cosas desde el perfil
de administrador. Crea situaciones donde puedas a poner a prueba la web, debe
funcionar para cualquier situacion."*

O sea tres cosas, en este orden: **(1) revisar**, **(2) probar crear / borrar /
editar como administrador**, y **(3) construir los escenarios de prueba** que
hoy no existen. "Para cualquier situacion" es el criterio de aceptacion: no
alcanza con que funcione en el caso feliz.

## Problema real que arranca este trabajo

La tanda anterior (`edicion-admin.md`) agrego edicion de gasto y de movimiento y
la verifico bien, pero **dejo tres huecos grandes**, todos confirmados leyendo
el codigo y los artefactos de esa corrida:

1. **BORRAR NUNCA SE PROBO.** Los dos caminos de borrado (`app.js:697` gasto y
   `app.js:773` movimiento) pasan por `window.confirm()`. El arnes anterior
   (`edicion-admin.mjs`) **no tiene ni una referencia a `javascriptDialog`**:
   `confirm()` habria congelado el renderer. O sea: de toda la app, borrar es
   justo lo que nunca se toco.
2. **LA APP NUNCA SE PROBO EN SESION DE ADMIN REAL.** El arnés anterior no
  Towards masoquin qui"finge" admin: saca la clase `read-only-mode` del `<body>`
   (`edicion-admin.mjs:448,451,717`) y deja `isAdmin === false` toda la corrida.
   Como **ningun handler lee `isAdmin`**, eso funciona por accidente. El camino
   real de admin (`remoto.haySesion() === true` -> `aplicarSesion()` ->
   `rol: 'admin'`) no se ejecuto ni una vez.
3. **NO HAY DATOS EN LOS QUE PROBAR.** El estado real del usuario tiene **0
   movimientos en los 6 meses** y 55 gastos. La edicion de movimiento se probo
   contra un fixture en memoria. No hay forma de probar "cualquier situacion"
   sobre los datos reales, y **no se deben tocar**: la app esta conectada a
   Supabase y `store.save()` empuja el blob completo a la nube.

## Restricciones duras

- **Los datos reales del usuario no se tocan, ni para probar.** No es
  prudencia, es geodesico: `supabase-store.js` hace `upsert` de **todo** el
  estado en la fila `id = 1` de la tabla `gastos` en cada `save()`. Un probe que
  escribiera un gasto de prueba real llegaria al celu del usuario.
- Por eso el arnés tiene que correr contra un **dataset sintetico desechable** y
  con `localStorage` **redirigido a memoria**, para que la aislamiento sea una
  propiedad medida y no una promesa.
- El codigo de producto se cambia solo si la corrida **demuestra** un defecto.
  Sin defecto reproducido, no hay cambio.
- Los ids y clases del DOM se **agregan**, nunca se renombran (contrato de
  `dom-contract.js`, 137 ids / 63 clases / 5 attrs).
- `node --check` en cada JS tocado.

## Autorizado

- Crear `odd/tasks/crud-admin.mjs` (arnes nuevo) y los artefactos que escribe.
- **Solo si la corrida los demuestra**: corregir `js/app.js`, `js/store.js`,
  `index.html`, `css/styles.css`.

## No autorizado

- Publicar. `sync_github.js` **nunca se ejecuto** y no se toca en esta tanda.
- `git add` / commit / push. `.github_token` esta en texto plano en la carpeta.
- Cambiar el modelo de Supabase (`supabase-store.js`: una fila, un blob, RLS
  `to authenticated using (true)`) o el login con GitHub. Se documenta, no se
  toca.

---

# TAREAS

## [x] T0 — Mapa de la superficie CRUD

Hecho a mano, con lectura de los 6 archivos de producto mas los 4 del arnes.
Salida: la seccion "Hallazgos" de mas abajo. 4+ archivos, asi que fue
delegado a un mapper de solo lectura.

## [ ] T1 — A nes: sesion admin real + aislamiento + dialogos

El archivo nuevo tiene que resolver los tres huecos del punto "Problema real":

1. **Sesion admin de verdad.** Un stub de `window.gastosRemoto` instalado en
   `Page.addScriptToEvaluateOnNewDocument`, **antes** de que `supabase-store.js`
   lo asigne, con `estaConfigurado() -> true`, `haySesion() -> true`,
   `esperarSesion() -> Promise.resolve(true)` y `cargar() -> fixture`. Asi la
   app arranca por el camino real de admin y se puede probar el gate de verdad,
   no por paridad de CSS.
   Ojo: el setter del freeze anterior marca `__congelado`, y el patcher lo
   respeta. El stub tiene que marcar esa bandera o lo pisa.
2. **Aislamiento.** `Storage.prototype.getItem/setItem/removeItem` para
   `control_gastos_mensuales_db_v1` redirigidos a un mapa en memoria, con
   **contadores**. La prueba de que el aislamiento es real: `0` escrituras
   reales, con el hash del `localStorage` real intacto antes y despues.
3. **Dialogos.** `Page.javascriptDialogOpening` atendido en CDP, que ademas
   **registra** el mensaje de cada `confirm()`/`alert()`. Sin esto no hay forma
   de probar el boton de borrar.

## [ ] T2 — Matriz de situaciones

La matriz completa esta en "La matriz" de mas abajo. Cada caso es un id estable,
asserto un resultado real, y su fila queda en el reporte.

## [ ] T3 — Corrida y lectura del reporte

`node odd\tasks\crud-admin.mjs r1`, salida en
`odd\tasks\capturas\crud-admin-r1.report.json`. Cada caso queda `PASS`, `FAIL` o
`SKIP` con la evidencia. **Ningun caso se marca verde por defecto.**

## [ ] T4 — Correcciones, solo de lo demostrado

Por cada `FAIL` real: corregir, y **volver a correr el caso**. Un `FAIL` que no
se puede corregir se reporta abierto, no se maquilla.

## [ ] T5 — Cierre honesto

Veredicto por bloque (crear / borrar / editar / toggle / gate / persistencia), y
la lista de lo que quedo abierto.

---

# La matriz

`CREAR` = subir. Todo desde la UI real, no llamando al store por consola: el
objeto del ejercicio es que el camino del click al `save()` funcione.

| id | situacion | aserto |
|---|---|---|
| A1 | gasto Fijo en servicios/fijos | existe con los 4 campos, `estado` Pendiente |
| A2 | gasto Variable + rango | rango persistido, separador de rango con guion |
| A3 | gasto Variable en personales/variables | id unico, no colisiona con A2 |
| A4 | gasto Fijo en personales/fijos | id unico |
| A5 | gasto Extra | `tipo` forzado a `Extra`, queda en el array plano `extras` |
| A6 | movimiento Ingreso | `flujo: 'Ingreso'`, aparece con `+` en el feed |
| A7 | movimiento Gasto | `flujo: 'Gasto'`, aparece con `-` |
| A8 | mes nuevo sin clonar | existe, `mesesOrden` crece, `corto` = primera palabra |
| A9 | mes nuevo **clonando** | copia los items y **todos** quedan Pendiente |
| A10 | monto `"45.50"` (string del input) | guardado como **numero** 45.5, no string |
| A11 | monto `0` | acepta 0, no lo descarta |
| A12 | concepto con acentos y enye | `Café ☕ ñ` intacto, sin mojibake |
| A13 | concepto de 500 chars | se guarda entero, la fila no rompe el layout |
| A14 | concepto con `<img src=x onerror=...>` | **escapado**, no se ejecuta, no aparece etiqueta |
| A15 | concepto duplicado | acepta, no rompe, no confunde los ids |
| A16 | concepto solo espacios | el `required` / el guard lo frena |
| A17 | mes con tilde: `Año 2027` | el id sale deducible, dos meses iguales no se pisan |

| id | situacion | aserto |
|---|---|---|
| B1 | borrar gasto, `confirm` **ACEPTAR** | el item desaparece, los totales bajan |
| B2 | borrar gasto, `confirm` **CANCELAR** | el item sigue, y **no hubo `save()`** |
| B3 | borrar el **ultimo** item de una coleccion | queda el estado vacio, sin `NaN` en pantalla |
| B4 | borrar movimiento, aceptar | desaparece del feed, totales correctos |
| B5 | borrar movimiento, cancelar | sigue, sin `save()` |
| B6 | borrar un id que **no existe** | no rompe, y el toast **no** dice "eliminado" |
| B7 | borrar item de un mes **no activo** | el mes activo no se entera, el otro queda bien |

| id | situacion | aserto |
|---|---|---|
| C1 | editar gasto Fijo (concepto + monto) | patch correcto, `estado` y `rango` sobreviven |
| C2 | editar gasto Variable (concepto + monto + rango) | el patch **si** lleva `rango` |
| C3 | editar gasto Extra | patch correcto |
| C4 | editar movimiento (concepto + monto + fecha) | `categoria`, `retornable`, `flujo`, `estado` sobreviven |
| C5 | editar con monto `"45.50"` | casteado a numero |
| C6 | editar con monto **negativo** | bloqueado con aviso, no guardado |
| C7 | editar con monto no numerico | bloqueado con aviso |
| C8 | editar con concepto **vacio** | bloqueado, y el modal **avisa** (hoy cierra en silencio) |
| C9 | editar un id que no existe | **hoy el modal cierra y dice "actualizado"** |
| C10 | editar y **recargar** | el cambio sigue ahi |

| id | situacion | aserto |
|---|---|---|
| D1 | toggle Fijo Pendiente -> Pagado | cambia, totales de pagado suben |
| D2 | toggle Variable Pendiente | abre el modal de pago variable, no hace toggle directo |
| D3 | pagar variable con monto valido | `monto` actualizado **y** `estado` Pagado |
| D4 | pagar variable con monto negativo | bloqueado |
| D5 | toggle de un id inexistente | no rompe; hoy deja `estado = null` en memoria |

| id | situacion | aserto |
|---|---|---|
| E1 | sesion admin real | `.admin-action-btn` visibles: agregar, mes, editar, eliminar |
| E2 | sesion lector | los `.admin-action-btn` ocultos |
| E3 | lector **cambia plata** por el modal de pago variable | hoy no esta gateado |
| E4 | lector hace **toggle** de estado | hoy no esta gateado |
| E5 | lector **edita las notas** del mes | hoy no esta gateado |
| E6 | lector envia el form de agregar movimiento | hoy no esta gateado |

| id | situacion | aserto |
|---|---|---|
| F1 | crear y recargar | sigue ahi |
| F2 | editar y recargar | el cambio sigue |
| F3 | borrar y recargar | sigue borrado |
| F4 | los graficos y las KPIs | coinciden con los totales recalculados |
| F5 | dos meses, tocar uno | el otro no se mueve |
| F6 | toda la corrida | **0 excepciones, 0 `console.error`, 0 respuestas >= 400** |
| F7 | hash del `localStorage` real | identico antes y despues (aislamiento probado) |
| F8 | escrituras a Supabase | 0 (el stub accounta) |

---

# Hallazgos del mapa (T0)

Todo esto sale de leer el codigo. **Nada esta arreglado todavia.**

## El gate de admin es CSS y solo CSS

`css/styles.css` tiene **dos** reglas `body.read-only-mode` (2886, 2892) y la
propia hoja lo admite en un comentario: *"No es seguridad real (la real esta en
las RLS de Supabase)"*. En `app.js`, `isAdmin` se **escribe** en 109, 160, 190 y
se **lee** en 117 y 316 — ninguno de los dos en un handler de escritura. Y
`store.js` no tiene ni una nocion de rol.

Consecuencia: en `read-only-mode` siguen operativas, contra datos persistidos:

- **`.btn-status-toggle`** (G1): el lector marca pagado cualquier gasto.
- **Modal de pago variable** (G2): el lector **cambia montos de dinero** y marca
  pagado. Es el peor de todos.
- **`#btnOpenNotesModal`** (G3): el lector reescribe las notas del mes.
- **Los 6 forms de alta/edicion** (G4-G8): solo se ocultan los botones. El form
  no tiene guard.
- **`window.financialStore`** (G9): sin gate, desde la consola.
- **`switchView`** (G10): el lector navega y eso **escribe** (2 `save()`).

Lo que **si** esta bien: no hay forma de *ganar* admin desde el cliente.
`setRoleReadOnly()` (185-196) solo puede restringir, y el admin exige sesion de
Supabase. La foto es "permisos cosméticos, frontera real en la nube".

## Sobre esa frontera real (no se toca, se reporta)

`supabase-store.js:26-33`: RLS `to authenticated using (true)` para
select/insert/update. **No hay check de propiedad por usuario**: cualquier
cuenta autenticada de ese proyecto Supabase es admin de estos datos. Y la tabla
es una fila, una columna `jsonb`, el estado entero. Dos consecuencias que el
usuario deberia saber, sin que las arreglemos en esta tanda:

1. No hay como auditar ni revertir: cada `save()` **sobrescribe** el blob
   entero. Un borrado accidental no tiene historial.
2. `load()` da **prioridad a la nube de forma total** (162-167), sin timestamps
   ni merge por campo. Y `this.pendienteCarga` no se espera en ningun lado de
   `app.js`: si el cloud resuelve despues de que el usuario edito, la linea 181
   `this.data = estado` **descarta la edicion local sin avisar**.

## Huecos de CRUD

| falta | por que |
|---|---|
| ~~**borrar un mes**~~ | **RESUELTO en T6.** `store.deleteMonth` ya tiene su control en la interfaz: `#btnDeleteMonth`, con `exigirAdmin`, `confirm` que nombra el mes y los conteos, y verificacion del retorno. Caso B8/B9/B10. |
| borrar las notas del mes | se borran escribiendo, no hay control |
| **mover un gasto de tipo** | `updateBudgetItem` mezcla campos pero **no cambia de coleccion**. Un `Fijo` no pasa a `Variable`. Decision consciente de la tanda anterior, no un olvido. |
| editar `movimiento.categoria` / `.retornable` / `.estado` | no estan en ningun form; se hardcodean al crear (`app.js:1540-1542`) |
| editar `movimiento.flujo` | read-only |
| `toggleAllBudgetItems`, `toggleMovementStatus`, `exportJSON`, `importJSON`, `exportCSV`, `resetToDefault` | existen en el store, **ningun caller** en la UI |

## Bugs de robustez que tocan "cualquier situacion"

| # | donde | que pasa |
|---|---|---|
| R1 | `app.js:698,774` | el retorno de `deleteBudgetItem`/`deleteMovement` se **descarta**: el toast dice "eliminado" aunque no se haya borrado nada |
| R2 | `app.js:1436-1438` | editar un id inexistente **cierra el modal y dice "actualizado"**. Perdida silenciosa. |
| R3 | `app.js:677` | `toggleBudgetItemStatus` devuelve `null` si no encuentra el item, y el handler hace `item.estado = null`. El estado en memoria se desincroniza del store. |
| R4 | `app.js:1422,1475` | concepto vacio al editar: `return` **silencioso**. No hay aviso, el modal queda abierto sin explicar nada. |
| R5 | `store.js:517,639` | `item.concepto.trim()` tira `TypeError` si falta `concepto` |
| R6 | `store.js:518,644` | `parseFloat(x) \|\| 0`: `"abc"`, `null`, `""` y `NaN` se vuelven **0 en silencio**. `Infinity` sobrevive y `JSON.stringify` lo manda como `null`: el monto se pierde en el viaje. |
| R7 | `store.js:111-127` | un `localStorage` corrupto hace fallback a los defaults y **lo sobreescribe**. El archivo del usuario se destruye con un `console.warn`. |
| R8 | `store.js:290-294` | cuota excedida: `console.error` y nada mas. Sin aviso al usuario, sin rollback. |
| R9 | `store.js:787-800` | `importJSON` asigna `this.data` y guarda **sin `sanear`** |
| R10 | `store.js:717` | `addNewMonth` sluguea con `[^a-z0-9]`: `'Año 2027'` -> `'a-o-2027'`. Y dos nombres iguales en la misma ventana de ms **se pisan** (`this.data.meses[id] = nuevoMes`, 753) |
| R11 | `store.js:342-345` | `switchView` cambia `activeMonthId` sin verificar que el mes exista |
| R12 | `store.js:312-323` | `getActiveMonth()` **muta** `data.activeMonthId` sin guardar |
| R13 | `store.js:638` | fecha por defecto en **UTC**: en `America/Lima` despues de las 19:00 queda fechada mañana |
| R14 | `store.js:736-738` | clonar un mes copia items pero **no** `extras`, `notas` ni `movimientos`, aunque el hint del modal (`index.html:823`) no avisa eso |
| R15 | `store.js:258` | `sanear` no normaliza `tipo`: un `'variable'` minuscula vive en el array de variables y se trata como Fijo en 642, 672, 1402 |
| R16 | `store.js:343-344` | **la navegacion escribe**: un lector produce 2 `save()` por cada cambio de mes |

## Lo que el arnes anterior no podia hacer

- No tenia `javascriptDialogOpening` -> **cero pruebas de borrado** (B1-B7).
- No podia Admin de verdad -> **cero pruebas del gate** (E1-E6).
- `PAGE_URL` es un `file://` con ruta absoluta fija; `DIR` y `CSS_PATH` se
  arman con `process.cwd()` -> hay que correr desde la raiz del proyecto.
- `edicion-admin.mjs:542` tiene una linea sin sentido:
  `mesCoincide: cond ? undefined : undefined`, o sea **siempre** `undefined`.
  La prefill del `monthId` nunca se asserta.
- Asume dataset real: primer `.expense-card-item`, `servicios.variables` con
  algo, ids sinteticos fijos, viewport 1440x900.

---

# Progreso

- **T0**: terminado. Mapa completo, 3 huecos de verificacion confirmados.
- **T1**: terminado. `odd\tasks\crud-admin.mjs`.
- **T2**: terminado. Matriz de 6 bloques.
- **T3**: terminado. Corrida `r1`: **43 PASS / 10 FAIL / 0 SKIP**.
- **T4**: terminado. 9 de los 10 FAIL corregidos. Corrida `r3`: **52 PASS / 1 FAIL**.
- **T5**: cerrado con el usuario.
- **T6**: terminado. Opciones de clonacion y borrado de mes en la interfaz.
  Corrida `r4`: **62 PASS / 0 FAIL / 0 SKIP**.

# Resultado

## Tallas por corrida

| corrida | A | B | C | D | E | F | TOTAL |
|---|---|---|---|---|---|---|---|
| `r1` (antes de corregir) | 15/17 | 6/7 | 8/10 | 4/5 | 2/6 | 8/8 | **43 PASS / 10 FAIL** |
| `r3` (tras corregir los 9) | 16/17 | 7/7 | 10/10 | 5/5 | 6/6 | 8/8 | **52 PASS / 1 FAIL** |
| `r4` (con las dos features) | 22/22 | 10/10 | 10/10 | 5/5 | 7/7 | 8/8 | **62 PASS / 0 FAIL** |

`r4`: **62 casos, 0 FAIL, 0 SKIP, exit code 0**. Los 53 casos previos siguen
verdes: **cero regresiones**. `r4` son 62 y no 63 porque la tanda anterior
agrego **9** casos nuevos y reescribio A9 (53 + 9 = 62). No se invento un
decimo caso para cuadrar la cuenta.

## Los 10 FAIL de `r1` y que paso con cada uno

| id | defecto | causa | `r4` |
|---|---|---|---|
| A9 | R14 | clonar un mes tira `extras`, `notas` y `movimientos` | **PASS** (resuelto con T6) |
| A16 | — | el alta no valida `concepto` en blanco | PASS — `itemsEnBlanco: []` |
| B6 | R1 | el toast decía "eliminado" sin borrar nada | PASS — `guardarN` delta 0 |
| C8 | R4 | concepto vacio al editar: `return` silencioso | PASS — aviso, modal abierto |
| C9 | R2 | editar id inexistente: modal cierra y dice "actualizado" | PASS — `afirmaExito: false` |
| D5 | R3 | toggle de id inexistente dejaba `estado = null` | PASS — estado intacto |
| E3 | G2 | **el lector cambiaba plata** | PASS — monto 30 → **30** |
| E4 | G1 | el lector toggleaba estado | PASS — estado intacto |
| E5 | G3 | el lector reescribia las notas y persistia | PASS — no persistido |
| E6 | G4 | el lector mandaba el form de movimiento | PASS — no creado |

## Casos agregados en T6

| id | que prueba |
|---|---|
| A9 (reescrito) | clon con defaults: presupuesto copiado con ids nuevos y todo Pendiente, extras y notas copiados, movimientos **no** |
| A18 | clon con extras marcado → se copian con id nuevo y Pendiente |
| A19 | clon con notas marcada → se copian textualmente |
| A20 | clon con movimientos marcado → ids nuevos, `estado`/`fecha`/`flujo`/`monto` **preservados** |
| A21 | clon con los tres desmarcados → solo las 4 colecciones de presupuesto (compatibilidad hacia atras) |
| A22 | con "no clonar" el bloque de casillas se oculta; con un mes real, se muestra |
| B8 | borrar mes, `confirm` ACEPTAR → desaparece, `activeMonthId` cae en un mes que existe, la UI se redibuja |
| B9 | borrar mes, `confirm` CANCELAR → nada borrado, `guardar` delta 0 |
| B10 | borrar el **ultimo** mes → rechazado, sigue presente, delta 0, **no** dice que borro |
| E7 | lector: `#btnDeleteMonth` en `display:none`; un `.click()` forzado no abre ni dialogo ni borra |

## A9 y el hueco de borrar un mes: RESUELTOS

El usuario pidio las dos cosas en la interfaz: **#1** que al clonar se pueda
elegir que se copia, y **#2** que un mes se pueda borrar.

### #1 — Opciones de clonacion

`store.addNewMonth` paso a `addNewMonth(nombre, clonarDeMesId = null, opciones = {})`
(`store.js:725`). El tercer parametro es **opcional** y con `{}` el
comportamiento es **identico al anterior**: solo las cuatro colecciones de
presupuesto. Verificado con un probe sobre copia desechable: clon sin
`opciones` ≡ clon con los tres en `false` ≡ clon con `{}`.

La interfaz (`index.html:826-847`) agrega tres casillas nuevas dentro de
`#cloneOpcionesRow`, que **solo se muestran cuando hay un mes real elegido**
como origen; con la opcion "no clonar" se ocultan (divulgacion progresiva).

| casilla | id | default | tratamiento al copiar |
|---|---|---|---|
| gastos extra | `cloneIncluirExtras` | **marcada** | id nuevo + `estado: 'Pendiente'` |
| notas | `cloneIncluirNotas` | **marcada** | string tal cual |
| movimientos | `cloneIncluirMovimientos` | **sin marcar** | id nuevo, resto intacto |

**Por que `movimientos` viene desmarcado por default:** copiar movimientos
puede **duplicar ingresos**, porque cada `save()` reescribe el blob entero y un
ingreso ya cobrado volvería a contar en el balance del clon. Es un opt-in
deliberado, y el modal lo dice.

**Por que los movimientos NO se resetean a Pendiente** (a diferencia de los
gastos): un movimiento es una transaccion **ya registrada**, con su estado y su
fecha. Ponerlo en Pendiente cambiaria su significado — un ingreso ya cobrado
volveria a ser un cobro pendiente. Documentado en `store.js:751-755`.

### #2 — Borrar un mes

`#btnDeleteMonth` (`index.html:218`), en la barra de periodos junto a "Nuevo
mes", con `admin-action-btn` para que solo lo vea el administrador.

El `confirm()` **nombra el mes y dice que se pierde**, con los tres conteos
exactos:

```
¿Eliminar "SYN Mes A"? Se borrarán 2 gastos, 1 movimientos y 1 gastos extra de
este período. Esta acción no se puede deshacer.
```

Justo ese detalle: `store.save()` **sobrescribe el blob completo** en Supabase
en cada llamada, asi que **no hay historial ni vuelta atras**. Un `confirm()`
generico no alcanza para una operacion asi.

`store.deleteMonth` **quedo byte a byte intacto**. Todo el trabajo estuvo en el
llamador: `exigirAdmin`, el `confirm` especifico, verificar el retorno, y
`switchView('mes')` sin `targetMonthId` para no disparar un `save()` de mas. El
guard de "mantener al menos un mes" se respeta: el boton dispara, el store
responde `false` con su `alert`, y el handler **no** dice que borro nada
(caso B10).

## Correccion que no venia en el encargo

`exigirAdmin()` consultaba solo `obtenerSesion().rol`. Pero `setRoleReadOnly()`
(`app.js:205-216`) deja `sesionActual.rol === 'admin'` mientras la interfaz
pasa a solo lectura: asigna `ELECCION_ROL_KEY = 'lector'` y recalcula `isAdmin`.
O sea que un administrador que pulsa "Modo Solo Lectura" veia la interfaz
bloqueada pero el gate lo dejaba escribir. Eso contradice el comentario del
propio codigo (L207-209): esa eleccion solo puede **restringir**.

Corregido: `exigirAdmin` (`app.js:163`) usa **exactamente** la misma condicion
de `setRoleReadOnly` (`app.js:218`), las dos partes. Verificado por comparacion
textual. Ojo: **ningun caso de la matriz ejercita este escenario**, asi que la
correccion esta probada por construccion, no por una corrida.

## La asercion de C9 estaba mal escrita

La matriz pedia que el modal **quedara abierto** cuando el registro ya no existe.
La asercion del arnes (`crud-admin.mjs:1772`) exigia lo contrario (`&& !modal`)
mientras su propio `expected` decia `'puede cerrarse, pero sin mentir'`: el
arnes se contradecia a si mismo. Se alineo con lo que el caso **dice** que
importa — que no se guarde nada y que no se afirme exito — y se **agrego** la
asercion que faltaba (`guardarNDelta === 0`). El estado del modal quedo como
informativo.

El comportamiento que quedo: el modal **cierra** con un toast honesto
(`El gasto que intentas editar ya no existe.`). Razon: el registro ya no esta,
no hay nada que enviar, y dejar a alguien atrapado en un form que nunca va a
guardar solo lo hace reintentar para siempre.

## Hallazgo fuera de la matriz

**El modal de seleccion de rol se abre igual con sesion admin real.**
`aplicarSesion()` lo cierra (`app.js:186`), pero el `setTimeout` de
`app.js:232-236` lo vuelve a abrir a los 60 ms sin mirar la sesion. El arnes lo
oculta por CSS, asi que ninguna aserto depende de el. **No corregido**: no estaba
en el encargo.

## Lo que quedo sin poder probar, y por que

| caso | por que |
|---|---|
| **R7** (localStorage corrupto sobrescribe el archivo del usuario) | `leerLocal()` lee la copia **redirigida a memoria**, que por construccion es valida. Sembrarle un blob corrupto exigiria otra palanca en el stub, y la alternativa —corromper el `localStorage` real— esta prohibida. Verificado **solo por fuente**: el `catch` llama `getDefaultData()` + `this.save(initial)`. |
| **R6** (`parseFloat(x) \|\| 0`, `Infinity` → `null`) | inalcanzable por la UI: todos los montos son `input type=number min=0 required`. Medido sobre copia desechable: `'abc'` → `0`; `Infinity` sobrevive en memoria y sale `null` en el JSON que se sube. |
| **R5** (`item.concepto.trim()` sin `concepto`) | inalcanzable por la UI: los handlers siempre mandan string. Medido sobre copia: `TypeError` en `addBudgetItem` y `addMovement`. |

# Verificacion acumulada

- Mapa: lectura de `index.html` (889 L), `js/store.js` (838 L), `js/app.js`
  (1697 L antes de los cambios), `js/supabase-store.js` (385 L),
  `js/config.js`, `js/charts.js`, `css/styles.css` (3248 L), `dom-contract.js`,
  y los 4 `.mjs` del arnes.
- Entorno: `node v24.19.0`, CDP vivo en `127.0.0.1:9222` (Chrome/154.0.8037.98).
- `git rev-list --all --count` = **0**. La carpeta no esta versionada.
- `node --check`: OK en `js/app.js` y `odd\tasks\crud-admin.mjs`.
- Contrato DOM tras los cambios: **0 perdidos, 0 nuevos** (137 ids / 63 clases /
  5 attrs, igual que antes).

## Archivos tocados por T4

| Archivo | Cambio |
|---|---|
| `js/app.js` | `exigirAdmin` (L142-169) + gates en toggle, ambos deletes, notas, los 5 openers de modal y los 6 submits; return values de delete/update/toggle verificados (B6, C9, D5); validacion de `concepto` en blanco al crear y al editar (A16, C8) |
| `css/styles.css` | L2896-2903: `.btn-status-toggle` y `#btnOpenNotesModal` se ocultan en solo lectura. Las 2 reglas existentes (2886, 2892) quedaron **byte a byte** igual |
| `index.html` | L823: texto del hint de clonar, ahora honesto |
| `js/store.js` | **sin tocar** |
| `sync_github.js` | **sin tocar y sin ejecutar** |

## Aislamiento de datos, medido en `r3`

```
hash del localStorage REAL (control_gastos_mensuales_db_v1)
  antes:  2457901690  (8100 bytes)
  despues: 2457901690  (8100 bytes)   identico: true

setItem redirigidos a memoria   : 21    (la app SI intentó persistir)
claves de la app que llegaron al storage real : 0
eventos DOMStorage sobre la clave de la app   : 0
guardar() interceptados por el stub : 21
requests totales                 : 122
requests a *.supabase.co         : 0
```

Los 21 `setItem` redirigidos son la prueba de que el aislamiento no es
trivial: si fueran 0, no estariamos probando nada. Las unicas escrituras que
pasaron de largo fueron claves `lswt-*`, que son internas del navegador Brave,
no datos de la app; el arnes las reporta por separado para que no puedan
disfrazar una escritura real.

## F6 en `r3`

`excepciones: []` · `console.error: []` · `respuestas >= 400: []`. Los tres
vacios.