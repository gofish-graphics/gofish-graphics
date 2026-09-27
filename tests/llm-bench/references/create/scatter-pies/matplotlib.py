import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import Patch

df = pd.read_json(os.environ["DATA_PATH"])
species = list(dict.fromkeys(df["species"]))
colors = {s: f"C{i}" for i, s in enumerate(species)}
radius_pt = 20 * 72 / 100  # 20 px at dpi 100

fig, ax = plt.subplots(figsize=(5.6, 4.8), dpi=100)

# Each slice is a scatter marker: the wedge's outline as marker vertices
# (as in matplotlib's "pie chart markers" example). Matplotlib rescales a
# vertex marker by its largest coordinate, so `s` is scaled back by it.
for lake, rows in df.groupby("lake", sort=False):
    shares = rows["count"] / rows["count"].sum()
    start = 0.0
    for sp, share in zip(rows["species"], shares):
        theta = np.linspace(2 * np.pi * start, 2 * np.pi * (start + share), 50)
        verts = np.column_stack(
            [np.r_[0, np.cos(theta), 0], np.r_[0, np.sin(theta), 0]]
        )
        scale = np.abs(verts).max()
        ax.scatter(
            rows["x"].iloc[0],
            rows["y"].iloc[0],
            marker=verts,
            s=(2 * radius_pt * scale) ** 2,
            facecolor=colors[sp],
            edgecolor="none",
        )
        start += share

ax.set_xlabel("x")
ax.set_ylabel("y")
ax.margins(0.1)
ax.legend(
    handles=[Patch(color=c, label=s) for s, c in colors.items()],
    title="species",
    loc="upper left",
    bbox_to_anchor=(1.01, 1),
)
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
