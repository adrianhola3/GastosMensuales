# Feature: aplicar la skill apple-web-design a la Web de Gastos Mensuales

## Objetivo

Reestilizar la aplicacion web de gastos mensuales con el sistema de la skill
`apple-web-design` (tokens medidos de apple.com, tipografia disciplined, grid,
materiales, motion y reglas anti-slop), conservando su identidad oscura
"Neo-Fintech Obsidian" y toda su funcionalidad.

## Problema

La app se ve como tipica salida de IA: dashboard oscuro de alto contraste con
botones grandes, iconos decorativos de mas, brillos y sombras pesadas. El
usuario quiere que se parezca a las webs de Apple.

## Decisiones tomadas

- **Se mantiene el tema oscuro.** El README declara el diseno "Dashboard
  Neo-Fintech, interfaz oscura de alto contraste (Obsidian)" como decision
  consciente. Convertirlo a claro destruiria la identidad de un panel financiero
  que se usa de noche. Se aplica el SISTEMA de la skill, no su paleta por defecto.
  La skill provee los tokens oscuros via `.theme-dark`.
- **Fuentes:** se aplica la regla de la skill (stack del sistema) pero se
  CONSERVA un mono de tabular para cifras, porque en un panel financiero los
  numeros alineados son una necesidad funcional, no decorativa. SF Pro y SF Pro
  Mono estan PROHIBIDOS por licencia (ver skill Hard Rules).
- **No se rompen IDs ni clases.** `js/app.js` (64 KB) ata eventos al DOM.
  Cualquier renombre rompe la app. Solo seallows cambios presentacionales.

## Alcance

- Reestilizar `css/styles.css` con el sistema de tokens.
- Ajustar `index.html` solo donde cambie la estructura presentacional.
- NO tocar la logica en `js/`.

Fuera de alcance: agregar funcionalidades, cambiar la arquitectura, migrar a
un framework, tocar Supabase o la persistencia.

## Seguridad y rollback

- **Si hay repositorio git, pero con CERO commits.** El branch `master` no tiene
  ningun commit, asi que todo aparece como untracked y `base_tree` es siempre el
  arbol vacio `4b825dc6...`. No hay baseline local contra el cual diffear.
- BACKUP OBLIGATORIO antes de la primera escritura, con hashes. Este feature
  doc se creo DESPUES del backup.
- Los secretos (`.github_token`, `.github_oauth`, `.supabase_db_password`)
  estan en texto plano y YA estan cubiertos por `.gitignore`. El propio
  `AGENTS.md` lo documenta. No leerlos ni mostrarlos. No tocar esa parte.
- Despliegue via `node sync_github.js "<mensaje>"`.tiene `--dry-run`: se usa
  PRIMERO el dry-run y se revisa antes de escribir en GitHub.

## Tareas

- [x] T1 Backup con hashes de los 8 archivos de codigo.
- [x] T2 Mapa del contrato DOM y del sistema de diseno actual.
- [x] T3 Reescritura de `css/styles.css` con el sistema de tokens.
- [x] T4 Ajuste presentacional de `index.html` si hace falta.
- [x] T5 Verificar: sin overflow horizontal, JS intacto, sin regresiones.
- [x] T6 `sync_github.js --dry-run` y revisar.
- [x] T7 Desplegar de verdad.
- [x] T8 Verificar el sitio live.
- [ ] T9 Mandar el link por Telegram. **BLOQUEADO: no existe mecanismo.**
      Telegram Desktop esta instalado pero no hay bot, token, chat_id ni script.
      Automatizar el GUI exigiria `keybd_event`/`SendKeys`/`SetForegroundWindow`,
      que las reglas del usuario vetan explicitamente. Necesita decision del
      usuario (crear bot con BotFather, o compartir el link a mano).

## Fuente de verdad de diseno

Skill: `C:\Users\User\.claude\skills\apple-web-design\SKILL.md`
Tokens: `C:\Users\User\.claude\skills\apple-web-design\references\apple-com-tokens.md`
Motion: `C:\Users\User\.claude\skills\apple-web-design\references\motion-physics.md`
CSS base: `C:\Users\User\.claude\skills\apple-web-design\assets\base.css`
Esqueleto: `C:\Users\User\.claude\skills\apple-web-design\assets\landing-skeleton.html`

## Mapa del proyecto

`C:\Users\User\AppData\Local\Temp\opencode\gastos-map.md`

## Entrega

Link live: https://adrianhola3.github.io/GastosMensuales/

## Evidencia del despliegue (2026-10-02)

**Publicado.** `node sync_github.js "Reestilizado con el sistema de diseno
apple-web-design: tokens, tipografia y grid"` -> 2 `[SUBIDO]`, 14 `[AL DIA]`,
0 errores.

Commits (uno por archivo, los crea el propio script):
- `index.html` -> blob `30ba1ab`
- `css/styles.css` -> blob `3f96ff3`

Verificacion: los bytes del repo remoto y los de la web servida coinciden con
los locales (mismo SHA de blob git), o sea que no hay desalineacion local vs live.
Ojo: GitHub Pages reconstruye por separado. Durante ~1 minuto la web siguio
sirviendo la version anterior (`last-modified` del dia previo); recien al
siguiente intento sirvio los bytes nuevos.

**Publicado SIN veredicto de review nativo.** El gate de RDD arranco bien
(lineage `review-982a161eb1d59329`, riesgo `medium`) y el usuario aprobo el
consent, pero el lente `review-reliability` no se pudo despachar:
`opencode_review_transport_binding_invalid`, dos veces identico, antes de ejecutar
el subagente. Es un fallo del transporte del cliente, no de Gentle AI. El review
es informativo y nunca autoriza la entrega, asi que el usuario decidio publicar
igual, informado. La lineage quedo abierta en estado `reviewing`, sin aprobar y
sin autoridad consumida.

Verificacion funcional pendiente: **T5 se hizo en local pero no se re-verifico en
el navegador real despues de publicar.** Si hay una regresion visual, el sitio
live es la unica fuente de verdad.