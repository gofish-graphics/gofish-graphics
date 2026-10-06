import math
import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
R = 6  # circle radius in pixels
W, H = 500, 220

# Fixed x domain, so a year has a known width in pixels.
x0 = math.floor(df["year"].min() / 10) * 10
x1 = math.ceil(df["year"].max() / 10) * 10
px = W / (x1 - x0)

# Dodge: place films left to right, each at the offset from the center line
# nearest zero where it overlaps no circle already placed. The candidates
# are zero and the offsets that rest it against a neighbor.
placed = []  # (x in px, dy in px)
dys = {}
for i, year in df["year"].sort_values(kind="stable").items():
    cx = (year - x0) * px
    near = [(x, y) for x, y in placed if abs(x - cx) < 2 * R]
    candidates = [0.0]
    for x, y in near:
        d = math.sqrt((2 * R) ** 2 - (x - cx) ** 2)
        candidates += [y + d, y - d]
    candidates.sort(key=abs)
    dy = next(
        c for c in candidates
        if all(math.hypot(x - cx, y - c) >= 2 * R - 1e-6 for x, y in near)
    )
    placed.append((cx, dy))
    dys[i] = dy
df["dy"] = pd.Series(dys)

chart = (
    alt.Chart(df)
    .mark_circle(size=math.pi * R**2, opacity=1)
    .encode(
        x=alt.X(
            "year:Q",
            scale=alt.Scale(domain=[x0, x1], nice=False),
            axis=alt.Axis(format="d"),
            title="year",
        ),
        # dy is in pixels: a domain of H pixels over a view H pixels tall.
        y=alt.Y("dy:Q", scale=alt.Scale(domain=[-H / 2, H / 2]), axis=None),
        color=alt.Color("genre:N", sort=None),
    )
    .properties(width=W, height=H)
    .configure_view(stroke=None)
)
chart.save(os.environ["OUT_PATH"], format="svg")
