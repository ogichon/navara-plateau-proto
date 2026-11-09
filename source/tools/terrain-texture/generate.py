#!/usr/bin/env python3
"""TERRA NAKED 用テクスチャタイル生成。

地理院 dem_png を取得・復号し、標高ティント＋陰影（hillshade）＋崖線の
稜線強調を合成したラスタータイルを public/terrain/{z}/{x}/{y}.png に出す。
レシピは docs/experiments/terra-proto.md の v4（ディレクター目視検証済み）。

使い方: python3 tools/terrain-texture/generate.py [zmin zmax]
依存: numpy, Pillow, scipy
"""
import math, sys, urllib.request, io
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

LON0, LON1, LAT0, LAT1 = 139.55, 139.95, 35.52, 35.86
OUT = Path(__file__).resolve().parents[2] / "public" / "terrain"
STOPS = [(-2,(14,26,23)),(0,(18,33,28)),(3,(26,47,40)),(8,(36,68,60)),
         (15,(63,106,84)),(25,(138,154,104)),(35,(194,177,131)),(45,(220,199,156)),
         (60,(232,214,178)),(100,(226,216,192)),(160,(218,214,200))]
SEA = np.array([3, 5, 7], dtype=np.float32)
GLOW = np.array([245, 233, 200], dtype=np.float32)
EX = 6.0

def fetch(z, tx, ty):
    url = f"https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{tx}/{ty}.png"
    req = urllib.request.Request(url, headers={"User-Agent": "navara-terra-texture/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        blob = r.read()
    a = np.asarray(Image.open(io.BytesIO(blob)).convert("RGB"), dtype=np.int32)
    v = a[:, :, 0] * 65536 + a[:, :, 1] * 256 + a[:, :, 2]
    return np.where(v == 0x800000, np.nan,
                    np.where(v >= 2**23, v - 2**24, v) / 100.0).astype(np.float32)

def fetch_with_parent(z, tx, ty):
    # 欠けたタイルは親ズームを再帰的にたどって補い、最後まで無ければ海（全欠測）
    try:
        return fetch(z, tx, ty)
    except Exception:
        if z <= 8:
            return np.full((256, 256), np.nan, dtype=np.float32)
        ph = fetch_with_parent(z - 1, tx // 2, ty // 2)
        if ph.shape == (256, 256) and np.isnan(ph).all():
            return ph
        qy, qx = (ty % 2) * 128, (tx % 2) * 128
        sub = ph[qy:qy + 128, qx:qx + 128]
        img = Image.fromarray(np.nan_to_num(sub, nan=-9999).astype(np.float32))
        h = np.asarray(img.resize((256, 256), Image.BILINEAR))
        return np.where(h < -9000, np.nan, h).astype(np.float32)

def build_zoom(z):
    n = 2**z
    x0 = int((LON0 + 180) / 360 * n); x1 = int((LON1 + 180) / 360 * n)
    y0 = int((1 - math.asinh(math.tan(math.radians(LAT1))) / math.pi) / 2 * n)
    y1 = int((1 - math.asinh(math.tan(math.radians(LAT0))) / math.pi) / 2 * n)
    W, H = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    dem = np.full((H, W), np.nan, dtype=np.float32)
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            dem[(ty - y0) * 256:(ty - y0) * 256 + 256,
                (tx - x0) * 256:(tx - x0) * 256 + 256] = fetch_with_parent(z, tx, ty)
    mask = np.isfinite(dem)
    filled = np.where(mask, dem, 0.0)
    latm = math.radians((LAT0 + LAT1) / 2)
    m_per_px = (360 / n) * 111320 * math.cos(latm) / 256
    grad_base = np.where(filled < 8, gaussian_filter(filled, 1.2), filled)
    gy, gx = np.gradient(grad_base * EX, m_per_px, m_per_px)
    alt, az = math.radians(40), math.radians(315)
    slope = np.arctan(np.sqrt(gx**2 + gy**2))
    aspect = np.arctan2(-gy, gx)
    shade = np.clip(np.sin(alt) * np.cos(slope)
                    + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    edge = np.clip(np.tan(slope) * 2.2, 0, 1)
    hs = np.array([s[0] for s in STOPS]); cols = np.array([s[1] for s in STOPS], dtype=np.float32)
    tint = np.stack([np.interp(filled, hs, cols[:, c]) for c in range(3)], axis=-1)
    out = tint * (0.30 + 0.75 * shade)[..., None]
    out = out * (1 - edge[..., None] * 0.42) + GLOW[None, None, :] * (edge[..., None] * 0.42)
    out = np.where(mask[..., None], out, SEA[None, None, :])
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    count = 0
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            tile = img.crop(((tx - x0) * 256, (ty - y0) * 256,
                             (tx - x0) * 256 + 256, (ty - y0) * 256 + 256))
            p = OUT / str(z) / str(tx) / f"{ty}.png"
            p.parent.mkdir(parents=True, exist_ok=True)
            tile.save(p, optimize=True)
            count += 1
    print(f"z{z}: {count} tiles")

if __name__ == "__main__":
    zmin = int(sys.argv[1]) if len(sys.argv) > 1 else 11
    zmax = int(sys.argv[2]) if len(sys.argv) > 2 else 13
    for z in range(zmin, zmax + 1):
        build_zoom(z)
