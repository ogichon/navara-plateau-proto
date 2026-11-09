"""python3 tools/capture/stats.py tools/capture/samples/*.png
Requires Pillow. Statistics are evidence of variation, not semantic proof of tiles.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageStat, ImageChops

previous = None
for name in sys.argv[1:]:
    im = Image.open(name).convert('RGB')
    w, h = im.size
    def summary(region):
        gray = region.convert('L')
        s = ImageStat.Stat(gray)
        hist = gray.histogram()
        n = region.width * region.height
        return dict(mean_luma=s.mean[0], variance_luma=s.var[0],
                    near_black_fraction=sum(hist[:6])/n,
                    near_white_fraction=sum(hist[250:])/n)
    result = dict(file=name, bytes=Path(name).stat().st_size, size=im.size,
                  unique_rgb=len(im.getcolors(w*h)), whole=summary(im),
                  bands={label: summary(im.crop((0, int(h*a), w, int(h*b))))
                         for label, a, b in [('top', 0, .25), ('middle', .25, .75), ('bottom', .75, 1)]})
    if previous is not None and previous.size == im.size:
        result['previous_mean_absolute_rgb_difference'] = sum(ImageStat.Stat(ImageChops.difference(im, previous)).mean)/3
    print(json.dumps(result))
    previous = im
