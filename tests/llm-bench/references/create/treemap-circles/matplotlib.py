import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Circle, Rectangle

df = pd.read_json(os.environ["DATA_PATH"])
W, H = 600, 400


def squarify(values, x, y, w, h):
    """Squarified treemap (Bruls et al.): lay out `values` (sorted largest
    first) in the rectangle, areas proportional to the values. Returns one
    (x, y, w, h) per value, in order. (matplotlib has no treemap, and the
    squarify package is not available.)"""
    scale = w * h / sum(values)
    areas = [v * scale for v in values]
    rects = []
    while areas:
        side = min(w, h)

        def worst(row):
            s = sum(row)
            return max(max(side * side * a / (s * s), s * s / (side * side * a)) for a in row)

        n = 1
        while n < len(areas) and worst(areas[: n + 1]) <= worst(areas[:n]):
            n += 1
        row, areas = areas[:n], areas[n:]
        thick = sum(row) / side
        pos = 0.0
        for a in row:
            if w >= h:  # a column along the left side
                rects.append((x, y + pos, thick, a / thick))
            else:  # a row along the top
                rects.append((x + pos, y, a / thick, thick))
            pos += a / thick
        if w >= h:
            x, w = x + thick, w - thick
        else:
            y, h = y + thick, h - thick
    return rects


totals = df.groupby("genre", sort=False)["gross"].sum().sort_values(ascending=False)
colors = {g: f"C{i}" for i, g in enumerate(df["genre"].unique())}

fig, ax = plt.subplots(figsize=(W / 100, H / 100), dpi=100)
fig.subplots_adjust(0, 0, 1, 1)
for genre, (gx, gy, gw, gh) in zip(totals.index, squarify(list(totals), 0, 0, W, H)):
    films = df[df["genre"] == genre].sort_values("gross", ascending=False)
    for x, y, w, h in squarify(list(films["gross"]), gx, gy, gw, gh):
        ax.add_patch(Rectangle((x, y), w, h, facecolor="none", edgecolor="#cccccc", lw=0.75))
        # inscribed circle, 1px clear of the two long sides
        r = min(w, h) / 2 - 1
        ax.add_patch(Circle((x + w / 2, y + h / 2), r, facecolor=colors[genre], edgecolor="none"))
    ax.text(gx + 4, gy + 4, genre, ha="left", va="top", fontsize=9, fontweight="bold",
            bbox=dict(facecolor="white", edgecolor="none", pad=1, alpha=0.8))
ax.set_xlim(0, W)
ax.set_ylim(H, 0)  # y down, like screen coordinates
ax.set_aspect("equal")
ax.axis("off")
fig.savefig(os.environ["OUT_PATH"], format="svg")
