# Rediseño Fase 1 — Modelo de datos: estimado y real separados

## Objetivo

Reemplazar el campo único `monto` por dos campos —`montoEstimado` y
`montoReal`— para que la estimación de cada mes sobreviva al pago, y deducir el
estado de cada gasto a partir del dato en vez de guardarlo aparte.

## Problema que resuelve

Hoy un gasto tiene un solo número. Al pagar un gasto variable, la app
**sobrescribe** ese número con lo que se pagó de verdad (`app.js:1691`), y la
estimación original se pierde para siempre. El único rastro que queda es el
campo `rango`, que es texto libre y nunca se parsea.

Como el estado (`Pendiente`/`Pagado`) se guarda aparte del monto, además puede
desincronizarse: son dos campos que dicen lo mismo y nadie los reconcilia.

## Por qué

El propósito de la aplicación es que el usuario registre sus gastos mensuales y
que otra persona (su padre) los vea para saber **qué gastos se están cubriendo**.
Para eso hace falta distinguir lo que se planeó de lo que se pagó. Es el
defecto de fondo del modelo actual.

## Decisiones de diseño

### D1 — El gasto pasa a tener dos montos

```js
{
  id: string,
  concepto: string,
  montoEstimado: number,   // lo que se planeó para este mes
  montoReal: number|null,  // lo que se pagó; null = todavía no
  rango: string            // opcional, texto libre, sin parsear
}
```

### D2 — El estado se DEDUCE, no se guarda

"Está cubierto" es exactamente `montoReal !== null`. El campo `estado` desaparece
del ítem. Esto elimina de raíz toda una clase de bug: hoy el estado puede
contradecir al monto y nada lo detecta.

Consecuencias que hay que respetar:
- Pagar un gasto = escribir `montoReal`.
- Quitar el pago = volver `montoReal` a `null`. El ítem vuelve a quedar
  pendiente por sí solo, sin ninguna escritura adicional.
- Editar el estimado **no** cambia la cobertura.

### D3 — La cobertura se mide contra el estimado, no contra el real

Este es el punto central. La identidad que tiene que cumplirse siempre:

```
totalCubierto + totalFaltante === totalEstimado
```

- `totalEstimado` = Σ `montoEstimado` de todos los gastos del mes.
- `totalReal` = Σ `montoReal` de los que tienen (los demás no suman).
- `totalCubierto` = Σ `montoEstimado` de los gastos **con** `montoReal`.
- `totalFaltante` = Σ `montoEstimado` de los gastos **sin** `montoReal`.
- `desvio` = `totalReal` − `totalEstimado`.
- `progresoCubierto` = `totalCubierto / totalEstimado`.

`totalCubierto` y `totalReal` **no son lo mismo** y no deben representar lo
mismo: si pagaste todo lo estimado, coinciden; si te pasaste, `totalReal` es
mayor.

### D4 — Al clonar un mes se copian los estimados, no los pagos

Clonar agosto para septiembre debe copiar `concepto`, `montoEstimado` y `rango`.
`montoReal` arranca en `null`: el pago de agosto no puede heredarse a
septiembre.

### D5 — Migración sin pérdida

Los datos que existen hoy tienen un solo `monto`. Al cargar:
- si el ítem está `Pagado`, `montoEstimado = monto` y `montoReal = monto`
  (mismo valor: hoy no había diferencia).
- si está `Pendiente`, `montoEstimado = monto` y `montoReal = null`.

Nada se descarta y ningún número cambia de valor.

### D6 — La migración vive en `sanear()`

`sanear()` ya se ejecuta en cada carga (`store.js:181-211`) y ya es el lugar
donde se normaliza el estado. La migración va ahí, no en un paso aparte.

### D7 — `tipo` y `rango` se quedan

`tipo` es redundante con el array donde vive el ítem, pero en la práctica se
conserva consistente y sacarlo agranda el radio de impacto sin ganar nada en
esta fase. `rango` queda como texto libre. Ninguno de los dos participa de un
cálculo nuevo en esta fase.

### D8 — Los movimientos no se tocan

Los movimientos (`addMovement`, el feed) ya solo tienen montos reales: no hay
estimado que confundir. Quedan intactos en esta fase. El problema de doble
conteo (`store.js:519`) se resuelve en la Fase 2, con el modelo de seguridad.

## Alcance autorizado

Se puede modificar:

- `js/store.js`
- `js/app.js`
- `js/charts.js`

Fuera de alcance:

- `js/supabase-store.js`, `js/config.js` — la nube es Fase 2.
- `index.html`, `css/styles.css` — el rediseño visual es Fase 3.

## Lo que SÍ hay que adaptar en la interfaz

Sin esto la app se rompe. Mínimo indispensable:

