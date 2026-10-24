#!/usr/bin/env python3
"""Build drawable-v31/ezymail_system_splash_icon.png:
the approved EzyMail logo centered on a LARGER TRANSPARENT canvas.
Android 12+ renders this drawable in the fixed system splash icon slot, so the
transparent padding makes the visible logo smaller (owner requirement:
'reduce the perceived logo size'). Background color is set separately to
white via values-v31/styles.xml -> android:windowSplashScreenBackground."""
from PIL import Image, ImageDraw
import numpy as np

SRC = "/home/z/my-project/public/logo.png"
DST = "/home/z/my-project/android/app/src/main/res/drawable-v31/ezymail_system_splash_icon.png"
CANVAS = 1024          # drawable canvas
LOGO_RATIO = 0.46      # visible logo = 46% of the icon slot -> clearly smaller

logo = Image.open(SRC).convert("RGBA")
print("source logo:", logo.size, logo.mode)
a = np.asarray(logo)
alpha = a[..., 3]
print("alpha min:", int(alpha.min()), " transparent px:", int((alpha < 250).sum()))

# If the logo is an opaque square, give it the same rounded-corner mask the
# approved icon/splash design uses (radius 22.5% — matches make_splash.py).
if alpha.min() >= 250:
    print("logo is opaque -> applying rounded-corner alpha mask")
    side = logo.size[0]
    mask = Image.new("L", (side, side), 0)
    d = ImageDraw.Draw(mask)
    r = int(side * 0.225)
    d.rounded_rectangle([0, 0, side - 1, side - 1], radius=r, fill=255)
    logo.putalpha(mask)

target = int(CANVAS * LOGO_RATIO)
scaled = logo.resize((target, target), Image.LANCZOS)

canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
off = (CANVAS - target) // 2
canvas.paste(scaled, (off, off), scaled)
canvas.save(DST, optimize=True)

out = Image.open(DST)
print("written:", DST, out.size, out.mode)
oa = np.asarray(out)[..., 3]
ys, xs = np.where(oa > 0)
print(f"content bbox: x {xs.min()}-{xs.max()}  y {ys.min()}-{ys.max()}  "
      f"({(xs.max()-xs.min()+1)/CANVAS:.0%} of canvas width)")
