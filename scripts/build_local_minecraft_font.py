"""Build a selectable browser font from the locally extracted game glyphs.

Requires fonttools and the project's OpenCV/NumPy. Commit the rebuilt TTF.
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


def main():
    root = Path(__file__).resolve().parents[1] / "app/static/minecraft-local/font"
    definitions = json.loads((root / "glyphs.json").read_text(encoding="utf-8"))
    glyphs, widths, mapping = {}, {}, {}
    for name in (".notdef", "space"):
        glyphs[name] = TTGlyphPen(None).glyph()
        widths[name] = (500, 0)
    mapping[32] = "space"
    for sheet in ("nonlatin_european", "accented", "ascii"):
        definition = definitions[sheet]
        pixels = cv2.imdecode(np.fromfile(root / f"{sheet}.png", dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        cell_w, cell_h = pixels.shape[1] // 16, pixels.shape[0] // len(definition["chars"])
        unit = definition["height"] / cell_h
        for row, chars in enumerate(definition["chars"]):
            for column, char in enumerate(chars):
                code = ord(char)
                if code == 0 or code in mapping:
                    continue
                alpha = pixels[row * cell_h:(row + 1) * cell_h, column * cell_w:(column + 1) * cell_w, 3]
                if not alpha.any():
                    continue
                pen = TTGlyphPen(None)
                for y in range(cell_h):
                    x = 0
                    while x < cell_w:
                        if not alpha[y, x]:
                            x += 1
                            continue
                        end = x + 1
                        while end < cell_w and alpha[y, end]:
                            end += 1
                        left, right = round(x * unit * 125), round(end * unit * 125)
                        top = round((definition["ascent"] - y * unit) * 125)
                        bottom = round((definition["ascent"] - (y + 1) * unit) * 125)
                        pen.moveTo((left, bottom))
                        pen.lineTo((left, top))
                        pen.lineTo((right, top))
                        pen.lineTo((right, bottom))
                        pen.closePath()
                        x = end
                name = f"uni{code:04X}"
                rightmost = np.nonzero(alpha)[1].max()
                glyphs[name] = pen.glyph()
                widths[name] = ((math.ceil((rightmost + 1) * unit) + 1) * 125, 0)
                mapping[code] = name
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap(mapping)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(widths)
    builder.setupHorizontalHeader(ascent=1000, descent=-250)
    builder.setupNameTable({"familyName": "Minecraft Local", "styleName": "Regular", "uniqueFontIdentifier": "MinecraftLocalBitmap", "fullName": "Minecraft Local", "psName": "MinecraftLocal"})
    builder.setupOS2(sTypoAscender=1000, sTypoDescender=-250, usWinAscent=1250, usWinDescent=500)
    builder.setupPost()
    builder.save(root / "minecraft.ttf")
    print(f"Built local browser font with {len(mapping)} glyphs")


if __name__ == "__main__":
    main()
