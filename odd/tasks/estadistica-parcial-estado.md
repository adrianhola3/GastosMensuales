# Parcial ISEE605 - Estado de ejecucion (checkpoint)

> Fuente de verdad del avance. Se actualiza en cada avance real, no al final.
> Verificado contra el disco, no contra memoria.

## 2026-10-19 ~15:20 - Estado verificado

### TERMINADO (con evidencia)

| ID | Que | Evidencia verificada |
| --- | --- | --- |
| T1 | Base Excel reparada | `Parcial_Base_Datos.xlsx` 40 520 b. 17 formulas con prefijo `_xlfn.` (J3:L6, B8:B11, B28). Hoja `Normalidad`: p de Shapiro recalculados por scipy en I2/I5/I8/I11 y conclusiones corregidas en J2/J5/J8/J11. Verificacion COM: 4 723 celdas, 0 con error (recorrido celda por celda, NO CountIf) |
| T1b | Salida analitica volcada | `Salida_Analitica_Excel.txt` 38 394 b, con trazabilidad celda a celda |
| T2a | Graficos corregidos | 6 PNG regenerados en `Temp\opencode\estadistica\parcial\graficos\`: 8 intervalos de Sturges con la formula a la vista, valores rotulados arriba, cajas verticales, pre/post lado a lado, unidades declaradas. **6 de 6 embebidos en el PPTX por hash.** El defecto previo era grave: los PNG viejos NO renderizaban ejes ni leyendas (Calibri no rasteriza con Agg) |
| T3-T5 | PPTX reconstruido | `Parcial - Uso de plataformas virtuales y rendimiento academico.pptx` 1 133 165 b, **63 slides**. Titulo sin "Uso", verbo "mejora", 3 PE/3 OE/3 HE sobre las dimensiones de la VD, H0/H1 en el bloque inferencial, patron de 5 slides por hipotesis, matriz de consistencia, figuras con pie APA, alfa de Cronbach 0,9358. Checklist automatico 88/88 verde |
| T2b | Proyecto Minitab | `Parcial_Minitab.mpx` 15 298 b en la carpeta de entrega (guardado 14:47:36) |

### PENDIENTE

Solo quedan decisiones del autor, no trabajo tecnico:

| ID | Que | Accion exacta |
| --- | --- | --- |
| D1 | Nombre final de la carpeta de entrega | La consigna pide `Parcial Individual - Plataformas virtuales y rendimiento`. Ese nombre, en la carpeta acentuada, lo ocupa una copia del trabajo de un companero. El entregable real esta en `Parcial Individual - Uso de plataformas virtuales y rendimiento academico`. Decision del autor: renombrar la carpeta real al nombre de la consigna (y borrar la copia del companero) o dejarla como esta |
| D2 | Que hacer con la copia de Laurente | `Parcial Individual - Plataformas virtuales y rendimiento` (carpeta acentuada) contiene: el PPTX de Laurente Tarea 1 (5 176 448 b, hash `C4E03AE337B22485`), el `.mpx` de la Tarea 1 (hash `1A59AE2E160A67D6`), una copia del PPTX de referencia de Laurente Tarea 2, y un `Salida_Analitica_Excel.txt` de otro modelo de datos. Decision del autor: borrar, archivar o reordenar |
| D3 | Carpeta senuelo | `ESTADISTICA PARA LA INVESTIGACION CIENTIFICA` (ASCII, sin tildes) solo tiene un PPTX de 2 slides. Decision del autor: borrar |
| D4 | Link de Drive | El docente exige que el dataset y las referencias tengan link navegable (L714-721, L3772-3775). El deck lo deja como "Link de Drive: pendiente de carga por el autor". El autor tiene que subir el `.mpx`, el `.xlsx` y el `.pptx` al Drive del curso y pegar el link |
| D5 | Fecha limite de entrega | Desconocida: en el grupo se pregunto y nadie respondio |

## Estado final verificado (2026-10-19 ~16:40)

Carpeta de entrega: 20 archivos, 2 317 859 bytes. Cero archivos huerfanos, cero referencias rotas.

| Punto de cierre | Resultado |
| --- | --- |
| 1. El PPTX existe, abre y tiene el numero de slides esperado | CUMPLE. 62 slides, 1 078 904 b, 15 imagenes embebidas, ninguna repetida, los 15 PNG entregados coinciden por hash con las imagenes embebidas |
| 2. La base Excel existe, con los datos declarados y formulas reales, y cero celdas con error | CUMPLE. 4 723 celdas recorridas por COM celda por celda, 0 con error. 17 formulas con prefijo `_xlfn.`; hoja `Normalidad` con los p de Shapiro recalculados por scipy |
| 3. La salida volcada existe y los numeros del PPTX coinciden con ella | CUMPLE. `Salida_Analitica_Excel.txt` 38 394 b con trazabilidad celda a celda |
| 4. Las capturas de Minitab son reales, de la GUI, y documentan ESTE trabajo | CUMPLE. 10 capturas: el proyecto `Parcial_Minitab.mpx` con los 175 datos, 4 graficas de probabilidad normal con Anderson-Darling y 4 salidas de la t pareada. Todas con la barra de titulo `Minitab - Parcial_Minitab.mpx` y el Navigator mostrando `PARCIAL_DATOS.CSV` |
| 5. El diseno del PPTX replica el de Laurente, verificado con REA | CUMPLE. 13,333 x 7,5, misma paleta, misma tipografia, mismo lienzo; patron de 5 diapositivas por hipotesis y matriz de consistencia de 5 columnas como en la referencia |
| 6. Cero CJK, cero U+FFFD, cero voseo, cero placeholders | CUMPLE. Cero CJK en el deck y en los 70 archivos de texto del curso; cero U+FFFD; cero voseo; unico "pendiente": el link de Drive (D4) |
| 7. Ninguna afirmacion sobre funciones de Excel sin verificar por ejecucion | CUMPLE. Verificado por COM, con el control cruzado de que el mismo detector encuentra las 17 `#NOMBRE?` en el libro roto |

