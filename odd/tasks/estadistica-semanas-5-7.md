# Estadistica UNAC ISEE605 - Semanas 5, 6 y 7

## Objetivo

Escribir apuntes y practica para las Semanas 5, 6 y 7 del curso ESTADISTICA PARA LA
INVESTIGACION CIENTIFICA (UNAC, ISEE605), docente Pomachagua Perez German Elias, con el
mismo metodo que las Semanas 1 a 4: apuntes de la clase y una practica con salida real
ejecutada en Excel, escritas como lo haria un alumno del curso.

Cierra el material semanal completo del curso. Con esto cerrado, empieza el parcial individual.

## Problema

Las Semanas 5, 6 y 7 tienen el PDF del SGA en su carpeta y las transcripciones y TXT del SGA
descargadas, pero CERO entregables: no existe la carpeta `Apuntes y Practica` en ninguna de
las tres. El curso queda incompleto y el parcial no tiene la base conceptual de las tres
ultimas semanas.

## Por que en este orden

El usuario ordeno: nombre de portada confirmado, despues avanzar las Semanas 5, 6 y 7 con el
mismo paso a paso de las anteriores, y recien alfinal empezar el parcial. Las semanas van en
orden cronologico porque el temario encadena: probabilidad (S4) -> distribucion normal (S5) ->
hipotesis para dos poblaciones (S6) -> tablas estadisticas (S7).

## Alcance autorizado

Semanas 5, 6 y 7. Fuera de alcance: rehacer Semanas 1 a 4, ya completas y verificadas, y el
parcial individual, que se empieza solo cuando las tres semanas esten cerradas.

## Ubicacion de las entregas

Carpeta del curso:
`C:\Users\User\Desktop\CICLO VI\ESTADISTICA PARA LA INVESTIGACION CIENTIFICA\`

Entrega de cada semana:
`Semana N - ESTADISTICA PARA LA INVESTIGACION CIENTIFICA\Apuntes y Practica\`

Convencion de nombres, identica a las Semanas 1 a 4:
- `01 Apuntes - Semana N.md`
- `02 Practica - Semana N.md`

## Fuentes disponibles

Todo el material esta en `C:\Users\User\AppData\Local\Temp\opencode\estadistica\`.

| Semana | Transcripcion YouTube | Archivo SGA | Tema segun el SGA |
| --- | --- | --- | --- |
| 5 | `transcripciones\Estadistica Semana 05.txt` | `sga\...Semana 5 ...\07 EP 2026 UNAC NORMAL 01 SET.txt` | Distribucion normal |
| 6 | `transcripciones\Estadistica Semana 06.txt` | `sga\...Semana 6 ...\05 M 2026 UNAC HIPOTESIS 2 POBLACIONES +SPSS 10 SET.txt` | Hipotesis para dos poblaciones, con SPSS |
| 7 | `transcripciones\Estadistica Semana 7.txt` | `sga\...Semana 7 ...\TABLAS-ESTADISTICAS (5).txt` | Tablas estadisticas |

Tamanos verificados en disco: S5 43 745 y 18 397 bytes; S6 59 684 y 49 904 bytes; S7 56 550 y
2 344 bytes. La fuente de la S7 es la mas corta: si resulta insuficiente para armar apuntes
completos, se declara el vacio con `NO ENCONTRADO EN LA FUENTE` en lugar de rellenarlo.

## Restricciones

These son las mismas de las Semanas 1 a 4 y siguen vigentes:

- Prohibido inventar contenido. Lo que no exista en la fuente se escribe
  `NO ENCONTRADO EN LA FUENTE`.
- Toda cita textual debe ser verificable por coincidencia literal contra el archivo de origen.
- La salida de cada practica debe ser real, ejecutada en Excel, nunca inventada.
- Idioma de los entregables: espanol neutro y profesional. Sin voseo, sin signos de
  exclamacion, sin emojis, sin caracteres CJK, sin U+FFFD.
- Solo archivos `.md` en UTF-8 en la carpeta de entrega, mas el libro `.xlsx` de la practica.
- Encabezado obligatorio con `Alumno: HUAMAN CASTILLO, ADRIAN`. El nombre ya esta confirmado
  por el usuario; no dejar placeholders `[Completar ...]`.
- No usar voseo en la prosa propia. Los signos de exclamacion que aparezcan como cita textual
  literal de la fuente se conservan, porque son texto del docente y no prosa del autor.
- Datos de la practica declarados como simulacion computacional cuando no procedan de la
  fuente. Si un dato viene de la fuente, se cita su origen.

## Regla de oro de Excel por COM, verificada el 18-10-2026

En este Excel 16.0 build 20430, la propiedad `.Formula` exige **nombres de funcion en ingles**
y **separador de argumentos COMA**. Verificado con sonda de 14 funciones contra valor teorico.

| Contexto | Nombre | Separador | Resultado |
| --- | --- | --- | --- |
| `.Formula` | ingles | `,` | FUNCIONA |
| `.Formula` | ingles | `;` | `HRESULT 0x800A03EC` |
| `.Formula` | espanol | cualquiera | `#NOMBRE?` o excepcion |
| `.FormulaLocal` | espanol | `;` | funciona para `SI.ERROR`, `DESVEST.M` |

