import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])
regions = list(dict.fromkeys(df["region"]))
df["order"] = range(len(df))
totals = df.groupby("region", sort=False, as_index=False)["population"].sum()
totals["order"] = range(len(totals))

# Both rings stack population clockwise in data order on one shared angular
# scale, so each region's subregions fill its angle.
color = alt.Color("region:N", sort=regions, legend=None)
inner = alt.Chart(totals).encode(
    theta=alt.Theta("population:Q", stack=True), order="order:Q", color=color
)
outer = (
    alt.Chart(df)
    .mark_arc(radius=120, radius2=210, stroke="white", opacity=0.6)
    .encode(theta=alt.Theta("population:Q", stack=True), order="order:Q", color=color)
)
chart = (
    inner.mark_arc(radius=120, stroke="white")
    + outer
    + inner.mark_text(radius=80, fontSize=12).encode(
        text="region:N", color=alt.value("black")
    )
).properties(width=460, height=460)
chart.save(os.environ["OUT_PATH"], format="svg")
