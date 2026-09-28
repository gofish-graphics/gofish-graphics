import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# An arc mark with x and y is centered there. Each lake's slices are
# stacked and normalized to its own total, so every pie is a full circle.
chart = (
    alt.Chart(df)
    .transform_stack(
        stack="count", groupby=["lake"], offset="normalize", as_=["s0", "s1"]
    )
    .mark_arc(radius=20)
    .encode(
        x=alt.X("x:Q", scale=alt.Scale(zero=False, padding=30)),
        y=alt.Y("y:Q", scale=alt.Scale(zero=False, padding=30)),
        theta=alt.Theta("s0:Q", scale=alt.Scale(domain=[0, 1])),
        theta2="s1",
        color=alt.Color("species:N", sort=None),
    )
    .properties(width=440, height=420)
)
chart.save(os.environ["OUT_PATH"], format="svg")