Funciones verificadas que funcionan por `.Formula` con coma:
`NORMSDIST`, `NORMSINV`, `NORM.S.INV`, `NORMINV`, `T.DIST.2T`, `T.INV.2T`, `STDEV.S`, `VAR.S`,
`IFERROR`, `BINOM.DIST`.

Detalles que importan:

- El fallo con punto y coma afecta SOLO a funciones de dos o mas argumentos. Las de un solo
  argumento funcionan con cualquier separador porque no llevan ninguno. Ese detalle produce el
  falso positivo de pensar que una funcion no existe cuando en realidad el separador esta mal.
- `NORM.DIST(100,15,TRUE)` y `NORMDIST(1.96,0,1)` de tres argumentos siguen fallando en esta
  instalacion. Para la distribucion normal usar `NORMSDIST` y `NORMSINV`, que son las formas de
  compatibilidad y responden correctamente.
- `DIST.NORM`, `DIST.NORM.INV`, `DIST.NORM.EST` y `ESTIMACION.NORMAL` no existen en ninguna de
  las dos vias, ni en ingles ni en espanol. Eso si es una limitacion real de la instalacion.
- Antes de concluir que una funcion no existe, probarla con aridad valida y separador correcto.
  Una sonda con aridad incorrecta mide error de llamada, no existencia de funcion.

## Restricciones tecnicas de Excel en esta maquina

En este Excel 16.0 con interfaz es-ES no existen estas funciones y devuelven `#NOMBRE?`:
`RANGO`, `COEF.VAR`, `MODA.UNICA`, `MODA.MULTI`, `VAR.M`, `DESV.M`. Usar `MAX` menos `MIN`,
`DESVEST.M` dividido por `PROMEDIO`, `MODA.ONE`, `VAR.S`, `STDEV.S`.

Desde COM, `.Formula` usa nombres de funcion en ingles y `.FormulaLocal` en espanol.

Trampas de PowerShell 5.1 con Excel por COM, ya resueltas en sesiones anteriores:

- Asignar celda por celda con `.Value2` lanza `InvalidCastException` a partir de la segunda
  asignacion. Asignar el rango completo como matriz `object[,]` en un solo paso.
- PowerShell 5.1 exige casteo explicito: `[string]` para texto, `[double]` para numeros,
  `.ToOADate()` para fechas.
- `Get-Content -Raw` lee ANSI. Usar siempre `-Encoding UTF8`.
- Las referencias externas a otro archivo se pierden al guardarlo. Copiar los datos a una
  hoja interna del libro propio.
- Dentro de un literal de arreglo, `-f` se une a toda la lista separada por comas, no al
  ultimo elemento. Construir las formulas en variables antes.
- Escribir el script a archivo y ejecutarlo. Un script con f-strings y comillas pasado por la
  linea de comandos se rompe de forma silenciosa.
- En PowerShell el escape de comillas dobles es el acento grave, no la barra invertida.
  `\"` produce un error de parseo. Usa comillas simples para las cadenas que necesiten comillas
  dobles adentro, o acento grave.

Trampas de rutas, tambien vigentes:

- PowerShell corrompe los acentos en las rutas. Resolver el directorio con `Get-ChildItem` y
  filtrar por patron, nunca hardcodear la ruta acentuada.
- Un nombre de archivo de Drive queda truncado a 120 caracteres en el filesystem. Abrir el
  directorio en vez de hardcodear el path.

