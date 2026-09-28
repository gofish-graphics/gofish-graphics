import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# One column per region, as wide as its total units; each brand's segment
# is its share of the region, stacked bottom to top in data order.
cells = df.groupby(["region", "brand"], sort=False, as_index=False)["units"].sum()
cells["total"] = cells.groupby("region", sort=False)["units"].transform("sum")
cells["y2"] = cells.groupby("region", sort=False)["units"].cumsum() / cells["total"]
cells["y"] = cells["y2"] - cells["units"] / cells["total"]
columns = cells.drop_duplicates("region")[["region", "total"]]
columns["x2"] = columns["total"].cumsum()
columns["x"] = columns["x2"] - columns["total"]
columns["center"] = (columns["x"] + columns["x2"]) / 2
cells = cells.merge(columns[["region", "x", "x2"]], on="region")

rects = (
    alt.Chart(cells)
    .mark_rect(stroke="white")
    .encode(
        x=alt.X("x:Q", axis=None),
        x2="x2",
        y=alt.Y("y:Q", title="share of region's units", axis=alt.Axis(format="%")),
        y2="y2",
        color=alt.Color("brand:N", sort=None),
    )
)
labels = (
    alt.Chart(columns)
    .mark_text(baseline="top", dy=6)
    .encode(x="center:Q", y=alt.value(320), text="region:N")
)
chart = (rects + labels).properties(width=480, height=320)
chart.save(os.environ["OUT_PATH"], format="svg")
