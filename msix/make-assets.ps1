# Gera os icones do pacote MSIX a partir do mesmo desenho do public/icon.svg.
# Uso: powershell -ExecutionPolicy Bypass -File make-assets.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot 'staging\Assets'
New-Item -ItemType Directory -Path $out -Force | Out-Null

$bg    = [System.Drawing.ColorTranslator]::FromHtml('#0F6B5C')
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$mint  = [System.Drawing.ColorTranslator]::FromHtml('#8FD3C2')
$ink   = [System.Drawing.ColorTranslator]::FromHtml('#0F6B5C')

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-Icon([int]$w, [int]$h, [string]$file, [switch]$FullBleed) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $side = [Math]::Min($w, $h)
    $pad = if ($FullBleed) { 0 } else { [int]($side * 0.06) }
    $box = $side - (2 * $pad)
    $ox = [int](($w - $box) / 2)
    $oy = [int](($h - $box) / 2)

    $radius = [single]($box * 0.23)
    $bgPath = New-RoundedPath $ox $oy $box $box $radius
    $brush = New-Object System.Drawing.SolidBrush($bg)
    $g.FillPath($brush, $bgPath)

    # Grade de 64 unidades, como no SVG.
    $u = $box / 64.0
    $gap = [single](2 * $u)
    $cellW = [single](18 * $u)
    $cellH = [single]((15 * $u))
    $cellH2 = [single](17 * $u)
    $r2 = [single](4 * $u)

    $cells = @(
        @{ X = 12; Y = 14; W = 18; H = 15; C = $white },
        @{ X = 34; Y = 14; W = 18; H = 15; C = $mint },
        @{ X = 12; Y = 33; W = 18; H = 17; C = $mint },
        @{ X = 34; Y = 33; W = 18; H = 17; C = $white }
    )
    foreach ($c in $cells) {
        $xx = [single]($ox + ($c.X * $u))
        $yy = [single]($oy + ($c.Y * $u))
        $ww = [single]($c.W * $u)
        $hh = [single]($c.H * $u)
        $path = New-RoundedPath $xx $yy $ww $hh ([single]($r2))
        $b = New-Object System.Drawing.SolidBrush($c.C)
        $g.FillPath($b, $path)
        $path.Dispose(); $b.Dispose()
    }

    # Detalhes internos: ponto superior esquerdo, "+" inferior esquerdo,
    # ponto inferior direito e traco horizontal.
    $penW = [single][Math]::Max(1.0, 3 * $u)
    $pen = New-Object System.Drawing.Pen($ink, $penW)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $dot = [single](3 * $u)

    $dx1 = [single]($ox + (21 * $u)); $dy1 = [single]($oy + (21.5 * $u))
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($ink)), $dx1 - ($dot / 2), $dy1 - ($dot / 2), $dot, $dot)
    $dx2 = [single]($ox + (42 * $u)); $dy2 = [single]($oy + (41.5 * $u))
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($ink)), $dx2 - ($dot / 2), $dy2 - ($dot / 2), $dot, $dot)

    $pen.Width = [single][Math]::Max(1.0, 2.2 * $u)
    $g.DrawLine($pen, [single]($ox + 18 * $u), [single]($oy + 40.5 * $u), [single]($ox + 24 * $u), [single]($oy + 40.5 * $u))
    $g.DrawLine($pen, [single]($ox + 21 * $u), [single]($oy + 37.5 * $u), [single]($ox + 21 * $u), [single]($oy + 43.5 * $u))
    $g.DrawLine($pen, [single]($ox + 39 * $u), [single]($oy + 41.5 * $u), [single]($ox + 45 * $u), [single]($oy + 41.5 * $u))

    $pen.Dispose(); $brush.Dispose(); $bgPath.Dispose()
    $g.Dispose()
    $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "  $file (${w}x${h})"
}

Write-Host 'Gerando icones MSIX...'
New-Icon 50 50 'StoreLogo.png' -FullBleed
New-Icon 44 44 'Square44x44Logo.png' -FullBleed
New-Icon 150 150 'Square150x150Logo.png' -FullBleed
New-Icon 310 150 'Wide310x150Logo.png' -FullBleed
New-Icon 620 300 'SplashScreen.png' -FullBleed
New-Icon 256 256 'Square256x256Logo.png' -FullBleed

# Artefatos da loja (fora do pacote): pasta ../store
$store = Join-Path (Split-Path $PSScriptRoot -Parent) 'store'
New-Item -ItemType Directory -Path $store -Force | Out-Null
$saveDir = $out
$out = $store
New-Icon 1080 1080 'icon-1080.png' -FullBleed
New-Icon 512 512 'icon-512.png' -FullBleed
New-Icon 1024 500 'feature-graphic-1024x500.png' -FullBleed
$out = $saveDir

Write-Host "OK: $out" -ForegroundColor Green
