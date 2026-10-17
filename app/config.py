from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    api_key: str
    data_dir: Path
    analyzer_entrypoint: str
    max_upload_bytes: int
    job_timeout_sec: int
    result_ttl_sec: int
    parallel_jobs: int

    @property
    def database_path(self) -> Path:
        return self.data_dir / "jobs.sqlite3"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def results_dir(self) -> Path:
        return self.data_dir / "results"


def load_settings() -> Settings:
    return Settings(
        api_key=os.getenv("API_KEY", ""),
        data_dir=Path(os.getenv("DATA_DIR", "./data")).resolve(),
        analyzer_entrypoint=os.getenv(
            "ANALYZER_ENTRYPOINT", "app.analyzers.unconfigured:analyze_video"
        ),
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_MB", "200")) * 1024 * 1024,
        job_timeout_sec=int(os.getenv("JOB_TIMEOUT_SEC", "270")),
        result_ttl_sec=int(os.getenv("RESULT_TTL_HOURS", "24")) * 3600,
        parallel_jobs=max(1, int(os.getenv("PARALLEL_JOBS", "1"))),
    )
