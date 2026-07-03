# Compila el middleware a un .exe portable (PyInstaller, onedir).
# Uso:  cd backend; .\.venv\Scripts\Activate.ps1; pip install pyinstaller; .\build-exe.ps1
# Salida: dist\firewall-monitor\firewall-monitor.exe
#
# El exe NO empaqueta configuración ni estado: junto a él deben vivir
#   .env    (lo escribe el seed del Hub / se copia del servidor)
#   data\   (SQLite WAL, se crea sola)
#   static\ (frontend compilado, opcional si solo se usa como middleware)
# onedir (no onefile): evita el unpack a %TEMP% en cada arranque y facilita
# antivirus/whitelisting en Windows.

$entry = @"
import multiprocessing
multiprocessing.freeze_support()
import uvicorn
from app.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host=settings.api_host, port=settings.api_port, log_level=settings.log_level.lower())
"@
Set-Content -Encoding utf8 entry_exe.py $entry

pyinstaller entry_exe.py `
  --name firewall-monitor `
  --onedir --noconfirm --clean `
  --collect-all pysnmp `
  --collect-all pyasn1 `
  --hidden-import uvicorn.logging `
  --hidden-import uvicorn.loops.auto `
  --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto `
  --hidden-import uvicorn.lifespan.on `
  --hidden-import apscheduler.triggers.interval `
  --hidden-import apscheduler.triggers.date `
  --hidden-import aiosqlite

if ($LASTEXITCODE -eq 0) {
  Copy-Item .env.example dist\firewall-monitor\ -ErrorAction SilentlyContinue
  Write-Host "OK -> dist\firewall-monitor\firewall-monitor.exe (pon .env junto al exe)" -ForegroundColor Green
}
