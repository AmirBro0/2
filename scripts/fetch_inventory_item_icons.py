"""Download unmodified in-game inventory captures for the local preview."""

import hashlib
import json
import struct
from pathlib import Path
from urllib.request import urlopen


DESTINATION = Path(__file__).resolve().parents[1] / "app/static/minecraft-local/inventory/items"
SOURCE = "https://raw.githubusercontent.com/TinyTank800/MinecraftAllImages/8888a461f088c6b907f13c14f25a12d90a481ae3/public/images-v2/1.21.1"
ITEMS = (
    "ender_pearl", "blaze_powder", "blaze_rod", "dragon_head", "command_block",
    "ender_eye", "knowledge_book", "compass", "bricks", "lava_bucket", "apple", "redstone",
)


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name in ITEMS:
        url = f"{SOURCE}/{name}.png"
        with urlopen(url, timeout=30) as response:
            data = response.read()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"Expected a PNG for {name}")
        width, height = struct.unpack(">II", data[16:24])
        (DESTINATION / f"{name}.png").write_bytes(data)
        manifest[name] = {"url": url, "width": width, "height": height, "sha256": hashlib.sha256(data).hexdigest()}
        print(f"{name}: {width} x {height}")
    (DESTINATION / "sources.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
