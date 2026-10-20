param(
  [Parameter(Mandatory=$true)][string]$PidFile,
  [int]$MaxMinutes = 20,
  [int]$StallMinutes = 4,
  [string]$WatchDir = "",
  [string]$LogPath = "$env:TEMP\opencode\watchdog-gui.log"
)

$ErrorActionPreference = 'SilentlyContinue'

function Log([string]$msg) {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Add-Content -LiteralPath $LogPath -Value ("[{0}] {1}" -f $ts, $msg) -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $PidFile)) { Log "ABORT: no existe $PidFile"; exit 1 }

$pids = @(Get-Content -LiteralPath $PidFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
if ($pids.Count -eq 0) { Log "ABORT: el archivo de PIDs esta vacio"; exit 1 }

Log ("INICIO: {0} PID(s) vigilados: {1}" -f $pids.Count, ($pids -join ','))

$deadline  = (Get-Date).AddMinutes($MaxMinutes)
$lastStamp = ""
$lastChange = Get-Date

while ($true) {
  Start-Sleep -Seconds 20
  $alive = @($pids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })

  # huella del directorio vigilado
  $stamp = ""
  if ($WatchDir -and (Test-Path -LiteralPath $WatchDir)) {
    $stamp = (Get-ChildItem -LiteralPath $WatchDir -Recurse -File |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1 |
              ForEach-Object { "{0}|{1}" -f $_.FullName, $_.LastWriteTime.Ticks })
  }
  if ($stamp -ne $lastStamp) { $lastStamp = $stamp; $lastChange = Get-Date }
  $idle = [int]((Get-Date) - $lastChange).TotalMinutes

  Log ("latido: vivos={0} idle={1}min" -f $alive.Count, $idle)

  if ($alive.Count -eq 0) { Log "FIN: todos los PIDs acabaron solo"; break }

  if ((Get-Date) -ge $deadline) {
    Log ("DEADLINE: se cumplio el plazo de {0} min; matando {1} PID(s)" -f $MaxMinutes, ($alive -join ','))
    $alive | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Log "FIN: plazo alcanzado"
    break
  }

  if ($idle -ge $StallMinutes) {
    Log ("STALLED: el directorio vigilado no cambio hace {0} min; matando {1} PID(s)" -f $idle, ($alive -join ','))
    $alive | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Log "FIN: tarea estancada, detenida automaticamente"
    break
  }
}
