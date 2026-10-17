"""Run private labeled videos through the two-step API and summarize results."""

import argparse
import base64
import binascii
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import statistics
import time

import httpx


def validate_result(result: dict, duration: float) -> list[str]:
    errors = []
    verdict = result.get("verdict")
    findings = result.get("violations")
    if verdict not in ("violation", "no_violation") or not isinstance(findings, list):
        return ["missing verdict or violations"]
    if (verdict == "violation") != bool(findings):
        errors.append("verdict and violations disagree")
    for index, finding in enumerate(findings):
        if not isinstance(finding, dict):
            errors.append(f"finding {index} is not an object")
            continue
        timestamp = finding.get("timecode_sec")
        if not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or not 0 <= timestamp <= duration + 1:
            errors.append(f"finding {index} has an invalid timecode")
        if not isinstance(finding.get("type"), str) or not finding["type"].strip():
            errors.append(f"finding {index} has no type")
        if not isinstance(finding.get("description"), str) or not finding["description"].strip():
            errors.append(f"finding {index} has no description")
        frames = finding.get("evidence_frames")
        if not isinstance(frames, list) or not 1 <= len(frames) <= 3:
            errors.append(f"finding {index} needs 1 to 3 evidence frames")
            continue
        for frame_index, frame in enumerate(frames):
            try:
                frame_time = frame["timestamp_sec"]
                jpeg = base64.b64decode(frame["image_base64"], validate=True)
                if not isinstance(frame_time, (int, float)) or not math.isfinite(frame_time) or not 0 <= frame_time <= duration + 1:
                    raise ValueError("invalid timestamp")
                if not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
                    raise ValueError("invalid JPEG")
            except (binascii.Error, KeyError, TypeError, ValueError):
                errors.append(f"finding {index} frame {frame_index} is invalid")
    return errors


def analyze_one(client: httpx.Client, base_url: str, api_key: str, item: dict, deadline_sec: float) -> dict:
    started = time.monotonic()
    record = {
        "id": item["id"],
        "expected_verdict": item["verdict"],
        "expected_timecode_sec": item["timecode_sec"],
        "sha256": item["sha256"],
    }
    try:
        with Path(item["file"]).open("rb") as source:
            response = client.post(
                f"{base_url}/api/v1/analyze",
                headers={"X-API-Key": api_key},
                files={"file": (Path(item["file"]).name, source, "video/quicktime")},
            )
        response.raise_for_status()
        payload = response.json()
        if response.status_code != 202 or set(payload) != {"job_id"}:
            raise ValueError(f"POST contract mismatch: {response.status_code}, {list(payload)}")
        job_id = payload["job_id"]
        record["job_id"] = job_id
        while time.monotonic() - started < deadline_sec:
            status_response = client.get(
                f"{base_url}/api/v1/jobs/{job_id}",
                headers={"X-API-Key": api_key},
            )
            status_response.raise_for_status()
            job = status_response.json()
            if job.get("status") in ("done", "failed"):
                break
            time.sleep(0.5)
        else:
            raise TimeoutError(f"No result within {deadline_sec:.0f} seconds")
        record["status"] = job["status"]
        if job["status"] == "failed":
            record["error"] = job.get("error", "unspecified analysis error")
        else:
            record["predicted_verdict"] = job.get("verdict")
            record["contract_errors"] = validate_result(job, item["duration_sec"])
            findings = job.get("violations", [])
            if not isinstance(findings, list):
                findings = []
            record["findings"] = [
                {
                    "type": finding.get("type"),
                    "timecode_sec": finding.get("timecode_sec"),
                    "description": finding.get("description"),
                    "evidence_timestamps_sec": [frame.get("timestamp_sec") for frame in finding.get("evidence_frames", []) if isinstance(frame, dict)],
                }
                for finding in findings
                if isinstance(finding, dict) and isinstance(finding.get("evidence_frames", []), list)
            ]
            if item["timecode_sec"] is not None and record["findings"]:
                times = [finding["timecode_sec"] for finding in record["findings"] if isinstance(finding["timecode_sec"], (int, float))]
                if times:
                    record["nearest_time_error_sec"] = round(min(abs(timestamp - item["timecode_sec"]) for timestamp in times), 3)
        record["elapsed_sec"] = round(time.monotonic() - started, 3)
    except (OSError, httpx.HTTPError, ValueError, TimeoutError) as error:
        record["status"] = "failed"
        record["error"] = str(error)
        record["elapsed_sec"] = round(time.monotonic() - started, 3)
    return record


