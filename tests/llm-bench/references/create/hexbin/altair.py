import math
import os

import altair as alt
import numpy as np
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

RADIUS = 25  # px, center to corner
W, H = 440, 380  # plot area, px
X0, X1 = -50, 450  # room for the hexagons around the data
Y0, Y1 = 1200, 4000

# Vega-Lite has no hexbin. With fixed domains a data unit has a known size in
# pixels, so bin in pixels as d3-hexbin does: each film goes to the nearer
# center of two offset lattices, sqrt(3) r apart in a row and 3 r apart
# between rows of the same lattice.
sx, sy = math.sqrt(3) * RADIUS, 3 * RADIUS
px = (df["budget"] - X0) / (X1 - X0) * W
py = (Y1 - df["box_office"]) / (Y1 - Y0) * H
ax, ay = (px / sx).round() * sx, (py / sy).round() * sy
bx, by = (np.floor(px / sx) + 0.5) * sx, (np.floor(py / sy) + 0.5) * sy
use_a = (px - ax) ** 2 + (py - ay) ** 2 <= (px - bx) ** 2 + (py - by) ** 2
df["cx"] = np.where(use_a, ax, bx)
df["cy"] = np.where(use_a, ay, by)
bins = df.groupby(["cx", "cy"], as_index=False).size().rename(columns={"size": "films"})
# Back to data units, for the encoding.
bins["budget"] = X0 + bins["cx"] / W * (X1 - X0)
bins["box_office"] = Y1 - bins["cy"] / H * (Y1 - Y0)

# Vega scales a custom shape so that [-1, 1] spans sqrt(size) pixels.
hexagon = "M0,-1L0.866,-0.5L0.866,0.5L0,1L-0.866,0.5L-0.866,-0.5Z"

chart = (
    alt.Chart(bins)
    .mark_point(shape=hexagon, size=(2 * RADIUS) ** 2, filled=True, opacity=1,
                stroke="white", strokeWidth=0.5)
    .encode(
        x=alt.X("budget:Q", title="Budget (millions)",
                scale=alt.Scale(domain=[X0, X1], nice=False)),
        y=alt.Y("box_office:Q", title="Box office (millions)",
                scale=alt.Scale(domain=[Y0, Y1], nice=False, zero=False)),
        color=alt.Color("films:Q", scale=alt.Scale(scheme="oranges", domainMin=0),
                        title="Films"),
    )
    .properties(width=W, height=H)
)
chart.save(os.environ["OUT_PATH"], format="svg")
