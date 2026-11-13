#!/usr/bin/env python3
"""Post-process the audit docx: strip empty pgNumType, patch footer PAGE fields
with explicit \\* ROMAN / \\* arabic switches (WPS compatibility). Read-write in place."""
import re, sys, zipfile, shutil, tempfile, os

path = sys.argv[1]
tmp = tempfile.mktemp(suffix=".docx")

zin = zipfile.ZipFile(path, "r")
items = {n: zin.read(n) for n in zin.namelist()}
zin.close()

doc = items["word/document.xml"].decode("utf-8")
doc = doc.replace("<w:pgNumType/>", "")

# Section order of appearance = cover, front matter, body.
# First footerReference-bearing sectPr -> Roman; second -> arabic.
rels = items["word/_rels/document.xml.rels"].decode("utf-8")
rel_map = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))

sect_blocks = re.findall(r"<w:sectPr[ >].*?</w:sectPr>", doc, re.S)
footer_fmt = {}
seen = 0
for blk in sect_blocks:
    m = re.search(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="(rId\d+)"', blk)
    if not m:
        continue
    target = rel_map.get(m.group(1))
    if not target:
        continue
    seen += 1
    footer_fmt["word/" + target] = "ROMAN" if seen == 1 else "arabic"

changed = []
for fname, fmt in footer_fmt.items():
    if fname not in items:
        continue
    xml = items[fname].decode("utf-8")
    new = re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )
    if new != xml:
        items[fname] = new.encode("utf-8")
        changed.append((fname, fmt))

items["word/document.xml"] = doc.encode("utf-8")

zout = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
for n, data in items.items():
    zout.writestr(n, data)
zout.close()
shutil.move(tmp, path)
print("patched footers:", changed, "| pgNumType stripped OK")
