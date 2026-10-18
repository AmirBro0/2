from dataclasses import replace
import base64
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.oko.pipeline.detectors import build_detectors
from tests.test_service import settings, wait_for_job


def textured_video(path: Path, covered: bool) -> bytes:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10, (320, 180))
    assert writer.isOpened()
    grid = np.indices((180, 320)).sum(axis=0) // 12 % 2
    for index in range(70):
        texture = np.where(grid[..., None], 175, 45).astype(np.uint8).repeat(3, axis=2)
        if covered and 20 <= index < 40:
            texture[:] = 0
        writer.write(texture)
    writer.release()
    return path.read_bytes()


@pytest.mark.parametrize("covered,threshold,reported", [(False, .65, False), (True, .65, True), (True, .99, False)])
def test_real_baseline_and_private_details(tmp_path, monkeypatch, covered, threshold, reported):
    monkeypatch.setenv("OKO_DETECTORS", "obstruction")
    monkeypatch.setenv("OKO_THRESHOLD", str(threshold))
    config = settings(tmp_path, "app.analyzers.oko:analyze_video")
    config = replace(config, job_timeout_sec=25)
    video = textured_video(tmp_path / "clip.mov", covered)
    with TestClient(create_app(config)) as client:
        headers = {"X-API-Key": "test-secret"}
        health = client.get("/api/v1/connection", headers=headers).json()
        assert health["ready"] and health["mode"] == "baseline"
        job = client.post("/api/v1/analyze", headers=headers, files={"file": ("clip.mov", video)}).json()["job_id"]
        result = wait_for_job(client, job)
        assert result["status"] == "done", result
        assert result["verdict"] == ("violation" if reported else "no_violation")
        assert "_ui" not in result
        assert client.get(f"/api/v1/jobs/{job}/details").status_code == 401
        details = client.get(f"/api/v1/jobs/{job}/details", headers=headers).json()["result"]
        assert details["coverage_sec"] >= 6.5
        assert details["detectors"] == ["obstruction"]
        assert len(details["thumbs"]) <= 101
        assert details["activity"]
        if covered and not reported:
            assert len(details["review"]) == 1
            assert details["review"][0]["status"] == "review"
        if reported:
            event = result["violations"][0]
            assert 1.8 <= event["timecode_sec"] <= 2.2
            assert "п. 16 подп. 6)" in event["description"]
            assert 1 <= len(event["evidence_frames"]) <= 3
            assert base64.b64decode(event["evidence_frames"][0]["image_base64"]).startswith(b"\xff\xd8")
        assert not list(config.uploads_dir.glob("*.mov"))


def test_connection_diagnoses_unconfigured_and_broken(tmp_path):
    for analyzer in ["app.analyzers.unconfigured:analyze_video", "missing_model_xyz:analyze"]:
        with TestClient(create_app(settings(tmp_path, analyzer))) as client:
            assert client.get("/api/v1/connection").status_code == 401
            result = client.get("/api/v1/connection", headers={"X-API-Key":"test-secret"}).json()
            assert result["server"] and result["authorized"] and not result["ready"]


def test_demo_and_unknown_detectors_cannot_report_clean():
    for names in [(), ("demo",), ("missing",), ("obstruction", "missing")]:
        with pytest.raises(ValueError):
            build_detectors(names)


def test_windows_progress_read_lock_does_not_abort_analysis(tmp_path, monkeypatch):
    from app.analyzers.oko import analyze_video
    monkeypatch.setenv("OKO_DETECTORS", "obstruction")
    monkeypatch.setenv("OKO_THRESHOLD", "0.65")
    video = tmp_path / "clip.mov"
    textured_video(video, True)
    original = Path.replace

    def locked_progress(source, target):
        if str(target).endswith(".progress.json"):
            raise PermissionError("Windows UI reader has an open handle")
        return original(source, target)

    monkeypatch.setattr(Path, "replace", locked_progress)
    result = analyze_video(video, progress_path=tmp_path/"test.progress.json", budget=30)
    assert result["verdict"] == "violation"
    assert result["_ui"]["coverage_sec"] >= 6.5
