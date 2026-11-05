#!/usr/bin/env python3
"""Generate the EzyMail notification small-icon PNGs (white glyph).

The old ic_notification.xml was a generic Material envelope — the owner
wanted the EzyMail logo on the notification. Status-bar icons must be
white-on-transparent (only the alpha channel is rendered), so we extract
the white "e + envelope" glyph from public/logo.png and emit densities:
mdpi 24, hdpi 36, xhdpi 48, xxhdpi 72, xxxhdpi 96.
"""
from PIL import Image
import sys
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

# 1) White-pixel mask (the glyph strokes in the logo are pure white)
mask = [[False] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 100 and r > 205 and g > 205 and b > 205:
            mask[y][x] = True

# 2) Keep only components CONNECTED to the glyph's white ring. The white
#    streaks inside the blue plane are thin; if they touch the ring they
#    stay (they draw the envelope fold). Specks far away get dropped by
#    keeping only components larger than 500 px.
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

# 3) Render white-on-transparent, crop to content with a small margin
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
opx = out.load()
for y in range(h):
    for x in range(w):
        if keep[y][x]:
            opx[x, y] = (255, 255, 255, 255)

bbox = out.getbbox()
m = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.10)
crop = out.crop((max(0, bbox[0] - m), max(0, bbox[1] - m),
                 min(w, bbox[2] + m), min(h, bbox[3] + m)))

# 4) Emit densities
import os
preview = None
for d, s in OUT_SIZES.items():
    # draw at 4x then downscale for clean antialiased edges
    hi = crop.resize((s * 4, s * 4), Image.LANCZOS)
    final = hi.resize((s, s), Image.LANCZOS)
    os.makedirs(f'android/app/src/main/res/{d}', exist_ok=True)
    final.save(f'android/app/src/main/res/{d}/ic_notification.png')
    if preview is None:
        preview = final

# small preview for visual check
pv = preview.resize((96, 96), Image.NEAREST)
# composite on dark bg to see the white glyph
bg = Image.new('RGBA', (96, 96), (32, 33, 36, 255))
bg.alpha_composite(pv)
bg.convert('RGB').save('/tmp/icon-preview.png')
print('generated:', ', '.join(f'{d}/{s}px' for d, s in OUT_SIZES.items()))
