from pathlib import Path


def analyze_video(video_path: Path) -> list[dict]:
    """Fail clearly until a real local analyzer is connected."""
    raise RuntimeError(
        "Analyzer is not configured. Set ANALYZER_ENTRYPOINT to the local model adapter."
    )
