"""Copy installed Minecraft inventory textures for private localhost preview.

The copied game assets stay in the Git-ignored minecraft-local directory.
"""

import argparse
import os
from pathlib import Path
from zipfile import ZipFile


DESTINATION = Path(__file__).resolve().parents[1] / "app" / "static" / "minecraft-local" / "inventory"
ASSETS = {
    "inventory.png": "textures/gui/container/inventory.png",
    "slot.png": "textures/gui/sprites/container/slot.png",
    "slot_highlight_front.png": "textures/gui/sprites/container/slot_highlight_front.png",
    "tooltip_background.png": "textures/gui/sprites/tooltip/background.png",
    "tooltip_frame.png": "textures/gui/sprites/tooltip/frame.png",
    "ender_pearl.png": "textures/item/ender_pearl.png",
    "blaze_powder.png": "textures/item/blaze_powder.png",
    "blaze_rod.png": "textures/item/blaze_rod.png",
    "knowledge_book.png": "textures/item/knowledge_book.png",
    "ender_eye.png": "textures/item/ender_eye.png",
    "command_block_front.png": "textures/block/command_block_front.png",
    "command_block_side.png": "textures/block/command_block_side.png",
    "command_block_back.png": "textures/block/command_block_back.png",
    "dragon.png": "textures/entity/enderdragon/dragon.png",
}


def extract(minecraft_dir: Path, jar: Path | None = None) -> Path:
    jars = [jar] if jar else sorted(
        (minecraft_dir / "versions").glob("*/*.jar"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for candidate in jars:
        if not candidate or not candidate.is_file():
            continue
        with ZipFile(candidate) as bundle:
            names = set(bundle.namelist())
            if not all(f"assets/minecraft/{path}" in names for path in ASSETS.values()):
                continue
            DESTINATION.mkdir(parents=True, exist_ok=True)
            for output, source in ASSETS.items():
                (DESTINATION / output).write_bytes(bundle.read(f"assets/minecraft/{source}"))
            return candidate
    raise FileNotFoundError("A Minecraft installation with the inventory assets was not found")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minecraft-dir", type=Path, default=Path(os.environ.get("APPDATA", "")) / ".minecraft")
    parser.add_argument("--jar", type=Path)
    args = parser.parse_args()
    source = extract(args.minecraft_dir, args.jar)
    print(f"Local inventory textures copied from {source.name} to {DESTINATION}")
    print("Game assets are ignored by Git and must remain local.")


if __name__ == "__main__":
    main()
