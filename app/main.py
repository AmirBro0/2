from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import hmac
import json
import uuid
import time
import importlib

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import Settings, load_settings
from app.rules import rule_catalog
from app.runner import JobRunner
from app.store import JobStore


STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    store = JobStore(settings.database_path)
    runner = JobRunner(settings, store)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        settings.results_dir.mkdir(parents=True, exist_ok=True)
        store.initialize()
        store.requeue_interrupted()
        runner_tasks = [
            asyncio.create_task(runner.run()) for _ in range(settings.parallel_jobs)
        ]
        try:
            yield
        finally:
            runner.stop()
            await asyncio.gather(*runner_tasks)

    app = FastAPI(title="ForteBank Video Review", lifespan=lifespan)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    def valid_api_key(candidate: str | None) -> bool:
        return candidate is not None and (
            hmac.compare_digest(candidate, settings.api_key)
            or (settings.demo_key_enabled and hmac.compare_digest(candidate, "test"))
        )

    @app.middleware("http")
    async def upload_guard(request: Request, call_next):
        if request.method == "POST" and request.url.path == "/api/v1/analyze":
            if not settings.api_key:
                return JSONResponse({"detail": "API key is not configured"}, status_code=503)
            candidate = request.headers.get("X-API-Key")
            if not valid_api_key(candidate):
                return JSONResponse({"detail": "Invalid API key"}, status_code=401)
            content_length = request.headers.get("Content-Length")
            if content_length and content_length.isdigit():
                if len(content_length) > 20 or int(content_length) > settings.max_upload_bytes + 65536:
                    return JSONResponse({"detail": "Video is too large"}, status_code=413)
        return await call_next(request)

    def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
        if not settings.api_key:
            raise HTTPException(status_code=503, detail="API key is not configured")
        if not valid_api_key(x_api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(STATIC_DIR / "intro.html")

    @app.get("/app", include_in_schema=False)
    def main_page():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/review", include_in_schema=False)
    def review_page():
        return FileResponse(STATIC_DIR / "review.html")

    @app.get("/api/v1/auth/check", dependencies=[Depends(require_api_key)], include_in_schema=False)
    def check_key():
        return {"ok": True}

    @app.get("/healthz", include_in_schema=False)
    def health():
        return {
            "ready": bool(settings.api_key)
            and settings.analyzer_entrypoint != "app.analyzers.unconfigured:analyze_video"
        }

    @app.get("/api/v1/connection", dependencies=[Depends(require_api_key)])
    def connection():
        baseline = settings.analyzer_entrypoint == "app.analyzers.oko:analyze_video"
        ready = settings.analyzer_entrypoint != "app.analyzers.unconfigured:analyze_video"
        reason = "Модель анализа ещё не подключена. Запись сохранена в браузере."
        if ready:
            try:
                module, name = settings.analyzer_entrypoint.split(":", 1)
                if not callable(getattr(importlib.import_module(module), name)):
                    raise ValueError("Invalid entrypoint")
                if baseline:
                    from app.oko.config import get_settings
                    from app.oko.pipeline.detectors import build_detectors
                    build_detectors(get_settings().detectors)
                reason = "Локальный детектор обзора камеры готов. Остальные кассовые действия пока не проверяются." if baseline else "Локальный анализатор готов к обработке."
            except Exception:
                ready = False
                reason = "Анализатор настроен, но не загружается. Проверьте зависимости и настройки сервера."
        return {"server": True, "authorized": True, "ready": ready, "mode": "baseline" if baseline else "model", "message": reason, "max_upload_bytes": settings.max_upload_bytes}

    @app.get("/api/v1/rules")
    def rules():
        return list(rule_catalog().values())

    @app.get("/api/v1/catalog")
    def full_catalog():
        from app.oko.rules.catalog import catalog_payload
        return catalog_payload()

    @app.post("/api/v1/analyze", status_code=202, dependencies=[Depends(require_api_key)])
    async def analyze(file: UploadFile = File(...)):
        if not file.filename or not file.filename.lower().endswith(".mov"):
            raise HTTPException(status_code=415, detail="Upload a .mov video")
        job_id = uuid.uuid4().hex[:16]
        destination = settings.uploads_dir / f"{job_id}.mov"
        size = 0
        try:
            with destination.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise HTTPException(status_code=413, detail="Video is too large")
                    output.write(chunk)
            if size == 0:
                raise HTTPException(status_code=400, detail="Video is empty")
            store.enqueue(job_id, destination)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        finally:
            await file.close()

        runner.wake()
        return {"job_id": job_id}

    @app.get("/api/v1/jobs/{job_id}", dependencies=[Depends(require_api_key)])
    def get_job(job_id: str):
        job = store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        status = job["status"]
        response = {
            "job_id": job_id,
            "status": "processing" if status in ("queued", "processing") else status,
        }
        if status == "done":
            response.update({k: v for k, v in json.loads(job["result_json"]).items() if k != "_ui"})
        elif status == "failed":
            response["error"] = job["error"]
        return JSONResponse(response)

    @app.get("/api/v1/jobs/{job_id}/details", dependencies=[Depends(require_api_key)])
    def job_details(job_id: str):
        job = store.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found")
        info = {"status": job["status"], "queue_position": store.queue_position(job_id), "elapsed_sec": round(max(0, time.time() - job["created_at"]), 1)}
        if job["status"] == "processing":
            try:
                info.update(json.loads((settings.results_dir / f"{job_id}.progress.json").read_text(encoding="utf-8")))
            except (OSError, ValueError):
                info["stage"] = "detect"
        if job["status"] == "done":
            info["result"] = json.loads(job["result_json"]).get("_ui", {})
        return info

    return app


app = create_app()
