#!/usr/bin/env python3
"""READ-ONLY verification: does https://ezymail.vercel.app/splash.png contain
the exact approved branded design (logo + EzyMail + Email made Ezy + From HijraX)?
Compares live bytes with the local approved replica and checks design structure.
Nothing is modified anywhere except this scratch output file."""
import urllib.request, hashlib, os, io

URL = "https://ezymail.vercel.app/splash.png"
TMP = "/home/z/my-project/scripts/tmp_verify"
CANDIDATES = [
    "/home/z/my-project/download/splash.png",
    "/home/z/my-project/download/backup/splash-with-logo.png",
]

os.makedirs(TMP, exist_ok=True)
live_path = os.path.join(TMP, "splash_live.png")
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (design-verify)"})
with urllib.request.urlopen(req, timeout=30) as r:
    live_bytes = r.read()
open(live_path, "wb").write(live_bytes)

def sha(b):
    return hashlib.sha256(b).hexdigest()

print("=== LIVE FILE ===")
print("url    :", URL)
print("bytes  :", len(live_bytes))
print("sha256 :", sha(live_bytes))

from PIL import Image
import numpy as np

img = Image.open(io.BytesIO(live_bytes)).convert("RGB")
print("size   :", img.size)

a = np.asarray(img)
white = (a > 245).all(axis=2)
dark = (a < 100).all(axis=2)
print("white px %:", round(white.mean() * 100, 2))
print("dark px  :", int(dark.sum()))

ys, xs = np.where(dark)
if len(xs):
    print("dark bbox: x", int(xs.min()), "-", int(xs.max()), " y", int(ys.min()), "-", int(ys.max()))
    rows = dark.sum(axis=1)
    bands = []
    inb = False
    for y, v in enumerate(rows):
        if v > 0 and not inb:
            start = y; inb = True
        elif v == 0 and inb:
            if y - start >= 2:
                bands.append((start, y))
            inb = False
    if inb:
        bands.append((start, len(rows)))
    print("dark bands (top -> bottom):")
    for (y0, y1) in bands:
        seg = dark[y0:y1]
        sx = np.where(seg.any(axis=0))[0]
        print(f"   y {y0:4d}-{y1:4d}  h={y1-y0:3d}  x {int(sx.min())}-{int(sx.max())}")

print()
print("=== COMPARE WITH LOCAL APPROVED REPLICA ===")
ok = False
for p in CANDIDATES:
    if os.path.exists(p):
        b = open(p, "rb").read()
        match = (b == live_bytes)
        print(f"{p}: bytes={len(b)} sha={sha(b)[:16]}... identical={match}")
        if match:
            ok = True
    else:
        print(f"{p}: (not found)")

print()
print("RESULT:", "VERIFIED - live file is byte-identical to the approved design"
      if ok else "MISMATCH - needs checking before any use")
