import math
import os

import matplotlib.pyplot as plt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

RADIUS = 25  # px, center to corner

fig = plt.figure(figsize=(6.0, 4.5), dpi=100)  # 600 x 450 px
ax = fig.add_axes((0.11, 0.11, 0.68, 0.84))
x0, x1 = -50, 450  # room for the hexagons around the data
y0, y1 = 1200, 4000
ax.set_xlim(x0, x1)
ax.set_ylim(y0, y1)

# hexbin lays its grid out in data units: centers (x1 - x0) / nx apart in a
# row, and rows (y1 - y0) / ny apart between every other row, with hexagons
# that wide and 2/3 of that tall. A pointy-top hexagon of radius r px is
# sqrt(3) r wide, and every other row is 3 r apart, so convert those to data
# units and extend the extent to a whole number of cells.
bbox = ax.get_position()
px_x = (x1 - x0) / (bbox.width * 600)  # data units per px
px_y = (y1 - y0) / (bbox.height * 450)
sx = math.sqrt(3) * RADIUS * px_x
sy = 3 * RADIUS * px_y
nx = math.ceil((x1 - x0) / sx)
ny = math.ceil((y1 - y0) / sy)
hb = ax.hexbin(
    df["budget"],
    df["box_office"],
    gridsize=(nx, ny),
    extent=(x0, x0 + nx * sx, y0, y0 + ny * sy),
    mincnt=1,
    cmap="Oranges",
    vmin=0,  # so a single film is visibly light, not white
    edgecolors="white",
    linewidths=0.5,
)
ax.set_xlim(x0, x1)
ax.set_ylim(y0, y1)
ax.set_xlabel("Budget (millions)")
ax.set_ylabel("Box office (millions)")
# The color bar gets its own axes, so the plot area keeps its size.
fig.colorbar(hb, cax=fig.add_axes((0.83, 0.11, 0.03, 0.84)), label="Films")
fig.savefig(os.environ["OUT_PATH"], format="svg")
