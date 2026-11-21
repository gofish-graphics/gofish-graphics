"""S4b: a pygfx (wgpu, offscreen) painter for GoFish display lists, and the
1e6-point case where the engine lays out only the chrome.

    .venv/bin/python paint_pygfx.py scenes   # bars + scatter from S3 scenes
    .venv/bin/python paint_pygfx.py million  # 1e6 points, engine sees a stand-in

Mapping: rects -> one vertex-colored triangle mesh; ellipses -> gfx.Points
(size in world units = 2r); paths -> gfx.Line (polylines sampled from the
SVG path; fills of paths are NOT drawn: no triangulation in this spike);
text -> gfx.Text. The display list is y-down, pygfx is y-up: y' = h - y.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pygfx as gfx
import pylinalg as la
from matplotlib.colors import to_rgba
from rendercanvas.offscreen import RenderCanvas
from svgpathtools import parse_path

HERE = pathlib.Path(__file__).parent
IMG = HERE.parent / "img"
PIXEL_RATIO = 2


def rgba(c, opacity=1.0):
    if c is None or c == "none":
        return None
    try:
        r, g, b, a = to_rgba(c)
    except ValueError:
        return None
    return (r, g, b, a * opacity)


class PygfxPainter:
    def __init__(self, viewport):
        self.w, self.h = viewport["w"], viewport["h"]
        self.scene = gfx.Scene()
        self.scene.add(gfx.Background.from_color("#ffffff"))
        self.rect_pos, self.rect_col = [], []
        self.pt_pos, self.pt_col, self.pt_size = [], [], []
        self.skipped = {}

    def y(self, y):
        return self.h - y

    def paint(self, items, ox=0.0, oy=0.0):
        for it in items:
            st = it.get("style") or {}
            op = st.get("opacity", 1.0)
            k = it["kind"]
            if k == "rect":
                c = rgba(st.get("fill", "black"), op * st.get("fillOpacity", 1.0))
                if c is None:
                    self.skipped["rect without fill"] = self.skipped.get("rect without fill", 0) + 1
                    continue
                x0, x1 = ox + it["x"], ox + it["x"] + it["w"]
                y0, y1 = self.y(oy + it["y"]), self.y(oy + it["y"] + it["h"])
                self.rect_pos += [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)]
                self.rect_col += [c] * 4
            elif k == "ellipse":
                c = rgba(st.get("fill", "black"), op * st.get("fillOpacity", 1.0))
                if c is None:
                    continue
                self.pt_pos.append((ox + it["cx"], self.y(oy + it["cy"]), 1))
                self.pt_col.append(c)
                self.pt_size.append(2 * it["rx"])
            elif k == "path":
                c = rgba(st.get("stroke"), op)
                if c is None:
                    self.skipped["filled path"] = self.skipped.get("filled path", 0) + 1
                    continue
                p = parse_path(it["d"])
                pts = [p.point(t) for t in np.linspace(0, 1, max(8, int(p.length() / 2)))]
                pos = np.array([(ox + q.real, self.y(oy + q.imag), 2) for q in pts], np.float32)
                self.scene.add(
                    gfx.Line(gfx.Geometry(positions=pos), gfx.LineMaterial(thickness=st.get("strokeWidth", 1) * PIXEL_RATIO, color=c))
                )
            elif k == "text":
                ha = {"start": "left", "middle": "center", "end": "right"}[it.get("textAnchor", "start")]
                va = {"auto": "baseline", "central": "middle", "middle": "middle", "hanging": "top", "mathematical": "middle"}[
                    it.get("dominantBaseline", "auto")
                ]
                t = gfx.Text(
                    text=it["text"], font_size=it.get("fontSize") or 12, anchor=f"{va}-{ha}", screen_space=False,
                    material=gfx.TextMaterial(color=rgba(st.get("fill", "black"), op) or (0, 0, 0, 1)),
                )
                t.local.position = (ox + it["x"], self.y(oy + it["y"]), 3)
                if it.get("rotate"):
                    t.local.rotation = la.quat_from_euler((0, 0, -np.radians(it["rotate"])))
                self.scene.add(t)
            elif k == "group":
                tr = it.get("transform") or {}
                if tr.get("scale") not in (None, [1, 1]):
                    self.skipped["scaled group"] = self.skipped.get("scaled group", 0) + 1
                tx, ty = tr.get("translate", [0, 0])
                self.paint(it["children"], ox + tx, oy + ty)
            else:
                self.skipped[k] = self.skipped.get(k, 0) + 1

    def add_points(self, xy, colors, size):
        """Draw points straight from numpy arrays (pixel coords, y-down)."""
        pos = np.zeros((len(xy), 3), np.float32)
        pos[:, 0] = xy[:, 0]
        pos[:, 1] = self.h - xy[:, 1]
        pos[:, 2] = 1
        self.scene.add(
            gfx.Points(
                gfx.Geometry(positions=pos, colors=colors.astype(np.float32)),
                gfx.PointsMaterial(size=size, size_space="world", color_mode="vertex"),
            )
        )

    def flush(self):
        if self.rect_pos:
            n = len(self.rect_pos) // 4
            idx = np.array([[4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 2, 4 * i + 3, 4 * i] for i in range(n)], np.uint32).reshape(-1, 3)
            self.scene.add(
                gfx.Mesh(
                    gfx.Geometry(positions=np.array(self.rect_pos, np.float32), indices=idx, colors=np.array(self.rect_col, np.float32)),
                    gfx.MeshBasicMaterial(color_mode="vertex"),
                )
            )
        if self.pt_pos:
            self.scene.add(
                gfx.Points(
                    gfx.Geometry(
                        positions=np.array(self.pt_pos, np.float32),
                        colors=np.array(self.pt_col, np.float32),
                        sizes=np.array(self.pt_size, np.float32),
                    ),
                    gfx.PointsMaterial(size_space="world", size_mode="vertex", color_mode="vertex"),
                )
            )

    def render(self, path):
        self.flush()
        canvas = RenderCanvas(size=(self.w, self.h), pixel_ratio=PIXEL_RATIO)
        renderer = gfx.renderers.WgpuRenderer(canvas)
        camera = gfx.OrthographicCamera(self.w, self.h, maintain_aspect=False)
        camera.local.position = (self.w / 2, self.h / 2, 10)
        canvas.request_draw(lambda: renderer.render(self.scene, camera))
        t = time.perf_counter()
        img = np.asarray(canvas.draw())
        gpu_ms = (time.perf_counter() - t) * 1000
        import PIL.Image

        PIL.Image.fromarray(img).save(path)
        return gpu_ms, img.shape


def scenes():
    for name in ["bars", "scatter"]:
        scene = json.loads((HERE / "out" / "py" / "miniracer" / f"{name}.json").read_text())
        p = PygfxPainter(scene["viewport"])
        t = time.perf_counter()
        p.paint(scene["items"])
        gpu_ms, shape = p.render(IMG / f"s4-{name}-pygfx.png")
        print(f"{name}: total {(time.perf_counter() - t) * 1000:.0f} ms (draw {gpu_ms:.0f} ms), {shape}, skipped {p.skipped or 'none'}")


def million():
    """1e6 points. The engine never sees them: it lays out a STAND-IN chart of
    a few rows at the column extents (one per color group, so the legend has
    every group), and the x/y pixel mapping is recovered from where it placed
    those rows. The engine has no API that returns a scale transform; this is
    the nearest honest thing."""
    sys.path.insert(0, str(HERE))
    from s3 import MiniRacerEngine

    rng = np.random.default_rng(1)
    n = 1_000_000
    groups = np.array(["alpha", "beta", "gamma"])
    g = rng.integers(0, 3, n)
    centers = np.array([[20, 30], [55, 70], [80, 25]], float)
    xy = centers[g] + rng.normal(size=(n, 2)) * [12, 14]

    t0 = time.perf_counter()
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    rows = [{"id": i, "group": str(gr), "x": float(lo[0]), "y": float(lo[1])} for i, gr in enumerate(groups)]
    rows.append({"id": 3, "group": "alpha", "x": float(hi[0]), "y": float(hi[1])})
    ir = json.loads((HERE / "out" / "ir" / "scatter.json").read_text())
    doc, opts = ir["doc"], ir["opts"]
    doc["tables"]["t0"] = rows
    t_ext = time.perf_counter()

    eng = MiniRacerEngine()
    t_eng0 = time.perf_counter()
    scene = json.loads(eng.scene(json.dumps(doc), json.dumps(opts)))
    t_eng = time.perf_counter() - t_eng0

    # Recover the affine x/y maps from the stand-in circles (datum ids 0 and 3).
    circles = [it for it in scene["items"] if it["kind"] == "ellipse"]
    by_id = {}
    for c in circles:
        d = c.get("datum")
        rid = d.get("id") if isinstance(d, dict) else None
        by_id.setdefault(rid, c)
    if 0 in by_id and 3 in by_id:
        a, b = by_id[0], by_id[3]
        recovered = "from datum ids"
    else:  # no datum on the items: take the extreme circles by position
        a = min(circles, key=lambda c: c["cx"])
        b = max(circles, key=lambda c: c["cx"])
        recovered = "from extreme circle positions (no datum on items)"
    sx = (b["cx"] - a["cx"]) / (hi[0] - lo[0])
    sy = (b["cy"] - a["cy"]) / (hi[1] - lo[1])
    px = np.empty_like(xy)
    px[:, 0] = a["cx"] + (xy[:, 0] - lo[0]) * sx
    px[:, 1] = a["cy"] + (xy[:, 1] - lo[1]) * sy
    # Colors: read the engine's color scale off the legend swatches (rect
    # next to a text naming the group), falling back to the circles.
    color_of = {}
    texts = [it for it in scene["items"] if it["kind"] == "text"]
    rects = [it for it in scene["items"] if it["kind"] == "rect"]
    for gname in groups:
        lab = next((t for t in texts if t["text"] == gname), None)
        if lab:
            sw = min(rects, key=lambda r: abs(r["y"] + r["h"] / 2 - lab["y"]) + abs(r["x"] + r["w"] - lab["x"]))
            color_of[gname] = rgba(sw["style"]["fill"], 0.35)
    cols = np.array([color_of.get(gn, (0.3, 0.3, 0.3, 0.35)) for gn in groups], np.float32)[g]

    p = PygfxPainter(scene["viewport"])
    chrome = [it for it in scene["items"] if it["kind"] != "ellipse"]  # drop the stand-in rows
    p.paint(chrome)
    p.add_points(px, cols, size=1.2)
    t_paint0 = time.perf_counter()
    gpu_ms, shape = p.render(IMG / "s4-million-pygfx.png")
    print(
        f"1e6 points: extents {1000 * (t_ext - t0):.0f} ms, engine (stand-in chart) {1000 * t_eng:.0f} ms,"
        f" transform recovered {recovered}: x' = {a['cx']:.2f} + (x - {lo[0]:.2f}) * {sx:.4f},"
        f" y' = {a['cy']:.2f} + (y - {lo[1]:.2f}) * {sy:.4f}; pygfx build+draw {1000 * (time.perf_counter() - t_paint0):.0f} ms"
        f" (first draw {gpu_ms:.0f} ms incl. pipeline compile), image {shape}"
    )


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "scenes"
    {"scenes": scenes, "million": million}[what]()
