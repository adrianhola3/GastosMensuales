# Fix de la capa de datos y seguridad

## Objetivo

Corregir los 7 defectos verificados en `js/store.js` y `js/supabase-store.js`
encontrados por la review técnica con el agente `power`, sin cambiar el
comportamiento observable de la app ni el diseño visual.

## Problema

La capa de datos pierde información en silencio y acepta entrada no
validada. El caso grave: `leerLocal()` escribe los datos de fábrica encima de
los datos del usuario cuando el `localStorage` está corrupto, sin aviso ni
respaldo. En una app de gastos eso significa pérdida de datos reales.

## Por qué

Review técnica con `power` (muse-spark-1.3) sobre la capa de datos, con
verificación manual de cada referencia `archivo:línea` contra el archivo real.
5 de 8 hallazgos confirmados al 100%; los 3 restantes quedaron marcados por el
propio agente como `REQUIERE VERIFICAR EN app.js` y no se tocan acá.

## Alcance autorizado

Archivos que se pueden modificar:

- `js/store.js`
- `js/supabase-store.js`
- `js/config.js` — solo para documentar, no para cambiar credenciales

## Fuera de alcance (requiere autorización aparte)

- **La RLS de Supabase.** Vive en el servidor, no en el repo. Corregirla exige
  correr SQL contra una base de datos remota viva. El usuario tiene que dar
  autorización explícita y explícita para eso. NO se hace en esta tanda.
- `js/app.js`, `js/charts.js`, `index.html`, `css/styles.css`.

## Restricciones

- No cambiar el modelo de permisos ni `exigirAdmin()`.
- No cambiar la API pública del store: los nombres de métodos que consume
  `app.js` se mantienen.
- No tocar el diseño visual.
- No agregar dependencias.
- Todo comentario nuevo en español neutro, consistente con el archivo.

## Tareas

### T1 — CRÍTICO: `leerLocal()` no pisa datos ante JSON corrupto

**Estado**: ☑ HECHA — criterio cumplido (respaldo con el contenido original +
la app abre). Verificado en `store-fix-suite.mjs`.

`js/store.js:111-129`. Hoy: `JSON.parse` falla → `catch` solo hace
`console.warn` → cae a `getDefaultData()` + `this.save(initial)`, que
sobrescribe la única copia local.

Arreglo: ante JSON corrupto o shape inválido, **no** llamar `save()`. Respaldar
la cadena cruda bajo una clave aparte (`STORAGE_KEY + '_corrupto_' + timestamp`)
y recién ahí inicializar los defaults. Dejar el respaldo recuperable.

Criterio: con `localStorage` corrupto, tras recargar existe la clave de
respaldo con el contenido original y la app abre sin romperse.

### T2 — ALTO: `importJSON()` debe sanear y validar antes de asignar

**Estado**: ☑ HECHA — criterio cumplido
(`{"meses":{"m1":{}},"mesesOrden":["m1"]}` devuelve `false` y el estado
anterior queda intacto). Verificado en `store-fix-suite.mjs`.

`js/store.js:807-820`. Hoy asigna `this.data = parsed; this.save();` sin pasar
por `this.sanear()`, a diferencia de `leerLocal` (117) y `load` (163).

Arreglo: validar que cada mes tenga las colecciones esperadas ANTES de
asignar. Si no valida, devolver `false` **sin tocar `this.data`**. Si valida,
pasar por `sanear()` antes de guardar.

Criterio: importar `{"meses":{"m1":{}},"mesesOrden":["m1"]}` devuelve `false`
y el estado anterior queda intacto.

### T3 — ALTO: validar montos, no coaccionar a 0

**Estado**: ☑ HECHA — criterio cumplido. Helper `normalizarMonto()` con
`Number()` + `Number.isFinite()` + rango `[0, 1e9]`. Verificado en
`store-fix-suite.mjs`.

`js/store.js:518, 556, 644, 673`. Hoy: `parseFloat(x) || 0` acepta
`Infinity` (`"1e309"`), negativos y texto parcial (`"12abc"` → `12`).

