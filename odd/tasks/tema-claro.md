# Feature: tema claro (Light) con variante oscura preservada

## Objetivo

El usuario pidio que la web "no sea tan oscura": puede combinar colores, pero tiene
que seguir voseando algo nuevo y profesional al estilo de Apple. Autorizo publicar
sin volver a preguntar.

## El problema real: no es cambiar colores

Los tokens anteriores estaban **calibrados para fondo oscuro**. Voltearlos tal cual
produce una web ilegible, y no es hipotetico:

- Los grises de texto (`--text-muted`, `--text-secondary`) estaban subidos a 7.04:1
  contra un fondo de tarjeta casi negro. Sobre fondo claro ese MISMO valor cae muy
  por debajo de 4.5:1.
- Los acentos de categoria tienen luminosidad alta para leerse sobre negro:
  `--cat-servicios` #93acbd, `--cat-personales` #a99bbf, `--cat-movimientos`
  #8fb7a3, `--cat-extras` #c3b398. Sobre blanco **desaparecen**.
- Los hairlines de oscuro son mas claros que la superficie. En claro se invierten:
  mas grises, nunca mas oscuros que la superficie.
- El verde de "Balance neto" y el rose de "Pendiente" tambien dependen del fondo.

Asi que: **los mismos tonos no sirven. Hay que recalibrar, no invertir.**

Medido con los MISMOS tokens oscuros, poniéndolos sobre blanco. La última columna
es lo que habría pasado con "dar vuelta los colores":

| token | sobre #0f1015 (medido) | sobre #ffffff | veredicto |
|---|---|---|---|
| `--text-muted` #8c93a1 | 6.16:1 | **3.09:1** | FALLA 4.5 |
| `--text-secondary` #a9afbd | 8.64:1 | **2.20:1** | FALLA 4.5 |
| `--text-main` #f1f2f4 | 16.96:1 | **1.12:1** | blanco sobre blanco |
| `--accent-primary` #94a3b8 | 7.41:1 | 2.56:1 | invisible |
| `--cat-servicios` #93acbd | 8.03:1 | 2.37:1 | casi invisible |
| `--cat-personales` #a99bbf | 7.35:1 | 2.58:1 | casi invisible |
| `--cat-movimientos` #8fb7a3 | 8.57:1 | 2.22:1 | casi invisible |
| `--cat-extras` #c3b398 | 9.25:1 | 2.05:1 | casi invisible |
| `--hairline` rgba(255,255,255,.09) | filete visible | compuesto sobre blanco = `rgb(255,255,255)` | **no existe** |

La tabla sale de `odd/tasks/contraste.mjs` con `parse()` y `ratio()` sobre los
valores de la derecha. Ninguno de los ocho textos passes 4.5:1, y los cuatro
acentos de categoría quedan por debajo de 3:1, que es el mínimo incluso para un
elemento no textual.

## Direccion

Claro por defecto, con la variante oscura **preservada bajo `html.theme-dark`**, que
es como themea apple.com. La skill prohibe explicitamente `prefers-color-scheme`
("apple.com: 0"), asi que NO se usa media query: el tema se controla por clase.

No se agrega toggle de UI: es alcance extra y agrega riesgo. La clase queda lista
para que un toggle se agregue despues sin rehacer tokens. Para probarlo:
`document.documentElement.classList.add('theme-dark')`.

Direccion de arte: superficie clara casi neutra, un solo acento de accion
(systemBlue `#0088FF`, no `#007AFF` segun la skill), y los acentos de categoria
recalibrados mas oscuros y desaturados para seguir siendo legibles y sin gritar.
Se puede combinar color, pero el color sigue significando **estado o accion**.

---

# TOKENS CLAROS, con su contraste medido

Todos declarados en `:root` (`css/styles.css` §1). El contraste sale de
`odd/tasks/contraste.mjs` (token contra token, 37 pares) y se CONFIRMA en el
navegador con `odd/tasks/tema-claro.mjs` (94 pares reales, composicion del fondo
real de cada elemento).

## Superficies

| token | valor | rol | [procedencia] |
|---|---|---|---|
| `--bg-canvas` | `#f5f5f7` | detrás del rail y del drawer | [NV] |
| `--bg-surface` | `#ffffff` | LA superficie continua de contenido | derivado |
| `--bg-card` | `#ffffff` | alias que lee `js/charts.js` | derivado |
| `--bg-chrome` | `#ffffff` | chrome flotante (sin consumidor hoy) | derivado |
| `--bg-inset` | `#f2f2f5` | campos, barras de progreso, tooltip | derivado |
| `--bg-raised` | `#ececef` | hover | derivado |
| `--material-bg` | `rgba(250, 250, 252, 0.8)` | material del chrome flotante | **[V] §3** |

`--bg-surface` vs `--bg-canvas` miden **1.09:1**: la separación del rail existe,
pero por el filete, no por el fondo. Es lo que se pidió (superficie casi neutra).

## Filetes — la inversión que hizo falta

| token | claro | oscuro (preservado) |
|---|---|---|
| `--hairline` | `rgba(29, 29, 31, 0.12)` **[V]** (separator de la skill) | `rgba(255, 255, 255, 0.09)` |
| `--hairline-strong` | `rgba(29, 29, 31, 0.20)` [NV] | `rgba(255, 255, 255, 0.17)` |
| `--hairline-focus` | `rgba(29, 29, 31, 0.36)` [NV] | `rgba(255, 255, 255, 0.32)` |

En oscuro el filete es **más claro** que la superficie porque la superficie es casi
negra. Ese mismo valor sobre blanco es invisible. En claro es **negro con alpha
bajo**: más gris que la superficie y nunca más oscuro.

## Texto