Correcciones de fondo aplicadas al deck: titulo sin "Uso" y con "aplicacion"; verbo "mejora" en problema, objetivo e hipotesis; 3 PE/3 OE/3 HE sobre las dimensiones de la variable dependiente; H0 y H1 en el bloque inferencial; chi-cuadrado y Pearson como analisis exploratorio sin H0/H1; matriz de consistencia; figuras con pie APA y rotulo "Figura N"; tabla de frecuencias con porcentaje; 22 columnas en el anexo; alfa de Cronbach de la escala de uso (0,9358); valores de Anderson-Darling tomados de la salida real de Minitab (0,553 / 0,313 / 0,308 / 0,372); articulos corregidos ("mejora el promedio ponderado", "mejora los creditos aprobados", "mejora la asistencia"); 417 palabras sin tilde corregidas.

### Via robusta para T2c/T2d (la que falta explorar)

Minitab tiene un panel **Command Line** visible en la parte superior derecha de la ventana, con un cuadro de texto y
un boton **Run**, y debajo un panel **History**. Ahi se escriben comandos directamente y se ejecutan:

```
PAIRED 'Promedio_post' 'Promedio_pre'; CONFLEVEL 95.0; TEST 0.0; ALTERNATIVE 0.
NormTest C19;
RTTest.
```

Eso ya se ejecuto con exito en la sesion previa (el History de `paired_promedio.png` lo registra). **No requiere
navegar menus**, que es el paso que se rompe con SendKeys. Es la via que hay que usar: 4 comandos `PAIRED` +
4 `NormTest`, cada uno con su captura.

Minitab calcula `Sample 1 - Sample 2`, asi que para que `t` salga positiva `Sample 1` debe ser POST y `Sample 2` PRE.

## Postmortem actualizado (2026-10-19 15:35)

| Sintoma | Causa real | Correccion |
| --- | --- | --- |
| La sesion de Minitab duro 14+ min sin salida | `Out-String` buffereo toda la salida Y el script tiene 12 dialogos con 3 reintentos cada uno: el peor caso son ~24 min | Salida sin bufferear (`Write-Host` directo) + plazo interno duro |
| El watchdog nunca arranco | `Start-Process -ArgumentList` con una ruta CON ESPACIOS sin comillas: `powershell.exe` recibio la ruta partida y murio al instante | Envolver cada argumento con `` `"` ``. **VERIFICADO**: la vigia ahora arranca, latEvery 20 s y sigue el PID |
| Un dialogo `Paired t for the Mean` abierto hizo que el paso de normalidad fallara | Fuga de estado: el paso anterior dejo el dialogo abierto y el siguiente le hizo clic encima (produjo el toast "Sample size: Please enter a single integer") | `ESC` x2 antes de cada navegacion de menu + verificar el titulo del dialogo esperado |
| 14 `MtbRender` huerfanos | Cada reintento abrio una instancia de render que no se cerro | Limpieza al final de cada corrida + el watchdog mata por PID |

**El watchdog esta INSTALADO Y PROBADO** en `odd\tasks\watchdog-gui.ps1` (verificado con un proceso de prueba:
arranca, escribe latidos cada 20 s y detecta el proceso). Solo vigila los PIDs que le pases.

### Desviacion documentada (no es error del parcial)
La fila `Rend_Index` de las hojas `Normalidad`/`Inferencial` de la base esta calculada sobre indices redondeados
a 2 decimales, mientras la hoja `Datos` usa precision completa. Por eso la base da t = 30,4104 y Minitab da
t = 30,4177. Se reporta el valor de la base y se declara la diferencia en nota al pie de la diapositiva.

## Por que se estanco (postmortem)

1. La automatizacion de la GUI de Minitab es **poco fiable**: el primer intento se quedo sin poder capturar 3 de
   las 4 salidas de normalidad. La sesion de reintento fue **cancelada** y no se reporto a tiempo.
2. Cada reintento dejo procesos vivos: se acumularon **14 `MtbRender` huerfanos + 1 `Mtb.exe`**. Eso es lo que
   consume CPU y hace que la maquina parezca colgada.
3. El presupuesto de pasos del subagente se agota con tareas GUI largas. Con 4 salidas + 8 capturas, no entra.
4. El error de fondo: **no se reporto la cancelacion**. El turno termino en silencio.

## Reglas de supervision que quedan fijadas

- Toda delegacion se reporta **inmediatamente** con su estado real, no al final del lote.
- Toda tarea GUI tiene: tope de pasos, tope de reloj, y watchdog con PIDs acotados.
- Si el watchdog marca `STALLED` o `DEADLINE`, se informa en el momento, con el motivo, y se sigue con lo que
  si haya quedado. No se reintenta en cadena.
- El estado de este archivo es la fuente de verdad. Si una sesion se interrumpe, se retoma desde aca.

## Comandos utiles

```powershell
# procesos GUI vivos (diagnostico)
Get-Process | Where-Object { $_.ProcessName -match 'Mtb|EXCEL' } | Select Id, ProcessName, MainWindowTitle

# limpiar huerfanos (creados por la automatizacion propia)
Get-Process -Name Mtb,MtbRender -ErrorAction SilentlyContinue | Stop-Process -Force

# ver el mapa de slides del PPTX actual
python -c "import zipfile,re;z=zipfile.ZipFile(r'<ruta>');print(len([x for x in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$',x)]))"
```
