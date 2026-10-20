# Vigia de tareas GUI (Minitab / Excel)

## Que es
Un watchdog **acotado**: vigila solo los PIDs que le pases, detecta si la tarea se estanco y los mata. NUNCA
mata un proceso que no sea de la tarea. No toca nada del disco del usuario.

## Como usarlo
1. Antes de lanzar la automatizacion, anota los PIDs en un archivo (uno por linea) y arranca el watchdog:

```powershell
# 1. registrar PIDs
"Mtb`n12345" | Set-Content -LiteralPath "$env:TEMP\opencode\estadistica\parcial\_watchdog_pids.txt" -Encoding UTF8

# 2. arrancar la vigia en segundo plano (ventana oculta)
Start-Process -WindowStyle Hidden -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile","-ExecutionPolicy","Bypass","-File",
  "C:\Users\User\Desktop\Web de Gastos Mensuales\odd\tasks\watchdog-gui.ps1",
  "-PidFile","$env:TEMP\opencode\estadistica\parcial\_watchdog_pids.txt",
  "-MaxMinutes","20",
  "-StallMinutes","4",
  "-WatchDir","$env:TEMP\opencode\estadistica\parcial",
  "-LogPath","$env:TEMP\opencode\estadistica\parcial\_watchdog.log"
)
```

2. La vigia escribe un log con latido cada 20 s. Al terminar la tarea, cerrala:
   `Get-Content <LogPath> -Tail 40`

## Reglas
- `-MaxMinutes`: plazo duro total. Al cumplirse, mata los PIDs y escribe `DEADLINE`.
- `-StallMinutes`: si el directorio vigilado no cambia (ningun archivo nuevo o modificado) durante ese tiempo,
  escribe `STALLED` y mata los PIDs. Esto es lo que corta los bucles de GUI.
- Solo mata los PIDs del archivo. Si un PID ya murio, no hace nada con ese.
- No borra ni modifica archivos del proyecto. Solo escribe en `-LogPath`.
