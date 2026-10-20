# Estadistica UNAC ISEE605 - Unidad 1 (Semanas 1 a 4)

## Objetivo

Completar los apuntes y las practicas de las cuatro semanas de la Unidad 1 del curso
ESTADISTICA PARA LA INVESTIGACION CIENTIFICA (UNAC, ISEE605), docente Pomachagua Perez
German Elias, escribiendo cada semana como lo haria un alumno del curso: apuntes de la
clase y una practica con salida real ejecutada en Excel.

Una vez cerrado ese material,empsar el trabajo de la Unidad 1.

## Problema

El material de las cuatro semanas esta incompleto en disco. La Semana 3 tiene la practica
ya ejecutada pero ningun documento escrito; la Semana 4 no tiene nada. Las Semanas 5 a 7
quedan fuera de este alcance.

## Por que en este orden

El usuario indico explicitamente: terminar las primeras cuatro semanas de clase con sus
apuntes y actividades, y solo despuesempsar el trabajo de la Unidad 1. El material semanal
es la base conceptual que el trabajo necesita.

## Alcance autorizado

Semanas 1 a 4. Fuera de alcance: Semanas 5, 6 y 7, y el trabajo de la Unidad 1 hasta que
las cuatro semanas esten cerradas.

## Ubicacion de las entregas

Carpeta del curso:
`C:\Users\User\Desktop\CICLO VI\ESTADISTICA PARA LA INVESTIGACION CIENTIFICA\`

Entrega de cada semana:
`Semana N - ESTADISTICA PARA LA INVESTIGACION CIENTIFICA\Apuntes y Practica\`

Convencion de nombres:
- `01 Apuntes - Semana N.md`
- `02 Practica - Semana N.md`

## Fuentes disponibles

Todo el material esta en `C:\Users\User\AppData\Local\Temp\opencode\estadistica\`.

| Semana | Transcripcion YouTube | Archivo SGA |
| --- | --- | --- |
| 1 | no existe en YouTube | `sga\...Semana 1 ...\01 MA 2026-UNAC  12 AGOSTO.txt` |
| 2 | `transcripciones\Estadistica Semana 02.txt` | `sga\...Semana 2 ...\02 MA 2026-II UNAC  12 AGOSTO.txt` |
| 3 | `transcripciones\Estadistica Semana 03.txt` | `sga\...Semana 3 ...\03 M 2026 UNAC RESUMEN 12 AGOST.txt` |
| 4 | `transcripciones\Estadistica Semana 04.txt` | `sga\...Semana 4 ...\04 EA 2026 UNAC PROBABILABLES 18SET.txt` |

Sílabo del curso:
`C:\Users\User\Desktop\CICLO VI\ESTADISTICA PARA LA INVESTIGACION CIENTIFICA\Sílabo del curso - ...\SILABO 2026-A GPP.docx`

## Restricciones

- Prohibido inventar contenido. Lo que no exista en la fuente se escribe
  `NO ENCONTRADO EN LA FUENTE`.
- Toda cita textual debe ser verificable por coincidencia literal contra el archivo de origen.
- La salida de cada practica debe ser real, ejecutada, nunca inventada.
- Idioma de los entregables: espanol neutro y profesional. Sin voseo, sin signos de
  exclamacion, sin emojis.
- Solo archivos `.md` en UTF-8 en la carpeta de entrega.
- Excel instalado es 16.0 con interfaz es-ES. Desde COM, `.Formula` usa nombres de funcion
  en ingles y `.FormulaLocal` en espanol.

## Restricciones tecnicas de Excel en esta maquina

En este Excel no existen estas funciones y devuelven `#NOMBRE?`:

| Incorrecto | Correcto |
| --- | --- |
| `RANGO` | `MAX` menos `MIN` |
| `COEF.VAR` | `DESVEST.M` dividido por `PROMEDIO` |
| `MODA.UNICA` | `MODA.UNO` |
| `MODA.MULTI` | no disponible |
| `VAR.M` | `VAR.S` |
| `DESV.M` | `DESVEST.M` |

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

## Comandos de verificacion aplicables

Los entregables son Markdown. No hay suite de tests en este trabajo. La verificacion es:

1. El archivo existe en la ruta de entrega y es UTF-8 valido.
2. Toda cita textual aparece por coincidencia literal en su archivo de origen.
3. Los resultados de la practica coinciden con la salida real del libro Excel.
4. Ningun marcador `NO ENCONTRADO EN LA FUENTE` esta de mas: cada uno corresponde a algo
   que de verdad no aparece en la fuente.

## Lista de tareas

### T1 - Semana 3: apuntes - COMPLETADA

