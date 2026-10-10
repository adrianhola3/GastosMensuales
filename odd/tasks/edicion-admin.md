# Feature: edicion completa para el perfil administrador

## Objetivo

Hoy el administrador puede agregar, eliminar y marcar como pagado, pero **no puede
editar**. El usuario lo pide explicitamente: "ediciones, agregaciones y mas cosas
que solo marcar algo como pagado".

## Estado verificado (leer antes de tocar nada)

1. **Editar un gasto ya es viable sin tocar el store**:
   `store.updateBudgetItem(monthId, itemId, updatedFields)` existe y hace
   `coll[idx] = { ...coll[idx], ...updatedFields }`, ademas castea `monto` a
   float. Mergea cualquier campo.
2. **Editar un movimiento NO es viable**: `store.updateMovement` **no existe**.
   Hay que agregarlo a `store.js`, espejando la firma y el cuerpo de
   `deleteMovement(monthId, movId)`.
3. **El gate de admin es solo CSS**:
   `body.read-only-mode .admin-action-btn { display: none !important }`.
   El rol NO se puede falsear: sale de `obtenerSesion().rol === 'admin'`, que
   viene de Supabase.
4. La fila de gasto (`app.js` ~634) tiene info, toggle de estado, importe y
   boton de eliminar. La de movimiento (~741) tiene eliminar. **Ninguna tiene
   editar.**
5. `openAddBudgetModal(defaultSection, defaultSubsection)` es solo alta.

## Alcance

1. Boton de **editar gasto** en cada fila (clase `admin-action-btn`).
2. Modal de edicion de gasto, precargado, que guarda con
   `store.updateBudgetItem`.
3. Boton de **editar movimiento** en cada fila (clase `admin-action-btn`).
4. Modal de edicion de movimiento, precargado, que guarda con el nuevo
   `store.updateMovement`.
5. `store.updateMovement(monthId, movId, updatedFields)` en `store.js`.

## Seguridad de la verificacion — CRITICO

Una sonda de una tanda anterior **llego a persistir un cambio real** en los datos
del usuario: cliqueo una fila para marcarla como Pagada y eso escribio en
localStorage. Con la app conectada a Supabase, eso puede llegar a la base.

En esta tanda es OBLIGATORIO:

- Congelar toda escritura ANTES de cargar la pagina:
  `Storage.prototype.setItem` interceptado para claves `finanzas*`, mas
  `store.save` y los metodos del store, con contadores.
- Sacar un snapshot del estado (cantidad de gastos, por estado, total de egresos,
  movimientos) ANTES y DESPUES de cada prueba y **compararlos**.
- Si el snapshot difiere, abortar y reportarlo. No "restaurar": restaurar es
  otra escritura.
- NO disparar el guardado real jamas. Los formularios se llenan y se **cierran sin
  enviar**.

## Verificacion

- Los 2 botones de editar solo se ven en modo admin (comprobar en lector y en
  admin).
- Abrir el modal precarga los valores actuales del item.
- Con el store congelado, guardar produce el patch correcto y NO toca los datos.
- 0 excepciones, 0 `console.error`, 0 404.
- Contrato DOM: los ids y clases nuevos son **agregados**, nunca renombrados.
- ESC cierra los modales nuevos (el handler existente ya cubre
  `.modal-overlay.active`).
- Contraste AA del texto de los modales nuevos.
- `node --check` en los JS tocados.

---

# RESULTADO — TANDA 2026-10-03

Todo lo de arriba quedo **implementado y verificado**. La corrida final es
`node odd\tasks\edicion-admin.mjs r6`, con log en
`odd\tasks\capturas\edit-admin-r6.log` y volcado crudo en
`odd\tasks\capturas\edit-admin-r6.report.json`.

## Archivos y lineas cambiadas

