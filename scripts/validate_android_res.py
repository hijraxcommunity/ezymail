#!/usr/bin/env python3
"""Validate all Android res XML files + AndroidManifest.xml:
1. Exactly one XML declaration, at the very beginning.
2. Well-formed XML (ElementTree parse).
3. Every @drawable/@mipmap/@style resource reference resolves to a real file
   or a declared style (catches broken refs before a Gradle build does)."""
import os, re, glob
import xml.etree.ElementTree as ET

RES = "/home/z/my-project/android/app/src/main/res"
MANIFEST = "/home/z/my-project/android/app/src/main/AndroidManifest.xml"
errors = []

# ── inventory of available resources ─────────────────────────────────────
drawables, mipmaps, styles = set(), set(), set()
for path in glob.glob(os.path.join(RES, "**", "*"), recursive=True):
    if not os.path.isfile(path):
        continue
    rel = os.path.relpath(path, RES)
    folder, name = rel.split(os.sep)[0], os.path.splitext(os.path.basename(path))[0]
    if folder.startswith("drawable"):
        drawables.add(name)
    elif folder.startswith("mipmap"):
        mipmaps.add(name)
    elif folder.startswith("values") and path.endswith(".xml"):
        try:
            tree = ET.parse(path)
            for el in tree.getroot().iter("style"):
                if el.get("name"):
                    styles.add(el.get("name"))
        except ET.ParseError as e:
            errors.append(f"{rel}: PARSE ERROR {e}")

def ref_target(ref):
    if ref.startswith("@drawable/"): return ("drawable", ref.split("/", 1)[1])
    if ref.startswith("@mipmap/"):   return ("mipmap", ref.split("/", 1)[1])
    if ref.startswith("@style/"):    return ("style", ref.split("/", 1)[1])
    return None

def check_file(path):
    rel = os.path.relpath(path, "/home/z/my-project/android")
    raw = open(path, "rb").read().decode("utf-8", "replace")
    decls = raw.count("<?xml")
    if decls != 1 or not raw.lstrip().startswith("<?xml"):
        errors.append(f"{rel}: {decls} XML declaration(s) (must be exactly 1, first line)")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        errors.append(f"{rel}: PARSE ERROR {e}")
        return
    text = re.findall(r'"(@(?:drawable|mipmap|style)/[A-Za-z0-9_.]+)"', raw)
    for ref in text:
        kind, name = ref_target(ref)
        pool = {"drawable": drawables, "mipmap": mipmaps, "style": styles}[kind]
        if name not in pool:
            errors.append(f"{rel}: UNRESOLVED {ref}")

xmls = [MANIFEST] + glob.glob(os.path.join(RES, "**", "*.xml"), recursive=True)
for p in sorted(xmls):
    check_file(p)

print(f"checked {len(xmls)} XML files | drawables: {len(drawables)} | mipmaps: {len(mipmaps)} | styles: {len(styles)}")
key = ["splash", "ezymail_system_splash_icon", "ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_background"]
for k in key:
    print(f"  {k:32s} drawable={k in drawables} mipmap={k in mipmaps}")
if errors:
    print("\nPROBLEMS:")
    [print(" -", e) for e in errors]
    raise SystemExit(1)
print("\nALL XML + RESOURCE REFERENCES VALID")
