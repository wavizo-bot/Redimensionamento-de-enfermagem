#Requires -Version 5.1
<#
  Build reproduzivel do MSIX — Dimensionamento de Enfermagem
  Uso:
    powershell -ExecutionPolicy Bypass -File msix\Build-MSIX.ps1
    powershell -ExecutionPolicy Bypass -File msix\Build-MSIX.ps1 -Version 1.0.1.0

  Etapas: npm build -> staging/www -> assets -> host C# (csc) -> manifesto
          -> OAuth client -> makeappx -> signtool (certificado de teste).
#>
param(
    [string]$Version = '1.0.0.0',
    [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent),
    [string]$MsixDir = $PSScriptRoot,
    [string]$WebView2Source = 'C:\APPS\Caderno de Cuidado\MSIX\staging',
    [string]$OAuthClient = 'C:\APPS\ID.OAuth\client_secret_20831325533-hmppc1d04i0g681s85ilrs83cal0pm5f.apps.googleusercontent.com.json',
    [string]$SdkBin = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$staging = Join-Path $MsixDir 'staging'
$output  = Join-Path $MsixDir 'output'
$exeName = 'DimensionamentoDeEnfermagem.exe'
$package = "wavizo.Dimensionamentodeenfermagem_${Version}_x64.msix"
$outFile = Join-Path $output $package

function Step([string]$text) { Write-Host "==> $text" -ForegroundColor Cyan }

# ---------------------------------------------------------------- 1. build web
Step 'Build do aplicativo web (Vite)'
Push-Location $ProjectRoot
try {
    if (-not $SkipInstall -and -not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
        npm install
    }
    npm run build
}
finally { Pop-Location }

# ---------------------------------------------------------------- 2. staging
Step 'Preparando staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging 'www') -Force | Out-Null
New-Item -ItemType Directory -Path $output -Force | Out-Null

Copy-Item -Path (Join-Path $ProjectRoot 'dist\*') -Destination (Join-Path $staging 'www') -Recurse -Force

# Copia o mesmo build para a demonstracao publica no GitHub Pages.
$publicApp = Join-Path $ProjectRoot 'docs\app'
if (Test-Path $publicApp) { Remove-Item $publicApp -Recurse -Force }
New-Item -ItemType Directory -Path $publicApp -Force | Out-Null
Copy-Item -Path (Join-Path $ProjectRoot 'dist\*') -Destination $publicApp -Recurse -Force

# A versao exibida vem do package.json (Vite) e e corrigida em tempo de
# execucao pelo host com a versao real do AppxManifest (GetAppVersion).

# ---------------------------------------------------------------- 3. assets
Step 'Gerando icones'
& (Join-Path $MsixDir 'make-assets.ps1')

# ---------------------------------------------------------------- 4. WebView2
Step 'Copiando runtime WebView2'
$wv2 = @(
    'Microsoft.Web.WebView2.Core.dll',
    'Microsoft.Web.WebView2.WinForms.dll',
    'Microsoft.Web.WebView2.Wpf.dll',
    'WebView2Loader.dll'
)
foreach ($dll in $wv2) {
    $src = Join-Path $WebView2Source $dll
    if (-not (Test-Path $src)) {
        throw "DLL do WebView2 nao encontrada: $src (informe -WebView2Source)."
    }
    Copy-Item $src (Join-Path $staging $dll) -Force
}

# ---------------------------------------------------------------- 5. host C#
Step 'Compilando host nativo (csc)'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe nao encontrado em $csc" }

& $csc /nologo /target:winexe /platform:x64 /optimize+ `
    /out:"$(Join-Path $staging $exeName)" `
    /reference:"$(Join-Path $staging 'Microsoft.Web.WebView2.WinForms.dll')" `
    /reference:"$(Join-Path $staging 'Microsoft.Web.WebView2.Core.dll')" `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.dll `
    /reference:System.Net.Http.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll `
    /reference:System.Core.dll `
    "$(Join-Path $MsixDir 'src\Launcher.cs')"
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o host (csc $LASTEXITCODE)." }

# ---------------------------------------------------------------- 6. manifesto
Step 'Aplicando AppxManifest'
$manifest = Get-Content (Join-Path $MsixDir 'AppxManifest.xml') -Raw
$manifest = $manifest -replace '(?<=\s)Version="[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"', "Version=`"$Version`""
Set-Content -Path (Join-Path $staging 'AppxManifest.xml') -Value $manifest -Encoding UTF8

# ---------------------------------------------------------------- 7. OAuth
Step 'Incluindo client OAuth Desktop'
if (-not (Test-Path $OAuthClient)) {
    throw "Client OAuth nao encontrado: $OAuthClient (nunca versionar este arquivo)."
}
Copy-Item $OAuthClient (Join-Path $staging 'google-client.json') -Force

# ---------------------------------------------------------------- 8. limpeza
# Nunca empacotar dados de execucao do WebView2 (cache, cookies, sessoes).
Get-ChildItem $staging -Directory -Filter '*.WebView2' -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

# ---------------------------------------------------------------- 9. pack
Step 'Empacotando MSIX'
$makeappx = Join-Path $SdkBin 'makeappx.exe'
if (-not (Test-Path $makeappx)) { throw "makeappx.exe nao encontrado em $SdkBin" }
if (Test-Path $outFile) { Remove-Item $outFile -Force }
& $makeappx pack /d $staging /p $outFile /nv /o
if ($LASTEXITCODE -ne 0) { throw "Falha no makeappx ($LASTEXITCODE)." }

# ---------------------------------------------------------------- 10. assinatura
# A Microsoft Store reassina o pacote no envio; o certificado abaixo serve
# apenas para teste local (sideload).
$pfx = Join-Path $MsixDir 'devcert.pfx'
$signtool = Join-Path $SdkBin 'signtool.exe'
if ((Test-Path $pfx) -and (Test-Path $signtool)) {
    Step 'Assinando com certificado de teste'
    & $signtool sign /fd SHA256 /f $pfx /p 'Caderno123!' $outFile
    if ($LASTEXITCODE -ne 0) { Write-Warning "Assinatura falhou; o pacote sem assinatura ainda serve para envio a Store." }
}
else {
    Write-Warning "Certificado de teste ausente; pacote gerado sem assinatura (ok para envio a Store)."
}

Write-Host ''
Write-Host "OK: $outFile" -ForegroundColor Green
Write-Host ("Tamanho: {0:N1} MB" -f ((Get-Item $outFile).Length / 1MB))