| Archivo | Cambio |
|---|---|
| `js/store.js` | **L665-679**: `updateMovement(monthId, movId, updatedFields)` nuevo, entre `addMovement` y `deleteMovement` (L681). Unico archivo de JS de producto tocado. |
| `js/app.js` | L659-664 boton de editar gasto + wrapper `.item-actions`; L686-691 handler; L756 boton de editar movimiento; L762-767 handler; L1374-1493 bloque nuevo con los dos modales (abrir + submit); L1618 comentario del handler de Escape. |
| `index.html` | L704-745 `#modalEditExpense` + `#formEditExpense`; L745-786 `#modalEditMovement` + `#formEditMovement`. Insertados antes de `#modalMonthNotes`. |
| `css/styles.css` | L2002-2019 `.item-actions` y los dos `.btn-edit-*` agregados a las reglas agrupadas de tamano; L2032-2033 y L2036-2039 hover; L2571-2590 `.form-readonly-value` (nueva); L3018-3019 opacidad 1 en la media query de movimiento reducido. |

**No tocados** (verificado por `LastWriteTime`): `js/supabase-store.js`
(2026-10-01 02:00), `js/charts.js` (2026-10-03 06:45), `js/config.js`,
`sync_github.js` (2026-10-03 06:48). Este ultimo **no se ejecuto nunca**: no se
publico nada, ni siquiera con `--dry-run`.

## El codigo que se agrego a `js/store.js`

```js
  /**
   * Edita un movimiento existente.
   *
   * Misma forma que `updateBudgetItem`: se localiza por id dentro de la
   * coleccion del mes y la entrada se reemplaza por una mezcla del objeto
   * anterior con los campos nuevos, de modo que lo que el formulario no
   * envia sobrevive intacto (categoria, retornable, estado, fecha...).
   *
   * `monto` se castea a float igual que en `addMovement`: el formulario
   * entrega texto y sin esto "45.50" quedaria guardado como cadena, que
   * despues suma mal en los totales.
   */
  updateMovement(monthId, movId, updatedFields) {
    const m = this.getMonth(monthId);
    if (!m || !m.movimientos) return false;

    const idx = m.movimientos.findIndex(x => x.id === movId);
    if (idx !== -1) {
      m.movimientos[idx] = { ...m.movimientos[idx], ...updatedFields };
      if (updatedFields.monto !== undefined) {
        m.movimientos[idx].monto = parseFloat(updatedFields.monto) || 0;
      }
      this.save();
      return true;
    }
    return false;
  }
```

## Las dos rondas de mirar-ajustar

### Ronda 1 — `r3` (arranque, con dosoted de mocks rotos)

- a) Botones solo en admin: **SI**. En la sesion real de la corrida
  (`body.read-only-mode`, sin sesion de Supabase) los dos dan
  `display: none`. Sin `read-only-mode`, `display: flex`, 24px. Idéntico al boton
  de eliminar, que ya existia.
- b) Modal precarga valores reales: **SI**, pero el test comparaba mal.
- c) Editar vs eliminar se distinguen: **SI**, glifos distintos (`d` diferente,
  verificado con `getAttribute('d')`).
- d) Datos intactos: **NO SE PUDO MEDIR**. La corrida se cortó antes del snapshot
  final. SeAbortó y se reporto, sin intentar restaurar.

Tres defectos reales que salieron y se corrigieron:

1. **T3 mutaba el store vivo.** El test de `updateMovement` insertaba su fixture
   en `st.data` y lo borraba despues con `delete`. Eso dejaba el snapshot de
   memoria con hash distinto (`1481493643` -> `1976849613`) y era **ruido del
   test, no del producto**. Corregido: el fixture va dentro de la copia
   descartable.
2. **El modal comparaba contra el item equivocado.** El test buscaba un
   `Variable` en el store y cliqueaba la primera fila, que era un `Fijo`. El
   "verde" no probaba nada. Corregido: el item se toma del `data-item-id` del
   boton que se cliquea, y se agrego un caso separado para un `Variable`.
3. **Layout del modal de gasto.** `Tipo` + el hint quedaban dentro del
   `form-grid-2` y la columna derecha crecia 3 veces mas que la izquierda, con
   el hint partido en 3 lineas de 30 caracteres. Corregido moviendo `Tipo` a
   ancho completo, igual que en el modal de movimiento.

