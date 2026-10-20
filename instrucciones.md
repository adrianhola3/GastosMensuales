# Instrucciones de Proyecto — Web de Gastos Mensuales

## 📌 Propósito y Alcance
Este workspace aloja la aplicación web de gestión financiera personal (**Finanzas Pro / Gastos Mensuales**) y los ejercicios y materiales de seguimiento académico (como el curso de estadística en `odd/tasks/`).

## 🧱 Estructura de la Aplicación Web
- `index.html`: Estructura principal y dashboard con interfaz neo-fintech en modo oscuro.
- `css/styles.css`: Estilos visuales, paleta de colores, diseño responsivo y reglas de contraste.
- `js/app.js`: Lógica principal de UI, eventos, filtros y cálculo de totales.
- `js/store.js`: Capa de datos, esquemas de presupuesto, transacciones y persistencia en `localStorage`.
- `js/charts.js`: Visualización interactiva mediante Chart.js.
- `sync_github.js`: Script de sincronización con el repositorio de GitHub.

## 🎯 Directrices para Asistentes y Agentes (OpenCode / Antigravity)
1. **Evitar bucles de ejecución:** Antes de ejecutar comandos de terminal, verificar los archivos mediante las herramientas de lectura (`read`). No emitir comandos idénticos repetidamente.
2. **Cuidado con credenciales:** Nunca imprimir ni commitear tokens de acceso o claves contenidas en `.github_token` o `.supabase_db_password`.
3. **Persistencia limpia:** Mantener la integridad de los datos en `localStorage` y respetar el contrato DOM definido en las pruebas.
4. **Tareas académicas (`odd/tasks/`):** Los archivos `.md` y `.mjs` dentro de `odd/tasks/` corresponden a suites de diagnóstico, ejercicios y módulos de análisis.

## Reglas de realización de un trabajo (PERMANENTES)

Establecidas por el usuario el 2026-10-18. Aplican a todo trabajo académico o de
entrega: parciales, tareas, PPT, informes, prácticas. **No se olvidan bajo ninguna
circunstancia ni en ninguna sesión.**

Copias canónicas:
- `C:\Users\User\Desktop\Trabajos del Asistente\REGLAS-DE-TRABAJO.md`
- `C:\Users\User\Desktop\Web de Gastos Mensuales\instrucciones.md`

**OBLIGACIÓN:** al encarar CUALQUIER trabajo, el agente debe **enunciar estas once
reglas al usuario como recordatorio**, sin que el usuario tenga que pedirlas.

1. **Criterio propio primero, con jerarquÃ­a de reglas.** Antes de aplicar ninguna regla, el agente decide **con su propio criterio** cuÃ¡l es el orden y el enfoque del trabajo; despuÃ©s las reglas se aplican **en orden de jerarquÃ­a**. En cada trabajo el agente **revisa cÃ³mo vienen las reglas**: si una estÃ¡ redundante, si dos se contradicen, si falta alguna o si la estructura no encaja, **avisa al usuario y propone reorganizar**. Nunca reorganizar por cuenta propia: se propone, se conversa y se decide juntos.

2. **Referencia primero, siempre.** Al hacer un trabajo se buscan referencias: un
   trabajo anterior, el de un compañero, una guía, un ejemplo aprobado. Si el
   usuario no aporta la referencia, **se le consulta siempre**. No se arranca a
   construir sin ella.
3. **REA para diseño y PPT.** Usar REA (Reverse Engineer Anything) para obtener
   **absolutamente todo** el formato de diseño de la referencia: tipografías, tamaños,
   paleta, márgenes, jerarquía, posiciones, imágenes. Habilitado en
   `~/.config/opencode/opencode.json` (`rea-agents@6.5.0`, `enabled: true`).
4. **Claude de la web para pulir, y verificar.** Con el formato ya estudiado, construir
   un prompt con las especificaciones y mandarlo a Claude en la web. **No quedarse
   solo con el resultado:** revisar que sea tal cual el formato de la referencia y
   **corregir a Claude** si hace falta.
5. **Permiso y obligación de usar programas externos.** Minitab, SPSS, Excel o el que
   haga falta. No pedir autorización cada vez ni evitarlo por comodidad.