Arreglo: helper único de validación de monto con `Number()` +
`Number.isFinite()` + rango. Rechazar en vez de coercionar a 0 cuando el valor
no es un número finito válido.

Criterio: `"1e309"`, `"abc"`, `"12abc"` y `NaN` no producen un item con monto
`Infinity` ni persisten datos silenciosamente convertidos.

### T4 — ALTO: `load()` no debe pisar ediciones en curso

**Estado**: ☑ HECHA — criterio cumplido (un gasto agregado entre la
construcción y la resolución de la nube no se borra). Verificado en
`store-fix-suite.mjs`.

`js/store.js:100-101` y `180-182`. Confirmado: `this.data = estado` reemplaza
el estado sin comparar contra lo que había en memoria.

Arreglo: guardar un snapshot del estado inicial en el constructor. En `load()`,
si `this.data` difiere de ese snapshot (hubo ediciones durante la espera),
**fusionar o preferir lo local** y subirlo, en vez de imponer la copia remota.

Criterio: agregar un gasto entre la construcción y la resolución de la nube no
lo borra.

### T5 — MEDIO: `haySesion()` trata `getSession()` como síncrono

**Estado**: ☑ HECHA — criterio cumplido. Ver nota de desvío en Progreso:
`haySesion()` sigue siendo SÍNCRÓNICA (app.js:2142 la usa en el mismo tick y
`app.js` está fuera de alcance). Se corrigió la causa real: ahora lee una copia
en memoria de la sesión que alimentan los eventos de auth y los inicios de
sesión, en vez de leerle `.data` a una promesa. Verificado en
`store-fix-suite.mjs`.

`js/supabase-store.js:322-331`. En supabase-js v2 `getSession()` devuelve
promesa → `actual.data` es `undefined` → **siempre devuelve `false`**. El
propio archivo lo usa bien como promesa en la línea 359.

Arreglo: hacer `haySesion()` coherente. Opciones válidas: volverla `async` y
usar `await`, o eliminar su uso síncrono y delegar en `esperarSesion()`.
Revisar los 3 call sites: líneas 150, 341 y 353/361.

Criterio: `haySesion()` devuelve `true` cuando hay sesión activa.

### T6 — MEDIO: los updates no deben dejar reescribir el `id`

**Estado**: ☑ HECHA — criterio cumplido. Helper `camposEditables()`, compartido
por `updateBudgetItem` y `updateMovement`. Verificado en `store-fix-suite.mjs`.

`js/store.js:554` y `671`. Hoy: `coll[idx] = { ...coll[idx], ...updatedFields }`
copia todo lo que venga, incluido `id`. Dos ítems con el mismo `id` hacen que
`findIndex`|Aparecen siempre al primero y el otro queda inoperable.

Arreglo: descartar `id` del spread o aplicar lista blanca de campos.

Criterio: pasar `{ id: 'otro' }` a un update no cambia el `id` del ítem.

### T7 — MEDIO: el id de mes colisiona cada 10 segundos

**Estado**: ☑ HECHA — criterio cumplido (dos meses seguidos con el mismo nombre
no se pisan ni duplican `mesesOrden`). Verificado en `store-fix-suite.mjs`.

`js/store.js:726`. `Date.now().toString().slice(-4)` da 4 dígitos: la ventana
de colisión es de 10 segundos. Dos meses con el mismo nombre en esa ventana
generan el mismo `id`, el segundo pisa el contenido del primero y
`mesesOrden` queda duplicado.

Arreglo: usar el timestamp completo o `generateId()`. Si el `id` ya existe en
`meses`, regenerarlo.

Criterio: crear dos meses seguidos con el mismo nombre no pisa el primero ni
duplica la entrada en `mesesOrden`.

### T8 — FUERA DE ALCANCE: RLS de Supabase

**Estado**: ☑ PARCIAL — el comentario de `js/supabase-store.js:16-52` ya
describe el esquema correcto (una fila por usuario, `user_id uuid default
auth.uid()`, policies con `auth.uid() = user_id`). La migración NO se ejecutó:
sigue BLOQUEADA, requiere autorización del usuario.