def metrics(records: list[dict]) -> dict:
    done = [record for record in records if record.get("status") == "done" and not record.get("contract_errors")]
    counts = Counter(
        (record["expected_verdict"], record["predicted_verdict"])
        for record in done
    )
    tp = counts[("violation", "violation")]
    fn = counts[("violation", "no_violation")]
    fp = counts[("no_violation", "violation")]
    tn = counts[("no_violation", "no_violation")]
    matched = tp + fn + fp + tn
    time_errors = [record["nearest_time_error_sec"] for record in done if record.get("nearest_time_error_sec") is not None and record["expected_verdict"] == "violation"]
    elapsed = sorted(record["elapsed_sec"] for record in records if "elapsed_sec" in record)
    return {
        "attempted": len(records),
        "completed_with_valid_schema": len(done),
        "failed_or_invalid": len(records) - len(done),
        "tp": tp,
        "fn": fn,
        "fp": fp,
        "tn": tn,
        "accuracy": round((tp + tn) / matched, 3) if matched else None,
        "precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "median_time_error_sec": round(statistics.median(time_errors), 3) if time_errors else None,
        "max_elapsed_sec": elapsed[-1] if elapsed else None,
        "p95_elapsed_sec": elapsed[math.ceil(0.95 * len(elapsed)) - 1] if elapsed else None,
        "over_five_minutes": [record["id"] for record in records if record.get("elapsed_sec", 0) >= 300],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("data/dataset_audit.json"))
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, default=Path("data/evaluation.json"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--deadline-sec", type=float, default=300)
    parser.add_argument("--allow-unready", action="store_true", help="Only for checking failure handling before the model is connected")
    args = parser.parse_args()
    if args.concurrency < 1 or (args.limit is not None and args.limit < 1):
        parser.error("--concurrency and --limit must be positive")
    api_key = os.getenv("API_KEY")
    if not api_key:
        parser.error("Set API_KEY in the environment before running")
    try:
        health = httpx.get(f"{args.base_url.rstrip('/')}/healthz", timeout=10).json()
    except (httpx.HTTPError, ValueError) as error:
        parser.error(f"Cannot reach service health endpoint: {error}")
    if not health.get("ready") and not args.allow_unready:
        parser.error("Analyzer is not connected; add --allow-unready only to test failure handling")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    videos = manifest["videos"][: args.limit] if args.limit else manifest["videos"]
    def run_item(item: dict) -> dict:
        with httpx.Client(timeout=httpx.Timeout(30.0, read=30.0, write=args.deadline_sec)) as client:
            return analyze_one(client, args.base_url.rstrip("/"), api_key, item, args.deadline_sec)

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        records = list(executor.map(run_item, videos))
    for record in records:
        print(f"{record['id']}: {record['status']} in {record['elapsed_sec']:.1f}s")
    # Keep the first evaluated record for each exact video, rather than dropping
    # duplicate groups altogether. This yields one vote per distinct video.
    seen_hashes = set()
    unique_records = []
    for record in records:
        if record["sha256"] not in seen_hashes:
            unique_records.append(record)
            seen_hashes.add(record["sha256"])
    report = {
        "summary": metrics(records),
        "without_exact_duplicates": metrics(unique_records),
        "records": records,
        "notes": [
            "The source spreadsheet has verdict and timecode labels but no event types; classification accuracy needs human review.",
            "Timestamp distance does not establish that the evidence frame shows the event; review frames manually.",
            "Identical files must remain in the same train/validation split. Duplicate-free metrics keep the first evaluated row per hash; X-4 and X-47 have conflicting reference seconds.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("summary", "without_exact_duplicates")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
