#!/usr/bin/env python3
"""Regenerate the EzyMail notification small-icon PNGs from the EXACT original
logo asset (public/logo.png) — owner report 2026-11-11: "The mail/envelope
icon inside the letter 'E' is slightly cut off on its right side."

ROOT CAUSE of that defect: the five drawable-*/ic_notification.png files
currently in the tree (restored verbatim from 040b317 by 80ff962) were drawn
outside the repo with no generation script. Their knocked-out mark is a
hand-made rendition, NOT the logo:
  - the mark is stretched from the logo's true 646:726 (0.89) aspect to a
    square 1.0 aspect,
  - the envelope flap's right diagonal is truncated by a vertical cut ~85%
    across the canvas, and the right flap sliver becomes a detached,
    vertically-clipped chunk — at notification sizes this reads exactly as
    "the envelope is cut off on its right side".

THE FIX (no redraw): derive every pixel of the icon from the original logo.
  tile silhouette  = the logo's own alpha channel (its rounded-square tile)
  knocked-out mark = the logo's own white glyph mask (the e+envelope mark,
                     complete, in its true proportions and position)
  final alpha      = tile * (1 - glyph)  — the mark shows through the badge
                     as the accent colour, exactly the approved "EzyMail
                     square inside the blue badge" look;
  RGB = pure white (Android small icons are rendered from the alpha only).
Each density is drawn at 4x and LANCZOS-downsampled for clean AA edges.

Densities: mdpi 24, hdpi 36, xhdpi 48, xxhdpi 72, xxxhdpi 96.
"""
from PIL import Image
import numpy as np
import os

SRC = 'public/logo.png'
OUT_SIZES = {
    'drawable-mdpi': 24,
    'drawable-hdpi': 36,
    'drawable-xhdpi': 48,
    'drawable-xxhdpi': 72,
    'drawable-xxxhdpi': 96,
}
SS = 4  # supersample factor (repo pattern from gen-notification-icon.py)

img = Image.open(SRC).convert('RGBA')
lg = np.array(img).astype(np.float64)
r, g, b, a = lg[..., 0], lg[..., 1], lg[..., 2], lg[..., 3]

# --- tile silhouette: the logo's own alpha channel -------------------------
tile = a / 255.0

# --- knocked-out mark: the logo's own white glyph (soft mask) --------------
# near-neutral bright pixels only: keeps the white e+envelope strokes and the
# white right-flap sliver, excludes the blue tile gradient and the coloured
# soft shadows (which are tile, not mark).
lum = (r + g + b) / 3.0
maxc = np.maximum(np.maximum(r, g), b)
minc = np.minimum(np.minimum(r, g), b)
neutral = np.clip(1.0 - (maxc - minc) / 60.0, 0.0, 1.0)
bright = np.clip((lum - 170.0) / (235.0 - 170.0), 0.0, 1.0)
glyph_soft = neutral * bright * tile          # never outside the tile

# sanity: the thin right-flap sliver must survive the mask
core = glyph_soft > 0.5
ys, xs = np.where(core)
gx0, gx1, gy0, gy1 = xs.min(), xs.max(), ys.min(), ys.max()
print(f'glyph mask bbox at 1024: x {gx0}..{gx1}  y {gy0}..{gy1}  '
      f'(aspect {(gx1-gx0+1)/(gy1-gy0+1):.3f})')

# --- compose ----------------------------------------------------------------
tile_img = Image.fromarray((tile * 255).astype('uint8'))
glyph_img = Image.fromarray((glyph_soft * 255).astype('uint8'))

for d, s in OUT_SIZES.items():
    hi = s * SS
    t = tile_img.resize((hi, hi), Image.LANCZOS)
    gl = glyph_img.resize((hi, hi), Image.LANCZOS)
    t = np.array(t).astype(np.float64) / 255.0
    gl = np.array(gl).astype(np.float64) / 255.0
    alpha = np.clip(t * (1.0 - gl), 0.0, 1.0)
    out = np.zeros((hi, hi, 4), 'uint8')
    out[..., 0] = 255
    out[..., 1] = 255
    out[..., 2] = 255
    out[..., 3] = (alpha * 255).astype('uint8')
    final = Image.fromarray(out).resize((s, s), Image.LANCZOS)
    os.makedirs(f'android/app/src/main/res/{d}', exist_ok=True)
    final.save(f'android/app/src/main/res/{d}/ic_notification.png')
    print(f'wrote drawable-{d.split("-")[1]}/ic_notification.png ({s}px)')

# --- verification renders (what the user actually sees) ---------------------
from PIL import ImageDraw
BIG = 144
xxx = Image.open('android/app/src/main/res/drawable-xxxhdpi/ic_notification.png').convert('RGBA')
big = xxx.resize((BIG, BIG), Image.LANCZOS)

sb = Image.new('RGBA', (BIG, BIG), (28, 28, 30, 255))          # status bar dark
sb.alpha_composite(big)
badge = Image.new('RGBA', (BIG, BIG), (250, 250, 250, 255))    # One UI badge
ImageDraw.Draw(badge).ellipse((2, 2, BIG - 2, BIG - 2), fill=(24, 112, 232, 255))
badge.alpha_composite(big)

logo_ref = img.resize((BIG, BIG), Image.LANCZOS)               # original logo

os.makedirs('scripts/tmp', exist_ok=True)
strip = Image.new('RGB', (BIG * 3 + 20, BIG), (240, 240, 240))
strip.paste(sb.convert('RGB'), (0, 0))
strip.paste(badge.convert('RGB'), (BIG + 10, 0))
strip.paste(logo_ref.convert('RGB'), (BIG * 2 + 20, 0))
strip.save('scripts/tmp/notif_regen_preview.png')

# 24px true-size zoom (status bar dark)
tiny = xxx.resize((24, 24), Image.LANCZOS).resize((144, 144), Image.NEAREST)
z = Image.new('RGBA', (144, 144), (28, 28, 30, 255))
z.alpha_composite(tiny)
z.convert('RGB').save('scripts/tmp/notif_regen_24px_zoom.png')

print('previews: scripts/tmp/notif_regen_preview.png, notif_regen_24px_zoom.png')
