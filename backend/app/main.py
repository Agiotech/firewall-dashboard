import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.router import api_router
from .auth import require_basic_auth
from .cache.database import init_db
from .config import settings
from .netflow.listener import start_netflow_server, stop_netflow_server
from .scheduler.jobs import start_scheduler, stop_scheduler
from .syslog.listener import start_syslog_server, stop_syslog_server

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler()
    await start_syslog_server()
    await start_netflow_server()
    log.info("Firewall dashboard started (mock_mode=%s)", settings.mock_mode)
    try:
        yield
    finally:
        stop_netflow_server()
        stop_syslog_server()
        stop_scheduler()


app = FastAPI(title="Firewall Dashboard", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, _auth: None = Depends(require_basic_auth)):
        # Do NOT shadow API routes. If FastAPI didn't match /api/* above,
        # it's truly missing — let the client see a clean 404.
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="API route not found")
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(status_code=503, detail="frontend not built")
