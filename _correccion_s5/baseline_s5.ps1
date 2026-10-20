# Captura la linea base de las secciones que NO deben cambiar.
# Se ejecutara de nuevo despues de editar para comparar hashes.

$ErrorActionPreference = 'Stop'
$base = 'C:\Users\User\Desktop\Web de Gastos Mensuales\_correccion_s5'
$out  = Join-Path $base 'baseline.txt'

$dir = Get-ChildItem -Path "$env:USERPROFILE\Desktop\CICLO VI" -Recurse -Directory -Filter 'Apuntes y Practica' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*Semana 5*' } | Select-Object -First 1
if (-not $dir) { throw 'No se localizo la carpeta de entrega de la Semana 5.' }

$practica = Join-Path $dir.FullName '02 Practica - Semana 5.md'
$apuntes  = Join-Path $dir.FullName '01 Apuntes - Semana 5.md'

function Get-Text([string]$Path) {
    # PS 5.1: -Raw sin -Encoding lee ANSI. UTF8 explicito.
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8)
}

function Get-Sha256([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')
}

$pText = Get-Text $practica

# Bloque numerico principal: apartado 5 (Resultados) + apartado 6 (Detalle por seccion).
$i5 = $pText.IndexOf('## 5. Resultados')
$i7 = $pText.IndexOf('## 7. Las siete diferencias')
if ($i5 -lt 0 -or $i7 -lt 0 -or $i7 -le $i5) { throw 'No se localizaron los limites del bloque numerico 5-6.' }
$bloqueResultados = $pText.Substring($i5, $i7 - $i5)

# Volcado real: apartado 8 completo.
$i8 = $pText.IndexOf('## 8. Volcado completo de la salida real')
$i9 = $pText.IndexOf('## 9. Vacios declarados')
if ($i8 -lt 0 -or $i9 -lt 0 -or $i9 -le $i8) { throw 'No se localizaron los limites del volcado 8-9.' }
$bloqueVolcado = $pText.Substring($i8, $i9 - $i8)

$lineas = @()
$lineas += 'LINEA BASE - Secciones que NO deben cambiar'
$lineas += ('Practica: ' + $practica)
$lineas += ('Bloque resultados 5-6 chars: ' + $bloqueResultados.Length)
$lineas += ('SHA256 bloque resultados 5-6: ' + (Get-Sha256 $bloqueResultados))
$lineas += ('Bloque volcado 8 chars: ' + $bloqueVolcado.Length)
$lineas += ('SHA256 bloque volcado 8: ' + (Get-Sha256 $bloqueVolcado))
$lineas += ('SHA256 archivo practica completo: ' + (Get-Sha256 $pText))
$lineas += ('Tamano archivo practica: ' + (Get-Item -LiteralPath $practica).Length)
$lineas += ('SHA256 archivo apuntes completo: ' + (Get-Sha256 (Get-Text $apuntes)))
$lineas += ('Tamano archivo apuntes: ' + (Get-Item -LiteralPath $apuntes).Length)

# Copia fisica de respaldo del bloque numerico, para comparar linea a linea.
[System.IO.File]::WriteAllText((Join-Path $base 'baseline_bloque_resultados.txt'), $bloqueResultados, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $base 'baseline_bloque_volcado.txt'), $bloqueVolcado, (New-Object System.Text.UTF8Encoding($false)))

Set-Content -LiteralPath $out -Value $lineas -Encoding UTF8
$lineas | ForEach-Object { Write-Output $_ }