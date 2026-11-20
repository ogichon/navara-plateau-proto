# -*- coding: utf-8 -*-
import json, math, sys, csv
from collections import Counter, defaultdict
sys.path.insert(0, ".")
from defs import LINES

BBOX = (139.53, 35.53, 139.97, 35.87)  # lon0, lat0, lon1, lat1
COSLAT = math.cos(math.radians(35.70))

obj = json.load(open("./osm_raw.json"))
els = obj["elements"]
ways = [e for e in els if e["type"] == "way"]
rail = [w for w in ways if "railway" in w.get("tags", {})]
water = [w for w in ways if "waterway" in w.get("tags", {})]

# ---- stations ----
st = defaultdict(list)
for e in els:
    if e["type"] == "node" and e.get("tags", {}).get("railway") == "station":
        nm = e["tags"].get("name")
        if nm: st[nm].append((e["lon"], e["lat"]))
ST = {k: (sum(x for x, _ in v) / len(v), sum(y for _, y in v) / len(v)) for k, v in st.items()}
print(f"stations: {len(ST)}")

def wlen(w):
    g = w.get("geometry", []); s = 0.0
    for a, b in zip(g, g[1:]):
        s += 6371000 * math.hypot(math.radians(b["lat"] - a["lat"]),
                                  math.radians(b["lon"] - a["lon"]) * COSLAT)
    return s

def midpoint(w):
    g = w.get("geometry", [])
    if not g: return None
    return (sum(p["lon"] for p in g) / len(g), sum(p["lat"] for p in g) / len(g))

def dist(p, q):
    return math.hypot((p[0] - q[0]) * COSLAT, p[1] - q[1])

# ---- ring definition ----
RING_ST = ["東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川", "大崎", "五反田",
           "目黒", "恵比寿", "渋谷", "原宿", "代々木", "新宿", "新大久保", "高田馬場", "目白", "池袋",
           "大塚", "巣鴨", "駒込", "田端", "西日暮里", "日暮里", "鶯谷", "上野", "秋葉原", "神田"]
RING_SEG_YEAR = [1914, 1910, 1872, 1872, 1872, 1872, 1885, 1885, 1885, 1885, 1885, 1885, 1885, 1885,
                 1885, 1885, 1885, 1885, 1903, 1903, 1903, 1903, 1883, 1883, 1883, 1883, 1925, 1925, 1919]
RING_DATES = {1914: "1914-12-20", 1910: "1910-06-25", 1872: "1872-10-14", 1885: "1885-03-01",
              1903: "1903-04-01", 1883: "1883-07-28", 1925: "1925-11-01", 1919: "1919-03-01"}
missing_ring = [s for s in RING_ST if s not in ST]
print("ring stations missing in OSM nodes:", missing_ring)
RING_PTS = [ST[s] for s in RING_ST if s in ST]
RING_SEGS = []  # (a, b, year, from_name, to_name)
valid_idx = [i for i, s in enumerate(RING_ST) if s in ST]
for k, i in enumerate(valid_idx):
    j = valid_idx[(k + 1) % len(valid_idx)]
    # year of segment i -> next station in original order (only if consecutive in original ring)
    yr = RING_SEG_YEAR[i] if (j == (i + 1) % len(RING_ST)) else None
    RING_SEGS.append((RING_PTS[k], RING_PTS[(k + 1) % len(RING_PTS)], yr, RING_ST[i], RING_ST[j]))

def ring_year(p):
    best = None; bestd = 1e9
    n = len(RING_SEGS)
    for k in range(n):
        a, b, yr, fn, tn = RING_SEGS[k]
        ax, ay = (a[0] * COSLAT, a[1]); bx, by = (b[0] * COSLAT, b[1]); px, py = (p[0] * COSLAT, p[1])
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        qx, qy = ax + t * dx, ay + t * dy
        d = math.hypot(px - qx, py - qy)
        if d < bestd: bestd = d; best = (yr, fn, tn)
    return best  # (year, from, to)

# ---- build name -> def index ----
name2def = {}
for lid, d in LINES.items():
    for nm in d["osm"]:
        name2def[nm] = lid

# anchor maps per line
anchor_map = {}   # lid -> list of (coord, year)
missing_anchors = Counter()
for lid, d in LINES.items():
    if d["mode"] == "anchors":
        lst = []
        for g in d["groups"]:
            for s in g["stations"]:
                if s in ST: lst.append((ST[s], g["year"]))
                else: missing_anchors[s] += 1
        anchor_map[lid] = lst