- [x] Leer transcripcion `Estadistica Semana 03.txt` y `03 M 2026 UNAC RESUMEN 12 AGOST.txt`
- [x] Verificar cada cita por coincidencia literal contra el origen
- [x] Escribir `01 Apuntes - Semana 3.md` - 59 594 bytes, 890 lineas
- [x] Releer el archivo escrito y confirmar que existe y es UTF-8

### T2 - Semana 3: practica - COMPLETADA

- [x] Confirmar la salida real en `semana3_excel.txt` y `Semana3_Practica_Atencion.xlsx`
- [x] Escribir `02 Practica - Semana 3.md` con esa salida, sin inventar numeros
- [x] Releer el archivo escrito y confirmar que existe y es UTF-8
- [x] Contraste independiente de todos los valores de la salida real contra el documento

Ruta: delegacion directa, un writer. Verificacion por lectura estructural y contraste
automatizado de la salida real. Resultado: OK.

Tema real de la Semana 3: "Medidas de Resumen". Tendencia central, medidas de posicion
(cuartiles, deciles, percentiles), medidas de variabilidad y medidas de forma. Caso de
clase "Industrial Tools" con 223 trabajadores.

### T3 - Semana 4: fuentes - COMPLETADA

- [x] Leer transcripcion `Estadistica Semana 04.txt` y `04 EA 2026 UNAC PROBABILABLES 18SET.txt`
- [x] Identificar el tema taught de la semana y toda divergencia entre las dos fuentes

Tema real: probabilidades. 172 citas verificadas en los apuntes, cero no encontradas. En la
practica, 106 de 117 citas verificadas; las 11 restantes estan documentadas porque el PDF
imprime esas respuestas como fraccion apilada y la extraccion de texto invierte los digitos.

### T4 - Semana 4: practica real - COMPLETADA

- [x] Ejecutar la practica en Excel por COM con datos de la fuente
- [x] Volcar la salida real a un archivo de texto
- [x] Comprobar que ninguna formula devuelve `#NOMBRE?`

Libro: `Temp\opencode\estadistica\practica\Semana4_Practica_Probabilidades.xlsx`, 4 hojas,
104 comparaciones, cero celdas con error. Volcado en `semana4_excel.txt`.

### T5 - Semana 4: entregables - COMPLETADA

- [x] Escribir `01 Apuntes - Semana 4.md` - 47 232 bytes, 849 lineas
- [x] Escribir `02 Practica - Semana 4.md` - 38 210 bytes, 488 lineas
- [x] Releer ambos y confirmar que existen y son UTF-8

Ruta: delegacion directa, un writer. Verificacion por lectura estructural: 0 CJK, 0 voseo.
Los signos de exclamacion presentes son citas textuales literales de la fuente y el
operador factorial matematico, no prosa del autor. Correcto dejarlos.

### T6 - Trabajo de la Unidad 1: Tarea 1 - ALCANCE CONFIRMADO

El usuario confirmó que "el trabajo de la unidad 1" es **la Tarea 1 ya entregada**. El
diagnostico tecnico ya esta hecho y verificado en Excel.