1. Cada fila muestra el estimado y, si hay real, el real y la diferencia.
2. El toggle de pago deja de alternar un texto y pasa a **escribir o borrar
   `montoReal`**.
3. Al pagar un **variable** se pide el monto real, con el estimado a la vista
   como referencia.
4. Al pagar un **fijo**, `montoReal` toma el valor del estimado por defecto,
   pero debe poder corregirse.
5. La barra de cifras pasa de `Presupuesto / Pagado / Pendiente` a
   `Estimado / Real / Cubierto / Falta`.

## Modo TDD

**OFF.** No hay runner en el proyecto. La verificación es el arnés CDP que ya
existe en `odd/tasks/`.

## Checks aplicables

- `node --check` sobre los tres archivos modificados.
- `odd/tasks/store-fix-suite.mjs` — debe seguir pasando, o actualizarse si el
  cambio de modelo invalida alguna comprobación. Si la invalida, se actualiza
  la comprobación **y se dice por qué**, no se borra.
- `odd/tasks/crud-suite.mjs` — el resultado de referencia es 27 PASS / 4 INCON /
  3 FAIL. Los 3 FAIL son bugs preexistentes y ajenos a esta fase:
  `expense.edit.whitespace-concepto`, `month.create.clone`,
  `month.delete`. **Cualquier FAIL nuevo es una regresión y hay que reportarlo.**
- Un caso manual: pagar un fijo por debajo del estimado debe mostrar la
  diferencia sin cambiar el estimado.

## Criterios de aceptación

- [x] El ítem tiene `montoEstimado` y `montoReal`; no queda ningún `monto` en
      el modelo. Verificado en el navegador: sobre un ítem pagado a 95 con
      estimado 80, `it.monto` es `undefined`.
- [x] `estado` no se guarda; sale de `montoReal`. `store.estaCubierto()` es el
      único lugar que decide qué es "pagado", y `camposEditables()` descarta
      cualquier `estado` que llegue en un parche.
- [x] `totalCubierto + totalFaltante === totalEstimado`, siempre. Por
      construcción (son la misma suma partida en dos), con un ajuste final que
      absorbe solo el ruido de coma flotante.
- [x] Pagar no destruye el estimado. Caso manual: estimado 80, pago 95, el
      estimado sigue en 80 y la fila muestra `+S/ 15.00`.
- [x] Clonar copia estimados y pone `montoReal` en `null`.
- [x] Los datos existentes se migran sin cambiar ningún número.
- [x] Cero regresiones en `crud-suite`: 27 PASS / 4 INCON / 3 FAIL, los mismos
      3 FAIL preexistentes.
- [x] Ningún cambio en `supabase-store.js`, `config.js`, `index.html` ni
      `styles.css`.

## Ruta

Delegado directo, un solo escritor. El orquestador ya decidió el modelo y fijó
el alcance; el escritor implementa y verifica. No re-investiga ni re-debate las
decisiones D1-D8.

## Progreso

Fase 1 cerrada. Se implementó D1 a D8 completas.

### Qué se cambió, por decisión

- **D1** — `addBudgetItem()` arma `{id, concepto, montoEstimado, montoReal,
  tipo, rango}`. Acepta `monto` como alias de entrada, pero nunca lo guarda.
- **D2** — `estado` sale del ítem. Aparece un solo predicado,
  `store.estaCubierto(item)`, que es `montoReal !== null`. `toggleBudgetItemStatus()`
  escribe o borra `montoReal`; `camposEditables()` descarta `estado`.
- **D3** — `calculateMonthTotals()` devuelve `totalEstimado`, `totalReal`,
  `totalCubierto`, `totalFaltante`, `desvio` y `progresoCubierto`. Los subtotales
  por sección ahora suman `montoEstimado`.
- **D4** — `clonarItemPresupuesto()` copia concepto, estimado, tipo y rango, con
  `montoReal: null`.
- **D5 + D6** — `migrarItemPresupuesto()` corre dentro de `sanear()`, idempotente.
- **D7** — `tipo` y `rango` intactos, sin participar de cálculos nuevos.
- **D8** — movimientos intactos. Se verificó que `sanear()` los sanea con reglas
  separadas: `addMovement`, `updateMovement`, `toggleMovementStatus` y el feed
  siguen usando `monto`/`estado`.

### Interfaz (mínimo indispensable)

1. La fila muestra el estimado y, si hay real, el real con su diferencia.
2. El toggle de pago escribe o borra `montoReal`.
3. Pagar pide el importe real con el estimado a la vista.
4. El importe real arranca en el estimado: un fijo se confirma sin escribir
   nada, y se corrige escribiendo arriba del valor precargado. **Se reutilizó el
   modal de pago variable existente** para fijos y variables: no había otra
   superficie donde corregir el real, y agregar campos habría exigido tocar
   `index.html`.
