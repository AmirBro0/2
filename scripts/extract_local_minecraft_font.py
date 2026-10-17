"""Copy Minecraft's installed bitmap font for private localhost preview.

The extracted game assets are ignored by Git and Docker. Do not redistribute.
"""

import argparse
import json
import os
from pathlib import Path
from zipfile import ZipFile


DESTINATION = Path(__file__).resolve().parents[1] / "app" / "static" / "minecraft-local" / "font"
FONT_JSON = "assets/minecraft/font/include/default.json"
FONT_FILES = {
    "ascii": "assets/minecraft/textures/font/ascii.png",
    "nonlatin_european": "assets/minecraft/textures/font/nonlatin_european.png",
    "accented": "assets/minecraft/textures/font/accented.png",
}


def extract(minecraft_dir: Path, destination: Path, selected_jar: Path | None = None) -> Path:
    jars = [selected_jar] if selected_jar else sorted(
        (minecraft_dir / "versions").glob("*/*.jar"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for jar in jars:
        if not jar or not jar.is_file():
            continue
        with ZipFile(jar) as bundle:
            if not all(name in bundle.namelist() for name in [FONT_JSON, *FONT_FILES.values()]):
                continue
            providers = json.loads(bundle.read(FONT_JSON))["providers"]
            selected = {}
            for provider in providers:
                name = provider.get("file", "").removeprefix("minecraft:font/").removesuffix(".png")
                if name in FONT_FILES:
                    selected[name] = {
                        "chars": provider["chars"],
                        "ascent": provider["ascent"],
                        "height": provider.get("height", 8),
                    }
            if set(selected) != set(FONT_FILES):
                continue
            destination.mkdir(parents=True, exist_ok=True)
            for name, path in FONT_FILES.items():
                (destination / f"{name}.png").write_bytes(bundle.read(path))
            (destination / "glyphs.json").write_text(
                json.dumps(selected, ensure_ascii=False), encoding="utf-8"
            )
            return jar
    raise FileNotFoundError("No complete Minecraft bitmap font was found in the local installation")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minecraft-dir", type=Path, default=Path(os.environ.get("APPDATA", "")) / ".minecraft")
    parser.add_argument("--jar", type=Path, help="Optional specific Minecraft version JAR")
    args = parser.parse_args()
    jar = extract(args.minecraft_dir, DESTINATION, args.jar)
    print(f"Local Minecraft bitmap font copied from {jar.name} to {DESTINATION}")
    print("These game assets are ignored by Git and must remain local.")


if __name__ == "__main__":
    main()
