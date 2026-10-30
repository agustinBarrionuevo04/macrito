"""Genera los íconos de la PWA (public/icons/*.png y src/app/favicon.ico).

Motivo: un anillo de progreso (el de las calorías del día) abierto arriba a la derecha, sobre fondo verde.
Uso: python3 scripts/generate-icons.py   (requiere Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (4, 120, 87)          # #047857
RING = (255, 255, 255)
SCALE = 4                  # supermuestreo para bordes suaves


def draw_icon(size: int, *, glyph_ratio: float, rounded: bool) -> Image.Image:
    """glyph_ratio: tamaño del anillo respecto del lienzo (la versión maskable usa ≤ 0.6, zona segura)."""
    big = size * SCALE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=BG)
    else:
        d.rectangle((0, 0, big, big), fill=BG)

    diameter = big * glyph_ratio
    stroke = int(diameter * 0.16)
    left = (big - diameter) / 2
    box = (left, left, left + diameter, left + diameter)
    # Arco de 290° que arranca arriba (−90°) y deja una abertura, como un anillo casi completo.
    d.arc(box, start=-90 + 25, end=-90 + 25 + 290, fill=RING, width=stroke)

    # Terminaciones redondeadas del arco.
    import math

    radius = diameter / 2 - stroke / 2
    cx = cy = big / 2
    for angle in (-90 + 25, -90 + 25 + 290):
        x = cx + radius * math.cos(math.radians(angle))
        y = cy + radius * math.sin(math.radians(angle))
        d.ellipse((x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2), fill=RING)

    # Punto central (el "plato").
    dot = diameter * 0.13
    d.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=RING)

    return img.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path, *, opaque: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if opaque:
        flat = Image.new("RGB", img.size, BG)
        flat.paste(img, mask=img.getchannel("A"))
        flat.save(path, optimize=True)
    else:
        img.save(path, optimize=True)
    print(f"{path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")


icons = ROOT / "public" / "icons"
save(draw_icon(192, glyph_ratio=0.62, rounded=True), icons / "icon-192.png")
save(draw_icon(512, glyph_ratio=0.62, rounded=True), icons / "icon-512.png")
# Maskable: fondo a sangre y glifo dentro del 60 % central (zona segura del 80 % de radio mínimo).
save(draw_icon(512, glyph_ratio=0.5, rounded=False), icons / "icon-maskable-512.png", opaque=True)
# iOS aplica sus propias esquinas: sin transparencia ni redondeo.
save(draw_icon(180, glyph_ratio=0.6, rounded=False), icons / "apple-touch-icon.png", opaque=True)

favicon = draw_icon(256, glyph_ratio=0.66, rounded=True)
(ROOT / "src" / "app").mkdir(parents=True, exist_ok=True)
favicon.save(ROOT / "src" / "app" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("src/app/favicon.ico  16/32/48")
