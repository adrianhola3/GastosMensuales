# Verificacion final de la correccion del apartado 16 / 2.2 / conclusion.
# Comprueba: UTF-8 sin U+FFFD, afirmaciones falsas ausentes,
# bloques numericos 5-6 y volcado 8 sin cambios (hash vs linea base),
# tamanos, y reabre el xlsx por COM exigiendo cero errores.

$ErrorActionPreference = 'Stop'
$base = 'C:\Users\User\Desktop\Web de Gastos Mensuales\_correccion_s5'
$log  = Join-Path $base 'verificacion_final.txt'

$dir = Get-ChildItem -Path "$env:USERPROFILE\Desktop\CICLO VI" -Recurse -Directory -Filter 'Apuntes y Practica' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*Semana 5*' } | Select-Object -First 1
if (-not $dir) { throw 'No se localizo la carpeta de entrega de la Semana 5.' }

$apuntes  = Join-Path $dir.FullName '01 Apuntes - Semana 5.md'
$practica = Join-Path $dir.FullName '02 Practica - Semana 5.md'
$xlsx     = Join-Path $dir.FullName 'Semana5_Practica_Distribucion_Normal.xlsx'

function Get-Text([string]$Path) { Get-Content -LiteralPath $Path -Raw -Encoding UTF8 }
function Get-Sha256([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','')
}
function Test-Utf8([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $enc = New-Object System.Text.UTF8Encoding($false, $true)   # throwOnInvalidBytes
    try {
        $text = $enc.GetString($bytes)
        $replacement = $text.Contains([char]0xFFFD)
        # CJK y Hiragana/Katakana/Fullwidth
        $cjk = [regex]::Matches($text, '[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]').Count
        return [pscustomobject]@{ Valido = $true; Reemplazo = $replacement; CJK = $cjk; Chars = $text.Length }
    } catch {
        return [pscustomobject]@{ Valido = $false; Reemplazo = $true; CJK = 0; Chars = 0 }
    }
}

$L = @()
$L += '===== VERIFICACION FINAL - Correccion apartado 16 / 2.2 / conclusion ====='
$L += ('Fecha: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$L += ''

# ---- 1. UTF-8 y tamanos ----
$L += '--- 1) Codificacion UTF-8 y tamanos ---'
foreach ($f in @($apuntes, $practica)) {
    $u = Test-Utf8 $f
    $sz = (Get-Item -LiteralPath $f).Length
    $L += ('  ' + (Split-Path $f -Leaf))
    $L += ('    Tamano: ' + $sz + ' bytes')
    $L += ('    UTF-8 valido: ' + $u.Valido + ' | U+FFFD: ' + $u.Reemplazo + ' | CJK/Hiragana: ' + $u.CJK)
}
$L += ('  xlsx Tamano: ' + (Get-Item -LiteralPath $xlsx).Length + ' bytes')
$L += ''

# ---- 2. Afirmaciones falsas ausentes ----
$L += '--- 2) Afirmaciones falsas (deben estar ausentes) ---'
$bad = @(
    'ninguna de esas seis existe',
    'Se sondearon las 26 funciones',
    'Se sondearon 26 funciones',
    'seis funciones de Excel que no existen',
    'NORM.S.DIST | #NOMBRE?',
    'NORM.S.INV | #NOMBRE?',
    '26 funciones',
    'COEF.VAR` y si funcionan',
    'Divergencia entre la consigna'
)
$totalBad = 0
foreach ($f in @($apuntes, $practica)) {
    $t = Get-Text $f
    foreach ($p in $bad) {
        $n = ([regex]::Matches($t, [regex]::Escape($p))).Count
        $totalBad += $n
        if ($n -gt 0) { $L += ('  ALERTA ' + (Split-Path $f -Leaf) + ' contiene [' + $p + '] x' + $n) }
    }
}
if ($totalBad -eq 0) { $L += '  OK: ninguna afirmacion falsa presente.' }
$L += ''

# ---- 3. Bloques numericos sin cambios vs linea base ----
$L += '--- 3) Bloques numericos sin cambios (hash vs linea base) ---'
$baseline = Get-Content -LiteralPath (Join-Path $base 'baseline.txt') -Encoding UTF8
$baseHashRes = ($baseline | Where-Object { $_ -like '*SHA256 bloque resultados*' }) -replace '.*:\s*',''
$baseHashVol = ($baseline | Where-Object { $_ -like '*SHA256 bloque volcado*' }) -replace '.*:\s*',''
$baseLenRes  = [int](($baseline | Where-Object { $_ -like '*Bloque resultados*chars*' }) -replace '.*:\s*','')
$baseLenVol  = [int](($baseline | Where-Object { $_ -like '*Bloque volcado*chars*' }) -replace '.*:\s*','')

$pText = Get-Text $practica
$i5 = $pText.IndexOf('## 5. Resultados')
$i7 = $pText.IndexOf('## 7. Las siete diferencias')
$i8 = $pText.IndexOf('## 8. Volcado completo de la salida real')
$i9 = $pText.IndexOf('## 9. Vacios declarados')
if ($i5 -lt 0 -or $i7 -le $i5 -or $i8 -lt 0 -or $i9 -le $i8) { throw 'Limites de seccion no encontrado en la practica.' }
$res = $pText.Substring($i5, $i7 - $i5)
$vol = $pText.Substring($i8, $i9 - $i8)
$resHash = Get-Sha256 $res
$volHash = Get-Sha256 $vol

$L += ('  Bloque resultados 5-6  base chars: ' + $baseLenRes + '  ahora: ' + $res.Length)
$L += ('  SHA256 base: ' + $baseHashRes)
$L += ('  SHA256 ahora: ' + $resHash)
$L += ('  IDENTICO: ' + ($resHash -eq $baseHashRes))
$L += ('  Bloque volcado 8       base chars: ' + $baseLenVol + '  ahora: ' + $vol.Length)
$L += ('  SHA256 base: ' + $baseHashVol)
$L += ('  SHA256 ahora: ' + $volHash)
$L += ('  IDENTICO: ' + ($volHash -eq $baseHashVol))
$L += ''

# ---- 4. Reabrir xlsx por COM y exigir cero errores ----
$L += '--- 4) Reapertura del xlsx por COM (cero errores) ---'
$xl = $null; $wb = $null
try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AskToUpdateLinks = $false
    $wb = $xl.Workbooks.Open($xlsx, 0, $true)   # UpdateLinks=0, ReadOnly=$true
    $sheets = @()
    foreach ($ws in $wb.Worksheets) { $sheets += $ws.Name }
    $errCells = 0
    $cellErrors = @()
    foreach ($ws in $wb.Worksheets) {
        $used = $ws.UsedRange
        $nRows = $used.Rows.Count
        $nCols = $used.Columns.Count
        for ($r = 1; $r -le $nRows; $r++) {
            for ($c = 1; $c -le $nCols; $c++) {
                $v = $ws.Cells.Item($r, $c).Text
                if ($v -is [string] -and ($v -match '^#(NOMBRE|REF|VALOR|DIV/0|NUM|N/A|NULL)')) {
                    $errCells++
                    if ($errCells -le 20) { $cellErrors += ($ws.Name + '!' + $ws.Cells.Item($r,$c).Address(0,0) + '=' + $v) }
                }
            }
        }
    }
    $L += ('  Libro reabierto: ' + $wb.Name)
    $L += ('  Hojas: ' + ($sheets -join ', '))
    $L += ('  Celdas con error (#...): ' + $errCells)
    if ($errCells -gt 0) { foreach ($e in $cellErrors) { $L += ('    ' + $e) } }
    if ($errCells -eq 0) { $L += '  OK: cero errores en el libro reabierto.' }
    $wb.Close($false)
    $xl.Quit()
} catch {
    $L += ('  ERROR al reabrir: ' + $_.Exception.Message)
    if ($wb) { try { $wb.Close($false) } catch {} }
    if ($xl) { try { $xl.Quit() } catch {} }
} finally {
    if ($wb) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($xl) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

$L += ''
$L += '===== FIN VERIFICACION ====='
Set-Content -LiteralPath $log -Value $L -Encoding UTF8
$L | ForEach-Object { Write-Output $_ }