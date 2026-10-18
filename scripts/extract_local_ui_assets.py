"""Copy original game sounds and UI textures from an existing installation; never start Minecraft."""
import json
import os
from pathlib import Path
from zipfile import ZipFile

root = Path(os.environ["APPDATA"]) / ".minecraft"
out = Path(__file__).resolve().parents[1] / "app/static/minecraft-local/ui"
out.mkdir(parents=True, exist_ok=True)
textures = {
    "xp_background": "hud/experience_bar_background",
    "xp_progress": "hud/experience_bar_progress",
    "button": "widget/button",
    "button_highlighted": "widget/button_highlighted",
    "button_disabled": "widget/button_disabled",
    "toast": "toast/advancement",
}
for jar in sorted((root / "versions").glob("*/*.jar"), key=lambda p: p.stat().st_mtime, reverse=True):
    with ZipFile(jar) as z:
        paths = {name: f"assets/minecraft/textures/gui/sprites/{value}.png" for name, value in textures.items()}
        if all(path in z.namelist() for path in paths.values()):
            for name, path in paths.items():
                (out / f"{name}.png").write_bytes(z.read(path))
            break
for index in sorted((root / "assets/indexes").glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
    objects = json.loads(index.read_text("utf-8"))["objects"]
    for name, path in {"click": "random/click", "levelup": "random/levelup", "portal": "portal/travel", "pop": "random/pop"}.items():
        record = objects.get(f"minecraft/sounds/{path}.ogg")
        if record:
            source = root / "assets/objects" / record["hash"][:2] / record["hash"]
            if source.exists() and not (out / f"{name}.ogg").exists():
                (out / f"{name}.ogg").write_bytes(source.read_bytes())
print("Local UI assets:", ", ".join(p.name for p in out.iterdir()))
