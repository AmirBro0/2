import base64
from pathlib import Path
import time

import cv2
from fastapi.testclient import TestClient
import numpy as np

from app.config import Settings
from app.main import create_app


def settings(tmp_path: Path, analyzer: str = "tests.fake_analyzer:analyze_video") -> Settings:
    return Settings(
        api_key="test-secret",
        data_dir=tmp_path / "data",
        analyzer_entrypoint=analyzer,
        max_upload_bytes=1024 * 1024,
        job_timeout_sec=20,
        result_ttl_sec=3600,
        parallel_jobs=1,
    )


def sample_video(path: Path) -> bytes:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10, (160, 120))
    assert writer.isOpened(), "OpenCV cannot encode the test .mov file"
    for number in range(20):
        frame = np.full((120, 160, 3), 35 + number * 5, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path.read_bytes()


def wait_for_job(client: TestClient, job_id: str) -> dict:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        response = client.get(
            f"/api/v1/jobs/{job_id}", headers={"X-API-Key": "test-secret"}
        )
        assert response.status_code == 200
        job = response.json()
        if job["status"] in ("done", "failed"):
            return job
        time.sleep(0.1)
    raise AssertionError("Analysis job did not finish")


def test_upload_requires_key_and_mov(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path))) as client:
        assert client.post("/api/v1/analyze", files={"file": ("clip.mov", b"x")}).status_code == 401
        response = client.post(
            "/api/v1/analyze",
            headers={"X-API-Key": "test-secret"},
            files={"file": ("clip.mp4", b"x")},
        )
        assert response.status_code == 415
        assert client.get("/api/v1/jobs/missing", headers={"X-API-Key": "test-secret"}).status_code == 404


def test_analysis_returns_evidence_and_removes_upload(tmp_path: Path):
    video = sample_video(tmp_path / "clip.mov")
    config = settings(tmp_path)
    with TestClient(create_app(config)) as client:
        response = client.post(
            "/api/v1/analyze",
            headers={"X-API-Key": "test-secret", "Prefer": "respond-async"},
            files={"file": ("clip.mov", video, "video/quicktime")},
        )
        assert response.status_code == 202
        job_id = response.json()["job_id"]
        result = wait_for_job(client, job_id)
        assert result["status"] == "done", result
        assert result["verdict"] == "violation"
        assert len(result["violations"]) == 1
        finding = result["violations"][0]
        assert finding["timecode_sec"] == 0.5
        assert "пункт 20" in finding["description"]
        assert len(finding["evidence_frames"]) == 2
        assert base64.b64decode(finding["evidence_frames"][0]["image_base64"]).startswith(b"\xff\xd8")
        assert not list(config.uploads_dir.glob("*.mov"))


def test_unconfigured_analyzer_fails_instead_of_reporting_clean(tmp_path: Path):
    video = sample_video(tmp_path / "clip.mov")
    config = settings(tmp_path, "app.analyzers.unconfigured:analyze_video")
    with TestClient(create_app(config)) as client:
        response = client.post(
            "/api/v1/analyze",
            headers={"X-API-Key": "test-secret", "Prefer": "respond-async"},
            files={"file": ("clip.mov", video)},
        )
        result = wait_for_job(client, response.json()["job_id"])
        assert result["status"] == "failed"
        assert "not been connected" in result["error"]


def test_synchronous_api_returns_jury_schema(tmp_path: Path):
    video = sample_video(tmp_path / "clip.mov")
    with TestClient(create_app(settings(tmp_path))) as client:
        response = client.post(
            "/api/v1/analyze",
            headers={"X-API-Key": "test-secret"},
            files={"file": ("clip.mov", video, "video/quicktime")},
        )
        assert response.status_code == 200
        result = response.json()
        assert set(result) == {"verdict", "violations"}
        assert result["verdict"] == "violation"
        assert result["violations"][0]["evidence_frames"]