| token | valor | contraste | [procedencia] |
|---|---|---|---|
| `--text-main` | `#1d1d1f` | **16.83:1** sobre `#ffffff` | **[V] §2**: es el color de body de apple.com, medido |
| `--text-secondary` | `#5b5f67` | **6.41:1** sobre `#ffffff`, 5.88 sobre canvas, 5.53 sobre raised | derivado |
| `--text-muted` | `#656972` | **5.50:1** sobre `#ffffff`, **4.92:1** sobre `--bg-inset` | derivado |

**La rampa de tres niveles está comprimida a propósito.** Con mínimo 4.5:1 sobre la
superficie más oscura donde aparece cada nivel no queda mucho hueco: el paso entre
secundario y terciario es de 6.41 a 5.50, y no se puede bajar más sin caer de 4.5
sobre `--bg-raised`. Lo que sostiene la jerarquía en esta app es el **tamaño**
(11-13px contra 32px) y el peso, no el salto de gris. Está escrito en el CSS.

## Acento de acción — uno solo

| token | claro | oscuro (preservado) |
|---|---|---|
| `--accent-primary` | **`#0088ff`** **[V] §7** systemBlue de la HIG | `#94a3b8` (Titanium Silver) |
| `--accent-primary-hover` | `#4da3ff` [NV] | `#aab4c2` |
| `--accent-primary-wash` | `rgba(0, 136, 255, 0.10)` | `rgba(148,163,184,0.10)` |
| `--accent-primary-wash-strong` | `rgba(0, 136, 255, 0.18)` | `rgba(148,163,184,0.18)` |
| `--accent-primary-border` | `rgba(0, 136, 255, 0.42)` | `rgba(148,163,184,0.42)` |
| `--accent-on-primary` | `#0b0b0c` **(token NUEVO)** | `#0a0b0e` |
| `--focus-ring` | `#0088ff` **[V] §7** | `#0088ff` **[V] §7** (igual en los dos) |

`#0088FF` es exactamente el systemBlue vigente de la HIG (R-0,G-136,B-255). No es
`#007AFF`, que la skill prohíbe por ser el valor histórico de iOS 7-12 que solo
aparece en fuentes de terceros.

**`--accent-on-primary` no existía.** `.btn-primary` traía `#0a0b0e` escrito a
mano, o sea el fondo del tema oscuro; sin token, el tema claro heredaba un color
que ya no era el fondo de nada.

## Estado: ingreso / gasto / balance

| token | claro | contraste medido | oscuro (preservado) |
|---|---|---|---|
| `--accent-emerald` | `#1f7a52` | 5.30:1 sobre superficie, 5.13 sobre el material del topbar | `#74b496` |
| `--accent-rose` | `#b03a48` | 5.92:1 / 5.63 | `#bc767d` |
| `--accent-cyan` | `#2b6c8c` | 5.79:1 | `#76a0b2` |
| `--text-emerald` | `#1f7a52` | 5.30:1 | `#98c6b1` |
| `--text-rose` | `#b03a48` | 5.92:1 (también a 13px en `.notes-smart-box`) | `#cf9a9e` |
| `--text-cyan` | `#2b6c8c` | 5.79:1 | `#9db8c6` |

`--accent-emerald` y `--accent-rose` los escribe `app.js:550` en
`#topbarBalanceValue`, que es **14px**: texto normal, no texto grande. Por eso los
oscuros también se midieron contra la superficie y no contra un blanco ideal.

## Acentos de categoría — recalibrados, no invertidos

La regla no es "oscurecer y ya". Los cuatro se ** resolvieron a la MISMA
luminancia WCAG (0.1460)** conservando el hue de los oscuros. Es lo que hace que se
lean como familia y no como arcoíris, y es una propiedad **medible**, no una
impresión.

| token | claro | luminancia WCAG | contraste | oscuro (preservado) |
|---|---|---|---|---|
| `--cat-servicios` | `#506e82` | 0.1447 | **5.39:1** | `#93acbd` (8.03:1) |
| `--cat-personales` | `#786197` | 0.1478 | **5.31:1** | `#a99bbf` (7.35:1) |
| `--cat-movimientos` | `#4a745d` | 0.1474 | **5.32:1** | `#8fb7a3` (8.57:1) |
| `--cat-extras` | `#7c6849` | 0.1467 | **5.34:1** | `#c3b398` (9.25:1) |
| `--cat-matrix` / `--cat-trend` / `--cat-categories` | `#6d727a` | 0.1464 | **4.84:1** | `#9aa3b2` (7.47:1) |

Los cuatro miden entre 5.31 y 5.39: se distinguen **sin gritar**. Los antiguos
medían 7.35 a 9.25 contra una tarjeta casi negra, entre 1.6 y 3 veces el mínimo y
sin necesidad, y sobre blanco caían a 2.05-2.58:1.

Los tres neutros son secciones estructurales, no categorías: van en gris.

## Velo y sombra del drawer — tokenizados

| token | claro | oscuro (preservado) |
|---|---|---|
| `--scrim` | `rgba(0, 0, 0, 0.32)` | `rgba(0, 0, 0, 0.5)` |
| `--drawer-shadow` | `24px 0 48px -32px rgba(29, 31, 38, 0.42)` | `... rgba(0, 0, 0, 0.8)` |

El 0.5 estaba bien calibrado para una app casi negra: al 50% sobre `#0f1015` el
contenido queda en el medio de su propio rango. Sobre blanco el mismo 0.5 baja la
página entera a `rgb(128,128,128)` y la app se ve tapada con niebla. Medido en la
captura: era el defecto visual más grande del tema claro.

---

# TOKENS OSCUROS PRESERVADOS: dónde viven y cómo se activan

Viven en el bloque **`html.theme-dark`** de `css/styles.css` §1b, con los valores
textuales que estaban en `:root` antes de esta feature. Se activan putting la
clase en `<html>`:

```js
document.documentElement.classList.add('theme-dark');   // oscuro
document.documentElement.classList.remove('theme-dark'); // claro (por defecto)
```

