# Auditar la web de gastos mensuales: subir, borrar y editar como administrador

## Objetivo

Demostrar con evidencia real que el perfil de administrador puede **crear**, **editar** y
**borrar** gastos, movimientos y meses, y que la app se comporta bien ante situaciones
adversas (estados vacíos, importes extremos, texto hostil, datos corruptos). Si algo
falla, se arregla y se vuelve a probar.

## Por qué

La última tanda (#156) terminó la edición completa para admin, pero dejó dos límites
declarados sin resolver:

1. La edición de movimientos **solo se pudo probar contra un fixture**, porque los 6
   periodos del usuario tienen 0 movimientos.
2. No existe ninguna prueba de ciclo completo crear→editar→borrar como admin.

El usuario pidió explícitamente "debe funcionar para cualquier situación". Eso no se
responde mirando código: hay que ejecutar las cuatro esquinas.

## El problema que decide el diseño de la prueba

`js/config.js` contiene **credenciales reales de Supabase** (líneas 24-25) y
`js/app.js:109` saca el rol de una sesión real de Supabase:

```js
const sesion = obtenerSesion();
let isAdmin = sesion.rol === 'admin';
```

Además, el acceso por query param (`?admin=true`) fue **eliminado a propósito**
(app.js:106-107). Consecuencia directa: **no existe ninguna forma de ser admin en local
sin iniciar sesión contra la base de datos real.**

Si "probamos" entrar como admin de verdad, cada alta, edición y borrado se escribe en
las finanzas reales del usuario. Eso no es una prueba, es un accidente con pasos.

Por eso la prueba se hace en un **sandbox aislado**, nunca contra la base real.

## Alcance autorizado

- Construir un arnés de prueba en `odd/tasks/` que no toca la app en producción.
- Crear fixtures sintéticos y scenarios adversariales.
- **Arreglar** los defectos que la suite encuentre en `js/` e `index.html`.
- Regenerar el snapshot del contrato DOM si cambia un id o clase.

## Fuera de alcance

- **NO publicar.** Ni `sync_github.js`, ni con `--dry-run`. La publicación es decisión
  del usuario.
- **NO tocar** `.github_token`, `.github_oauth`, `.supabase_db_password`. Solo lectura.
- **NO** iniciar sesión real en Supabase ni escribir en la base real.
- **NO** tocar el navegador del usuario ni tomar el control de su pantalla. Todo en un
  perfil throwaway.
- **NO** hacer `git init`/`git add` sin revisar el `.gitignore` (ya excluye los tres
  archivos de credenciales; verificado).

## Diseño del sandbox

Un Chrome aislado y desechable (`--user-data-dir` temporal) que carga la app por
`file://` con tres inyecciones previas a la navegación, usando
`Page.addScriptToEvaluateOnNewDocument` de CDP:

1. **Sesión admin forzada.** `obtenerSesion()` tiene que devolver `rol: 'admin'`. Se
   intercepta `window.gastosRemoto` ANTES de que `app.js` lo lea, con un stub que
   expone `estaConfigurado() -> true`, una sesión admin, y `salirDeSesion()`.
2. **Backend escribo bloqueado.** El stub **no hace red**. Ninguna petición de
   escritura llega a Supabase. Las lecturas devuelven el fixture.
3. **localStorage sembrado con datos sintéticos** bajo las claves `finanzas*`, en un
   perfil que se borra al terminar. Los datos reales del usuario no se tocan porque no
   viven en este perfil.

Aparte, se intercepta `Storage.prototype.setItem` para **contar** escrituras y se
snapshot `JSON.stringify(store.data)` antes y después, para poder demostrar que
ninguna prueba arruinó un dato.

## Verificación de no-escritura (obligatoria, la que ya se quemó una vez)

Memoria #156, punto 6: una sonda de una tanda anterior **clickeó una fila para marcarla
Pagada y persistió de verdad**. `store.save()` escribe en localStorage y
`toggleBudgetItemStatus` la llama.

### CORRECCION CRITICA (T1, verificada contra el codigo)

El protocolo de esa tanda **estaba mirando la clave equivocada y daba verde falso**:

| | Lo que decía el protocolo viejo | Lo real (verificado) |
| --- | --- | --- |
| Clave del store | `finanzas*` | **`control_gastos_mensuales_db_v1`** (`js/store.js:5`) |
| Dónde | localStorage | localStorage |
| Única clave `finanzas*` | — | `finanzas_session_role_chosen`, y vive en **sessionStorage** (`js/app.js:113`) |

Contar escrituras sobre `finanzas*` **no cuenta NADA**: la clave no existe en
localStorage, asi que el contador queda en 0 mientras el store escribe libremente. El
"8104 == 8104, 0 escrituras" de la corrida anterior **no prueba nada**. Ese es el peor
tipo de verde: el que esconde un defecto en lugar dejangelo.

Protocolo corregido:

- Interceptar `Storage.prototype.setItem` para la clave real
  `control_gastos_mensuales_db_v1` **y** cualquier prefijo `finanzas*`, antes de navegar.
- **Contrafactual obligatorio**: provar que el contador NO está muerto (2 mutaciones ->
  2 escrituras contadas, con su stack). Un contador clavado en 0 no es evidencia.
- Snapshot de `window.financialStore` (sí es alcanzable, `js/store.js:837`) antes y
  después. `obtenerSesion()` es un `let` de módulo y NO se puede leer desde la página:
  el admin se afirma sobre su salida observable (`read-only-mode`, `authModeLabel`,
  `.admin-action-btn` visibles).

### El baseline de "0 escrituras" es inalcanzable, y hay que decirlo

La app escribe **una vez al arrancar, por su cuenta**:

```
key=control_gastos_mensuales_db_v1 bytes=2590
  at FinancialStore.save (js/store.js:291:20)
  at switchView (js/app.js:347:11)
  at HTMLDocument.<anonymous> (js/app.js:1656:3)
```

`app.js:1656` llama a `switchView` al inicializar y eso siempre cae en `store.save()`.
`markBootBaseline()` congela esa escritura fuera del conteo y la deja registrada con su
stack real. No se maquilla: se nombra.

Para los tests que **mutan** a proposito (crear/editar/borrar), `assertNoWrites()` va a
FALLAR y eso es la app funcionando bien. Esos tests usan `assertNetworkClean()` sola:
prueba que la escritura se quedo en el perfil descartable y no llego a Supabase.

### El stub de admin necesita un accessor trap, no una asignacion

`index.html:882` carga `js/supabase-store.js` y `index.html:885` carga `js/app.js`.
`js/supabase-store.js:372` asigna `window.gastosRemoto` **en tiempo de parseo**. Un
`addScriptToEvaluateOnNewDocument` con asignacion simple ya esta muerto antes de que
`app.js` lo lea. Hay que instalar un accessor en `window`: el getter devuelve el stub y
el setter captura el objeto real en `__sandbox.realRemoto`. El archivo real sigue
ejecutandose, asi que sus errores de parseo y `console.warn` siguen visibles.

`assertStubShape()` tiene que fallar fuerte si el trap no quedo instalado. Si el stub
tiene la forma equivocada, TODA la suite es invalida.

## Trampas del entorno ya verificadas (no repetirlas)

- `Input.dispatchKeyEvent` **no entrega teclado** en una ventana aislada sobre el sitio
  real (sí sobre `file://`). Para probar lógica de ESC hay que despachar un
  `KeyboardEvent` sintético en `window`. **Si la sonda no capta nada, puede que el
  producto esté bien: separar transporte de lógica antes de reportar un bug.**
- `getComputedStyle` en el mismo tick de un click devuelve el valor INICIAL de la
  transición, y Chrome representa el color interpolado en **oklab**, no en srgb. Un
  parser que no conoce oklab devuelve `null` y descarta la fila en silencio.
- `focus()` desplaza el elemento, y acá el scroll vive en un contenedor, no en `window`.
- PowerShell 5.1: `Get-Content -Raw` lee ANSI. Siempre `-Encoding UTF8`.
  `Set-Content -Encoding UTF8` mete BOM; el proyecto no usa BOM.
- `${env:ProgramFiles(x86)}` necesita llaves.
- Con `file://` no hay sesión de Supabase, así que la app abre en Lector y
  `body.read-only-mode` oculta los `.admin-action-btn`. Sin forzar admin, cualquier
  auditoría de foco no audita ningún control de edición.
- **La trampa de teclado NO es universal (corregido en T1).** La memoria #156 decía que
  `Input.dispatchKeyEvent` no entrega teclado. Falso: SÍ entrega ESC, en headless y en
  ventana, con perfil throwaway. La trampa venía de corridas contra el **Brave del
  usuario**; es específica del entorno. Dos consecuencias: T2/T3 no deben asumir que el
  CDP no entrega teclado, y —mas importante— **tampoco deben concluir "no hay bug"
  porque una sonda capturó nada**. `dispatchKey()` sintético queda igual por si acaso.
- El sandbox depende de internet para los dos CDN (chart.js, supabase-js). Hoy cargan.
  Si se cae la red la app igual arranca sin gráficos. **Escenario no probado todavía.**
- Hay un archivo basura `NUL` (3784 bytes) de una redirección mal hecha en Windows.
  No es código. No tocar en esta tanda.

## Restricciones de la app que el test debe respetar

- `store.updateBudgetItem(monthId, itemId, patch)` mergea cualquier campo. **Editar un
  gasto no toca el store.**
- `store.updateMovement(monthId, movId, patch)` existe (agregado en #156).
- **Editar NO puede mover un gasto entre listas** (`fijos`/`variables`/`extras`): el
  tipo se muestra como solo lectura, con la explicación. Es una limitación conocida y
  declarada, no un bug a arreglar acá.
- El botón de editar/borrar va en el **cuarto hijo** de `.expense-card-item`, clase
  `.item-actions`. Esa fila tiene contrato de 4 hijos.
- Los importes se castean a número antes de persistir.

## Criterios de aceptación

- [ ] Existe una suite ejecutable que cubre crear, editar y borrar como admin.
- [ ] Cubre las 3 entidades: gasto, movimiento, mes.
- [ ] Cubre los estados vacíos (0 gastos, 0 movimientos, 0 meses).
- [ ] Cubre importes extremos: 0, negativo, decimales largos, millones, `1e309`, NaN,
      texto en vez de número, formato con coma decimal.
- [ ] Cubre texto hostil en `concepto`: `<script>`, HTML, comillas, emoji, acentos,
      500 caracteres,rtl/override.
- [ ] Cubre import JSON corrupto / de otro shape / vacío.
- [ ] Cubre borrar el último elemento y borrar el único mes.
- [ ] Cada defecto encontrado queda **arreglado y re-verificado**, o reportado con
      prueba de por qué no es un defecto.
- [ ] **0 escrituras** en el store real, demostrado con el snapshot antes/después.
- [ ] Cambios de markup actualizan el binding en el MISMO cambio y regeneran el
      snapshot del contrato DOM.

## Ruta por tarea

| Tarea | Trabajo | Ruta |
| --- | --- | --- |
| T1 | Arnés de sandbox: admin forzado, stub sin red, fixtures, contador de escrituras | delegada |
| T2 | Suite CRUD feliz: crear/editar/borrar en las 3 entidades | delegada |
| T3 | Suite adversarial: empties, importes, texto hostil, import, borrados extremos | delegada |
| T4 | Arreglos de los defectos encontrados | delegada |
| T5 | Re-verificación completa + prueba de no-escritura | delegada |

## Progreso

_(se completa task por task con la evidencia)_

## Decisiones tomadas por el usuario

- _(ninguna todavía; el diseño del sandbox no requiere pregunta porque la alternativa
  —probar contra la base real— destruiría sus finanzas)_