"""Pipeline settings only. Authentication and storage belong to the host service."""
from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    sample_fps: float = 5.0
    threshold: float = 0.65
    review_threshold: float = 0.3
    detectors: tuple[str, ...] = ("obstruction",)
    reserve_sec: float = 15.0
    face_blur: str = "auto"
    evidence_max_width: int = 1280
    jpeg_quality: int = 85
    max_violations: int = 30


def get_settings() -> Settings:
    threshold = min(1.0, max(0.01, float(os.getenv("OKO_THRESHOLD", "0.65"))))
    return Settings(
        sample_fps=min(15, max(0.5, float(os.getenv("OKO_SAMPLE_FPS", "5")))),
        threshold=threshold,
        review_threshold=min(threshold, max(0, float(os.getenv("OKO_REVIEW_THRESHOLD", "0.3")))),
        detectors=tuple(x.strip() for x in os.getenv("OKO_DETECTORS", "obstruction").split(",") if x.strip()),
    )