- **NO hay `@media (prefers-color-scheme)`.** Verificado: 0 en toda la hoja (las 3
  apariciones de la cadena están en comentarios). Es lo que hace apple.com: 0
  ocurrencias en sus 5 hojas, mientras `prefers-reduced-motion` tiene 34 reglas
  vivas [tokens §6, V].
- Se agregó `color-scheme: light` en `:root` y `color-scheme: dark` en
  `html.theme-dark`. No es una media query: le dice al navegador qué paleta usar
  para los controles nativos (la lista del `<select>`, las barras de scroll, la
  selección de texto). `html.theme-dark` tiene especificidad (0,1,1) contra (0,1,0)
  de `:root`, así que gana sin `!important`.
- **35 tokens** de color en `.theme-dark`, **115** en `:root` (los de tipografía,
  espaciado, radios, layout y motion no se duplican: son independientes del tema).
- El **único token que cambia de hue entre temas** es `--accent-primary`: en claro
  es systemBlue, en oscuro sigue siendo el neutro de identidad. Es lo que hace que
  la variante oscura sea "preservada" y no "recalculada". `--focus-ring` es
  `#0088ff` en los dos: el indicador de teclado no cambia de color con el tema.

---

# LAS 4 RONDAS, con los 7 CRITERIOS

Capturas en `odd/tasks/capturas/`. Reportes: `tema-FINAL.report.json`,
`tema-FINAL.report.json`, `recorrido-FINAL.report.json`, `modales-FINAL.report.json`.

## Ronda 1 — el error de método que hubo que corregir antes de mirar nada

Medí el tema oscuro "preservado" y el claro "nuevo" y salieron **15 y 4 fallos de
AA**, con colores que no tenían sentido: en oscuro aparecía `rgb(29,29,31)`
(`--text-main` del tema claro) y en claro `rgb(241,242,244)` (el oscuro). El mismo
valor, invertido, en el mismo elemento.

**No era un bug del CSS.** La causa: la ventana del target no produce frames, y el
reloj de transiciones CSS solo avanza en un frame. `getComputedStyle` fuerza
recalculo de estilo pero lee la transición en su valor de inicio. Se veía también en
la captura: las dos cifras de balance quedaban del color del tema anterior.

Se corrigió forzando frames: `Page.bringToFront` +
`Emulation.setFocusEmulationEnabled`, y una captura **descartada** después de cambiar
el tema (`pump()` en `odd/tasks/cdp.mjs`). La primera sonda dio 0 charts pintados
también por lo mismo: Chart.js dibuja en `requestAnimationFrame`.

Con eso: **claro 94 pares 0 fallos, oscuro 129 pares 0 fallos.** Y el donut pasó de
"1 color, negro puro" a **89 colores distintos** con los tres acentos de categoría
presentes.

| # | Criterio | Ronda 1 (con el bug de método) |
|---|---|---|
| a | ¿Se lee todo el texto? | **NO** — 15+4 pares bajo 4.5, por el bug de medición |
| b | ¿Los acentos se distinguen sin gritar? | **NO** — el tick del rail salía `#94a3b8` sobre `#f5f5f7` |
| c | ¿Los hairlines se ven sin pesar? | **NO** — el `--hairline` viejo es blanco con alpha, invisible en claro |
| d | ¿La jerarquía manda? | **SI** — el tamaño no depende del bug |
| e | ¿El donut y las barras se leen? | **NO** — 0 px pintados, el lienzo nunca se dibujó |
| f | ¿Nuevo y profesional, no claro lavandería? | No evaluable |
| g | ¿apple.com? | No evaluable |

## Ronda 2 — el tema claro funcionando, y lo primero que no cerraba

94 pares, 0 fallos, más bajo **4.92:1**. Foco: 40 controles con Tab real, 0 sin
anillo. Sin overflow a 1440/1280/1024. Rail 900/900, 0 dígitos, 0 meses.

Fallos reales que aparecieron y se corrigieron:

1. **`#sidebarSearchInput` con `outline: 3px none`** (el que|Mat nominaba el
   enunciado). Y al medirlo aparecieron **dos más**: `.form-input-lg:focus` y
   `.notes-smart-textarea:focus` también ponían `outline: none` con especificidad
   (0,2,0), que gana a `:where(...):focus-visible` (0,1,0). **Todos los campos de
   los modales estaban sin anillo**, no solo el buscador. Los tres `outline: none`
   se borraron; el anillo de los modales ahora lo pone `:focus-visible` y el bloque
   `:focus` solo refuerza el filete del borde.
2. **El velo al 50%**: en la captura del modal la página entera salía
   `rgb(128,128,128)`, niebla. De ahí el `--scrim` tokenizado a 0.32 en claro.

| # | Criterio | Ronda 2 |
|---|---|---|
| a | ¿Se lee todo el texto? | **SI** — 94+129 pares, 0 fallos, más bajo 4.92 |
| b | ¿Los acentos se distinguen sin gritar? | **SI** — 5.31 a 5.39:1, misma luminancia |
| c | ¿Los hairlines se ven sin pesar? | **SI** |
| d | ¿La jerarquía manda? | **SI** |
| e | ¿El donut y las barras se leen? | **SI** — donut con 89 colores y los 3 acentos; barras en estado vacío con su línea |
| f | ¿Nuevo y profesional, no claro lavandería? | **Parcial** — el velo al 50% era el punto bajo |
| g | ¿apple.com? | **Parcial** |

## Ronda 3 — lo que se rompió al medir, y dosomodales con nombre cambiado

Al captures de 1024 salió **oscuro**: el script cambiaba el tema para medir los
lienzos oscuros y no volvía a claro antes del bucle de anchos. Fallo del guion.