## Verificacion de cada semana

1. Los dos `.md` existen en la carpeta de entrega y son UTF-8 valido.
2. Toda cita textual aparece por coincidencia literal en su archivo de origen. Ejecutar el
   verificador de citas y reportar el conteo de verificadas y de no encontradas.
3. Los numeros de la practica coinciden con la salida real volcada del libro Excel.
4. El libro `.xlsx` no tiene ninguna celda con error.
5. Cero CJK, cero U+FFFD, cero voseo, cero placeholders.
6. Cada `NO ENCONTRADO EN LA FUENTE` corresponde a algo que de verdad no esta en la fuente.

## Strategy de entrega

`ask-on-risk`. Pronostico de lineas escritas: unos 150 a 250 en total para las tres semanas,
por debajo del presupuesto de 400. No se pide excepcion ni cadena de PRs.

## Lista de tareas

### W5 - Semana 5: distribucion normal - COMPLETADA

- [x] Leer `Estadistica Semana 05.txt` y `07 EP 2026 UNAC NORMAL 01 SET.txt`
- [x] Identificar el tema real de la semana y toda divergencia entre las dos fuentes
- [x] Ejecutar la practica en Excel por COM y volcar la salida real a texto
- [x] Comprobar que ninguna formula devuelve `#NOMBRE?`
- [x] Escribir `01 Apuntes - Semana 5.md` - 36 765 bytes
- [x] Escribir `02 Practica - Semana 5.md` - 74 231 bytes
- [x] Verificar citas por coincidencia literal y releer ambos archivos

Tema real: distribucion normal. Hallazgo dominante: la transcripcion NO contiene la clase de
normal. Cero apariciones de "normal" y de "distribucion" en sus 1 550 lineas. Es una clase de
probabilidad general, igual que la Semana 4. Todo el tema vino del PDF del SGA.

Entregables: `01 Apuntes - Semana 5.md` 36 765 bytes, `02 Practica - Semana 5.md` 74 231 bytes,
`Semana5_Practica_Distribucion_Normal.xlsx` 24 644 bytes, volcado `semana5_excel.txt` 39 925 bytes.
167 citas verificadas, 0 no encontradas. 79 items resueltos, 0 celdas con error.

11 divergencias entre el PDF y la transcripcion documentadas. Erratas del docente confirmadas:
H05 declara P(70<=W<=90)=0.1705 cuando mu_W=552 y el valor real es 3.427e-294; B07 escribe
"2663 y 337" cuando el correcto es 3337; G05 y G06 declaran 0.0388 contra 0.039213 real; B15
declara 0.2029 contra 0.2028 real. El PDF ademas se contradice en la convencion N(mu,sigma^2):
el Ejemplo 1 usa varianza y el Ejercicio 3 de la pagina 27 usa desviacion.

Ruta: delegacion directa, un writer, con una correccion posterior.

**Correccion aplicada antes de aprobar.** El writer documento que seis funciones de Excel no
existian en esta maquina. Era falso. Verificado por sonda propia: `.Formula` exige nombre ingles
y separador coma. La regla quedo escrita en el documento de seguimiento. Los resultados
numericos no se tocaron: el writer comparo el hash SHA256 de los bloques numericos antes y
despues de editar y salio identico.

Limites declarados que no son errores pendientes: Kolmogorov-Smirnov y Shapiro-Wilk no estan en
Excel ni en el PDF, asi que el valor p se transcribe y no se calcula. El Ejemplo de precios de la
pagina 17 tiene el enunciado ilegible en la extraccion y no se incluyo.

### W6 - Semana 6: hipotesis para dos poblaciones, con SPSS

- [ ] Leer `Estadistica Semana 06.txt` y `05 M 2026 UNAC HIPOTESIS 2 POBLACIONES +SPSS 10 SET.txt`
- [ ] Identificar el tema real y las divergencias entre las dos fuentes
- [ ] Ejecutar la practica en Excel por COM y volcar la salida real
- [ ] Escribir `01 Apuntes - Semana 6.md`
- [ ] Escribir `02 Practica - Semana 6.md`
- [ ] Verificar citas y releer ambos archivos

### W7 - Semana 7: repaso y cierre del curso - COMPLETADA

