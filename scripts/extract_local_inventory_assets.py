"""Copy installed Minecraft inventory textures for private localhost preview.

The copied game assets stay in the Git-ignored minecraft-local directory.
"""

import argparse
import os
import shutil
from pathlib import Path
from zipfile import ZipFile


DESTINATION = Path(__file__).resolve().parents[1] / "app" / "static" / "minecraft-local" / "inventory"
ASSETS = {
    "inventory.png": "textures/gui/container/inventory.png",
    "slot.png": "textures/gui/sprites/container/slot.png",
    "slot_highlight_front.png": "textures/gui/sprites/container/slot_highlight_front.png",
    "helmet_slot.png": "textures/gui/sprites/container/slot/helmet.png",
    "chestplate_slot.png": "textures/gui/sprites/container/slot/chestplate.png",
    "leggings_slot.png": "textures/gui/sprites/container/slot/leggings.png",
    "boots_slot.png": "textures/gui/sprites/container/slot/boots.png",
    "shield_slot.png": "textures/gui/sprites/container/slot/shield.png",
    "tooltip_background.png": "textures/gui/sprites/tooltip/background.png",
    "tooltip_frame.png": "textures/gui/sprites/tooltip/frame.png",
    "moss_block.png": "textures/block/moss_block.png",
    "hud_hotbar.png": "textures/gui/sprites/hud/hotbar.png",
    "hud_heart.png": "textures/gui/sprites/hud/heart/full.png",
    "hud_food.png": "textures/gui/sprites/hud/food_full.png",
    "recipe_book.png": "textures/gui/recipe_book.png",
    "recipe_button.png": "textures/gui/sprites/recipe_book/button.png",
    "recipe_button_highlighted.png": "textures/gui/sprites/recipe_book/button_highlighted.png",
    "recipe_slot.png": "textures/gui/sprites/recipe_book/slot_craftable.png",
    "recipe_tab.png": "textures/gui/sprites/recipe_book/tab.png",
    "recipe_tab_selected.png": "textures/gui/sprites/recipe_book/tab_selected.png",
    "recipe_filter_enabled.png": "textures/gui/sprites/recipe_book/filter_enabled.png",
    "recipe_filter_disabled.png": "textures/gui/sprites/recipe_book/filter_disabled.png",
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
    parser.add_argument("--world-reference", type=Path, help="Optional local Minecraft world screenshot supplied by the user")
    args = parser.parse_args()
    source = extract(args.minecraft_dir, args.jar)
    if args.world_reference:
        shutil.copyfile(args.world_reference, DESTINATION / "world_reference.png")
    print(f"Local inventory textures copied from {source.name} to {DESTINATION}")
    print("Game assets are ignored by Git and must remain local.")


if __name__ == "__main__":
    main()