### Ronda 2 — `r6` (final)

- a) Botones solo en admin: **SI**. Con `read-only-mode`: `display:none`, ancho
  0. Sin la clase: `display:flex`, 24px. Mismo valor que el boton de eliminar en
  los dos estados.
- b) Modal precarga los valores reales: **SI**, campo por campo contra el store.
  Gasto `Fijo`: `id` igual, `Internet de casa`, `89.90`, `Fijo`, rango `""` y
  campo oculto. Gasto `Variable`: `id` igual, `30.00`, `Variable`, `20-40` y
  campo visible.
- c) Editar y eliminar se distinguen: **SI**. Lápiz (`M11.2 2.6l2.2 2.2...`) contra
  equis (`M4.5 4.5l7 7m0-7l-7 7`), 24px cada uno, y con `title` distinto.
- d) Datos intactos: **SI**. Ver abajo.

## Snapshot de datos, textual

Persistente (`localStorage`) y en memoria, con hash FNV-1c de 32 bits del JSON
completo. **La suma de los dos hashes es la misma en las dos puntas, y coincide
con el hash del texto crudo guardado en `localStorage`: la memoria no arrastro
ni un cambio.**

```
=== SNAPSHOT ANTES ===
bytesLocales: 8104
hashLocales:  1481493643
hashMemoria:  1481493643
local / memoria (identicos entre si):
  totalGastos:        55
  totalPagados:        0
  totalPendientes:    55
  totalEgresos:    3781.04
  totalMovimientos:     0
  meses:                6
  activeMonthId:  septiembre-2026
  septiembre-2026/servicios/fijos:      cantidad 5  {Pendiente: 5}  sumaMonto 387.80
  septiembre-2026/servicios/variables:  cantidad 1  {Pendiente: 1}  sumaMonto  30.00
  septiembre-2026/personales/fijos:     cantidad 2  {Pendiente: 2}  sumaMonto 153.54
  septiembre-2026/personales/variables: cantidad 1  {Pendiente: 1}  sumaMonto  45.00
  septiembre-2026/extras:               cantidad 0  {}                sumaMonto   0.00
  septiembre-2026/MOVIMIENTOS:          cantidad 0

=== SNAPSHOT DESPUES ===
bytesLocales: 8104
hashLocales:  1481493643
hashMemoria:  1481493643
local / memoria (identicos entre si):
  totalGastos:        55
  totalPagados:        0
  totalPendientes:    55
  totalEgresos:    3781.04
  totalMovimientos:     0
  meses:                6
  activeMonthId:  septiembre-2026
  septiembre-2026/servicios/fijos:      cantidad 5  {Pendiente: 5}  sumaMonto 387.80
  septiembre-2026/servicios/variables:  cantidad 1  {Pendiente: 1}  sumaMonto  30.00
  septiembre-2026/personales/fijos:     cantidad 2  {Pendiente: 2}  sumaMonto 153.54
  septiembre-2026/personales/variables: cantidad 1  {Pendiente: 1}  sumaMonto  45.00
  septiembre-2026/extras:               cantidad 0  {}                sumaMonto   0.00
  septiembre-2026/MOVIMIENTOS:          cantidad 0

=== DIFF ===
IDENTICO: 0 diferencias
```

Contadores de escritura, que es la prueba de que el bloqueo existio:

```
antes:   setItem { control_gastos_mensuales_db_v1: 1 }  remoto {}  storeSave 0
despues: setItem { control_gastos_mensuales_db_v1: 1 }  remoto {}  storeSave 2
```

`setItem` en 1 y no mas: **un unico intento de escritura en toda la corrida**, el
del arranque de la app, y fue bloqueado. `remoto` en 0: Supabase nunca fue
llamado. `storeSave` en 2 son los dos `store.save()` que dispara `switchView` al
redibujar (comportamiento preexistente, no de esta tanda) y que el `save`
congelado se trago.

## El patch que produjo el guardado congelado

`store.updateBudgetItem` se envolvio para **registrar el patch y ejecutar la
logica real sobre una copia profunda descartable**. El store vivo nunca se muto.

