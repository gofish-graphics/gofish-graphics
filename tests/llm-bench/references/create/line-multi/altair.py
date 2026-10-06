import os

import altair as alt
import pandas as pd

df = pd.read_json(os.environ["DATA_PATH"])

chart = (
    alt.Chart(df)
    .mark_line(strokeWidth=2)
    .encode(
        x=alt.X("year:Q", scale=alt.Scale(zero=False), axis=alt.Axis(format="d")),
        y="life_expect:Q",
        color=alt.Color("country:N", sort=None),
    )
    .properties(width=500, height=330)
)
chart.save(os.environ["OUT_PATH"], format="svg")
