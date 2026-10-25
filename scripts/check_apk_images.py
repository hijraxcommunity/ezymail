#!/usr/bin/env python3
"""Check dimensions/validity of every image inside ezymail-latest.apk.

An insanely large bitmap decoded at app start (splash/launcher icon) would
throw OutOfMemoryError / 'Canvas: trying to draw too large bitmap' and close
the app instantly on any device. This script rules that in or out.
"""
import zipfile, io, sys
from PIL import Image

APK = "/home/z/my-project/download/ezymail-latest.apk"

zf = zipfile.ZipFile(APK)
bad = []
checked = 0
for info in zf.infolist():
    name = info.filename
    if not name.startswith(("res/", "assets/")):
        continue
    if not name.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
        continue
    data = zf.read(name)
    checked += 1
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        # a splash/launcher bitmap bigger than 2048px on a side would be a red flag
        if w > 2048 or h > 2048:
            bad.append((name, w, h, len(data)))
    except Exception as e:
        bad.append((name, "UNREADABLE", str(e), len(data)))

print(f"checked {checked} images")
if bad:
    print("SUSPICIOUS:")
    for b in bad:
        print("  ", b)
else:
    print("all images sane (<= 2048px, decodable)")