`js/supabase-store.js:18-33` documenta la tabla `gastos` de una sola fila
global sin `user_id`, con policies `using (true)` / `with check (true)`.
Cualquier usuario autenticado lee y sobreescribe los datos de todos.

**El arreglo NO es en el repo.** Exige migración SQL contra la base viva:
agregar `user_id uuid default auth.uid()`, una fila por usuario, y policies con
`auth.uid() = user_id`.

Requiere autorización explícita para operación remota. **No se ejecuta sin
ella.** El proyecto documenta la política correcta en el comentario del
archivo; actualizarla para que describa el esquema correcto SÍ está en alcance
y lo puede hacer el escritor sin tocar la red.

## Modo TDD

**OFF.** No hay runner de tests en el proyecto (`ledger-unico.md:258` lo
registró). Ver `## Checks aplicables`.

## Checks aplicables

El proyecto no tiene runner, pero sí scripts de verificación existentes en
`odd/tasks/`. El escritor debe:

1. Comprobar sintaxis de los archivos modificados antes de declarar nada.
2. Ejecutar `node odd/tasks/crud-suite.mjs` y
   `node odd/tasks/adversarial-suite.mjs` si corren en este entorno.
3. Si un script requiere navegador/CDP y no puede correr, **reportarlo como no
   ejecutado**. No inventar un PASS.
4. Reportar el resultado literal de cada comando: `<comando>: <resultado>`.

## Criterios de aceptación

- [x] T1-T7 implementadas, cada una con su criterio cumplido.
- [x] Ningún cambio en `app.js`, `charts.js`, `index.html` ni `styles.css`.
- [x] API pública del store sin cambios.
- [x] Checks ejecutados y reportados literalmente, incluidos los que fallan.
- [x] T8 reportada como bloqueada, sin tocar la base remota.

## Ruta y evidencia de delegación

**Ruta**: delegado directo, un solo escritor.

**Triggers disparados**:
- *Writer trigger*: 2+ archivos no triviales (`store.js` con 5ubicaciones,
  `supabase-store.js`, `config.js`).
- *Preparation trigger*: la lectura que preparaba la escritura.

El orquestador ya verificó los hallazgos y fijó el alcance; el escritor
implementa y verifica. No re-investiga.

## Progreso

Cerrada el 10/10/2026. T1 a T7 implementadas y con criterio cumplido. T8
documentada pero sin ejecutar la migración.

### Archivos tocados

- `js/store.js` — T1, T2, T3, T4, T6, T7.
- `js/supabase-store.js` — T5 y el comentario de esquema de T8.
- `js/config.js` — **sin cambios**. El comentario de seguridad que ya tiene
  (líneas 18-20) sigue siendo exacto: lo que protege los datos son las
  policies, no la anon key. No hacía falta tocarlo.
- `odd/tasks/store-fix-suite.mjs` — harness headless nuevo, desechable.
  No es un runner del proyecto: el proyecto sigue sin tests.

### Desvío de T5, con motivo

El plan proponía dos caminos: volver `haySesion()` `async`, o delegar en
`esperarSesion()`. **Los dos rompen la app.** `js/app.js:2142` la consume
síncrono dentro del callback de `alCambiarSesion`:

```js
remoto.alCambiarSesion(() => {
  if (remoto.haySesion()) { sesionActual = { rol: 'admin', ... } }
```

Si `haySesion()` devuelve una promesa, esa promesa es siempre *truthy* y la app
se declara admin en cada cambio de sesión, para cualquiera. Y `app.js` está
fuera del alcance autorizado.

Se tomó el tercer camino, el que ataca la causa sin cambiar el contrato: la
función sigue siendo síncrona y devuelve `boolean`, pero **deja de leer la
promesa**. Ahora responde con `sesionEnMemoria`, una copia que se actualiza en
`onAuthStateChange` (INITIAL_SESSION / SIGNED_IN / SIGNED_OUT), después de un
login exitoso, después de un logout y en la resolución de `esperarSesion()`.
Los 3 call sites que menciona el plan (150, 341, 353/361) quedan coherentes y
`app.js:2142` sigue funcionando sin tocarlo.

