#!/usr/bin/env python3
"""READ-ONLY: measure content band positions in the approved splash design
(2732x2732) to state precisely what @capacitor/assets' cover-fit keeps/crops."""
from PIL import Image
import numpy as np

img = Image.open("/home/z/my-project/public/splash.png").convert("RGB")
a = np.asarray(img)
nonwhite = ~(a > 244).all(axis=2)  # any visible ink

rows = nonwhite.sum(axis=1)
bands = []
inb = False
for y, v in enumerate(rows):
    if v > 2 and not inb:
        start = y; inb = True
    elif v <= 2 and inb:
        if y - start >= 4:
            bands.append((start, y))
        inb = False
if inb:
    bands.append((start, len(rows)))

print(f"canvas: {img.size[0]}x{img.size[1]}")
print("content bands (top -> bottom):")
for (y0, y1) in bands:
    seg = nonwhite[y0:y1]
    xs = np.where(seg.any(axis=0))[0]
    print(f"  y {y0:4d}-{y1:4d}  h={y1-y0:4d}  x {int(xs.min()):4d}-{int(xs.max()):4d}")

# cover-fit kept regions
def kept_center(total, keep):
    lo = (total - keep) / 2
    return lo, lo + keep

# portrait 960x1600: scale=1600/2732, full height kept, width cropped to 960
s = 1600 / 2732
xlo, xhi = kept_center(2732, 960 / s)
print(f"\nPORTRAIT 960x1600 cover: keeps x {int(xlo)}-{int(xhi)} (full height 0-2732)")
# landscape 1600x960: full width kept, height cropped to 960
ylo, yhi = kept_center(2732, 960 / s)
print(f"LANDSCAPE 1600x960 cover: keeps y {int(ylo)}-{int(yhi)} (full width)")
