"""Copy the user's installed Minecraft menu panorama for private localhost preview.

The copied game assets are deliberately excluded from Git and Docker builds.
Do not redistribute the copied files with this project.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil


ASSET_KEYS = [f"minecraft/textures/gui/title/background/panorama_{number}.png" for number in range(6)]
DESTINATION = Path(__file__).resolve().parents[1] / "app" / "static" / "minecraft-local"


def extract(minecraft_dir: Path, destination: Path, index_name: str | None = None) -> str:
    assets = minecraft_dir / "assets"
    indexes = assets / "indexes"
    candidates = [indexes / index_name] if index_name else sorted(
        indexes.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True
    )
    for index_path in candidates:
        if not index_path.is_file():
            continue
        entries = json.loads(index_path.read_text(encoding="utf-8")).get("objects", {})
        if not all(key in entries for key in ASSET_KEYS):
            continue
        sources = []
        for key in ASSET_KEYS:
            digest = entries[key]["hash"]
            source = assets / "objects" / digest[:2] / digest
            if not source.is_file():
                break
            if hashlib.sha1(source.read_bytes()).hexdigest() != digest:
                raise ValueError(f"Corrupt installed asset: {key}")
            sources.append(source)
        if len(sources) != 6:
            continue
        destination.mkdir(parents=True, exist_ok=True)
        for number, source in enumerate(sources):
            shutil.copyfile(source, destination / f"panorama_{number}.png")
        return index_path.name
    raise FileNotFoundError("No complete Minecraft menu panorama was found in the local installation")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    default_dir = Path(os.environ.get("APPDATA", "")) / ".minecraft"
    parser.add_argument("--minecraft-dir", type=Path, default=default_dir)
    parser.add_argument("--index", help="Optional asset index filename, such as 32.json")
    args = parser.parse_args()
    index = extract(args.minecraft_dir, DESTINATION, args.index)
    print(f"Local Minecraft panorama copied from {index} to {DESTINATION}")
    print("These game images are ignored by Git and must remain local.")


if __name__ == "__main__":
    main()
