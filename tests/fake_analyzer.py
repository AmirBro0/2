from pathlib import Path


def analyze_video(video_path: Path) -> list[dict]:
    assert video_path.is_file()
    return [
        {
            "rule_id": "cash_receipt_client_present",
            "timecode_sec": 0.5,
            "observation": "Тестовое наблюдение на видеозаписи.",
            "evidence_timestamps_sec": [0.4, 0.6],
        }
    ]
