#!/usr/bin/env python3
"""Builds the launcher icon (res/mipmap-*/ic_launcher.png) from a render of Kai's face.

    cd demo
    node tools/shoot.cjs "lab.html?scene=hero&id=kai&zoom=2.2&angle=-25" shots/icon-src.png --w 700 --h 700
    python3 android/make-icon.py shots/icon-src.png

Kai is cut out of the lab's sky and grass with a flood fill from the image border (his dark toon
outline stops it), then set on a warm sunburst gradient inside a rounded square with a thick dark
border. Needs only Pillow.
"""
import math
import os
import sys
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
S = 1024  # master size

DARK = (26, 12, 40)           # border, close to the game's #140a26
TOP, BOTTOM = (255, 214, 74), (244, 81, 30)
EDGE = (190, 24, 72)          # vignette toward the corners


def sky_like(p, tight=False):
    r, g, b = p
    if tight:
        return 105 <= r <= 165 and 18 <= g - r <= 42 and 6 <= b - g <= 30
    return 90 <= r <= 205 and g > r and b > r + 12 and b - g < 34


def grass_like(p):
    r, g, b = p
    return g > 105 and g > r + 15 and g > b + 25


def background_mask(im):
    """255 where the pixel belongs to the backdrop (sky or grass), by region growing."""
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    q = deque()

    def seed(x, y, tight=False):
        i = y * w + x
        p = px[x, y]
        if not bg[i] and (sky_like(p, tight) or (not tight and grass_like(p))):
            bg[i] = 1
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)
    # pockets of sky enclosed by hair spikes do not touch the border: seed them too
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            seed(x, y, tight=True)

    while q:
        x, y = q.popleft()
        p = px[x, y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if bg[i]:
                    continue
                n = px[nx, ny]
                if (sky_like(n) or grass_like(n)) and sum((a - b) ** 2 for a, b in zip(p, n)) < 30 ** 2:
                    bg[i] = 1
                    q.append((nx, ny))
    return Image.frombytes('L', (w, h), bytes(v * 255 for v in bg))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient():
    """Warm vertical gradient, a sunburst behind the head, darker corners."""
    g = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(g)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(TOP, BOTTOM, (y / (S - 1)) ** 1.2))
    cx, cy = S * 0.5, S * 0.42
    rays = Image.new('L', (S, S), 0)
    rd = ImageDraw.Draw(rays)
    n = 18
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = a0 + math.pi / n
        rd.polygon([(cx, cy), (cx + 2 * S * math.cos(a0), cy + 2 * S * math.sin(a0)),
                    (cx + 2 * S * math.cos(a1), cy + 2 * S * math.sin(a1))], fill=40)
    g = Image.composite(Image.new('RGB', (S, S), (255, 245, 200)), g, rays.filter(ImageFilter.GaussianBlur(2)))
    # radial_gradient: 0 at the centre, 255 at radius 128 of its 256 px square
    dist = Image.radial_gradient('L').resize((S, S), Image.BICUBIC)
    glow = dist.point(lambda v: int(150 * max(0.0, 1 - v / 200) ** 1.5))
    glow = ImageChops.offset(glow, 0, int(cy - S / 2))
    g = Image.composite(Image.new('RGB', (S, S), (255, 250, 215)), g, glow)
    vignette = dist.point(lambda v: int(min(200, max(0, v - 150) * 2.2)))
    return Image.composite(Image.new('RGB', (S, S), EDGE), g, vignette.filter(ImageFilter.GaussianBlur(20)))


def rounded(box, radius, width=0):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius, fill=255 if not width else None,
                                        outline=255 if width else None, width=width)
    return m


def main(src):
    face = Image.open(src).convert('RGB')
    alpha = ImageChops.invert(background_mask(face))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    kai = face.convert('RGBA')
    kai.putalpha(alpha)

    margin, border = int(S * 0.045), int(S * 0.058)
    radius = int(S * 0.22)
    outer = (margin, margin, S - 1 - margin, S - 1 - margin)

    icon = gradient().convert('RGBA')

    # Kai fills the window like a portrait: the render's own edges (where his hair and jacket are
    # cut off) sit under the border, the sky he replaces shows the sunburst
    window = margin + border
    k = (S - 2 * window + 26) / face.width
    kai = kai.resize((int(face.width * k), int(face.height * k)), Image.LANCZOS)
    ox = S - window - kai.width + 2
    oy = window - 20
    shadow = Image.new('RGBA', kai.size, (70, 10, 30, 0))
    shadow.putalpha(kai.getchannel('A').point(lambda v: v * 0.5).filter(ImageFilter.GaussianBlur(14)))
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.alpha_composite(shadow, (ox + int(S * 0.012), oy + int(S * 0.02)))
    layer.alpha_composite(kai, (ox, oy))
    icon.alpha_composite(layer)

    # clip to the rounded square, then the thick dark border and a thin inner highlight
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(icon, (0, 0), rounded(outer, radius))
    ring = rounded(outer, radius, width=border)
    out.paste(Image.new('RGBA', (S, S), DARK + (255,)), (0, 0), ring)
    inset = border - 2
    hi = rounded((outer[0] + inset, outer[1] + inset, outer[2] - inset, outer[3] - inset),
                 radius - inset, width=int(S * 0.012)).point(lambda v: v * 0.35)
    out.paste(Image.new('RGBA', (S, S), (255, 240, 200, 255)), (0, 0), hi)

    for dpi, px in SIZES.items():
        d = os.path.join(HERE, 'res', 'mipmap-' + dpi)
        os.makedirs(d, exist_ok=True)
        out.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
    preview = os.path.join(os.path.dirname(os.path.abspath(src)), 'icon-preview.png')
    sheet = Image.new('RGBA', (512 + 16 + 192 + 16 + 96 + 16 + 48 + 16, 512 + 32), (40, 40, 48, 255))
    x = 16
    for px in (512, 192, 96, 48):
        sheet.alpha_composite(out.resize((px, px), Image.LANCZOS), (x, 16))
        x += px + 16
    sheet.save(preview)
    print('icons written; preview', preview)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'shots', 'icon-src.png'))