print("anchor stations missing in OSM:", dict(missing_anchors))

def way_year(w):
    tg = w.get("tags", {})
    nm = tg.get("name")
    if not nm or nm not in name2def: return None, None
    lid = name2def[nm]; d = LINES[lid]
    if d["mode"] == "flat": return d["year"], lid
    p = midpoint(w)
    if p is None: return None, lid
    if d["mode"] == "ring":
        r = ring_year(p)
        return (r[0] if r else None), lid
    # anchors
    best = None; bestd = 1e18
    for coord, yr in anchor_map[lid]:
        dd = dist(p, coord)
        if dd < bestd: bestd = dd; best = yr
    return best, lid

# ---- classify ----
results = []  # (way, year, lid)
unmatched_named = Counter(); unmatched_named_len = defaultdict(float)
unnamed_service = 0; unnamed_service_len = 0.0
unnamed_other = 0; unnamed_other_len = 0.0
nonoperating = 0
start_date_ways = 0
matched_len = 0.0; matched_n = 0
total_len = 0.0
for w in rail:
    tg = w["tags"]
    if tg.get("disused") == "yes" or tg.get("construction") or tg.get("railway") in ("construction", "proposed", "abandoned", "disused"):
        nonoperating += 1; continue
    L = wlen(w); total_len += L
    if tg.get("start_date"): start_date_ways += 1
    yr, lid = way_year(w)
    if yr is not None:
        matched_n += 1; matched_len += L; results.append((w, yr, lid))
    else:
        nm = tg.get("name")
        if nm and any(k in nm for k in ("番線", "留置", "コンテナ", "機回", "到着線", "修繕線", "旋盤", "引上線", "洗浄線", "訓練線", "出発線", "仕業", "検修")):
            unmatched_named["(yard tracks: 番線・留置・コンテナ線)"] += 1
            unmatched_named_len["(yard tracks: 番線・留置・コンテナ線)"] += L
        elif nm:
            unmatched_named[nm] += 1; unmatched_named_len[nm] += L
        elif tg.get("service") in ("yard", "siding", "crossover", "spur"):
            unnamed_service += 1; unnamed_service_len += L
        else:
            unnamed_other += 1; unnamed_other_len += L

tot_n = matched_n + sum(unmatched_named.values()) + unnamed_service + unnamed_other
print(f"\noperating rail ways: {tot_n}  total {total_len/1000:.1f} km")
print(f"matched: {matched_n} ways ({100*matched_n/tot_n:.1f}%), {matched_len/1000:.1f} km ({100*matched_len/total_len:.1f}%)")
print(f"unmatched NAMED: {sum(unmatched_named.values())} ways, {sum(unmatched_named_len.values())/1000:.1f} km")
print(f"unnamed service tracks: {unnamed_service} ways, {unnamed_service_len/1000:.1f} km")
print(f"unnamed other: {unnamed_other} ways, {unnamed_other_len/1000:.1f} km")
print(f"non-operating excluded: {nonoperating}")
print(f"ways with start_date tag: {start_date_ways}")
print("\ntop unmatched named (by km):")
for nm, ln in sorted(unmatched_named_len.items(), key=lambda kv: -kv[1])[:25]:
    print(f"  {unmatched_named[nm]:4d} ways {ln/1000:6.1f} km  {nm}")

# per-year cumulative
by_year = Counter()
for w, yr, lid in results: by_year[yr] += wlen(w)
cum = 0.0
print("\ncumulative matched km by frame year:")
for fy in (1900, 1924, 1925, 1960, 2000, 2025):
    c = sum(v for y, v in by_year.items() if y <= fy)
    print(f"  {fy}: {c/1000:.1f} km")

json.dump({"matched": matched_n, "matched_km": matched_len / 1000, "total_km": total_len / 1000,
           "total_n": tot_n}, open("./stats.json", "w"))
# save assignments for renderer
with open("./assigned.json", "w") as f:
    json.dump([{"id": w["id"], "year": yr, "lid": lid,
                "geom": [[p["lon"], p["lat"]] for p in w.get("geometry", [])]} for w, yr, lid in results], f)
with open("./water.json", "w") as f:
    json.dump([[[p["lon"], p["lat"]] for p in w.get("geometry", [])] for w in water], f)
print("\nsaved assigned.json / water.json")
