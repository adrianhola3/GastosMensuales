# Seguridad de credenciales y veracidad del estado de conexión

## Objetivo

Sacar del bundle público la credencial de administrador, cerrar la escalada de rol
por `sessionStorage`, dejar de reescribir datos del usuario en `sanear()`, y hacer
que el indicador de conexión diga la verdad.

## Problema

1. La contraseña del administrador estaba escrita en claro en `js/app.js` y
   `js/supabase-store.js`, llegó a `origin/main` (commits `a4fa1a1`, `c74428f`)
   y GitHub Pages la servía sin autenticación. No se transcribe acá: el valor
   exacto está en esos dos commits y debe considerarse comprometido.
2. `obtenerSesion()` otorgaba rol `admin` si `sessionStorage` decía `admin`.
   `activarAdminLocal()` era un bypass explícito de la misma puerta.
3. `sanear()` reemplazaba `montoEstimado === 0` por precios base hardcodeados y
   el resultado se re-subía a la nube.
4. El badge "En línea" se derivaba de "¿hay credenciales?", no de alcanzar el
   servidor. El proyecto `bgcgmofroibrxthvdlil.supabase.co` responde NXDOMAIN:
   todo guardado fallaba en silencio y la app corría solo en localStorage.

## Alcance

Solo cliente. No hay base viva sobre la que aplicar policies ni cuenta cuya
contraseña rotar: eso queda como acción del dueño del proyecto.

## Tareas

- [x] T1 — `js/app.js`: `obtenerSesion()` solo restringe, nunca otorga.
- [x] T2 — `js/app.js`: eliminar `esAdminOficial` y `finalizarComoAdmin`.
- [x] T3 — `js/app.js`: eliminar `activarAdminLocal` y sus listeners.
- [x] T4 — `js/supabase-store.js`: eliminar `asegurarSesionAdmin()`.
- [x] T5 — `js/supabase-store.js`: exponer `estadoRed()` real.
- [x] T6 — `js/app.js`: badge de conexión contra `estadoRed()`.
- [x] T7 — `js/store.js`: quitar `preciosBaseRecuperacion` de `sanear()`.
- [x] T8 — `js/config.js`: declarar modo local mientras no exista proyecto.
- [x] T9 — `index.html`: quitar el email del placeholder del login.

## Evidencia observada (sonda CDP contra la página real, puerto 9222)

| Comprobación | Resultado |
|---|---|
| `gastosRemoto.estadoRed()` | `local` |
| Badge de conexión | "Solo local" / `conn-offline` |
| `sessionStorage='admin'` → `obtenerSesion()` | `{"rol":"lector"}` — escalada cerrada |
| `body.read-only-mode` con storage manipulado | `true` |
| `sanear()` sobre ítem "Celular" con `montoEstimado: 0` | 0 antes, 0 después |
| Peticiones al proyecto muerto | 0 de 2 recursos (solo los dos CDN de jsDelivr) |
| Clic en el badge → modo administrador local | `admin`, read-only removido, mutación reversible |
| Errores de consola / excepciones | ninguno |
| `node --check` en los 5 archivos JS | OK |

## Pendiente (fuera del alcance del cliente)

- Recrear el proyecto Supabase, correr `sql/01-seguridad.sql`, crear el usuario
  admin con `app_metadata.role = 'admin'`, y recién entonces completar
  `config.js` y poner `modoLocal: false`.
- Rotar la credencial del administrador en cualquier servicio donde se haya
  reutilizado.
- La contraseña sigue en el historial de git y en el `app.js` que Pages sirvió
  hasta este commit: reescribir historia no es urgente, pero la credencial debe
  considerarse comprometida para siempre.

## Criterios de aceptación

- El valor de la credencial filtrada no aparece en el árbol de trabajo ni en el
  índice de git (búsqueda por el valor literal, sin transcribirlo acá).
- Escribir `admin` en `sessionStorage` no habilita la interfaz de edición.
- Un `montoEstimado` en 0 sobrevive a una recarga sin cambiar de valor.
- El indicador distingue "Solo local" / "En línea" / "Sin conexión".

## Verificación

Sin runner de tests: `node --check` sobre cada archivo tocado + arranque manual
de la página. Las suites de `odd/tasks/*.mjs` son sondas CDP, no unitarias.