Los ids de los modales también estaban mal en el primer intento: el de notas es
`modalMonthNotes`, no `modalNotes`; el de pago variable es
`modalPayVariableExpense`. Con los ids correctos: **4 modales abren y cierran,
133-137 pares, 0 fallos**, y el botón filled medido da fondo `rgb(0,136,255)` con
etiqueta `rgb(11,11,12)`, **5.59:1** a 13px y a 15px.

| # | Criterio | Ronda 3 |
|---|---|---|
| a | ¿Se lee todo el texto? | **SI** — incluidos 4 modales |
| b | ¿Los acentos se distinguen sin gritar? | **SI** |
| c | ¿Los hairlines se ven sin pesar? | **SI** |
| d | ¿La jerarquía manda? | **SI** |
| e | ¿El donut y las barras se leen? | **SI** |
| f | ¿Nuevo y profesional, no claro lavandería? | **SI, con una reserva**: la banda de KPI del Consolidado deja ~730px de aire por fila |
| g | ¿apple.com? | **Parcial** |

## Ronda 4 — la final

Cambios: `--scrim` y `--drawer-shadow` tokenizados y aligerados en claro; se
arreglaron el guion (limpieza de velos y backdrop), el recorrido con el `Tab`
corrido en Vista Mensual (en Consolidado daba 4 controles, un número que parece un
total sin serlo), y el conteo de "cajas visibles" con `checkVisibility()`.

| # | Criterio | Ronda 4 (final) |
|---|---|---|
| a | ¿Se lee todo el texto? | **SI** — 94 pares en Consolidado, 129 en Vista Mensual, 133 en el modal de notas. **0 fallos** en los dos temas |
| b | ¿Los acentos de categoría se distinguen sin gritar? | **SI** — 5.39 / 5.31 / 5.32 / 5.34:1, luminanciaWCAG 0.1447-0.1478. Se leen como familia |
| c | ¿Los hairlines se ven sin pesar? | **SI** — 19 filetes de 1 lado, ninguno oscuro |
| d | ¿La jerarquía tipográfica sigue mandando? | **SI** — 32px sección / 28px métricas / 17px título / 11-13px etiqueta |
| e | ¿El donut y las barras se leen sobre claro? | **SI** — donut 89 colores con los 3 acentos; barras en estado vacío con su línea y sin escala inventada |
| f | ¿"Nuevo y profesional" y no "claro lavandería"? | **Honesto: SI, con una zona floja.** Ningún tono está lavado: el mínimo es 4.92:1 y los acentos van entre 5.3 y 5.4. La zona floja es el **rail**, con ~570px de blanco entre el buscador y el pie, y la **banda de KPI del Consolidado** con ~730px de aire por fila. Las dos son de maquetación, no de color, y ya estaban antes |
| g | ¿apple.com o no? | **Parcial, y honesto.** Es apple.com en todo lo que es superficie, filete y tipografía: un solo azul de acción, cero sombras decorativas, cero emoji, iconos lineales de 1.5px, hairlines como único divisor, tipo grande con cifras tabulares. **No** es apple.com en tres cosas que no salen de CSS: la banda de 4 KPI con filetes verticales es un panel financiero, las 5 cápsulas de categoría son un control segmentado y no una tira de navegación local, y las cifras en mono a 32 y 40px no son el idioma de Apple |

---

# TABLA DE CONTRASTE COMPLETA DEL TEMA CLARO

Medida en el navegador. El fondo es el **compuesto real** de cada elemento,
incluyendo alpha y el material translúcido del topbar. El mínimo se aplica por
par: 4.5:1 texto normal, 3:1 texto grande (>=24px, o >=18.66px con peso >=700) e
indicadores no textuales.

Reporte: `odd/tasks/capturas/tema-FINAL.report.json`. Herramienta: `odd/tasks/probes.mjs`.

| ratio | mín | desde | foreground | fondo | pares | ejemplo |
|---|---|---|---|---|---|---|
| **4.92:1** | 4.5 | 11px | `rgb(101,105,114)` `--text-muted` | `rgb(242,242,245)` `--bg-inset` | 1 | `kbd.search-shortcut-badge` ("/") |
| 5.05:1 | 4.5 | 12px | `rgb(101,105,114)` | `rgb(245,245,247)` `--bg-canvas` | 2 | `span.brand-sub` |
| 5.13:1 | 4.5 | 14px | `rgb(31,122,82)` `--accent-emerald` | `rgb(251,251,253)` material | 1 | `#topbarBalanceValue` |
| 5.30:1 | 4.5 | 13px | `rgb(31,122,82)` | `rgb(255,255,255)` | 7 | `td.font-mono.text-right` (matriz) |
| 5.30:1 | **3** | 40px | `rgb(31,122,82)` | `rgb(255,255,255)` | 1 | `#kpiGlobalBalance` |
| 5.32:1 | 4.5 | 12px | `rgb(101,105,114)` | `rgb(251,251,253)` material | 1 | `span.kpi-mini-label` |
| 5.50:1 | 4.5 | 11px | `rgb(101,105,114)` | `rgb(255,255,255)` | 16 | `.metric-footer-info` |
| 5.88:1 | 4.5 | 12px | `rgb(91,95,103)` `--text-secondary` | `rgb(245,245,247)` | 2 | items del rail |
| 6.20:1 | 4.5 | 13px | `rgb(91,95,103)` | `rgb(251,251,253)` material | 1 | `#btnOpenNotesModal` |
| 6.41:1 | 4.5 | 13px | `rgb(91,95,103)` | `rgb(255,255,255)` | 40 | `p.view-subheading` |
| 15.46:1 | 4.5 | 14px | `rgb(29,29,31)` `--text-main` | `rgb(245,245,247)` | 2 | `h1.brand-title` |
| 16.28:1 | 4.5 | 14px | `rgb(29,29,31)` | `rgb(251,251,253)` material | 1 | `#activeMonthHeaderBadge` |
| 16.83:1 | 4.5 | 13px | `rgb(29,29,31)` | `rgb(255,255,255)` | 16 | `h3` |
| 16.83:1 | **3** | 32px | `rgb(29,29,31)` | `rgb(255,255,255)` | 3 | `h2.view-heading` |

