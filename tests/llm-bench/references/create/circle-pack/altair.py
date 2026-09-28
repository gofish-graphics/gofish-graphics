import math
import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
SIZE = 500


def pack(circles, pad):
    """Greedy front packing: largest first, each circle tangent to two placed
    circles at the free spot nearest the first one. Circles are dicts with
    "r"; sets "x", "y" relative to the enclosing circle's center and returns
    that circle's radius. (Vega-Lite has no packing layout.)"""
    placed = []
    for c in sorted(circles, key=lambda c: -c["r"]):
        if not placed:
            c["x"], c["y"] = 0.0, 0.0
        elif len(placed) == 1:
            c["x"], c["y"] = placed[0]["r"] + c["r"] + pad, 0.0
        else:
            best = None
            for a in placed:
                for b in placed:
                    if a is b:
                        continue
                    da, db = a["r"] + c["r"] + pad, b["r"] + c["r"] + pad
                    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
                    d = math.hypot(dx, dy)
                    t = (da * da - db * db + d * d) / (2 * d)
                    if da * da < t * t:
                        continue
                    h = math.sqrt(da * da - t * t)
                    for s in (1, -1):
                        x = a["x"] + (t * dx - s * h * dy) / d
                        y = a["y"] + (t * dy + s * h * dx) / d
                        free = all(
                            math.hypot(x - q["x"], y - q["y"]) >= q["r"] + c["r"] + pad - 1e-6
                            for q in placed
                        )
                        if free and (best is None or math.hypot(x, y) < math.hypot(*best)):
                            best = (x, y)
            c["x"], c["y"] = best
        placed.append(c)
    # enclosing circle around the middle of the extent
    cx = (min(c["x"] - c["r"] for c in placed) + max(c["x"] + c["r"] for c in placed)) / 2
    cy = (min(c["y"] - c["r"] for c in placed) + max(c["y"] + c["r"] for c in placed)) / 2
    r = max(math.hypot(c["x"] - cx, c["y"] - cy) + c["r"] for c in placed)
    for c in placed:
        c["x"] -= cx
        c["y"] -= cy
    return r


groups = []
for genre, rows in df.groupby("genre", sort=False):
    # radius = sqrt(gross): area proportional to gross
    leaves = [{"r": math.sqrt(g), "genre": genre} for g in rows["gross"]]
    groups.append({"genre": genre, "leaves": leaves, "r": pack(leaves, 2)})
R = pack(groups, 6)
k = SIZE / 2 / R  # px per unit, the same for every radius

genre_df = pd.DataFrame(
    [{"genre": g["genre"], "x": g["x"], "y": g["y"], "r": g["r"]} for g in groups]
)
leaf_df = pd.DataFrame(
    [
        {"genre": g["genre"], "x": g["x"] + l["x"], "y": g["y"] + l["y"], "r": l["r"]}
        for g in groups
        for l in g["leaves"]
    ]
)
for d in (genre_df, leaf_df):
    d["size"] = (2 * d["r"] * k) ** 2  # a circle's size is its diameter squared
genre_df["top"] = genre_df["y"] + genre_df["r"]

scale = alt.Scale(domain=[-R, R], nice=False)
x = alt.X("x:Q", scale=scale, axis=None)
y = alt.Y("y:Q", scale=scale, axis=None)
size = alt.Size("size:Q", scale=None)
outlines = (
    alt.Chart(genre_df)
    .mark_circle(color="#f2f2f2", stroke="#999999", strokeWidth=1, opacity=1)
    .encode(x=x, y=y, size=size)
)
films = (
    alt.Chart(leaf_df)
    .mark_circle(opacity=1)
    .encode(x=x, y=y, size=size, color=alt.Color("genre:N", sort=None, legend=None))
)
labels = (
    alt.Chart(genre_df)
    .mark_text(baseline="top", dy=4, fontSize=12, fontWeight="bold")
    .encode(x=x, y=alt.Y("top:Q", scale=scale, axis=None), text="genre:N")
)
chart = (
    (outlines + films + labels)
    .properties(width=SIZE, height=SIZE)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
