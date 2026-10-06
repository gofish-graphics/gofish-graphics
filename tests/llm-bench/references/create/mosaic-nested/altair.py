import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
total = df["count"].sum()

# Class bands bottom to top, sex left to right within a band, survived
# bottom to top within that; every split is by share of the parent cell.
# The data lists each level in the wanted order.
cells, bands = [], []
y0 = 0.0
for cls, in_class in df.groupby("class", sort=False):
    band = in_class["count"].sum() / total
    bands.append({"class": cls, "mid": y0 + band / 2})
    x0 = 0.0
    for sex, in_sex in in_class.groupby("sex", sort=False):
        width = in_sex["count"].sum() / in_class["count"].sum()
        v0 = y0
        for survived, count in zip(in_sex["survived"], in_sex["count"]):
            height = band * count / in_sex["count"].sum()
            cells.append({"survived": survived, "x0": x0, "x1": x0 + width, "y0": v0, "y1": v0 + height})
            v0 += height
        x0 += width
    y0 += band

unit = alt.Scale(domain=[0, 1], nice=False)
rects = (
    alt.Chart(pd.DataFrame(cells))
    .mark_rect(stroke="white", strokeWidth=1)
    .encode(
        x=alt.X("x0:Q", axis=None, scale=unit),
        x2="x1",
        y=alt.Y("y0:Q", axis=None, scale=unit),
        y2="y1",
        color=alt.Color(
            "survived:N",
            sort=["Yes", "No"],
            scale=alt.Scale(range=["#4e79a7", "#bab0ac"]),
        ),
    )
)
labels = (
    alt.Chart(pd.DataFrame(bands))
    .mark_text(align="right", dx=-6)
    .encode(x=alt.value(0), y=alt.Y("mid:Q", scale=unit), text="class:N")
)
chart = (rects + labels).properties(width=400, height=390).configure_view(stroke=None)
chart.save(os.environ["OUT_PATH"], format="svg")