6. **Capturas reales, jamás inventadas.** Guardar el archivo del programa y tomar
   capturas reales para el PPT. Si hace falta una imagen de un programa en la
   presentación, **se registra de verdad**.
7. **Autocrítica proactiva: dudar del trabajo antes de entregarlo.** El agente se
   cuestiona a sí mismo qué falta, qué está débil y qué puede estar mal aunque
   parezca correcto, y lleva esas dudas al usuario para conversarlas y mejorar el
   trabajo de forma óptima. Es una obligación permanente: no espera a que pregunten,
   no se resuelve en silencio y no se descarta por incomodidad.
8. **Criterio de avance propio.** El agente determina el orden, el método y los pasos del
   trabajo, apoyado en los procedimientos ya verificados, y no espera a que le indiquen
   la secuencia uno por uno. Consulta al usuario solo cuando hay una decisión real que le
   corresponde a él: el alcance, los criterios de aceptación o qué referencia seguir.
9. **Los grupos de WhatsApp son la fuente del contexto del curso.** Las tareas, los
   pendientes y las reglas se ven en los grupos. No hay un Aula Virtual donde se vean
   los pendientes; Aula Virtual solo sirve para descargar archivos de clase.
10. **Revisar siempre los grupos antes de empezar.** Hay que entrar a los grupos de los
   cursos y revisar lo que se conversó. El agente ya sabe cuáles son los grupos y debe
   acceder por su cuenta. Lo que se acuerde en el grupo es lo que se debe hacer.
11. **Después de los grupos, revisar el SGA.** Con el contexto del grupo, revisar si hay
    material nuevo en la plataforma del SGA y descargarlo si hace falta. Si hay algo
    nuevo, probablemente ya se haya hablado en el grupo; si no, se revisa igual.
12. **Con el contexto completo, recién ahí empezar el trabajo.** Sabiendo cómo va el
    curso, recién entonces se aplican las reglas de buscar referencias, conversar el
    trabajo y las demás.

Complementan estas reglas las restricciones de contenido ya en uso y verificadas:
nada inventado, lo ausente marcado `NO ENCONTRADO EN LA FUENTE` y cada marcador
**justificado**; citas verificables por coincidencia literal; salidas de práctica
**reales y ejecutadas**; referencias no verificadas **declaradas**, no completadas
inventando; español neutro, sin voseo, sin exclamaciones, sin emojis, UTF-8.

Excepción a la regla del SGA: **si el usuario indica que ya tiene todo el material necesario, el SGA no se revisa.** No es obligatorio cuando el material está completo y verificado.

---

## Reglas operativas

Estas reglas no son académicas: gobiernan **cómo se ejecuta el trabajo en la máquina**. No forman parte de la jerarquía del trabajo académico, pero se aplican **siempre**, en cualquier tarea.

**O1. Las descargas van siempre a una ruta prevista, nunca a un diálogo.**

Antes de descargar hay que **tener decidido el destino** y crearlo si no existe. El archivo baja directamente ahí. **Nunca** se acepta el diálogo "guardar como" ni se deja la descarga en la carpeta por defecto esperando que el usuario la mueva.

Cuando el archivo baja desde el navegador, la carpeta de destino se fija **antes** de navegar. Si el mecanismo no respeta la ruta, **se avisa al usuario en el momento**, en vez de dejar archivos a medio descargar con nombres GUID.

**O2. Los datos que salen de la conversación van en archivo.**

Credenciales, tokens y claves jamás se escriben en el chat ni en la línea de comandos. Se guardan en un archivo y se leen desde ahí.
**O3. Lo avanzado y lo aprendido se apunta siempre.**

Siempre que se termina un trabajo, una tarea o una fase, hay que dejar escrito:
- qué se avanzó (qué se hizo y qué archivos quedaron),
- qué se aprendió (qué funcionó, qué falló, qué no se pudo verificar),
- y qué sigue pendiente.

No se deja nada solo en la cabeza. El siguiente trabajo, o la siguiente sesión, debe poder seguir sin volver a preguntar lo ya revisado.

Se anota tras cada avance real, no solo al final de todo.

Esto aplica a cada semana de Estadística, a cada fase de un parcial, y a cualquier trabajo de este usuario.