Gasto `Fijo` (el campo de rango esta oculto, asi que el patch **no** lleva
`rango` y el merge conserva el que hubiera):

```json
{ "monthId": "septiembre-2026",
  "id": "id_92h8zz8mr_1789941040428",
  "patch": { "concepto": "PRUEBA CONGELADA", "monto": 123.45 },
  "retorno": true,
  "estadoEnCopia": "{\"id\":\"id_92h8zz8mr_1789941040428\",\"tipo\":\"Fijo\",\"monto\":123.45,\"estado\":\"Pendiente\",\"concepto\":\"PRUEBA CONGELADA\"}" }
```

Gasto `Variable` (el campo esta visible, asi que el patch **si** lleva `rango`):

```json
{ "monthId": "septiembre-2026",
  "id": "id_6xekdzgpu_1789961031869",
  "patch": { "concepto": "Productos de casa: Jabón, shampoo, papel...",
             "monto": 44.44, "rango": "35 - 55" },
  "retorno": true,
  "estadoEnCopia": "{\"id\":\"id_6xekdzgpu_1789961031869\",\"tipo\":\"Variable\",\"monto\":44.44,\"rango\":\"35 - 55\",\"estado\":\"Pendiente\",\"concepto\":\"...\"}" }
```

Movimiento (`categoria`, `retornable`, `flujo` y `estado` sobreviven intactos):

```json
{ "monthId": "septiembre-2026",
  "id": "sintetico_ingreso",
  "patch": { "concepto": "MOVIMIENTO PRUEBA", "monto": 777.77, "fecha": "2026-01-15" },
  "retorno": true,
  "estadoEnCopia": "{\"id\":\"sintetico_ingreso\",\"fecha\":\"2026-01-15\",\"concepto\":\"MOVIMIENTO PRUEBA\",\"flujo\":\"Ingreso\",\"categoria\":\"General\",\"retornable\":\"No\",\"estado\":\"Pagado\",\"monto\":777.77}" }
```

Logica del store medida sobre una copia con fixtures propios:

```
updateMovement: devolvio true · monto "55.5" -> 55.5 (numero) · conservaNoEnviados true
                llamoSave 1 · idInexistente false · mesInexistente false
                sinGuardarElMonto: 100 (el monto no se toca si no viene en el patch)
updateBudgetItem: devolvio true · monto "10.10" -> 10.1 (numero)
                  conservaEstadoYRango true · idInexistente false
```

## Contrato DOM: 0 eliminados

`node dom-contract.js js\app.js odd\tasks\dom-contract-snapshot.txt`, snapshot
regenerado.

El primer diff que se hizo fue **vacio de valor**: el snapshot ya se habia
sobrescrito antes y la comparacion daba contra si mismo. Se rehizo en serio
reconstruyendo el `app.js` original revirtiendo los 5 cambios y **validando la
reconstruccion contra el dato conocido** (120 ids / 60 clases / 5 attrs, medido
antes de tocar nada). La reconstruccion dio exactamente 120/60/5, con lo que
queda probada. Contra ella:

```
[IDS]       antes=120 ahora=137 perdidos=0 nuevos=17
[CLASSES]   antes= 60 ahora= 63 perdidos=0 nuevos=3
[ATRIBUTOS] antes=  5 ahora=  5 perdidos=0 nuevos=0
CONTRATO DOM: 0 perdidos, 20 nuevos
```

Los 20 nuevos, todos agregados: `modalEditExpense`, `modalEditMovement`,
`formEditExpense`, `formEditMovement`, los 7 ids de campo de gasto, los 6 de
movimiento, `btn-edit-expense`, `btn-edit-tx`, `item-actions`.

## Contraste AA del texto nuevo

Medido con `window.__audit` (el mismo criterio que el resto de la app), tema
claro y `.theme-dark`. **0 fallos en los dos temas.** Se midieron 8, 9 y 9 pares
en claro y 8 y 9 en oscuro.