Estado real de los archivos, en `Temp\opencode\estadistica\drive\`:

- `Tarea1.pptx` — 27 diapositivas, la presentacion entregada
- `Base_de_Datos_Productividad.xlsx` — 100 filas, 19 columnas
- `Minitab_adrianhuaman.mpx` — salida de Minitab
- `practica\Tarea1_Verificacion.xlsx` y `tarea1_verificacion.txt` — verificacion propia

**Problema 1, critico: la prueba declarada no corresponde a los datos.** La PPT declara
T-Student para muestras relacionadas (pretest-postest) con 16 antes y 16 despues. La base
tiene 100 casos unicos: CR-0001..CR-0050 "Antes" y CR-0051..CR-0100 "Despues". No existe
clave de emparejamiento; emparejar por la columna "Semana" daria apenas 2 pares.

**Problema 2: las cifras de la PPT no salen de los datos.** Vienen de la tesis de
Llactacondor (2024). El Excel recalcula con AVERAGEIF y da otro resultado:

| Indicador | PPT antes | Datos antes | PPT despues | Datos despues |
| --- | --- | --- | --- | --- |
| Productividad | 64.05 | 62.21 | 93.19 | 94.55 |
| Eficiencia | 63.95 | 62.98 | 92.99 | 93.72 |
| Eficacia | 62.85 | 61.43 | 94.32 | 95.37 |

**Problema 3: la formula de la eficacia esta mal en la PPT.** La PPT dice "Documentos
procesados / Tiempo util". La base dice "Documentos Procesados / Documentos Programados x
100". Verificado en la fila 1: 4 de 8 = 50%, que coincide con la base, no con la PPT.

**Problema 4: Shapiro mal justificado.** La PPT dice "n < 32" cuando el n real es 50.

**Problema 5: muestra declarada no cuadra.** 85 en la PPT, 50 por condicion en los datos.

**Problema 6: errores de redaccion.** "PRODUCTIVAD" sin la I, "29.14%" cuando son puntos
porcentuales, H1 direccional contra p bilateral, "se acepta H1" cuando el docente exige no
aceptar H0, y "Experimental" cuando el modelo oficial lo llama Preexperimental.

**Lo que ya esta bien y hay que conservar:** las 3 hipotesis de la PPT son General =
Productividad, Especifica 1 = Eficiencia, Especifica 2 = Eficacia, las tres del mismo tipo.
Cumplen la regla del grupo. La estructura, la matriz de consistencia y la operacionalizacion
estan correctas.

- [x] Confirmar con el usuario el alcance exacto
- [x] Resolver el problema 1: formato WIDE con 100 pares reales
- [x] Corregir problemas 2 a 6 sobre la base regenerada
- [x] Ejecutar: base, analisis, PPTX y ajuste metodologico

**Entregable final**

Carpeta: `CICLO VI\ESTADÍSTICA PARA LA INVESTIGACION CIENTIFÍCA\Tarea 1 - Aplicacion de un sistema informatico\`

| Archivo | Bytes |
| --- | --- |
| `Tarea 1 - Aplicacion de un sistema informatico y su efecto en la productividad.pptx` | 679 843 |
| `Tarea1_Base_Productividad.xlsx` | 71 339 |
| `salida_tarea1.txt` | 95 264 |
| `graficos\` con 6 PNG | 635 832 en total |

**Ajuste metodologico aplicado: HE3 retirada.** El indice del Sistema Informatico es la
variable independiente, no la dependiente. HE3 no era una hipotesis sobre productividad sino
una prueba de que el instrumento de medicion mejoro. Quedan 3 hipotesis, todas sobre la
variable dependiente: HG Productividad, HE1 Eficiencia, HE2 Eficacia.

El criterio salio de los 16 trabajos del grupo: todos formulan sus hipotesis sobre
dimensiones de una sola variable, y ninguno sobre la variable independiente. Paredes,
Cornejo y Cortez tienen exactamente el mismo patron que ahora tiene este trabajo.

El indice SI no se borro: pasa a ser la medida de la VI, se operacionaliza y se describe en
la parte descriptiva, pero no se contrasta.

**Verificacion final del PPTX**

- 35 diapositivas, 21 secciones en orden.
- Cero menciones a HE3, "cuatro hipotesis" o "cuarta hipotesis".
- Tabla inferencial con exactamente 3 filas: HG, HE1, HE2.
- Las tres cifras t presentes, dos veces cada una.
- Cero "se acepta H0". Hay 17 "se rechaza H0" y 4 "no se rechaza H0".
- Cero CJK, cero U+FFFD, cero exclamaciones, cero voseo.
- Datos declarados como simulados.
- Limitacion de Slovin presente, redactada como limitacion y no como error de calculo.

**Pendiente con el usuario**

- [ ] Confirmar el nombre de la portada. El PPTX usa HUAMAN CASTILLO, ADRIAN, tomado de la
      nombre de la carpeta de Drive y del archivo `Minitab_adrianhuaman.mpx`.
- [ ] Completar el codigo de alumno, si el curso lo pide.
- [ ] Completar los titulos de las portadas de las Semanas 3 y 4.

## Como retomar esta sesion

Buscar en memoria: `estadistica unidad 1 semana 3 4 tarea 1`, o leer este archivo.

Orden natural del trabajo ya hecho:

1. Semanas 1 y 2: completas desde antes. No tocar.
2. Semana 3: completa, apuntes y practica en la carpeta del curso.
3. Semana 4: completa, apuntes y practica en la carpeta del curso.
4. Tarea 1: rehecha desde cero y verificada. El entregable esta junto a este archivo, en
   la carpeta `Tarea 1 - Aplicacion de un sistema informatico` del curso.

Fuera del alcance acordado, sin empezar: Semanas 5, 6 y 7, y el parcial individual que el
delegado anuncio el 17/10.

**Trampa importante para la proxima sesion.** El archivo
`Temp\opencode\estadistica\drive\gstate.json` fue BORRADO. Contenia 561 cookies de sesion de
Google en texto plano. Para volver a descargar algo de Drive hay que re-loguearse en Chrome
y re-exportar el estado de sesion con
`browser_run_code_unsafe` y `page.context().storageState({ path })`.

**Otra trampa.** PowerShell corrompe los acentos en las rutas. Volcar a un archivo
intermedio con nombre slug ASCII antes de leer. Y un nombre de archivo de Drive quedo
truncado a 120 caracteres en el filesystem: abrir el directorio en vez de hardcodear el
path.

**Decisiones tomadas**

- **n = 100.** Fue el acuerdo del grupo. Consistente con los 11 companeros que entregaron
  bases de 100 registros.
- **Formato WIDE.** Una fila es un sujeto y su pre y su post conviven en esa misma fila. Es
  el formato que usan 5 de los 16 companeros que si resolvieron el emparejamiento.
- **1 Hipotesis General + 3 Especificas, con una sola prueba.** Verificado en 15 de los 16
  trabajos: la consigna "3 hipotesis" pide 3 dimensiones con el mismo contraste, no 3 tipos
  de contraste distintos.
- **La entrega original se descarta entera.** Sin conservar cifras, texto ni estructura.

**Base generada y verificada**

`Temp\opencode\estadistica\tarea1\Tarea1_Base_Productividad.xlsx`, 6 hojas: Datos,
Diccionario, Resumen, Normalidad, Inferencial, Consistencia.

Verificacion independiente con scipy, recalculada desde cero:

| Hipotesis | t | gl | p | IC 95% | Normalidad de las diferencias |
| --- | --- | --- | --- | --- | --- |
| Productividad | 33.3094 | 99 | 1.36e-55 | [18.4343 ; 20.7696] | W=0.9798, p=0.1273 |
| Eficiencia | 22.7880 | 99 | 3.63e-41 | [17.6397 ; 21.0045] | W=0.9938, p=0.9328 |
| Eficacia | 24.4468 | 99 | 9.78e-44 | [18.2681 ; 21.4955] | W=0.9914, p=0.7727 |
| Indice SI | 28.1444 | 99 | 4.90e-49 | [19.6653 ; 22.6484] | W=0.9853, p=0.3319 |

- 100 filas, IDs 1 a 100 unicos, cada uno con pre y post en la misma fila.
- 800 celdas de indice, todas con formula real, cero valores pegados.
- Cero celdas con error en las 6 hojas.
- Los datos quedan declarados en todas las hojas como simulacion computacional.

**Formulas reales del modelo, corregidas.** El indice de Eficiencia es
`Tiempo_Util / Tiempo_Total x 100`, NO documentos procesados sobre tiempo util. Esa segunda
version circulaba en la consigna original y es un error. Verificado contra las 100 celdas
de la base previa con diferencia 0.0000000000.

### Decision tecnica pendiente, T6

El problema 1 tiene dos salidas excluyentes y la eleccion cambia toda la pieza:

**Salida A, regenerar la base.** Agregar una llave de entidad que se repita en ambas
condiciones, de modo que el emparejamiento exista y la T-Student para muestras relacionadas
pase a ser valida. Respeta el modelo oficial del curso, que es "Relacionada - Pareada", y
respeta el enunciado del parcial, que lista "muestras relacionadas" entre las hipotesis
posibles. Costo: hay que regenerar la base.

**Salida B, cambiar el diseño.** Declarar muestras independientes de 50 contra 50, con
prueba de Levene previa y luego Student o Welch. Los datos actuales sirven tal cual. Costo:
contradice el modelo oficial del curso y obliga a reescribir hipotesis y analisis.

## Criterios de aceptacion

- Las Semanas 1 a 4 tienen sus dos entregables en la carpeta correcta, en UTF-8.
- Ningun contenido inventado. Todo lo no verificable marcado de forma explicita.
- Las practicas reportan salidas realmente ejecutadas, reproducibles desde el libro Excel.
- Las citas son verificables por coincidencia literal.

## Pendiente de decision

**Alcance del trabajo de la Unidad 1.** El grupo de WhatsApp menciona dos cosas distintas
que podrian ser este trabajo: la Tarea 1 en grupo, entregada alrededor del 14/09 y ya
descargada, y un parcial individual que el delegado anuncio el 17/10. No esta definido cual
de las dos es "el trabajo de la unidad 1". Consultar antes de ejecutar T6.

## Advertencias abiertas de la Tarea 1

Registradas en sesiones anteriores, a resolver dentro de T6 si esa es la tarea:

- La base declara prueba T-Student para muestras relacionadas, pero tiene 100 codigos de caso
  distintos: 50 antes y 50 despues sin ninguna repeticion. La prueba declarada no
  corresponde a la estructura real de los datos.
- Tres numeros de muestra incompatibles: 85 declarados, 32 implicitos, 100 filas reales.
- La escala "intervalo" se declaro por construccion propia y no aparece en la Semana 2.
  Falta confirmar con el docente si forma parte de su taxonomia.

## Progreso

- 2026-10-18: documento creado. Estado verificado en disco: Semanas 1 y 2 completas,
  Semana 3 con la practica ejecutada y sin documentos, Semana 4 sin nada.

## Siguiente paso

T1 - leer las fuentes de la Semana 3 y escribir `01 Apuntes - Semana 3.md`.