**El más bajo que cumple: 4.92:1.** Los cuatro valores de estado que faltan en la
tabla de texto (5.30, 5.30, 5.13 y los de `--text-rose` / `--text-cyan`) están
agrupados arriba porque comparten combinación fondo/umbral.

Acentos no textuales (mínimo 3:1), leídos **del elemento**, no del token:

| elemento | claro | ratio | oscuro (preservado) | ratio |
|---|---|---|---|---|
| tick Servicios | `rgb(80,110,130)` | 5.39:1 | `rgb(147,172,189)` | 8.03:1 |
| tick Personales | `rgb(120,97,151)` | 5.31:1 | `rgb(169,155,191)` | 7.35:1 |
| tick Movimientos | `rgb(74,116,93)` | 5.32:1 | `rgb(143,183,163)` | 8.57:1 |
| tick Extras | `rgb(124,104,73)` | 5.34:1 | `rgb(195,179,152)` | 9.25:1 |
| tick matriz/gráficos | `rgb(109,114,122)` | 4.84:1 | `rgb(154,163,178)` | 7.47:1 |
| anillo de foco sobre superficie | `rgb(0,136,255)` | 3.52:1 | `rgb(0,136,255)` | 5.40:1 |
| anillo de foco sobre el canvas | `rgb(0,136,255)` | 3.23:1 | `rgb(0,136,255)` | 5.59:1 |
| botón filled, etiqueta | `#0b0b0c` sobre `#0088ff` | **5.59:1** | `#0a0b0e` sobre `#94a3b8` | 7.68:1 |
| botón filled, etiqueta blanca | `#ffffff` sobre `#0088ff` | **3.52:1 FALLA** | — | — |

**94 pares de texto + 10 de acentos + 2 de botón. 0 fallos de AA.**

---

# VERIFICACIÓN OBLIGATORIA

| comprobación | resultado |
|---|---|
| Contraste AA en tema claro, resuelto a `rgb()` | **94 pares, 0 fallos, mínimo 4.92:1** (129 en Vista Mensual, 133 en el modal de notas) |
| Contraste AA en tema oscuro | **129 pares, 0 fallos, mínimo 5.73:1**, con los valores anteriores intactos |
| 0 `console.error` en Vista Mensual y Consolidado, claro y oscuro | **0** en las cuatro |
| 0 excepciones | **0** en las cuatro |
| Sin overflow horizontal a 1440 / 1280 / 1024, en claro | **1440: 1425/1425 · 1280: 1265/1265 · 1024: 1009/1009** |
| `#appSidebar.scrollHeight <= clientHeight` en claro | **900 <= 900**, `overflow-y: hidden`, 0 scrollers internos |
| El rail sigue con 0 cifras y 0 meses | **0 dígitos, 0 `.month-pill-btn`** (en los dos temas) |
| Los dos canvas pintados y legibles sobre claro | **donut 420x280, 29 400/29 400 px, 89 colores** con los tres acentos; **barras 984x120**, estado vacío con su línea |
| `node --check` en los 5 JS | **los 5 OK** |
| Recorrido funcional en claro | **21 pasos, 21 OK, 0 FALLA** |
| Escrituras a Supabase | **12, todas interceptadas**, 0 llegaron a la red |

## Anillo de foco — medido enfocando de verdad

Con `element.focus()` real y `getComputedStyle` leído **en ese momento**, en los
dos temas, en Vista Mensual:

```
sidebarSearchInput   solid 2px rgb(0, 136, 255)   portador .sidebar-search-box
btnNavMes            solid 2px rgb(0, 136, 255)
btnNavPanel          solid 2px rgb(0, 136, 255)
btnToggleAuthMode    solid 2px rgb(0, 136, 255)
btnPrevMonth         solid 2px rgb(0, 136, 255)
btnNextMonth         solid 2px rgb(0, 136, 255)
btnOpenNotesModal    solid 2px rgb(0, 136, 255)
btnHeaderAddIncome   solid 2px rgb(0, 136, 255)
btnHeaderAddBudget   solid 2px rgb(0, 136, 255)
btnOpenNewMonthModal solid 2px rgb(0, 136, 255)
btnClearSidebarSearch  display:none al nacer -> no enfocable, se reporta aparte
```

Con **Tab real** (`Input.dispatchKeyEvent`, Vista Mensual, 40 pasos):
**40 controles, 0 sin anillo, los 40 con `:focus-visible: true`.**

Dos trampas de método, documentadas porque las dos dan veredictos falsos:

1. **`:focus-visible` no matchea un `<button>` enfocado por script** salvo que el
   navegador esté en modalidad teclado. Antes de cada `focus()` se manda una tecla
   `Shift` real. Sin eso, 5 de 10 controles daban "sin anillo" y la conclusión
   ("no hay anillo") era inventada.
2. **`#sidebarSearchInput` no lleva `outline` propio**: su anillo va en
   `.sidebar-search-box:focus-within`, que es lo correcto (`outline` sigue la forma
   real del control redondeado y no desplaza el layout). La sonda sube desde el
   input hasta el primer ancestro con anillo y reporta cuál es. Antes de esta
   feature el input **no tenía ni eso**: `outline: 3px none`.

## `prefers-reduced-motion`

Con `Emulation.setEmulatedMedia`, leyendo `getComputedStyle`:

```
transitionDuration  en .sidebar-nav-tab / .sidebar-search-input /
                     .neo-toast / .modal-sheet / .expense-card-item   1e-05s (los cinco)
animationDuration   en los mismos cinco                              1e-05s
```

