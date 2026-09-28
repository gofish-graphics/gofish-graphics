import math
import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

# Circle area is proportional to sales; the largest is 18 px in radius.
size = alt.Size(
    "sales:Q",
    scale=alt.Scale(domain=[0, df["sales"].max()], range=[0, math.pi * 18**2]),
    legend=None,
)
chart = (
    alt.Chart(df)
    .mark_circle(opacity=0.8)
    .encode(
        x=alt.X("date:T", title=None),
        y=alt.Y("category:N", sort=None, title=None),
        size=size,
        color=alt.Color("category:N", sort=None, legend=None),
    )
    .properties(width=520, height=240)
)
chart.save(os.environ["OUT_PATH"], format="svg")