| Elemento | Claro | Oscuro |
|---|---|---|
| `h3` "Editar gasto" / "Editar movimiento" | 16.83:1 | 16.96:1 |
| `label` de cada campo | 6.41:1 | 8.64:1 |
| `.form-readonly-value` (el Tipo / el Flujo) | 16.83:1 | 16.96:1 |
| `.form-hint` | 5.5:1 | 6.16:1 |
| `.btn-primary` "Guardar cambios" | 5.59:1 | 7.68:1 |

El mas bajo es 5.5:1, contra un minimo de 4.5. El color de fondo se compuso
subiendo por los ancestros con el `background-color` computado de cada uno, no
leyendo el token crudo: `rgba(0,0,0,0)` se trata como transparente y no como
negro.

## Foco

`element.focus()` de verdad y `getComputedStyle` en ese momento, en los dos
modales:

```
#editExpenseConcepto:  enfocado true · focus true · focusVisible true
                       anillo "solid 2px rgb(0, 136, 255)" · portador #editExpenseConcepto
#editMovementConcepto: enfocado true · focus true · focusVisible true
                       anillo "solid 2px rgb(0, 136, 255)" · portador #editMovementConcepto
```

Ademas el concepto llega con el texto **seleccionado** (`0-16` en
"Internet de casa"), que es lo que hace el modal de pago variable.

## ESC

Verificado, no asumido. El handler de `app.js` filtra
`.modal-overlay.active` y saca el ultimo; los dos modales nuevos usan esa clase,
 asi que entran sin tocarlo.

```
modal de gasto:       antes ["modalEditExpense"]   -> despues []   sigue activo = false
modal de movimiento:  antes ["modalEditMovement"]  -> despues []   sigue activo = false
```

Cerrar por el boton tambien funciona (`.btn-close-sheet-btn` esta en la lista
que se registra al cargar el DOM, y los dos botones estan en el HTML estatico).

## Resto de la verificacion

- `node --check`: OK en `js/app.js`, `js/store.js`, `dom-contract.js` y
  `odd/tasks/edicion-admin.mjs`.
- **0 excepciones, 0 `console.error`, 0 respuestas >= 400** en toda la corrida.
- `@media (prefers-color-scheme` en `css/styles.css`: **0**. Las tres menciones
  de la cadena son comentarios que explican que no hay ninguna.
- Tema claro por defecto: `documentElement.className` vacio al abrir. La clase
  `.theme-dark` se preservo y los modales se midieron ahi.

## Decisiones que no estaban especificadas

1. **El boton de editar va DENTRO del cuarto hijo de `.expense-card-item`, no
   como quinto hijo.** La fila tiene un contrato documentado de 4 hijos, con
   `grid-template-columns: minmax(0,1fr) 92px auto auto` y reglas
   `:nth-child(3)`/`:nth-child(4)` en la media query de ancho angosto. El
   cuarto hijo ya era un `<div>` sin clase: meti los dos botones ahi. Se
   preserva el contrato de 4 hijos (`hijosPorFila: 4` medido) y el importe sigue
   cerrando contra el borde.
