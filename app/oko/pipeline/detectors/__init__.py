from .base import AnalysisContext, Box, Candidate, Detector
from .obstruction import ObstructionDetector

# Demo detections are deliberately absent from the application registry.
REGISTRY = {"obstruction": ObstructionDetector}


def build_detectors(names: tuple[str, ...]) -> list[Detector]:
    if not names or any(name not in REGISTRY for name in names):
        raise ValueError("Configure at least one implemented detector in OKO_DETECTORS")
    return [REGISTRY[name]() for name in names]