- [x] Leer `Estadística Semana 7.txt` y `TABLAS-ESTADISTICAS (5).txt`
- [x] Identificar el tema real de la semana y toda divergencia entre las dos fuentes
- [x] Ejecutar la practica en Excel por COM y volcar la salida real
- [x] Escribir `01 Apuntes - Semana 7.md` - 15 625 bytes
- [x] Escribir `02 Practica - Semana 7.md` - 7 997 bytes
- [x] Verificar citas por coincidencia literal y releer ambos archivos

Tema real: cierre y repaso del curso. La transcripcion (2013 lineas, 56 542 bytes) contiene la
clase en las lineas 237 a 870. El docente repasa el diagrama de decision de pruebas
estadisticas: normalidad, homogeneidad de varianzas, colas, grados de libertad, uso de las
tablas impresas. Cuenta 53 apariciones de "normalidad", 18 de "prueba", 10 de "alfa",
4 de "grados de libertad", 3 de "F de Fisher", 3 de "T de student". El resto es cierre
de la Semana 6 y administracion.

El PDF del SGA es el material mas corto del curso: un indice de 6 tablas del libro de
Llorente, Marin y Torra, sin explicacion ni formulas (2344 bytes).

Entregables: `01 Apuntes - Semana 7.md` 15 625 bytes, `02 Practica - Semana 7.md` 7 997 bytes,
`Semana7_Practica_Repaso_y_Cierre.xlsx` 15 864 bytes (6 hojas, 0 celdas con error),
2 capturas reales de la GUI de Minitab (`captura_minitab_1.png` 172386 bytes,
`captura_minitab_2.png` 166413 bytes). Volcado `semana7_excel.txt`.

161 citas verificadas, 0 no encontradas. 5 ejercicios resueltos: descriptivos, prueba F de
Fisher (F=2.85, no se rechaza H0), prueba t de Student (t=0.699, no se rechaza H0),
localizacion de valores en tablas (VLOOKUP/INDEX/MATCH/COUNTIF), clasificador de prueba
estadistica.

5 divergencias documentadas (D1-D5). 3 erratas del docente, todas verificables: "0.5" en
lugar de "0.05" en las lineas 422, 854 y 920 de la transcripcion.

**Minitab replicado.** Se abrio el archivo del alumno en Minitab 22.5.0.0 y se tomaron 2
capturas reales de la GUI. Los valores de Minitab provienen de la transcripcion (el docente
los dicta en clase). Los archivos .mpx de los companeros estan disponibles en
`Temp\opencode\estadistica\referencias\` para replicar formato con REA.

**Veredicto honesto.** El trabajo queda completo para el alcance real de la fuente. Los
apuntes son mas cortos que los de semanas anteriores y eso se declara como consecuencia de
que la fuente es un indice de 6 tablas sin explicacion. No se invento temario. Las 3
erratas del docente se reportan, no se copian en silencio.

## Progreso

- 2026-10-18: documento creado. Verificado en disco que las tres semanas tienen PDF del SGA y
  fuentes descargadas, y cero entregables.
- 2026-10-18: nombre del alumno confirmado y aplicado. Se reemplazaron 7 placeholders de
  nombre y fecha en Semanas 2, 3 y 4. Cero placeholders restantes en el curso.
- 2026-10-18: Semana 5 completada. 167 citas, 79 items, 0 celdas con error.
- 2026-10-18: Semana 6 completada. 412 citas, 144 items, 0 celdas con error.
- 2026-10-18: Semana 7 completada. 161 citas, 5 ejercicios, 0 celdas con error, 2 capturas
  reales de Minitab.

## Siguiente paso

El curso esta cerrado. Pendientes:
1. Parcial individual anunciado el 17/10 (sin empezar).
2. 3 detalles cosmeticos de la Tarea 1 (nombre confirmado, codigo de alumno, titulos de portada).
3. Usar Minitab y capturas reales para el parcial, siguiendo los pasos del profesor.
4. Buscar referencia de companero con REA antes de empezar el parcial.

## Progreso

- 2026-10-18: documento creado. Verificado en disco que las tres semanas tienen PDF del SGA y
  fuentes descargadas, y cero entregables.
- 2026-10-18: nombre del alumno confirmado y aplicado. Se reemplazaron 7 placeholders de
  nombre y fecha en Semanas 2, 3 y 4. Cero placeholders restantes en el curso.

## Siguiente paso

W5 - leer las fuentes de la Semana 5 y escribir los apuntes.