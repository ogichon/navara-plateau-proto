# -*- coding: utf-8 -*-
import json, math
from PIL import Image, ImageDraw

LON0, LAT0, LON1, LAT1 = 139.53, 35.53, 139.97, 35.87
W, H = 2520, 2400
def px(lon, lat):
    return ((lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H)

assigned = json.load(open("./assigned.json"))
water = json.load(open("./water.json"))
FRAMES = [(1900, None), (1924, 1900), (1925, 1924), (1960, 1925), (2000, 1960), (2025, 2000)]

WATER_C = (34, 52, 68)
BASE_UNDER = (92, 56, 14); BASE_CORE = (206, 130, 40)
NEW_UNDER = (140, 96, 26); NEW_CORE = (255, 238, 196)

for year, prev in FRAMES:
    img = Image.new("RGB", (W, H), (0, 0, 0))
    dr = ImageDraw.Draw(img, "RGBA")
    for line in water:
        pts = [px(lon, lat) for lon, lat in line]
        if len(pts) >= 2: dr.line(pts, fill=WATER_C, width=2)
    base = [a for a in assigned if a["year"] <= (prev if prev is not None else year)]
    new = [a for a in assigned if (prev is not None and prev < a["year"] <= year)] if prev is not None else \
          [a for a in assigned if a["year"] <= year]
    if prev is None: base = []
    for a in base:
        pts = [px(lon, lat) for lon, lat in a["geom"]]
        if len(pts) >= 2: dr.line(pts, fill=BASE_UNDER, width=5)
    for a in base:
        pts = [px(lon, lat) for lon, lat in a["geom"]]
        if len(pts) >= 2: dr.line(pts, fill=BASE_CORE, width=2)
    for a in new:
        pts = [px(lon, lat) for lon, lat in a["geom"]]
        if len(pts) >= 2: dr.line(pts, fill=NEW_UNDER, width=6)
    for a in new:
        pts = [px(lon, lat) for lon, lat in a["geom"]]
        if len(pts) >= 2: dr.line(pts, fill=NEW_CORE, width=3)
    out = f"./frame-{year}.png"
    img.save(out)
    print("saved", out, "base ways:", len(base), "new ways:", len(new))

# center crops (ring area) for 1924 / 1925
for year in (1924, 1925):
    img = Image.open(f"./frame-{year}.png")
    x0, y0 = px(139.615, 35.775); x1, y1 = px(139.845, 35.575)
    crop = img.crop((int(x0), int(y0), int(x1), int(y1)))
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST)
    crop.save(f"./frame-{year}-ring.png")
    print("saved ring crop", year, crop.size)
