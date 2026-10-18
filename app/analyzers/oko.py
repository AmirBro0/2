"""Bridge OKO's real local detector into the durable ForteBank job queue."""
import json
from pathlib import Path
import time


def analyze_video(video_path: Path, *, progress_path: Path | None = None, budget: float = 240) -> dict:
    from app.oko.config import get_settings
    from app.oko.pipeline.analyzer import analyze

    def progress(stage, fraction):
        if progress_path:
            temporary = progress_path.with_suffix(".tmp")
            try:
                temporary.write_text(json.dumps({"stage": stage, "progress": round(fraction * 100, 1)}), encoding="utf-8")
                temporary.replace(progress_path)
            except OSError:
                # Windows may hold a read handle during a UI poll. Progress is
                # best effort: retain the last snapshot and retry next update.
                pass

    result = analyze(video_path, get_settings(), time.monotonic() + budget, progress)
    if not result.detectors:
        raise RuntimeError("No detector completed the analysis")
    if result.degraded:
        raise RuntimeError("Analysis did not cover the whole video within the time limit")
    if any(not finding.frames for finding in result.findings + result.review):
        raise RuntimeError("Could not extract evidence for an event")
    scope = "Проверен только обзор камеры. Проверка остальных кассовых действий ещё не подключена."
    return {
        "verdict": result.verdict,
        "violations": [finding.to_api() for finding in result.findings],
        "_ui": {
            "scope": scope,
            "mode": "baseline",
            "review": [finding.to_ui() for finding in result.review],
            "findings": [finding.to_ui() for finding in result.findings],
            "video": result.video,
            "activity": result.activity,
            "thumbs": result.thumbs,
            "timings": result.timings,
            "coverage_sec": result.coverage_sec,
            "notes": result.notes,
            "detectors": result.detectors,
        },
    }