### Interpretación de T1, con motivo

El plan dice "ante JSON corrupto... **no** llamar `save()`", y a la vez pide
que el respaldo quede recuperable y que la app abra. Se implementó
**respaldar primero, recién después inicializar los defaults**: el original se
copia a `STORAGE_KEY + '_corrupto_' + <timestamp>` y solo entonces se
persisten los datos de fábrica.

Si no se guardara nada, el `localStorage` seguiría conteniendo el JSON roto en
cada arranque: se generaría una clave de respaldo nueva por recarga (crecimiento
sin límite) y el estado en memoria quedaría divergido del persistido para
siempre. Con el orden inverted, el respaldo aparece una vez, se conserva
íntegro y la app abre limpia.

### Descubrimientos fuera del plan

1. **T3 tiene un punto ciego en `app.js`, fuera de alcance.**
   `app.js:1608` (alta de gasto) y `app.js:1934` (alta de movimiento) hacen
   `parseFloat(...) || 0` e **ignoran el valor de retorno** del store: con
   `"1e309"` el store ahora rechaza el alta, pero la app cierra el modal y
   muestra el toast `Gasto "X" agregado`. El dato no se persiste (el defecto
   está arreglado) pero el mensaje miente. Arreglarlo exige tocar `app.js`.
   Los formularios de edición (`app.js:1782` y `1849`) sí(validan con
   `monto < 0` y avisan, así que esos no mienten.

2. **T2 endurece el filtro de importación.** `esEstadoValido()` exige que cada
   mes traiga las seis colecciones, `movimientos` incluida. Un respaldo hecho
   con una versión de la app anterior a los movimientos ahora se rechaza en
   lugar de importarse. Es el trade-off que pide el plan ("validar que cada mes
   tenga las colecciones esperadas ANTES de asignar"), pero queda anotado
   porque es un cambio observable para ese usuario.

3. **`crud-suite` tiene 3 FAIL, pero son previos.** Ver abajo.

### Checks ejecutados

| Comando | Resultado |
|---|---|
| `node --check js/store.js` | exit 0 |
| `node --check js/supabase-store.js` | exit 0 |
| `node --check js/config.js` | exit 0 |
| `node odd/tasks/store-fix-suite.mjs` | exit 0 — 74/74 comprobaciones OK |
| `node odd/tasks/crud-suite.mjs` | exit 1 — 27 PASS, 5 INCON, **3 FAIL** |
| `node odd/tasks/adversarial-suite.mjs` | exit 0 — total 31, 0 fallos |

Los dos suites sí corren en este entorno (Chrome real vía CDP, perfil
desechable, `window.gastosRemoto` stubbeado: cero red).

**Sobre los 3 FAIL de `crud-suite`** — son previos a esta tanda, no
introducidos acá:

- `expense.edit.whitespace-concepto`
- `month.create.clone`
- `month.delete`

Evidencia: `odd/tasks/capturas/crud-despues.txt`, una corrida del 5/10/2026
anterior a todo este trabajo, lista exactamente los mismos 3 FAIL y los mismos
5 INCON que la corrida de hoy. Además, el código que esas aserciones apuntan
(`addNewMonth` con su parámetro `opciones`, `deleteMonth`, y los controles de
`app.js`) quedó **byte a byte idéntico** a como estaba antes de esta tanda: en
`addNewMonth` lo único que cambió es el cálculo del `id`. El repo no tiene
commits, así que no hay línea base en git contra la cual comparar.

`month.create.clone` en particular falla porque el test afirma `extras: []` y
`notas: ''` para el clon, cuando la app ya los hace opt-in por las
casillas de `opciones`. El test quedó viejo respecto de esa funcionalidad,
que es anterior a esta tanda.