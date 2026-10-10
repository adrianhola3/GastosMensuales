# Contexto de sesión — Web de Gastos Mensuales

Este archivo se carga automáticamente en toda sesión de OpenCode abierta en esta carpeta.
Su propósito es que el agente empiece con el contexto del trabajo en curso y con las
trampas ya conocidas, sin depender de que se reconstruyan a mano.

## Contexto acumulado del proyecto

La aplicación web vive acá. Archivos clave: `index.html`, `css/styles.css`,
`js/app.js`, `js/store.js`, `js/charts.js`, `sync_github.js`, `README.md`.

Trabajo reciente registrado en sesiones previas de esta misma carpeta: conexión y
edición del proyecto en GitHub, verificación de pasos, y consultas de reproducción
de vídeo y canciones en YouTube. Usá el buscador de sesiones de la web para
recuperarlas.

## Máquina y acceso remoto

Esta PC se administra por acceso remoto y hay configuración que ya está hecha:

- **OpenCode remoto**: `http://desktop-3m8skfg:4096` vía Tailscale. Usuario `opencode`.
  Tarea `OpenCodeRemoteServer` con bucle de supervisión. Firewall: puerto 4096 solo
  desde `100.64.0.0/10` en la interfaz Tailscale.
- **AnyDesk** 9.7.16 desatendido, ID de servicio `1343756491`. Credenciales en
  `C:\Users\User\.opencode-remote\`.
- **UAC** movido al escritorio normal (`PromptOnSecureDesktop = 0`) para poder aprobar
  instalaciones desde AnyDesk. Con `ConsentPromptBehaviorAdmin = 5`, PowerShell se
  eleva en silencio; solo los binarios de terceros piden consentimiento.
- Archivos de soporte: `C:\Users\User\.opencode-remote\` (scripts, credenciales, logs).

## Trampas verificadas

- **`SystemUsesLightTheme` lleva "s"**. La versión sin "s" crea un valor de registro
  espurio inútil.
- En PowerShell 5.1, `Get-Content -Raw` lee **ANSI**, no UTF-8. Siempre
  `-Encoding UTF8`.
- `anydesk.exe --help` **cuelga**: abre un diálogo GUI. No invocarlo desde scripts.
- `${env:ProgramFiles(x86)}` necesita llaves; `$env:ProgramFiles(x86)` es error de sintaxis.
- Energía se consulta con `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE`.
- No confiar en códigos de salida: verificar la configuración resultante.
- El directorio de una sesión de OpenCode es **inmutable**. Para abrir una sesión que
  vive en otra carpeta usar el enlace directo `/server/<base64>/session/<id>`.

## Seguridad

- **`.github_token` está en texto plano dentro de esta carpeta y NO hay repositorio git,
  así que nada lo protege.** Si se hace `git init` sin agregarlo al `.gitignore`, se
  puede commitear el token por accidente. Verificar antes de cualquier `git add`.
- Credenciales solo por archivo, nunca en la línea de comandos ni en el chat.
- Avisar antes de usar `desktop-control.ps1`: el agente ve toda la pantalla.
