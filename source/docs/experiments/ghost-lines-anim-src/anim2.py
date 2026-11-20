# -*- coding: utf-8 -*-
"""GHOST LINES animation prototype v2.

Same pipeline as v1 (anim.py), staging changes only:
  1. Ring pulse: right after the 1925 closure flash, a light pulse laps the
     whole Yamanote ring once (~2 s). Ring phase u in [0,1) is assigned per
     vertex by projecting onto the 29-station ring polygon (station order
     from match_render.py), origin at Kanda, travelling in station order
     (Kanda -> Tokyo -> Yurakucho -> ... -> Akihabara -> Kanda). The wave is
     a comet (exp decay behind the front) plus a lit trail over the part
     already passed; after the lap the ring keeps a faint residual glow for
     the rest of the video.
  2. Stronger suppression in the climax window: in states for 1915-1927,
     non-ring lines opened in 1915-1927 are drawn at x0.35 brightness, so
     the flash and the pulse are the only bright events in that window.
     All other states are byte-identical copies of the v1 states.
Timeline (1199 frames / 40.0 s @30fps):
  A 1872-1914 8 f/yr FULL | B 1915-1924 27 f/yr zoom-in
  C 1925 flash 30 f (12 ramp + 18 hold)
  P pulse 60 f at 1925 state, camera on ring; flash decays over first 12 f
  D 1926-1960 6 f/yr zoom-out (first 120 f); residual decays to steady level
  E 1961-2025 3 f/yr + 90 f final hold
Outputs: ../ghost-lines-anim-v2.mp4, keyframes
  ghost-lines-anim-v2-key-{1924,1925,pulse,2025}.png, frames2/*.jpg.
"""
import json, math, os, shutil, subprocess, time
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
STATES1 = os.path.join(WORK, "states")       # v1 states (read-only reuse)
STATES = os.path.join(WORK, "states2")       # v2 states
EXP = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(HERE, "frames2")
os.makedirs(STATES, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)

LON0, LAT0, LON1, LAT1 = 139.53, 35.53, 139.97, 35.87
W, H = 2520, 2400
OUT_W, OUT_H = 1680, 1600
FPS = 30

WATER_C = (34, 52, 68)
BASE_UNDER = np.array((92, 56, 14), float); BASE_CORE = np.array((206, 130, 40), float)
NEW_UNDER = np.array((140, 96, 26), float); NEW_CORE = np.array((255, 238, 196), float)
DECAY = 22.0
SUPPRESS = 0.35          # brightness factor for non-ring 1915-1927 openings in window states
WIN_LO, WIN_HI = 1915, 1927