Un solo bloque `@media (prefers-reduced-motion: reduce)` con alcance `*`, que cubre
también `animation-delay` y `transition-delay`.

## Conteos de la hoja (`css/styles.css`)

Conteo sobre el archivo, porque `document.styleSheets[].cssRules` es ilegible sobre
`file://`.

| métrica | valor | nota |
|---|---|---|
| `border:` (shorthand) | **13** | 10 con `1px solid` + 3 resets del propio reset. Sin cambio |
| `border-*: 1px solid` (filetes) | **19** | el único divisor. Sin cambio |
| `box-shadow` | **1** | el drawer a ≤1024px, ahora `var(--drawer-shadow)`. Cero decorativo |
| `outline: none` **declarado** | **0** | las 2 apariciones de la cadena están en comentarios |
| `outline` con anillo | **2** | sección 3 (`:focus-visible`) y `.sidebar-search-box:focus-within` |
| usos de `--radius-pill` | **9** | 5 categorías + 3 filtros del feed + toast. Los meses NO son pill |
| `transition` | **27** | 0 `transition: all` |
| `@keyframes` | **4** | `card-anim-in`, `card-anim-out`, `sheet-in`, `modal-shake` |
| `@media (prefers-reduced-motion)` | **1** | bloque único con alcance `*` |
| `@media (prefers-color-scheme)` | **0** | las 3 apariciones están en comentarios |
| `@font-face` | **0** | la única aparición está en la prosa que explica por qué |
| `color-mix()` **declarado** | **0** | los tokens son hex planos a propósito |
| `linear-gradient` | **2** | los dos del triángulo del `<select>`. No es degradado de color |
| `text-transform: uppercase` | **0** | — |
| emoji | **0** | en `index.html`, los 5 JS y el CSS |
| `<img>` | **0** en el DOM | los `<img>` que aparecen en los archivos están en comentarios |
| `<svg>` | 28 en `index.html` + 8 en plantillas de `app.js` | lineales, `currentColor`, 1.5px |
| tokens de color en `:root` | **115** (los de color, ~40) | |
| tokens de color en `html.theme-dark` | **35** | |
| balance de llaves del CSS | 335 abre / 335 cierra | |

## Contrato DOM

```
[IDS]       124   (antes 124)   perdidos 0   nuevos 0
[CLASSES]    60   (antes  60)   perdidos 0   nuevos 0
[ATRIBUTOS]   5   (antes   5)   perdidos 0   nuevos 0
```

**Sin cambios en el DOM.** Esta feature no agregan, quita ni renombra un solo id,
clase o atributo: solo hay CSS. `js/app.js`, `js/store.js`, `js/config.js`,
`js/supabase-store.js` y `js/charts.js` están **sin tocar** (verificado por
`LastWriteTime`: los 5 son de sesiones previas, `styles.css` es el único modificado).

---

# RECORRIDO FUNCIONAL EN CLARO — 21/21 OK

Método: `gastosRemoto.guardar` / `.iniciarSesion` / `.salirDeSesion` /
`.iniciarSesionConGithub` congelados con contadores **antes de la primera
interacción**, y el contador leído **después de cada paso**, para poder atribuir
cada intento. Reporte: `odd/tasks/capturas/recorrido-FINAL.report.json`.

| # | Funcionalidad | Resultado | Dato verificado |
|---|---|---|---|
| 1 | Vista Mensual al entrar | **OK** | `#viewMes.active`, `#btnNavMes.active`, `#viewPanel` inactiva |
| 2 | Consolidado: cambiar de vista | **OK** | `#viewPanel.active`, matriz de 6 filas |
| 3 | Volver a Vista Mensual | **OK** | 4 cajas visibles de 7 en el DOM (las 3 del Consolidado las oculta el ancestro) |
| 4 | Buscador | **OK** | "internet" -> 1 visible + "1 resultado encontrado"; "luz" -> 0 + "0 resultados"; limpiar -> 10 y el botón de limpiar se esconde |
| 5 | Los 6 periodos | **OK** | 6, 1 con `aria-pressed="true"` |
| 6 | Periodo activo coherente con el topbar | **OK** | los dos "Agosto 2026", regla de acento `rgb(0,136,255)` |
| 7 | Click en un periodo | **OK** | Septiembre 2026, 9 filas |
| 8 | Flechas anterior / siguiente | **OK** | Septiembre -> Octubre -> Septiembre -> Agosto |
| 9 | Las 4 categorias visibles | **OK** | Servicios 6 filas, Personales 3, Movimientos 0, Extras 1 |
| 10 | Un acento por categoria | **OK** | 7 tics, 5 colores distintos: los 4 de categoría + el neutro de las secciones estructurales |
| 11 | Selector de segmentos | **OK** | "Extras" apaga la tarjeta (`display: none`) y desactiva su cápsula; "Ver todo" la reactiva |
| 12 | Acordeón de sección | **OK** | 758.75 -> 139.36 -> 758.75 |
| 13 | Cifras del mes | **OK** | `S/ 0.00` · `S/ 699.34` · `S/ 0.00` "Equilibrado" · `0.0%` · "Gastos Pagados: S/ 0.00 de S/ 699.34" · "Pendiente: S/ 699.34" |
| 14 | El acento de estado solo va en la cifra del balance | **OK** | balance `rgb(43,108,140)` vs ingresos `rgb(29,29,31)` |
| 15 | Los dos lienzos pintados | **OK** | barras 984x120 y donut 420x280, los dos con acento presente |
| 16 | Notas: abrir y cerrar | **OK** | "Recordatorios y observaciones de Agosto 2026", cierra |
| 17 | Estado de conexión | **OK** | "En línea", `conn-badge conn-online` |
| 18 | Modo Lector / Administrador | **OK** | 18 `.admin-action-btn`: 0 visibles como Lector, 18 como Administrador |
| 19 | Modal de pago variable, **sin escribir** | **OK** | se abre desde una fila Variable+Pendiente (índice 5), título "Confirmar pago variable" |
| 20 | Cerrar el modal | **OK** | 0 overlays activos |
| 21 | `prefers-reduced-motion` | **OK** | los 5 elementos con transition y animation en `1e-05s` |

