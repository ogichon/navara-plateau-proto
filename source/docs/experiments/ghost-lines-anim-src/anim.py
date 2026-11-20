# -*- coding: utf-8 -*-
"""GHOST LINES animation prototype v1.

Accumulates Tokyo railway lines by opening year (1872-2025), staged so the
1925 Yamanote ring closure lands as the climax:
  A 1872-1914 full frame, 8 frames/year
  B 1915-1924 slow (27 f/yr) + smooth zoom into the ring
  C 1925 closure segment (Yamanote, year==1925) flashes, ~2 s hold
  D 1926-1960 6 f/yr with zoom back out; 1961-2025 3 f/yr
  E final hold on 2025
Look follows ghost-lines-time render.py: black ground, slate water always on,
rail amber with age-decay brightness (new lines near-white, settling to amber).
Master canvas 2520x2400 (same projection as the still frames), video 1680x1600 @30fps.
Inputs: work/assigned.json + work/water.json (from match_render.py).
Outputs: ../ghost-lines-anim-v1.mp4, keyframe PNGs, frames/*.jpg sequence.
"""
import json, math, os, subprocess, sys, time
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
STATES = os.path.join(WORK, "states")
EXP = os.path.dirname(HERE)  # docs/experiments
FRAMES_DIR = os.path.join(HERE, "frames")
os.makedirs(STATES, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

LON0, LAT0, LON1, LAT1 = 139.53, 35.53, 139.97, 35.87
W, H = 2520, 2400
OUT_W, OUT_H = 1680, 1600
FPS = 30

WATER_C = (34, 52, 68)
BASE_UNDER = np.array((92, 56, 14), float); BASE_CORE = np.array((206, 130, 40), float)
NEW_UNDER = np.array((140, 96, 26), float); NEW_CORE = np.array((255, 238, 196), float)
DECAY = 22.0  # years for a new line to settle toward base brightness

def px(lon, lat):
    return ((lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H)

def lerp_c(base, new, f):
    return tuple(int(round(b + (n - b) * f)) for b, n in zip(base, new))

# ---------------- load data ----------------
assigned = json.load(open(os.path.join(WORK, "assigned.json")))
water = json.load(open(os.path.join(WORK, "water.json")))
water_px = [[px(lon, lat) for lon, lat in line] for line in water]
by_year = {}
for a in assigned:
    pts = [px(lon, lat) for lon, lat in a["geom"]]
    if len(pts) >= 2:
        by_year.setdefault(a["year"], []).append((a["lid"], pts))
years_sorted = sorted(by_year)
print("opening years:", years_sorted[0], "..", years_sorted[-1], "| distinct:", len(years_sorted))

# ring bbox sanity + flash set
ring_pts = [p for a in assigned if a["lid"] == "yamanote" for p in a["geom"]]
if ring_pts:
    xs = [p[0] for p in ring_pts]; ys = [p[1] for p in ring_pts]
    print(f"yamanote bbox lon {min(xs):.3f}-{max(xs):.3f} lat {min(ys):.3f}-{max(ys):.3f}")
flash = [(a["lid"], [px(lon, lat) for lon, lat in a["geom"]])
         for a in assigned if a["lid"] == "yamanote" and a["year"] == 1925]
flen = 0.0
for a in assigned:
    if a["lid"] == "yamanote" and a["year"] == 1925:
        g = a["geom"]
        for p, q in zip(g, g[1:]):
            flen += 6371000 * math.hypot(math.radians(q[1] - p[1]),
                                         math.radians(q[0] - p[0]) * math.cos(math.radians(35.7)))
print(f"flash ways (yamanote 1925): {len(flash)}  total {flen/1000:.2f} km")
if flash:
    mids = [a["geom"][len(a["geom"]) // 2] for a in assigned
            if a["lid"] == "yamanote" and a["year"] == 1925]
    print("flash midpoints lon %.3f-%.3f lat %.3f-%.3f" %
          (min(m[0] for m in mids), max(m[0] for m in mids),
           min(m[1] for m in mids), max(m[1] for m in mids)))

# ---------------- year states ----------------
def render_state(year):
    path = os.path.join(STATES, f"state-{year}.png")
    if os.path.exists(path):
        return path
    img = Image.new("RGB", (W, H), (0, 0, 0))
    dr = ImageDraw.Draw(img)
    for pts in water_px:
        if len(pts) >= 2:
            dr.line(pts, fill=WATER_C, width=2)
    for y in years_sorted:
        if y > year:
            break
        f = math.exp(-(year - y) / DECAY)
        uc = lerp_c(BASE_UNDER, NEW_UNDER, f); cc = lerp_c(BASE_CORE, NEW_CORE, f)
        uw = 5 if f < 0.5 else 6; cw = 2 if f < 0.5 else 3
        for _lid, pts in by_year[y]:
            dr.line(pts, fill=uc, width=uw)
        for _lid, pts in by_year[y]:
            dr.line(pts, fill=cc, width=cw)
    img.save(path)
    return path

# ---------------- flash layer ----------------
def build_flash():
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    for _lid, pts in flash:
        dg.line(pts, fill=(255, 170, 60, 255), width=17)
    glow = glow.filter(ImageFilter.GaussianBlur(11))
    sharp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sharp)
    for _lid, pts in flash:
        ds.line(pts, fill=(255, 244, 210, 255), width=7)
    for _lid, pts in flash:
        ds.line(pts, fill=(255, 255, 255, 255), width=3)
    out = Image.alpha_composite(glow, sharp)
    out.save(os.path.join(WORK, "flash.png"))
    return out

# ---------------- timeline ----------------
FULL = (0.0, 0.0, float(W), float(H))
RCX, RCY = 1193.0, 1320.0  # ring bbox centre in master px
RW, RH = 1200.0, 1200.0 / (OUT_W / OUT_H)
RING = (RCX - RW / 2, RCY - RH / 2, RCX + RW / 2, RCY + RH / 2)

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def mix_rect(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

timeline = []  # (year, rect, flash_alpha)
for yr in range(1872, 1915):
    timeline += [(yr, FULL, 0.0)] * 8
NB = 27 * 10
for i in range(NB):
    yr = 1915 + i // 27
    rect = mix_rect(FULL, RING, smooth((i + 1) / NB))
    timeline.append((yr, rect, 0.0))
for i in range(60):
    a = (i + 1) / 12 if i < 12 else 1.0
    timeline.append((1925, RING, a))
ND1 = 6 * 35
for i in range(ND1):
    yr = 1926 + i // 6
    rect = mix_rect(RING, FULL, smooth((i + 1) / 120)) if i < 120 else FULL
    a = max(0.0, 1.0 - (i + 1) / 15) if i < 15 else 0.0
    timeline.append((yr, rect, a))
for yr in range(1961, 2026):
    timeline += [(yr, FULL, 0.0)] * 3
timeline += [(2025, FULL, 0.0)] * 90
print("total frames:", len(timeline), " duration: %.1fs" % (len(timeline) / FPS))

KEYFRAMES = {613: "1924", 644: "1925", 883: "1960", len(timeline) - 1: "2025"}

# ---------------- render ----------------
def main():
    t0 = time.time()
    need_years = sorted(set(y for y, _r, _a in timeline))
    for i, y in enumerate(need_years):
        render_state(y)
        if (i + 1) % 20 == 0:
            print(f"states {i+1}/{len(need_years)}  elapsed {time.time()-t0:.0f}s", flush=True)
    print("states done %.0fs" % (time.time() - t0), flush=True)
    flash_img = build_flash()
    flash_arr = np.asarray(flash_img).astype(np.float32)

    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 42)
    out_mp4 = os.path.join(EXP, "ghost-lines-anim-v1.mp4")
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{OUT_W}x{OUT_H}", "-r", str(FPS), "-i", "-",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
        "-preset", "medium", "-movflags", "+faststart", out_mp4],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    cache = {}
    def get_state(y):
        if y not in cache:
            cache.clear()
            cache[y] = Image.open(os.path.join(STATES, f"state-{y}.png")).convert("RGB")
        return cache[y]

    for idx, (yr, rect, fa) in enumerate(timeline):
        img = get_state(yr).copy()
        if fa > 0:
            dim = 1.0 - 0.18 * fa
            arr = np.asarray(img).astype(np.float32)
            fl = flash_arr.copy()
            fl[..., 3] *= fa
            alpha = (fl[..., 3:4] / 255.0)
            arr = arr * dim * (1 - alpha) + fl[..., :3] * alpha
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        box = tuple(int(round(v)) for v in rect)
        frame = img.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)
        dr = ImageDraw.Draw(frame)
        dr.text((38, OUT_H - 78), str(yr), font=font, fill=(216, 216, 216))
        frame.save(os.path.join(FRAMES_DIR, f"frame-{idx:04d}.jpg"), quality=92)
        if idx in KEYFRAMES:
            frame.save(os.path.join(EXP, f"ghost-lines-anim-v1-key-{KEYFRAMES[idx]}.png"))
            print("keyframe", KEYFRAMES[idx], "at frame", idx, flush=True)
        ff.stdin.write(frame.tobytes())
        if (idx + 1) % 200 == 0:
            print(f"frames {idx+1}/{len(timeline)}  elapsed {time.time()-t0:.0f}s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("mp4 written:", out_mp4, " total %.0fs" % (time.time() - t0))

if __name__ == "__main__":
    main()
