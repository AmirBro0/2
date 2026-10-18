"""Download the original Minecraft End screenshot for private localhost preview."""
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/screenshots/enderdragon-ingame2.jpg"
DESTINATION = Path(__file__).resolve().parents[1] / "app/static/minecraft-local/inventory/end_world.jpg"

if __name__ == "__main__":
    with urlopen(Request(SOURCE, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
        data = response.read()
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("Expected the original JPEG screenshot")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_bytes(data)
    print(f"Saved original game screenshot: {DESTINATION}")
