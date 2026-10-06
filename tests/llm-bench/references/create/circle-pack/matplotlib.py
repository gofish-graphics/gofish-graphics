import math
import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Circle

df = pd.read_json(os.environ["DATA_PATH"])


def pack(circles, pad):
    """Greedy front packing: largest first, each circle tangent to two placed
    circles at the free spot nearest the first one. Circles are dicts with
    "r"; sets "x", "y" relative to the enclosing circle's center and returns
    that circle's radius. (matplotlib has no packing layout, and circlify is
    not available.)"""
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
    leaves = [{"r": math.sqrt(g)} for g in rows["gross"]]
    groups.append({"genre": genre, "leaves": leaves, "r": pack(leaves, 2)})
R = pack(groups, 6)

fig, ax = plt.subplots(figsize=(5.2, 5.2), dpi=100)
fig.subplots_adjust(0, 0, 1, 1)
for i, g in enumerate(groups):
    ax.add_patch(Circle((g["x"], g["y"]), g["r"], facecolor="#f2f2f2", edgecolor="#999999", lw=1))
    for leaf in g["leaves"]:
        ax.add_patch(Circle((g["x"] + leaf["x"], g["y"] + leaf["y"]), leaf["r"], facecolor=f"C{i}", edgecolor="none"))
    ax.text(g["x"], g["y"] + g["r"] - 4, g["genre"], ha="center", va="top", fontsize=9, fontweight="bold")
ax.set_xlim(-R, R)
ax.set_ylim(-R, R)
ax.set_aspect("equal")
ax.axis("off")
fig.savefig(os.environ["OUT_PATH"], format="svg")
