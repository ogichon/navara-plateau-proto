# -*- coding: utf-8 -*-
"""Overpass fetch for GHOST LINES animation (same query as ghost-lines-time-src/fetch.py).
Saves osm_raw.json (~18MB) into ./work/. Bbox: Tokyo 139.53-139.97 / 35.53-35.87.
"""
import json, urllib.request, urllib.parse, os

QUERY = """
[out:json][timeout:300];
(
  way["railway"~"^(rail|light_rail|subway|tram|monorail|narrow_gauge|funicular)$"](35.53,139.53,35.87,139.97);
  way["waterway"~"^(river|canal)$"](35.53,139.53,35.87,139.97);
  node["railway"="station"](35.53,139.53,35.87,139.97);
);
out geom;
"""

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "work", "osm_raw.json")
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=data,
                                 headers={"User-Agent": "ghost-lines-anim/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r:
        obj = json.load(r)
    with open(out, "w") as f:
        json.dump(obj, f)
    print("saved", out, "elements:", len(obj["elements"]))

if __name__ == "__main__":
    main()
