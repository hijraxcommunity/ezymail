#!/usr/bin/env python3
"""Generate the EzyMail notification small-icon PNGs (white mark on blue).

Owner request 2026-11-07 (v3): "the notification color should be DARK, not
white circle with blue icon — keep it full shape, not only E."

Why the previous white-badge icon failed: Android 12+ renders small-icon
pixels WHITE on an accent-colored circle, so the badge silhouette showed as
a big WHITE square with the blue mark inside — the exact "white circle with
blue color icon" the owner rejected.

The fix keeps the standard Android pattern (Gmail / WhatsApp) and makes it
read like the app logo:
  - the icon content is the FULL e+envelope logo mark (never a bare "E")
    rendered white from the logo's own white strokes,
  - scaled to ~58% of the canvas so the brand-blue accent circle (setColor
    in EzyMailNotification) shows around it → the notification icon area is
    BLUE-dominant ("dark"), with the white mark centered = the logo look,
  - status bar (dark background) shows the clean white mark with natural
    padding, like every standard app.

Densities: mdpi 24, hdpi 36, xhdpi 48, xxhdpi 72, xxxhdpi 96.
"""
from PIL import Image
import os
from collections import deque

SRC = 'public/logo.png'
# Mark size relative to the icon canvas. 0.58 keeps the accent circle
# clearly visible around the mark (dark/blue-dominant) while staying
# legible at 24dp — same proportion Gmail's "M" uses inside its icon.
MARK_FILL = 0.58
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

# 1) White-pixel mask — the e+envelope mark strokes in the logo are white.
mask = [[False] * w for _ in range(h)]
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 100 and r > 205 and g > 205 and b > 205:
            mask[y][x] = True

# 2) Keep components ≥ 500 px (specks dropped) — same rule that produced
#    the mark the owner approved in v1.
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

# 3) Render white-on-transparent, crop tight to the mark.
mark = Image.new('RGBA', (w, h), (0, 0, 0, 0))
mpx = mark.load()
for y in range(h):
    for x in range(w):
        if keep[y][x]:
            mpx[x, y] = (255, 255, 255, 255)
bbox = mark.getbbox()
mark = mark.crop(bbox)

# 4) Compose the final canvas: mark centered at MARK_FILL of the canvas.
first = None
for d, s in OUT_SIZES.items():
    hi = s * 4  # draw at 4x, downscale for clean antialiased edges
    canvas = Image.new('RGBA', (hi, hi), (0, 0, 0, 0))
    ms = round(hi * MARK_FILL)
    scaled = mark.resize((ms, ms), Image.LANCZOS)
    off = (hi - ms) // 2
    canvas.alpha_composite(scaled, (off, off))
    final = canvas.resize((s, s), Image.LANCZOS)
    os.makedirs(f'android/app/src/main/res/{d}', exist_ok=True)
    final.save(f'android/app/src/main/res/{d}/ic_notification.png')
    if first is None:
        first = final

# 5) Previews — how the icon will actually look on each surface.
BIG = 144
big = first.resize((BIG, BIG), Image.LANCZOS)

# (a) Status bar: white mark on dark background
sb = Image.new('RGBA', (BIG, BIG), (28, 28, 30, 255))
sb.alpha_composite(big)
sb.convert('RGB').save('/tmp/icon-preview-statusbar.png')

# (b) Stock Android 12+ shade: white mark centered on the accent circle.
from PIL import ImageDraw
BRAND = (24, 112, 232, 255)
shade = Image.new('RGBA', (BIG, BIG), (250, 250, 250, 255))
d2 = ImageDraw.Draw(shade)
d2.ellipse((2, 2, BIG - 2, BIG - 2), fill=BRAND)
shade.alpha_composite(big)
shade.convert('RGB').save('/tmp/icon-preview-shade-circle.png')

# (c) 24px legibility check: rendered at true size, zoomed 8x on both.
tiny = first.resize((24, 24), Image.LANCZOS)
zoom = tiny.resize((192, 192), Image.NEAREST)
z1 = Image.new('RGBA', (192, 192), (28, 28, 30, 255))
z1.alpha_composite(zoom)
z2 = Image.new('RGBA', (192, 192), (24, 112, 232, 255))
z2.alpha_composite(zoom)
duo = Image.new('RGB', (192 * 2 + 8, 192), (240, 240, 240))
duo.paste(z1.convert('RGB'), (0, 0))
duo.paste(z2.convert('RGB'), (200, 0))
duo.save('/tmp/icon-preview-24px-zoom.png')

# (d) Side-by-side strip.
strip = Image.new('RGB', (BIG * 2 + 10, BIG), (240, 240, 240))
strip.paste(sb.convert('RGB'), (0, 0))
strip.paste(shade.convert('RGB'), (BIG + 10, 0))
strip.save('/tmp/icon-preview-all.png')

print('generated:', ', '.join(f'{d}/{s}px' for d, s in OUT_SIZES.items()))
print('previews: /tmp/icon-preview-{statusbar,shade-circle,24px-zoom,all}.png')
