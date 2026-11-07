# Blindaje contra perdida de datos

> Registro de trabajo. Se actualiza con cada avance real, contra evidencia
> verificada, no contra memoria.

## Por que existe

La app descartaba en silencio una escritura que fallaba (`console.warn`) y, en la
siguiente lectura exitosa de la nube, `load()` tomaba el estado remoto y pisaba lo
local. `huboEdicionesLocales` solo cubria ediciones hechas **dentro de la misma
carga de pagina**: cerrar el navegador con una escritura fallida alcanzaba para
perderla. No habia cola de reintento, ni listener `online`, ni marca de "sin
subir", ni copias de respaldo automaticas.

## Reglas implementadas

| ID | Regla | Donde | Evidencia |
| --- | --- | --- | --- |
| R1 | El estado remoto no pisa el local si hay cambios sin subir o la escritura fallo | `js/store.js` (`aplicarEstadoRemoto`, `syncFromRemote`, `reintentarSubidaPendiente`, `load`) + `js/supabase-store.js` (`guardar` ahora devuelve boolean) | `anti-loss-suite` R1a-R1d (13 checks) y e2e de navegador (3 checks) |
| R2 | Modo Proteccion: banner + alta deshabilitada sin nube | `index.html`, `js/app.js`, `css/layout.css` | e2e de navegador: 17/17 |
| R3 | Copia rotativa automatica de cada guardado confirmado | `js/store.js` (`guardarSnapshotSeguro`, `purgarSnapshotsViejos`, `listarSnapshots`) | `anti-loss-suite` R3 (8 checks) |
| R3b | Boton "Descargar Copia JSON" conectado a `exportJSON()` | `index.html` + `js/app.js` | e2e: descarga `blob:` con `download` terminado en `.json` |

## Decisiones

- **`guardar()` devuelve `boolean`.** Antes resolvia `undefined` tanto si el
  upsert habia funcionado como si no. Sin esa distincion el store no podia saber
  si el dato estaba arriba, y la regla 1 era inaplicable.
- **La marca de pendiente se persiste** en `gastos_pendiente_sync`. Si el
  navegador se cierra con una escritura fallida, la proxima carga tiene que saber
  que lo local manda. En el arnes (`window.__sandbox`) la marca vive solo en
  memoria para no filtrarse entre casos.
- **La marca no se limpia antes de que `load()` resuelva.** Los guardados de
  arranque (`leerLocal`/`sanear`) no son escrituras confirmadas y borrarian el
  pendiente de la sesion anterior justo antes de leerlo.
- **Solo un guardado confirmado deja snapshot.** Si la nube fallo, la edicion ya
  vive en la clave principal; rotar el historial con versiones no confirmadas
  empujaria fuera las ultimas copias sanas.
- **Sello monotónico para el snapshot.** Dos guardados dentro del mismo
  milisegundo colisionaban en la misma clave. `max(Date.now(), ultimo + 1)`
  garantiza clave unica y mantiene el orden lexicografico igual al cronologico.
- **`local` y `conectando` no activan el Modo Proteccion.** `local` significa
  nube desactivada a proposito (no hay nada que proteger) y `conectando` es una
  duda, no un fallo: bloquear el arranque por eso seria peor que no bloquear.
- **El texto del banner va en entidades HTML** (`&#9888;&#65039;`) para que el
  archivo siga siendo ASCII y la interfaz muestre el aviso pedido.

## Verificacion

| Comando | Resultado |
| --- | --- |
| `npm test` | 75/75 + 33/33 + 27/27 = 135 comprobaciones, exit 0 |
| e2e Modo Proteccion (navegador headless) | 17/17 |
| e2e blindaje R1 + R3b (navegador headless) | 10/10 |
| `npm run test:adversarial` | ver seccion siguiente |

### Ciclo offline -> online verificado

Con la app real servida y el arnes de sandbox: `navigator.onLine = false` +
evento `offline` -> banner visible con el texto exacto, `#btnHeaderAddBudget` y
`#btnQuickActionExpense` deshabilitados, un `.click()` no abre ningun formulario.
`navigator.onLine = true` + evento `online` -> banner oculto, botones
reactivados, la marca de proteccion limpia, el alta vuelve a abrir su formulario
y el tamano del documento no cambia: no se perdio ningun dato.

### Regla 1 verificada contra el estado remoto

Con `guardar()` devolviendo `false`: `save()` deja `hayCambiosSinSubir = true`,
la edicion queda escrita en la clave local y `aplicarEstadoRemoto()` con un
remoto distinto devuelve `false` sin tocar `this.data`. Al confirmar la subida,
`reintentarSubidaPendiente()` limpia la marca y lo enviado lleva la edicion
local.

## Hallazgo de las suites existentes

`odd/tasks/adversarial-suite.mjs` tenia dos asertos que documentaban un hallazgo
real ("exportJSON/importJSON no tienen superficie de UI"). Al agregar el boton de
descarga ese hallazgo deja de ser cierto para la exportacion. Los dos asertos se
reescribieron para reflejar el estado nuevo, sin borrar el caso:

- `import.no-ui-surface` sigue valido: no hay `<input type=file>` ni control de
  importacion. La importacion sigue siendo una API sin UI.
- `export.no-ui-surface` paso a `export.ui-surface`: exactamente un control
  exporta, y es `#btnDescargarCopiaJSON`. `exportCSV` sigue sin superficie y
  conserva su hallazgo de escape.

## Entrega

| Commit | Que lleva |
| --- | --- |
| `748f1a1` | `fix(store)`: capa de persistencia (R1 + R3) en `js/store.js` y `js/supabase-store.js` |
| `6f6c326` | `feat(ui)`: Modo Proteccion y boton de copia JSON |
| `3f31d97` | `test`: suite nueva, hallazgos de export/import y reporte regenerado |

**Decision de unidad de revision:** R1 y R3 quedaron en un solo commit de
`js/store.js`. Las dos viven en el mismo archivo, entrelazadas en el mismo
`save()` y en el mismo bloque de constantes; separarlas exigia reescribir el
archivo ya verificado a mano y el riesgo de romper algo superaba el beneficio de
revision. El mensaje del commit enumera las dos reglas para que el diff se lea
sabiendo que hay dos.

## Pendiente / fuera de alcance

- La importacion desde archivo sigue sin UI. No se pidio y no se agrego.
- No hay UI para restaurar un snapshot rotativo; se puede leer por consola con
  `window.financialStore.listarSnapshots()`. Si se quiere un selector visual, es
  un cambio aparte.
- El CSV mantiene el hallazgo de escape del nombre de mes (entre comillas, sin
  guarda de formula) porque nadie lo puede disparar desde la UI.
