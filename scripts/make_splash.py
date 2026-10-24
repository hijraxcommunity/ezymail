#!/usr/bin/env python3
"""
Build assets/splash.png (2732x2732) that replicates the EzyMail web splash
(the screen the owner wants to KEEP), measured directly from their screenshot.

Measured source: /home/z/my-project/upload/1000403181.png
Logo source:     /home/z/my-project/public/logo.png
Output:          /home/z/my-project/download/splash.png
"""
import os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

SHOT = '/home/z/my-project/upload/1000403181.png'
LOGO = '/home/z/my-project/public/logo.png'
OUT = '/home/z/my-project/download/splash.png'
PREVIEW = '/home/z/my-project/scripts/preview_portrait.png'
CANVAS = 2732

# ---------- fonts ----------
def load_font(bold, size):
    candidates = [
        '/usr/share/fonts/truetype/liberation/LiberationSans-%s.ttf' % ('Bold' if bold else 'Regular'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''),
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    raise SystemExit('no suitable font found')

def fit_size(get_width, target_w, lo=8, hi=900):
    """binary search a font size whose rendered width == target_w"""
    for _ in range(48):
        mid = int(round((lo + hi) / 2))
        if get_width(mid) < target_w:
            lo = mid
        else:
            hi = mid
    return max(8, int(round((lo + hi) / 2)))

# ---------- 1. measure the screenshot ----------
shot = Image.open(SHOT).convert('RGB')
W, H = shot.size
a = np.asarray(shot).astype(int)
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
print('screenshot size: %dx%d' % (W, H))

# on a phone with this aspect, the square splash is cover-cropped horizontally:
# full canvas height maps to full screen height, visible canvas width = CANVAS*W/H
vis_w = CANVAS * W / H
x_off = (CANVAS - vis_w) / 2

def to_x(px):        # screen x px -> canvas x
    return x_off + (px / W) * vis_w

def span(len_px):    # screen px length -> canvas px length
    return (len_px / W) * vis_w

# --- logo: saturated blue block ---
blue = (B - R > 50) & (B > 140)
ys, xs = np.where(blue)
ly0, ly1, lx0, lx1 = ys.min(), ys.max(), xs.min(), xs.max()
logo_cx_s, logo_cy_s = (lx0 + lx1) / 2, (ly0 + ly1) / 2
logo_w_s = lx1 - lx0 + 1
print('logo bbox screen: x %d..%d  y %d..%d' % (lx0, lx1, ly0, ly1))

# --- "EzyMail": dark text below logo ---
dark = (R < 90) & (G < 90) & (B < 90)
dark[:ly1 + 8, :] = False
dark[int(H * 0.90):, :] = False
ys, xs = np.where(dark)
ey0, ey1, ex0, ex1 = ys.min(), ys.max(), xs.min(), xs.max()
print('EzyMail bbox screen: x %d..%d  y %d..%d' % (ex0, ex1, ey0, ey1))

# --- gray text: tagline cluster + bottom footer cluster ---
gray = (np.abs(R - G) < 14) & (np.abs(G - B) < 14) & (R > 80) & (R < 215)
g = gray.copy()
g[:ey1 + 6, :] = False
g[int(H * 0.92):, :] = False
rows = np.where(g.any(axis=1))[0]
groups, start, prev = [], rows[0], rows[0]
for r in rows[1:]:
    if r - prev > 15:
        groups.append((start, prev))
        start = r
    prev = r
groups.append((start, prev))
tag, foot = groups[0], groups[-1]
print('gray row clusters:', groups)

def cols_of(y0, y1):
    cc = np.where(g[y0:y1 + 1, :].any(axis=0))[0]
    return cc.min(), cc.max()

tx0, tx1 = cols_of(tag[0], tag[1])
fx0, fx1 = cols_of(foot[0], foot[1])
print('tagline bbox: x %d..%d y %d..%d' % (tx0, tx1, tag[0], tag[1]))
print('footer  bbox: x %d..%d y %d..%d' % (fx0, fx1, foot[0], foot[1]))

# ---------- 2. paint the canvas ----------
img = Image.new('RGB', (CANVAS, CANVAS), '#FFFFFF')
draw = ImageDraw.Draw(img)

def paste_logo():
    size = int(round(span(logo_w_s)))
    lg = Image.open(LOGO).convert('RGBA').resize((size, size), Image.LANCZOS)
    alpha = lg.getchannel('A')
    if alpha.getextrema()[0] >= 250:  # no real transparency -> cut rounded corners
        m = Image.new('L', (size, size), 0)
        ImageDraw.Draw(m).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * 0.225), fill=255)
        lg.putalpha(m)
    cx, cy = int(round(to_x(logo_cx_s))), int(round(to_y(logo_cy_s)))
    img.paste(lg, (cx - size // 2, cy - size // 2), lg)
    print('logo pasted: size=%d center=(%d,%d)' % (size, cx, cy))

def draw_text(text, bold, color, target_w, cy):
    size = fit_size(lambda s: load_font(bold, s).getlength(text), span(target_w))
    f = load_font(bold, size)
    draw.text((CANVAS / 2, cy), text, font=f, fill=color, anchor='mm')
    print('text %-16r size=%d target_w=%d cy=%d' % (text, size, int(span(target_w)), cy))

def draw_footer(part1, part2, cy, target_w):
    size = fit_size(lambda s: load_font(False, s).getlength(part1) +
                                load_font(True, s).getlength(part2), span(target_w))
    f1, f2 = load_font(False, size), load_font(True, size)
    w1 = f1.getlength(part1)
    total = w1 + f2.getlength(part2)
    x0 = CANVAS / 2 - total / 2
    draw.text((x0, cy), part1, font=f1, fill='#9CA3AF', anchor='lm')
    draw.text((x0 + w1, cy), part2, font=f2, fill='#6B7280', anchor='lm')
    print('footer size=%d total_w=%d cy=%d' % (size, int(total), cy))

def to_y(py):
    return (py / H) * CANVAS

paste_logo()
draw_text('EzyMail', True, '#1F1F1F', ex1 - ex0 + 1, to_y((ey0 + ey1) / 2))
draw_text('Email made Ezy', False, '#9CA3AF', tx1 - tx0 + 1, to_y((tag[0] + tag[1]) / 2))
draw_footer('From ', 'HijraX', to_y((foot[0] + foot[1]) / 2), fx1 - fx0 + 1)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, 'PNG')
print('saved', OUT)

# ---------- 3. portrait preview (what the phone will show) ----------
ph, pw = H, int(round(H * W / H))  # same aspect as screenshot
ph = CANVAS
pw = int(round(vis_w))
left = int(round(x_off))
preview = img.crop((left, 0, left + pw, CANVAS)).resize((pw // 2, ph // 2), Image.LANCZOS)
preview.save(PREVIEW)
print('saved', PREVIEW)
