import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.lines import Line2D

df = pd.read_json(os.environ["DATA_PATH"]).sort_values("year")
genres = list(dict.fromkeys(pd.read_json(os.environ["DATA_PATH"])["genre"]))
colors = dict(zip(genres, plt.rcParams["axes.prop_cycle"].by_key()["color"]))
r = 6  # circle radius in pixels (dpi 100, so 1 px = 1 display unit)

fig = plt.figure(figsize=(6.4, 3.0), dpi=100)
ax = fig.add_axes([0.03, 0.15, 0.74, 0.55])  # fixed, so data-to-pixel is known
ax.set_xlim(df["year"].min() - 3, df["year"].max() + 3)
ax.set_ylim(-1, 1)
px_per_year = ax.transData.transform((1, 0))[0] - ax.transData.transform((0, 0))[0]
px_per_y = ax.transData.transform((0, 1))[1] - ax.transData.transform((0, 0))[1]

# matplotlib has no swarm layout: dodge by hand, in pixels. Each circle, left
# to right, takes the offset nearest the center line where it overlaps no
# circle already placed; the candidates are zero and the offsets that rest it
# against a neighbor.
placed = []  # (x px, dy px)
offsets = []
for year in df["year"]:
    cx = year * px_per_year
    near = [(px, py) for px, py in placed if abs(px - cx) < 2 * r]
    candidates = [0.0]
    for px, py in near:
        dy = np.sqrt((2 * r) ** 2 - (px - cx) ** 2)
        candidates += [py + dy, py - dy]
    candidates.sort(key=abs)
    dy = next(
        c for c in candidates
        if all(np.hypot(px - cx, py - c) >= 2 * r - 1e-6 for px, py in near)
    )
    placed.append((cx, dy))
    offsets.append(dy / px_per_y)

# Scatter sizes are in points squared; 1 px is 72 / 100 pt.
size = (2 * r * 72 / 100) ** 2
ax.scatter(df["year"], offsets, s=size, c=df["genre"].map(colors), linewidths=0)

ax.yaxis.set_visible(False)
for side in ("left", "right", "top"):
    ax.spines[side].set_visible(False)
ax.legend(
    handles=[
        Line2D([], [], marker="o", linestyle="", color=colors[g], label=g)
        for g in genres
    ],
    title="genre",
    loc="center left",
    bbox_to_anchor=(1.01, 0.5),
)
fig.savefig(os.environ["OUT_PATH"], format="svg")
