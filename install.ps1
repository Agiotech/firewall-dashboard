# Setup inicial: crea venv backend e instala node_modules frontend
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

Write-Host "[1/2] Backend (.venv + pip install) ..." -ForegroundColor Cyan
Push-Location $backend
if (-not (Test-Path '.venv')) {
    py -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Pop-Location

Write-Host "[2/2] Frontend (npm install) ..." -ForegroundColor Cyan
Push-Location $frontend
npm install
Pop-Location

if (-not (Test-Path (Join-Path $backend '.env'))) {
    Copy-Item (Join-Path $backend '.env.example') (Join-Path $backend '.env')
    Write-Host "Copiado .env.example a .env (edita credenciales para datos reales)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup completo." -ForegroundColor Green
Write-Host "  Dev:   .\run-dev.ps1"
Write-Host "  Prod:  .\run-prod.ps1"
