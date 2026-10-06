import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import Polygon, Wedge

df = pd.read_json(os.environ["DATA_PATH"])
names = list(dict.fromkeys(list(df["source"]) + list(df["target"])))
colors = dict(zip(names, plt.rcParams["axes.prop_cycle"].by_key()["color"]))
outer, inner = 1.0, 0.9
pad = np.degrees(0.05)  # gap between channels, in degrees

# matplotlib has no chord layout, so the angles are computed by hand. Each
# channel's arc is its total count; inside it, each link that touches the
# channel gets a sub-arc as wide as the link's count, in link order.
totals = {n: df.loc[(df["source"] == n) | (df["target"] == n), "count"].sum() for n in names}
scale = (360 - pad * len(names)) / sum(totals.values())  # degrees per count
start, cursor, ends = {}, {}, {}
angle = 90.0  # from 12 o'clock, counterclockwise
for n in names:
    start[n] = angle
    cursor[n] = angle
    angle += totals[n] * scale + pad
for i, (s, t, c) in enumerate(zip(df["source"], df["target"], df["count"])):
    for n in (s, t):
        ends[i, n] = (cursor[n], cursor[n] + c * scale)
        cursor[n] += c * scale


def arc(a0, a1, r):
    a = np.radians(np.linspace(a0, a1, 40))
    return np.column_stack([r * np.cos(a), r * np.sin(a)])


def bend(p, q):
    # Quadratic Bezier from p to q with its control point at the center.
    t = np.linspace(0, 1, 40)[:, None]
    return (1 - t) ** 2 * p + t**2 * q


fig, ax = plt.subplots(figsize=(4.8, 4.8), dpi=100)
for i, (s, t) in enumerate(zip(df["source"], df["target"])):
    a = arc(*ends[i, s], inner)
    b = arc(*ends[i, t], inner)
    outline = np.vstack([a, bend(a[-1], b[0]), b, bend(b[-1], a[0])])
    ax.add_patch(Polygon(outline, closed=True, color=colors[s], alpha=0.6, linewidth=0))
for n in names:
    a0, a1 = start[n], start[n] + totals[n] * scale
    ax.add_patch(Wedge((0, 0), outer, a0, a1, width=outer - inner, color=colors[n]))
    mid = np.radians((a0 + a1) / 2)
    ax.text(1.12 * np.cos(mid), 1.12 * np.sin(mid), n, ha="center", va="center", fontsize=12)

ax.set_xlim(-1.25, 1.25)
ax.set_ylim(-1.25, 1.25)
ax.set_aspect("equal")
ax.axis("off")
fig.tight_layout()
fig.savefig(os.environ["OUT_PATH"], format="svg")
