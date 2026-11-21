"""S4a: a matplotlib (Agg) painter for GoFish display lists.

    .venv/bin/python paint_mpl.py [runtime=miniracer]

Reads out/py/<runtime>/<spec>.json (scenes the engine produced inside
Python, S3) and writes ../img/s4-<spec>-mpl.png. Coordinates are the display
list's absolute y-down pixels, so the axes are just [0, w] x [h, 0].
"""
import json
import math
import pathlib
import re
import sys
import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import patches, transforms  # noqa: E402
from matplotlib.path import Path  # noqa: E402
from svgpathtools import Arc, CubicBezier, Line, QuadraticBezier, parse_path  # noqa: E402

HERE = pathlib.Path(__file__).parent
IMG = HERE.parent / "img"
DPI = 100
PX_TO_PT = 72 / DPI


def color(c, opacity=1.0):
    if c is None or c == "none":
        return "none"
    m = re.match(r"rgba?\(([^)]*)\)", c)
    if m:
        parts = [float(p) for p in m.group(1).replace("/", ",").split(",") if p.strip()]
        r, g, b = (v / 255 for v in parts[:3])
        a = parts[3] if len(parts) > 3 else 1.0
        return (r, g, b, a * opacity)
    try:
        rgba = matplotlib.colors.to_rgba(c)
    except ValueError:
        return "none"
    return (*rgba[:3], rgba[3] * opacity)


def svg_path(d):
    """SVG path data -> matplotlib Path (arcs sampled, curves kept)."""
    verts, codes = [], []
    p = parse_path(d)
    for sub in p.continuous_subpaths():
        if len(sub) == 0:
            continue
        s = sub[0].start
        verts.append((s.real, s.imag))
        codes.append(Path.MOVETO)
        for seg in sub:
            if isinstance(seg, Line):
                verts.append((seg.end.real, seg.end.imag))
                codes.append(Path.LINETO)
            elif isinstance(seg, CubicBezier):
                for q in (seg.control1, seg.control2, seg.end):
                    verts.append((q.real, q.imag))
                    codes.append(Path.CURVE4)
            elif isinstance(seg, QuadraticBezier):
                for q in (seg.control, seg.end):
                    verts.append((q.real, q.imag))
                    codes.append(Path.CURVE3)
            elif isinstance(seg, Arc):
                for i in range(1, 17):
                    q = seg.point(i / 16)
                    verts.append((q.real, q.imag))
                    codes.append(Path.LINETO)
    return Path(verts, codes) if verts else None


class MplPainter:
    def __init__(self, viewport):
        w, h = viewport["w"], viewport["h"]
        self.fig = plt.figure(figsize=(w / DPI, h / DPI), dpi=DPI)
        self.ax = self.fig.add_axes((0, 0, 1, 1))
        self.ax.set_xlim(0, w)
        self.ax.set_ylim(h, 0)
        self.ax.axis("off")
        self.fig.patch.set_facecolor("white")
        self.unsupported = {}

    def style(self, item, default_fill="black"):
        st = item.get("style") or {}
        op = st.get("opacity", 1.0)
        fill = st.get("fill", default_fill)
        return dict(
            facecolor=color(fill, op * st.get("fillOpacity", 1.0)),
            edgecolor=color(st.get("stroke"), op),
            linewidth=(st.get("strokeWidth", 1) if st.get("stroke") not in (None, "none") else 0) * PX_TO_PT,
        )

    def paint(self, items, tr):
        for it in items:
            k = it["kind"]
            if k == "rect":
                self.ax.add_patch(
                    patches.Rectangle((it["x"], it["y"]), it["w"], it["h"], transform=tr, **self.style(it))
                )
            elif k == "ellipse":
                self.ax.add_patch(
                    patches.Ellipse((it["cx"], it["cy"]), 2 * it["rx"], 2 * it["ry"], transform=tr, **self.style(it))
                )
            elif k == "path":
                path = svg_path(it["d"])
                if path is not None:
                    self.ax.add_patch(patches.PathPatch(path, transform=tr, **self.style(it)))
            elif k == "text":
                st = it.get("style") or {}
                ha = {"start": "left", "middle": "center", "end": "right"}[it.get("textAnchor", "start")]
                va = {"auto": "baseline", "central": "center", "middle": "center", "hanging": "top", "mathematical": "center"}[
                    it.get("dominantBaseline", "auto")
                ]
                self.ax.text(
                    it["x"], it["y"], it["text"], transform=tr, ha=ha, va=va,
                    rotation=-(it.get("rotate") or 0), rotation_mode="anchor",
                    fontsize=(it.get("fontSize") or 12) * PX_TO_PT, family="Arial",
                    color=color(st.get("fill", "black"), st.get("opacity", 1.0)),
                )
            elif k == "group":
                t = it.get("transform") or {}
                sx, sy = t.get("scale", [1, 1])
                tx, ty = t.get("translate", [0, 0])
                self.paint(it["children"], transforms.Affine2D().scale(sx, sy).translate(tx, ty) + tr)
            elif k == "composite":
                # Not composited: paint the operands' fill/paint as-is.
                self.unsupported["composite"] = self.unsupported.get("composite", 0) + 1
                for op in it.get("operands", []):
                    self.paint(op.get("paint", []), tr)
            else:
                self.unsupported[k] = self.unsupported.get(k, 0) + 1

    def save(self, path):
        self.fig.savefig(path, dpi=DPI * 2, facecolor="white")
        plt.close(self.fig)


def paint_scene(scene, path):
    p = MplPainter(scene["viewport"])
    p.paint(scene["items"], p.ax.transData)
    p.save(path)
    return p.unsupported


if __name__ == "__main__":
    runtime = sys.argv[1] if len(sys.argv) > 1 else "miniracer"
    for name in ["bars", "scatter", "lines", "polar", "geo"]:
        f = HERE / "out" / "py" / runtime / f"{name}.json"
        if not f.exists():
            print(f"{name}: no scene from {runtime}")
            continue
        t = time.perf_counter()
        unsupported = paint_scene(json.loads(f.read_text()), IMG / f"s4-{name}-mpl.png")
        print(f"{name}: {(time.perf_counter() - t) * 1000:.0f} ms, unsupported {unsupported or 'none'}")
