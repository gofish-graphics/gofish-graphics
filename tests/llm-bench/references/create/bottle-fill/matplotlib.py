import os

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import Polygon, Rectangle

df = pd.read_json(os.environ["DATA_PATH"])

# Axes in pixels (the figure is 560 x 360 px at dpi 100), so the bottle is
# 60 px wide and 200 px tall on screen.
fig = plt.figure(figsize=(5.6, 3.6), dpi=100)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 560)
ax.set_ylim(0, 360)
ax.axis("off")


def bottle(x0, y0):
    """A 60 x 150 body with a 20 x 50 neck, bottom-left corner at (x0, y0)."""
    return [
        (x0, y0),
        (x0 + 60, y0),
        (x0 + 60, y0 + 150),
        (x0 + 40, y0 + 150),
        (x0 + 40, y0 + 200),
        (x0 + 20, y0 + 200),
        (x0 + 20, y0 + 150),
        (x0, y0 + 150),
    ]


base = 60
for i, row in enumerate(df.itertuples()):
    x0 = 70 + i * 120
    outline = Polygon(bottle(x0, base), closed=True, fill=False, edgecolor="#444", linewidth=2)
    ax.add_patch(outline)
    # The liquid: a rectangle up to the level, clipped to the outline.
    liquid = Rectangle((x0, base), 60, 2 * row.fill_pct, facecolor="#4caf50")
    ax.add_patch(liquid)
    liquid.set_clip_path(outline)
    ax.text(x0 + 30, base + 208, f"{row.fill_pct}%", ha="center", va="bottom")
    ax.text(x0 + 30, base - 8, row.wine, ha="center", va="top")

fig.savefig(os.environ["OUT_PATH"], format="svg")
