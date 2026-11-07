#!/usr/bin/env python3
"""Generate the EzyMail notification small-icon PNGs (white glyph).

Owner request 2026-11-07: the notification icon should be the FULL app-logo
badge — the square shape like other apps' logos — not the bare letter "e".

Android renders status-bar small icons from the ALPHA channel only (one flat
color), so a colored logo is impossible there. The standard "app icon on a
notification" pattern is therefore: the logo's rounded-square badge silhouette
rendered white, with the white e+envelope mark knocked out (transparent).
  - dark status bar  → white square badge, e-envelope shows as the background
  - notification shade → the accent color (brand blue, setColor in
    EzyMailNotification) fills behind the cutout — the same colors as the app
    logo, just inverted by the system's single-color rule.

The cutout reuses the exact white-stroke detection of the v1 script (the
e+envelope shape the owner already approved), inverted: badge = logo alpha,
glyph = badge MINUS the e+envelope strokes.

Densities: mdpi 24, hdpi 36, xhdpi 48, xxhdpi 72, xxxhdpi 96.
"""
from PIL import Image
import os
from collections import deque

SRC = 'public/logo.png'
OUT_SIZES = {
    'drawable-mdpi': 24,
    'drawable-hdpi': 36,
    'drawable-xhdpi': 48,
    'drawable-xxhdpi': 72,
    'drawable-xxxhdpi': 96,
}

img = Image.open(SRC).convert('RGBA')
w, h = img.size
px = img.load()

# 1) White-pixel mask (the glyph strokes in the logo are pure white) — same
#    detection as v1, whose output shape the owner approved.
mask = [[False] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 100 and r > 205 and g > 205 and b > 205:
            mask[y][x] = True

# 2) Keep only components CONNECTED to the glyph's white ring (same rule as
#    v1): thin white streaks inside the blue plane connect to the ring and
#    stay, isolated specks (>=500 px rule) are dropped.
visited = [[False] * w for _ in range(h)]
keep = [[False] * w for _ in range(h)]
for y0 in range(h):
    for x0 in range(w):
        if mask[y0][x0] and not visited[y0][x0]:
            comp = []
            q = deque([(x0, y0)])
            visited[y0][x0] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) >= 500:
                for x, y in comp:
                    keep[y][x] = True

# 3) Badge silhouette = the logo's own alpha (rounded square), rendered white.
#    The e+envelope strokes become transparent cutouts.
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
opx = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 10 and not keep[y][x]:
            opx[x, y] = (255, 255, 255, 255)

bbox = out.getbbox()
m = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.06)
crop = out.crop((max(0, bbox[0] - m), max(0, bbox[1] - m),
                 min(w, bbox[2] + m), min(h, bbox[3] + m)))

# 4) Emit densities
preview = None
for d, s in OUT_SIZES.items():
    # draw at 4x then downscale for clean antialiased edges
    hi = crop.resize((s * 4, s * 4), Image.LANCZOS)
    final = hi.resize((s, s), Image.LANCZOS)
    os.makedirs(f'android/app/src/main/res/{d}', exist_ok=True)
    final.save(f'android/app/src/main/res/{d}/ic_notification.png')
    if preview is None:
        preview = final

# previews: dark status bar + brand-blue shade badge, to eyeball both surfaces
for name, bg_rgb in (('dark', (32, 33, 36)), ('blue', (24, 112, 232))):
    pv = preview.resize((96, 96), Image.NEAREST)
    bg = Image.new('RGBA', (96, 96), bg_rgb + (255,))
    bg.alpha_composite(pv)
    bg.convert('RGB').save(f'/tmp/icon-preview-{name}.png')
print('generated:', ', '.join(f'{d}/{s}px' for d, s in OUT_SIZES.items()))
