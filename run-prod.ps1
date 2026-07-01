# Build del frontend + arranque del backend sirviendo todo en :5175
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

Write-Host "Build frontend ..." -ForegroundColor Cyan
Push-Location $frontend
npm run build
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) {
    Write-Host "Build frontend fallo. Abortando." -ForegroundColor Red
    exit 1
}

Write-Host "Arrancando backend en :5175 (sirviendo SPA + API) ..." -ForegroundColor Cyan
Write-Host "Abre http://localhost:5175" -ForegroundColor Green
Push-Location $backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 5175
Pop-Location
