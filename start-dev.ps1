#Requires -Version 5.1
param()

$root    = $PSScriptRoot
$apiDir  = Join-Path $root 'local-api'
$envFile = Join-Path $apiDir '.env'
$envEx   = Join-Path $apiDir '.env.example'

Write-Host ""
Write-Host "  PIPEON - Inicializacao local" -ForegroundColor Cyan
Write-Host "  ------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERRO] 'npm' nao encontrado no PATH." -ForegroundColor Red
    Write-Host "         Instale o Node.js em https://nodejs.org e tente novamente." -ForegroundColor DarkGray
    exit 1
}

if (-not (Test-Path $envFile)) {
    if (Test-Path $envEx) {
        Copy-Item $envEx $envFile
        Write-Host "  [OK] local-api/.env criado a partir do .env.example" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Pressione Enter para continuar (Ctrl+C para sair)"
    } else {
        Write-Host "  [AVISO] local-api/.env ausente. O servidor vai usar variaveis do sistema." -ForegroundColor Yellow
    }
}

$nodeModules = Join-Path $apiDir 'node_modules'
if (-not (Test-Path $nodeModules)) {
    Write-Host "  [INFO] Instalando dependencias da local-api..." -ForegroundColor DarkGray
    Push-Location $apiDir
    npm install --silent
    Pop-Location
    Write-Host "  [OK] Dependencias instaladas." -ForegroundColor Green
}

Write-Host "  [1/2] Iniciando local-api (Express :5000)..." -ForegroundColor DarkGray

$escapedApiDir = $apiDir -replace "'", "''"
$apiCmd = "Set-Location '$escapedApiDir'; Write-Host '  local-api - Express :5000' -ForegroundColor Cyan; npm start"
Start-Process powershell -ArgumentList "-NoExit", "-NoLogo", "-Command", $apiCmd

Start-Sleep -Seconds 1

Write-Host "  [2/2] Iniciando frontend Vite (:5173)..." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Servicos rodando:" -ForegroundColor Green
Write-Host "    Frontend  ->  http://localhost:5173" -ForegroundColor White
Write-Host "    local-api ->  http://localhost:5000" -ForegroundColor White
Write-Host ""

Set-Location $root
npm run dev
