import os

import altair as alt
import numpy as np
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
XS, YS = 100, 1000  # bin spacing in budget and box office units

# Each film goes to the nearer of the two lattice centers around it:
# (i*XS, j*YS) or ((i+0.5)*XS, (j+0.5)*YS), by (dx/XS)^2 + 3*(dy/YS)^2.
u, v = df["budget"] / XS, df["box_office"] / YS
ax, ay = u.round(), v.round()
bx, by = np.floor(u) + 0.5, np.floor(v) + 0.5
da = (u - ax) ** 2 + 3 * (v - ay) ** 2
db = (u - bx) ** 2 + 3 * (v - by) ** 2
df["cx"] = np.where(da <= db, ax, bx) * XS
df["cy"] = np.where(da <= db, ay, by) * YS
bins = df.groupby(["cx", "cy"], as_index=False).size().rename(columns={"size": "films"})

# Fixed domains, so a data unit has a known size in pixels and the hexagon
# symbol can be drawn XS wide and 2/3 YS tall.
W, H = 440, 380
x0, x1 = bins["cx"].min() - XS / 2, bins["cx"].max() + XS / 2
y0, y1 = bins["cy"].min() - YS / 2, bins["cy"].max() + YS / 2
px_x, px_y = W / (x1 - x0), H / (y1 - y0)
hex_h = 2 / 3 * YS * px_y  # pixels
a = (XS / 2 * px_x) / (hex_h / 2)  # half width, in units of half height
# Vega scales a custom shape so that [-1, 1] spans sqrt(size) pixels.
hexagon = f"M0,-1L{a},-0.5L{a},0.5L0,1L{-a},0.5L{-a},-0.5Z"

chart = (
    alt.Chart(bins)
    .mark_point(shape=hexagon, size=hex_h**2, filled=True, opacity=1)
    .encode(
        x=alt.X("cx:Q", title="budget", scale=alt.Scale(domain=[x0, x1], nice=False)),
        y=alt.Y("cy:Q", title="box office", scale=alt.Scale(domain=[y0, y1], nice=False)),
        color=alt.Color("films:Q", scale=alt.Scale(scheme="blues"), title="films"),
    )
    .properties(width=W, height=H)
)
chart.save(os.environ["OUT_PATH"], format="svg")
