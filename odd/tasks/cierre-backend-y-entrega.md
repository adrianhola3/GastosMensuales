# Cierre del backend y de la entrega

> Registro de trabajo. Se actualiza con cada avance real, contra evidencia
> verificada, no contra memoria.

## Por que existe

El backend se reportaba muerto (NXDOMAIN) y en realidad estaba pausado por
inactividad del plan Free. Al restaurarlo aparecieron tres defectos que fallaban
en silencio y se corrigieron en el commit `407bf5d`. Este documento cubre lo que
quedo pendiente despues de ese commit.

## Tareas

| ID | Que | Estado | Evidencia |
| --- | --- | --- | --- |
| C1 | Publicar el parche de seguridad en la rama que sirve GitHub Pages | HECHO | Pages sirve `main`, no `master`: los 4 archivos publicados coinciden por hash con `main` y ninguno con `master`. `main` estaba 5 commits atras; avanzado a `407bf5d` por fast-forward. |
| C2 | Alinear el tipo de `public.gastos.id` con el esquema declarado | HECHO | `information_schema`: `id` paso de `integer` a `bigint`. Segunda corrida del archivo: sin cambios. Fila `id=1` intacta. |
| C3 | Runner de pruebas descubrible | HECHO | `package.json` con 9 scripts. `npm test` = 102 comprobaciones (`store-fix-suite` 75/75 + `provision-supabase.test` 27/27), exit 0. |
| C4 | Servidor local versionado | HECHO | `tools/servidor-estatico.mjs`: raiz calculada desde la ubicacion del script, guarda contra `../`, `cache-control: no-store`. |
| C5 | Integracion continua | HECHO | `.github/workflows/test.yml`: push a `main`/`master`, PR y manual; node 20; `npm test`; sin `npm ci` porque no hay dependencias. Ambas suites usan `os.tmpdir()`, no rutas de Windows. |
| C6 | Verificar sync en vivo entre dos pestanas | HECHO | Navegador headless real con perfil descartable. Cambio hecho por SQL en `data.meses['octubre-2026'].notas`; la app lo aplico sin recargar en menos de 1 s y volvio sola al restaurar. Documento reescrito identico: hash `e011dc88e5f13ea6` antes y despues. |
| C7 | Orden del repositorio | HECHO | 17 PNG movidos a `docs/capturas/` con `git mv` (renombres al 100%), con nota que los explica. Borrado el archivo `5)` (36 bytes, contenido `=COUNTIF(B4:G9,`). |
| C8 | Registro en el Vault | HECHO | Nota de estado `Web de Gastos Mensuales - Control de Gastos y Presupuesto`, bitacora de OpenCode, e indice regenerado con `vault-vistas.mjs` (13 notas, 0 sin metadatos). |
| C9 | Revocar el token de aprovisionamiento | HECHO | Borrado desde el panel (Supabase llama "Delete token" a revocar un PAT; no hay endpoint de Management API). Verificado: `GET /v1/projects` devuelve 401. Archivo `.supabase_token` eliminado. |

## Hallazgo: Realtime solo manda las columnas que cambiaron

La replicacion logica no manda la fila entera en un UPDATE, sino las columnas
modificadas. Un `update` que solo toca `updated_at` llega con:

```json
{ "new": { "id": 1, "updated_at": "..." }, "old": { "id": 1 } }
```

Sin `data`. `js/supabase-store.js:537` deriva `nuevo = payload.new.data || null`, y
`js/store.js:523` cubre ese caso cayendo a `syncFromRemote()`, que relee el
documento completo. Por eso el sync funciona igual, pero **un arnes que mute solo
`updated_at` mide el camino de respaldo y no el principal**. La prueba valida
cambia `data`.

Consecuencia practica: no hace falta `REPLICA IDENTITY FULL` para este caso de
uso, porque la app siempre reescribe el documento entero.

## Correcciones al diagnostico inicial

- **"La app no tiene tests" era falso.** `odd/tasks/` tiene suites reales:
  `store-fix-suite.mjs` (headless, 75/75), `crud-suite.mjs` (CRUD por la UI real),
  `adversarial-suite.mjs`, y `sandbox.mjs` como arnes aislado. Lo que faltaba era un
  runner, no pruebas.
- **"El clic no hacia nada" era falso.** Tocar un gasto pendiente abre el modal de
  pago; no escribe hasta confirmar. El script de prueba no confirmaba el modal.
- **"`apply` rota la contrasena en cada corrida" era falso.** Reutiliza
  `estado.adminPassword` si ya existe (`estado.adminPassword || nuevoSecreto(18)`).
- **"`sandbox.mjs` sirve para probar Realtime" era falso.** Marca `window.__sandbox`
  y `suscribirCambios` (supabase-store.js:524) retorna temprano si existe: el
  sandbox desactiva justo lo que hay que medir.

## Nota sobre `updated_at`

Un trigger `BEFORE UPDATE` (`gastos_touch_updated_at`) fuerza `updated_at = now()`
en cada escritura, asi que ese campo no se puede restaurar a un valor pasado. Es
correcto: refleja la ultima escritura real. Lo que se verifica es que `data` quede
identico.

## Riesgo permanente

El plan Free pausa el proyecto por inactividad. Cuando vuelva a pasar, el sintoma
es NXDOMAIN y la app leyendo solo del local. **Se restaura, no se recrea**, con
`POST /v1/projects/{ref}/restore` y despues `node tools/provision-supabase.mjs wait`.

Despues de revocar el token ya no hay acceso por Management API. Para volver a
aplicar SQL hace falta generar un PAT nuevo y guardarlo en `.supabase_token`.