5. La barra pasó a `Estimado / Real / Cubierto + Falta`.

### Decisiones que hubo que tomar dentro del alcance

- **`totalDesembolsado` usa `totalReal`, no `totalCubierto`.** Alimenta el
  balance, que es plata que salió de verdad; mezclarle un estimado lo
  falsearía. Con datos migrados las dos coinciden (D5 les da el mismo número),
  así que no mueve nada de lo que la app mostraba antes.
- **Los movimientos se sanean aparte del presupuesto** dentro de `sanear()`.
  Compartían el mismo bucle; migrarlos juntos los habría roto.
- **`camposEditables()` recibe un flag `esPresupuesto`.** La comparte
  `updateMovement`, que sí necesita `monto`/`estado`. Sin el flag, editar un
  movimiento lo renombraría a `montoEstimado`.
- **La etiqueta "Total de egresos" del donut pasó a "Total estimado"** en
  `charts.js`. El gráfico no se rediseñó: solo cambió el nombre, porque el
  número ya no es lo gastado y el plan exige no mezclar estimado con real sin
  nombrarlo.

### Comprobaciones actualizadas (no se borró ninguna)

En `store-fix-suite.mjs`, 4 fallaron por leer el campo retirado y se
actualizaron al modelo nuevo conservando su intención: `addBudgetItem acepta un
monto válido como texto`, `ningún monto persistido es null/NaN`, `el monto nuevo
se aplicó` y `el resto de los campos sí se aplicó`. Además se repararon dos que
habían quedado **vacuas** (comparaban `undefined` contra `undefined` y pasaban
sin comprobar nada): `el monto original quedó intacto` y
`ningún monto persistido es Infinity`. Se agregó `el monto real persistido es un
número o null`.

En `crud-suite.mjs`, 6 tests leían `item.monto` / `item.estado` y se actualizaron:
`expense.create.servicios-fijos`, `expense.create.variables`, `expense.edit`,
`expense.edit.variable`, `month.switch` (calculaba su propio valor esperado con
el campo muerto) y las dos aserciones migradas de `month.create.clone`.

`expense.toggle.pagado-pendiente` se **reescribió**: antes comprobaba que el chip
alternara al instante, y ese comportamiento cambió a propósito. Ahora cubre las
dos mitades —pagar abre el modal, deja el estimado intacto y registra el real;
despagar borra el real sin preguntar— y verifica que el estimado sobreviva al
ida y la vuelta.

### Bloqueos y pendientes

- **Ninguna de las 8 decisiones quedó sin hacer.** No hubo bloqueos reales.
- **Los 3 FAIL de `crud-suite` son los preexistentes** y ajenos a esta fase:
  `expense.edit.whitespace-concepto`, `month.create.clone`, `month.delete`.
- **`month.create.clone` sigue fallando por sus causas originales** (clona 6
  ítems en vez de 5, clona extras y copia notas). Sus dos aserciones migradas a
  `montoReal`/`montoEstimado` ahora pasan.
- **Consecuencia visual menor para la Fase 3**: la celda de la fila con dos
  renglones descentra el chip de estado de esa fila, y la barra de cifras ahora
  muestra cuatro cifras en vez de tres importes. Ninguno rompe nada y no se
  tocó `styles.css`, que está fuera de alcance.

### Comandos ejecutados

| Comando | Resultado |
|---|---|
| `node --check js/store.js` | exit 0 |
| `node --check js/app.js` | exit 0 |
| `node --check js/charts.js` | exit 0 |
| `node odd/tasks/store-fix-suite.mjs` | `75/75 comprobaciones OK.` |
| `node odd/tasks/crud-suite.mjs` | `27 PASS / 3 FAIL / 4 INCON`, 0 fallos de infraestructura, 0 requests a Supabase |
| `node odd/tasks/fase1-manual.mjs` | `CASO MANUAL: OK` (14 pasos) |
| `node odd/tasks/fase1-migracion.mjs` | `MIGRACION: OK` (15 pasos) |

Las dos últimas son comprobaciones nuevas escritas para esta fase, porque ni
`store-fix-suite` ni `crud-suite` cubren la migración ni el caso de pagar un fijo
por debajo o por encima del estimado.

### Caso manual verificado

Estimado 80, pagado a 95 por la interfaz: el estimado sigue en 80, `montoReal`
queda en 95, la fila muestra `S/ 80.00` y `Real S/ 95.00 (+S/ 15.00)`, y
`totalCubierto (80) + totalFaltante (616.34) === totalEstimado (696.34)`.