**Escrituras interceptadas: 12, repartidas así:**

| paso | escrituras | por qué |
|---|---|---|
| 2. Cambiar a Consolidado | 1 | `app.js:344/347` llama `store.save()` en `setActiveView` |
| 3. Volver a Vista Mensual | 1 | ídem |
| 7. Click en un periodo | 2 | `switchView('mes', id)` persiste `activeMonthId` |
| 8. Tres flechas de periodo | 6 | ídem, 2 por navegación |
| 15. Volver a Consolidado | 1 | `setActiveView` |
| 16. Abrir Notas | 1 | el modal dispara el guardado |

**0 llegaron a la red.** Son `store.save()` de navegación, es decir persistir
"qué vista y qué mes estás mirando". **No es una regresión de esta feature**: es
comportamiento de `js/app.js` y `js/store.js`, que no se tocaron, y una hoja de
estilos no puede disparar una llamada a Supabase. Lo que sí se verificó es que no
se disparara ninguna acción de **datos**: no se guardó, no se borró, no se agregó y
no se cambió el estado de ningún gasto. Por eso el paso 19 elige explícitamente una
fila `Variable` + `Pendiente`: en una fila `Fija` el mismo click llama a
`store.toggleBudgetItemStatus`, que **sí** es una escritura de datos.

`console.error`: **0**. Excepciones: **0**. Red 4xx/5xx: **0**.

---

# LO QUE VALORÉ DE `apple-com-tokens.md`, Y QUÉ QUEDÓ SIN VERIFICAR

| token | valor | sección | procedencia |
|---|---|---|---|
| `--text-main` | `#1d1d1f` | **§2** | **[V]** es el color de body de apple.com, medido con `getComputedStyle` |
| `--focus-ring` | `#0088ff` | **§7** | **[V]** systemBlue vigente de la HIG (R-0,G-136,B-255). No `#007AFF` |
| `--hairline` | `rgba(29,29,31,0.12)` | **[V]** vía `assets/base.css` | **[V]** `--color-separator` medido |
| `--material-bg` | `rgba(250,250,252,0.8)` | **§3** | **[V]** `--globalnav-background` de `globalheader.css` |
| `--material-backdrop-filter` | `blur(20px)` | **§3** | **[V]** sin `saturate(180%)`, que sigue desactivado |
| Cero `prefers-color-scheme` | 0 reglas | **§6** | **[V]** apple.com tiene 0; la clase es lo correcto |
| `prefers-reduced-motion` | 1 bloque, 5 reglas vivas | **§6** | **[V]** apple.com tiene 34 |
| `--radius-*`, tracking, leading | sin cambio | §2, §4 | **[V]** |

**Lo que quedó [NV] o derivado, y no se presenta como oficial:**

- `#f5f5f7` (canvas), `#f2f2f5` (inset), `#ececef` (raised). No hay superficie
  publicada por apple.com para una app como esta. Apple's §7 advierte que los
  valores "fluctúan entre releases"; se calibraron solo por contraste medido.
- Los tres grises de texto salvo `--text-main`. El archivo publica **un solo** par
  de color medido (body sobre fondo). La rampa de tres niveles es decisión propia y
  está comprimida por AA.
- Los cuatro acentos de categoría, los tres de estado, `#0b0b0c`,
  `#4da3ff`, `--hairline-strong`, `--hairline-focus`, `--scrim`,
  `--drawer-shadow`. Todos por contraste medido.
- **`--text-metrics: 1.75rem` (28px)** y **`--rail-width: 236px`**: ya eran [NV] en
  las rondas anteriores y esta feature no los tocó.

**No verificado en absoluto:**

- El tema oscuro **sobre un servidor real**. Todo se midió sobre `file://`, con el
  mismo dataset y el mismo navegador. Los valores están preservados textualmente y
  miden 7.35-9.25:1, así que el contraste no depende de dónde se mire.
- El **deployment en GitHub Pages**. Nada se publicó.
- **`prefers-reduced-transparency`**: la regla existe (§20) y se comprobó que sigue
  en la hoja, pero no se emuló.

---

# DECISIONES QUE NO ESTABAN ESPECIFICADAS

1. **`--accent-on-primary` es un token NUEVO y `.btn-primary` lo consume.** El
   botón filled tenía `#0a0b0e` escrito a mano: era el fondo del tema oscuro. Sin
   el token, el tema claro heredaba un color que ya no era el fondo de nada.
2. **La etiqueta del botón filled es casi negra, no blanca.** systemBlue vigente
   con etiqueta blanca mide **3.52:1** y el texto del botón es de 14px: no llega al
   4.5:1 que exige la consigna. Con `#0b0b0c` mide **5.59:1**. Es la única forma de
   tener el systemBlue exacto **y** AA medido. Verificado a 3x de escala:
   `capturas/tema-r4-zoom-boton-filled.png`. Si se prefiere el blanco de Apple, se
   cambia un token y se pierde AA en 5 botones.
3. **Los cuatro acentos de categoría se resolvieron por bisección a la misma
   luminancia WCAG (0.1460)**, no "a ojo". El método está en `contraste.mjs`.
4. **`--bg-inset` y `--bg-raised` se aclarararon** a `#f2f2f5` y `#ececef` para que
   el tercer nivel de texto tuviera margen. Con `#f2f2f4` / `#e8e8ec` el
   `--text-muted` daba 4.46 y 4.23 sobre esas dos superficies: dos pares bajo 4.5.
   El precio es que el hover se nota menos que en oscuro.
