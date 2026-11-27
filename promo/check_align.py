"""Checks that every callout and zoom sits on the part of the app it was measured on.

For each moment a callout (or a zoom) is on screen, the pixels under its rectangle in the
footage frame being shown are compared with the same rectangle in the frame where its
position was recorded. If the page had scrolled or changed under it, they differ.

    python promo/check_align.py demo      (after: node promo/render.mjs check --page cuts/demo.html --out demo)
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
RAW = HERE / "footage" / "raw"
cache = {}


def frame(name):
    if name not in cache:
        cache[name] = np.asarray(Image.open(RAW / name).convert("L"), dtype=np.float32)
    return cache[name]


def crop(img, r, _dsf):
    dsf = img.shape[1] / 688  # frames are the 688 px wide viewport at whatever scale Chrome drew
    x0, y0 = max(0, int(r["x"] * dsf)), max(0, int(r["y"] * dsf))
    x1, y1 = min(img.shape[1], int((r["x"] + r["w"]) * dsf)), min(img.shape[0], int((r["y"] + r["h"]) * dsf))
    return img[y0:y1, x0:x1]


def main(name, limit=10.0):
    data = json.loads((HERE / "out" / f"{name}-align.json").read_text())
    dsf = data["dsf"]
    groups = {}
    for s in data["samples"]:
        if not s["refFrame"]:
            groups.setdefault((s["kind"], s["label"]), []).append((s["t"], None, 0))
            continue
        ref, cur = frame(s["refFrame"]), frame(s["frame"])
        a = crop(ref, s["rect"], dsf)
        diff = float(np.mean(np.abs(a - crop(cur, s["rect"], dsf))))
        # Did the page move under it? Find the vertical/horizontal shift that matches best.
        shift = 0
        if diff > limit:
            best = diff
            for dy in range(-120, 121, 4):
                for dx in (-40, 0, 40) if s["kind"] == "zoom" else (0,):
                    if dx == 0 and dy == 0:
                        continue
                    r2 = dict(s["rect"], x=s["rect"]["x"] + dx, y=s["rect"]["y"] + dy)
                    b = crop(cur, r2, dsf)
                    if b.shape != a.shape:
                        continue
                    d = float(np.mean(np.abs(a - b)))
                    if d < best:
                        best, shift = d, (dx, dy)
            if best > limit or best > diff * 0.6:
                shift = 0  # nothing lines up better: the content changed, the layout didn't move
        groups.setdefault((s["kind"], s["label"]), []).append((s["t"], diff, shift))
    bad = 0
    for (kind, label), xs in groups.items():
        known = [d for _, d, _ in xs if d is not None]
        worst = max(known) if known else None
        moved = [(t, sh) for t, d, sh in xs if sh]
        changed = [t for t, d, sh in xs if d is not None and d > limit and not sh]
        t0, t1 = xs[0][0], xs[-1][0]
        if worst is None:
            status, extra = "NO REFERENCE", ""
        elif moved:
            status, extra = "MOVED", f" (page shifted {moved[0][1]} css px at {moved[0][0]:.1f}-{moved[-1][0]:.1f} s)"
            bad += 1
        elif changed:
            status, extra = "content", f" (same place, content updates at {changed[0]:.1f}-{changed[-1]:.1f} s)"
        else:
            status, extra = "aligned", ""
        print(f"{status:12} {kind:7} {t0:6.1f}-{t1:6.1f} s  worst diff {worst if worst is None else round(worst, 1)}  {label}{extra}")
    print(f"{bad} misaligned (the page moved under an overlay); 'content' means the app updated in place")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demo")
