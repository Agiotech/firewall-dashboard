# Arranca backend (uvicorn :8088) y frontend (Vite :5173) en paralelo.
# Detener: Ctrl+C en cada ventana, o cerrar.

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path (Join-Path $backend '.venv'))) {
    Write-Host "Backend venv no encontrado. Crealo con:" -ForegroundColor Yellow
    Write-Host "  cd backend; py -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host "Frontend node_modules no encontrado. Crealo con:" -ForegroundColor Yellow
    Write-Host "  cd frontend; npm install" -ForegroundColor Yellow
    exit 1
}

Write-Host "Arrancando backend en :8088 ..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$backend'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload"
)

Write-Host "Arrancando frontend en :5173 ..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$frontend'; npm run dev"
)

Write-Host ""
Write-Host "Listo. Abre http://localhost:5173" -ForegroundColor Green
Write-Host "API directa en http://localhost:8088/api/health"
