# -*- coding: utf-8 -*-
"""Extract year-tagged railway polylines for the GHOST LINES 3D spike.

Source: the 2D pipeline's matched product `assigned.json`
(OSM ways joined with opening years from docs/experiments/ghost-lines-years.csv),
produced by docs/experiments/ghost-lines-anim-src/. That file is a local
working artifact of the main repo, so pass its path as argv[1] if it is not
in the default location.

Output: public/ghost-lines.json — ways intersecting the study bbox
(Chiyoda + Chuo wards with margin), consecutive duplicate points removed,
ways with <2 distinct points dropped, coordinates rounded to 6 decimals.

Format: [{"y": opening_year, "l": line_id, "g": [[lng, lat], ...]}, ...]
"""
import json
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/workspace/navara-tocho-proto/docs/experiments/ghost-lines-anim-src/work/assigned.json")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "ghost-lines.json")

# Study bbox: Chiyoda (west) + Chuo (east) with margin on every side.
W, S, E, N = 139.735, 35.645, 139.800, 35.705


def main() -> None:
    ways = json.load(open(SRC))
    out = []
    dropped = 0
    for w in ways:
        geom = w["geom"]
        if not any(W <= p[0] <= E and S <= p[1] <= N for p in geom):
            continue
        pts = []
        for lng, lat in geom:
            pt = [round(lng, 6), round(lat, 6)]
            if not pts or pts[-1] != pt:
                pts.append(pt)
        if len(pts) < 2:
            dropped += 1
            continue
        out.append({"y": int(w["year"]), "l": w["lid"], "g": pts})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    by_state = {yr: sum(1 for w in out if w["y"] <= yr) for yr in (1900, 1925, 2025)}
    print(f"ways={len(out)} dropped={dropped} points={sum(len(w['g']) for w in out)} "
          f"states={by_state} bytes={os.path.getsize(OUT)}")


if __name__ == "__main__":
    main()