5. **`color-scheme: light` / `dark`.** No es una media query: es la paleta de los
   controles nativos. Sin esto, el `<select>` de los modales se abriría oscuro
   sobre una hoja clara.
6. **`--scrim` y `--drawer-shadow` tokenizados.** Eran los dos únicos colores
   sueltos de la hoja (más `rgba(0,0,0,0.5)` del velo). El 0.5 se bajó a 0.32 en
   claro. El oscuro conserva 0.5 y 0.8 exactos.
7. **Se borraron tres `outline: none`** (`.sidebar-search-input`,
   `.form-input-lg:focus`, `.notes-smart-textarea:focus`). El enunciado nombraba
   uno; los otros dos dejaban **todos los campos de todos los modales** sin anillo.
   Los bloques `:focus` quedaron solo con el cambio de filete del borde.
8. **El anillo del buscador sigue en la CAJA**, no en el input. `outline` sigue la
   forma real del control redondeado y no desplaza el layout. La sonda de foco sube
   desde el input hasta el primer ancestro con anillo y reporta cuál es, para que
   "sin anillo en el input" no se lea como "sin anillo".
9. **No se agregó toggle de tema.** La clase queda lista; el toggle es alcance
   extra y agrega riesgo.
10. **`js/charts.js` no se tocó.** Los gráficos leen tokens en runtime
    (`readToken`), así que cambian de color con el tema solos. El `setTheme` del
    arnés vuelve a llamar `renderGlobalCharts()` porque los lienzos ya pintados no
    se repintan solos al cambiar un token.
11. **Herramientas nuevas en `odd/tasks/`**: `contraste.mjs` (calibración),
    `cdp.mjs` (arnés CDP), `probes.mjs` (mediciones en la página),
    `tema-claro.mjs` (auditoría), `recorrido.mjs` (recorrido funcional),
    `modales.mjs`, `zoom.mjs`, `diag.mjs`, `diag2.mjs`.

---

# LO QUE NO QUEDÓ BIEN

1. **La etiqueta casi negra sobre systemBlue no es el idioma de Apple.** Se ve bien
   y pasa AA con 5.59:1, pero un botón filled de Apple tiene la etiqueta blanca. Es
   el precio de sostener el `#0088FF` exacto junto con el 4.5:1 exigido. Está
   aislado en un token y con el número anotado en el CSS.
2. **La rampa de texto de tres niveles está comprimida.** `--text-secondary` 6.41 y
   `--text-muted` 5.50 sobre blanco: 0.9 de diferencia. Con AA sobre
   `--bg-raised` no había margen para más. La jerarquía la sostienen el tamaño y el
   peso, no el gris. Si en algún momento hay que distinguishes más, hay que subir
   `--bg-raised` o sacrificar el mínimo.
3. **El rail sigue con ~570px de blanco.** Con `#f5f5f7` contra `#ffffff` la
   separación es 1.09:1 y el vacío se ve más que en oscuro, donde el negro se
   comía el hueco. Es el punto más flojo del resultado y es de maquetación: la
   ronda anterior ya probó y rechazó dos salidas. Bajar el `--bg-canvas` empeoraría
   el contraste del tercer nivel de texto sobre el rail, que es donde vive la
   etiqueta de 11px.
4. **La banda de KPI del Consolidado deja ~730px de aire por fila**, con la cifra a
   la derecha y la etiqueta a la izquierda. Es un patrón de panel financiero, no de
   apple.com. Ya estaba antes de esta feature y es.layout, no color.
5. **La rampa de categorías del Consolidado no aparece en el contraste de 94
   pares** con el rótulo "categoría": se midió como acento no textual (5.31-5.34:1),
   que es lo que son. Correcto, pero conviene saberlo.
6. **El feed de movimientos se sigue verificando solo en estado vacío.** El dataset
   de este navegador tiene 0 movimientos en los 6 periodos. Los filtros conmutan,
   pero el render de filas con datos **no se vio**. Es la única funcionalidad sin
   verificar visualmente con contenido real, y no es culpa de esta feature.
7. **Un `401` a Supabase en `file://`**, intermitente entre corridas: con origin
   `null` no hay `refresh_token`, la app cae a los datos locales y por eso abre
   `#modalSessionRoleSelect`. El baseline previo a tocar un solo archivo ya lo
   reportaba. No se tocó `supabase-store.js`.
8. **ESC no cierra ninguno de los 4 modales.** Verificado: `trasEsc=true` en los
   cuatro (el valor sigue siendo `active`). Se cierran con su botón. Es
   comportamiento previo; no se investigó si es intencional.

---

## Tareas

- [x] L1 Snapshot del contrato DOM y lista completa de tokens anteriores.
- [x] L2 Tokens claros recalibrados, con contraste medido.
- [x] L3 Tokens oscuros preservados bajo `html.theme-dark`.
- [x] L4 Chart.js leído por token: los dos lienzos pintados y legibles en claro.
- [x] L5 Foco visible y `prefers-reduced-motion` en claro y en oscuro.
- [x] L6 Capturas de claro y oscuro, recorrido completo de funcionalidades.
- [ ] L7 **Publicación. NO HECHA, y no la hace el agente.**

## Publicación

**NADA PUBLICADO.** `sync_github.js` no se ejecutó, ni siquiera con `--dry-run`. El
sitio en `adrianhola3.github.io/GastosMensuales/` sigue con el tema oscuro de las
rondas anteriores. Cuando se publique, GitHub Pages manda `max-age=600`: hay que
desactivar la cache del navegador antes de mirar el sitio real.

Un apunte de seguridad que sigue vigente: **no hay commit inicial** en este repo
(`git status` los muestra a todos como `??`), así que un `git add .` tomaría
`.github_token`, que está en texto plano en esta carpeta.