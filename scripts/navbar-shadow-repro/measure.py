#!/usr/bin/env python3
"""Measure pixels in the band just below the header border (y=57..63, x=center)
in the before/after repro screenshots. A visible elevation-2 shadow shows as
gray (RGB < 255); a covered shadow shows as pure white (255,255,255)."""
from PIL import Image

for name in ("before", "after"):
    img = Image.open(f"/tmp/navbar-repro/{name}.png").convert("RGB")
    w, h = img.size
    print(f"--- {name}.png ({w}x{h}) ---")
    for y in range(55, 66):
        px = img.getpixel((206, y))
        tag = "shadow(gray)" if px != (255, 255, 255) else "pure white"
        print(f"  y={y}: RGB{px}  {tag}")
