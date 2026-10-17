"""Run one configured local analyzer in an isolated process."""

import argparse
import base64
import importlib
import json
import math
from pathlib import Path

import cv2

from app.rules import rule_catalog


def load_analyzer(entrypoint: str):
    module_name, separator, function_name = entrypoint.partition(":")
    if not separator or not module_name or not function_name:
        raise ValueError("ANALYZER_ENTRYPOINT must be module:function")
    function = getattr(importlib.import_module(module_name), function_name)
    if not callable(function):
        raise TypeError("Analyzer entrypoint is not callable")
    return function


def _number(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError(f"{name} must be finite and nonnegative")
    return result


def _video_duration(capture: cv2.VideoCapture) -> tuple[float, float, int]:
    fps = capture.get(cv2.CAP_PROP_FPS)
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if not math.isfinite(fps) or fps <= 0 or not math.isfinite(frame_count) or frame_count <= 0:
        raise ValueError("Cannot determine video duration")
    return frame_count / fps, fps, round(frame_count)


def _evidence_frame(
    capture: cv2.VideoCapture, timestamp: float, fps: float, frame_count: int
) -> dict:
    frame_index = min(round(timestamp * fps), frame_count - 1)
    # Some MOV files advertise a few frames that are not actually decodable.
    # Keep evidence close to the requested time while tolerating a short tail.
    frame = None
    actual_index = None
    for candidate in range(frame_index, max(-1, frame_index - round(fps) - 1), -1):
        capture.set(cv2.CAP_PROP_POS_FRAMES, candidate)
        ok, decoded = capture.read()
        if ok and decoded is not None:
            frame = decoded
            actual_index = candidate
            break
    if frame is None or actual_index is None:
        raise ValueError(f"Cannot read evidence frame near {timestamp:.2f}s")
    height, width = frame.shape[:2]
    if width > 1280:
        frame = cv2.resize(frame, (1280, round(height * 1280 / width)))
    ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise ValueError("Cannot encode evidence frame")
    return {
        "timestamp_sec": round(actual_index / fps, 3),
        "image_base64": base64.b64encode(encoded.tobytes()).decode("ascii"),
    }


def build_result(video_path: Path, analyzer) -> dict:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot open video")
    try:
        duration, fps, frame_count = _video_duration(capture)
        findings = analyzer(video_path)
        if not isinstance(findings, list):
            raise ValueError("Analyzer must return a list of findings")
        rules = rule_catalog()
        violations = []
        for finding in findings:
            if not isinstance(finding, dict):
                raise ValueError("Each finding must be an object")
            rule_id = finding.get("rule_id")
            if rule_id not in rules:
                raise ValueError(f"Unknown rule_id: {rule_id}")
            rule = rules[rule_id]
            timecode = _number(finding.get("timecode_sec"), "timecode_sec")
            if timecode > duration + 1 / fps:
                raise ValueError("Finding timecode is outside the video")
            observation = finding.get("observation")
            if not isinstance(observation, str) or not observation.strip():
                raise ValueError("Finding observation must be nonempty text")
            observation = " ".join(observation.split())[:500]
            timestamps = finding.get("evidence_timestamps_sec", [timecode])
            if not isinstance(timestamps, list) or not 1 <= len(timestamps) <= 3:
                raise ValueError("Provide 1 to 3 evidence timestamps")
            evidence = []
            for raw_timestamp in timestamps:
                timestamp = _number(raw_timestamp, "evidence timestamp")
                if timestamp > duration + 1 / fps or abs(timestamp - timecode) > 15:
                    raise ValueError("Evidence timestamp is outside the event or video")
                evidence.append(_evidence_frame(capture, timestamp, fps, frame_count))
            description = (
                f"{observation} Возможное несоответствие: {rule['document']}, "
                f"{rule['section']}. Источник: {rule['url']}"
            )
            violations.append(
                {
                    "type": rule["title"],
                    "timecode_sec": round(timecode, 3),
                    "description": description,
                    "evidence_frames": evidence,
                }
            )
        return {
            "verdict": "violation" if violations else "no_violation",
            "violations": violations,
        }
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--analyzer", required=True)
    args = parser.parse_args()
    analyzer = load_analyzer(args.analyzer)
    result = build_result(args.input, analyzer)
    args.output.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
