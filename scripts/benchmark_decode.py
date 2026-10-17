"""Measure complete local decoding of one MOV file, without running a model."""

import argparse
import json
from pathlib import Path
import time

import cv2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    args = parser.parse_args()
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        parser.error("Video cannot be opened")
    claimed_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    started = time.monotonic()
    decoded_frames = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame is None:
            raise ValueError("Decoder returned an empty frame")
        decoded_frames += 1
    elapsed = time.monotonic() - started
    capture.release()
    print(
        json.dumps(
            {
                "file": args.video.name,
                "bytes": args.video.stat().st_size,
                "duration_sec": round(claimed_frames / fps, 3),
                "claimed_frames": claimed_frames,
                "decoded_frames": decoded_frames,
                "decode_elapsed_sec": round(elapsed, 3),
                "decode_frames_per_sec": round(decoded_frames / elapsed, 1),
                "note": "Only decoder speed; model and API are not included.",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