def px(lon, lat):
    return ((lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H)

def lerp_c(base, new, f):
    return tuple(int(round(b + (n - b) * f)) for b, n in zip(base, new))

def scale_c(c, f):
    return tuple(max(0, min(255, int(round(v * f)))) for v in c)

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

flash = [(a["lid"], [px(lon, lat) for lon, lat in a["geom"]])
         for a in assigned if a["lid"] == "yamanote" and a["year"] == 1925]
print(f"flash ways (yamanote 1925): {len(flash)}")

# ---------------- ring phase (u) from station polygon ----------------
RING_ST = ["東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川", "大崎", "五反田",
           "目黒", "恵比寿", "渋谷", "原宿", "代々木", "新宿", "新大久保", "高田馬場", "目白", "池袋",
           "大塚", "巣鴨", "駒込", "田端", "西日暮里", "日暮里", "鶯谷", "上野", "秋葉原", "神田"]
obj = json.load(open(os.path.join(WORK, "osm_raw.json")))
_st = defaultdict(list)
for e in obj["elements"]:
    if e["type"] == "node" and e.get("tags", {}).get("railway") == "station":
        nm = e["tags"].get("name")
        if nm:
            _st[nm].append((e["lon"], e["lat"]))
ST = {k: (sum(x for x, _ in v) / len(v), sum(y for _, y in v) / len(v)) for k, v in _st.items()}
missing = [s for s in RING_ST if s not in ST]
print("ring stations missing:", missing)
POLY = [px(*ST[s]) for s in RING_ST]           # 29 pts, closed loop back to POLY[0]
SEG_LEN = []
for k in range(29):
    a, b = POLY[k], POLY[(k + 1) % 29]
    SEG_LEN.append(math.hypot(b[0] - a[0], b[1] - a[1]))
CUM = [0.0]
for L in SEG_LEN:
    CUM.append(CUM[-1] + L)
TOTAL = CUM[-1]
U_KANDA = CUM[28] / TOTAL                     # Kanda = station index 28
print(f"ring polygon length: {TOTAL:.0f} px (~{TOTAL*15.7/1000:.1f} km), u(Kanda)={U_KANDA:.3f}")

def vertex_u(p):
    """Project point (px) onto ring polygon -> (u in [0,1) with origin at Kanda, dist px)."""
    best_d, best_u = 1e18, 0.0
    for k in range(29):
        ax, ay = POLY[k]; bx, by = POLY[(k + 1) % 29]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
        qx, qy = ax + t * dx, ay + t * dy
        d = math.hypot(p[0] - qx, p[1] - qy)
        if d < best_d:
            best_d, best_u = d, (CUM[k] + t * SEG_LEN[k]) / TOTAL
    return (best_u - U_KANDA) % 1.0, best_d

# ring segments with phase: (x1, y1, x2, y2, u_mid)
ring_segs = []
dists = []
for a in assigned:
    if a["lid"] != "yamanote":
        continue
    pts = [px(lon, lat) for lon, lat in a["geom"]]
    us = []
    for p in pts:
        u, d = vertex_u(p)
        us.append(u); dists.append(d)
    for i in range(len(pts) - 1):
        u1, u2 = us[i], us[i + 1]
        if u2 < u1 - 0.5:
            u2 += 1.0
        elif u1 < u2 - 0.5:
            u1 += 1.0
        ring_segs.append((pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ((u1 + u2) / 2) % 1.0))
dists = np.array(dists)
print(f"ring ways segs: {len(ring_segs)}  vertex dist to polygon: median {np.median(dists):.1f}px "
      f"p90 {np.percentile(dists, 90):.1f}px  within 20px: {(dists <= 20).mean()*100:.1f}%")

# ---------------- year states (v2: suppression in window) ----------------
def render_state(year):
    path = os.path.join(STATES, f"state-{year}.png")
    if os.path.exists(path):
        return path
    src = os.path.join(STATES1, f"state-{year}.png")
    if not (WIN_LO <= year <= WIN_HI) and os.path.exists(src):
        shutil.copyfile(src, path)   # outside window: identical to v1
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
        sup = WIN_LO <= y <= WIN_HI  # this opening year is in the climax window
        for want_sup in (False, True):
            for lid, pts in by_year[y]:
                if sup and want_sup != (lid != "yamanote"):
                    continue
                if not sup and want_sup:
                    continue
                s = SUPPRESS if (sup and want_sup) else 1.0
                dr.line(pts, fill=scale_c(uc, s), width=uw)
                dr.line(pts, fill=scale_c(cc, s), width=cw)
    img.save(path)
    return path

# ---------------- flash layer (same as v1) ----------------
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
    return Image.alpha_composite(glow, sharp)

# ---------------- residual ring layer (unit strength = trail level) ----------------
def build_residual():
    sharp = Image.new("RGB", (W, H), (0, 0, 0))
    ds = ImageDraw.Draw(sharp)
    for (x1, y1, x2, y2, _u) in ring_segs:
        ds.line([(x1, y1), (x2, y2)], fill=(46, 30, 10), width=13)
    for (x1, y1, x2, y2, _u) in ring_segs:
        ds.line([(x1, y1), (x2, y2)], fill=(104, 90, 62), width=4)
    blur = sharp.filter(ImageFilter.GaussianBlur(6))
    arr = np.asarray(sharp).astype(np.float32) + 0.8 * np.asarray(blur).astype(np.float32)
    return arr

# ---------------- pulse layer for one phase ----------------
def pulse_layer(phi):
    """Additive RGB float array: comet wave + lit trail behind the front."""
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    dr = ImageDraw.Draw(layer)
    groups = defaultdict(list)
    for (x1, y1, x2, y2, u) in ring_segs:
        d = (phi - u) % 1.0
        b = math.exp(-d / 0.045) if d < 0.35 else 0.0
        if u < phi:
            b = max(b, 0.38)          # trail: already-passed part stays lit
        if b < 0.03:
            continue
        groups[round(b * 12)] .append((x1, y1, x2, y2))
    for lv, segs in groups.items():
        b = lv / 12.0
        glow_c = tuple(int(v * b) for v in (120, 66, 18))
        core_c = tuple(int(v * b) for v in (255, 226, 172))
        for s in segs:
            dr.line([(s[0], s[1]), (s[2], s[3])], fill=glow_c, width=13)
        for s in segs:
            dr.line([(s[0], s[1]), (s[2], s[3])], fill=core_c, width=4)
    arr = np.asarray(layer).astype(np.float32)
    blur = np.asarray(layer.filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    return arr + 0.8 * blur

# ---------------- timeline ----------------
FULL = (0.0, 0.0, float(W), float(H))
RCX, RCY = 1193.0, 1320.0
RW, RH = 1200.0, 1200.0 / (OUT_W / OUT_H)
RING = (RCX - RW / 2, RCY - RH / 2, RCX + RW / 2, RCY + RH / 2)

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def mix_rect(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))

# frame tuple: (year, rect, flash_alpha, pulse_phi or -1, residual_scalar)
timeline = []
for yr in range(1872, 1915):
    timeline += [(yr, FULL, 0.0, -1.0, 0.0)] * 8
NB = 27 * 10
for i in range(NB):
    yr = 1915 + i // 27
    rect = mix_rect(FULL, RING, smooth((i + 1) / NB))
    timeline.append((yr, rect, 0.0, -1.0, 0.0))
FLASH_N = 30
for i in range(FLASH_N):
    a = (i + 1) / 12 if i < 12 else 1.0
    timeline.append((1925, RING, a, -1.0, 0.0))
PULSE_N = 60
for i in range(PULSE_N):
    phi = (i + 1) / PULSE_N
    fa = max(0.0, 1.0 - (i + 1) / 12)
    timeline.append((1925, RING, fa, phi, 0.0))
ND1 = 6 * 35
for i in range(ND1):
    yr = 1926 + i // 6
    rect = mix_rect(RING, FULL, smooth((i + 1) / 120)) if i < 120 else FULL
    res = 1.0 + (0.45 - 1.0) * smooth((i + 1) / 30) if i < 30 else 0.45
    timeline.append((yr, rect, 0.0, -1.0, res))
for yr in range(1961, 2026):
    timeline += [(yr, FULL, 0.0, -1.0, 0.45)] * 3
timeline += [(2025, FULL, 0.0, -1.0, 0.45)] * 90
print("total frames:", len(timeline), " duration: %.1fs" % (len(timeline) / FPS))

IDX_1924 = 344 + NB - 1                    # 613
IDX_1925 = 344 + NB + FLASH_N - 1          # 643  (flash full, just before pulse)
IDX_PULSE = 344 + NB + FLASH_N + 30        # 674  (phi ~= 0.52)
KEYFRAMES = {IDX_1924: "1924", IDX_1925: "1925", IDX_PULSE: "pulse",
             len(timeline) - 1: "2025"}
print("keyframe indices:", KEYFRAMES)

# ---------------- render ----------------
def main():
    t0 = time.time()
    need_years = sorted(set(y for y, _r, _a, _p, _s in timeline))
    for i, y in enumerate(need_years):
        render_state(y)
        if (i + 1) % 40 == 0:
            print(f"states {i+1}/{len(need_years)}  elapsed {time.time()-t0:.0f}s", flush=True)
    print("states done %.0fs" % (time.time() - t0), flush=True)
    flash_arr = np.asarray(build_flash()).astype(np.float32)
    residual_arr = build_residual()

    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 42)
    out_mp4 = os.path.join(EXP, "ghost-lines-anim-v2.mp4")
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

    for idx, (yr, rect, fa, phi, res) in enumerate(timeline):
        img = get_state(yr).copy()
        arr = None
        if fa > 0 or phi >= 0 or res > 0:
            arr = np.asarray(img).astype(np.float32)
            if fa > 0:
                arr *= (1.0 - 0.18 * fa)
                fl = flash_arr.copy()
                fl[..., 3] *= fa
                alpha = (fl[..., 3:4] / 255.0)
                arr = arr * (1 - alpha) + fl[..., :3] * alpha
            if phi >= 0:
                arr += pulse_layer(phi)
            if res > 0:
                arr += residual_arr * res
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        box = tuple(int(round(v)) for v in rect)
        frame = img.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)
        dr = ImageDraw.Draw(frame)
        dr.text((38, OUT_H - 78), str(yr), font=font, fill=(216, 216, 216))
        frame.save(os.path.join(FRAMES_DIR, f"frame-{idx:04d}.jpg"), quality=92)
        if idx in KEYFRAMES:
            frame.save(os.path.join(EXP, f"ghost-lines-anim-v2-key-{KEYFRAMES[idx]}.png"))
            print("keyframe", KEYFRAMES[idx], "at frame", idx, flush=True)
        ff.stdin.write(frame.tobytes())
        if (idx + 1) % 200 == 0:
            print(f"frames {idx+1}/{len(timeline)}  elapsed {time.time()-t0:.0f}s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("mp4 written:", out_mp4, " total %.0fs" % (time.time() - t0))

if __name__ == "__main__":
    main()