2. **`.item-actions` (clase nueva) para el(wrapper.** Sin ella los dos botones de
   24px quedan pegados: el `<div>` no es flex.
3. **El boton de editar entra en las reglas CSS agrupadas existentes**, no en
   reglas propias: mismo carril de 24px, mismo `opacity: 0` con hover, mismo
   hover. Editar y eliminar son la misma clase de accion sobre la fila.
4. **El TIPO del gasto y el FLUJO del movimiento se muestran pero no se
   editan.** No es una omision: `store.updateBudgetItem` mezcla campos y **no
   mueve el registro entre `fijos`, `variables` y `extras`**. Dejar editable el
   tipo produciria un "Variable" viviendo adentro de la lista de fijos. Para
   moverlo hace falta otro metodo de store, y la regla era agregar
   `updateMovement` y nada mas. Se muestran con `.form-readonly-value`: mismo
   alto y padding que un campo, pero sin caja ni borde, porque una caja
   identica a la de un input seria un input que no responde. El texto es
   normal, nunca atenuado como un control deshabilitado, asi que se mide con
   el criterio de cualquier otro texto.
5. **El ESTADO no se edita.** Para eso estan el toggle de la fila y el modal de
   pago variable, que ademas piden confirmacion.
6. **`categoria` y `retornable` del movimiento no se editan.** Sobreviven por el
   merge. No hay vocabulario en la app para editarlos: el modal de alta tampoco
   los recoge. Es una limitacion known, no un olvido.
7. **El campo Rango solo aparece en un Variable**, con el mismo criterio que el
   modal de alta. Cuando esta oculto el patch **no** incluye `rango`, asi que un
   rango guardado sobrevive.
8. **Los botones no usan texto, solo glifo SVG lineal con `currentColor`**
   (mismo `viewBox="0 0 16 16"` y atributos que el resto). Cero emoji.
9. **El monto se castea a float en el store, no en el handler.** `updateMovement`
   lo hace igual que `addMovement`, para que un string coming del input no se
   guarde como cadena. En el handler solo se manda `parseFloat`.
10. **Comentario del handler de Escape actualizado de "6 modales" a "8".** Era
    un numero que se desactualiza solo; ahora dice que la lista crece con cada
    sheet nuevo y que el selector es por clase.
11. **El arnes es `odd/tasks/edicion-admin.mjs`** y reusa `cdp.mjs` y
    `probes.mjs`, que ya estaban en la carpeta. No se toco ninguno de los dos.

## Lo que no quedo bien

1. **El estado real del usuario tiene CERO movimientos en los 6 meses.** No hay
   forma de probar el boton de editar movimiento contra un dato real del
   usuario. Se sembraron 2 movimientos sinteticos **solo en memoria** y se
   pidio el redibujado con `store.notificar()`, que dispara el `switchView` que
   `app.js` ya tiene registrado (`notificar()` no llama a `save`). Al final se
   devolvio la memoria al estado original y se comprobo con
   `memoriaVuelveAlOriginal: true`. Los datos persistidos no se movieron en
   ningun momento, y aunque se hubieran movido no habrian salido de la pagina:
   `setItem` interceptado, `store.save` congelado, ventana cerrada al final.
   Aun asi, **el camino del movimiento quedo probado contra un fixture, no
   contra un gasto real del usuario.**
2. **El boton de editar movimiento quedo sin Exercise en sesion de lector.** Las
   mediciones de `display` del par `.btn-edit-tx` / `.btn-delete-tx` se hicieron
   con `read-only-mode` presente, es decir, sobre el estado real de la corrida.
   El estado "admin" se midio **quitando la clase CSS del body**, que es lo
   unico que la regla mira. **No se falseo el rol**: `isAdmin` y
   `obtenerSesion()` no se tocaron, y el codigo entregado no tiene ningun
   atajo. La prueba es de paridad: editar y eliminar dan el mismo `display` en
   los dos estados de la clase, y los dos matchean
   `body.read-only-mode .admin-action-btn`. Con una sesion real de Supabase los
   dos aparecen; sin sesion los dos desaparecen.
3. **`storeSave: 2` durante la corrida.** No es un cambio persistido (el `save`
   estaba congelado, y `hashLocales` no se movio), pero significa que la app
   intenta guardar dos veces al redibujar. Es comportamiento preexistente de
   `switchView`, no de esta tanda. Queda anotado porque es ruido en los
   contadores de cualquiera que repita la medicion.
4. **La reconstruccion del `app.js` original es una reconstruccion, no el
   original.** Sirvio porque valida contra un dato independiente (120/60/5
   medido antes de editar). Si hubiera que auditar con mas detalle que "0
   eliminados", habria que versionar el archivo.
5. **El repositorio git tiene CERO archivos versionados.** `git diff` no puede
   probar que `supabase-store.js` y `charts.js` estan intactos; se comprobo por
   `LastWriteTime`. Con `.github_token` en texto plano y sin `.gitignore`
   effective, **`git add .`publicaria el token**: no se hizo ningun add, commit
   ni push.